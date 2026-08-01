// Dominio PROMOLOG del catálogo de tools (lectura).
import type { AgentTool } from "./types.ts";

export const promologTools: AgentTool[] = [
  {
    name: "get_promolog_scan_report",
    description:
      "Informe de las ÚLTIMAS CORRIDAS DE SCAN de Promolog (qué se revisó y qué NO se pudo revisar). Por red devuelve: cuántas creadoras quedaron marcadas con promo, cuántas se leyeron sin promo, y —lo más importante— CUÁLES NO SE PUDIERON LEER y por qué (canal de Telegram sin vista pública, perfil caído, sesión limitada, etc). Usala cuando pregunten '¿se escanearon todas?', '¿por qué X no aparece?', '¿el scan corrió bien?', o antes de afirmar que alguien NO promocionó: si su canal/perfil está en no_legibles, NO se puede decir que no promocionó — se dice que no se pudo revisar y por qué. Complementa a get_promo_day_breakdown (que dice quién promocionó): esta dice qué quedó FUERA del scan.",
    input_schema: {
      type: "object",
      properties: {
        network: { type: "string", enum: ["instagram", "telegram", "x", "facebook"], description: "opcional: filtra por red" },
        limit: { type: "number", description: "cuántas corridas recientes traer (default 5, máx 20)" },
      },
      additionalProperties: false,
    },
    domain: "promolog",
    scope: "read",
    handler: async (args, ctx) => {
      const lim = Math.min(Math.max(Number(args?.limit) || 5, 1), 20);
      const net = typeof args?.network === "string" ? args.network.toLowerCase() : null;
      const { data, error } = await ctx.sb
        .from("promolog_dispatch_runs")
        .select("id, created_at, apify_actor_id, status, creators_count, creators_succeeded, creators_failed, entries_created, payload")
        .eq("tenant_id", ctx.tenantId)
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw new Error(`get_promolog_scan_report: ${error.message}`);
      const rows = (data ?? []) as Array<any>;
      const conResumen = rows.filter((r) => r.payload?.resumen).filter((r) => !net || r.payload?.network === net);
      const corridas = conResumen.slice(0, lim).map((r) => ({
        cuando: new Date(new Date(r.created_at).getTime() - 5 * 3600_000).toISOString().slice(5, 16).replace("T", " "),
        red: r.payload?.network ?? r.payload?.resumen?.red ?? "?",
        origen: r.payload?.source === "local" ? "agente local (Plan B)" : "server",
        ...r.payload.resumen,
      }));
      if (!corridas.length) {
        return { corridas: [], nota: "No hay informes de corridas con resumen todavía (los genera el agente local). Para el scan server-side, el estado del día se ve con get_promo_day_breakdown." };
      }
      return {
        corridas,
        nota: "no_legibles = NO se pudieron revisar (no es 'no promocionó'). Si te preguntan por una creadora que está ahí, decí que no se pudo revisar su canal/perfil y el motivo — nunca la reportes como que no promocionó.",
      };
    },
  },
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
