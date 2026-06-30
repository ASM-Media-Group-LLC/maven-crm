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
      "Productividad de chatters cruzando Hubstaff (horas trabajadas + % de actividad) con la venta de BLU " +
      "del mes en curso: $/hora, ventas, tiempo de respuesta. Detecta 'online pero improductivo' (bastante " +
      "actividad pero poca venta). Pasá only_flagged=true para listar SOLO a los que hay que revisar/coachear. " +
      "Útil para '¿quién está conectado pero no vende?' o un resumen de rendimiento del equipo.",
    input_schema: {
      type: "object",
      properties: {
        only_flagged: { type: "boolean", description: "true → solo los marcados 'online pero improductivo'" },
        limit: { type: "number", description: "máximo de chatters a devolver (default 20)" },
      },
      additionalProperties: false,
    },
    domain: "qa",
    scope: "read",
    handler: async (args, ctx) => {
      const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100);
      // v_chatter_hubstaff_effort: cruce Hubstaff×BLU, mes en curso. No tiene tenant_id (datos de chatters,
      // single-tenant). El cliente service-role bypassa la RLS de las tablas base.
      let q = ctx.sb
        .from("v_chatter_hubstaff_effort")
        .select("name, total_hours, avg_activity_pct, sales, sales_per_hour, avg_response_min, online_improductivo");
      if (args.only_flagged === true) q = q.eq("online_improductivo", true);
      const { data, error } = await q;
      if (error) throw new Error(`get_chatter_productivity: ${error.message}`);
      const rows = (data ?? []) as Array<Record<string, unknown>>;
      rows.sort((a, b) => (Number(b.sales_per_hour) || 0) - (Number(a.sales_per_hour) || 0));
      return {
        total: rows.length,
        a_revisar: rows.filter((r) => r.online_improductivo === true).length,
        chatters: rows.slice(0, limit).map((r) => ({
          chatter: r.name,
          horas: r.total_hours,
          actividad_pct: r.avg_activity_pct,
          venta: r.sales,
          venta_por_hora: r.sales_per_hour,
          respuesta_min: r.avg_response_min,
          online_improductivo: r.online_improductivo,
        })),
      };
    },
  },
];
