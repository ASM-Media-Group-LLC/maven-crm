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
      "diagnóstico. Filtrá por manager con 'manager_name' (ej. 'Fabiana'). Es la fuente para saber quién no crece.",
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
      let rows = (data ?? []) as Array<Record<string, unknown>>;
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
      if (!raw) throw new Error("get_creator_earnings: pasá { query }");
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

      return {
        found: true,
        creator: { name: c.artistic_name || c.name, instagram_handle: c.instagram_handle, status: c.status },
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
      "en el sistema. Filtrá por manager con manager_name. months_back: 1 = mes pasado (default), 2 = el anterior, etc. " +
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
      "de scan. Úsala para '¿cuántas promocionaron hoy?', 'separá las de Carolina y Fabiana', '¿quiénes promocionaron " +
      "el 14?'. Pasá date (YYYY-MM-DD) para otro día y manager_name para filtrar. Devuelve por manager: cuántas " +
      "creadoras promocionaron + quiénes (con nº de stories de promo y redes). Nota: refleja lo scaneado hasta el " +
      "momento — el promolog scanea a lo largo del día, así que a media jornada puede faltar gente por scanear.",
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
      const rows = (data ?? []) as Array<{ manager_name: string | null; handle: string | null; promo_stories: number; networks: string | null }>;
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
          creadoras: rs.map((r) => ({ handle: r.handle, stories_promo: r.promo_stories, redes: r.networks })),
        }))
        .sort((a, b) => b.creadoras_promocionaron - a.creadoras_promocionaron);
      return {
        total_creadoras_promocionaron: rows.length,
        por_manager,
        nota: "Cuenta CREADORAS con promo OF detectada (promoted=true), no cantidad de stories. Refleja lo scaneado hasta ahora (el promolog corre a lo largo del día).",
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
      "aparte los contactos de la línea NO vinculados a una creadora (sin_atribuir). Pasá date (YYYY-MM-DD) para otro " +
      "día y manager_name para filtrar. Usala para '¿cuántos contactos hizo hoy Carolina y Fabiana?'.",
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

      // 4) Match contacto→creadora por últimos 10 dígitos (los tel. de Maven vienen sucios).
      const d10 = (s: unknown) => {
        const d = String(s ?? "").replace(/\D/g, "");
        return d.length >= 10 ? d.slice(-10) : "";
      };
      const { data: creators } = await ctx.sb
        .from("creators")
        .select("id, name, artistic_name, instagram_handle, phone_e164, whatsapp_number, phone, assigned_manager_profile_id")
        .eq("status", "active");
      type CreatorRow = { id: string; name: string | null; artistic_name: string | null; instagram_handle: string | null; phone_e164: string | null; whatsapp_number: string | null; phone: string | null; assigned_manager_profile_id: string | null };
      const creatorByD10 = new Map<string, CreatorRow>();
      for (const cr of (creators ?? []) as CreatorRow[]) {
        const key = d10(cr.phone_e164 || cr.whatsapp_number || cr.phone);
        if (!key) continue;
        const prev = creatorByD10.get(key);
        if (!prev || (!prev.assigned_manager_profile_id && cr.assigned_manager_profile_id)) creatorByD10.set(key, cr);
      }

      // 5) Atribución por manager: la línea es COMPARTIDA → se atribuye por la cuenta
      // Kash de la creadora (creator_business.kash_type, viene de BLU): Plus=Carolina,
      // Massive=Fabiana. Fallback: manager asignada en el perfil (profiles.full_name).
      const creatorIds = [...new Set([...creatorByD10.values()].map((c) => c.id))];
      const kashByCreator = new Map<string, string>();
      if (creatorIds.length) {
        const { data: biz } = await ctx.sb
          .from("creator_business").select("creator_id, kash_type").in("creator_id", creatorIds);
        for (const b of (biz ?? []) as Array<{ creator_id: string; kash_type: string | null }>) {
          if (b.kash_type) kashByCreator.set(b.creator_id, b.kash_type);
        }
      }
      const KASH_MANAGER: Record<string, string> = { Plus: "Carolina (Kash Plus)", Massive: "Fabiana (Kash Massive)" };
      const mgrIds = [...new Set([...creatorByD10.values()].map((c) => c.assigned_manager_profile_id).filter((x): x is string => Boolean(x)))];
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
        const cr = creatorByD10.get(d10(ct.phone_e164));
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
];
