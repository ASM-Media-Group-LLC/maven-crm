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
      "Útil para '¿quién está conectado pero no vende?', '¿quién no es rentable?' o un resumen de rendimiento del equipo. " +
      "Los números son SOLO del MES EN CURSO (campo `periodo`); cada chatter trae `venta_al` = último día con venta " +
      "sincronizada — si `venta_desactualizada` es true, la venta de ese chatter está incompleta y DEBES decirlo con la fecha. " +
      "VENTA DÍA POR DÍA: sí la tienes — pasa `person` y devuelve `venta_por_dia` (fecha, monto, mensajes vendidos, " +
      "fans chateados) de los últimos `days`. Úsalo para '¿cuánto vendió X ayer / en la madrugada / el día 3?'. " +
      "Si ese bloque viene vacío NO afirmes $0: la respuesta trae la razón (sin ventas registradas vs sin sincronizar).",
    input_schema: {
      type: "object",
      properties: {
        only_flagged: { type: "boolean", description: "true → solo los 'no rentables' u 'online improductivos'" },
        limit: { type: "number", description: "máximo de chatters a devolver (default 20)" },
        person: { type: "string", description: "nombre (o parte) de un chatter → agrega su venta DÍA POR DÍA" },
        days: { type: "number", description: "ventana del desglose diario (default 14, máx 90). Solo aplica con `person`." },
      },
      additionalProperties: false,
    },
    domain: "qa",
    scope: "read",
    handler: async (args, ctx) => {
      const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100);
      // v_chatter_hubstaff_effort emite UNA FILA POR CHATTER POR MES (4 meses de
      // historia = 55 filas para 15 personas). Sin filtrar `period`, el 07/08 el
      // bot narró los meses de Erick como "3 asignaciones" y le dio a Grace ventas
      // de JUNIO como "del mes": TODOS los agregados de abajo (total, margen del
      // equipo, no_rentables, ranking) contaban filas-mes como personas. El filtro
      // al mes en curso (Bogotá) arregla las cuatro cosas de una.
      const primerDiaMes = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 8) + "01";
      const { data, error } = await ctx.sb
        .from("v_chatter_hubstaff_effort")
        .select("blu_employee_id, name, period, total_hours, avg_activity_pct, sales, sales_per_hour, avg_response_min, " +
          "online_improductivo, cost_usd, agency_revenue_usd, margin_usd, roi_x, no_rentable, agency_rate_used")
        .eq("period", primerDiaMes);
      if (error) throw new Error(`get_chatter_productivity: ${error.message}`);
      let rows = (data ?? []) as Array<Record<string, unknown>>;
      // Frescura de la VENTA por chatter: último día con fila en chatter_daily_sales.
      // El puente de BLU llega con lag y cobertura irregular (Erick: última venta
      // sincronizada 05/07) — sin esta fecha, un $0 de agosto se lee como "no vendió"
      // cuando en realidad es "no sincronizado desde X".
      const ventaAl = new Map<string, string>();
      {
        const { data: vs } = await ctx.sb
          .from("chatter_daily_sales")
          .select("blu_employee_id, date")
          .order("date", { ascending: false })
          .limit(5000);
        for (const v of (vs ?? []) as Array<{ blu_employee_id: string; date: string }>) {
          const k = String(v.blu_employee_id);
          if (!ventaAl.has(k)) ventaAl.set(k, String(v.date));
        }
      }
      const hace3d = new Date(Date.now() - 3 * 86400_000).toISOString().slice(0, 10);
      if (args.only_flagged === true) rows = rows.filter((r) => r.no_rentable === true || r.online_improductivo === true);
      // Peor ROI primero cuando se filtran problemas; si no, mejor ROI primero.
      rows.sort((a, b) => (Number(a.roi_x) || 0) - (Number(b.roi_x) || 0));
      if (args.only_flagged !== true) rows.reverse();
      const num = (v: unknown) => (v == null ? null : Number(v));

      // VENTA DÍA POR DÍA (chatter_daily_sales, que alimenta el bridge con
      // employee-reports día a día). El 07/08 el bot le dijo a Grace que "la
      // productividad de chatters me llega solo como acumulado del MES" y que el
      // desglose diario vivía en el panel de BLU — falso, esta tabla existe.
      let diario: Record<string, unknown> | null = null;
      const persona = typeof args.person === "string" ? args.person.trim() : "";
      if (persona) {
        const dias = Math.min(Math.max(Number(args.days) || 14, 1), 90);
        const desde = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
        const safe = persona.replace(/[%_,]/g, "");
        const { data: dd, error: dErr } = await ctx.sb
          .from("chatter_daily_sales")
          .select("name, date, total_sales, sold_messages, fans_chatted")
          .ilike("name", `%${safe}%`)
          .gte("date", desde)
          .order("date", { ascending: false })
          .limit(200);
        if (dErr) {
          diario = { error: dErr.message };
        } else {
          const filas = (dd ?? []) as Array<Record<string, unknown>>;
          const { data: ult } = await ctx.sb
            .from("chatter_daily_sales").select("date")
            .order("date", { ascending: false }).limit(1).maybeSingle();
          diario = {
            persona_buscada: persona,
            rango: `últimos ${dias} días (desde ${desde})`,
            dias_con_venta: filas.length,
            total_periodo: Math.round(filas.reduce((s, r) => s + (Number(r.total_sales) || 0), 0) * 100) / 100,
            venta_por_dia: filas.map((r) => ({
              dia: r.date, chatter: r.name,
              venta: Number(r.total_sales) || 0,
              mensajes_vendidos: r.sold_messages, fans_chateados: r.fans_chatted,
            })),
            ultimo_dia_sincronizado: ult?.date ?? null,
            ...(filas.length === 0
              ? {
                nota:
                  "Sin filas en ese rango. La tabla SOLO guarda días con actividad, así que puede ser que no " +
                  "vendió — pero compara con `ultimo_dia_sincronizado`: si es anterior al rango pedido, el puente " +
                  "de BLU no trajo esos días y NO puedes afirmar $0.",
              }
              : {}),
          };
        }
      }

      const truncado = rows.length > limit;
      return {
        periodo: primerDiaMes.slice(0, 7),
        total_chatters_mes: rows.length,
        ...(truncado ? { ojo_truncado: `mostrando ${limit} de ${rows.length} — al hablar de totales usa ${rows.length}, no el recorte` } : {}),
        ...(diario ? { desglose_diario: diario } : {}),
        no_rentables: rows.filter((r) => r.no_rentable === true).length,
        online_improductivos: rows.filter((r) => r.online_improductivo === true).length,
        tasa_agencia_efectiva_pct: num(rows.find((r) => r.agency_rate_used != null)?.agency_rate_used),
        margen_total_equipo_usd: rows.reduce((s, r) => s + (num(r.margin_usd) ?? 0), 0),
        nota_frescura: "venta_al = último día con venta sincronizada de ese chatter. Si venta_desactualizada=true, " +
          "su venta del mes está incompleta (puente BLU atrasado): dilo con la fecha y NO leas ese número como el real.",
        chatters: rows.slice(0, limit).map((r) => ({
          chatter: r.name,
          periodo: String(r.period ?? "").slice(0, 7),
          venta_al: ventaAl.get(String(r.blu_employee_id)) ?? null,
          venta_desactualizada: (ventaAl.get(String(r.blu_employee_id)) ?? "") < hace3d,
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
