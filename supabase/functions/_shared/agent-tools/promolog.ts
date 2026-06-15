// Dominio PROMOLOG del catálogo de tools (lectura).
import type { AgentTool } from "./types.ts";

export const promologTools: AgentTool[] = [
  {
    name: "get_promolog_action_feed",
    description:
      "Acciones recomendadas de promoción del día, por creadora: tier alto (Elite/A+) que no promocionó hoy, " +
      "y las que solo promocionaron en Instagram (empujar otra red). Útil para que un manager sepa a quién apretar.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    domain: "promolog",
    scope: "read",
    handler: async (_args, ctx) => {
      const { data, error } = await ctx.sb.rpc("get_promolog_action_feed", { p_tenant: ctx.tenantId });
      if (error) throw new Error(`get_promolog_action_feed: ${error.message}`);
      return data ?? [];
    },
  },
];
