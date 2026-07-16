// Dominio MONETIZACIÓN del catálogo (lectura).
import type { AgentTool } from "./types.ts";

export const monetizacionTools: AgentTool[] = [
  {
    name: "get_monetization_opportunities",
    description:
      "Oportunidades de venta de productos (Piclink, Content Protector, Blu, Exchange, etc.) de Maven, priorizadas " +
      "por etapa y urgencia de seguimiento. Por defecto trae las ABIERTAS (interested/offered/negotiating). Para " +
      "VENTAS CERRADAS pasá stage='won' (ej. '¿cuántas se cerraron?' → mirá last_touch_at); 'all' trae todas. " +
      "Nota: Maven solo tiene lo que registró el bot o lo cargado acá — si un closer dice que las puso en un Google " +
      "Sheet u otro lado, no van a aparecer.",
    input_schema: {
      type: "object",
      properties: {
        stage: { type: "string", description: "opcional: 'interested'|'offered'|'negotiating'|'won'|'lost'; 'open' (default) = las 3 abiertas; 'all' = todas" },
      },
      additionalProperties: false,
    },
    domain: "monetizacion",
    scope: "read",
    handler: async (args, ctx) => {
      const OPEN = ["interested", "offered", "negotiating"];
      const ALL = ["interested", "offered", "negotiating", "won", "lost"];
      const s = String(args?.stage ?? "").trim().toLowerCase();
      const stages = !s || s === "open" ? OPEN : s === "all" ? ALL : ALL.includes(s) ? [s] : OPEN;
      const { data, error } = await ctx.sb
        .from("monetization_opportunities")
        .select("creator_handle, product, stage, monthly_value_usd, next_followup_at, last_touch_at")
        .eq("tenant_id", ctx.tenantId)
        .in("stage", stages)
        .order("next_followup_at", { ascending: true })
        .limit(40);
      if (error) throw new Error(`get_monetization_opportunities: ${error.message}`);
      return data ?? [];
    },
  },
];
