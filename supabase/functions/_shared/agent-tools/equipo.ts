// Dominio EQUIPO / pipeline de closers del catálogo (lectura).
import type { AgentTool } from "./types.ts";

export const equipoTools: AgentTool[] = [
  {
    name: "get_pipeline_overview",
    description:
      "Resumen del pipeline de closers: cuántas creadoras hay en cada etapa (Nuevo, Asignada, " +
      "Confirmada, Completada, etc.) y la facturación mensual (USD) sumada de las confirmadas + completadas. " +
      "Devuelve además el desglose por LÍNEA DE NEGOCIO, que son embudos distintos y NO hay que sumarlos como " +
      "si fueran lo mismo: 'kash' = reclutar modelos para la agencia (comisión % sobre su OF; incluye las " +
      "ex-creadoras que vuelven), 'plataformas' = venderle un producto del portfolio a una creadora propia " +
      "(suscripción mensual), 'agencias' = B2B, venderle producto a una agencia externa. Si te preguntan por " +
      "'el pipeline' sin aclarar, la línea principal es kash. Trae también de qué BASE viene cada lead " +
      "(by_base): maven = entró por LeadGen/Contactos, ex_creadora = base EX MODELOS KASH, agencia = base de agencias.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    domain: "equipo",
    scope: "read",
    handler: async (_args, ctx) => {
      const { data, error } = await ctx.sb
        .from("closer_creators")
        .select("stage, monthly_monetization, deal_type, lead_source");
      if (error) throw new Error(`get_pipeline_overview: ${error.message}`);
      const rows = (data ?? []) as Array<{
        stage: string | null; monthly_monetization: number | null;
        deal_type: string | null; lead_source: string | null;
      }>;
      const byStage: Record<string, number> = {};
      const byLine: Record<string, Record<string, number>> = {};
      const byBase: Record<string, number> = {};
      let mrr = 0;
      for (const r of rows) {
        const s = r.stage || "Sin etapa";
        const base = r.lead_source || "maven";
        const line = base === "agencia"
          ? "agencias"
          : (r.deal_type === "venta_plataforma" ? "plataformas" : "kash");
        byStage[s] = (byStage[s] ?? 0) + 1;
        byBase[base] = (byBase[base] ?? 0) + 1;
        byLine[line] = byLine[line] ?? {};
        byLine[line][s] = (byLine[line][s] ?? 0) + 1;
        if (s === "Confirmada" || s === "Completada") mrr += Number(r.monthly_monetization ?? 0);
      }
      return {
        total: rows.length,
        by_stage: byStage,
        by_line: byLine,
        by_base: byBase,
        monthly_usd_confirmadas_completadas: Math.round(mrr),
        nota: "by_stage es el total mezclado; usá by_line para no sumar embudos distintos.",
      };
    },
  },
  {
    name: "get_hubstaff_activity",
    description:
      "Datos de Hubstaff (tiempo trabajado + % de actividad) de CUALQUIER persona del equipo registrada en Maven, " +
      "por rango de fechas. SIN `person` devuelve un ranking de TODO el equipo (horas, % actividad, días trabajados) " +
      "del rango, ordenado por horas; CON `person` devuelve esa persona + su desglose por día. Default: últimos 7 días. " +
      "Útil para '¿cuántas horas hizo X esta semana?', '¿quién trabajó menos?', 'horas del equipo este mes', " +
      "'¿quién está con baja actividad?'. Nota: no incluye screenshots (no se sincronizan).",
    input_schema: {
      type: "object",
      properties: {
        person: { type: "string", description: "nombre (o parte) de la persona; omitir para todo el equipo" },
        days: { type: "number", description: "últimos N días (default 7, máx 92). Ignorado si pasás from/to." },
        from: { type: "string", description: "fecha desde YYYY-MM-DD (opcional)" },
        to: { type: "string", description: "fecha hasta YYYY-MM-DD (opcional)" },
      },
      additionalProperties: false,
    },
    domain: "equipo",
    scope: "read",
    handler: async (args, ctx) => {
      const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
      const to = isDate(args.to) ? args.to : new Date().toISOString().slice(0, 10);
      let from: string;
      if (isDate(args.from)) {
        from = args.from;
      } else {
        const n = Math.min(Math.max(Number(args.days) || 7, 1), 92);
        const d = new Date(to + "T00:00:00Z");
        d.setUTCDate(d.getUTCDate() - (n - 1));
        from = d.toISOString().slice(0, 10);
      }
      const person = typeof args.person === "string" && args.person.trim() ? args.person.trim() : null;

      const { data, error } = await ctx.sb.rpc("hubstaff_activity_summary", { p_from: from, p_to: to, p_person: person });
      if (error) throw new Error(`get_hubstaff_activity: ${error.message}`);
      const rows = (data ?? []) as Array<Record<string, unknown>>;

      const result: Record<string, unknown> = {
        rango: { desde: from, hasta: to },
        personas: rows.length,
        equipo: rows.slice(0, 60).map((r) => ({
          nombre: r.name,
          rol: r.hubstaff_role,
          en_maven: r.mapped_to_maven,
          horas: r.total_hours,
          actividad_pct: r.avg_activity_pct,
          dias: r.days_worked,
          ultimo_dia: r.last_day,
        })),
      };

      // Desglose por día cuando se pide UNA persona y matcheó exactamente una.
      if (person && rows.length === 1) {
        const uid = String(rows[0].hubstaff_user_id);
        const { data: daily } = await ctx.sb
          .from("hubstaff_daily_data")
          .select("date, tracked_seconds, overall_activity, project_name")
          .eq("hubstaff_user_id", uid)
          .gte("date", from).lte("date", to)
          .order("date", { ascending: true });
        result.por_dia = ((daily ?? []) as Array<Record<string, unknown>>).map((d) => ({
          dia: d.date,
          horas: Math.round((Number(d.tracked_seconds) / 3600) * 100) / 100,
          actividad_pct: d.overall_activity,
          proyecto: d.project_name,
        }));
      }
      return result;
    },
  },
];
