// Dominio MONETIZACIÓN del catálogo (lectura).
import type { AgentTool } from "./types.ts";

export const monetizacionTools: AgentTool[] = [
  {
    name: "get_monetization_opportunities",
    description:
      "Oportunidades de venta de productos (Piclink, Content Protector, Blu, Exchange, etc.) ABIERTAS, " +
      "priorizadas por etapa (negotiating > offered > interested) y urgencia de seguimiento.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    domain: "monetizacion",
    scope: "read",
    handler: async (_args, ctx) => {
      const { data, error } = await ctx.sb
        .from("monetization_opportunities")
        .select("creator_handle, product, stage, monthly_value_usd, next_followup_at")
        .eq("tenant_id", ctx.tenantId)
        .in("stage", ["interested", "offered", "negotiating"])
        .order("next_followup_at", { ascending: true })
        .limit(30);
      if (error) throw new Error(`get_monetization_opportunities: ${error.message}`);
      return data ?? [];
    },
  },
];
