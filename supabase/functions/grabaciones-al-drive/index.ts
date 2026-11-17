// grabaciones-al-drive — copia cada grabación de Meet/Cowork al Drive de Maven
// (Alvaro, 17/11/2026: «que las grabaciones se guarden en el Drive»).
//
// La despierta el tic `grabaciones_al_drive_tick` (pg_cron, cada 2 min) solo si
// hay algo en la fila `grabaciones_al_drive`, que llena el trigger de
// meeting_recordings al quedar una grabación lista.
//
// Por cada grabación:
//   1. Crea (una vez) la ficha en el Drive de QUIEN GRABÓ:
//        Grabaciones / <año-mes> / <sala> <fecha>.mp4
//      Las carpetas se reusan si ya están (y no están en la papelera).
//   2. Lee el MP4 de donde viva (R2 o rec-server, _shared/grabacion-archivo.ts)
//      por rangos y lo sube al NAS con permisos firmados (DRIVE_SECRETO), en
//      partes de 32 MB. Resumible: cada ronda sigue donde quedó la anterior,
//      así una reunión de 2 GB termina en unas rondas sin pasarse del tiempo
//      ni de la memoria de la edge. Es el mismo camino que drive-aporte-nas.
//   3. Con el recibo firmado del NAS (prueba que llegó entero), la ficha queda
//      «listo» y se comparte como lectura con quien estuvo en la llamada y con
//      quien la recibió al pararla — solo gente de la misma agencia.
//
// Las dos puertas del Drive se respetan solas: la ficha es del que grabó y los
// demás la ven por drive_shares (la RLS de drive_items), y la pantalla del
// Drive sigue pidiendo el permiso de rol Oficina → Drive.
//
// Sin sesión: solo cron, X-Cron-Token contra CRON_INTERNAL_TOKEN.
// Variables: DRIVE_NAS_URL, DRIVE_SECRETO, CRON_INTERNAL_TOKEN, y las de las
// grabaciones (R2_*, RECORDINGS_SIGNING_SECRET, RECORDINGS_BASE_URL).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { tokenDeCronValido } from "../_shared/cron-token.ts";
import { ahoraMas, firmar, verificar } from "../_shared/drive-firma.ts";
import { tamanoDelArchivo, urlDelArchivo } from "../_shared/grabacion-archivo.ts";
import {
  CARPETA_RAIZ, carpetaDelMes, conQuienCompartir, MAX_INTENTOS, nombreDelArchivo, partesDe, rangoDeParte, TAMANO_PARTE,
} from "../_shared/grabacion-al-drive.ts";
import { deLaAgencia } from "../_shared/livekit-agencia.ts";
import { tocaPedirJuntar } from "../_shared/aporte-y-espacio.ts";

const NAS = (Deno.env.get("DRIVE_NAS_URL") ?? "").replace(/\/+$/, "");
const SECRETO = Deno.env.get("DRIVE_SECRETO") ?? "";
/** Los permisos del NAS valen 12 h, como los de una subida del Drive. */
const VENCE_PERMISO = 12 * 3600;
/** No se empieza una parte nueva pasado este tiempo: la ronda termina holgada
 *  dentro del límite de la edge y la siguiente sigue donde quedó. */
const PRESUPUESTO_MS = 110_000;
/** Lo que dura el turno de una ronda (se renueva con cada parte). */
const TURNO_SEG = 240;

// deno-lint-ignore no-explicit-any
type Admin = any;

interface Copia {
  recording_id: string; estado: string; drive_item_id: string | null; nas_up: string | null;
  nas_parte: number; size: number | null; intentos: number; juntando_at: string | null;
}

interface Grabacion {
  id: string; room_name: string; title: string | null; started_by: string | null; started_at: string;
  storage_key: string | null; status: string; deleted_at: string | null; tenant_id: string | null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function permisoNas(datos: Record<string, unknown>): Promise<string> {
  return `${NAS}/o?t=${await firmar(SECRETO, { ...datos, e: ahoraMas(VENCE_PERMISO) } as never)}`;
}

async function bajarRango(url: string, desde: number, hasta: number): Promise<Uint8Array> {
  const r = await fetch(url, { headers: { Range: `bytes=${desde}-${hasta}` }, signal: AbortSignal.timeout(60_000) });
  if (r.status !== 206 && !(r.status === 200 && desde === 0)) {
    await r.body?.cancel().catch(() => {});
    throw new Error(`leer la grabación: ${r.status}`);
  }
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (bytes.length !== hasta - desde + 1) throw new Error(`leer la grabación: llegaron ${bytes.length} bytes`);
  return bytes;
}

/** PUT/POST al NAS. Devuelve el recibo verificado, "existe" (409) o null. */
async function conRecibo(url: string, metodo: "PUT" | "POST", body: BodyInit | null, k: string) {
  const r = await fetch(url, { method: metodo, body, signal: AbortSignal.timeout(90_000) });
  if (r.status === 409) { await r.body?.cancel().catch(() => {}); return "existe" as const; }
  if (!r.ok) { await r.body?.cancel().catch(() => {}); return null; }
  const cuerpo = await r.json().catch(() => ({})) as { recibo?: string };
  const rec = cuerpo.recibo ? await verificar(SECRETO, cuerpo.recibo) : null;
  return rec && rec.op === "recibo" && rec.k === k ? rec : null;
}

/** ¿Ya está entero en el NAS? (HEAD con permiso de bajar; no lee el archivo). */
async function yaEstaEnNas(k: string, size: number): Promise<boolean> {
  try {
    const r = await fetch(await permisoNas({ op: "get", k }), { method: "HEAD", signal: AbortSignal.timeout(15_000) });
    await r.body?.cancel().catch(() => {});
    return r.status === 200 && Number(r.headers.get("content-length")) === size;
  } catch {
    return false;
  }
}

/** La carpeta `nombre` de `dueno` dentro de `madre` (null = su raíz): la que ya
 *  está, o una nueva. Una en la papelera no cuenta. */
async function carpeta(admin: Admin, tenant: string, dueno: string, madre: string | null, nombre: string): Promise<string> {
  let q = admin.from("drive_items").select("id")
    .eq("tenant_id", tenant).eq("owner_id", dueno).eq("tipo", "carpeta").eq("nombre", nombre)
    .is("trashed_at", null).order("created_at", { ascending: true }).limit(1);
  q = madre ? q.eq("parent_id", madre) : q.is("parent_id", null);
  const { data, error } = await q;
  if (error) throw new Error(`buscar la carpeta ${nombre}: ${error.message}`);
  if (data?.[0]?.id) return data[0].id as string;
  const id = crypto.randomUUID();
  const { error: e2 } = await admin.from("drive_items").insert({
    id, tenant_id: tenant, owner_id: dueno, parent_id: madre, tipo: "carpeta", nombre, estado: "listo",
  });
  if (e2) throw new Error(`crear la carpeta ${nombre}: ${e2.message}`);
  return id;
}

async function anotar(admin: Admin, id: string, cambios: Record<string, unknown>) {
  const { error } = await admin.from("grabaciones_al_drive")
    .update({ ...cambios, actualizado: new Date().toISOString() }).eq("recording_id", id);
  if (error) throw new Error(`anotar el avance: ${error.message}`);
}

/** Un intento que no avanzó. Pasado el tope, se da por perdida (queda el error). */
async function fallo(admin: Admin, c: Copia, motivo: string) {
  const intentos = c.intentos + 1;
  await anotar(admin, c.recording_id, {
    intentos, error: motivo.slice(0, 500), ...(intentos >= MAX_INTENTOS ? { estado: "fallo", tomado_hasta: null } : {}),
  });
  return `${c.recording_id}: ${motivo}`;
}

/** Ficha lista + compartida con la gente de la llamada. */
async function terminar(admin: Admin, c: Copia, g: Grabacion, itemId: string, size: number, rec: Record<string, unknown> | "existe") {
  const tam = rec !== "existe" && Number.isFinite(Number(rec.size)) ? Number(rec.size) : size;
  const sha = rec !== "existe" && /^[0-9a-f]{64}$/.test(String(rec.sha256 ?? "")) ? String(rec.sha256) : null;
  const { error } = await admin.from("drive_items").update({ estado: "listo", size: tam, ...(sha ? { sha256: sha } : {}) }).eq("id", itemId);
  if (error) throw new Error(`dejar la ficha lista: ${error.message}`);

  const [{ data: part }, { data: dest }] = await Promise.all([
    admin.from("meeting_recording_participantes").select("user_id").eq("recording_id", g.id),
    admin.from("meeting_recording_recipients").select("user_id").eq("recording_id", g.id),
  ]);
  const candidatos = conQuienCompartir(
    g.started_by!,
    ((part ?? []) as { user_id: string }[]).map((p) => p.user_id),
    ((dest ?? []) as { user_id: string }[]).map((d) => d.user_id),
  );
  // Solo gente de la agencia de la grabación (el trigger de drive_shares
  // rechazaría a los demás y con ellos el lote entero).
  const con = g.tenant_id ? await deLaAgencia(admin, g.tenant_id, candidatos) : [];
  if (con.length) {
    const { error: eS } = await admin.from("drive_shares").upsert(
      con.map((u) => ({ item_id: itemId, user_id: u, rol: "lector", created_by: g.started_by })),
      { onConflict: "item_id,user_id", ignoreDuplicates: true },
    );
    if (eS) throw new Error(`compartir: ${eS.message}`);
  }
  await anotar(admin, c.recording_id, { estado: "listo", size: tam, error: null, tomado_hasta: null });
}

/** Avanza una grabación lo que dé el presupuesto. Devuelve un error o null. */
async function procesar(admin: Admin, c: Copia, inicio: number): Promise<string | null> {
  const { data: g } = await admin.from("meeting_recordings")
    .select("id, room_name, title, started_by, started_at, storage_key, status, deleted_at, tenant_id")
    .eq("id", c.recording_id).maybeSingle() as { data: Grabacion | null };
  if (!g || g.deleted_at || g.status !== "ready" || !g.storage_key) {
    // La borraron antes de terminar la copia: la ficha a medias no queda
    // colgando «subiendo» en el Drive de nadie.
    if (c.drive_item_id) await admin.from("drive_items").delete().eq("id", c.drive_item_id).eq("estado", "subiendo");
    await anotar(admin, c.recording_id, { estado: "cancelado", tomado_hasta: null, error: "la grabación ya no está" });
    return null;
  }
  if (!g.started_by || !g.tenant_id) {
    await anotar(admin, c.recording_id, { estado: "fallo", tomado_hasta: null, error: "sin quien grabó o sin agencia" });
    return null;
  }

  // 1) Cuánto pesa (de la fuente, no de la fila: la fila puede no tenerlo).
  let size = Number(c.size ?? 0);
  if (!size) {
    size = Number(await tamanoDelArchivo(g.storage_key).catch(() => null) ?? 0);
    if (!size) return await fallo(admin, c, "el archivo de la grabación todavía no aparece");
  }

  // 2) La ficha en el Drive (una vez). Si alguien la borró a mitad de camino
  // (on delete set null), se arma de nuevo con otra subida.
  let itemId = c.drive_item_id;
  let up = c.nas_up;
  if (!itemId || !up) {
    const raiz = await carpeta(admin, g.tenant_id, g.started_by, null, CARPETA_RAIZ);
    const mes = await carpeta(admin, g.tenant_id, g.started_by, raiz, carpetaDelMes(g.started_at));
    itemId = crypto.randomUUID();
    up = crypto.randomUUID();
    const { error } = await admin.from("drive_items").insert({
      id: itemId, tenant_id: g.tenant_id, owner_id: g.started_by, parent_id: mes, tipo: "archivo",
      nombre: nombreDelArchivo(g.title, g.room_name, g.started_at), mime: "video/mp4", size,
      storage_key: `${g.tenant_id}/${itemId}`, estado: "subiendo",
    });
    if (error) return await fallo(admin, c, `crear la ficha: ${error.message}`);
    await anotar(admin, c.recording_id, { estado: "subiendo", drive_item_id: itemId, nas_up: up, nas_parte: 0, size, juntando_at: null });
    c = { ...c, drive_item_id: itemId, nas_up: up, nas_parte: 0, size, juntando_at: null };
  }
  const k = `${g.tenant_id}/${itemId}`;

  // 3) De dónde se lee (R2 o rec-server; las dos aceptan Range).
  const fuente = await urlDelArchivo(g.storage_key, "v", 3600);
  if (!fuente) return await fallo(admin, c, "no se encontró el archivo en R2 ni en rec-server");

  const total = partesDe(size);
  if (total === 0) {
    const rec = await conRecibo(await permisoNas({ op: "put", k, max: size }), "PUT", await bajarRango(fuente, 0, size - 1), k);
    if (rec === "existe" && !(await yaEstaEnNas(k, size))) return await fallo(admin, c, "el NAS ya tiene otro archivo con esa llave");
    if (!rec) return await fallo(admin, c, "el NAS no confirmó la subida");
    await terminar(admin, c, g, itemId, size, rec);
    return null;
  }

  let i = Math.max(0, c.nas_parte);
  for (; i < total && Date.now() - inicio < PRESUPUESTO_MS; i++) {
    const { desde, hasta } = rangoDeParte(i, size);
    const bytes = await bajarRango(fuente, desde, hasta);
    const r = await fetch(await permisoNas({ op: "parte", k, up, i, max: TAMANO_PARTE, total: size }), {
      method: "PUT", body: bytes, signal: AbortSignal.timeout(90_000),
    });
    await r.body?.cancel().catch(() => {});
    if (!r.ok) return await fallo(admin, c, `parte ${i}: el NAS respondió ${r.status}`);
    await anotar(admin, c.recording_id, { nas_parte: i + 1, tomado_hasta: new Date(Date.now() + TURNO_SEG * 1000).toISOString() });
  }
  if (i < total) return null; // sigue la próxima ronda

  // 4) Juntar. Con varios GB el NAS tarda más de lo que se espera la respuesta:
  // primero se mira si un pedido anterior ya lo dejó armado.
  if (await yaEstaEnNas(k, size)) { await terminar(admin, c, g, itemId, size, "existe"); return null; }
  if (!tocaPedirJuntar(c.juntando_at, size, Date.now())) return null;
  await anotar(admin, c.recording_id, { estado: "juntando", juntando_at: new Date().toISOString() });
  const rec = await conRecibo(await permisoNas({ op: "completar", k, up, n: total, max: size }), "POST", null, k).catch(() => null);
  if (rec && rec !== "existe") { await terminar(admin, c, g, itemId, size, rec); return null; }
  if (await yaEstaEnNas(k, size)) { await terminar(admin, c, g, itemId, size, "existe"); return null; }
  return `${c.recording_id}: el NAS sigue juntando (se mira la próxima ronda)`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!(await tokenDeCronValido(req.headers.get("x-cron-token"), Deno.env.get("CRON_INTERNAL_TOKEN")))) {
    return json({ error: "Unauthorized" }, 401);
  }
  if (!NAS || SECRETO.length < 32) return json({ error: "El Drive todavía no está conectado al NAS" }, 503);

  const inicio = Date.now();
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Con el NAS caído no se toca nada: la fila espera y se reintenta sola.
  const salud = await fetch(`${NAS}/salud`, { signal: AbortSignal.timeout(8000) }).then((r) => r.ok).catch(() => false);
  if (!salud) return json({ ok: false, nas: "caido" });

  const { data: tomadas, error } = await admin.rpc("grabaciones_al_drive_tomar", { p_limite: 5, p_segundos: TURNO_SEG });
  if (error) return json({ error: error.message }, 500);
  const copias = (tomadas ?? []) as Copia[];

  const errores: string[] = [];
  let listas = 0;
  for (const c of copias) {
    if (Date.now() - inicio >= PRESUPUESTO_MS) break;
    try {
      const e = await procesar(admin, c, inicio);
      if (e) errores.push(e);
      else {
        const { data } = await admin.from("grabaciones_al_drive").select("estado").eq("recording_id", c.recording_id).maybeSingle();
        if (data?.estado === "listo") listas++;
      }
    } catch (e) {
      errores.push(await fallo(admin, c, (e as Error).message ?? "error").catch(() => `${c.recording_id}: ${(e as Error).message}`));
    }
  }

  // Se suelta el turno: la próxima ronda puede seguir sin esperar a que venza.
  if (copias.length) {
    await admin.from("grabaciones_al_drive").update({ tomado_hasta: null })
      .in("recording_id", copias.map((c) => c.recording_id));
  }
  if (errores.length) console.warn("[grabaciones-al-drive]", errores.join(" · "));
  return json({ ok: true, tomadas: copias.length, listas, errores });
});
