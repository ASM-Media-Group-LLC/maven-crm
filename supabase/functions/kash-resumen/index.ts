// KASH-RESUMEN — función NUEVA de Kash, SOLO LECTURA (autorizada por Alvaro el 19/11/2026,
// tanda 5 de docs/maven-como-lumina-spec.md). Es lo único del tren de agencias que vive en
// Kash: no escribe, no cambia tablas ni gente, no crea nada en la base.
//
// La llama el EDIFICIO (edge refrescar-externas, cada 15 min) para la tarjeta de Kash del
// panel del dueño. Devuelve SOLO números: personas activas, en vivo en Cowork ahora, nota de
// Argos de hoy (promedio del equipo), gasto de Argos de hoy, saldo de Gemini y alertas
// abiertas. Sin nombres, correos ni ids (lo vigila kash-resumen/logica.test.ts).
//
// Entra solo con la cabecera X-Kash-Resumen-Token = KASH_RESUMEN_TOKEN (secreto dedicado,
// comparado en tiempo constante). verify_jwt = false (config.toml): la llama un servidor.
// Todo lo que hace son SELECT (con conteos) y dos funciones que solo leen
// (argos_gasto_hoy e ia_saldo_calculo, ambas STABLE).

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { tokenDeCronValido } from "../_shared/cron-token.ts";
import { armarResumen, type Conteos, inicioDelDiaBogota } from "./logica.ts";

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

const PAGINA = 1000;
const MAX_PAGINAS = 20;

/** Lee una columna de todas las filas (por páginas). Solo SELECT. */
async function columnas<T>(armar: (desde: number, hasta: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let p = 0; p < MAX_PAGINAS; p++) {
    const { data, error } = await armar(p * PAGINA, (p + 1) * PAGINA - 1);
    if (error) throw new Error(error.message);
    const filas = (data ?? []) as T[];
    out.push(...filas);
    if (filas.length < PAGINA) break;
  }
  return out;
}

/** Solo cuenta (HEAD, count=exact): no baja filas. */
async function contar(q: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> {
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function conteos(db: SupabaseClient, ahora: Date): Promise<Conteos> {
  const hoy = inicioDelDiaBogota(ahora);
  const hace90s = new Date(ahora.getTime() - 90_000).toISOString();

  const [miembros, enPapelera, vivos, segs] = await Promise.all([
    columnas<{ user_id: string }>((a, b) => db.from("tenant_members").select("user_id").range(a, b)),
    columnas<{ id: string }>((a, b) => db.from("profiles").select("id").not("deleted_at", "is", null).range(a, b)),
    columnas<{ user_id: string }>((a, b) =>
      db.from("cowork_tiempo_segmentos").select("user_id").is("ended_at", null).gt("last_seen_at", hace90s).range(a, b)),
    columnas<{ user_id: string; estado: string; seconds: number | null }>((a, b) =>
      db.from("cowork_tiempo_segmentos").select("user_id, estado, seconds").gte("started_at", hoy).range(a, b)),
  ]);
  const papelera = new Set(enPapelera.map((p) => p.id));
  const equipo = new Set(miembros.map((m) => m.user_id).filter((u) => !papelera.has(u)));
  const enVivo = new Set(vivos.map((v) => v.user_id).filter((u) => equipo.has(u))).size;
  const porPersona = new Map<string, number>();
  for (const s of segs) {
    if (!equipo.has(s.user_id)) continue;
    const suma = s.estado === "activo" || s.estado === "pausa" ? Number(s.seconds ?? 0) : 0;
    porPersona.set(s.user_id, (porPersona.get(s.user_id) ?? 0) + suma);
  }

  const capturas = () => db.from("monitor_capturas").select("id", { count: "exact", head: true }).gte("created_at", hoy);
  const alertas = () => db.from("argos_alertas").select("id", { count: "exact", head: true }).is("cerrada_at", null);
  const [camara, conCara, pantalla, distraido, abiertas, graves, gasto, saldo] = await Promise.all([
    contar(capturas().eq("tipo", "camara")),
    contar(capturas().eq("tipo", "camara").is("cara_visible", true)),
    contar(capturas().eq("tipo", "pantalla")),
    contar(capturas().is("fuera_de_lugar", true).not("perdonado", "is", true)),
    contar(alertas()),
    contar(alertas().gte("gravedad", 3)),
    db.rpc("argos_gasto_hoy"),
    db.rpc("ia_saldo_calculo"),
  ]);
  const g = (gasto.error ? null : gasto.data) as { usd?: number } | null;
  const s = (saldo.error ? null : saldo.data) as { saldo_usd?: number | null; estado?: string } | null;

  return {
    personas: equipo.size,
    enVivo,
    segundosPantallaHoy: [...porPersona.values()],
    capturasCamara: camara,
    capturasConCara: conCara,
    capturasPantalla: pantalla,
    capturasDistraido: distraido,
    argosGastoHoyUsd: typeof g?.usd === "number" ? g.usd : g?.usd != null ? Number(g.usd) : null,
    argosSaldoUsd: typeof s?.saldo_usd === "number" ? s.saldo_usd : null,
    argosSaldoEstado: typeof s?.estado === "string" ? s.estado : null,
    alertasAbiertas: abiertas,
    alertasGraves: graves,
  };
}

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "POST") return json({ error: "metodo" }, 405);
  const esperado = Deno.env.get("KASH_RESUMEN_TOKEN");
  if (!esperado) return json({ error: "sin_configurar" }, 503);
  if (!(await tokenDeCronValido(req.headers.get("x-kash-resumen-token"), esperado))) return json({ error: "no_autorizado" }, 401);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  try {
    const ahora = new Date();
    return json({ ok: true, resumen: armarResumen(await conteos(db, ahora), ahora) });
  } catch (e) {
    console.error("[kash-resumen]", (e as Error).message);
    return json({ error: "no_se_pudo_leer" }, 500);
  }
});
