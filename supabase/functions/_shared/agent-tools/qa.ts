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
];
