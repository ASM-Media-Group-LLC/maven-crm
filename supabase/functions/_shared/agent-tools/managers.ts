// Dominio MANAGERS del catálogo de tools (lectura). Para el bot supervisor del grupo
// de managers: cruza promoción × ingreso y responde "¿por qué cae X?", "detalle de las
// de Fabi", "¿quién no está promocionando?".
import type { AgentTool } from "./types.ts";

export const managersTools: AgentTool[] = [
  {
    name: "get_manager_growth_feed",
    description:
      "Radar de crecimiento por creadora ACTIVA con manager: cruza promoción (Promolog mes a la fecha) × ingreso " +
      "(BLU, mes a la fecha vs mismo día del mes pasado) y devuelve solo las accionables con su cuadrante — 'critico' (no promociona + " +
      "ingreso cae), 'calidad' (promociona pero igual cae → revisar CÓMO promociona), 'riesgo' (promo baja, " +
      "ingreso aún ok). Incluye manager responsable, días de promo, ingreso del mes/mes pasado, % de tendencia y un " +
      "diagnóstico. Filtra por manager con 'manager_name' (ej. 'Fabiana'). Es la fuente para saber quién no crece. " +
      "⚠️ Mide SOLO promoción (Promolog) e ingreso (BLU) — NO sabe nada de contacto/mensajes. NUNCA infieras " +
      "'sin contacto' ni 'días sin que le escriban' a partir de que una creadora promociona poco: son cosas " +
      "distintas. Para contacto usa get_manager_contact_activity (cuántas contactó hoy) o " +
      "get_manager_silent_creators (quiénes llevan días sin contacto). " +
      "⚠️ Devuelve SOLO las creadoras EN ALERTA — NO es el roster: para totales y % por manager usa " +
      "get_manager_roster_stats. " +
      "⚠️ RED DE PROMO: cada fila trae 'promo_networks' (días de promo por red este mes, ej 'x:15d, telegram:11d') " +
      "e 'ig_has_data'. Si ig_has_data=false NO hay dato utilizable de Instagram este mes (historias sin leer o sin " +
      "IG) → está PROHIBIDO decirle que revise 'el formato/oferta de sus historias de IG' o culpar a IG por la " +
      "caída: nombra las redes reales de promo_networks y pide revisar la calidad AHÍ. Caso típico: creadoras cuyo " +
      "tráfico va por X/Telegram con link directo a OF.",
    input_schema: {
      type: "object",
      properties: {
        manager_name: { type: "string", description: "opcional: filtra a las creadoras de esa manager (ilike, ej 'Carolina', 'Fabi')" },
        quadrant: { type: "string", enum: ["critico", "calidad", "riesgo"], description: "opcional: filtra por cuadrante" },
      },
      additionalProperties: false,
    },
    domain: "managers",
    scope: "read",
    handler: async (args, ctx) => {
      const { data, error } = await ctx.sb.rpc("get_manager_growth_feed", { p_tenant: ctx.tenantId });
      if (error) throw new Error(`get_manager_growth_feed: ${error.message}`);
      const todas = (data ?? []) as Array<Record<string, unknown>>;

      // ── FEED VACÍO A INICIO DE MES ≠ "TODO BIEN" ──────────────────────────
      // El RPC exige covered_days >= 5 (días LEÍDOS del mes en curso, umbral
      // deliberado) → los primeros días de CADA mes ninguna creadora es evaluable
      // y el feed devuelve []. El bot leía ese [] como "sin alertas" y el lunes
      // 03/08 abrió la semana con "ninguna creadora está en caída — buena
      // noticia"... con Elizabeth Loaiza cayendo -75%. Es el mismo bug que #1095
      // arregló en alvaro_pulse; este es el camino del agente conversacional.
      if (todas.length === 0) {
        const diaBogota = new Date(Date.now() - 5 * 3600_000).getUTCDate();
        if (diaBogota <= 5) {
          // Mes recién arranca → VENTANA MÓVIL de 14 días (cruza el cambio de
          // mes). Pregunta de Jhon 04/08: "¿por qué esperar hasta el día 5?" —
          // ya no se espera: mismas señales, ventana honesta y etiquetada.
          const { data: rolling } = await ctx.sb.rpc("manager_promo_rolling14", { p_tenant: ctx.tenantId });
          return {
            alertas: [],
            radar_14d: rolling ?? null,
            nota:
              `El radar MENSUAL exige ≥5 días leídos y hoy es día ${diaBogota} — así que va la VENTANA MÓVIL de ` +
              "14 días (radar_14d, cruza el mes): tasa de promo sobre días LEÍDOS + ingreso 14d vs los 14 previos. " +
              "Úsala como radar de hoy y di la ventana. PROHIBIDO decir 'sin alertas' por el vacío mensual.",
          };
        }
      }

      let rows = todas;
      const mgr = String(args?.manager_name ?? "").trim().toLowerCase();
      if (mgr) rows = rows.filter((r) => String(r.manager_name ?? "").toLowerCase().includes(mgr));
      const q = String(args?.quadrant ?? "").trim().toLowerCase();
      if (q) rows = rows.filter((r) => String(r.quadrant ?? "") === q);
      return rows;
    },
  },
  {
    name: "get_creator_earnings",
    description:
      "Tendencia de INGRESO (BLU) de UNA creadora por nombre o @handle: bruto 7d vs 7d previos vs 30d, % de " +
      "cambio, serie diaria de los últimos 14 días y fans (activos/nuevos) más recientes. Úsalo para entender " +
      "'¿por qué cayó/subió el ingreso de X?' y ver cuándo empezó el cambio.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "nombre o @handle de la creadora" } },
      required: ["query"],
      additionalProperties: false,
    },
    domain: "managers",
    scope: "read",
    handler: async (args, ctx) => {
      const raw = String(args?.query ?? "").trim().replace(/^@+/, "");
      if (!raw) throw new Error("get_creator_earnings: pasa { query }");
      const like = `%${raw}%`;
      const { data: cands, error: cErr } = await ctx.sb
        .from("creators")
        .select("id, artistic_name, name, instagram_handle, status, assigned_manager_profile_id")
        .or(`artistic_name.ilike.${like},name.ilike.${like},instagram_handle.ilike.${like}`)
        .limit(5);
      if (cErr) throw new Error(`get_creator_earnings: ${cErr.message}`);
      if (!cands || !cands.length) return { found: false, query: raw };
      // preferir la activa si hay varias
      const c = cands.find((x) => x.status === "active") ?? cands[0];

      const { data: rows, error: eErr } = await ctx.sb
        .from("creator_daily_earnings")
        .select("date,total_gross,active_fans,new_fans")
        .eq("creator_id", c.id)
        .gte("date", new Date(Date.now() - 31 * 864e5).toISOString().slice(0, 10))
        .order("date", { ascending: false });
      if (eErr) throw new Error(`get_creator_earnings earnings: ${eErr.message}`);
      const es = (rows ?? []) as Array<{ date: string; total_gross: number; active_fans: number | null; new_fans: number | null }>;

      const today = new Date();
      const dayN = (n: number) => new Date(today.getTime() - n * 864e5).toISOString().slice(0, 10);
      const sumBetween = (from: number, to: number) =>
        es.filter((r) => r.date >= dayN(from) && r.date < dayN(to)).reduce((a, r) => a + (Number(r.total_gross) || 0), 0);
      const g7 = sumBetween(7, 0), gPrev7 = sumBetween(14, 7), g30 = es.reduce((a, r) => a + (Number(r.total_gross) || 0), 0);
      const latestFans = es.find((r) => r.active_fans != null);

      // ── ¿CORTE DE LECTURA? ────────────────────────────────────────────────
      // Cuando una creadora QUITA LOS ACCESOS (o sale), BLU deja de leer su cuenta
      // y escribe días en $0.00 LITERAL — indistinguibles de "no facturó nada" si
      // no conoces el evento. El 03/08 el bot le propuso a Carolina usar ese $0
      // como "palanca real" para la reunión de retención de Elizabeth: el promedio
      // previo era ~$1.100/día y los ceros eran solo que Maven ya no ve su BLU.
      // Jhon lo tuvo que corregir a mano.
      // El patrón es detectable: racha final de días en ~cero tras un promedio
      // claramente > 0. Se marca como POSIBLE (el bot pregunta/verifica), no se
      // afirma — una creadora chica puede tener días en cero legítimos.
      let rachaCero = 0;
      for (const r of es) {                     // es viene ordenado date DESC
        if ((Number(r.total_gross) || 0) < 5) rachaCero++;
        else break;
      }
      const previas = es.slice(rachaCero, rachaCero + 14);
      const promedioPrevio = previas.length
        ? previas.reduce((a, r) => a + (Number(r.total_gross) || 0), 0) / previas.length
        : 0;
      const posibleCorte = rachaCero >= 2 && promedioPrevio > 100;

      return {
        found: true,
        creator: { name: c.artistic_name || c.name, instagram_handle: c.instagram_handle, status: c.status },
        ...(posibleCorte ? {
          posible_corte_de_lectura: true,
          dias_en_cero: rachaCero,
          promedio_diario_previo: Math.round(promedioPrevio),
          nota_corte:
            `⚠️ Los últimos ${rachaCero} días están en ~$0 tras un promedio de $${Math.round(promedioPrevio)}/día. ` +
            "Ese patrón casi siempre es PÉRDIDA DE LECTURA de BLU (quitó accesos o salió), NO una caída real de " +
            "ventas. PROHIBIDO presentarlo como caída, tendencia o 'palanca' de negociación: di que desde esa fecha " +
            "no hay lectura y pregunta/verifica si quitó accesos. La tendencia real se mide hasta el último día CON lectura.",
        } : {}),
        income_7d: Math.round(g7),
        income_prev7d: Math.round(gPrev7),
        income_30d: Math.round(g30),
        trend_pct: gPrev7 > 0 ? Math.round(((g7 - gPrev7) / gPrev7) * 100) : null,
        active_fans: latestFans?.active_fans ?? null,
        new_fans_last: latestFans?.new_fans ?? null,
        daily_last14: es.filter((r) => r.date >= dayN(14)).map((r) => ({ date: r.date, gross: Math.round(Number(r.total_gross) || 0) })),
      };
    },
  },
  {
    name: "get_promo_month_comparison",
    description:
      "Compara los DÍAS DE PROMO del tramo del mes ACTUAL (día 1 → hoy) contra el MISMO TRAMO de un mes anterior " +
      "(por defecto el mes pasado), por creadora ACTIVA con manager. Úsala para 'promo de julio vs junio', " +
      "'¿quién bajó la promoción respecto al mes pasado?', comparaciones mes-contra-mes. El histórico SÍ existe " +
      "en el sistema. Filtra por manager con manager_name. months_back: 1 = mes pasado (default), 2 = el anterior, etc. " +
      "Devuelve, por creadora, días de promo del mes actual vs el previo + delta (negativo = bajó) + las fechas exactas " +
      "de cada tramo. Ordenado por mayor caída primero.",
    input_schema: {
      type: "object",
      properties: {
        manager_name: { type: "string", description: "opcional: filtra a las creadoras de esa manager (ilike, ej 'Carolina', 'Fabi')" },
        months_back: { type: "number", description: "cuántos meses atrás comparar (default 1 = mes pasado; 2 = antepasado)" },
      },
      additionalProperties: false,
    },
    domain: "managers",
    scope: "read",
    handler: async (args, ctx) => {
      const monthsBack = Math.max(1, Math.min(Number(args?.months_back ?? 1) || 1, 12));
      const mgr = String(args?.manager_name ?? "").trim() || null;
      const { data, error } = await ctx.sb.rpc("get_promo_month_comparison", {
        p_tenant: ctx.tenantId, p_months_back: monthsBack, p_manager_name: mgr,
      });
      if (error) throw new Error(`get_promo_month_comparison: ${error.message}`);
      return data ?? [];
    },
  },
  {
    name: "get_promo_day_breakdown",
    description:
      "Cuántas CREADORAS promocionaron en un DÍA (por defecto HOY, Bogotá), separado por manager. " +
      "⚠️ 'cuántas promociones' = cuántas CREADORAS promocionaron, NO cantidad de stories. Cuenta creadoras con " +
      "promo OF detectada ese día (promoted='true'); ignora las que solo tuvieron stories sin promo y las pendientes " +
      "de scan. Úsala para '¿cuántas promocionaron hoy?', 'separa las de Carolina y Fabiana', '¿quiénes promocionaron " +
      "el 14?' y también '¿CUÁLES FALTAN por promocionar?'. Pasa date (YYYY-MM-DD) para otro día y manager_name para " +
      "filtrar. Devuelve por manager: cuántas creadoras promocionaron + quiénes (con nº de stories de promo y redes), " +
      "y en faltan_por_manager las que NO: separadas en leidas_sin_promo (el scan las revisó, sin promo) y sin_leer " +
      "(el scan no llegó — de esas NO se puede decir que no promocionaron). " +
      "⚠️ MIRA SIEMPRE el bloque `cobertura` antes de responder: si scan_corrio=false / creadoras_leidas=0, el scan " +
      "de ese día TODAVÍA NO CORRIÓ — di eso, NO listes promos ni afirmes que nadie promocionó. Si la cobertura es " +
      "parcial, di explícitamente que faltan creadoras por escanear en vez de dar el número por cerrado, y nunca " +
      "digas 'sigue escaneando' si ultimo_scan es viejo.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "opcional: día en YYYY-MM-DD. Default = hoy (Bogotá)." },
        manager_name: { type: "string", description: "opcional: filtra a las creadoras de esa manager (ilike)" },
      },
      additionalProperties: false,
    },
    domain: "managers",
    scope: "read",
    handler: async (args, ctx) => {
      const date = String(args?.date ?? "").trim() || null;
      const mgr = String(args?.manager_name ?? "").trim() || null;
      const { data, error } = await ctx.sb.rpc("get_promo_day_breakdown", {
        p_tenant: ctx.tenantId, p_date: date, p_manager_name: mgr,
      });
      if (error) throw new Error(`get_promo_day_breakdown: ${error.message}`);
      const rows = (data ?? []) as Array<{
        manager_name: string | null; creadora: string | null; handle: string | null;
        cuentas: string | null; promo_stories: number; networks: string | null;
      }>;
      const byMgr = new Map<string, typeof rows>();
      for (const r of rows) {
        const k = r.manager_name ?? "(sin manager)";
        if (!byMgr.has(k)) byMgr.set(k, []);
        byMgr.get(k)!.push(r);
      }
      const por_manager = [...byMgr.entries()]
        .map(([manager, rs]) => ({
          manager,
          creadoras_promocionaron: rs.length,
          // `creadora` = nombre con el que la manager la conoce; `cuenta_donde_promocionó`
          // puede ser una secundaria (Moramay promociona desde @solamente_moramay aunque
          // su handle principal sea otro) — nombrar solo el principal confunde.
          creadoras: rs.map((r) => ({
            creadora: r.creadora,
            handle_principal: r.handle,
            cuenta_donde_promociono: r.cuentas,
            stories_promo: r.promo_stories,
            redes: r.networks,
          })),
        }))
        .sort((a, b) => b.creadoras_promocionaron - a.creadoras_promocionaron);

      // COBERTURA DEL SCAN DE ESE DÍA. Sin esto el bot no puede distinguir "nadie
      // promocionó" de "todavía no se escaneó a nadie", y presenta lo que haya como si
      // fuera el estado de hoy. El 31/07 a las 10:38 le listó a Fabiana 5 creadoras que
      // "ya promocionaron hoy" — eran del scan de anoche, y el de hoy arrancó 11:15.
      const diaBog = date ?? new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
      const { data: cov } = await ctx.sb
        .from("promolog_entries")
        .select("creator_id, promoted, created_at")
        .eq("tenant_id", ctx.tenantId)
        .eq("dia", diaBog);
      const covRows = (cov ?? []) as Array<{ creator_id: string | null; promoted: string | null; created_at: string }>;
      const leidas = new Set(
        covRows.filter((r) => r.promoted !== "pending" && r.creator_id).map((r) => r.creator_id),
      ).size;
      const ultimoScan = covRows.length
        ? new Date(Math.max(...covRows.map((r) => Date.parse(r.created_at))) - 5 * 3600_000)
          .toISOString().slice(5, 16).replace("T", " ")
        : null;

      // QUIÉNES FALTAN, en la misma llamada. "¿Cuáles de mis creadoras faltan?"
      // (Fabiana, 04/08) no era respondible con solo la lista de las que SÍ —
      // y una segunda tool para el complemento gasta presupuesto que no hay.
      const { data: faltData } = await ctx.sb.rpc("get_promo_day_faltantes", {
        p_tenant: ctx.tenantId, p_date: date, p_manager_name: mgr,
      });
      const faltan = new Map<string, { leidas_sin_promo: string[]; sin_leer: string[] }>();
      for (const f of (faltData ?? []) as Array<{ manager_name: string | null; creadora: string; estado: string }>) {
        const k = f.manager_name ?? "(sin manager)";
        if (!faltan.has(k)) faltan.set(k, { leidas_sin_promo: [], sin_leer: [] });
        faltan.get(k)![f.estado === "leida_sin_promo" ? "leidas_sin_promo" : "sin_leer"].push(f.creadora);
      }
      const faltan_por_manager = [...faltan.entries()].map(([manager, f]) => ({
        manager,
        leidas_sin_promo: f.leidas_sin_promo,
        sin_leer: f.sin_leer,
      }));

      return {
        total_creadoras_promocionaron: rows.length,
        por_manager,
        faltan_por_manager,
        cobertura: {
          dia: diaBog,
          creadoras_leidas: leidas,
          ultimo_scan: ultimoScan,
          scan_corrio: leidas > 0,
        },
        nota: leidas === 0
          ? "⚠️ EL SCAN DE ESE DÍA TODAVÍA NO LEYÓ A NADIE (creadoras_leidas=0). NO digas que nadie promocionó ni listes promos de 'hoy': lo correcto es decir que el scan aún no corrió y que todavía no hay datos del día."
          : "Cuenta CREADORAS con promo OF detectada (promoted=true), no cantidad de stories. Cobertura: se leyeron " +
            `${leidas} creadoras hasta el último scan (${ultimoScan}). Si la cobertura es baja, aclara que el reporte es PARCIAL en vez de darlo por cerrado. ` +
            "En faltan_por_manager: 'leidas_sin_promo' = el scan las revisó y NO tenían promo (eso sí se dice); " +
            "'sin_leer' = el scan AÚN no las revisó — de esas NUNCA digas que no promocionaron, di que faltan por escanear.",
      };
    },
  },
  {
    name: "get_manager_contact_activity",
    description:
      "Cuántos CONTACTOS hizo cada manager por WhatsApp en un día (default HOY, Bogotá): creadoras DISTINTAS a las " +
      "que se les escribió por la línea del equipo de Managers, separado por manager. ⚠️ La línea es COMPARTIDA (un " +
      "solo número), así que la atribución NO es por quién tipeó: es por la cuenta Kash de la creadora — Kash PLUS = " +
      "Carolina, Kash MASSIVE = Fabiana (creator_business.kash_type, viene de BLU; fallback: manager asignada en el " +
      "perfil). Cuenta solo mensajes SALIENTES (desde Maven o desde el teléfono/WA Web capturados como externos); los " +
      "fallidos no cuentan. Devuelve por manager: cuántas creadoras contactó + quiénes (con mensajes por creadora); y " +
      "aparte los contactos de la línea NO vinculados a una creadora (sin_atribuir). Pasa date (YYYY-MM-DD) para otro " +
      "día y manager_name para filtrar. Úsala para '¿cuántos contactos hizo hoy Carolina y Fabiana?'.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "opcional: día en YYYY-MM-DD. Default = hoy (Bogotá)." },
        manager_name: { type: "string", description: "opcional: filtra por manager (ilike, ej 'Carolina', 'Fabi')" },
      },
      additionalProperties: false,
    },
    domain: "managers",
    scope: "read",
    handler: async (args, ctx) => {
      const dateArg = String(args?.date ?? "").trim();
      // Hoy en Bogotá (UTC-5 fijo, sin DST).
      const day = /^\d{4}-\d{2}-\d{2}$/.test(dateArg)
        ? dateArg
        : new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
      const startIso = `${day}T00:00:00-05:00`;
      const endIso = new Date(Date.parse(startIso) + 24 * 3600e3).toISOString();

      // 1) Línea(s) del departamento de managers.
      const { data: chans, error: chErr } = await ctx.sb
        .from("wa_channels").select("id, label")
        .eq("department", "manager").eq("active", true);
      if (chErr) throw new Error(`get_manager_contact_activity: ${chErr.message}`);
      if (!chans?.length) return { found: false, reason: "sin_lineas_de_managers" };

      const { data: convs, error: cvErr } = await ctx.sb
        .from("wa_conversations").select("id, contact_id")
        .in("channel_id", (chans as Array<{ id: string }>).map((c) => c.id))
        .limit(1000);
      if (cvErr) throw new Error(`get_manager_contact_activity: ${cvErr.message}`);
      if (!convs?.length) {
        return { found: true, fecha: day, total_creadoras_contactadas: 0, por_manager: [], nota: "La línea de managers no tiene conversaciones registradas todavía." };
      }

      // 2) Salientes del día (Maven + externos). Los failed no cuentan como contacto.
      const { data: msgs, error: msgErr } = await ctx.sb
        .from("wa_conversation_messages")
        .select("conversation_id, source, status, sent_at")
        .in("conversation_id", (convs as Array<{ id: string }>).map((c) => c.id))
        .eq("direction", "out").is("deleted_at", null)
        .gte("sent_at", startIso).lt("sent_at", endIso)
        .limit(5000);
      if (msgErr) throw new Error(`get_manager_contact_activity: ${msgErr.message}`);
      const sent = ((msgs ?? []) as Array<{ conversation_id: string; source: string | null; status: string | null; sent_at: string }>)
        .filter((m) => m.status !== "failed");
      if (!sent.length) {
        return {
          found: true, fecha: day, total_creadoras_contactadas: 0, por_manager: [],
          nota: `Sin mensajes salientes el ${day} en la línea de managers. OJO: la línea se conectó a Maven el 2026-07-16 — antes de esa fecha no hay historial.`,
        };
      }

      // 3) Agregar por contacto.
      const convContact = new Map((convs as Array<{ id: string; contact_id: string | null }>).map((c) => [c.id, c.contact_id]));
      const perContact = new Map<string, { mensajes: number; maven: number; externos: number; ultimo: string }>();
      for (const m of sent) {
        const ctId = convContact.get(m.conversation_id);
        if (!ctId) continue;
        const agg = perContact.get(ctId) ?? { mensajes: 0, maven: 0, externos: 0, ultimo: m.sent_at };
        agg.mensajes++;
        if (m.source === "external") agg.externos++; else agg.maven++;
        if (m.sent_at > agg.ultimo) agg.ultimo = m.sent_at;
        perContact.set(ctId, agg);
      }

      const { data: cts } = await ctx.sb
        .from("wa_contacts")
        .select("id, phone_e164, manual_name, resolved_name, display_name")
        .in("id", [...perContact.keys()]);

      // 4) Match contacto→creadora. Clave robusta a variantes de formato: canonicalizamos
      // el teléfono (arregla el 9º dígito de Brasil y el "1" móvil de México; MISMA lógica
      // que la función SQL public.canonical_phone) y comparamos por últimos 10 díg. Fallback
      // por últimos 8 díg SOLO si hay UNA única creadora candidata (anti-colisión), para
      // números guardados sin código de país (ej. Chile bare).
      const onlyDigits = (s: unknown) => String(s ?? "").replace(/\D/g, "");
      const canon = (s: unknown) => {
        const d = onlyDigits(s);
        if (d.length === 13 && d.startsWith("521")) return "52" + d.slice(3); // MX móvil legacy 521 → 52
        if (d.length === 13 && d.startsWith("55") && d[4] === "9") return d.slice(0, 4) + d.slice(5); // BR 9º dígito
        return d;
      };
      const k10 = (s: unknown) => { const c = canon(s); return c.length >= 10 ? c.slice(-10) : ""; };
      const k8 = (s: unknown) => { const d = onlyDigits(s); return d.length >= 8 ? d.slice(-8) : ""; };
      const { data: creators } = await ctx.sb
        .from("creators")
        .select("id, name, artistic_name, instagram_handle, phone_e164, whatsapp_number, phone, assigned_manager_profile_id")
        .eq("status", "active");
      type CreatorRow = { id: string; name: string | null; artistic_name: string | null; instagram_handle: string | null; phone_e164: string | null; whatsapp_number: string | null; phone: string | null; assigned_manager_profile_id: string | null };
      const creatorByK10 = new Map<string, CreatorRow>();
      const k8ToCreatorIds = new Map<string, Set<string>>();
      const k8ToCreator = new Map<string, CreatorRow>();
      for (const cr of (creators ?? []) as CreatorRow[]) {
        const raw = cr.phone_e164 || cr.whatsapp_number || cr.phone;
        const key = k10(raw);
        if (key) {
          const prev = creatorByK10.get(key);
          if (!prev || (!prev.assigned_manager_profile_id && cr.assigned_manager_profile_id)) creatorByK10.set(key, cr);
        }
        const k8k = k8(raw);
        if (k8k) {
          if (!k8ToCreatorIds.has(k8k)) k8ToCreatorIds.set(k8k, new Set());
          k8ToCreatorIds.get(k8k)!.add(cr.id);
          k8ToCreator.set(k8k, cr);
        }
      }
      // canonical primero; si no matchea, últimos-8 SOLO si esa cola pertenece a UNA sola creadora.
      const matchCreator = (rawPhone: unknown): CreatorRow | undefined => {
        const byK10 = creatorByK10.get(k10(rawPhone));
        if (byK10) return byK10;
        const k8k = k8(rawPhone);
        if (k8k && k8ToCreatorIds.get(k8k)?.size === 1) return k8ToCreator.get(k8k);
        return undefined;
      };

      // 5) Atribución por manager: la línea es COMPARTIDA → se atribuye por la cuenta
      // Kash de la creadora (creator_business.kash_type, viene de BLU): Plus=Carolina,
      // Massive=Fabiana. Fallback: manager asignada en el perfil (profiles.full_name).
      const creatorIds = [...new Set(((creators ?? []) as CreatorRow[]).map((c) => c.id))];
      const kashByCreator = new Map<string, string>();
      if (creatorIds.length) {
        const { data: biz } = await ctx.sb
          .from("creator_business").select("creator_id, kash_type").in("creator_id", creatorIds);
        for (const b of (biz ?? []) as Array<{ creator_id: string; kash_type: string | null }>) {
          if (b.kash_type) kashByCreator.set(b.creator_id, b.kash_type);
        }
      }
      const KASH_MANAGER: Record<string, string> = { Plus: "Carolina (Kash Plus)", Massive: "Fabiana (Kash Massive)" };
      const mgrIds = [...new Set(((creators ?? []) as CreatorRow[]).map((c) => c.assigned_manager_profile_id).filter((x): x is string => Boolean(x)))];
      const mgrName = new Map<string, string>();
      if (mgrIds.length) {
        const { data: profs } = await ctx.sb.from("profiles").select("id, full_name").in("id", mgrIds);
        for (const p of (profs ?? []) as Array<{ id: string; full_name: string | null }>) mgrName.set(p.id, p.full_name ?? "?");
      }
      // El fallback por perfil debe caer en el MISMO bucket que el de kash_type (si no,
      // "Fabiana Durán" y "Fabiana (Kash Massive)" salen como dos grupos distintos).
      const groupLabel = (fullName: string): string => {
        const first = fullName.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
        if (first === "carolina") return KASH_MANAGER.Plus;
        if (first === "fabiana") return KASH_MANAGER.Massive;
        return fullName;
      };

      const byMgr = new Map<string, Array<{ creadora: string; instagram: string | null; mensajes: number; desde_maven: number; desde_telefono: number; ultimo_mensaje: string }>>();
      const sinAtribuir: Array<{ contacto: string; mensajes: number }> = [];
      let totalMsgs = 0;
      for (const ct of (cts ?? []) as Array<{ id: string; phone_e164: string | null; manual_name: string | null; resolved_name: string | null; display_name: string | null }>) {
        const agg = perContact.get(ct.id);
        if (!agg) continue;
        totalMsgs += agg.mensajes;
        const cr = matchCreator(ct.phone_e164);
        if (cr) {
          const kash = kashByCreator.get(cr.id);
          const grupo = (kash && KASH_MANAGER[kash])
            || (cr.assigned_manager_profile_id ? groupLabel(mgrName.get(cr.assigned_manager_profile_id) ?? "(manager desconocida)") : "(sin manager)");
          if (!byMgr.has(grupo)) byMgr.set(grupo, []);
          byMgr.get(grupo)!.push({
            creadora: cr.artistic_name || cr.name || "(sin nombre)",
            instagram: cr.instagram_handle,
            mensajes: agg.mensajes,
            desde_maven: agg.maven,
            desde_telefono: agg.externos,
            ultimo_mensaje: agg.ultimo,
          });
        } else {
          sinAtribuir.push({ contacto: ct.manual_name || ct.resolved_name || ct.display_name || "(sin nombre)", mensajes: agg.mensajes });
        }
      }

      let porManager = [...byMgr.entries()]
        .map(([manager, rows]) => ({
          manager,
          creadoras_contactadas: rows.length,
          mensajes: rows.reduce((a, r) => a + r.mensajes, 0),
          creadoras: rows.sort((a, b) => b.mensajes - a.mensajes),
        }))
        .sort((a, b) => b.creadoras_contactadas - a.creadoras_contactadas);
      const filtro = String(args?.manager_name ?? "").trim().toLowerCase();
      if (filtro) porManager = porManager.filter((g) => g.manager.toLowerCase().includes(filtro));

      return {
        found: true,
        fecha: day,
        lineas: (chans as Array<{ label: string | null }>).map((c) => c.label).filter(Boolean),
        total_creadoras_contactadas: porManager.reduce((a, g) => a + g.creadoras_contactadas, 0),
        total_mensajes_salientes: totalMsgs,
        por_manager: porManager,
        sin_atribuir: { contactos: sinAtribuir.length, detalle: sinAtribuir.sort((a, b) => b.mensajes - a.mensajes) },
        nota: "Contacto = creadora DISTINTA con ≥1 mensaje saliente ese día por la línea de Managers (Maven + teléfono/externos; fallidos no cuentan). " +
          "Atribución por cuenta Kash de la creadora (Plus=Carolina, Massive=Fabiana; la línea es compartida, no se sabe quién tipeó). " +
          "La línea se conectó a Maven el 2026-07-16: días anteriores no tienen historial.",
      };
    },
  },
  {
    name: "get_manager_silent_creators",
    description:
      "LISTA de creadoras que una manager NO ha contactado hace varios días (o sin registro), por la " +
      "línea de WhatsApp del equipo de Managers. Es LA fuente para '¿a quién no ha contactado " +
      "Carolina/Fabiana?', '¿quiénes llevan 3+ días sin contacto?', '¿cuántas tiene abandonadas?'. " +
      "Complementa get_manager_contact_activity (que cuenta cuántas contactó HOY). Devuelve por " +
      "manager: cuántas creadoras silenciosas + la lista (nombre, IG, días sin contacto, último " +
      "contacto); dias_sin_contacto='sin registro' = ningún saliente por la línea de Managers en el historial " +
      "visible (NO prueba abandono: pudo contactarla por otra línea o antes del 16/07). Matching por teléfono robusto " +
      "(últimos 10 dígitos, sirve para México 521/52); atribución por manager asignada (alineada con " +
      "la cuenta Kash: Plus=Carolina, Massive=Fabiana). Pasa silent_days para cambiar el umbral " +
      "(default 3) y manager_name para filtrar. ⚠️ NUNCA respondas esto de memoria ni lo deduzcas de " +
      "get_manager_growth_feed (promo ≠ contacto): llama a ESTA tool. CAVEAT: solo cuenta las líneas " +
      "'manager'; si contactan desde otra línea, no se ve.",
    input_schema: {
      type: "object",
      properties: {
        manager_name: { type: "string", description: "opcional: filtra por manager (ilike, ej 'Carolina', 'Fabi')" },
        silent_days: { type: "number", description: "opcional: umbral de días sin contacto (default 3)" },
      },
      additionalProperties: false,
    },
    domain: "managers",
    scope: "read",
    handler: async (args, ctx) => {
      const nRaw = Number(args?.silent_days);
      const silentDays = Number.isFinite(nRaw) && nRaw > 0 ? Math.floor(nRaw) : 3;
      const { data, error } = await ctx.sb.rpc("get_manager_silent_creators", {
        p_tenant: ctx.tenantId,
        p_days: silentDays,
      });
      if (error) throw new Error(`get_manager_silent_creators: ${error.message}`);
      let rows = (data ?? []) as Array<{
        name: string | null;
        instagram_handle: string | null;
        manager_name: string | null;
        last_contact_at: string | null;
        days_since_contact: number | null;
      }>;
      const filtro = String(args?.manager_name ?? "").trim().toLowerCase();
      if (filtro) rows = rows.filter((r) => String(r.manager_name ?? "").toLowerCase().includes(filtro));

      const byMgr = new Map<
        string,
        Array<{ creadora: string; instagram: string | null; dias_sin_contacto: number | string; ultimo_contacto: string | null }>
      >();
      for (const r of rows) {
        const grupo = r.manager_name ?? "(sin manager)";
        if (!byMgr.has(grupo)) byMgr.set(grupo, []);
        byMgr.get(grupo)!.push({
          creadora: r.name ?? "(sin nombre)",
          instagram: r.instagram_handle,
          dias_sin_contacto: r.days_since_contact ?? "sin registro",
          ultimo_contacto: r.last_contact_at,
        });
      }
      const rank = (v: number | string) => (typeof v === "number" ? v : Number.MAX_SAFE_INTEGER);
      const por_manager = [...byMgr.entries()]
        .map(([manager, creadoras]) => ({
          manager,
          silenciosas: creadoras.length,
          creadoras: creadoras.sort((a, b) => rank(b.dias_sin_contacto) - rank(a.dias_sin_contacto)),
        }))
        .sort((a, b) => b.silenciosas - a.silenciosas);

      return {
        umbral_dias: silentDays,
        total_silenciosas: rows.length,
        por_manager,
        nota:
          `Silenciosa = creadora ACTIVA sin ningún saliente por la línea de Managers en los últimos ${silentDays} días. ` +
          "dias_sin_contacto='sin registro' = ningún saliente por la línea de Managers en el historial visible (desde el " +
          "2026-07-16); NO prueba abandono: pudo ser contactada por OTRA línea (p.ej. un closer) o antes de esa fecha. " +
          "Solo mira las líneas del departamento 'manager'. Cobertura PARCIAL: no evalúa creadoras sin teléfono normalizable " +
          "ni sin manager asignada, así que la lista no es exhaustiva.",
      };
    },
  },
  {
    name: "get_manager_roster_stats",
    description:
      "EL TOTAL de creadoras que tiene cada manager (el DENOMINADOR) + cuántas promocionaron y cuántas " +
      "contactó ese día, con sus PORCENTAJES ya calculados. Es LA tool para '¿en % cómo va cada manager?', " +
      "'¿cuántas de sus modelos promocionaron sobre el total?', '¿cuántas creadoras tiene Carolina/Fabiana?'. " +
      "⚠️ NUNCA pidas al equipo que te confirme cuántas creadoras tiene cada una, ni digas que no tienes el " +
      "total: SIEMPRE está acá (roster = creadoras ACTIVAS por manager asignada, alineado con la cuenta Kash: " +
      "Plus=Carolina, Massive=Fabiana). Tampoco lo deduzcas de get_manager_growth_feed: ese SOLO devuelve las " +
      "creadoras EN ALERTA, no el roster completo. Pasa 'date' (YYYY-MM-DD) para otro día (ej. ayer); default hoy. " +
      "Campos: total_active (denominador), promoted_count/promoted_pct, contacted_count/contacted_pct y " +
      "covered_count = a cuántas Promolog logró LEER ese día. Si covered_count < total_active, aclaralo al dar " +
      "el %: las no leídas no son 'no promocionó' (ver #818). Incluye una fila manager_name=null con las activas " +
      "SIN manager asignada — mencionala si es >0 en vez de ignorarla.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "opcional: día YYYY-MM-DD (default hoy, zona Bogotá)" },
        manager_name: { type: "string", description: "opcional: filtra por manager (ilike, ej 'Carolina', 'Fabi')" },
      },
      additionalProperties: false,
    },
    domain: "managers",
    scope: "read",
    handler: async (args, ctx) => {
      const raw = String(args?.date ?? "").trim();
      const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
      const { data, error } = await ctx.sb.rpc("get_manager_roster_stats", {
        p_tenant: ctx.tenantId,
        ...(date ? { p_date: date } : {}),
      });
      if (error) throw new Error(`get_manager_roster_stats: ${error.message}`);
      let rows = (data ?? []) as Array<Record<string, unknown>>;
      const filtro = String(args?.manager_name ?? "").trim().toLowerCase();
      if (filtro) rows = rows.filter((r) => String(r.manager_name ?? "").toLowerCase().includes(filtro));
      return {
        dia: date ?? "hoy",
        por_manager: rows,
        nota:
          "total_active = creadoras ACTIVAS con esa manager asignada; promoted_pct va sobre total_active. " +
          "⚠️ is_partial_day=true ⇒ el día está EN CURSO y la mayor parte de la promo se detecta por la tarde: " +
          "ese % es un PISO, NO sirve para comparar managers. Para comparar usa el día CERRADO (pasa date=ayer) y decilo. " +
          "covered_count = a cuántas Promolog pudo LEER ese día (las no leídas NO son 'no promocionó', ver #818). " +
          "scannable_count = cuántas tienen handle escaneable: las que no tienen NUNCA pueden contar como que " +
          "promocionaron, así que si scannable_count < total_active el techo de esa manager es menor a 100% " +
          "(hay que cargarles el handle). contacted_pct va sobre reachable_count (con teléfono usable), no sobre el total. " +
          "⚠️ contacted_* mide a cuántas creadoras DE ESA MANAGER les escribió alguien por la línea de Managers — " +
          "la línea es COMPARTIDA por las dos managers y los salientes NO traen autor, así que NO es prueba de que " +
          "la contactó ELLA; y si escribe desde su teléfono personal no se registra. Solo hay historial desde el " +
          "2026-07-16 (cuando se conectó la línea): para fechas anteriores contacted_count=0 significa SIN DATO.",
      };
    },
  },
];
