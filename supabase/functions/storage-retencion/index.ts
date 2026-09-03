import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, authorizeCronOrJwt, whatsappCors } from "../_shared/whatsapp.ts";

// storage-retencion — libera Storage con dos reglas que definió Jhon (03/09/2026).
// La corre un cron diario. Deploy --no-verify-jwt (se autoriza por X-Cron-Token).
//
// REGLA 1 · promolog-evidence: cuando una creadora deja de estar activa, sus
//   capturas ya no hacen falta. Se borran los ARCHIVOS (que son el peso) y las
//   filas de promolog_entries se conservan, marcadas con la evidencia purgada
//   (RPC `promolog_purgar_evidencia`, que apenda la nota sin pisar la existente):
//   así los reportes de cumplimiento y el score histórico siguen siendo
//   auditables. Las rutas del bucket son `<creator_id>/<...>`, así que se barre
//   por prefijo. Si la creadora vuelve a 'active', lo nuevo se guarda normal.
//
// REGLA 2 · qa-audio: los audios de llamadas se guardan 5 MESES. Pasado eso se
//   borra el archivo y se limpia `qa_calls.audio_path` (el análisis, el score y
//   la transcripción quedan: lo que se va es el audio crudo).
//
// Es IDEMPOTENTE: si ya no queda nada por borrar, no hace nada. Y acotada: como
// máximo `limite` objetos por corrida (default 2000), para no pelearse con el
// rate limit de Storage ni pasarse del tiempo de pared.

const BUCKET_PROMOLOG = "promolog-evidence";
const BUCKET_QA = "qa-audio";
const MESES_QA = 5;
const LIMITE_DEFAULT = 2000;
const LOTE = 100;   // Storage acepta borrados en lote; 100 por llamada va sobrado.

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...whatsappCors, "Content-Type": "application/json" } });
}

/** Lista TODOS los objetos bajo un prefijo (paginado; Storage devuelve 100 por defecto). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function listarRecursivo(db: any, bucket: string, prefijo: string, tope: number): Promise<string[]> {
  const encontrados: string[] = [];
  const pendientes = [prefijo];
  while (pendientes.length && encontrados.length < tope) {
    const actual = pendientes.pop()!;
    let desde = 0;
    for (;;) {
      const { data, error } = await db.storage.from(bucket).list(actual, { limit: 100, offset: desde });
      if (error || !data?.length) break;
      for (const item of data) {
        const ruta = actual ? `${actual}/${item.name}` : item.name;
        // Sin `id` es carpeta; con `id` es archivo.
        if (item.id) encontrados.push(ruta);
        else pendientes.push(ruta);
      }
      if (data.length < 100) break;
      desde += 100;
    }
  }
  return encontrados.slice(0, tope);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function borrarEnLotes(db: any, bucket: string, rutas: string[]): Promise<{ borrados: number; errores: string[] }> {
  const errores: string[] = [];
  let borrados = 0;
  for (let i = 0; i < rutas.length; i += LOTE) {
    const lote = rutas.slice(i, i + LOTE);
    const { error } = await db.storage.from(bucket).remove(lote);
    if (error) errores.push(error.message);
    else borrados += lote.length;
  }
  return { borrados, errores };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: whatsappCors });
  if (!authorizeCronOrJwt(req)) return json({ error: "no autorizado" }, 401);

  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const limite = Math.min(Number(body.limite) || LIMITE_DEFAULT, 5000);
  const soloVer = body.dry_run === true;      // para revisar qué se iría sin borrar
  const reglas: string[] = body.reglas ?? ["promolog", "qa"];
  const db = adminClient();
  const salida: Record<string, unknown> = { dry_run: soloVer };

  // ── REGLA 1: promolog de creadoras que ya no están activas ────────────────
  if (reglas.includes("promolog")) {
    const { data: creadoras, error } = await db
      .from("creators")
      .select("id, name, status")
      .neq("status", "active");
    if (error) return json({ error: `creadoras: ${error.message}` }, 500);

    let restante = limite;
    const detalle: Array<{ creadora: string; archivos: number; filas: number }> = [];
    for (const c of creadoras ?? []) {
      if (restante <= 0) break;
      const rutas = await listarRecursivo(db, BUCKET_PROMOLOG, c.id, restante);
      if (!rutas.length) continue;

      let filas = 0;
      if (!soloVer) {
        const r = await borrarEnLotes(db, BUCKET_PROMOLOG, rutas);
        restante -= r.borrados;
        if (r.errores.length) detalle.push({ creadora: c.name ?? c.id, archivos: -1, filas: 0 });
        // La fila se queda; se marca que la evidencia ya no está. Va por RPC
        // para APENDAR la nota sin pisar la que escribió un manager a mano.
        const { data: n } = await db.rpc("promolog_purgar_evidencia", { _creator: c.id });
        filas = Number(n ?? 0);
      } else {
        restante -= rutas.length;
      }
      detalle.push({ creadora: c.name ?? c.id, archivos: rutas.length, filas });
    }
    salida.promolog = { creadoras_no_activas: creadoras?.length ?? 0, tocadas: detalle.length, detalle: detalle.slice(0, 40) };
  }

  // ── REGLA 2: audios de QA de más de 5 meses ──────────────────────────────
  if (reglas.includes("qa")) {
    const corte = new Date();
    corte.setMonth(corte.getMonth() - MESES_QA);
    const { data: llamadas, error } = await db
      .from("qa_calls")
      .select("id, audio_path, call_date")
      .not("audio_path", "is", null)
      .lt("call_date", corte.toISOString().slice(0, 10))
      .limit(limite);
    if (error) return json({ error: `qa_calls: ${error.message}` }, 500);

    const rutas = (llamadas ?? []).map((l: { audio_path: string }) => l.audio_path).filter(Boolean);
    let borrados = 0;
    if (!soloVer && rutas.length) {
      const r = await borrarEnLotes(db, BUCKET_QA, rutas);
      borrados = r.borrados;
      // Se limpia el puntero; el análisis y el score de la llamada quedan.
      await db.from("qa_calls").update({ audio_path: null })
        .in("id", (llamadas ?? []).map((l: { id: string }) => l.id));
    }
    salida.qa_audio = { corte: corte.toISOString().slice(0, 10), candidatos: rutas.length, borrados };
  }

  return json({ ok: true, ...salida });
});
