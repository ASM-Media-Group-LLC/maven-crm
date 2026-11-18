import { corsFor } from "../_shared/cors.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  caidaSePaga, enMeetDeMaven, equipoDeCuerpo, estadoDeTiempo, latidoDeCuerpo, latidoDeEquipoAfuera, noCobrabaAlCaerse, sinConexionPagadaMs,
  EXIGE_TODO, LATIDO_VENCIDO_MS, TOPE_SIN_CONEXION_MS, VENTANA_SIN_CONEXION_MS, type Exigencias, type TramoGuardado,
} from "../_shared/cowork-tiempo.ts";
import { agenciaDePersona, agenciaDeSesion, esUuid, revisarPedido, topeDeLaTabla } from "./agencia.ts";
import { decidirAsignarSala, elegirSalaPorDefecto, guardarSalaFija, leerSalaFija } from "./sala-fija.ts";

const corsHeaders = (req: Request) => corsFor(req, { "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version" });

// ── LiveKit token helpers (reused from livekit-token) ───────────
function base64UrlEncode(data: Uint8Array): string {
  const CHUNK_SIZE = 8192;
  let b64 = "";
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    const chunk = data.subarray(i, i + CHUNK_SIZE);
    b64 += String.fromCharCode(...chunk);
  }
  b64 = btoa(b64);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function strToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

async function signHS256(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", strToBytes(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, strToBytes(payload)));
  return base64UrlEncode(sig);
}

interface LKGrants {
  roomJoin?: boolean;
  room?: string;
  canPublish?: boolean;
  canSubscribe?: boolean;
  canPublishData?: boolean;
  canPublishSources?: string[];
  roomAdmin?: boolean;
  roomList?: boolean; // solo para consultar RoomService/ListRooms (ocupación), sin entrar a nada
  hidden?: boolean; // observador invisible: se suscribe pero no aparece en la lista de participantes
}

// COMPATIBILIDAD CON EL MAVEN DEL 13/11 (14/11/2026; se puede quitar desde el 28/11).
// El 13/11 (PR #99) la sala de trabajo de Cowork dejó de descargar el video de los
// compañeros salvo el de quien trae `isHost: true` en la metadata (lib/videoAjeno.ts).
// Alvaro lo revirtió el 14/11 (PR #101: los chatters necesitan ver las pantallas para
// los empalmes), pero las pestañas que no recargaron siguen con el código de antes y
// ven «Solo audio». Con `isHost: true` en la metadata de TODOS en las salas de trabajo,
// esas pestañas vuelven a ver a todos sin recargar. Nadie más lee `isHost` de la
// metadata: los permisos de LiveKit van en `video` (grants) y el frontend nuevo ya no
// mira esto. Ver también infra/livekit/ver-a-todos.py (el repaso de los ya conectados).
const SALA_DE_COWORK_QUE_NO_ES_DE_TRABAJO = /^cowork_(hub|meet|1on1)_/;
function esSalaDeTrabajoDeCowork(sala: string | undefined): boolean {
  return !!sala && sala.startsWith("cowork_") && !SALA_DE_COWORK_QUE_NO_ES_DE_TRABAJO.test(sala);
}

async function createLKToken(apiKey: string, apiSecret: string, identity: string, name: string, grants: LKGrants, ttl = 86400): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const isHost = !!grants.roomAdmin || esSalaDeTrabajoDeCowork(grants.room);
  const payload = { iss: apiKey, sub: identity, iat: now, nbf: now, exp: now + ttl, name, video: grants, metadata: JSON.stringify({ name, isHost }) };
  const hB64 = base64UrlEncode(strToBytes(JSON.stringify(header)));
  const pB64 = base64UrlEncode(strToBytes(JSON.stringify(payload)));
  const sig = await signHS256(`${hB64}.${pB64}`, apiSecret);
  return `${hB64}.${pB64}.${sig}`;
}

// ── Helpers ─────────────────────────────────────────────────────
// Salas por sesión de Cowork. Era 10 y el 07/09/2026 CHATTERS KASH (Yoselin,
// Luis Carlos) chocó contra el tope al crear la 11.ª: cada chatter tiene su
// sala y el equipo creció. Jhon lo subió a 30: tres veces lo de hoy. No es
// ilimitado a propósito: el tablero del supervisor monta y recibe el video de
// TODAS las salas a la vez, y el freno real es el navegador del coordinador.
// Antes de pasar de acá hay que montar solo las salas visibles (pendiente en
// video_llamadas_meet). El mismo número vive en CoworkCreateDialog (MAX_ROOMS).
const MAX_SALAS_POR_SESION = 30;

function json(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
}

function err(req: Request, msg: string, status = 400) {
  return json(req, { error: msg }, status);
}

// Cuánto vale un enlace de host desde que el creador lo pide.
const HOST_CODE_TTL_MS = 30 * 60 * 1000;

// ── Reglas de alerta por sesión ─────────────────────────────────
// ESPEJA frontend/src/lib/coworkReglas.ts (normalizarReglas y sus topes).
// Deno no puede importar el módulo del frontend, así que la forma y los
// límites se repiten acá: si cambian allá, cambian acá. Se normaliza del lado
// del servidor porque esta función corre con service_role y el cuerpo viene
// del navegador: nada de lo que llegue se escribe sin pasar por acá.
// Tolerante a propósito —se acota, no se rechaza— para que una sesión nunca
// quede con reglas incompletas: un número fuera de rango se recorta, una clave
// que falta o trae basura cae al estándar, una clave desconocida se descarta.
interface ReglaAviso { activa: boolean; primerAvisoSeg: number; repetirSeg: number; supervisorSeg: number | null }
interface ReglaPausas { banoMin: number; breakMin: number; supervisorSeg: number | null }
interface ReglaReloj { fueraDeCamaraSeg: number }
interface ReglasCowork { preset: string; camara: ReglaAviso; encuadre: ReglaAviso; pantalla: ReglaAviso; pausas: ReglaPausas; reloj: ReglaReloj }

// Lo que Cowork hace por defecto, número por número (= REGLAS_ESTANDAR del front).
const REGLAS_ESTANDAR: ReglasCowork = {
  preset: "estandar",
  camara:   { activa: true, primerAvisoSeg: 90,  repetirSeg: 90,  supervisorSeg: 180 },
  encuadre: { activa: true, primerAvisoSeg: 90,  repetirSeg: 90,  supervisorSeg: 180 },
  pantalla: { activa: true, primerAvisoSeg: 120, repetirSeg: 120, supervisorSeg: 300 },
  pausas:   { banoMin: 10, breakMin: 30, supervisorSeg: 180 },
  // El reloj de tiempo trabajado: cuánto dura el "no hay nadie" antes de
  // detenerlo. 60 s por defecto (Jhon, 07/09/2026).
  reloj:    { fueraDeCamaraSeg: 60 },
};
const PRESETS = ["estricto", "estandar", "relajado", "personalizado"];
const SEG_MIN = 30, SEG_MAX = 3600;
const MIN_MIN = 1, MIN_MAX = 240;

function numeroEntre(v: unknown, min: number, max: number, porDefecto: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return porDefecto;
  return Math.min(max, Math.max(min, Math.round(n)));
}

// null explícito = "nunca": la persona recibe sus avisos, pero el supervisor
// no se entera ni queda registro. Cualquier otra cosa inválida cae al defecto.
function segundosONunca(v: unknown, porDefecto: number | null): number | null {
  if (v === null) return null;
  if (v === undefined) return porDefecto;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return porDefecto;
  return Math.min(SEG_MAX, Math.max(SEG_MIN, Math.round(n)));
}

function normalizarAviso(raw: unknown, base: ReglaAviso): ReglaAviso {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    activa: typeof r.activa === "boolean" ? r.activa : base.activa,
    primerAvisoSeg: numeroEntre(r.primerAvisoSeg, SEG_MIN, SEG_MAX, base.primerAvisoSeg),
    repetirSeg: numeroEntre(r.repetirSeg, SEG_MIN, SEG_MAX, base.repetirSeg),
    supervisorSeg: segundosONunca(r.supervisorSeg, base.supervisorSeg),
  };
}

function normalizarPausas(raw: unknown, base: ReglaPausas): ReglaPausas {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    banoMin: numeroEntre(r.banoMin, MIN_MIN, MIN_MAX, base.banoMin),
    breakMin: numeroEntre(r.breakMin, MIN_MIN, MIN_MAX, base.breakMin),
    supervisorSeg: segundosONunca(r.supervisorSeg, base.supervisorSeg),
  };
}

function normalizarReloj(raw: unknown, base: ReglaReloj): ReglaReloj {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return { fueraDeCamaraSeg: numeroEntre(r.fueraDeCamaraSeg, SEG_MIN, SEG_MAX, base.fueraDeCamaraSeg) };
}

/** Qué exige el reloj en esta sesión = qué alertas tiene encendidas el
 *  supervisor (cámara y pantalla). Sin reglas propias, las dos. */
function exigenciasDelReloj(alertRules: unknown): Exigencias {
  const r = normalizarReglas(alertRules ?? {});
  return { camara: r.camara.activa, pantalla: r.pantalla.activa };
}

/** Umbral del reloj (ms) que fija la SESIÓN; sin reglas propias, el estándar. */
function umbralFueraDeCamaraMs(alertRules: unknown): number {
  const reloj = alertRules && typeof alertRules === "object"
    ? (alertRules as Record<string, unknown>).reloj
    : undefined;
  return normalizarReloj(reloj, REGLAS_ESTANDAR.reloj).fueraDeCamaraSeg * 1000;
}

/** Reglas completas y sanas a partir de lo que mande el cliente. Solo salen las
 *  claves conocidas. El preset es informativo: el front lo recalcula al leer
 *  comparando los valores, así que acá basta con que sea un nombre válido. */
function normalizarReglas(raw: unknown): ReglasCowork {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    preset: typeof r.preset === "string" && PRESETS.includes(r.preset) ? r.preset : "personalizado",
    camara: normalizarAviso(r.camara, REGLAS_ESTANDAR.camara),
    encuadre: normalizarAviso(r.encuadre, REGLAS_ESTANDAR.encuadre),
    pantalla: normalizarAviso(r.pantalla, REGLAS_ESTANDAR.pantalla),
    pausas: normalizarPausas(r.pausas, REGLAS_ESTANDAR.pausas),
    reloj: normalizarReloj(r.reloj, REGLAS_ESTANDAR.reloj),
  };
}

/** Tope de pausa (minutos) que fija la SESIÓN, o null si no tiene reglas de
 *  pausas propias y rige la tabla cowork_break_limits como hasta ahora. */
function minutosDePausaDeSesion(alertRules: unknown, kind: string): number | null {
  const pausas = alertRules && typeof alertRules === "object"
    ? (alertRules as Record<string, unknown>).pausas
    : undefined;
  if (!pausas || typeof pausas !== "object") return null;
  const p = normalizarPausas(pausas, REGLAS_ESTANDAR.pausas);
  // El almuerzo no tiene tope propio en las reglas de la sesión: rige la tabla
  // cowork_break_limits (null = "usá la tabla").
  return kind === "break" ? p.breakMin : kind === "bano" ? p.banoMin : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return err(req, "Unauthorized", 401);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: userData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !userData?.user) return err(req, "Unauthorized", 401);
    const userId = userData.user.id;
    /** ¿Tiene el rol admin de Maven? Es la llave maestra de Cowork: puede
     *  finalizar y compartir el enlace de host de cualquier sesión. */
    // ── Reloj de Cowork: cerrar lo que quedó abierto ──────────────────────
    // Un segmento abierto es "el estado actual de la persona". Cuando se va de
    // la sala, de la sesión, o la sesión termina, deja de tener estado: se
    // cierra en el último latido visto, no en "ahora" — si hace 20 minutos que
    // no late, esos 20 minutos no existieron.
    const cerrarSegmentosAbiertos = async (filtro: { userId?: string; sessionId?: string }) => {
      let q = admin.from("cowork_tiempo_segmentos").select("id, last_seen_at").is("ended_at", null);
      if (filtro.userId) q = q.eq("user_id", filtro.userId);
      if (filtro.sessionId) q = q.eq("session_id", filtro.sessionId);
      const { data } = await q;
      for (const seg of data ?? []) {
        await admin.from("cowork_tiempo_segmentos").update({ ended_at: seg.last_seen_at }).eq("id", seg.id);
      }
    };

    // Admin de SU agencia: la guarda de agencia (más abajo) ya dejó afuera todo
    // lo que no es de la agencia de quien llama.
    const esAdmin = async (uid: string): Promise<boolean> => {
      const { data } = await admin.from("user_roles").select("user_id").eq("user_id", uid).eq("role", "admin").maybeSingle();
      return !!data;
    };

    // Get profile name
    const { data: profile } = await admin.from("profiles").select("full_name").eq("id", userId).single();
    const userName = profile?.full_name || "User";

    const body = await req.json();
    const { action } = body;

    // ── Cowork por agencia ────────────────────────────────────────────────
    // Todo lo que nombra el pedido (sesión, salas, meet, pedidos) tiene que ser
    // de la agencia de quien llama y, si el pedido nombra una sesión, de ESA
    // sesión. Corre antes de cualquier acción (ver agencia.ts).
    const miAgencia = await agenciaDePersona(admin, userId);
    const veredicto = await revisarPedido(admin, miAgencia, String(action ?? ""), body ?? {});
    if (!veredicto.ok) return err(req, veredicto.error, veredicto.status);

    const lkUrl = Deno.env.get("LIVEKIT_URL")!;
    const lkKey = Deno.env.get("LIVEKIT_API_KEY")!;
    const lkSecret = Deno.env.get("LIVEKIT_API_SECRET")!;

    // ═══════════════════════════════════════════════════════════════
    // CREATE COWORK SESSION
    // ═══════════════════════════════════════════════════════════════
    if (action === "createSession") {
      // La sesión queda en la agencia de quien la crea (la pone la base).
      if (!miAgencia) return err(req, "Tu cuenta no está en ninguna agencia. Pídele a un admin que te agregue.", 403);
      // Crear una sesión es una acción de COORDINACIÓN. La regla vive en la DB
      // (can_use_module_function) para que el front y esta función no se
      // desincronicen: si el rol tiene fila explícita para Cowork → "Crear
      // sesión" en el modal de permisos, esa fila manda; si no la tiene, cae al
      // nivel de acceso supervisor+. Así un admin puede habilitar a un rol de
      // nivel miembro desde Administración → Roles sin tocar código.
      // Guarda dura acá porque el front solo esconde el botón, y esta función
      // corre con service_role (bypassa RLS): sin este check cualquiera con
      // sesión válida podría llamar la acción a mano.
      const { data: canCreate, error: permErr } = await admin.rpc("can_use_module_function", {
        _user_id: userId,
        _module: "Cowork",
        _submodule: "Crear sesión",
        _fallback_group: "supervisor_or_above",
      });
      if (permErr) return err(req, permErr.message, 500);
      if (!canCreate) {
        return err(req, "Tu rol no permite crear sesiones de Cowork. Pide el enlace de la sala a tu coordinador.", 403);
      }

      const { description, roomNames } = body; // roomNames: string[]
      const name = String(body.name ?? "").trim();
      if (!name || !roomNames?.length) return err(req, "name and roomNames required");
      if (roomNames.length > MAX_SALAS_POR_SESION) return err(req, `Máximo ${MAX_SALAS_POR_SESION} salas por sesión`);

      // No dos sesiones ACTIVAS con el mismo nombre en la agencia: las repetidas
      // (hubo 5 "CHATTERS KASH") repartían a la gente entre varias y se perdían
      // los links. Las TERMINADAS no cuentan, así que siempre se puede crear una
      // nueva cuando la anterior ya cerró.
      const { data: dupNombre } = await admin.from("cowork_sessions")
        .select("id").eq("tenant_id", miAgencia).eq("status", "active")
        .ilike("name", name).limit(1).maybeSingle();
      if (dupNombre) return err(req, "Ya existe una sesión activa con ese nombre. Reúsala, o termínala antes de crear otra.", 409);

      // Check active session limit per user
      const { count: activeCount } = await admin.from("cowork_sessions")
        .select("*", { count: "exact", head: true })
        .eq("created_by", userId)
        .eq("status", "active");
      if (activeCount !== null && activeCount >= 10) return err(req, "Máximo 10 sesiones activas permitidas");

      const sessionId = crypto.randomUUID();
      const hostHubRoom = `cowork_hub_${sessionId.slice(0, 8)}`;

      // Create session
      const { error: sessErr } = await admin.from("cowork_sessions").insert({
        id: sessionId, name, description: description || null, host_hub_livekit_room: hostHubRoom, created_by: userId,
      });
      if (sessErr) return err(req, sessErr.message, 500);

      // Create rooms
      const rooms = roomNames.map((rn: string, i: number) => ({
        session_id: sessionId,
        name: rn,
        livekit_room_name: `cowork_${sessionId.slice(0, 8)}_${i}`,
        sort_order: i,
      }));
      const { data: createdRooms, error: roomErr } = await admin.from("cowork_rooms").insert(rooms).select();
      if (roomErr) return err(req, roomErr.message, 500);

      // Creator as host
      const { error: memErr } = await admin.from("cowork_memberships").insert({
        session_id: sessionId, user_id: userId, role: "host",
      });
      if (memErr) return err(req, memErr.message, 500);

      return json(req, { sessionId, hostHubRoom, rooms: createdRooms });
    }

    // ═══════════════════════════════════════════════════════════════
    // ADMIN: LISTAR TODAS LAS SESIONES ACTIVAS (con ocupación en vivo)
    // ═══════════════════════════════════════════════════════════════
    if (action === "adminListSessions") {
      // La lista sale del RPC cowork_sesiones_activas_admin, llamado con el
      // cliente DEL USUARIO (no service_role: con service_role auth.uid() es
      // NULL y la guarda de rol devolvería cero filas). El RPC ya filtra por
      // rol admin — un no-admin recibe lista vacía, no un error.
      const { data: sessions, error: rpcErr } = await supabase.rpc("cowork_sesiones_activas_admin");
      if (rpcErr) return err(req, rpcErr.message, 500);
      if (!sessions?.length) return json(req, { sessions: [] });

      const ids = sessions.map((s: { id: string }) => s.id);
      const { data: rooms } = await admin.from("cowork_rooms")
        .select("id, session_id, name, livekit_room_name, sort_order")
        .in("session_id", ids)
        .order("sort_order");
      // La sala LiveKit del Supervisor Hub de cada sesión (no es una fila de
      // cowork_rooms): para contar sus conectados y poder espiarlo en incógnito.
      const { data: hubs } = await admin.from("cowork_sessions")
        .select("id, host_hub_livekit_room").in("id", ids);
      const hubDe = new Map((hubs || []).map((h) => [h.id, h.host_hub_livekit_room as string | null]));

      // Ocupación EN VIVO desde LiveKit: un solo ListRooms trae todas las salas
      // activas con num_participants. Es la verdad del SFU — no presencia de
      // Supabase (a esa ya la vimos tirar el socket bajo carga, #1458) ni
      // asignaciones is_active (quedan activas aunque cierres la pestaña).
      // Si LiveKit no contesta, la lista sale igual con online=null.
      const lkOnline = new Map<string, number>();
      let lkOk = false;
      try {
        const token = await createLKToken(lkKey, lkSecret, `cowork-admin-list-${userId.slice(0, 8)}`, userName, { roomList: true }, 60);
        const httpUrl = lkUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
        const resp = await fetch(`${httpUrl}/twirp/livekit.RoomService/ListRooms`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: "{}",
        });
        if (resp.ok) {
          const j = await resp.json();
          for (const r of (j.rooms || [])) {
            lkOnline.set(r.name, Number(r.numParticipants ?? r.num_participants ?? 0));
          }
          lkOk = true;
        }
      } catch (_e) {
        // LiveKit caído o inalcanzable: contadores en null, la lista no se cae.
      }

      // QUIÉN está en cada sala (asignaciones activas + nombre): el landing
      // decía "3 conectados" pero no quiénes, y Alvaro pedía ver quién está en
      // dónde sin tener que entrar (10/2026). Es la foto de la DB — quién
      // TRABAJA en qué sala, aunque tenga la pestaña cerrada un momento —;
      // la verdad en vivo sigue siendo el conteo de LiveKit de arriba.
      const gentePorSala = new Map<string, string[]>();
      {
        const { data: asigs } = await admin.from("cowork_room_assignments")
          .select("room_id, user_id").in("session_id", ids).eq("is_active", true);
        if (asigs?.length) {
          const uids = [...new Set(asigs.map((a) => a.user_id))];
          const { data: profs } = await admin.from("profiles").select("id, full_name").in("id", uids);
          const nombre = new Map((profs || []).map((p) => [p.id, (p.full_name as string | null) || ""]));
          for (const a of asigs) {
            const n = nombre.get(a.user_id);
            if (!n) continue;
            const list = gentePorSala.get(a.room_id) ?? [];
            list.push(n);
            gentePorSala.set(a.room_id, list);
          }
          for (const list of gentePorSala.values()) list.sort((a, b) => a.localeCompare(b));
        }
      }

      // Admins de incógnito con latido fresco (la vista pinguea cada 60s; 150s
      // tolera un tic perdido). Solo llega acá: esta acción exige rol admin, así
      // que "visible solo para otro admin" lo garantiza el borde.
      const incognitoPorSesion = new Map<string, string[]>();
      {
        const corte = new Date(Date.now() - 150_000).toISOString();
        // Sin el propio solicitante: la marca es para que OTRO admin lo sepa;
        // verse a uno mismo como "también de incógnito" solo confunde.
        const { data: watchers } = await admin.from("cowork_incognito_watch")
          .select("session_id, user_id").in("session_id", ids)
          .gte("last_seen", corte).neq("user_id", userId);
        if (watchers?.length) {
          const uids = [...new Set(watchers.map((w) => w.user_id))];
          const { data: profs } = await admin.from("profiles").select("id, full_name").in("id", uids);
          const nombre = new Map((profs || []).map((p) => [p.id, p.full_name || "Admin"]));
          for (const w of watchers) {
            const list = incognitoPorSesion.get(w.session_id) ?? [];
            list.push(nombre.get(w.user_id) ?? "Admin");
            incognitoPorSesion.set(w.session_id, list);
          }
        }
      }

      // QUIÉN ESTÁ ADENTRO DE VERDAD (Alvaro, 18/11/2026: «Salas en vivo, si lo
      // vas a poner, ponerlo bien» → cada sala con las caras de quién está). Solo
      // las salas con gente según ListRooms; un ListParticipants por sala, en
      // paralelo. Se quitan los que miran escondidos (vigía, incógnito). Si una
      // sala no contesta, queda en null y el inicio usa las asignaciones.
      const adentroPorSala = new Map<string, Array<{ id: string; nombre: string }> | null>();
      if (lkOk) {
        const httpUrl = lkUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
        const conGente = (rooms || []).filter((r) => (lkOnline.get(r.livekit_room_name) ?? 0) > 0).slice(0, 40);
        const idsPorSala = new Map<string, string[]>();
        await Promise.all(conGente.map(async (r) => {
          try {
            const tk = await createLKToken(lkKey, lkSecret, `cowork-admin-lista-${userId.slice(0, 8)}`, userName, { roomAdmin: true, room: r.livekit_room_name }, 60);
            const resp = await fetch(`${httpUrl}/twirp/livekit.RoomService/ListParticipants`, {
              method: "POST",
              headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
              body: JSON.stringify({ room: r.livekit_room_name }),
            });
            if (!resp.ok) { adentroPorSala.set(r.id, null); return; }
            const j = await resp.json();
            const ids = new Set<string>();
            for (const p of (j.participants || []) as Array<{ identity?: string; permission?: { hidden?: boolean } }>) {
              const identidad = p.identity ?? "";
              if (!identidad || p.permission?.hidden || /__(vigia|incognito)/.test(identidad)) continue;
              const base = identidad.split("__")[0];
              if (/^[0-9a-f-]{36}$/i.test(base)) ids.add(base);
            }
            idsPorSala.set(r.id, [...ids]);
          } catch (_e) {
            adentroPorSala.set(r.id, null);
          }
        }));
        const todos = [...new Set([...idsPorSala.values()].flat())];
        let profsAdentro: Array<{ id: string; full_name: string | null }> = [];
        if (todos.length) {
          const { data } = await admin.from("profiles").select("id, full_name").in("id", todos);
          profsAdentro = (data || []) as Array<{ id: string; full_name: string | null }>;
        }
        const nombreDe = new Map(profsAdentro.map((p) => [p.id, p.full_name || ""]));
        for (const [salaId, ids] of idsPorSala) {
          adentroPorSala.set(salaId, ids
            .map((id) => ({ id, nombre: nombreDe.get(id) ?? "" }))
            .sort((a, b) => a.nombre.localeCompare(b.nombre)));
        }
      }

      const result = sessions.map((s: { id: string; [k: string]: unknown }) => {
        const sessRooms = (rooms || []).filter((r) => r.session_id === s.id);
        const roomList = sessRooms.map((r) => ({
          id: r.id,
          name: r.name,
          online: lkOk ? (lkOnline.get(r.livekit_room_name) ?? 0) : null,
          gente: gentePorSala.get(r.id) ?? [],
          adentro: adentroPorSala.has(r.id) ? adentroPorSala.get(r.id) : (lkOk ? [] : null),
        }));
        const hubLk = hubDe.get(s.id as string) ?? null;
        return {
          ...s,
          rooms: roomList,
          online: lkOk ? roomList.reduce((acc, r) => acc + (r.online || 0), 0) : null,
          // Conectados al Supervisor Hub (coordinadores). null = LiveKit no contestó
          // o la sesión no tiene hub.
          hubOnline: lkOk && hubLk ? (lkOnline.get(hubLk) ?? 0) : null,
          incognito: incognitoPorSesion.get(s.id as string) ?? [],
        };
      });
      return json(req, { sessions: result });
    }

    // ═══════════════════════════════════════════════════════════════
    // JOIN SESSION (as participant or host)
    // ═══════════════════════════════════════════════════════════════
    if (action === "joinSession") {
      const { sessionId, role, hostCode, roomId } = body;
      if (!sessionId) return err(req, "sessionId required");
      // `porEnlace`: el `roomId` viene del enlace que dio el supervisor (no de una
      // reanudación). Ese enlace MUEVE a la persona aunque ya tenga sala y la deja
      // fija ahí (Alvaro, 18/11/2026). Sin la marca, el roomId solo vale si no
      // tiene sala, como siempre.
      const porEnlace = body.porEnlace === true && esUuid(roomId);

      // Check session exists and is active
      const { data: session } = await admin.from("cowork_sessions").select("*").eq("id", sessionId).eq("status", "active").single();
      if (!session) return err(req, "Session not found or ended");

      // Determine requested role
      let memberRole = "participant";
      if (role === "host") {
        // Vigente = coincide Y no venció. Un código nunca emitido (expires_at
        // null) tampoco vale: entrar como host exige que el creador lo pida hoy.
        const codigoVigente = !!hostCode && hostCode === session.host_invite_code
          && !!session.host_code_expires_at && new Date(session.host_code_expires_at).getTime() > Date.now();
        if (!codigoVigente) {
          // Sin código válido solo pasa un ADMIN: puede entrar como host a
          // cualquier sesión (es su vía para supervisar salas ajenas desde la
          // lista global del landing, sin pedirle el código al coordinador).
          const { data: adminRole } = await admin.from("user_roles")
            .select("user_id").eq("user_id", userId).eq("role", "admin").maybeSingle();
          // …o quien tenga ALCANCE sobre esta sesión por "Permisos de datos" de
          // Cowork: "todos", o "subordinados" si la creó alguien de nivel inferior
          // (RPC cowork_puede_supervisar, 08/09). Antes veían la sesión en el
          // landing pero quedaban en "Solo lectura". Incógnito sigue solo admin.
          let supervisa = false;
          if (!adminRole) {
            const { data: alcance } = await admin.rpc("cowork_puede_supervisar", { _user_id: userId, _session_id: sessionId });
            supervisa = alcance === true;
          }
          if (!adminRole && !supervisa) return err(req, "El enlace de host no es válido o ya venció. Pídele uno nuevo a quien creó la sesión.", 403);
        }
        memberRole = "host";
      }

      // SALA POR DEFECTO (Alvaro, 13/11/2026: «con que estén en un tipo de rol
      // deberían de poder entrar»). El participante solo ve SU sala (RLS), así que
      // quien es nuevo en un Cowork no tiene a cuál entrar y se le pedía código. Sin
      // `roomId`, el servidor elige: su SALA FIJA (18/11/2026, la que le puso el
      // supervisor), si no su última sala de esta sesión, si no la primera.
      const salaPorDefecto = async (): Promise<string | null> => {
        const [fija, { data: ultima }, { data: salas }] = await Promise.all([
          leerSalaFija(admin, sessionId, userId),
          admin.from("cowork_room_assignments")
            .select("room_id").eq("session_id", sessionId).eq("user_id", userId)
            .order("assigned_at", { ascending: false }).limit(1).maybeSingle(),
          admin.from("cowork_rooms").select("id, sort_order").eq("session_id", sessionId),
        ]);
        return elegirSalaPorDefecto({ fija, ultima: (ultima?.room_id as string | undefined) ?? null, salas: salas ?? [] });
      };
      const salaPedida: string | null = roomId ?? (memberRole === "participant" ? await salaPorDefecto() : null);

      // Check if already a member
      const { data: existing } = await admin.from("cowork_memberships").select("id, role").eq("session_id", sessionId).eq("user_id", userId).single();

      if (existing) {
        // Same role → return as-is
        if (existing.role === memberRole) {
          // If participant re-joins with a roomId but has no active assignment, create one
          if (memberRole === "participant" && salaPedida) {
            const { data: currentAssignment } = await admin.from("cowork_room_assignments")
              .select("id, room_id").eq("session_id", sessionId).eq("user_id", userId).eq("is_active", true).maybeSingle();
            const { data: roomCheck } = await admin.from("cowork_rooms")
              .select("id, name").eq("id", salaPedida).eq("session_id", sessionId).maybeSingle();
            if (roomCheck && !currentAssignment) {
              await admin.from("cowork_room_assignments").insert({
                session_id: sessionId, user_id: userId, room_id: salaPedida, assigned_by: userId,
              });
            } else if (roomCheck && porEnlace && currentAssignment && currentAssignment.room_id !== salaPedida) {
              // El enlace del supervisor MUEVE: se apaga la vigente y se crea la
              // nueva (el índice único solo deja una activa por persona y sesión).
              await admin.from("cowork_room_assignments").update({ is_active: false }).eq("id", currentAssignment.id);
              const { error: insErr } = await admin.from("cowork_room_assignments").insert({
                session_id: sessionId, user_id: userId, room_id: salaPedida, assigned_by: userId,
              });
              if (insErr) {
                await admin.from("cowork_room_assignments").update({ is_active: true }).eq("id", currentAssignment.id);
                return err(req, insErr.message, 500);
              }
            }
            if (roomCheck && porEnlace) {
              await guardarSalaFija(admin, { sessionId, userId, roomId: salaPedida, por: userId });
              return json(req, { membership: existing, alreadyJoined: true, roomId: salaPedida, roomName: roomCheck.name });
            }
          }
          return json(req, { membership: existing, alreadyJoined: true });
        }

        // Un HOST nunca se degrada a participante por esta puerta (07/09/2026:
        // a Jhon y al creador de otra sesión los bajó el auto-join de una URL
        // con ?room=). A las salas los hosts entran desde el tablero sin
        // cambiar de rol. Se contesta como si ya estuviera adentro.
        if (existing.role === "host" && memberRole === "participant") {
          return json(req, { membership: existing, alreadyJoined: true, keptHost: true });
        }

        // Different role → update membership
        const { data: updated, error: upErr } = await admin.from("cowork_memberships")
          .update({ role: memberRole })
          .eq("id", existing.id)
          .select()
          .single();
        if (upErr) return err(req, upErr.message, 500);

        if (memberRole === "host") {
          // Switching to host: remove active room assignments (hosts use Hub)
          await admin.from("cowork_room_assignments").update({ is_active: false }).eq("session_id", sessionId).eq("user_id", userId).eq("is_active", true);
        } else if (memberRole === "participant" && salaPedida) {
          // Switching to participant: assign room
          const { data: roomCheck } = await admin.from("cowork_rooms").select("id").eq("id", salaPedida).eq("session_id", sessionId).single();
          if (roomCheck) {
            await admin.from("cowork_room_assignments").update({ is_active: false }).eq("session_id", sessionId).eq("user_id", userId).eq("is_active", true);
            await admin.from("cowork_room_assignments").insert({
              session_id: sessionId, user_id: userId, room_id: salaPedida, assigned_by: userId,
            });
            if (porEnlace) await guardarSalaFija(admin, { sessionId, userId, roomId: salaPedida, por: userId });
          }
        }

        return json(req, { membership: updated, alreadyJoined: true, roleChanged: true });
      }

      // New member
      const { data: membership, error: memErr } = await admin.from("cowork_memberships").insert({
        session_id: sessionId, user_id: userId, role: memberRole,
      }).select().single();
      if (memErr) return err(req, memErr.message, 500);

      // Auto-assign participant to room (la pedida o la de por defecto)
      if (memberRole === "participant" && salaPedida) {
        const { data: roomCheck } = await admin.from("cowork_rooms").select("id").eq("id", salaPedida).eq("session_id", sessionId).single();
        if (roomCheck) {
          await admin.from("cowork_room_assignments").insert({
            session_id: sessionId, user_id: userId, room_id: salaPedida, assigned_by: userId,
          });
          if (porEnlace) await guardarSalaFija(admin, { sessionId, userId, roomId: salaPedida, por: userId });
        }
      }

      return json(req, { membership, alreadyJoined: false });
    }

    // ═══════════════════════════════════════════════════════════════
    // JOIN BY ROOM CODE
    // Canjea el código corto de una sala (cowork_rooms.join_code) por
    // membresía + asignación. Es la puerta de entrada del participante cuando
    // el link largo no sobrevivió al camino (WhatsApp, PWA, copy/paste): el
    // coordinador dicta 6 caracteres y el chatter entra a LA sala que le toca.
    // ═══════════════════════════════════════════════════════════════
    if (action === "joinByCode") {
      // Normalizamos lo que la gente realmente pega: minúsculas, espacios, guiones.
      const code = String(body.code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (code.length !== 6) return err(req, "El código debe tener 6 caracteres");

      const { data: room } = await admin.from("cowork_rooms")
        .select("id, session_id, name").eq("join_code", code).maybeSingle();
      if (!room) return err(req, "Código inválido. Pídele el código a tu coordinador.", 404);
      // El código de una sala de otra agencia es un código inválido: no se
      // confirma que existe.
      if (!miAgencia || (await agenciaDeSesion(admin, room.session_id)) !== miAgencia) {
        return err(req, "Código inválido. Pídele el código a tu coordinador.", 404);
      }

      const { data: session } = await admin.from("cowork_sessions")
        .select("id, name, status").eq("id", room.session_id).maybeSingle();
      if (!session || session.status !== "active") return err(req, "Esa sesión ya finalizó", 410);

      const { data: existing } = await admin.from("cowork_memberships")
        .select("id, role").eq("session_id", room.session_id).eq("user_id", userId).maybeSingle();

      if (!existing) {
        const { error: memErr } = await admin.from("cowork_memberships").insert({
          session_id: room.session_id, user_id: userId, role: "participant",
        });
        if (memErr) return err(req, memErr.message, 500);
      }

      // Un host que canjea un código NO se degrada a participante: los hosts
      // viven en el Hub y entran a las salas desde el dashboard.
      const isHost = existing?.role === "host";
      if (!isHost) {
        // El índice único parcial de asignaciones activas exige desactivar la
        // anterior antes de insertar la nueva.
        await admin.from("cowork_room_assignments").update({ is_active: false })
          .eq("session_id", room.session_id).eq("user_id", userId).eq("is_active", true);
        const { error: asgErr } = await admin.from("cowork_room_assignments").insert({
          session_id: room.session_id, user_id: userId, room_id: room.id, assigned_by: userId,
        });
        if (asgErr) return err(req, asgErr.message, 500);
        // El código lo dio el supervisor: esa es su sala desde ahora (sala fija).
        await guardarSalaFija(admin, { sessionId: room.session_id, userId, roomId: room.id, por: userId });
      }

      return json(req, {
        sessionId: room.session_id, sessionName: session.name,
        roomId: room.id, roomName: room.name, isHost,
      });
    }

    // (assignToRoom removed — participants self-join via URL ?room=X or a room code)

    // ═══════════════════════════════════════════════════════════════
    // ASIGNAR SALA — el anfitrión mueve a una persona a otra sala
    //
    // Alvaro (17/11/2026): cada participante elegía su sala y el anfitrión no
    // podía moverlo. Ahora, desde el tablero, «Mover a otra sala». Se apaga la
    // asignación vigente y se crea la nueva (el índice único solo deja UNA
    // activa por persona y sesión). Al participante le llega por Realtime (su
    // propia fila de cowork_room_assignments) y su vista se reconecta sola a la
    // sala nueva: el token de join_room sale de su asignación activa.
    // ═══════════════════════════════════════════════════════════════
    if (action === "asignarSala") {
      const { sessionId, roomId } = body;
      const target = body.targetUserId;
      if (!esUuid(sessionId) || !esUuid(roomId) || !esUuid(target)) return err(req, "sessionId, roomId y targetUserId requeridos");

      const { data: hostCheck } = await admin.from("cowork_memberships")
        .select("role").eq("session_id", sessionId).eq("user_id", userId).maybeSingle();
      if (hostCheck?.role !== "host") return err(req, "Solo un anfitrión de la sesión puede mover a alguien de sala", 403);

      const { data: sesion } = await admin.from("cowork_sessions")
        .select("id").eq("id", sessionId).eq("status", "active").maybeSingle();
      if (!sesion) return err(req, "La sesión ya no está activa", 404);

      const { data: sala } = await admin.from("cowork_rooms")
        .select("id, name").eq("id", roomId).eq("session_id", sessionId).maybeSingle();
      if (!sala) return err(req, "Esa sala no es de esta sesión", 404);

      const { data: miembro } = await admin.from("cowork_memberships")
        .select("role").eq("session_id", sessionId).eq("user_id", target).maybeSingle();
      // Los anfitriones trabajan desde el Hub, sin sala asignada.
      if (miembro && miembro.role === "host") return err(req, "A un anfitrión no se le asigna sala", 400);

      const { data: actual } = await admin.from("cowork_room_assignments")
        .select("id, room_id").eq("session_id", sessionId).eq("user_id", target).eq("is_active", true).maybeSingle();

      // SALA FIJA (Alvaro, 18/11/2026): lo que hace el supervisor es dejar a la
      // persona fija en esa sala. Si está conectada, además se la mueve ya; si no
      // (o todavía no es miembro de la sesión, pero es de esta agencia), se guarda
      // solo la fija y entra ahí la próxima vez que abra Cowork.
      const decision = decidirAsignarSala({
        rolMiembro: miembro?.role ?? null,
        tieneSalaActiva: !!actual,
        mismaAgencia: miembro ? true : (!!miAgencia && (await agenciaDePersona(admin, target)) === miAgencia),
      });
      if (decision === "fuera") return err(req, "Esa persona no está en esta sesión", 404);
      if (decision === "es-anfitrion") return err(req, "A un anfitrión no se le asigna sala", 400);

      if (decision === "solo-fija") {
        const ok = await guardarSalaFija(admin, { sessionId, userId: target, roomId, por: userId });
        if (!ok) return err(req, "No se pudo guardar la sala fija. Intenta de nuevo.", 500);
        console.log(`[cowork] ${userId} dejó a ${target} fijo en la sala ${roomId} (${sessionId}, sin conectar)`);
        return json(req, { ok: true, soloFija: true, roomId, roomName: sala.name });
      }

      const fija = await guardarSalaFija(admin, { sessionId, userId: target, roomId, por: userId });
      if (actual?.room_id === roomId) return json(req, { ok: true, sinCambio: true, fija, roomId, roomName: sala.name });

      if (actual) {
        const { error: offErr } = await admin.from("cowork_room_assignments").update({ is_active: false }).eq("id", actual.id);
        if (offErr) return err(req, offErr.message, 500);
      }
      const { error: insErr } = await admin.from("cowork_room_assignments").insert({
        session_id: sessionId, user_id: target, room_id: roomId, assigned_by: userId,
      });
      if (insErr) {
        // Si no se pudo crear la nueva, se le devuelve la que tenía: nunca queda sin sala por esto.
        if (actual) await admin.from("cowork_room_assignments").update({ is_active: true }).eq("id", actual.id);
        return err(req, insErr.message, 500);
      }
      console.log(`[cowork] ${userId} movió a ${target} a la sala ${roomId} (${sessionId}) y la dejó fija`);
      return json(req, { ok: true, fija, roomId, roomName: sala.name });
    }

    // ═══════════════════════════════════════════════════════════════
    // LEAVE ROOM (deactivate caller's active assignment)
    // ═══════════════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════════════════
    // LATIDO — el reloj de Cowork (fase 1 del reemplazo de Hubstaff)
    //
    // El participante manda cada 30 s (y al cambiar algo) su estado: cámara,
    // pantalla, detector de cara, pausa. Acá se decide si el reloj CORRE o
    // está DETENIDO (ver _shared/cowork-tiempo.ts) y se guarda como segmentos:
    // mismo estado → se extiende el abierto; distinto → se cierra y se abre
    // otro. La verdad la escribe el servidor: el cliente solo cuenta lo que le
    // pasa, y solo sobre sí mismo (user_id del token).
    // ═══════════════════════════════════════════════════════════════
    if (action === "latido") {
      const { sessionId } = body;
      if (!sessionId) return err(req, "sessionId required");
      const ahora = Date.now();

      // Sin asignación activa no hay sala, y sin sala no hay reloj… salvo el
      // ANFITRIÓN: el supervisor trabaja desde su panel (el Hub), sin sala
      // asignada, y su tiempo ahí cuenta como trabajo (Alvaro, 13/11/2026:
      // Daniel, Breyner, Vanessa y Luis «se la pasan en la parte del supervisor»).
      const { data: asignacion } = await admin.from("cowork_room_assignments")
        .select("room_id").eq("session_id", sessionId).eq("user_id", userId).eq("is_active", true).maybeSingle();
      let esAnfitrion = false;
      if (!asignacion) {
        const { data: membresia } = await admin.from("cowork_memberships")
          .select("role").eq("session_id", sessionId).eq("user_id", userId).maybeSingle();
        esAnfitrion = membresia?.role === "host";
        if (!esAnfitrion) {
          await cerrarSegmentosAbiertos({ userId });
          return json(req, { ok: true, estado: null, motivo: "sin sala" });
        }
      }
      const salaId: string | null = asignacion?.room_id ?? null;

      // La pausa se mira en la base, no en lo que diga el cliente: es lo único
      // que sobrevive a que recargue la pestaña.
      const { data: pausa } = await admin.from("cowork_breaks")
        .select("id").eq("session_id", sessionId).eq("user_id", userId).is("ended_at", null).limit(1).maybeSingle();
      // Y el meet grupal también en la base: mientras tenga una participación
      // abierta, el reloj marca 'meet' y suma (en el meet no se comparte
      // pantalla; sin esto se detendría por "sin pantalla").
      const { data: enMeet } = await admin.from("cowork_meet_participants")
        .select("id").eq("user_id", userId).is("left_at", null).limit(1).maybeSingle();
      // El ANFITRIÓN en un Meet de Maven (salas meet_…) también está en reunión
      // de trabajo (Alvaro, 17/11/2026: Luis salía «fuera» mientras daba un Meet):
      // su cámara y su pantalla se van a la reunión, y el Hub no puede pedirle
      // las dos. Solo anfitriones: el chatter trabaja en su sala.
      let enMeetMaven = false;
      if (esAnfitrion) {
        const { data: llamada } = await admin.from("llamada_maven_latido")
          .select("sala, last_seen_at").eq("user_id", userId).maybeSingle();
        enMeetMaven = enMeetDeMaven(llamada, ahora);
      }

      // La tolerancia del "no hay nadie" la fija la sesión (reglas del
      // supervisor); sin reglas propias, 60 s.
      const { data: sesionReloj } = await admin.from("cowork_sessions")
        .select("alert_rules").eq("id", sessionId).maybeSingle();
      const umbralMs = umbralFueraDeCamaraMs(sesionReloj?.alert_rules);
      // Y qué exige: si el supervisor apagó la pantalla para su equipo
      // (managers), el reloj no se detiene por pantalla. Jhon, 07/09.
      // El anfitrión, cámara y pantalla SIEMPRE (Alvaro, 13/11/2026: «con cámara y
      // pantalla como todos»): las reglas de la sesión son para su equipo.
      let exige = esAnfitrion ? EXIGE_TODO : exigenciasDelReloj(sesionReloj?.alert_rules);
      // Salvo el grupo de Luis (argos_reglas_persona: Luis, Juan Pachas, Grace,
      // Jackeline y Alvaro René — Alvaro, 18/11/2026): ni cámara ni pantalla
      // obligatorias; su tiempo cuenta mientras estén conectados. Lo dice la
      // base, nunca el navegador.
      if (esAnfitrion) {
        const { data: regla } = await admin.from("argos_reglas_persona")
          .select("pantalla_obligatoria, camara_obligatoria").eq("user_id", userId).maybeSingle();
        if (regla) {
          exige = { camara: regla.camara_obligatoria !== false, pantalla: regla.pantalla_obligatoria !== false };
        }
      }

      // El tramo abierto se lee ANTES de decidir: si la sala está caída, qué se
      // paga depende de él (y de las caídas de la última hora). Nunca de un dato
      // del navegador.
      const { data: abierto } = await admin.from("cowork_tiempo_segmentos")
        .select("id, estado, room_id, session_id, started_at, last_seen_at, equipo")
        .eq("user_id", userId).is("ended_at", null).maybeSingle();
      const vigente = !!abierto
        && (abierto.room_id ?? null) === salaId && abierto.session_id === sessionId
        && ahora - new Date(abierto.last_seen_at).getTime() <= LATIDO_VENCIDO_MS;

      const latido = latidoDeCuerpo(body, { enPausa: !!pausa, enMeet: !!enMeet || enMeetMaven });
      const equipo = equipoDeCuerpo(body);

      // Lo que lleva HOY (día de Bogotá) con el reloj corriendo. Va en cada
      // respuesta para que la persona vea su cronómetro sin otra consulta, y
      // lo publique por presencia para el tablero del supervisor.
      const segundosHoy = async (): Promise<number> => {
        const hoy = new Date(ahora).toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
        const { data } = await admin.rpc("cowork_tiempo_diario", { _desde: hoy, _hasta: hoy, _user_id: userId, _limit: 1, _offset: 0 });
        return Number(data?.[0]?.seg_activo ?? 0);
      };

      // Otro equipo de la misma persona sigue EN la sala y este quedó afuera: no
      // se toca el tramo (si no, se lo pisaban cada 30 s y no sumaba nada). Se
      // contesta con el reloj de verdad para que esta pestaña lo muestre igual.
      if (abierto && latidoDeEquipoAfuera(abierto, equipo, latido.conexionSala, ahora)) {
        return json(req, { ok: true, estado: abierto.estado, detalle: null, segmento: abierto.id, otroEquipo: true, segundosHoy: await segundosHoy() });
      }

      // Solo si dice que se cayó la sala: los demás latidos no pagan esta consulta.
      // Trae lo que la persona VIVIÓ en la última ventana (por último latido, así
      // entra también un tramo largo que empezó antes), más el abierto:
      //  · el presupuesto de caídas pagadas se cuenta en TODAS las sesiones;
      //  · la racha de "venía sin cobrar" se mira en ESTA sesión.
      let caidaPagada = true;
      if (latido.conexionSala === "desconectada") {
        const { data: recientes } = await admin.from("cowork_tiempo_segmentos")
          .select("id, session_id, estado, started_at, ended_at, last_seen_at")
          .eq("user_id", userId)
          .gte("last_seen_at", new Date(ahora - VENTANA_SIN_CONEXION_MS - TOPE_SIN_CONEXION_MS).toISOString());
        const tramos = (recientes ?? []) as Array<TramoGuardado & { id: string; session_id: string }>;
        if (abierto && !tramos.some((t) => t.id === abierto.id)) tramos.push({ ...abierto, ended_at: null });
        caidaPagada = caidaSePaga(
          noCobrabaAlCaerse(tramos.filter((t) => t.session_id === sessionId), ahora),
          sinConexionPagadaMs(tramos, ahora, vigente && abierto?.estado === "sin_conexion"),
        );
      }
      const { estado, detalle } = estadoDeTiempo(latido, ahora, umbralMs, exige, caidaPagada);

      const ahoraIso = new Date(ahora).toISOString();
      if (abierto) {
        const mismo = vigente && abierto.estado === estado;
        if (mismo) {
          // Se anota QUÉ equipo lo estiró: es con lo que se decide la próxima vez.
          await admin.from("cowork_tiempo_segmentos").update({ last_seen_at: ahoraIso, equipo }).eq("id", abierto.id);
          return json(req, { ok: true, estado, detalle, segmento: abierto.id, segundosHoy: await segundosHoy() });
        }
        // Cambió el estado (o se perdieron latidos): el anterior termina en el
        // último latido visto y arranca uno nuevo.
        await admin.from("cowork_tiempo_segmentos").update({ ended_at: abierto.last_seen_at }).eq("id", abierto.id);
      }
      const { data: nuevo, error: insErr } = await admin.from("cowork_tiempo_segmentos")
        .insert({ session_id: sessionId, room_id: salaId, user_id: userId, estado, detalle, started_at: ahoraIso, last_seen_at: ahoraIso, equipo })
        .select("id").single();
      if (insErr) return err(req, insErr.message, 500);
      return json(req, { ok: true, estado, detalle, segmento: nuevo.id, segundosHoy: await segundosHoy() });
    }

    // ═══════════════════════════════════════════════════════════════
    // BARRER ASIGNACIONES COLGADAS — host only
    //
    // Las asignaciones quedan `is_active` aunque la persona cierre la pestaña
    // sin salir (el `pagehide` no siempre llega: cierre del navegador, PC
    // apagada, red muerta). Jhon (10/09/2026): "en PLUS 4 aparece Julián si no
    // está conectado" — su último latido era de hacía 12 horas.
    //
    // El latido es la señal buena: llega cada 30 s por HTTP mientras la persona
    // está en la sala. Quien lleva más de 3 minutos sin latir y más de 3
    // minutos asignado (para no barrer a quien acaba de entrar y todavía no
    // late), se da por ido: se apaga su asignación y se cierra su reloj.
    // Lo llama el tablero del supervisor cada un par de minutos.
    // ═══════════════════════════════════════════════════════════════
    if (action === "barrerAsignacionesColgadas") {
      const { sessionId } = body;
      if (!sessionId) return err(req, "sessionId required");
      const { data: hostCheck } = await admin.from("cowork_memberships")
        .select("role").eq("session_id", sessionId).eq("user_id", userId).single();
      if (hostCheck?.role !== "host") return err(req, "Only hosts", 403);

      const corte = new Date(Date.now() - 3 * 60_000).toISOString();
      const { data: activas } = await admin.from("cowork_room_assignments")
        .select("id, user_id").eq("session_id", sessionId).eq("is_active", true).lt("assigned_at", corte);
      if (!activas?.length) return json(req, { ok: true, cerradas: 0 });

      const { data: latidos } = await admin.from("cowork_tiempo_segmentos")
        .select("user_id").in("user_id", activas.map((a: { user_id: string }) => a.user_id)).gt("last_seen_at", corte);
      const vivos = new Set((latidos ?? []).map((l: { user_id: string }) => l.user_id));
      const colgadas = (activas as Array<{ id: string; user_id: string }>).filter((a) => !vivos.has(a.user_id));
      if (!colgadas.length) return json(req, { ok: true, cerradas: 0 });

      await admin.from("cowork_room_assignments").update({ is_active: false }).in("id", colgadas.map((a) => a.id));
      for (const a of colgadas) await cerrarSegmentosAbiertos({ userId: a.user_id });
      console.log(`[cowork] barridas ${colgadas.length} asignaciones colgadas en ${sessionId}`);
      return json(req, { ok: true, cerradas: colgadas.length });
    }

    if (action === "leaveRoom") {
      const { sessionId } = body;
      if (!sessionId) return err(req, "sessionId required");

      // Idempotent: just deactivate any active assignment for this user in this session.
      // No-op if there isn't one.
      await admin.from("cowork_room_assignments")
        .update({ is_active: false })
        .eq("session_id", sessionId)
        .eq("user_id", userId)
        .eq("is_active", true);
      await cerrarSegmentosAbiertos({ userId });

      return json(req, { ok: true });
    }

    // ═══════════════════════════════════════════════════════════════
    // INCÓGNITO: latido / salida (solo rol admin)
    // ═══════════════════════════════════════════════════════════════
    // La vista incógnito pinguea cada 60s mientras está montada, y avisa al
    // salir. Sin latido fresco la fila caduca sola (adminListSessions filtra
    // por last_seen), así que un cierre sucio de la pestaña no deja un
    // "de incógnito" fantasma para siempre.
    if (action === "incognitoPing" || action === "incognitoLeave") {
      const { sessionId } = body;
      if (!sessionId) return err(req, "sessionId required");
      const { data: adminRole } = await admin.from("user_roles")
        .select("user_id").eq("user_id", userId).eq("role", "admin").maybeSingle();
      if (!adminRole) return err(req, "Solo admins", 403);
      if (action === "incognitoLeave") {
        await admin.from("cowork_incognito_watch").delete()
          .eq("session_id", sessionId).eq("user_id", userId);
      } else {
        await admin.from("cowork_incognito_watch").upsert({
          session_id: sessionId, user_id: userId, last_seen: new Date().toISOString(),
        });
      }
      return json(req, { ok: true });
    }

    // ═══════════════════════════════════════════════════════════════
    // ISSUE LIVEKIT TOKEN
    // ═══════════════════════════════════════════════════════════════
    // ── Meet grupal (Jhon, 10/09/2026) ─────────────────────────────────────
    // El supervisor se lleva a la gente de una o varias salas a una sala
    // temporal. Solo hosts. Queda registro por persona (desde qué sala, cuánto)
    // porque ese tiempo SUMA al reloj y se reporta aparte.
    if (action === "crearMeetGrupal") {
      const { sessionId, roomIds } = body;
      if (!sessionId || !Array.isArray(roomIds) || !roomIds.length) return err(req, "sessionId and roomIds required");
      const { data: hostCheck } = await admin.from("cowork_memberships")
        .select("role").eq("session_id", sessionId).eq("user_id", userId).single();
      if (hostCheck?.role !== "host") return err(req, "Only hosts", 403);

      const { data: gente } = await admin.from("cowork_room_assignments")
        .select("user_id, room_id").eq("session_id", sessionId).eq("is_active", true).in("room_id", roomIds);
      const personas = ((gente ?? []) as Array<{ user_id: string; room_id: string }>).filter((a) => a.user_id !== userId);
      if (!personas.length) return err(req, "No hay nadie en esas salas");

      const meetId = crypto.randomUUID();
      const { data: meet, error: meetErr } = await admin.from("cowork_meets").insert({
        id: meetId, session_id: sessionId, created_by: userId,
        livekit_room_name: `cowork_meet_${sessionId.slice(0, 8)}_${meetId.slice(0, 8)}`,
      }).select("*").single();
      if (meetErr || !meet) return err(req, meetErr?.message || "No se pudo crear el meet", 500);

      // Nadie está en dos meets: si alguien seguía en otro abierto, sale de aquel.
      await admin.from("cowork_meet_participants")
        .update({ left_at: new Date().toISOString(), left_reason: "volvio" })
        .in("user_id", personas.map((p) => p.user_id)).is("left_at", null);
      const { error: partErr } = await admin.from("cowork_meet_participants").insert(
        personas.map((p) => ({ meet_id: meetId, session_id: sessionId, user_id: p.user_id, room_id: p.room_id })),
      );
      if (partErr) return err(req, partErr.message, 500);
      console.log(`[cowork] meet grupal ${meetId} en ${sessionId}: ${personas.length} personas de ${roomIds.length} salas`);
      return json(req, { meet, participantes: personas.length });
    }

    if (action === "terminarMeetGrupal") {
      const { meetId, reason } = body;
      if (!meetId) return err(req, "meetId required");
      const { data: meet } = await admin.from("cowork_meets")
        .select("id, session_id, created_by, ended_at").eq("id", meetId).single();
      if (!meet) return err(req, "Meet not found", 404);
      if (meet.created_by !== userId) {
        const { data: hostCheck } = await admin.from("cowork_memberships")
          .select("role").eq("session_id", meet.session_id).eq("user_id", userId).single();
        if (hostCheck?.role !== "host") return err(req, "Only hosts", 403);
      }
      if (meet.ended_at) return json(req, { ok: true, yaTerminado: true });
      const ahoraIso = new Date().toISOString();
      await admin.from("cowork_meet_participants")
        .update({ left_at: ahoraIso, left_reason: "meet_terminado" }).eq("meet_id", meetId).is("left_at", null);
      await admin.from("cowork_meets")
        .update({ ended_at: ahoraIso, end_reason: reason === "supervisor_salio" ? "supervisor_salio" : "terminado" }).eq("id", meetId);
      return json(req, { ok: true });
    }

    // El chatter vuelve a su sala por su cuenta. El meet sigue para los demás.
    if (action === "salirDeMeetGrupal") {
      const { meetId } = body;
      if (!meetId) return err(req, "meetId required");
      await admin.from("cowork_meet_participants")
        .update({ left_at: new Date().toISOString(), left_reason: "volvio" })
        .eq("meet_id", meetId).eq("user_id", userId).is("left_at", null);
      return json(req, { ok: true });
    }

    // ═══════════════════════════════════════════════════════════════
    // OBSERVAR A UNA PERSONA (vista en vivo de Argos · Alvaro, 11/11/2026)
    // ═══════════════════════════════════════════════════════════════
    // Al tocar un aviso de Argos o de «se salió de Cowork», el dueño, RR. HH. o
    // su supervisor ven a ESA persona en vivo: su pantalla y su cámara. Es el
    // mismo observador que el incógnito (hidden + solo suscribirse; el token no
    // deja publicar nada), pero:
    //   · la llave no es «ser admin» sino puede_vigilar (la base decide: dueño a
    //     todos, RR. HH. a todos menos admins y dueño, supervisor solo su equipo);
    //   · no hace falta saber la sesión ni la sala: se resuelven aquí desde la
    //     asignación viva de la persona, y si tiene más de una se elige la sala
    //     donde LiveKit la ve conectada AHORA;
    //   · no crea membresía (no aparece en el tablero del anfitrión).
    // El navegador se suscribe solo a las pistas de esa persona (autoSubscribe
    // apagado). Si no está en Cowork, responde enCowork:false (la vista muestra
    // el video de esos minutos).
    if (action === "observarPersona") {
      const target = body.targetUserId;
      if (!esUuid(target)) return err(req, "targetUserId required");
      // Con el cliente del USUARIO: puede_vigilar mira auth.uid().
      const { data: puede, error: permErr } = await supabase.rpc("puede_vigilar", { _target: target });
      if (permErr) return err(req, "No se pudo verificar el permiso", 503);
      if (puede !== true) return err(req, "No puedes ver a esta persona", 403);

      const { data: asigs, error: asigErr } = await admin.from("cowork_room_assignments")
        .select("session_id, room_id, assigned_at").eq("user_id", target).eq("is_active", true)
        .order("assigned_at", { ascending: false }).limit(5);
      if (asigErr) return err(req, asigErr.message, 500);
      if (!asigs?.length) return json(req, { enCowork: false });

      const sesIds = [...new Set(asigs.map((a) => a.session_id as string))];
      const salaIds = [...new Set(asigs.map((a) => a.room_id as string).filter(Boolean))];
      const [{ data: sesiones }, { data: salas }] = await Promise.all([
        admin.from("cowork_sessions").select("id, name, status").in("id", sesIds).eq("status", "active"),
        salaIds.length
          ? admin.from("cowork_rooms").select("id, name, livekit_room_name, session_id").in("id", salaIds)
          : Promise.resolve({ data: [] as Array<{ id: string; name: string; livekit_room_name: string; session_id: string }> }),
      ]);
      const sesionPor = new Map((sesiones ?? []).map((s) => [s.id as string, s as { id: string; name: string }]));
      const salaPor = new Map((salas ?? []).map((r) => [r.id as string, r as { id: string; name: string; livekit_room_name: string; session_id: string }]));
      const candidatas: Array<{ sesion: { id: string; name: string }; sala: { id: string; name: string; livekit_room_name: string } }> = [];
      for (const a of asigs) {
        const sesion = sesionPor.get(a.session_id as string);
        const sala = salaPor.get(a.room_id as string);
        if (!sesion || !sala || sala.session_id !== sesion.id) continue;
        // Agencia: una sesión de otra agencia es como si no existiera.
        const agenciaSesion = await agenciaDeSesion(admin, sesion.id);
        if (!miAgencia || agenciaSesion !== miAgencia) continue;
        candidatas.push({ sesion, sala });
      }
      if (!candidatas.length) return json(req, { enCowork: false });

      // ¿En cuál está conectada ahora? La verdad es LiveKit (ListParticipants).
      // Si LiveKit no contesta, se elige la asignación más reciente.
      const httpUrl = lkUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
      let elegida = candidatas[0];
      let presente: boolean | null = null;
      for (const c of candidatas) {
        try {
          const tk = await createLKToken(lkKey, lkSecret, `cowork-vigia-lista-${userId.slice(0, 8)}`, userName, { roomAdmin: true, room: c.sala.livekit_room_name }, 60);
          const resp = await fetch(`${httpUrl}/twirp/livekit.RoomService/ListParticipants`, {
            method: "POST",
            headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
            body: JSON.stringify({ room: c.sala.livekit_room_name }),
          });
          if (!resp.ok) continue;
          const j = await resp.json();
          const esta = (j.participants || []).some((p: { identity?: string }) => p.identity === target);
          presente = presente === true ? true : esta;
          if (esta) { elegida = c; break; }
        } catch (_e) {
          // LiveKit caído: se queda la más reciente y presente=null («no se sabe»).
        }
      }

      const tabRaw = typeof body.clientId === "string" ? body.clientId : "";
      const tab = tabRaw.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
      const identity = tab ? `${userId}__vigia__${tab}` : `${userId}__vigia`;
      const token = await createLKToken(lkKey, lkSecret, identity, userName, {
        roomJoin: true, room: elegida.sala.livekit_room_name, canPublish: false, canSubscribe: true, canPublishData: false, hidden: true,
      }, 3600);
      return json(req, {
        enCowork: true,
        presente,
        token,
        url: lkUrl,
        room: elegida.sala.livekit_room_name,
        roomId: elegida.sala.id,
        roomName: elegida.sala.name,
        sessionId: elegida.sesion.id,
        sessionName: elegida.sesion.name,
        // La identidad de la persona en la sala (join_room usa su id tal cual).
        identidad: target,
      });
    }

    if (action === "issueLiveKitToken") {
      const { sessionId, purpose, roomId, meetId } = body;
      // purpose: "join_room" | "join_host_hub" | "join_meet_grupal" (+ meetId)
      if (!sessionId || !purpose) return err(req, "sessionId and purpose required");

      const { data: membership } = await admin.from("cowork_memberships").select("role").eq("session_id", sessionId).eq("user_id", userId).single();

      // INCÓGNITO (solo rol admin): observador OCULTO de una sala — no publica
      // nada, no aparece en la lista de participantes y NO crea membresía (una
      // membresía lo delataría en el tablero del host). Es el único purpose que
      // no exige ser miembro; se resuelve ANTES del check de membresía.
      if (purpose === "incognito_room") {
        const { data: adminRole } = await admin.from("user_roles")
          .select("user_id").eq("user_id", userId).eq("role", "admin").maybeSingle();
        if (!adminRole) return err(req, "Solo admins", 403);
        if (!roomId) return err(req, "roomId required");
        // roomId="hub" espía el Supervisor Hub de la sesión (no es una fila de
        // cowork_rooms: su sala LiveKit vive en cowork_sessions).
        let lkRoomName: string;
        if (roomId === "hub") {
          const { data: sess } = await admin.from("cowork_sessions")
            .select("host_hub_livekit_room").eq("id", sessionId).single();
          if (!sess?.host_hub_livekit_room) return err(req, "Hub not found");
          lkRoomName = sess.host_hub_livekit_room;
        } else {
          const { data: room } = await admin.from("cowork_rooms").select("livekit_room_name, session_id").eq("id", roomId).single();
          if (!room || room.session_id !== sessionId) return err(req, "Room not found");
          lkRoomName = room.livekit_room_name;
        }
        // Identidad con id de pestaña, como el monitor: dos vistas incógnito de
        // la misma cuenta no deben expulsarse entre sí.
        const tabRaw = typeof body.clientId === "string" ? body.clientId : "";
        const tab = tabRaw.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
        const identity = tab ? `${userId}__incognito__${tab}` : `${userId}__incognito`;
        const token = await createLKToken(lkKey, lkSecret, identity, userName, {
          roomJoin: true, room: lkRoomName, canPublish: false, canSubscribe: true, canPublishData: false, hidden: true,
        }, 3600);
        // Registro admin-a-admin: invisible para TODOS en LiveKit, pero otro
        // admin sí ve quién está de incógnito (lo lee solo adminListSessions).
        await admin.from("cowork_incognito_watch").upsert({
          session_id: sessionId, user_id: userId, last_seen: new Date().toISOString(),
        });
        return json(req, { token, url: lkUrl, room: lkRoomName });
      }

      if (!membership) return err(req, "Not a member of this session", 403);

      const isHost = membership.role === "host";

      // Meet grupal: entran quienes tienen participación abierta y los hosts de
      // la sesión (el que lo invocó y cualquier otro supervisor).
      if (purpose === "join_meet_grupal") {
        if (!meetId) return err(req, "meetId required");
        const { data: meet } = await admin.from("cowork_meets")
          .select("id, session_id, livekit_room_name, ended_at").eq("id", meetId).single();
        if (!meet || meet.session_id !== sessionId) return err(req, "Meet not found", 404);
        if (meet.ended_at) return err(req, "El meet ya terminó", 410);
        const esHost = membership?.role === "host";
        if (!esHost) {
          const { data: part } = await admin.from("cowork_meet_participants")
            .select("id").eq("meet_id", meetId).eq("user_id", userId).is("left_at", null).limit(1).maybeSingle();
          if (!part) return err(req, "No estás en este meet", 403);
        }
        const token = await createLKToken(lkKey, lkSecret, userId, userName, {
          roomJoin: true, room: meet.livekit_room_name, canPublish: true, canSubscribe: true, canPublishData: true, roomAdmin: esHost,
        }, 3600 * 4);
        return json(req, { token, url: lkUrl, room: meet.livekit_room_name });
      }

      if (purpose === "join_host_hub") {
        if (!isHost) return err(req, "Only hosts can join host hub", 403);
        const { data: session } = await admin.from("cowork_sessions").select("host_hub_livekit_room").eq("id", sessionId).single();
        if (!session) return err(req, "Session not found");

        const identity = userId;
        const token = await createLKToken(lkKey, lkSecret, identity, userName, {
          roomJoin: true, room: session.host_hub_livekit_room, canPublish: true, canSubscribe: true, canPublishData: true, roomAdmin: true,
        });
        return json(req, { token, url: lkUrl, room: session.host_hub_livekit_room });
      }

      if (purpose === "join_room") {
        let targetRoomId = roomId;

        if (!isHost) {
          // Participant: can only join their assigned room
          const { data: assignment } = await admin.from("cowork_room_assignments").select("room_id").eq("session_id", sessionId).eq("user_id", userId).eq("is_active", true).single();
          if (!assignment) return err(req, "No room assignment found");
          targetRoomId = assignment.room_id;
        }

        if (!targetRoomId) return err(req, "roomId required for hosts joining a room");

        const { data: room } = await admin.from("cowork_rooms").select("livekit_room_name").eq("id", targetRoomId).eq("session_id", sessionId).maybeSingle();
        if (!room) return err(req, "Room not found");

        // TODOS los miembros de la sala pueden compartir pantalla directo (pedido del
        // owner 2026-07-20). Antes el token de participante excluía screen_share
        // (canPublishSources: camera+mic) y forzaba el flujo pedir-permiso→aprobar→
        // token especial — el botón "no hacía nada" para no-supervisores.
        const identity = userId;
        const grants: LKGrants = {
          roomJoin: true, room: room.livekit_room_name, canPublish: true, canSubscribe: true, canPublishData: true, roomAdmin: isHost,
        };

        const token = await createLKToken(lkKey, lkSecret, identity, userName, grants);
        return json(req, { token, url: lkUrl, room: room.livekit_room_name, roomId: targetRoomId });
      }

      // PREVIEW: el host se suscribe a una sala en modo SOLO-LECTURA para ver el video en
      // vivo en la miniatura del dashboard, SIN publicar (canPublish:false) y como observador
      // OCULTO (hidden:true → no aparece en la lista de participantes de la sala). Identity
      // distinta (`${userId}__preview`) para no colisionar si el host también "Entra" a la sala.
      if (purpose === "preview_room") {
        if (!isHost) return err(req, "Only hosts can preview rooms", 403);
        if (!roomId) return err(req, "roomId required");
        const { data: room } = await admin.from("cowork_rooms").select("livekit_room_name").eq("id", roomId).eq("session_id", sessionId).maybeSingle();
        if (!room) return err(req, "Room not found");
        const token = await createLKToken(lkKey, lkSecret, `${userId}__preview`, userName, {
          roomJoin: true, room: room.livekit_room_name, canPublish: false, canSubscribe: true, canPublishData: false, hidden: true,
        }, 3600);
        return json(req, { token, url: lkUrl, room: room.livekit_room_name });
      }

      // MONITOR: el host, desde el dashboard, se conecta al audio de una sala para ESCUCHARLA
      // y, cuando quiere, HABLARLE (publica su micro). A diferencia de preview_room, NO es
      // hidden (para que los participantes lo escuchen/vean como "📢 Coordinador") y solo puede
      // publicar micrófono (nunca cámara/pantalla). Identity distinta para no colisionar con
      // "Entrar" a la sala (que usa userId).
      if (purpose === "monitor_room") {
        if (!isHost) return err(req, "Only hosts can monitor rooms", 403);
        if (!roomId) return err(req, "roomId required");
        const { data: room } = await admin.from("cowork_rooms").select("livekit_room_name").eq("id", roomId).eq("session_id", sessionId).maybeSingle();
        if (!room) return err(req, "Room not found");
        // La identidad lleva el id de la PESTAÑA, no solo el del usuario.
        //
        // Con `${userId}__monitor` a secas, la misma persona con el tablero
        // abierto dos veces (otra pestaña, la app instalada además del
        // navegador, otra máquina) generaba DOS monitores con la misma
        // identidad en cada sala, y LiveKit expulsa al que estaba. El expulsado
        // no vuelve a publicar su micro nunca —el efecto que lo publica está
        // guardado por `status !== "ready"`— mientras el botón sigue verde.
        //
        // Se sanea porque viene del cliente: solo minúsculas y dígitos, corto.
        // Nunca se interpola algo de afuera en una identidad sin acotarlo.
        const tabRaw = typeof body.clientId === "string" ? body.clientId : "";
        const tab = tabRaw.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
        const monitorIdentity = tab ? `${userId}__monitor__${tab}` : `${userId}__monitor`;
        // camera y screen_share: el dashboard ahora puede broadcastear la cámara
        // y la pantalla del coordinador a las salas (clones, igual que el micro).
        const token = await createLKToken(lkKey, lkSecret, monitorIdentity, `📢 ${userName}`, {
          roomJoin: true, room: room.livekit_room_name, canPublish: true, canSubscribe: true, canPublishData: false, canPublishSources: ["microphone", "camera", "screen_share"],
        }, 3600);
        return json(req, { token, url: lkUrl, room: room.livekit_room_name });
      }

      return err(req, "Invalid purpose");
    }

    // (moveParticipant removed — participants self-join via URL ?room=X)

    // ═══════════════════════════════════════════════════════════════
    // REQUEST HOST
    // ═══════════════════════════════════════════════════════════════
    if (action === "requestHost") {
      const { sessionId, roomId, message, requestOneOnOne } = body;
      if (!sessionId || !roomId) return err(req, "sessionId and roomId required");
      // Solo quien está en la sesión, y desde una sala de ESA sesión: antes
      // cualquiera con sesión iniciada le metía pedidos al tablero de otro.
      const { data: miembro } = await admin.from("cowork_memberships")
        .select("role").eq("session_id", sessionId).eq("user_id", userId).maybeSingle();
      if (!miembro) return err(req, "Not a member of this session", 403);
      const { data: salaDelPedido } = await admin.from("cowork_rooms")
        .select("id").eq("id", roomId).eq("session_id", sessionId).maybeSingle();
      if (!salaDelPedido) return err(req, "Room not found");

      // Check for existing open/acknowledged request from this user
      const { data: existingReq } = await admin.from("cowork_host_requests")
        .select("*")
        .eq("session_id", sessionId)
        .eq("user_id", userId)
        .in("status", ["open", "acknowledged"])
        .maybeSingle();

      if (existingReq) {
        // Allow upgrading a simple request to a 1:1 call
        if (requestOneOnOne && !existingReq.oneone_livekit_room) {
          // Resolve the old simple request
          await admin.from("cowork_host_requests")
            .update({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: userId })
            .eq("id", existingReq.id);
          // Fall through to create a new 1:1 request below
        } else {
          return json(req, { request: existingReq, oneone_livekit_room: existingReq.oneone_livekit_room });
        }
      }

      const requestId = crypto.randomUUID();
      const oneoneRoom = requestOneOnOne ? `cowork_1on1_${sessionId.slice(0, 8)}_${requestId.slice(0, 8)}` : null;

      const { data: newHostReq, error: reqErr } = await admin.from("cowork_host_requests").insert({
        id: requestId, session_id: sessionId, room_id: roomId, user_id: userId, message: message || null, oneone_livekit_room: oneoneRoom,
      }).select().single();
      if (reqErr) return err(req, reqErr.message, 500);

      return json(req, { request: newHostReq, oneone_livekit_room: oneoneRoom });
    }

    // ═══════════════════════════════════════════════════════════════
    // JOIN 1:1 ROOM (for host requests)
    // ═══════════════════════════════════════════════════════════════
    if (action === "joinOneOnOne") {
      const { requestId } = body;
      if (!requestId) return err(req, "requestId required");

      const { data: hostReq } = await admin.from("cowork_host_requests").select("*").eq("id", requestId).single();
      if (!hostReq) return err(req, "Request not found");
      if (!hostReq.oneone_livekit_room) return err(req, "No 1:1 room for this request");

      // Validate: caller must be the requester or a host of the session
      const isRequester = hostReq.user_id === userId;
      const { data: membership } = await admin.from("cowork_memberships").select("role").eq("session_id", hostReq.session_id).eq("user_id", userId).single();
      if (!membership) return err(req, "Not a member", 403);
      const callerIsHost = membership.role === "host";

      if (!isRequester && !callerIsHost) return err(req, "Not authorized to join this 1:1 room", 403);

      const identity = userId;
      const token = await createLKToken(lkKey, lkSecret, identity, userName, {
        roomJoin: true, room: hostReq.oneone_livekit_room, canPublish: true, canSubscribe: true, canPublishData: true, roomAdmin: callerIsHost,
      }, 3600);

      return json(req, { token, url: lkUrl, room: hostReq.oneone_livekit_room });
    }

    // ═══════════════════════════════════════════════════════════════
    // ACK / RESOLVE HOST REQUEST
    // ═══════════════════════════════════════════════════════════════
    if (action === "ackHostRequest" || action === "resolveHostRequest") {
      const { requestId } = body;
      if (!requestId) return err(req, "requestId required");

      // Get request to verify session + ownership
      const { data: hostReq } = await admin.from("cowork_host_requests").select("session_id, user_id").eq("id", requestId).single();
      if (!hostReq) return err(req, "Request not found");

      const { data: hostCheck } = await admin.from("cowork_memberships").select("role").eq("session_id", hostReq.session_id).eq("user_id", userId).single();
      const isHostMember = hostCheck?.role === "host";
      const isRequester = hostReq.user_id === userId;
      // Ack: solo host. Resolve: host O el que hizo la solicitud (para cerrar su propia 1:1).
      if (action === "ackHostRequest" && !isHostMember) return err(req, "Only hosts", 403);
      if (action === "resolveHostRequest" && !isHostMember && !isRequester) return err(req, "Not authorized", 403);

      if (action === "ackHostRequest") {
        const { error: upErr } = await admin.from("cowork_host_requests").update({ status: "acknowledged", acked_by: userId, acked_at: new Date().toISOString() }).eq("id", requestId);
        if (upErr) return err(req, upErr.message, 500);
      } else {
        const { error: upErr } = await admin.from("cowork_host_requests").update({ status: "resolved", resolved_by: userId, resolved_at: new Date().toISOString() }).eq("id", requestId);
        if (upErr) return err(req, upErr.message, 500);
      }

      return json(req, { success: true });
    }

    // ═══════════════════════════════════════════════════════════════
    // REQUEST SCREEN SHARE
    // ═══════════════════════════════════════════════════════════════
    if (action === "requestScreenShare") {
      const { sessionId, roomId } = body;
      if (!sessionId || !roomId) return err(req, "sessionId and roomId required");
      // Igual que requestHost: miembro de la sesión y sala de ESA sesión. Antes
      // un pedido apuntaba a una sala ajena y quien lo aprobaba (el mismo, si
      // era host de su propia sesión) recibía un token para publicar en ella.
      const { data: miembro } = await admin.from("cowork_memberships")
        .select("role").eq("session_id", sessionId).eq("user_id", userId).maybeSingle();
      if (!miembro) return err(req, "Not a member of this session", 403);
      const { data: salaDelPedido } = await admin.from("cowork_rooms")
        .select("id").eq("id", roomId).eq("session_id", sessionId).maybeSingle();
      if (!salaDelPedido) return err(req, "Room not found");

      // Check not already pending
      const { data: existing } = await admin.from("cowork_screenshare_requests").select("id").eq("session_id", sessionId).eq("user_id", userId).eq("status", "pending");
      if (existing && existing.length > 0) return err(req, "Already have a pending request");

      const { data: ssReq, error: ssErr } = await admin.from("cowork_screenshare_requests").insert({
        session_id: sessionId, room_id: roomId, user_id: userId,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10min
      }).select().single();
      if (ssErr) return err(req, ssErr.message, 500);

      return json(req, { request: ssReq });
    }

    // ═══════════════════════════════════════════════════════════════
    // APPROVE / DENY SCREEN SHARE
    // ═══════════════════════════════════════════════════════════════
    if (action === "approveScreenShare") {
      const { requestId, approve } = body;
      if (!requestId || approve === undefined) return err(req, "requestId and approve required");

      const { data: ssReq } = await admin.from("cowork_screenshare_requests").select("*").eq("id", requestId).single();
      if (!ssReq) return err(req, "Request not found");

      // Verify host
      const { data: hostCheck } = await admin.from("cowork_memberships").select("role").eq("session_id", ssReq.session_id).eq("user_id", userId).single();
      if (hostCheck?.role !== "host") return err(req, "Only hosts", 403);

      const newStatus = approve ? "approved" : "denied";
      await admin.from("cowork_screenshare_requests").update({
        status: newStatus, decided_by: userId, decided_at: new Date().toISOString(),
      }).eq("id", requestId);

      // If approved, issue a new token with screen share permission
      if (approve) {
        const { data: room } = await admin.from("cowork_rooms").select("livekit_room_name").eq("id", ssReq.room_id).eq("session_id", ssReq.session_id).maybeSingle();
        const { data: requesterProfile } = await admin.from("profiles").select("full_name").eq("id", ssReq.user_id).single();
        if (room) {
          const identity = ssReq.user_id;
          const token = await createLKToken(lkKey, lkSecret, identity, requesterProfile?.full_name || "User", {
            roomJoin: true, room: room.livekit_room_name, canPublish: true, canSubscribe: true, canPublishData: true,
          }, 600); // 10 min token
          return json(req, { success: true, status: newStatus, screenshareToken: token, url: lkUrl, room: room.livekit_room_name });
        }
      }

      return json(req, { success: true, status: newStatus });
    }

    // ═══════════════════════════════════════════════════════════════
    // CLAIM SCREEN SHARE TOKEN (participant claims after approval)
    // ═══════════════════════════════════════════════════════════════
    if (action === "claimScreenShareToken") {
      const { requestId } = body;
      if (!requestId) return err(req, "requestId required");

      const { data: ssReq } = await admin.from("cowork_screenshare_requests").select("*").eq("id", requestId).single();
      if (!ssReq) return err(req, "Request not found");
      if (ssReq.user_id !== userId) return err(req, "Not your request", 403);
      if (ssReq.status !== "approved") return err(req, "Request is not approved");

      // Marcar como usada para sacarla de la lista activa (fetchData solo trae pending/approved).
      // OJO: el CHECK de la tabla NO permite 'claimed' (solo pending/approved/denied/expired) →
      // usar 'claimed' fallaba en silencio y la request quedaba 'approved' para siempre,
      // re-disparando el reclamo en cada montaje. Usamos 'expired'.
      const { error: claimErr } = await admin.from("cowork_screenshare_requests").update({ status: "expired" }).eq("id", requestId);
      if (claimErr) console.error("claimScreenShareToken status update:", claimErr.message);

      // Issue token with full publish permissions (including screen share)
      const { data: room } = await admin.from("cowork_rooms").select("livekit_room_name").eq("id", ssReq.room_id).eq("session_id", ssReq.session_id).maybeSingle();
      if (!room) return err(req, "Room not found");

      const identity = userId;
      const token = await createLKToken(lkKey, lkSecret, identity, userName, {
        roomJoin: true, room: room.livekit_room_name, canPublish: true, canSubscribe: true, canPublishData: true,
      }, 600); // 10 min token

      return json(req, { token, url: lkUrl, room: room.livekit_room_name });
    }

    // ═══════════════════════════════════════════════════════════════
    // END SESSION
    // ═══════════════════════════════════════════════════════════════
    if (action === "endSession") {
      const { sessionId } = body;
      if (!sessionId) return err(req, "sessionId required");

      // Finalizar saca a TODOS y no se puede deshacer. Antes bastaba con ser
      // host, y CHATTERS KASH se finalizó cuatro veces en cuatro días por
      // cuatro hosts distintos que confundían "finalizar" con "salir". Ahora
      // solo quien la creó (o un admin) puede apagarla; los demás hosts salen.
      const { data: sesion } = await admin.from("cowork_sessions")
        .select("id, created_by, status").eq("id", sessionId).maybeSingle();
      if (!sesion) return err(req, "Session not found", 404);
      if (sesion.created_by !== userId && !(await esAdmin(userId))) {
        return err(req, "Solo quien creó la sesión (o un admin) puede finalizarla. Si quieres irte, usa Salir.", 403);
      }
      if (sesion.status === "ended") return json(req, { success: true, yaEstaba: true });

      // Y queda escrito QUIÉN. Hasta hoy la sesión no lo guardaba y hubo que
      // rastrearlo en los registros del servidor, que se borran en semanas.
      const { error: upErr } = await admin.from("cowork_sessions")
        .update({ status: "ended", ended_at: new Date().toISOString(), ended_by: userId })
        .eq("id", sessionId);
      if (upErr) return err(req, upErr.message, 500);
      // Finalizar saca a TODOS: hay que SOLTAR sus asignaciones de sala. Sin
      // esto quedaban is_active=true para siempre (26 colgadas en sesiones ya
      // terminadas el 19/10/2026), y la gente arrastraba pertenencia a sesiones
      // viejas — entrabas a tu link y aparecías en la sala/sesión de otro, o se
      // "mezclaban" las varias sesiones del mismo nombre. leaveSession ya lo
      // hacía; endSession se lo había saltado.
      await admin.from("cowork_room_assignments")
        .update({ is_active: false }).eq("session_id", sessionId).eq("is_active", true);
      await cerrarSegmentosAbiertos({ sessionId });
      return json(req, { success: true });
    }

    // ═══════════════════════════════════════════════════════════════
    // LEAVE SESSION — un host que NO creó la sesión se va de ella
    //
    // Es la salida que faltaba: sin ella, la única puerta visible para un
    // co-host era "Finalizar", que apaga la sesión para todos. Salir borra la
    // membresía y cierra sus asignaciones; para volver necesita un enlace de
    // host nuevo del creador. El creador no puede salir: su puerta es Finalizar.
    // ═══════════════════════════════════════════════════════════════
    if (action === "leaveSession") {
      const { sessionId } = body;
      if (!sessionId) return err(req, "sessionId required");
      const { data: sesion } = await admin.from("cowork_sessions")
        .select("id, created_by").eq("id", sessionId).maybeSingle();
      if (!sesion) return err(req, "Session not found", 404);
      if (sesion.created_by === userId) {
        return err(req, "Quien creó la sesión no puede salirse de ella: puede finalizarla.", 400);
      }
      await admin.from("cowork_room_assignments")
        .update({ is_active: false }).eq("session_id", sessionId).eq("user_id", userId).eq("is_active", true);
      await cerrarSegmentosAbiertos({ userId });
      const { error: delErr } = await admin.from("cowork_memberships")
        .delete().eq("session_id", sessionId).eq("user_id", userId);
      if (delErr) return err(req, delErr.message, 500);
      return json(req, { success: true });
    }

    // ═══════════════════════════════════════════════════════════════
    // GET HOST CODE (only for existing hosts)
    // ═══════════════════════════════════════════════════════════════
    if (action === "getHostCode") {
      const { sessionId } = body;
      if (!sessionId) return err(req, "sessionId required");

      // El enlace de host es lo que reparte el poder de supervisar (y, antes,
      // de apagar la sesión). Lo pide solo quien la creó o un admin, y VENCE:
      // un link que quedó en un chat hace días ya no convierte en host a nadie.
      // Mientras el código vigente no venza se devuelve el mismo, así el
      // creador puede mandárselo a dos personas seguidas sin que el segundo
      // link mate al primero.
      const { data: session } = await admin.from("cowork_sessions")
        .select("id, created_by, host_invite_code, host_code_expires_at").eq("id", sessionId).maybeSingle();
      if (!session) return err(req, "Session not found", 404);
      if (session.created_by !== userId && !(await esAdmin(userId))) {
        return err(req, "Solo quien creó la sesión (o un admin) puede compartir el enlace de host", 403);
      }

      const vigente = !!session.host_code_expires_at && new Date(session.host_code_expires_at).getTime() > Date.now();
      if (vigente) return json(req, { hostCode: session.host_invite_code, expiresAt: session.host_code_expires_at });

      const hostCode = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
      const expiresAt = new Date(Date.now() + HOST_CODE_TTL_MS).toISOString();
      const { error: upErr } = await admin.from("cowork_sessions")
        .update({ host_invite_code: hostCode, host_code_expires_at: expiresAt })
        .eq("id", sessionId);
      if (upErr) return err(req, upErr.message, 500);
      return json(req, { hostCode, expiresAt });
    }

    // ═══════════════════════════════════════════════════════════════
    // ADD ROOM (host añade una sala a una sesión existente)
    // ═══════════════════════════════════════════════════════════════
    if (action === "addRoom") {
      const { sessionId, name } = body;
      if (!sessionId || !name?.trim()) return err(req, "sessionId and name required");
      const { data: hostCheck } = await admin.from("cowork_memberships").select("role").eq("session_id", sessionId).eq("user_id", userId).single();
      if (hostCheck?.role !== "host") return err(req, "Only hosts", 403);

      const { count } = await admin.from("cowork_rooms").select("*", { count: "exact", head: true }).eq("session_id", sessionId);
      if (count !== null && count >= MAX_SALAS_POR_SESION) {
        return err(req, `Esta sesión ya tiene ${MAX_SALAS_POR_SESION} salas, el máximo. Si necesitan más, avísale al administrador.`);
      }

      const { data: last } = await admin.from("cowork_rooms").select("sort_order").eq("session_id", sessionId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
      const nextOrder = (last?.sort_order ?? -1) + 1;
      // LiveKit room name único (sufijo aleatorio, no índice: las salas se pueden borrar).
      const lkName = `cowork_${sessionId.slice(0, 8)}_${crypto.randomUUID().slice(0, 8)}`;

      const { data: room, error: rErr } = await admin.from("cowork_rooms").insert({
        session_id: sessionId, name: String(name).trim().slice(0, 80), livekit_room_name: lkName, sort_order: nextOrder,
      }).select().single();
      if (rErr) return err(req, rErr.message, 500);
      return json(req, { room });
    }

    // ═══════════════════════════════════════════════════════════════
    // UPDATE SESSION (renombrar la sesión) — host only
    // El nombre se elegía al crear y no se podía tocar; con sesiones que duran
    // semanas ("Chatters mañana") eso obligaba a cerrar y rehacer todo.
    // ═══════════════════════════════════════════════════════════════
    // ═══════════════════════════════════════════════════════════════
    // PAUSAS (baño / break)
    //
    // Los tiempos los pone el SERVIDOR con now(). Antes la pausa solo vivia en
    // el navegador de quien la tomaba: el reloj arrancaba con un Date.now()
    // suyo y nada quedaba guardado. Medir a alguien con el cronometro que el
    // mismo maneja no mide nada, y sin registro no hay historial que revisar.
    // ═══════════════════════════════════════════════════════════════
    if (action === "startBreak") {
      // Tipos válidos: bano / break / almuerzo. Cualquier otra cosa cae a bano.
      const kind = body.kind === "break" ? "break" : body.kind === "almuerzo" ? "almuerzo" : "bano";
      const { data: asignacion } = await admin.from("cowork_room_assignments")
        .select("session_id, room_id").eq("user_id", userId).eq("is_active", true)
        .order("assigned_at", { ascending: false }).limit(1).maybeSingle();
      if (!asignacion?.session_id) return err(req, "No estás en una sala");

      // Si ya habia una abierta, se cierra antes: el indice unico solo permite
      // una por persona, y quedarse trabado sin poder volver seria peor.
      await admin.from("cowork_breaks")
        .update({ ended_at: new Date().toISOString() })
        .eq("user_id", userId).is("ended_at", null);

      const { data: pausa, error: insErr } = await admin.from("cowork_breaks")
        .insert({
          session_id: asignacion.session_id, room_id: asignacion.room_id,
          user_id: userId, kind,
        })
        .select("id, kind, started_at").single();
      if (insErr) return err(req, insErr.message, 500);

      // Tope de la pausa. La sesión puede tener sus propios topes
      // (alert_rules.pausas, los pone el supervisor desde el tablero) y esos
      // mandan; sin reglas propias rige la tabla cowork_break_limits, como
      // hasta ahora (la de la agencia de la sesión). La etiqueta sale siempre de
      // la tabla.
      const { data: sesion } = await admin.from("cowork_sessions")
        .select("alert_rules").eq("id", asignacion.session_id).maybeSingle();
      const topeSesion = minutosDePausaDeSesion(sesion?.alert_rules, kind);
      const limite = await topeDeLaTabla(admin, kind, await agenciaDeSesion(admin, asignacion.session_id));
      return json(req, { break: pausa, limiteMinutos: topeSesion ?? limite?.minutos ?? null, label: limite?.label ?? kind });
    }

    // ═══════════════════════════════════════════════════════════════
    // PAUSA ABIERTA — para rehidratar al recargar la pestaña
    // ═══════════════════════════════════════════════════════════════
    //
    // El navegador guardaba el arranque de la pausa SOLO en memoria. Si la
    // pestaña se recargaba —el banner de actualización, el service worker, un
    // F5— Maven se olvidaba de que la persona estaba en pausa, aunque la fila
    // siguiera abierta en la base. Consecuencias, las dos malas:
    //
    //   · el botón volvía a decir "Baño", así que al volver se abría una
    //     pausa NUEVA en vez de cerrar la anterior, y la primera quedaba
    //     colgada para siempre (nada cierra las pausas abiertas);
    //   · el contador arrancaba de cero, así que el aviso de "se te acabó el
    //     break" no saltaba nunca.
    if (action === "pausaAbierta") {
      const { data: pausa } = await admin.from("cowork_breaks")
        .select("id, kind, started_at, session_id")
        .eq("user_id", userId).is("ended_at", null)
        .order("started_at", { ascending: false }).limit(1).maybeSingle();
      if (!pausa) return json(req, { pausa: null });

      // Mismo criterio que startBreak: el tope de la sesión manda si existe;
      // si no, la tabla. Al rehidratar hay que devolver el MISMO tope que se
      // le dio al arrancar, o el contador cambiaría de límite con un F5.
      const { data: sesion } = await admin.from("cowork_sessions")
        .select("alert_rules").eq("id", pausa.session_id).maybeSingle();
      const topeSesion = minutosDePausaDeSesion(sesion?.alert_rules, pausa.kind);
      const limite = await topeDeLaTabla(admin, pausa.kind, await agenciaDeSesion(admin, pausa.session_id));
      return json(req, { pausa, limiteMinutos: topeSesion ?? limite?.minutos ?? null, label: limite?.label ?? pausa.kind });
    }

    if (action === "endBreak") {
      const { data: cerrada, error: upErr } = await admin.from("cowork_breaks")
        .update({ ended_at: new Date().toISOString() })
        .eq("user_id", userId).is("ended_at", null)
        .select("id, kind, started_at, ended_at, duration_seconds").maybeSingle();
      if (upErr) return err(req, upErr.message, 500);
      return json(req, { break: cerrada });
    }

    // ═══════════════════════════════════════════════════════════════
    // REGISTRAR LLAMADO DE ATENCIÓN (cámara / encuadre / luz / pantalla)
    // ═══════════════════════════════════════════════════════════════
    //
    // Lo llama el navegador de la propia persona cuando un problema ya lleva el
    // tiempo suficiente como para que se le avise al supervisor. Hasta ahora
    // esos avisos se decían por voz, aparecían en la pantalla del supervisor y
    // se perdían: al cerrar la pestaña no quedaba nada.
    //
    // ⚠️ Por ahora esto SOLO registra. No afecta ninguna nota.
    //
    // ── POR QUÉ ACÁ NO SE LE CREE NADA AL CLIENTE ───────────────────────────
    //
    // Esto va a terminar afectando la nota de la gente, así que el defecto que
    // importa no es perder un llamado: es INVENTAR uno. Una acusación falsa le
    // baja un número a alguien que hizo todo bien. Por eso:
    //
    //   · el user_id sale del token y la sala de la asignación real — el cuerpo
    //     no puede anotarle un llamado a otra persona;
    //   · el cliente manda CUÁNTO DURÓ, no CUÁNDO EMPEZÓ, y el inicio lo resta
    //     el servidor. Con una fecha absoluta, un reloj desviado la corría en
    //     cada llamada y cada reintento creaba una fila nueva en vez de estirar
    //     la misma. Una duración es un delta: no le importa en qué hora cree
    //     vivir la máquina de la persona;
    //   · si el rato reclamado se solapa con una pausa registrada, se descarta.
    //     Esta es la garantía importante y por eso vive acá y no en el
    //     navegador: la bandera de pausa del cliente es un booleano en memoria
    //     que NO sobrevive a recargar la pestaña, mientras que la escritura sí
    //     es durable. Alguien que marcó "Break", se fue, y cuya pestaña se
    //     recargó sola, se llevaba un llamado de media hora por estar ausente
    //     justo después de haber avisado que se ausentaba.
    //
    // Se llama repetido a propósito para ir estirando `seconds` mientras el
    // problema sigue. El índice único (user_id, kind, started_at) convierte eso
    // en una actualización en vez de N filas, y un trigger impide que una
    // llamada demorada acorte el llamado.
    if (action === "registrarLlamado") {
      const KINDS = ["camara", "encuadre", "luz", "pantalla"];
      const kind = String(body.kind ?? "");
      if (!KINDS.includes(kind)) return err(req, "kind inválido");

      const { data: asignacion } = await admin.from("cowork_room_assignments")
        .select("session_id, room_id").eq("user_id", userId).eq("is_active", true)
        .order("assigned_at", { ascending: false }).limit(1).maybeSingle();
      // Sin sala activa no hay nada que anotar: esta persona no está en Cowork.
      // No es un error — la llamada puede seguir viva un instante después de
      // que la sacaron de la sala.
      if (!asignacion?.session_id) return json(req, { skipped: "sin sala" });

      // ¿La SESIÓN manda anotar esta categoría? El navegador ya lo decide con
      // las mismas reglas, pero esto va a pesar en la nota de la gente, así que
      // la última palabra la tiene el servidor: un navegador con el bundle viejo
      // en caché, o uno al que no le llegaron las reglas nuevas, no puede
      // anotarle "sin pantalla" a una manager cuya sesión no pide pantalla.
      // Misma regla que la pausa: si no se pudo comprobar, ante la duda no se
      // escribe.
      const { data: sesionDelLlamado, error: sesionErr } = await admin.from("cowork_sessions")
        .select("alert_rules").eq("id", asignacion.session_id).maybeSingle();
      if (sesionErr) return json(req, { skipped: "no se pudo leer las reglas de la sesión" });
      const reglasDelLlamado = sesionDelLlamado?.alert_rules == null
        ? REGLAS_ESTANDAR
        : normalizarReglas(sesionDelLlamado.alert_rules);
      const reglaDelKind = kind === "camara" ? reglasDelLlamado.camara
        : kind === "pantalla" ? reglasDelLlamado.pantalla
        : reglasDelLlamado.encuadre;   // encuadre y luz
      if (!reglaDelKind.activa || reglaDelKind.supervisorSeg === null) {
        return json(req, { skipped: "la sesión no registra esta alerta" });
      }

      const ahora = Date.now();
      const TURNO_MS = 12 * 60 * 60 * 1000;
      const segundos = Math.max(0, Math.min(
        Math.floor(Number(body.seconds) || 0),
        Math.floor(TURNO_MS / 1000),
      ));

      const inicio = new Date(ahora - segundos * 1000);

      // Qué episodio es. Lo sortea el cliente al arrancar su reloj y lo repite
      // mientras el problema siga.
      //
      // Antes esto se resolvía redondeando el inicio al minuto y usándolo como
      // identidad. No alcanzaba: el cliente trunca los segundos a entero, así
      // que la resta se mueve casi un segundo entre llamadas y de vez en cuando
      // cruza el borde del minuto. Una simulación de 20.000 episodios dio 1-2%
      // partidos en dos filas, y las dos siguen creciendo — o sea que sumar
      // duraciones contaba el episodio dos veces.
      //
      // El nonce no le da poder al cliente sobre nada ajeno: la identidad real
      // es (user_id del token, kind, nonce). Lo peor que puede hacer un cliente
      // roto es abrir filas de más para sí mismo.
      const nonce = String(body.nonce ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64)
        // Sin nonce se cae al comportamiento viejo (el minuto redondeado), para
        // que un navegador con el bundle anterior en caché siga registrando.
        || `t${Math.round(inicio.getTime() / 60_000) * 60_000}`;

      // ¿El rato reclamado pisa una pausa? Se mira contra `cowork_breaks`, que
      // es la única fuente que sobrevive a que la persona recargue la pestaña.
      //
      // Se acota a las últimas 12 h porque una pausa que alguien dejó abierta y
      // nunca cerró no debería silenciar los llamados de esa persona para
      // siempre.
      // Una pausa ABIERTA solo cuenta si empezó hace poco. Nada cierra las
      // pausas colgadas —no hay cron, y `endBreak` necesita que la persona
      // apriete "volver"—, así que alguien a quien se le cerró la pestaña
      // durante un break deja una fila abierta para siempre. Sin este límite,
      // esa persona dejaba de registrar llamados por el resto del turno sin que
      // nadie se enterara. Ninguna pausa legítima dura tres horas.
      const PAUSA_ABIERTA_MAX_MS = 3 * 60 * 60 * 1000;
      const { data: pausa, error: pausaErr } = await admin.from("cowork_breaks")
        .select("id")
        .eq("user_id", userId)
        .gt("started_at", new Date(ahora - TURNO_MS).toISOString())
        .lt("started_at", new Date(ahora).toISOString())
        .or(
          `and(ended_at.is.null,started_at.gt.${new Date(ahora - PAUSA_ABIERTA_MAX_MS).toISOString()}),` +
          `ended_at.gt.${inicio.toISOString()}`,
        )
        .limit(1).maybeSingle();
      // Si NO se pudo comprobar, no se escribe. La regla de toda esta acción es
      // que ante la duda se pierde el llamado, y "la consulta falló" es duda:
      // dejarlo pasar convertiría una caída de la base en una tanda de
      // acusaciones falsas contra gente que estaba en su break.
      if (pausaErr) return json(req, { skipped: "no se pudo verificar la pausa" });
      // Se descarta ENTERO, aunque parte del rato caiga fuera de la pausa.
      if (pausa) return json(req, { skipped: "en pausa" });

      const { data: llamado, error: insErr } = await admin.from("cowork_llamados")
        .upsert({
          session_id: asignacion.session_id,
          room_id: asignacion.room_id,
          user_id: userId,
          kind,
          detail: body.detail ? String(body.detail).slice(0, 40) : null,
          nonce,
          started_at: inicio.toISOString(),
          seconds: segundos,
        }, { onConflict: "user_id,kind,nonce" })
        .select("id, kind, started_at, seconds").single();
      if (insErr) return err(req, insErr.message, 500);
      return json(req, { llamado });
    }

    if (action === "updateSession") {
      const { sessionId, name } = body;
      if (!sessionId) return err(req, "sessionId required");
      const clean = String(name ?? "").trim();
      if (!clean) return err(req, "Escribe un nombre para la sesión");

      const { data: hostCheck } = await admin.from("cowork_memberships")
        .select("role").eq("session_id", sessionId).eq("user_id", userId).single();
      if (hostCheck?.role !== "host") return err(req, "Only hosts", 403);

      const { data: updated, error: upErr } = await admin.from("cowork_sessions")
        .update({ name: clean.slice(0, 80), updated_at: new Date().toISOString() })
        .eq("id", sessionId)
        .select("id, name")
        .single();
      if (upErr) return err(req, upErr.message, 500);
      return json(req, { session: updated });
    }

    // ═══════════════════════════════════════════════════════════════
    // SET ALERT RULES (reglas de alerta de la sesión) — host only
    //
    // Las reglas viven en cowork_sessions.alert_rules y aplican a todos los
    // que están en la sesión: el realtime de la fila hace que cada navegador
    // refetchee y las tome en vivo. `rules: null` = volver al estándar; se
    // guarda NULL y no una copia, para que la sesión siga al estándar si este
    // cambia mañana. Lo que llega se normaliza acá (ver normalizarReglas):
    // el cliente propone, el servidor decide qué se escribe.
    // ═══════════════════════════════════════════════════════════════
    if (action === "setAlertRules") {
      const { sessionId, rules } = body;
      if (!sessionId) return err(req, "sessionId required");
      // Se exige la clave: un cuerpo sin `rules` es un cliente roto, no un
      // pedido de volver al estándar. Un array o un escalar tampoco valen.
      if (!("rules" in body) || (rules !== null && (typeof rules !== "object" || Array.isArray(rules)))) {
        return err(req, "rules debe ser null (estándar) o un objeto");
      }

      const { data: hostCheck } = await admin.from("cowork_memberships")
        .select("role").eq("session_id", sessionId).eq("user_id", userId).single();
      if (hostCheck?.role !== "host") return err(req, "Only hosts", 403);

      const reglas = rules === null ? null : normalizarReglas(rules);
      const ahora = new Date().toISOString();
      // Queda registrado QUIÉN y CUÁNDO. Antes solo se movía `updated_at`, que
      // también cambia al renombrar la sesión, así que no había forma de saber
      // quién había apagado las alertas de una sala (Jhon, 09/09/2026).
      // Al volver al estándar se limpia el autor: no hay nada personalizado que
      // atribuirle a nadie.
      const { data: updated, error: upErr } = await admin.from("cowork_sessions")
        .update({
          alert_rules: reglas,
          updated_at: ahora,
          alert_rules_updated_by: reglas === null ? null : userId,
          alert_rules_updated_at: reglas === null ? null : ahora,
        })
        .eq("id", sessionId)
        .select("id, alert_rules, alert_rules_updated_by, alert_rules_updated_at")
        .single();
      if (upErr) return err(req, upErr.message, 500);
      return json(req, { session: updated });
    }

    // ═══════════════════════════════════════════════════════════════
    // UPDATE ROOM (renombrar y/o cambiar preview_mode) — host only
    // ═══════════════════════════════════════════════════════════════
    if (action === "updateRoom") {
      const { roomId, name, previewMode } = body;
      if (!roomId) return err(req, "roomId required");
      const { data: room } = await admin.from("cowork_rooms").select("session_id").eq("id", roomId).single();
      if (!room) return err(req, "Room not found");
      const { data: hostCheck } = await admin.from("cowork_memberships").select("role").eq("session_id", room.session_id).eq("user_id", userId).single();
      if (hostCheck?.role !== "host") return err(req, "Only hosts", 403);

      const patch: Record<string, unknown> = {};
      if (typeof name === "string" && name.trim()) patch.name = name.trim().slice(0, 80);
      if (previewMode === "video" || previewMode === "avatars") patch.preview_mode = previewMode;
      if (!Object.keys(patch).length) return err(req, "Nothing to update");

      const { data: updated, error: uErr } = await admin.from("cowork_rooms").update(patch).eq("id", roomId).select().single();
      if (uErr) return err(req, uErr.message, 500);
      return json(req, { room: updated });
    }

    // ═══════════════════════════════════════════════════════════════
    // CLOSE ROOM (borra la sala + desasigna a sus participantes) — host only
    // ═══════════════════════════════════════════════════════════════
    if (action === "closeRoom") {
      const { roomId } = body;
      if (!roomId) return err(req, "roomId required");
      const { data: room } = await admin.from("cowork_rooms").select("session_id").eq("id", roomId).single();
      if (!room) return err(req, "Room not found");
      const { data: hostCheck } = await admin.from("cowork_memberships").select("role").eq("session_id", room.session_id).eq("user_id", userId).single();
      if (hostCheck?.role !== "host") return err(req, "Only hosts", 403);

      const { count } = await admin.from("cowork_rooms").select("*", { count: "exact", head: true }).eq("session_id", room.session_id);
      if (count !== null && count <= 1) return err(req, "No puedes cerrar la última sala de la sesión");

      // Sacar a los participantes asignados (su asignación queda inactiva) y borrar la sala.
      await admin.from("cowork_room_assignments").update({ is_active: false }).eq("room_id", roomId).eq("is_active", true);
      const { error: dErr } = await admin.from("cowork_rooms").delete().eq("id", roomId);
      if (dErr) return err(req, dErr.message, 500);
      return json(req, { ok: true });
    }

    return err(req, "Unknown action: " + action);
  } catch (e) {
    console.error("cowork-session error:", e);
    return err(req, "Internal server error", 500);
  }
});
