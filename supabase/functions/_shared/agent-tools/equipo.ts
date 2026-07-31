// Dominio EQUIPO / pipeline de closers del catálogo (lectura).
import type { AgentTool } from "./types.ts";

// Frescura del feed en vivo de Hubstaff. hubstaff_activities llega en FRANJAS
// FIJAS de 10 minutos (verificado 31/07: 862/862 pings del día en frontera de
// 10 min, tracked_seconds máx 600) y el poll del bridge (LIVE_EVERY_MIN) suma
// 2-5 min de lag → el peor caso NORMAL son ~12-15 min sin pings nuevos con todo
// sano. 30 min = margen 2x: por debajo NO se puede afirmar que el tracker está
// caído; por encima el feed está stale y el bot tiene que DECIRLO en vez de
// reportar 0h (incidente 31/07 11:15: "Brayan 0h" con Brayan trabajando desde
// las 08:50). La frescura se mide SOLO contra max(starts_at) vs now(): la tabla
// no tiene created_at (el lag de ingesta no es observable desde la base) y
// hubstaff_config.last_sync_at se refresca aunque el daily esté congelado (luz
// verde falsa). Tampoco medirla por el espaciado entre starts_at.
const HUBSTAFF_FEED_STALE_MIN = 30;
// Espera máxima del refresh on-demand (cola hubstaff_sync_requests, la consume
// el bridge). El agente tiene 30s de pared: 12s dejan margen para el resto de
// la corrida. Si no llega a tiempo, se responde igual con el feed actual.
const HUBSTAFF_REFRESH_WAIT_MS = 12_000;

const horaBogota = (ts: string | null): string | null =>
  ts ? new Date(Date.parse(ts) - 5 * 3600_000).toISOString().slice(11, 16) : null;

// "4.13" horas decimales se leen como "4h13m" y son 4h08m — dar el formato hecho.
const horasHM = (secs: number): string => `${Math.floor(secs / 3600)}h${String(Math.round((secs % 3600) / 60)).padStart(2, "0")}m`;

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
      "'¿quién está con baja actividad?'. Nota: no incluye screenshots (no se sincronizan). " +
      "⚠️ PARA HOY: usá EXCLUSIVAMENTE el bloque `hoy_en_vivo` de la respuesta (feed de a 10 min, refrescado cada " +
      "2-5 min); el agregado diario de HOY puede venir hasta 6h atrasado y hacía reportar '0h' de gente trabajando. " +
      "Cada persona de hoy trae `estado`: 'ficho_hoy' (horas reales al último ping), 'sin_fichar_hoy' (el feed está " +
      "vivo y NO tiene ni un minuto — solo esto es 'no arrancó'), o 'sin_dato_feed_stale' (el tracker no reporta: " +
      "PROHIBIDO decir 0h, decí desde qué hora no hay datos). Hay NOMBRES REPETIDOS en el equipo (tres 'Brayan'): " +
      "identificá siempre por nombre COMPLETO + rol de la respuesta, nunca adivines quién es quién. " +
      "La tool puede tardar ~12s extra cuando pide refresh en vivo al bridge.",
    input_schema: {
      type: "object",
      properties: {
        person: { type: "string", description: "nombre (o parte) de la persona; omitir para todo el equipo" },
        days: { type: "number", description: "últimos N días (default 7, máx 92). Ignorado si pasas from/to." },
        from: { type: "string", description: "fecha desde YYYY-MM-DD (opcional)" },
        to: { type: "string", description: "fecha hasta YYYY-MM-DD (opcional)" },
      },
      additionalProperties: false,
    },
    domain: "equipo",
    scope: "read",
    handler: async (args, ctx) => {
      const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
      // "Hoy" es SIEMPRE hoy Bogotá: con el default UTC, de 19:00 a 24:00 Bogotá
      // el rango terminaba "mañana" y el día en curso quedaba fuera del resumen.
      const hoyBog = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
      const to = isDate(args.to) ? args.to : hoyBog;
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
          ...(d.date === hoyBog ? { parcial: "agregado de HOY, puede venir hasta 6h atrasado — usá hoy_en_vivo" } : {}),
        }));
      }

      // ── DÍA EN CURSO desde hubstaff_activities (capa en vivo) ────────────
      // El agregado diario lo escribe runOnce() cada 6h: a media mañana faltan
      // filas y el bot leía esa AUSENCIA como "0h" (incidente 31/07 con Álvaro
      // decidiendo sobre datos falsos). La RPC hubstaff_live_today parte de
      // hubstaff_members, así el que no fichó aparece EXPLÍCITO con 0s.
      if (to >= hoyBog) {
        // Refresh on-demand best-effort: encolar y esperar corto. Si el bridge
        // no lo consume, se responde igual con el feed actual y se dice.
        const refresh: Record<string, unknown> = { pedido: false };
        try {
          const { data: reqRow } = await ctx.sb
            .from("hubstaff_sync_requests")
            .insert({ requested_by: "whatsapp-agent:get_hubstaff_activity" })
            .select("id")
            .single();
          if (reqRow?.id != null) {
            refresh.pedido = true;
            const deadline = Date.now() + HUBSTAFF_REFRESH_WAIT_MS;
            let estado = "pending";
            while (Date.now() < deadline) {
              await new Promise((r) => setTimeout(r, 2_000));
              const { data: st } = await ctx.sb
                .from("hubstaff_sync_requests").select("status").eq("id", reqRow.id).maybeSingle();
              estado = String(st?.status ?? estado);
              if (estado === "done" || estado === "error" || estado === "expired") break;
            }
            refresh.aplicado = estado === "done";
            refresh.estado = estado;
            if (estado === "pending" || estado === "running") {
              refresh.nota = "el bridge no alcanzó a refrescar en la espera; los datos en vivo igual tienen a lo sumo unos minutos";
            }
          }
        } catch { /* best-effort: sin refresh también hay respuesta */ }

        const { data: live, error: liveErr } = await ctx.sb.rpc("hubstaff_live_today", { p_person: person });
        if (liveErr) {
          result.hoy_en_vivo = { error: `hubstaff_live_today: ${liveErr.message}` };
        } else {
          const liveRows = (live ?? []) as Array<Record<string, unknown>>;
          // feed_last_ping viene en cada fila; si el filtro por persona no
          // matcheó a nadie, buscarlo aparte para poder juzgar frescura igual.
          let feedLast = liveRows.length ? String(liveRows[0].feed_last_ping ?? "") : "";
          if (!feedLast) {
            const { data: f } = await ctx.sb
              .from("hubstaff_activities").select("starts_at")
              .order("starts_at", { ascending: false }).limit(1).maybeSingle();
            feedLast = String(f?.starts_at ?? "");
          }
          const feedAgeMin = feedLast ? Math.round((Date.now() - Date.parse(feedLast)) / 60_000) : null;
          const feedStale = feedAgeMin === null || feedAgeMin > HUBSTAFF_FEED_STALE_MIN;

          result.hoy_en_vivo = {
            fecha: hoyBog,
            fuente: "hubstaff_activities — franjas fijas de 10 min, poll del bridge cada 2-5 min",
            feed_actualizado_hasta: horaBogota(feedLast || null),
            feed_edad_min: feedAgeMin,
            feed_stale: feedStale,
            refresh_on_demand: refresh,
            personas: liveRows.slice(0, 60).map((r) => ({
              nombre: r.name,
              nombre_en_maven: r.full_name_maven ?? null,
              rol: r.hubstaff_role,
              en_maven: r.mapped_to_maven,
              horas_hoy: Number(r.hours_today),
              // El modelo leía "4.13" horas como "4h13" (son 4h08m) — citar SIEMPRE este campo.
              horas_hoy_fmt: horasHM(Number(r.seconds_today)),
              arranco: horaBogota(r.first_ping ? String(r.first_ping) : null),
              ultimo_ping: horaBogota(r.last_ping ? String(r.last_ping) : null),
              actividad_pct: r.activity_pct,
              estado: Number(r.seconds_today) > 0
                ? "ficho_hoy"
                : (feedStale ? "sin_dato_feed_stale" : "sin_fichar_hoy"),
            })),
            nota: feedStale
              ? `⚠️ EL FEED EN VIVO ESTÁ VIEJO: último ping ${horaBogota(feedLast || null) ?? "desconocido"} (hace ${feedAgeMin ?? "?"} min; umbral ${HUBSTAFF_FEED_STALE_MIN}). ` +
                "El puente de Hubstaff está caído o atrasado. PROHIBIDO afirmar '0h' o 'no arrancó' de NADIE: " +
                "decí explícito que el tracker no reporta desde esa hora y que esto es lo último que se sabe."
              : "Estados: ficho_hoy = horas REALES al último ping · sin_fichar_hoy = el feed está vivo y esta persona " +
                "no registra NI UN slot hoy (esto sí es 'no fichó') · el agregado diario de hoy atrasa hasta 6h, usá este bloque. " +
                "Citá horas con horas_hoy_fmt (4.13 horas NO son '4h13'). " +
                "Nombres repetidos (hay tres 'Brayan'): identificá por nombre completo + nombre_en_maven, no adivines.",
          };
        }
      }
      return result;
    },
  },
];
