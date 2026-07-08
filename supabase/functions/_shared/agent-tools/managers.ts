// Dominio MANAGERS del catálogo de tools (lectura). Para el bot supervisor del grupo
// de managers: cruza promoción × ingreso y responde "¿por qué cae X?", "detalle de las
// de Fabi", "¿quién no está promocionando?".
import type { AgentTool } from "./types.ts";

export const managersTools: AgentTool[] = [
  {
    name: "get_manager_growth_feed",
    description:
      "Radar de crecimiento por creadora ACTIVA con manager: cruza promoción (Promolog 14d) × ingreso " +
      "(BLU, 7d vs 7d previos) y devuelve solo las accionables con su cuadrante — 'critico' (no promociona + " +
      "ingreso cae), 'calidad' (promociona pero igual cae → revisar CÓMO promociona), 'riesgo' (promo baja, " +
      "ingreso aún ok). Incluye manager responsable, días de promo, ingreso 7d/previo, % de tendencia y un " +
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
];
