import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// argos-vigia — ATENCIÓN AHORA (Álvaro, 02/11).
//
// El vigía server-side de Argos: cada 2 min (pg_cron, minutos impares) evalúa
// 4 señales por persona y mantiene argos_alertas (una alerta viva por persona y
// tipo; se abre, se actualiza, se cierra sola cuando la causa desaparece):
//   1. fuera_de_lugar  — el último veredicto de la IA dice que el SISTEMA que
//                        usa no es de trabajo (monitor_capturas.fuera_de_lugar).
//   2. sin_senal       — estaba trabajando (capturas en los últimos 60 min) y
//                        dejó de mandar pantallazos hace ≥ 8 min sin pausa abierta.
//   3. pausa_de_mas    — una pausa abierta (baño/break/almuerzo) pasó su límite:
//                        el de la sala (alert_rules.pausas) o el de la empresa.
//   4. cámara/puesto   — faltas de los últimos 5 min en monitor_eventos (cámara
//                        apagada/tapada, se fue, cara incompleta, celular…).
// Al ABRIRSE una alerta se avisa (notifications → push automático) según LA regla
// destinatarios_de_aviso (Alvaro, 12/11/2026): dueño, admins y RR. HH. todo;
// supervisores su equipo; jefes sus equipos a cargo. «Avisar siempre», pero una
// sola vez por alerta,
// no cada 2 min. Solo entra por cron (X-Cron-Token). Huella en argos_diag.
// El aviso abre /hr/en-vivo/<persona>?alerta=<id> (la vista en vivo, 11/11).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_TOKEN = Deno.env.get("CRON_INTERNAL_TOKEN") ?? "";

const ACTIVO_MIN = 60; // «estaba trabajando»: alguna captura en esta ventana
const SIN_SENAL_MIN = 8; // sin pantallazos hace ≥ esto = sin señal
const IA_VENTANA_MIN = 40; // el veredicto de la IA vale esto (se re-juzga cada ~30 min)
const FALTA_FRESCA_MIN = 5; // una falta de cámara/puesto es «ahora» si tiene ≤ 5 min
const PANTALLA_MIN = 10; // conectado sin PANTALLA hace ≥ esto = no comparte (exigida)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function igualesConstante(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

type Tipo =
  | "fuera_de_lugar" | "sin_senal" | "sin_pantalla" | "pausa_de_mas"
  | "camara_apagada" | "camara_tapada" | "se_fue" | "cara_incompleta"
  | "celular" | "distraido" | "no_mira";

// Texto del aviso (el push no pasa por i18n del navegador): español neutro.
const LABEL: Record<Tipo, string> = {
  fuera_de_lugar: "Fuera de lugar",
  sin_senal: "Sin señal",
  sin_pantalla: "No comparte pantalla",
  pausa_de_mas: "Pausa de más",
  camara_apagada: "Cámara apagada",
  camara_tapada: "Cámara tapada",
  se_fue: "Fuera del puesto",
  cara_incompleta: "Cara incompleta",
  celular: "En el celular",
  distraido: "Distraído",
  no_mira: "No mira la pantalla",
};
const GRAVEDAD: Record<Tipo, number> = {
  fuera_de_lugar: 3, se_fue: 3, camara_apagada: 3, celular: 3, sin_pantalla: 3,
  sin_senal: 2, pausa_de_mas: 2, camara_tapada: 2, distraido: 2, no_mira: 2,
  cara_incompleta: 1,
};
const FALTAS: Tipo[] = ["camara_apagada", "camara_tapada", "se_fue", "cara_incompleta", "celular", "distraido", "no_mira"];
const PAUSA_LABEL: Record<string, string> = { bano: "Baño", break: "Break", almuerzo: "Almuerzo" };

interface Deseada {
  user_id: string;
  tipo: Tipo;
  gravedad: number;
  detalle: string;
  captura_path: string | null;
}

interface Captura { user_id: string; tipo: string; path: string | null; created_at: string; veredicto: string | null; fuera_de_lugar: boolean | null; }
interface Pausa { user_id: string; kind: string; started_at: string; session_id: string | null; }
interface Sesion { id: string; alert_rules: { pausas?: Record<string, unknown> } | null; tenant_id: string | null; }
interface Limite { kind: string; minutos: number; tenant_id: string; }
interface Evento { user_id: string; tipo: string; created_at: string; detalle: string | null; captura_path: string | null; }
interface Abierta { id: string; user_id: string; tipo: string; gravedad: number; detalle: string | null; captura_path: string | null; }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);

  // Solo el cron.
  const tokenCron = req.headers.get("X-Cron-Token") ?? "";
  if (!tokenCron || !igualesConstante(tokenCron, CRON_TOKEN)) return json({ ok: false, error: "no-auth" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const ronda = crypto.randomUUID().slice(0, 8);
  const diag = async (paso: string, detalle: Record<string, unknown> = {}) => {
    await admin.from("argos_diag").insert({ ronda, paso: `vigia_${paso}`, detalle }).then(() => {}, () => {});
  };

  // Monitor apagado → no se abre nada nuevo (lo abierto se deja como está).
  const { data: cfg } = await admin.from("monitor_config").select("activo").eq("id", 1).maybeSingle();
  if (cfg && cfg.activo === false) { await diag("apagado"); return json({ ok: true, skip: "off" }); }

  const ahora = Date.now();
  const iso = (minAtras: number) => new Date(ahora - minAtras * 60_000).toISOString();

  // 1) Todo lo que hace falta, en paralelo.
  const [capRes, pausasRes, limitesRes, eventosRes, abiertasRes, duenosRes] = await Promise.all([
    admin.from("monitor_capturas").select("user_id, tipo, path, created_at, veredicto, fuera_de_lugar")
      .gte("created_at", iso(ACTIVO_MIN)).order("created_at", { ascending: false }).limit(8000),
    admin.from("cowork_breaks").select("user_id, kind, started_at, session_id").is("ended_at", null).limit(500),
    admin.from("cowork_break_limits").select("kind, minutos, tenant_id"),
    admin.from("monitor_eventos").select("user_id, tipo, created_at, detalle, captura_path")
      .gte("created_at", iso(FALTA_FRESCA_MIN)).neq("estado", "descartado").order("created_at", { ascending: false }).limit(1000),
    admin.from("argos_alertas").select("id, user_id, tipo, gravedad, detalle, captura_path").is("cerrada_at", null).limit(2000),
    admin.from("tenant_owners").select("tenant_id, user_id"),
  ]);
  const errCarga = [capRes.error, pausasRes.error, limitesRes.error, eventosRes.error, abiertasRes.error, duenosRes.error].find(Boolean);
  if (errCarga) { await diag("carga_error", { error: errCarga.message }); return json({ ok: false, error: "carga", detalle: errCarga.message }, 500); }

  const capturas = (capRes.data ?? []) as Captura[];
  const pausas = (pausasRes.data ?? []) as Pausa[];
  const limites = (limitesRes.data ?? []) as Limite[];
  const eventos = (eventosRes.data ?? []) as Evento[];
  const abiertas = (abiertasRes.data ?? []) as Abierta[];
  const duenos = (duenosRes.data ?? []) as Array<{ tenant_id: string; user_id: string }>;
  const esDueno = new Set(duenos.map((d) => d.user_id));
  // RR. HH. recibe copia de cada alerta, igual que el dueño (Alvaro, 11/11/2026).
  // Si la lista no carga, se avisa igual al dueño y queda anotado: una copia que
  // falta no frena la alerta.
  const rrhhRes = await admin.rpc("equipo_rrhh");
  if (rrhhRes.error) await diag("rrhh_error", { error: rrhhRes.error.message });
  const rrhh = (rrhhRes.data ?? []) as Array<{ tenant_id: string; user_id: string }>;

  // Salas de las pausas abiertas (límites por sala) — solo si hay pausas.
  const sesionIds = [...new Set(pausas.map((p) => p.session_id).filter(Boolean))] as string[];
  const sesiones = new Map<string, Sesion>();
  if (sesionIds.length) {
    const { data } = await admin.from("cowork_sessions").select("id, alert_rules, tenant_id").in("id", sesionIds);
    for (const s of (data ?? []) as Sesion[]) sesiones.set(s.id, s);
  }

  // 2) Las alertas que DEBERÍAN estar vivas ahora.
  const deseadas = new Map<string, Deseada>();
  const poner = (d: Deseada) => { if (!esDueno.has(d.user_id)) deseadas.set(`${d.user_id}|${d.tipo}`, d); };

  // 2a/2b. Por persona, desde las capturas (ya vienen de más nueva a más vieja).
  const ultimaPor = new Map<string, Captura>(); // última captura (cualquier tipo)
  const ultimaPantallaPor = new Map<string, Captura>();
  const ultimaJuzgadaPor = new Map<string, Captura>();
  for (const c of capturas) {
    if (!ultimaPor.has(c.user_id)) ultimaPor.set(c.user_id, c);
    if (c.tipo === "pantalla" && !ultimaPantallaPor.has(c.user_id)) ultimaPantallaPor.set(c.user_id, c);
    if (c.veredicto != null && !ultimaJuzgadaPor.has(c.user_id)) ultimaJuzgadaPor.set(c.user_id, c);
  }
  const enPausa = new Set(pausas.map((p) => p.user_id));
  for (const [userId, ult] of ultimaPor) {
    const hace = Math.round((ahora - Date.parse(ult.created_at)) / 60_000);
    if (hace >= SIN_SENAL_MIN && !enPausa.has(userId)) {
      poner({ user_id: userId, tipo: "sin_senal", gravedad: GRAVEDAD.sin_senal, detalle: `Sin pantallazos hace ${hace} min`, captura_path: ultimaPantallaPor.get(userId)?.path ?? null });
    }
    // PANTALLA EXIGIDA (Alvaro): conectado (señal fresca) pero sin compartir
    // pantalla hace ≥ PANTALLA_MIN y sin pausa abierta → alerta + aviso a la persona.
    const p = ultimaPantallaPor.get(userId);
    const haceP = p ? Math.round((ahora - Date.parse(p.created_at)) / 60_000) : Infinity;
    if (hace < SIN_SENAL_MIN && haceP >= PANTALLA_MIN && !enPausa.has(userId)) {
      poner({
        user_id: userId,
        tipo: "sin_pantalla",
        gravedad: GRAVEDAD.sin_pantalla,
        detalle: p ? `Conectado sin compartir pantalla hace ${haceP} min` : "Conectado sin compartir pantalla",
        captura_path: p?.path ?? null,
      });
    }
    const j = ultimaJuzgadaPor.get(userId);
    if (j && j.fuera_de_lugar === true && ahora - Date.parse(j.created_at) <= IA_VENTANA_MIN * 60_000) {
      poner({ user_id: userId, tipo: "fuera_de_lugar", gravedad: GRAVEDAD.fuera_de_lugar, detalle: j.veredicto ?? LABEL.fuera_de_lugar, captura_path: j.path });
    }
  }

  // 2c. Pausas abiertas que pasaron su límite.
  for (const p of pausas) {
    const sesion = p.session_id ? sesiones.get(p.session_id) : undefined;
    const clave = p.kind === "break" ? "breakMin" : p.kind === "almuerzo" ? "almuerzoMin" : "banoMin";
    const deSala = Number(sesion?.alert_rules?.pausas?.[clave] ?? NaN);
    const deEmpresa = limites.find((l) => l.kind === p.kind && (!sesion?.tenant_id || l.tenant_id === sesion.tenant_id))?.minutos;
    const limite = Number.isFinite(deSala) && deSala > 0 ? deSala : deEmpresa;
    if (!limite) continue;
    const minutos = Math.round((ahora - Date.parse(p.started_at)) / 60_000);
    if (minutos > limite) {
      poner({
        user_id: p.user_id,
        tipo: "pausa_de_mas",
        gravedad: minutos > limite * 2 ? 3 : GRAVEDAD.pausa_de_mas,
        detalle: `${PAUSA_LABEL[p.kind] ?? "Pausa"} ${minutos} min (límite ${limite})`,
        captura_path: ultimaPantallaPor.get(p.user_id)?.path ?? null,
      });
    }
  }

  // 2d. Faltas de cámara/puesto de los últimos minutos (la más reciente por persona y tipo).
  for (const e of eventos) {
    if (!FALTAS.includes(e.tipo as Tipo)) continue;
    const k = `${e.user_id}|${e.tipo}`;
    if (deseadas.has(k)) continue;
    poner({ user_id: e.user_id, tipo: e.tipo as Tipo, gravedad: GRAVEDAD[e.tipo as Tipo], detalle: e.detalle ?? LABEL[e.tipo as Tipo], captura_path: e.captura_path ?? ultimaPantallaPor.get(e.user_id)?.path ?? null });
  }

  // 3) Conciliar con lo que está abierto: abrir, actualizar, cerrar.
  const abiertaPor = new Map(abiertas.map((a) => [`${a.user_id}|${a.tipo}`, a]));
  const nuevas: Deseada[] = [];
  const actualizar: Array<{ id: string; d: Deseada }> = [];
  for (const [k, d] of deseadas) {
    const a = abiertaPor.get(k);
    if (!a) nuevas.push(d);
    else if (a.detalle !== d.detalle || a.gravedad !== d.gravedad || a.captura_path !== d.captura_path) actualizar.push({ id: a.id, d });
  }
  const cerrar = abiertas.filter((a) => !deseadas.has(`${a.user_id}|${a.tipo}`)).map((a) => a.id);

  // Empresa de cada persona (para la alerta y para saber a qué dueños avisar).
  const usuarios = [...new Set(nuevas.map((n) => n.user_id))];
  const tenantDe = new Map<string, string>();
  const nombreDe = new Map<string, string>();
  if (usuarios.length) {
    const [{ data: miembros }, { data: perfiles }] = await Promise.all([
      admin.from("tenant_members").select("user_id, tenant_id").in("user_id", usuarios),
      admin.from("profiles").select("id, full_name").in("id", usuarios),
    ]);
    for (const m of (miembros ?? []) as Array<{ user_id: string; tenant_id: string }>) if (!tenantDe.has(m.user_id)) tenantDe.set(m.user_id, m.tenant_id);
    for (const p of (perfiles ?? []) as Array<{ id: string; full_name: string | null }>) nombreDe.set(p.id, p.full_name?.trim() || "Alguien");
  }

  const ahoraISO = new Date(ahora).toISOString();
  let abiertasN = 0, actualizadasN = 0, cerradasN = 0, avisosN = 0;
  const errores: string[] = [];

  if (cerrar.length) {
    const { error } = await admin.from("argos_alertas").update({ cerrada_at: ahoraISO, actualizada_at: ahoraISO }).in("id", cerrar);
    if (error) errores.push(`cerrar: ${error.message}`); else cerradasN = cerrar.length;
  }
  for (const { id, d } of actualizar) {
    const { error } = await admin.from("argos_alertas").update({ detalle: d.detalle, gravedad: d.gravedad, captura_path: d.captura_path, actualizada_at: ahoraISO }).eq("id", id);
    if (error) errores.push(`actualizar: ${error.message}`); else actualizadasN++;
  }

  // 4) Abrir las nuevas y avisar a los dueños (una vez por alerta).
  for (const d of nuevas) {
    const tenantId = tenantDe.get(d.user_id) ?? null;
    const { data: fila, error } = await admin
      .from("argos_alertas")
      .insert({ tenant_id: tenantId, user_id: d.user_id, tipo: d.tipo, gravedad: d.gravedad, detalle: d.detalle, captura_path: d.captura_path })
      .select("id")
      .single();
    if (error || !fila) { errores.push(`abrir: ${error?.message ?? "sin-fila"}`); continue; }
    abiertasN++;

    // A quién: LA regla de la base. Si no responde, al menos dueño y RR. HH.
    // (un aviso que falta es peor que uno de menos) y queda anotado.
    const regla = await admin.rpc("destinatarios_de_aviso", { _target: d.user_id });
    if (regla.error) await diag("destinatarios_error", { error: regla.error.message });
    const destinatarios = regla.error
      ? [...duenos, ...rrhh]
          .filter((o) => (!tenantId || o.tenant_id === tenantId) && o.user_id !== d.user_id)
          .map((o) => o.user_id)
      : ((regla.data ?? []) as Array<{ user_id: string }>).map((x) => x.user_id).filter((u) => u && u !== d.user_id);
    if (destinatarios.length === 0) continue;
    const nombre = nombreDe.get(d.user_id) ?? "Alguien";
    const filas = [...new Set(destinatarios)].map((uid) => ({
      user_id: uid,
      type: "argos_alerta",
      title: `Argos: ${nombre} · ${LABEL[d.tipo]}`,
      message: d.detalle,
      reference_id: fila.id,
      reference_type: "argos_alerta",
      module_origin: "HR",
      priority: d.gravedad >= 3 ? "high" : "medium",
      status: "new",
      visibility_scope: "personal",
      // Tocar el aviso abre la VISTA EN VIVO de la persona con ESTA alerta arriba
      // (Alvaro, 11/11): qué vio Argos, desde cuándo, y su pantalla y cámara ahora
      // — no el expediente con fotos. Si la alerta ya cerró, ahí mismo sale el
      // video de esos minutos.
      deep_link_url: `/hr/en-vivo/${d.user_id}?alerta=${fila.id}`,
      // Sin required_permission: a quién le llega ya lo decidió la regla; con el
      // permiso de HR, la campana se lo escondía a supervisores y jefes.
    }));
    const { error: nErr } = await admin.from("notifications").insert(filas);
    if (nErr) { errores.push(`avisar: ${nErr.message}`); continue; }
    avisosN += filas.length;
    await admin.from("argos_alertas").update({ notificada_at: ahoraISO }).eq("id", fila.id);

    // Pantalla exigida: aviso automático a LA PERSONA (una vez por alerta, no
    // cada 2 min). Sin required_permission: le llega a ella, con su push.
    if (d.tipo === "sin_pantalla") {
      await admin.from("notifications").insert({
        user_id: d.user_id,
        type: "argos_pantalla",
        title: "Argos: comparte tu pantalla",
        message: "Estás conectado sin compartir pantalla en Cowork. Compártela para que tu trabajo cuente.",
        reference_id: fila.id,
        reference_type: "argos_alerta",
        module_origin: "HR",
        priority: "high",
        status: "new",
        visibility_scope: "personal",
        deep_link_url: "/cowork",
      }).then(() => { avisosN++; }, (e: unknown) => errores.push(`avisar-persona: ${(e as Error)?.message}`));
    }
  }

  await diag("fin", { personas_vistas: ultimaPor.size, deseadas: deseadas.size, abiertas: abiertasN, actualizadas: actualizadasN, cerradas: cerradasN, avisos: avisosN, errores: errores.slice(0, 5) });
  return json({ ok: true, abiertas: abiertasN, actualizadas: actualizadasN, cerradas: cerradasN, avisos: avisosN, errores: errores.slice(0, 5) });
});
