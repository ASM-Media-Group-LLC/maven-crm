// Dominio EQUIPO / pipeline de closers del catálogo (lectura).
import type { AgentTool } from "./types.ts";

export const equipoTools: AgentTool[] = [
  {
    name: "get_pipeline_overview",
    description:
      "Resumen del pipeline de closers: cuántas creadoras hay en cada etapa (Nuevo, Asignada, " +
      "Confirmada, Completada, etc.) y la facturación mensual (USD) sumada de las confirmadas + completadas.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    domain: "equipo",
    scope: "read",
    handler: async (_args, ctx) => {
      const { data, error } = await ctx.sb
        .from("closer_creators")
        .select("stage, monthly_monetization");
      if (error) throw new Error(`get_pipeline_overview: ${error.message}`);
      const rows = (data ?? []) as Array<{ stage: string | null; monthly_monetization: number | null }>;
      const byStage: Record<string, number> = {};
      let mrr = 0;
      for (const r of rows) {
        const s = r.stage || "Sin etapa";
        byStage[s] = (byStage[s] ?? 0) + 1;
        if (s === "Confirmada" || s === "Completada") mrr += Number(r.monthly_monetization ?? 0);
      }
      return { total: rows.length, by_stage: byStage, monthly_usd_confirmadas_completadas: Math.round(mrr) };
    },
  },
];
