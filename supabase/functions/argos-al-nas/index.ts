import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// argos-al-nas — el ciclo de vida de los pantallazos: buzón (Supabase) → NAS →
// borrado (Álvaro, 02/11). Cron cada minuto, en 3 fases:
//
//   1. COPIAR: baja del buzón las capturas que aún no están en el NAS
//      (nas_path IS NULL) y las sube con permiso firmado (op "put", clave
//      <ns>/<user>/<captura> que cumple CLAVE_OK). Guarda nas_path. En paralelo.
//   2. BORRAR DEL BUZÓN: las que YA están en el NAS (nas_path no nulo) y tienen
//      más de 48 h se borran de Supabase y se marcan en_nas=true (la galería ya
//      las sirve desde el NAS por argos-foto). Así baja el almacenamiento de
//      Supabase a casi cero. Deja 48 h en los dos lados: lo reciente carga al
//      toque y aguanta una caída del NAS.
//   3. RETENCIÓN: lo de más de 30 días se borra del NAS (op "borrar") y de la
//      base. Historial de un mes por persona.
//
// Firma incrustada (igual a _shared/drive-firma.ts). Si el NAS está caído, no se
// toca nada (se reintenta). Solo cron (X-Cron-Token). Huella en argos_diag (nas_*).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_TOKEN = Deno.env.get("CRON_INTERNAL_TOKEN") ?? "";
const NAS = (Deno.env.get("DRIVE_NAS_URL") ?? "").replace(/\/+$/, "");
const SECRETO = Deno.env.get("DRIVE_SECRETO") ?? "";
const LOTE = Number(Deno.env.get("ARGOS_NAS_LOTE") ?? 300); // copiar por ronda
const CONCURRENCIA = Number(Deno.env.get("ARGOS_NAS_CONC") ?? 8); // subidas a la vez
const BORRAR_LOTE = Number(Deno.env.get("ARGOS_NAS_BORRAR") ?? 400); // borrar del buzón por ronda
const HORAS_BUZON = Number(Deno.env.get("ARGOS_NAS_HORAS") ?? 168); // 7 días en Supabase (respaldo, Alvaro 02/11)
const DIAS_RETENCION = Number(Deno.env.get("ARGOS_NAS_DIAS") ?? 30); // retención en el NAS
const VENCE_SUBIR = 12 * 3600;
const VENCE_BORRAR = 10 * 60;
const ARGOS_NS = "a6905000-0000-4000-8000-000000000001";

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

/** Procesa items de a `n` en paralelo. */
async function enTandas<T>(items: T[], n: number, fn: (x: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += n) await Promise.all(items.slice(i, i + n).map(fn));
}

interface Fila { id: string; user_id: string; path: string | null; created_at: string; }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);

  const tokenCron = req.headers.get("X-Cron-Token") ?? "";
  if (!tokenCron || !igualesConstante(tokenCron, CRON_TOKEN)) return json({ ok: false, error: "no-auth" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const ronda = crypto.randomUUID().slice(0, 8);
  const diag = async (paso: string, detalle: Record<string, unknown> = {}) => {
    await admin.from("argos_diag").insert({ ronda, paso: `nas_${paso}`, detalle }).then(() => {}, () => {});
  };

  if (!NAS || SECRETO.length < 32) { await diag("sin_config", { nas: !!NAS, secreto: SECRETO.length }); return json({ ok: false, error: "sin-config" }, 503); }

  const salud = await fetch(`${NAS}/salud`, { signal: AbortSignal.timeout(8000) })
    .then((r) => r.json()).catch(() => null) as { raices?: { ok: boolean }[] } | null;
  if (!salud?.raices?.some((r) => r.ok)) { await diag("nas_caido"); return json({ ok: true, skip: "nas-caido" }); }

  const ahoraMs = Date.now();
  const errores: string[] = [];

  // ─── FASE 1: copiar buzón → NAS ────────────────────────────────────────────
  const { data: pend } = await admin
    .from("monitor_capturas")
    .select("id, user_id, path, created_at")
    .is("nas_path", null)
    .not("path", "is", null)
    .order("created_at", { ascending: true })
    .limit(LOTE);
  const aCopiar = (pend ?? []) as Fila[];
  let movidas = 0;
  await enTandas(aCopiar, CONCURRENCIA, async (f) => {
    if (!f.path) return;
    const dl = await admin.storage.from("monitor-capturas").download(f.path);
    if (dl.error || !dl.data) { errores.push(`bajar: ${dl.error?.message ?? "vacio"}`); return; }
    const bytes = new Uint8Array(await dl.data.arrayBuffer());
    const nasKey = `${ARGOS_NS}/${f.user_id}/${f.id}`;
    const permiso = await firmar({ op: "put", k: nasKey, max: bytes.length, e: ahoraMas(VENCE_SUBIR) });
    let ok = false;
    try {
      const resp = await fetch(`${NAS}/o?t=${permiso}`, { method: "PUT", body: bytes, signal: AbortSignal.timeout(20_000) });
      if (resp.status === 409) ok = true;
      else if (resp.ok) {
        const cuerpo = await resp.json().catch(() => ({})) as { recibo?: string };
        const rec = cuerpo.recibo ? await verificar(cuerpo.recibo) : null;
        ok = !!rec && rec.op === "recibo" && rec.k === nasKey;
        if (!ok) errores.push("recibo-invalido");
      } else errores.push(`put ${resp.status}`);
    } catch (e) { errores.push(`put: ${(e as Error).message}`); }
    if (!ok) return;
    const { error: upErr } = await admin.from("monitor_capturas").update({ nas_path: nasKey }).eq("id", f.id);
    if (upErr) { errores.push(`nas_path: ${upErr.message}`); return; }
    movidas++;
  });

  // ─── FASE 2: borrar del buzón lo que ya está en el NAS y tiene > HORAS_BUZON ─
  const corteBuzon = new Date(ahoraMs - HORAS_BUZON * 3600_000).toISOString();
  const { data: aBorrar } = await admin
    .from("monitor_capturas")
    .select("id, path")
    .not("nas_path", "is", null)
    .eq("en_nas", false)
    .not("path", "is", null)
    .lt("created_at", corteBuzon)
    .order("created_at", { ascending: true })
    .limit(BORRAR_LOTE);
  const borrarFilas = (aBorrar ?? []) as Array<{ id: string; path: string }>;
  let liberadas = 0;
  if (borrarFilas.length) {
    const paths = borrarFilas.map((r) => r.path);
    const { error: rmErr } = await admin.storage.from("monitor-capturas").remove(paths);
    if (rmErr) errores.push(`remove: ${rmErr.message}`);
    // Aunque el remove falle en alguno, marcamos en_nas (la copia del NAS existe):
    // el objeto huérfano del buzón lo barre un remove futuro; nunca se pierde la foto.
    const { error: mErr } = await admin.from("monitor_capturas").update({ en_nas: true }).in("id", borrarFilas.map((r) => r.id));
    if (mErr) errores.push(`en_nas: ${mErr.message}`); else liberadas = borrarFilas.length;
  }

  // ─── FASE 3: retención — borrar del NAS y de la base lo de > DIAS_RETENCION ──
  const corteRet = new Date(ahoraMs - DIAS_RETENCION * 86400_000).toISOString();
  const { data: aPurgar } = await admin
    .from("monitor_capturas")
    .select("id, path, nas_path, en_nas")
    .lt("created_at", corteRet)
    .order("created_at", { ascending: true })
    .limit(BORRAR_LOTE);
  const purgar = (aPurgar ?? []) as Array<{ id: string; path: string | null; nas_path: string | null; en_nas: boolean }>;
  let purgadas = 0;
  if (purgar.length) {
    // Borra del NAS las que estén allá.
    await enTandas(purgar.filter((p) => p.nas_path), CONCURRENCIA, async (p) => {
      const permiso = await firmar({ op: "borrar", k: p.nas_path, e: ahoraMas(VENCE_BORRAR) });
      await fetch(`${NAS}/o?t=${permiso}`, { method: "DELETE", signal: AbortSignal.timeout(15_000) }).catch(() => {});
    });
    // Barre del buzón las que no llegaron a mudarse.
    const enBuzon = purgar.filter((p) => !p.en_nas && p.path).map((p) => p.path!) as string[];
    if (enBuzon.length) await admin.storage.from("monitor-capturas").remove(enBuzon).catch(() => {});
    const { error: dErr } = await admin.from("monitor_capturas").delete().in("id", purgar.map((p) => p.id));
    if (dErr) errores.push(`purgar: ${dErr.message}`); else purgadas = purgar.length;
  }

  await diag("fin", { movidas, pedidas: aCopiar.length, liberadas, purgadas, errores: errores.slice(0, 5) });
  return json({ ok: true, movidas, liberadas, purgadas, errores: errores.slice(0, 5) });
});
