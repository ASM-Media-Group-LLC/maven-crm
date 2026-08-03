// Dominio EQUIPO / pipeline de closers del catálogo (lectura).
import type { AgentTool, AgentCtx } from "./types.ts";

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

// minúsculas + sin acentos: "María" ≈ "maria". Para comparar nombres dichos
// (o transcritos por Whisper) contra los registrados.
const normName = (s: string): string =>
  s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").trim();

// Apodos/variantes → nombre canónico (team_name_aliases, editable por SQL).
// "brian" → "Brayan", "lisette" → "Lizeth". Falla en silencio: sin alias se
// busca lo que vino.
// deno-lint-ignore no-explicit-any
async function aplicarAlias(sb: any, tenantId: string, person: string): Promise<{ buscado: string; alias: boolean }> {
  try {
    const { data } = await sb
      .from("team_name_aliases")
      .select("canonical")
      .eq("tenant_id", tenantId)
      .eq("alias", normName(person))
      .maybeSingle();
    if (data?.canonical) return { buscado: String(data.canonical), alias: true };
  } catch { /* sin alias */ }
  return { buscado: person, alias: false };
}

// Parecidos por tokens: "Juan Pachas" → los tres Juan del roster. Para que un
// nombre que NO existe devuelva candidatos en vez de nada (y el bot pregunte).
function parecidos(
  buscado: string,
  roster: Array<{ nombre: string; rol: string | null; en_maven: boolean }>,
): Array<{ nombre: string; rol: string | null; en_maven: boolean }> {
  const tokens = normName(buscado).split(/\s+/).filter((t) => t.length >= 3);
  if (!tokens.length) return [];
  const scored = roster
    .map((p) => {
      const n = normName(p.nombre);
      const score = tokens.filter((t) => n.includes(t)).length;
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, 6).map((x) => x.p);
}

// "4.13" horas decimales se leen como "4h13m" y son 4h08m — dar el formato hecho.
const horasHM = (secs: number): string => `${Math.floor(secs / 3600)}h${String(Math.round((secs % 3600) / 60)).padStart(2, "0")}m`;

// ── QUÉ HACE CADA PERSONA ────────────────────────────────────────────────────
// ⚠️ POR QUÉ EXISTE: el 03/08 Álvaro pidió las horas de los CHATTERS y el bot le
// devolvió a todo el que fichó — de 17 nombres, 7 no eran chatters registrados.
// No fue un error del modelo: la tool no devolvía NINGÚN campo con la función.
// El `rol` que sí devolvía es el rol de PERMISOS de Hubstaff (owner/user), no el
// puesto, y eso confunde más de lo que ayuda.
//
// Dos fuentes, en este orden:
//   1) PROYECTO de Hubstaff — vale para TODOS los que fichan. Es la buena: 24 de 63
//      miembros activos NO tienen cuenta en Maven, así que el rol de Maven solo por
//      sí mismo borraría al 38% de la gente, chatters reales incluidos.
//   2) ROL de Maven (user_roles) — solo para los linkeados.
//
// Si ninguna resuelve, la función queda en null y ESO SE INFORMA. Una persona sin
// clasificar no puede desaparecer de un filtro en silencio: quien pregunta creería
// que no fichó. Es el mismo error que "no pude leer" convertido en "no promocionó".
type Funcion = { funcion: string | null; fuente: "proyecto_hubstaff" | "rol_maven" | null; proyectos: string[] };

async function resolverFunciones(
  sb: AgentCtx["sb"],
  filas: Array<{ hubstaff_user_id?: unknown; profile_id?: unknown }>,
  desde: string,
  hasta: string,
): Promise<Map<string, Funcion>> {
  const out = new Map<string, Funcion>();
  const uids = filas.map((r) => String(r.hubstaff_user_id ?? "")).filter(Boolean);
  const pids = filas.map((r) => String(r.profile_id ?? "")).filter((v) => v && v !== "null");
  if (!uids.length) return out;

  // 1) Proyectos en los que fichó cada uno en el rango.
  const proyectosPorUid = new Map<string, Set<string>>();
  try {
    const { data: acts } = await sb
      .from("hubstaff_activities")
      .select("project_name, hubstaff_members!inner(hubstaff_user_id)")
      .not("project_name", "is", null)
      .gte("starts_at", `${desde}T00:00:00Z`)
      .lte("starts_at", `${hasta}T23:59:59Z`);
    for (const a of (acts ?? []) as Array<Record<string, any>>) {
      const uid = String(a.hubstaff_members?.hubstaff_user_id ?? "");
      const p = String(a.project_name ?? "").trim();
      if (!uid || !p) continue;
      if (!proyectosPorUid.has(uid)) proyectosPorUid.set(uid, new Set());
      proyectosPorUid.get(uid)!.add(p);
    }
  } catch { /* si la tabla no responde, se cae al rol de Maven */ }

  // 2) Rol de Maven de los que sí tienen cuenta.
  const rolPorPid = new Map<string, string>();
  if (pids.length) {
    const { data: rls } = await sb.from("user_roles").select("user_id, role").in("user_id", pids);
    for (const r of (rls ?? []) as Array<{ user_id: string; role: string }>) {
      // Se queda con el rol más específico (el más largo suele serlo: "Chatter
      // Supervisor" antes que "employee"), en vez de el primero que llegue.
      const prev = rolPorPid.get(r.user_id);
      if (!prev || String(r.role).length > prev.length) rolPorPid.set(r.user_id, String(r.role));
    }
  }

  for (const r of filas) {
    const uid = String(r.hubstaff_user_id ?? "");
    if (!uid) continue;
    const proys = [...(proyectosPorUid.get(uid) ?? [])];
    const pid = String(r.profile_id ?? "");
    const rolMaven = pid ? rolPorPid.get(pid) ?? null : null;
    out.set(uid, proys.length
      ? { funcion: proys[0], fuente: "proyecto_hubstaff", proyectos: proys }
      : rolMaven
        ? { funcion: rolMaven, fuente: "rol_maven", proyectos: [] }
        : { funcion: null, fuente: null, proyectos: [] });
  }
  return out;
}

// ¿Esta persona entra en lo que se pidió ("chatters", "closers", "managers")?
// Compara sin acentos y por inclusión, para que "chatter" matchee "Chatter",
// "Chatter Supervisor" y el proyecto "Chatters Meeting".
function coincideFuncion(f: Funcion, pedido: string): boolean {
  const q = normName(pedido).replace(/e?s$/, "");   // "chatters" → "chatter"
  if (!q) return true;
  const campos = [f.funcion ?? "", ...f.proyectos];
  return campos.some((c) => normName(c).includes(q));
}

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
        nota: "by_stage es el total mezclado; usa by_line para no sumar embudos distintos.",
      };
    },
  },
  {
    name: "get_group_members",
    description:
      "La FUENTE DE VERDAD de quiénes están en un grupo de WhatsApp del equipo (whatsapp_members de ESE grupo). " +
      "Sin `group_name` devuelve el grupo actual; con `group_name` busca por nombre (Managers, Marketing/Ventas, " +
      "AI WARMING…). Devuelve los linkeados a Maven (nombre completo + rol) y aparte los sin vincular (display name " +
      "crudo de WhatsApp, puede ser basura tipo '#21'). USALA SIEMPRE que armes una lista de miembros, de monitoreo " +
      "o respondas 'quiénes están en X' — NUNCA armes esas listas de memoria ni desde Hubstaff: Hubstaff tiene OTRA " +
      "gente (chatters que no están en los grupos; el 31/07 el bot le inventó al owner dos personas sacadas de ahí, " +
      "y al corregirse inventó una tercera). Si mezclas fuentes, di de cuál sale cada nombre. No devuelve teléfonos.",
    input_schema: {
      type: "object",
      properties: {
        group_name: { type: "string", description: "nombre (o parte) del grupo; omitir = el grupo actual" },
      },
      additionalProperties: false,
    },
    domain: "equipo",
    scope: "read",
    handler: async (args, ctx) => {
      const gname = typeof args.group_name === "string" && args.group_name.trim() ? args.group_name.trim() : null;
      let groupId = ctx.groupId ?? null;
      let groupLabel: string | null = null;
      if (gname) {
        const { data: gs, error: gErr } = await ctx.sb
          .from("whatsapp_groups")
          .select("id, name")
          .eq("tenant_id", ctx.tenantId)
          .eq("active", true)
          .eq("is_direct", false)
          .ilike("name", `%${gname}%`)
          .limit(5);
        if (gErr) throw new Error(`get_group_members: ${gErr.message}`);
        if (!gs || gs.length === 0) return { error: "grupo_no_encontrado", buscado: gname };
        if (gs.length > 1) return { error: "varios_grupos_matchean", buscado: gname, opciones: gs.map((g) => g.name) };
        groupId = gs[0].id;
        groupLabel = gs[0].name;
      } else if (groupId) {
        const { data: g } = await ctx.sb.from("whatsapp_groups").select("name").eq("id", groupId).maybeSingle();
        groupLabel = g?.name ?? null;
      }
      if (!groupId) return { error: "sin_grupo", nota: "pasa group_name (ej. 'Managers')" };

      const { data: members, error } = await ctx.sb
        .from("whatsapp_members")
        .select("display_name, user_id")
        .eq("group_id", groupId)
        .eq("active", true);
      if (error) throw new Error(`get_group_members: ${error.message}`);
      const rows = (members ?? []) as Array<{ display_name: string | null; user_id: string | null }>;

      const uids = [...new Set(rows.map((m) => m.user_id).filter((u): u is string => Boolean(u)))];
      const nameById = new Map<string, string>();
      const roleById = new Map<string, string>();
      if (uids.length) {
        const { data: profs } = await ctx.sb.from("profiles").select("id, full_name").in("id", uids);
        for (const p of profs ?? []) if (p.full_name) nameById.set(p.id, p.full_name);
        const { data: userRoles } = await ctx.sb.from("user_roles").select("user_id, role").in("user_id", uids);
        for (const r of userRoles ?? []) if (r.role) roleById.set(r.user_id, r.role);
      }

      const linkeados: Array<{ nombre: string; rol: string | null }> = [];
      const sinVincular: string[] = [];
      for (const m of rows) {
        const fn = m.user_id ? nameById.get(m.user_id) : null;
        if (fn) linkeados.push({ nombre: fn, rol: (m.user_id && roleById.get(m.user_id)) || null });
        else sinVincular.push(m.display_name ?? "(sin nombre)");
      }
      linkeados.sort((a, b) => a.nombre.localeCompare(b.nombre));
      sinVincular.sort();

      return {
        grupo: groupLabel,
        miembros_maven: linkeados,
        total_linkeados: linkeados.length,
        sin_vincular: sinVincular,
        nota:
          "Esta lista (whatsapp_members del grupo) es LA fuente para 'quiénes están en el grupo'. Hubstaff tiene " +
          "OTRA gente (chatters) que NO está acá — si mezclas fuentes, aclara de dónde sale cada nombre. Los " +
          "sin_vincular son participantes reales sin cuenta Maven linkeada (display name crudo, puede ser basura).",
      };
    },
  },
  {
    name: "get_radar_accounts",
    description:
      "Estado EN VIVO de las cuentas de marca/outreach del equipo desde el RADAR de Brayan " +
      "(radar.marketingkash.com — el dashboard donde el equipo de warming lleva el registro real, " +
      "43 cuentas de todas las marcas: Letshoot, UNLOK, ORA, KASH, Exchange…). Por cuenta: handle, " +
      "marca/categoría, idioma, plataforma, followers y status (activa / baneada / porcrear). " +
      "Úsala cuando pregunten cómo van las cuentas del equipo, cuántas hay activas/baneadas, o al " +
      "planificar outreach/apelaciones. Es la fuente MÁS completa para el estado de cuentas del " +
      "equipo: scouter_spammer_accounts (get_llg_account_status) solo tiene las cargadas en Maven " +
      "con score de IA — complementarias, no iguales; si citas ambas, di de cuál sale cada dato. " +
      "El radar no expone timestamp de actualización: preséntalo como 'según el radar del equipo'. " +
      "Si el radar no responde, dilo tal cual — nunca inventes el estado.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["activa", "baneada", "porcrear"], description: "opcional: filtra por estado" },
        category: { type: "string", description: "opcional: filtra por marca/categoría (ilike: Letshoot, UNLOK, ORA…)" },
      },
      additionalProperties: false,
    },
    domain: "equipo",
    scope: "read",
    handler: async (args, _ctx) => {
      // GET público sin auth (lo pasó Brayan 31/07). Timeout corto: el agente
      // tiene 30s de pared y esto es un JSON chico servido por su dashboard.
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 8_000);
      let data: {
        updated?: string | null;
        counts?: { total?: number; activas?: number; baneadas?: number; porCrear?: number };
        accounts?: Array<{
          name?: string; handle?: string; category?: string; lang?: string;
          backup?: boolean; platform?: string; link?: string;
          followers?: string | number | null; status?: string;
        }>;
      };
      try {
        const resp = await fetch("https://radar.marketingkash.com/redes.json", { signal: ac.signal });
        clearTimeout(t);
        if (!resp.ok) return { error: `radar_http_${resp.status}`, nota: "El radar del equipo no respondió bien — dilo tal cual, no inventes el estado de las cuentas." };
        data = await resp.json();
      } catch (e) {
        clearTimeout(t);
        return { error: `radar_no_responde: ${(e as Error).message}`, nota: "No se pudo leer el radar del equipo — dilo tal cual, no inventes el estado de las cuentas." };
      }

      const statusFiltro = typeof args.status === "string" && args.status.trim() ? args.status.trim().toLowerCase() : null;
      const catFiltro = typeof args.category === "string" && args.category.trim() ? args.category.trim().toLowerCase() : null;
      let cuentas = (Array.isArray(data.accounts) ? data.accounts : []).map((a) => ({
        handle: a.handle ?? null,
        nombre: a.name ?? null,
        marca: a.category ?? null,
        idioma: a.lang ?? null,
        plataforma: a.platform ?? null,
        es_backup: a.backup === true,
        followers: a.followers ?? null,
        status: String(a.status ?? "").toLowerCase() || null,
      }));
      if (statusFiltro) cuentas = cuentas.filter((c) => c.status === statusFiltro);
      if (catFiltro) cuentas = cuentas.filter((c) => (c.marca ?? "").toLowerCase().includes(catFiltro));

      return {
        fuente: "radar.marketingkash.com (dashboard del equipo, en vivo; sin timestamp propio)",
        totales: {
          total: data.counts?.total ?? null,
          activas: data.counts?.activas ?? null,
          baneadas: data.counts?.baneadas ?? null,
          por_crear: data.counts?.porCrear ?? null,
        },
        cuentas: cuentas.slice(0, 100),
        ...(statusFiltro || catFiltro ? { filtro_aplicado: { status: statusFiltro, marca: catFiltro }, coincidencias: cuentas.length } : {}),
      };
    },
  },
  {
    name: "read_webpage",
    description:
      "Lee una página web renderizada (con JavaScript) y devuelve su TEXTO limpio + título. Usala cuando alguien pega un link o pide revisar el contenido de una URL, o cuando necesitás datos de una página que no tenés como tool (dashboards, SPAs, radares con JS que el server no puede leer directo). Solo lectura, no envía nada ni interactúa. Si el lector no responde o el host no está permitido, lo DICE — nunca inventes el contenido de la página. Para el estado de cuentas del equipo usá get_radar_accounts (más estructurado); esta es para páginas web genéricas.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL completa (https://…) a leer" },
        selector: { type: "string", description: "opcional: CSS a esperar antes de leer (si la página tarda en pintar la parte que importa)" },
      },
      required: ["url"],
      additionalProperties: false,
    },
    domain: "equipo",
    scope: "read",
    handler: async (args, _ctx) => {
      const url = String(args?.url ?? "").trim();
      if (!/^https?:\/\//i.test(url)) return { error: "url_invalida", nota: "Pasá una URL completa https://…" };
      const READER_URL = (Deno.env.get("WEB_READER_URL") ?? "").replace(/\/+$/, "");
      const READER_TOKEN = Deno.env.get("WEB_READER_TOKEN") ?? "";
      if (!READER_URL || !READER_TOKEN) return { error: "lector_no_configurado", nota: "El micro web-reader todavía no está desplegado/cableado (WEB_READER_URL/WEB_READER_TOKEN). Decí que aún no podés leer páginas web, no inventes." };
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 28_000);
      try {
        const resp = await fetch(`${READER_URL}/read`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-reader-token": READER_TOKEN },
          body: JSON.stringify({ url, selector: args?.selector, max_chars: 12000 }),
          signal: ac.signal,
        });
        clearTimeout(t);
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || data?.ok === false) return { error: `lector_${resp.status}`, detalle: data?.error ?? null, nota: "No se pudo leer la página — decilo tal cual, no inventes el contenido." };
        return { ok: true, url: data.final_url ?? url, titulo: data.title ?? null, texto: data.text ?? "", truncado: data.text_truncated ?? false };
      } catch (e) {
        clearTimeout(t);
        return { error: `lector_no_responde: ${(e as Error).message}`, nota: "El lector web no respondió — decilo tal cual, no inventes." };
      }
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
      "⚠️ PARA HOY: usa EXCLUSIVAMENTE el bloque `hoy_en_vivo` de la respuesta (feed de a 10 min, refrescado cada " +
      "2-5 min); el agregado diario de HOY puede venir hasta 6h atrasado y hacía reportar '0h' de gente trabajando. " +
      "Cada persona de hoy trae `estado`: 'ficho_hoy' (horas reales al último ping), 'sin_fichar_hoy' (el feed está " +
      "vivo y NO tiene ni un minuto — solo esto es 'no arrancó'), o 'sin_dato_feed_stale' (el tracker no reporta: " +
      "PROHIBIDO decir 0h, di desde qué hora no hay datos). Hay NOMBRES REPETIDOS en el equipo (dos 'Brayan', tres " +
      "'Lizeth'): identifica siempre por nombre COMPLETO + rol de la respuesta. La tool resuelve apodos conocidos " +
      "(Brian→Brayan) y si el nombre NO existe o matchea a VARIOS te devuelve `persona_no_encontrada`/`ambiguo` con " +
      "candidatos: en ese caso PREGUNTÁ a cuál se refieren — nunca respondas con datos de otra persona ni elijas vos " +
      "(el 31/07 'Juan Pachas' no existía y el bot contestó con gente que nadie preguntó). " +
      "La tool puede tardar ~12s extra cuando pide refresh en vivo al bridge.",
    input_schema: {
      type: "object",
      properties: {
        person: { type: "string", description: "nombre (o parte) de la persona; omitir para todo el equipo" },
        funcion: {
          type: "string",
          description:
            "filtrar por función/área: 'chatters', 'closers', 'managers', 'warming'… Usalo SIEMPRE que pidan " +
            "un grupo ('las horas de los chatters'). Matchea contra el proyecto de Hubstaff y el rol de Maven. " +
            "La respuesta trae aparte a los que no se pudieron clasificar — nombralos, no los escondas.",
        },
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
      const personRaw = typeof args.person === "string" && args.person.trim() ? args.person.trim() : null;
      // Apodos/variantes de Whisper ("Brian", "Lisette") → canónico, ANTES de la RPC.
      const aliased = personRaw ? await aplicarAlias(ctx.sb, ctx.tenantId, personRaw) : null;
      const person = aliased?.buscado ?? null;

      const { data, error } = await ctx.sb.rpc("hubstaff_activity_summary", { p_from: from, p_to: to, p_person: person });
      if (error) throw new Error(`get_hubstaff_activity: ${error.message}`);
      const rows = (data ?? []) as Array<Record<string, unknown>>;

      // ── NOMBRE QUE NO MATCHEA O MATCHEA VARIOS: eso es un DATO, no un detalle.
      // El 31/07 "Juan Pachas" no existía y el bot respondió con OTRAS personas;
      // acá se corta eso de raíz: sin match → candidatos y a PREGUNTAR; multi-match
      // → candidatos y a PREGUNTAR. Nunca datos de la persona equivocada.
      if (person && rows.length === 0) {
        // PRIMERO Maven: hay staff que NO ficha Hubstaff (directivos — caso real:
        // Juan Pachas, admin, gestiona creadoras a nivel líder). El 31/07 el bot
        // dijo "no existe ni en Maven" por extrapolar de esta tool, que solo
        // miraba Hubstaff. "Existe pero no trackea" ≠ "no existe".
        const { data: profs } = await ctx.sb
          .from("profiles").select("id, full_name")
          .ilike("full_name", `%${person}%`).limit(5);
        if (profs && profs.length) {
          const ids = (profs as Array<{ id: string }>).map((p) => p.id);
          const { data: rls } = await ctx.sb.from("user_roles").select("user_id, role").in("user_id", ids);
          const rolesById = new Map<string, string[]>();
          for (const r of (rls ?? []) as Array<{ user_id: string; role: string }>) {
            rolesById.set(r.user_id, [...(rolesById.get(r.user_id) ?? []), r.role]);
          }
          return {
            en_hubstaff: false,
            en_maven: (profs as Array<{ id: string; full_name: string }>).map((p) => ({
              nombre: p.full_name, roles: rolesById.get(p.id) ?? [],
            })),
            buscado: personRaw,
            ...(aliased?.alias ? { alias_aplicado: person } : {}),
            nota:
              "La persona SÍ existe en Maven pero NO trackea Hubstaff (los directivos/admins no fichan). " +
              "No hay horas que reportar y eso NO es 'no trabajó' ni 'no existe' — decilo así. " +
              "Para su actividad usá otras fuentes (grupos de WhatsApp, pipeline, etc.).",
          };
        }
        const { data: all } = await ctx.sb.rpc("hubstaff_activity_summary", { p_from: from, p_to: to, p_person: null });
        const roster = ((all ?? []) as Array<Record<string, unknown>>).map((r) => ({
          nombre: String(r.name), rol: (r.hubstaff_role as string) ?? null, en_maven: Boolean(r.mapped_to_maven),
        }));
        return {
          error: "persona_no_encontrada",
          buscado: personRaw,
          ...(aliased?.alias ? { alias_aplicado: person } : {}),
          parecidos: parecidos(person, roster),
          nota:
            "NO respondas con datos de otra persona. Decí que ese nombre no está ni en Hubstaff ni en Maven, " +
            "mostrá los parecidos y PREGUNTÁ a quién se refiere. Si es alguien de un grupo de WhatsApp (apodo), " +
            "verificá con get_group_members. Cuando el owner aclare quién es, podés guardarlo con remember_fact " +
            "(ej. 'a Juan X le dicen Pachas') para la próxima.",
        };
      }
      if (person && rows.length > 1) {
        return {
          ambiguo: true,
          buscado: personRaw,
          ...(aliased?.alias ? { alias_aplicado: person } : {}),
          candidatos: rows.slice(0, 8).map((r) => ({
            nombre: r.name, rol: r.hubstaff_role, en_maven: r.mapped_to_maven,
          })),
          nota:
            `"${personRaw}" matchea a ${rows.length} personas. PREGUNTÁ cuál es (nombre completo) antes de dar ` +
            "cualquier número — no elijas por tu cuenta. Hay nombres repetidos en el equipo (dos Brayan, tres Lizeth).",
        };
      }

      // Función de cada persona (proyecto de Hubstaff > rol de Maven). Ver resolverFunciones.
      const funciones = await resolverFunciones(ctx.sb, rows as Array<Record<string, unknown>>, from, to);
      const fnDe = (r: Record<string, unknown>): Funcion =>
        funciones.get(String(r.hubstaff_user_id ?? "")) ?? { funcion: null, fuente: null, proyectos: [] };

      const pedido = String(args.funcion ?? "").trim();
      // Al filtrar por función se parte en TRES, no en dos: los que entran, los que
      // quedan fuera y —clave— los que NO se pudieron clasificar. Estos últimos no
      // pueden desaparecer: quien pregunta creería que no ficharon.
      const conFuncion = rows.filter((r) => fnDe(r as Record<string, unknown>).funcion !== null);
      const sinClasificar = rows.filter((r) => fnDe(r as Record<string, unknown>).funcion === null);
      const filtradas = pedido
        ? conFuncion.filter((r) => coincideFuncion(fnDe(r as Record<string, unknown>), pedido))
        : rows;

      const mapear = (r: Record<string, unknown>) => {
        const f = fnDe(r);
        return {
          nombre: r.name,
          funcion: f.funcion,                       // qué HACE (chatter, manager…)
          funcion_segun: f.fuente,                  // de dónde salió, para poder discutirlo
          ...(f.proyectos.length > 1 ? { proyectos: f.proyectos } : {}),
          rol_permisos_hubstaff: r.hubstaff_role,   // owner/user — NO es el puesto
          en_maven: r.mapped_to_maven,
          horas: r.total_hours,
          actividad_pct: r.avg_activity_pct,
          dias: r.days_worked,
          ultimo_dia: r.last_day,
        };
      };

      const result: Record<string, unknown> = {
        rango: { desde: from, hasta: to },
        personas: (pedido ? filtradas : rows).length,
        ...(pedido ? { filtrado_por: pedido, personas_totales_del_rango: rows.length } : {}),
        equipo: (pedido ? filtradas : rows).slice(0, 60).map((r) => mapear(r as Record<string, unknown>)),
        // Los sin clasificar se DETALLAN solo cuando hay filtro: ahí son los que
        // quedaron fuera y hay que nombrarlos. Sin filtro no se omiten nada (están en
        // `equipo`), así que alcanza con el conteo — listarlos otra vez sería ruido.
        ...(sinClasificar.length ? (pedido ? {
          sin_clasificar: sinClasificar.slice(0, 30).map((r) => ({
            nombre: (r as Record<string, unknown>).name,
            en_maven: (r as Record<string, unknown>).mapped_to_maven,
            horas: (r as Record<string, unknown>).total_hours,
          })),
          nota_sin_clasificar:
            `${sinClasificar.length} persona(s) fichan pero no sé qué función tienen (sin proyecto en Hubstaff y ` +
            `sin rol en Maven; hay 24 de 63 miembros sin cuenta en Maven). NO entraron en el filtro "${pedido}" ` +
            "Y PODRÍAN SER DEL GRUPO. Nombralas aparte como \"sin clasificar\": omitirlas haría creer que no ficharon.",
        } : { sin_funcion_registrada: sinClasificar.length }) : {}),
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
          ...(d.date === hoyBog ? { parcial: "agregado de HOY, puede venir hasta 6h atrasado — usa hoy_en_vivo" } : {}),
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

        // Con match único, al feed en vivo va el nombre EXACTO del match (no lo
        // que se dijo): la RPC live también hace ilike y podría re-ambiguar.
        const personLive = person && rows.length === 1 ? String(rows[0].name) : person;
        const { data: live, error: liveErr } = await ctx.sb.rpc("hubstaff_live_today", { p_person: personLive });
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
                "di explícito que el tracker no reporta desde esa hora y que esto es lo último que se sabe."
              : "Estados: ficho_hoy = horas REALES al último ping · sin_fichar_hoy = el feed está vivo y esta persona " +
                "no registra NI UN slot hoy (esto sí es 'no fichó') · el agregado diario de hoy atrasa hasta 6h, usa este bloque. " +
                "Citá horas con horas_hoy_fmt (4.13 horas NO son '4h13'). " +
                "Nombres repetidos (hay tres 'Brayan'): identifica por nombre completo + nombre_en_maven, no adivines.",
          };
        }
      }
      return result;
    },
  },
];
