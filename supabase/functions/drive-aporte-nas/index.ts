import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// drive-aporte-nas — mueve los aportes del link público (bucket drive-aportes de
// Supabase) al NAS y crea la ficha DENTRO de la carpeta del Drive (Alvaro, 05/11).
// Cron cada 5 min. Da fe de que el aporte termina en el Drive, no se queda en
// Supabase.
//
//   · Si el NAS está arriba: por cada aporte pendiente (en_nas=false, el más
//     viejo primero) crea la ficha drive_items (estado "subiendo") y sube los
//     bytes al NAS con permiso firmado. ≤32 MB va de un PUT; más grande va en
//     partes de 32 MB (el NAS las guarda bajo .partes/<up> y las junta al
//     completar), así un video grande AVANZA unas partes por ronda y termina en
//     varias rondas sin reventar la memoria ni el tiempo del edge. Al terminar:
//     ficha "listo", aporte en_nas=true y se borra el objeto de Supabase.
//   · Si el NAS está caído: NO toca nada (se reintenta solo la próxima ronda) y,
//     si hay aportes esperando, avisa — deja la fila drive_nas_salud (pop-up y
//     aviso en el header para admins/dueño) y manda un correo a Alvaro (throttle
//     1 h). Al volver el NAS, limpia el aviso.
//
// Firma incrustada (igual a argos-al-nas / _shared/drive-firma.ts). Solo cron
// (X-Cron-Token). Variables: DRIVE_NAS_URL, DRIVE_SECRETO, RESEND_API_KEY.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_TOKEN = Deno.env.get("CRON_INTERNAL_TOKEN") ?? "";
const NAS = (Deno.env.get("DRIVE_NAS_URL") ?? "").replace(/\/+$/, "");
const SECRETO = Deno.env.get("DRIVE_SECRETO") ?? "";
const RESEND = Deno.env.get("RESEND_API_KEY") ?? "";
const AVISO_A = Deno.env.get("DRIVE_NAS_AVISO_EMAIL") ?? "rusin24@gmail.com";
const AVISO_FROM = Deno.env.get("DRIVE_NAS_AVISO_FROM") ?? "Maven <noreply@mail.maven-ai.me>";
const APP_URL = (Deno.env.get("APP_URL") ?? "https://app.maven-ai.me").replace(/\/+$/, "");

const BUCKET = "drive-aportes";
const TAMANO_PARTE = 32 * 1024 * 1024; // el NAS rechaza > 95 MB por pedido
const PARTES_POR_RONDA = Number(Deno.env.get("APORTE_NAS_PARTES") ?? 16); // ~512 MB/ronda
const APORTES_POR_RONDA = Number(Deno.env.get("APORTE_NAS_LOTE") ?? 25);
const AVISO_CADA_MIN = Number(Deno.env.get("APORTE_NAS_AVISO_MIN") ?? 60);
const VENCE = 12 * 3600;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
function igualesConstante(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const enc = new TextEncoder();
function b64u(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
function deB64u(s: string): Uint8Array {
  const n = s.replaceAll("-", "+").replaceAll("_", "/");
  const bin = atob(n + "=".repeat((4 - (n.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
async function clave(uso: KeyUsage[]) {
  return await crypto.subtle.importKey("raw", enc.encode(SECRETO), { name: "HMAC", hash: "SHA-256" }, false, uso);
}
async function firmar(datos: Record<string, unknown>): Promise<string> {
  const cuerpo = b64u(enc.encode(JSON.stringify(datos)));
  const firma = new Uint8Array(await crypto.subtle.sign("HMAC", await clave(["sign"]), enc.encode(cuerpo)));
  return `${cuerpo}.${b64u(firma)}`;
}
async function verificar(permiso: string): Promise<Record<string, unknown> | null> {
  const partes = permiso.split(".");
  if (partes.length !== 2 || !partes[0] || !partes[1]) return null;
  let firma: Uint8Array;
  try { firma = deB64u(partes[1]); } catch { return null; }
  const ok = await crypto.subtle.verify("HMAC", await clave(["verify"]), firma as unknown as BufferSource, enc.encode(partes[0]));
  if (!ok) return null;
  try { return JSON.parse(new TextDecoder().decode(deB64u(partes[0]))) as Record<string, unknown>; } catch { return null; }
}
const ahoraMas = (segundos: number) => Math.floor(Date.now() / 1000) + segundos;
async function permisoNas(datos: Record<string, unknown>): Promise<string> {
  return `${NAS}/o?t=${await firmar({ ...datos, e: ahoraMas(VENCE) })}`;
}

const MIMES: Record<string, string> = {
  mp4: "video/mp4", mov: "video/quicktime", m4v: "video/x-m4v", webm: "video/webm", mkv: "video/x-matroska",
  avi: "video/x-msvideo", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
  webp: "image/webp", heic: "image/heic", heif: "image/heif", mp3: "audio/mpeg", wav: "audio/wav",
  m4a: "audio/mp4", aac: "audio/aac", pdf: "application/pdf", zip: "application/zip",
};
function mimeDe(nombre: string): string {
  const ext = (nombre.split(".").pop() ?? "").toLowerCase();
  return MIMES[ext] ?? "application/octet-stream";
}

/** Baja un rango de bytes del objeto de Supabase (por URL firmada). */
async function bajarRango(url: string, start: number, endIncl: number): Promise<Uint8Array> {
  const r = await fetch(url, { headers: { Range: `bytes=${start}-${endIncl}` }, signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`rango ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}
/** PUT/POST al NAS y valida el recibo firmado (prueba que el archivo llegó). */
async function conRecibo(
  url: string, metodo: "PUT" | "POST", body: BodyInit | null, k: string,
): Promise<Record<string, unknown> | "existe" | null> {
  const r = await fetch(url, { method: metodo, body, signal: AbortSignal.timeout(90_000) });
  if (r.status === 409) return "existe";
  if (!r.ok) return null;
  const cuerpo = await r.json().catch(() => ({})) as { recibo?: string };
  const rec = cuerpo.recibo ? await verificar(cuerpo.recibo) : null;
  return rec && rec.op === "recibo" && rec.k === k ? rec : null;
}

interface Aporte {
  id: string; token: string; item_id: string | null; tenant_id: string;
  nombre_archivo: string; storage_path: string; size: number | null; quien: string | null;
  nas_up: string | null; nas_parte: number | null; nas_item_id: string | null;
}

/** Un archivo que ACABA de aterrizar en el Drive (para el correo por tanda). */
interface Noti { id: string; carpeta: string | null; quien: string | null; nombre: string }

// deno-lint-ignore no-explicit-any
type Admin = any;

async function finalizar(admin: Admin, a: Aporte, itemId: string, size: number, rec: Record<string, unknown> | "existe", notis: Noti[]) {
  const tam = rec !== "existe" && Number.isFinite(Number(rec.size)) ? Number(rec.size) : size;
  const sha = rec !== "existe" ? String(rec.sha256 ?? "") || null : null;
  await admin.from("drive_items").update({ estado: "listo", size: tam, sha256: sha }).eq("id", itemId);
  await admin.from("drive_aportes").update({ en_nas: true, estado: "en_nas", drive_item_id: itemId }).eq("id", a.id);
  await admin.storage.from(BUCKET).remove([a.storage_path]).then(() => {}, () => {});
  notis.push({ id: a.id, carpeta: a.item_id, quien: a.quien, nombre: a.nombre_archivo });
}

/** Procesa un aporte. Devuelve cuántas "partes" de presupuesto consumió. */
async function procesar(admin: Admin, a: Aporte, errores: string[], notis: Noti[]): Promise<number> {
  const size = Number(a.size ?? 0);
  if (!Number.isFinite(size) || size <= 0) { errores.push(`${a.id}: size`); return 1; }

  let itemId = a.nas_item_id;
  const storageKey = () => `${a.tenant_id}/${itemId}`;
  let up = a.nas_up;

  // 1) Ficha en el Drive (una vez).
  if (!itemId || !up) {
    const { data: link } = await admin.from("drive_upload_links").select("created_by").eq("token", a.token).maybeSingle();
    itemId = crypto.randomUUID();
    up = crypto.randomUUID();
    const { error } = await admin.from("drive_items").insert({
      id: itemId, tenant_id: a.tenant_id, owner_id: link?.created_by ?? null, parent_id: a.item_id,
      tipo: "archivo", nombre: a.nombre_archivo, mime: mimeDe(a.nombre_archivo), size, storage_key: storageKey(), estado: "subiendo",
    });
    if (error) { errores.push(`${a.id}: ficha ${error.message}`); return 1; }
    await admin.from("drive_aportes").update({ nas_item_id: itemId, nas_up: up, nas_parte: 0 }).eq("id", a.id);
    a.nas_parte = 0;
  }

  // 2) URL firmada de Supabase para leer por rangos.
  const { data: su } = await admin.storage.from(BUCKET).createSignedUrl(a.storage_path, 3600);
  if (!su?.signedUrl) { errores.push(`${a.id}: sin-url`); return 1; }
  const fuente = su.signedUrl as string;

  try {
    // 3a) Chico: un solo PUT.
    if (size <= TAMANO_PARTE) {
      const bytes = await bajarRango(fuente, 0, size - 1);
      const rec = await conRecibo(await permisoNas({ op: "put", k: storageKey(), max: size }), "PUT", bytes, storageKey());
      if (!rec) { errores.push(`${a.id}: put`); return 1; }
      await finalizar(admin, a, itemId, size, rec, notis);
      return 1;
    }

    // 3b) Grande: partes de 32 MB, resumible, hasta PARTES_POR_RONDA por ronda.
    const total = Math.ceil(size / TAMANO_PARTE);
    let i = Math.max(0, a.nas_parte ?? 0);
    let consumidas = 0;
    for (; i < total && consumidas < PARTES_POR_RONDA; i++, consumidas++) {
      const start = i * TAMANO_PARTE;
      const end = Math.min(start + TAMANO_PARTE, size) - 1;
      const bytes = await bajarRango(fuente, start, end);
      const r = await fetch(await permisoNas({ op: "parte", k: storageKey(), up, i, max: TAMANO_PARTE, total: size }), {
        method: "PUT", body: bytes, signal: AbortSignal.timeout(90_000),
      });
      if (!r.ok && r.status !== 409) { errores.push(`${a.id}: parte ${i} ${r.status}`); return consumidas || 1; }
      await admin.from("drive_aportes").update({ nas_parte: i + 1 }).eq("id", a.id);
    }
    if (i >= total) {
      const rec = await conRecibo(await permisoNas({ op: "completar", k: storageKey(), up, n: total, max: size }), "POST", null, storageKey());
      if (!rec) { errores.push(`${a.id}: completar`); return consumidas || 1; }
      await finalizar(admin, a, itemId, size, rec, notis);
    }
    return consumidas || 1;
  } catch (e) {
    errores.push(`${a.id}: ${(e as Error).message}`);
    return 1;
  }
}

async function enviarAviso(pendientes: number, desdeISO: string): Promise<boolean> {
  if (!RESEND) return false;
  const desde = new Date(desdeISO).toLocaleString("es-CO", { timeZone: "America/Bogota" });
  const html =
    `<div style="font-family:system-ui,Arial,sans-serif;font-size:15px;color:#111;line-height:1.5">
      <h2 style="margin:0 0 8px">⚠️ El NAS del Drive está caído</h2>
      <p>Hay <b>${pendientes}</b> aporte(s) subido(s) por link esperando pasar al NAS.</p>
      <p>Están <b>a salvo</b> en Supabase. Maven reintenta solo cada 5 minutos y los moverá al Drive en cuanto el NAS vuelva.</p>
      <p style="color:#666">Caído desde: ${desde} (hora Colombia).</p>
      <p style="color:#666">Este aviso se repite a lo sumo cada ${AVISO_CADA_MIN} min mientras el NAS siga caído.</p>
    </div>`;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: AVISO_FROM, to: AVISO_A, subject: `⚠️ NAS caído — ${pendientes} aporte(s) esperando`, html, tags: [{ name: "type", value: "drive-nas-caido" }] }),
    });
    return r.ok;
  } catch { return false; }
}

async function registrarSalud(admin: Admin, caido: boolean, pendientes: number): Promise<void> {
  const ahora = new Date().toISOString();
  if (!caido) {
    await admin.from("drive_nas_salud").upsert({ id: 1, caido: false, desde: null, pendientes, actualizado: ahora }).then(() => {}, () => {});
    return;
  }
  const { data: prev } = await admin.from("drive_nas_salud").select("desde, ultimo_aviso").eq("id", 1).maybeSingle();
  const desde = (prev?.desde as string | null) ?? ahora;
  let ultimoAviso = (prev?.ultimo_aviso as string | null) ?? null;
  const vencido = !ultimoAviso || (Date.now() - new Date(ultimoAviso).getTime()) > AVISO_CADA_MIN * 60_000;
  if (pendientes > 0 && vencido && await enviarAviso(pendientes, desde)) ultimoAviso = ahora;
  await admin.from("drive_nas_salud").upsert({ id: 1, caido: true, desde, pendientes, ultimo_aviso: ultimoAviso, actualizado: ahora }).then(() => {}, () => {});
}

function escapar(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

/** Avisa por correo (1 por carpeta + quién) a todos los del Drive full que entró
 *  contenido nuevo. Reusa send-notification-email (resuelve correos con los ids). */
async function avisarContenidoNuevo(admin: Admin, notis: Noti[]): Promise<number> {
  if (!notis.length) return 0;
  // Reclamar el aviso (false→true) para no mandarlo dos veces si corren dos
  // migraciones a la vez: solo seguimos con los que ESTA corrida ganó.
  const { data: ganados } = await admin.from("drive_aportes")
    .update({ avisado: true }).in("id", notis.map((n) => n.id)).eq("avisado", false).select("id");
  const ganadosSet = new Set(((ganados ?? []) as Array<{ id: string }>).map((r) => r.id));
  notis = notis.filter((n) => ganadosSet.has(n.id));
  if (!notis.length) return 0;

  // Destinatarios: todos los del Drive full.
  const { data: dest } = await admin.rpc("drive_acceso_total_ids");
  const ids = ((dest ?? []) as Array<string | { drive_acceso_total_ids?: string }>)
    .map((x) => (typeof x === "string" ? x : x.drive_acceso_total_ids)).filter(Boolean) as string[];
  if (!ids.length) return 0;

  // Agrupar por carpeta + quién subió.
  const grupos = new Map<string, { carpeta: string | null; quien: string; archivos: string[] }>();
  for (const n of notis) {
    const quien = (n.quien ?? "").trim() || "Alguien";
    const key = `${n.carpeta ?? ""}|${quien}`;
    const g = grupos.get(key) ?? { carpeta: n.carpeta, quien, archivos: [] };
    g.archivos.push(n.nombre);
    grupos.set(key, g);
  }

  let enviados = 0;
  for (const g of grupos.values()) {
    let carpetaNombre = "una carpeta";
    if (g.carpeta) {
      const { data: c } = await admin.from("drive_items").select("nombre").eq("id", g.carpeta).maybeSingle();
      if (c?.nombre) carpetaNombre = c.nombre;
    }
    const n = g.archivos.length;
    const lista = g.archivos.slice(0, 20).map((a) => `<li style="margin:2px 0">${escapar(a)}</li>`).join("");
    const mas = n > 20 ? `<li style="margin:2px 0;color:#888">y ${n - 20} más…</li>` : "";
    const subject = `Nuevo contenido en «${carpetaNombre}» — ${n} archivo${n === 1 ? "" : "s"}`;
    const html =
      `<div style="font-family:system-ui,Arial,sans-serif;font-size:15px;color:#111;line-height:1.5">` +
      `<h2 style="margin:0 0 8px">📥 Llegó contenido nuevo al Drive</h2>` +
      `<p><b>${escapar(g.quien)}</b> subió <b>${n}</b> archivo${n === 1 ? "" : "s"} a <b>${escapar(carpetaNombre)}</b>.</p>` +
      `<ul style="margin:8px 0 12px;padding-left:20px">${lista}${mas}</ul>` +
      `<p><a href="${APP_URL}/oficina/drive" style="display:inline-block;background:#7c5cff;color:#fff;text-decoration:none;padding:9px 16px;border-radius:10px;font-weight:600">Abrir el Drive</a></p>` +
      `</div>`;
    const { error } = await admin.functions.invoke("send-notification-email", {
      headers: { Authorization: `Bearer ${SERVICE_KEY}` },
      body: { to: [], subject, html, tag: "drive-aporte", also_include_user_ids: ids },
    });
    if (!error) enviados++;
  }
  return enviados;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);

  const tokenCron = req.headers.get("X-Cron-Token") ?? "";
  if (!tokenCron || !igualesConstante(tokenCron, CRON_TOKEN)) return json({ ok: false, error: "no-auth" }, 401);
  if (!NAS || SECRETO.length < 32) return json({ ok: false, error: "sin-config" }, 503);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const { count: pendientes } = await admin.from("drive_aportes")
    .select("id", { count: "exact", head: true }).eq("en_nas", false);
  const pend = pendientes ?? 0;

  const salud = await fetch(`${NAS}/salud`, { signal: AbortSignal.timeout(8000) })
    .then((r) => r.json()).catch(() => null) as { raices?: { ok: boolean }[] } | null;
  const arriba = !!salud?.raices?.some((r) => r.ok);

  if (!arriba) {
    await registrarSalud(admin, true, pend);
    return json({ ok: true, skip: "nas-caido", pendientes: pend });
  }
  await registrarSalud(admin, false, pend);

  const { data: filas } = await admin.from("drive_aportes")
    .select("id, token, item_id, tenant_id, nombre_archivo, storage_path, size, quien, nas_up, nas_parte, nas_item_id")
    .eq("en_nas", false)
    .order("created_at", { ascending: true })
    .limit(APORTES_POR_RONDA);
  const aportes = (filas ?? []) as Aporte[];

  const errores: string[] = [];
  const notis: Noti[] = [];
  let presupuesto = PARTES_POR_RONDA;
  let tocados = 0;
  for (const a of aportes) {
    if (presupuesto <= 0) break;
    presupuesto -= await procesar(admin, a, errores, notis);
    tocados++;
  }

  // Aviso por correo: 1 por tanda (carpeta + quien subió) a todos los del Drive full.
  let avisos = 0;
  try { avisos = await avisarContenidoNuevo(admin, notis); } catch (e) { errores.push(`aviso: ${(e as Error).message}`); }

  return json({ ok: true, pendientes: pend, tocados, avisos, errores: errores.slice(0, 5) });
});
