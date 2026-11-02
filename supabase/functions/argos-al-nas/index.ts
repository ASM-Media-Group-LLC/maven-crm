import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// argos-al-nas — mueve los pantallazos del BUZÓN (Supabase) al NAS (Álvaro, 02/11).
//
// Cada 5 min (pg_cron) toma un lote de capturas que todavía no están en el NAS
// (nas_path IS NULL), las sube al NAS con un permiso firmado (op "put", mismo
// mecanismo del Drive) y guarda su nas_path. FASE SEGURA: NO borra del buzón ni
// marca en_nas, así la galería se sigue viendo igual; solo deja el archivo
// también en el NAS. El borrado del buzón + la retención de 30 días van después,
// con el camino para servir la foto desde el NAS.
//
// La firma va incrustada (la misma de _shared/drive-firma.ts; el bundler del
// deploy por MCP no sube los compartidos). Si el NAS no responde (502), no se
// pierde nada: se queda en el buzón y se reintenta. Solo entra por cron.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_TOKEN = Deno.env.get("CRON_INTERNAL_TOKEN") ?? "";
const NAS = (Deno.env.get("DRIVE_NAS_URL") ?? "").replace(/\/+$/, "");
const SECRETO = Deno.env.get("DRIVE_SECRETO") ?? "";
const LOTE = Number(Deno.env.get("ARGOS_NAS_LOTE") ?? 60);
const VENCE_SUBIR = 12 * 3600;
// El NAS solo acepta claves de segmentos uuid (CLAVE_OK). Argos vive bajo un
// "folder" uuid fijo, shardeado por persona: <ns>/<user_id>/<captura_id>.
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

// ─── Firma de permisos del NAS (idéntica a _shared/drive-firma.ts) ───────────
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
  if (typeof permiso !== "string" || permiso.length > 4000) return null;
  const partes = permiso.split(".");
  if (partes.length !== 2 || !partes[0] || !partes[1]) return null;
  let firma: Uint8Array;
  try { firma = deB64u(partes[1]); } catch { return null; }
  const ok = await crypto.subtle.verify("HMAC", await clave(["verify"]), firma as unknown as BufferSource, enc.encode(partes[0]));
  if (!ok) return null;
  try { return JSON.parse(new TextDecoder().decode(deB64u(partes[0]))) as Record<string, unknown>; } catch { return null; }
}
const ahoraMas = (segundos: number) => Math.floor(Date.now() / 1000) + segundos;
// ─────────────────────────────────────────────────────────────────────────────

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

  // ¿NAS vivo? Si no, no se intenta nada (se queda en el buzón).
  const salud = await fetch(`${NAS}/salud`, { signal: AbortSignal.timeout(8000) })
    .then((r) => r.json()).catch(() => null) as { raices?: { ok: boolean }[] } | null;
  if (!salud?.raices?.some((r) => r.ok)) { await diag("nas_caido", { salud }); return json({ ok: true, movidas: 0, skip: "nas-caido" }); }

  const { data: filas, error: qErr } = await admin
    .from("monitor_capturas")
    .select("id, user_id, path, created_at")
    .is("nas_path", null)
    .not("path", "is", null)
    .order("created_at", { ascending: true })
    .limit(LOTE);
  if (qErr) { await diag("query_error", { error: qErr.message }); return json({ ok: false, error: "query", detalle: qErr.message }, 500); }
  const lote = (filas ?? []) as Fila[];
  await diag("lote", { n: lote.length });
  if (lote.length === 0) return json({ ok: true, movidas: 0 });

  let movidas = 0;
  const errores: string[] = [];
  for (const f of lote) {
    if (!f.path) continue;
    const dl = await admin.storage.from("monitor-capturas").download(f.path);
    if (dl.error || !dl.data) { errores.push(`bajar: ${dl.error?.message ?? "vacio"}`); continue; }
    const bytes = new Uint8Array(await dl.data.arrayBuffer());
    const nasKey = `${ARGOS_NS}/${f.user_id}/${f.id}`;
    const permiso = await firmar({ op: "put", k: nasKey, max: bytes.length, e: ahoraMas(VENCE_SUBIR) });
    let ok = false;
    try {
      const resp = await fetch(`${NAS}/o?t=${permiso}`, { method: "PUT", body: bytes, signal: AbortSignal.timeout(20_000) });
      if (resp.status === 409) {
        ok = true; // ya existe en el NAS: idempotente
      } else if (resp.ok) {
        const cuerpo = await resp.json().catch(() => ({})) as { recibo?: string };
        const rec = cuerpo.recibo ? await verificar(cuerpo.recibo) : null;
        ok = !!rec && rec.op === "recibo" && rec.k === nasKey;
        if (!ok) errores.push("recibo-invalido");
      } else {
        errores.push(`put ${resp.status}`);
      }
    } catch (e) {
      errores.push(`put: ${(e as Error).message}`);
    }
    if (!ok) continue;
    const { error: upErr } = await admin.from("monitor_capturas").update({ nas_path: nasKey }).eq("id", f.id);
    if (upErr) { errores.push(`update: ${upErr.message}`); continue; }
    movidas++;
  }

  await diag("fin", { movidas, pedidas: lote.length, errores: errores.slice(0, 5) });
  return json({ ok: true, movidas, pedidas: lote.length, errores: errores.slice(0, 5) });
});
