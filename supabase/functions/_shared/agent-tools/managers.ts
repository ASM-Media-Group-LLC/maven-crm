// Dominio MANAGERS del catálogo de tools (lectura). Para el bot supervisor del grupo
// de managers: cruza promoción × ingreso y responde "¿por qué cae X?", "detalle de las
// de Fabi", "¿quién no está promocionando?".
import type { AgentTool } from "./types.ts";

export const managersTools: AgentTool[] = [
  {
    name: "get_manager_growth_feed",
    description:
      "Radar de crecimiento por creadora ACTIVA con manager: cruza promoción (Promolog mes a la fecha) × ingreso " +
      "(BLU, mes a la fecha vs mismo día del mes pasado) y devuelve solo las accionables con su cuadrante — 'critico' (no promociona + " +
      "ingreso cae), 'calidad' (promociona pero igual cae → revisar CÓMO promociona), 'riesgo' (promo baja, " +
      "ingreso aún ok). Incluye manager responsable, días de promo, ingreso del mes/mes pasado, % de tendencia y un " +
      "diagnóstico. Filtrá por manager con 'manager_name' (ej. 'Fabiana'). Es la fuente para saber quién no crece.",
    input_schema: {
      type: "object",
      properties: {
        manager_name: { type: "string", description: "opcional: filtra a las creadoras de esa manager (ilike, ej 'Carolina', 'Fabi')" },
        quadrant: { type: "string", enum: ["critico", "calidad", "riesgo"], description: "opcional: filtra por cuadrante" },
      },
      additionalProperties: false,
    },
    domain: "managers",
    scope: "read",
    handler: async (args, ctx) => {
      const { data, error } = await ctx.sb.rpc("get_manager_growth_feed", { p_tenant: ctx.tenantId });
      if (error) throw new Error(`get_manager_growth_feed: ${error.message}`);
      let rows = (data ?? []) as Array<Record<string, unknown>>;
      const mgr = String(args?.manager_name ?? "").trim().toLowerCase();
      if (mgr) rows = rows.filter((r) => String(r.manager_name ?? "").toLowerCase().includes(mgr));
      const q = String(args?.quadrant ?? "").trim().toLowerCase();
      if (q) rows = rows.filter((r) => String(r.quadrant ?? "") === q);
      return rows;
    },
  },
  {
    name: "get_creator_earnings",
    description:
      "Tendencia de INGRESO (BLU) de UNA creadora por nombre o @handle: bruto 7d vs 7d previos vs 30d, % de " +
      "cambio, serie diaria de los últimos 14 días y fans (activos/nuevos) más recientes. Úsalo para entender " +
      "'¿por qué cayó/subió el ingreso de X?' y ver cuándo empezó el cambio.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "nombre o @handle de la creadora" } },
      required: ["query"],
      additionalProperties: false,
    },
    domain: "managers",
    scope: "read",
    handler: async (args, ctx) => {
      const raw = String(args?.query ?? "").trim().replace(/^@+/, "");
      if (!raw) throw new Error("get_creator_earnings: pasá { query }");
      const like = `%${raw}%`;
      const { data: cands, error: cErr } = await ctx.sb
        .from("creators")
        .select("id, artistic_name, name, instagram_handle, status, assigned_manager_profile_id")
        .or(`artistic_name.ilike.${like},name.ilike.${like},instagram_handle.ilike.${like}`)
        .limit(5);
      if (cErr) throw new Error(`get_creator_earnings: ${cErr.message}`);
      if (!cands || !cands.length) return { found: false, query: raw };
      // preferir la activa si hay varias
      const c = cands.find((x) => x.status === "active") ?? cands[0];

      const { data: rows, error: eErr } = await ctx.sb
        .from("creator_daily_earnings")
        .select("date,total_gross,active_fans,new_fans")
        .eq("creator_id", c.id)
        .gte("date", new Date(Date.now() - 31 * 864e5).toISOString().slice(0, 10))
        .order("date", { ascending: false });
      if (eErr) throw new Error(`get_creator_earnings earnings: ${eErr.message}`);
      const es = (rows ?? []) as Array<{ date: string; total_gross: number; active_fans: number | null; new_fans: number | null }>;

      const today = new Date();
      const dayN = (n: number) => new Date(today.getTime() - n * 864e5).toISOString().slice(0, 10);
      const sumBetween = (from: number, to: number) =>
        es.filter((r) => r.date >= dayN(from) && r.date < dayN(to)).reduce((a, r) => a + (Number(r.total_gross) || 0), 0);
      const g7 = sumBetween(7, 0), gPrev7 = sumBetween(14, 7), g30 = es.reduce((a, r) => a + (Number(r.total_gross) || 0), 0);
      const latestFans = es.find((r) => r.active_fans != null);

      return {
        found: true,
        creator: { name: c.artistic_name || c.name, instagram_handle: c.instagram_handle, status: c.status },
        income_7d: Math.round(g7),
        income_prev7d: Math.round(gPrev7),
        income_30d: Math.round(g30),
        trend_pct: gPrev7 > 0 ? Math.round(((g7 - gPrev7) / gPrev7) * 100) : null,
        active_fans: latestFans?.active_fans ?? null,
        new_fans_last: latestFans?.new_fans ?? null,
        daily_last14: es.filter((r) => r.date >= dayN(14)).map((r) => ({ date: r.date, gross: Math.round(Number(r.total_gross) || 0) })),
      };
    },
  },
  {
    name: "get_promo_month_comparison",
    description:
      "Compara los DÍAS DE PROMO del tramo del mes ACTUAL (día 1 → hoy) contra el MISMO TRAMO de un mes anterior " +
      "(por defecto el mes pasado), por creadora ACTIVA con manager. Úsala para 'promo de julio vs junio', " +
      "'¿quién bajó la promoción respecto al mes pasado?', comparaciones mes-contra-mes. El histórico SÍ existe " +
      "en el sistema. Filtrá por manager con manager_name. months_back: 1 = mes pasado (default), 2 = el anterior, etc. " +
      "Devuelve, por creadora, días de promo del mes actual vs el previo + delta (negativo = bajó) + las fechas exactas " +
      "de cada tramo. Ordenado por mayor caída primero.",
    input_schema: {
      type: "object",
      properties: {
        manager_name: { type: "string", description: "opcional: filtra a las creadoras de esa manager (ilike, ej 'Carolina', 'Fabi')" },
        months_back: { type: "number", description: "cuántos meses atrás comparar (default 1 = mes pasado; 2 = antepasado)" },
      },
      additionalProperties: false,
    },
    domain: "managers",
    scope: "read",
    handler: async (args, ctx) => {
      const monthsBack = Math.max(1, Math.min(Number(args?.months_back ?? 1) || 1, 12));
      const mgr = String(args?.manager_name ?? "").trim() || null;
      const { data, error } = await ctx.sb.rpc("get_promo_month_comparison", {
        p_tenant: ctx.tenantId, p_months_back: monthsBack, p_manager_name: mgr,
      });
      if (error) throw new Error(`get_promo_month_comparison: ${error.message}`);
      return data ?? [];
    },
  },
  {
    name: "get_promo_day_breakdown",
    description:
      "Cuántas CREADORAS promocionaron en un DÍA (por defecto HOY, Bogotá), separado por manager. " +
      "⚠️ 'cuántas promociones' = cuántas CREADORAS promocionaron, NO cantidad de stories. Cuenta creadoras con " +
      "promo OF detectada ese día (promoted='true'); ignora las que solo tuvieron stories sin promo y las pendientes " +
      "de scan. Úsala para '¿cuántas promocionaron hoy?', 'separá las de Carolina y Fabiana', '¿quiénes promocionaron " +
      "el 14?'. Pasá date (YYYY-MM-DD) para otro día y manager_name para filtrar. Devuelve por manager: cuántas " +
      "creadoras promocionaron + quiénes (con nº de stories de promo y redes). Nota: refleja lo scaneado hasta el " +
      "momento — el promolog scanea a lo largo del día, así que a media jornada puede faltar gente por scanear.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "opcional: día en YYYY-MM-DD. Default = hoy (Bogotá)." },
        manager_name: { type: "string", description: "opcional: filtra a las creadoras de esa manager (ilike)" },
      },
      additionalProperties: false,
    },
    domain: "managers",
    scope: "read",
    handler: async (args, ctx) => {
      const date = String(args?.date ?? "").trim() || null;
      const mgr = String(args?.manager_name ?? "").trim() || null;
      const { data, error } = await ctx.sb.rpc("get_promo_day_breakdown", {
        p_tenant: ctx.tenantId, p_date: date, p_manager_name: mgr,
      });
      if (error) throw new Error(`get_promo_day_breakdown: ${error.message}`);
      const rows = (data ?? []) as Array<{ manager_name: string | null; handle: string | null; promo_stories: number; networks: string | null }>;
      const byMgr = new Map<string, typeof rows>();
      for (const r of rows) {
        const k = r.manager_name ?? "(sin manager)";
        if (!byMgr.has(k)) byMgr.set(k, []);
        byMgr.get(k)!.push(r);
      }
      const por_manager = [...byMgr.entries()]
        .map(([manager, rs]) => ({
          manager,
          creadoras_promocionaron: rs.length,
          creadoras: rs.map((r) => ({ handle: r.handle, stories_promo: r.promo_stories, redes: r.networks })),
        }))
        .sort((a, b) => b.creadoras_promocionaron - a.creadoras_promocionaron);
      return {
        total_creadoras_promocionaron: rows.length,
        por_manager,
        nota: "Cuenta CREADORAS con promo OF detectada (promoted=true), no cantidad de stories. Refleja lo scaneado hasta ahora (el promolog corre a lo largo del día).",
      };
    },
  },
];
