// Dominio MONETIZACIÓN del catálogo (lectura).
//
// "Unlimited" (venta de plataformas a creadoras) vive en DOS fuentes:
//   A) monetization_opportunities → get_monetization_opportunities (registra el bot;
//      el equipo edita el estado en el tab Oportunidades). Productos: piclink, CP, blu, etc.
//   B) closer_creators con deal_type='venta_plataforma' → get_platform_sales (viene del
//      carrito 🛒 de Creadoras → pipeline de closers, con suscripción mensual). Plataformas:
//      Trafix, Blu, Piclink, Content Protector, ORA, Let's Shoot.
// Para "¿cuántas ventas de unlimited/plataformas?" hay que mirar AMBAS.
import type { AgentTool } from "./types.ts";

const SALE_STAGE_CLOSED = ["Confirmada", "Completada"];

export const monetizacionTools: AgentTool[] = [
  {
    name: "get_monetization_opportunities",
    description:
      "Oportunidades de venta de productos (Piclink, Content Protector, Blu, Exchange, etc.) de Maven, priorizadas " +
      "por etapa y urgencia de seguimiento. Por defecto trae las ABIERTAS (interested/offered/negotiating). Para " +
      "VENTAS CERRADAS pasa stage='won' (ej. '¿cuántas se cerraron?' → mira last_touch_at); 'all' trae todas. " +
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
  {
    name: "get_platform_sales",
    description:
      "Ventas de PLATAFORMAS a creadoras hechas desde el pipeline de closers (el carrito 🛒 de la pantalla " +
      "Creadoras → deal_type venta_plataforma): Trafix, Blu, Piclink, Content Protector, ORA, Let's Shoot, con " +
      "suscripción mensual fija (sin comisión %). Es la SEGUNDA fuente de 'unlimited' — la otra es " +
      "get_monetization_opportunities. Para '¿cuántas ventas de unlimited/plataformas?' mira AMBAS. Devuelve por " +
      "deal: creadora, plataforma, suscripción USD/mes, etapa (Asignada=en curso · Confirmada/Completada=cerrada), " +
      "closer y fechas; + un resumen (total, cerradas, MRR). Filtra por stage, closer (nombre) o since (fecha ISO).",
    input_schema: {
      type: "object",
      properties: {
        stage: { type: "string", description: "opcional: etapa exacta (Asignada|Confirmada|Completada|No interesada|Rechazada)" },
        closer: { type: "string", description: "opcional: nombre del closer (ilike sobre el nombre del asignado)" },
        since: { type: "string", description: "opcional: fecha ISO (YYYY-MM-DD); solo deals creados desde esa fecha (ej. hoy)" },
      },
      additionalProperties: false,
    },
    domain: "monetizacion",
    scope: "read",
    handler: async (args, ctx) => {
      let q = ctx.sb
        .from("closer_creators")
        .select("instagram_handle, main_platform, subscription_amount, stage, assigned_to, created_at, updated_at")
        .eq("deal_type", "venta_plataforma")
        .order("created_at", { ascending: false })
        .limit(200);
      const stage = String(args?.stage ?? "").trim();
      if (stage) q = q.eq("stage", stage);
      const since = String(args?.since ?? "").trim();
      if (since) q = q.gte("created_at", since);
      const { data, error } = await q;
      if (error) throw new Error(`get_platform_sales: ${error.message}`);
      let rows = (data ?? []) as Array<{
        instagram_handle: string | null; main_platform: string | null; subscription_amount: number | string | null;
        stage: string | null; assigned_to: string | null; created_at: string | null; updated_at: string | null;
      }>;

      // Resolver nombre del closer asignado.
      const ownerIds = [...new Set(rows.map((r) => r.assigned_to).filter((x): x is string => Boolean(x)))];
      const nameById = new Map<string, string>();
      if (ownerIds.length) {
        const { data: profs } = await ctx.sb.from("profiles").select("id, full_name").in("id", ownerIds);
        for (const p of (profs ?? []) as Array<{ id: string; full_name: string | null }>) {
          nameById.set(p.id, p.full_name ?? "?");
        }
      }
      const closerFilter = String(args?.closer ?? "").trim().toLowerCase();
      if (closerFilter) {
        rows = rows.filter((r) => (r.assigned_to ? (nameById.get(r.assigned_to) ?? "") : "").toLowerCase().includes(closerFilter));
      }

      const deals = rows.map((r) => ({
        creadora: r.instagram_handle ? "@" + r.instagram_handle.replace(/^@/, "") : "(sin handle)",
        plataforma: r.main_platform,
        suscripcion_usd: r.subscription_amount != null ? Number(r.subscription_amount) : null,
        etapa: r.stage,
        cerrada: r.stage ? SALE_STAGE_CLOSED.includes(r.stage) : false,
        closer: r.assigned_to ? (nameById.get(r.assigned_to) ?? null) : null,
        creado: r.created_at,
      }));
      const byStage: Record<string, number> = {};
      for (const d of deals) byStage[d.etapa ?? "Sin stage"] = (byStage[d.etapa ?? "Sin stage"] ?? 0) + 1;
      const mrr = deals.reduce((a, d) => a + (d.suscripcion_usd ?? 0), 0);

      return {
        total: deals.length,
        cerradas: deals.filter((d) => d.cerrada).length,
        en_curso: deals.filter((d) => !d.cerrada).length,
        por_etapa: byStage,
        mrr_usd_total: mrr,
        deals,
      };
    },
  },
];
