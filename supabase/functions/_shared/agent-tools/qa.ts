// Dominio QA del catálogo (lectura).
import type { AgentTool } from "./types.ts";

export const qaTools: AgentTool[] = [
  {
    name: "get_qa_activity",
    description:
      "Actividad de QA (calls de closers analizadas) de los últimos N días: total y desglose por estado " +
      "(ready/processing/failed). Para saber cuántas QAs se hicieron y si quedaron pendientes/falladas.",
    input_schema: {
      type: "object",
      properties: { days: { type: "number", description: "ventana en días (default 14)" } },
      additionalProperties: false,
    },
    domain: "qa",
    scope: "read",
    handler: async (args, ctx) => {
      const days = Math.min(Math.max(Number(args.days) || 14, 1), 90);
      const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
      const { data, error } = await ctx.sb
        .from("qa_calls")
        .select("status, call_date")
        .eq("tenant_id", ctx.tenantId)
        .gte("call_date", since);
      if (error) throw new Error(`get_qa_activity: ${error.message}`);
      const rows = (data ?? []) as Array<{ status: string | null }>;
      const byStatus: Record<string, number> = {};
      for (const r of rows) byStatus[r.status || "desconocido"] = (byStatus[r.status || "desconocido"] ?? 0) + 1;
      return { ventana_dias: days, total: rows.length, por_estado: byStatus };
    },
  },
  {
    name: "get_chatter_productivity",
    description:
      "Productividad y RENTABILIDAD de chatters cruzando Hubstaff (horas + % actividad) con la venta de BLU " +
      "del mes en curso. Devuelve por chatter: ventas, $/hora, ingreso de la agencia (venta × 80% neto OF × % " +
      "efectivo firmado), costo (salario base), margen y ROI (×). Detecta 'online pero improductivo' (mucha " +
      "actividad, poca venta) y 'no rentable' (la agencia recibe menos de lo que cuesta el chatter, ROI<1). " +
      "Pasa only_flagged=true para listar SOLO a los que hay que revisar (no rentables u online-improductivos). " +
      "Útil para '¿quién está conectado pero no vende?', '¿quién no es rentable?' o un resumen de rendimiento del equipo.",
    input_schema: {
      type: "object",
      properties: {
        only_flagged: { type: "boolean", description: "true → solo los 'no rentables' u 'online improductivos'" },
        limit: { type: "number", description: "máximo de chatters a devolver (default 20)" },
      },
      additionalProperties: false,
    },
    domain: "qa",
    scope: "read",
    handler: async (args, ctx) => {
      const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100);
      // v_chatter_hubstaff_effort: cruce Hubstaff×BLU, mes en curso. No tiene tenant_id (datos de chatters,
      // single-tenant). El cliente service-role bypassa la RLS de las tablas base (incl. el costo).
      const { data, error } = await ctx.sb
        .from("v_chatter_hubstaff_effort")
        .select("name, total_hours, avg_activity_pct, sales, sales_per_hour, avg_response_min, " +
          "online_improductivo, cost_usd, agency_revenue_usd, margin_usd, roi_x, no_rentable, agency_rate_used");
      if (error) throw new Error(`get_chatter_productivity: ${error.message}`);
      let rows = (data ?? []) as Array<Record<string, unknown>>;
      if (args.only_flagged === true) rows = rows.filter((r) => r.no_rentable === true || r.online_improductivo === true);
      // Peor ROI primero cuando se filtran problemas; si no, mejor ROI primero.
      rows.sort((a, b) => (Number(a.roi_x) || 0) - (Number(b.roi_x) || 0));
      if (args.only_flagged !== true) rows.reverse();
      const num = (v: unknown) => (v == null ? null : Number(v));
      return {
        total: rows.length,
        no_rentables: rows.filter((r) => r.no_rentable === true).length,
        online_improductivos: rows.filter((r) => r.online_improductivo === true).length,
        tasa_agencia_efectiva_pct: num(rows.find((r) => r.agency_rate_used != null)?.agency_rate_used),
        margen_total_equipo_usd: rows.reduce((s, r) => s + (num(r.margin_usd) ?? 0), 0),
        chatters: rows.slice(0, limit).map((r) => ({
          chatter: r.name,
          horas: r.total_hours,
          actividad_pct: r.avg_activity_pct,
          venta_bruta: r.sales,
          venta_por_hora: r.sales_per_hour,
          ingreso_agencia_usd: r.agency_revenue_usd,
          costo_usd: r.cost_usd,
          margen_usd: r.margin_usd,
          roi_x: r.roi_x,
          respuesta_min: r.avg_response_min,
          no_rentable: r.no_rentable,
          online_improductivo: r.online_improductivo,
        })),
      };
    },
  },
];
