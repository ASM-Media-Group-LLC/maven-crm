import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useCoworkSession, type AdminSessionRow, type SesionFinalizada, type CoworkSessionRow } from "@/hooks/useCoworkSession";
import { useUserRole } from "@/hooks/useUserRole";
import { useRoleTier } from "@/hooks/useRoleTier";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { avisarPersona } from "@/lib/avisoPersona";
import { decidirAutoJoin, salaParaAutoUnir } from "@/lib/coworkAutoJoin";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import CoworkCreateDialog from "./CoworkCreateDialog";
import CoworkLobby from "./CoworkLobby";
import CoworkHostDashboard from "./CoworkHostDashboard";
import CoworkParticipantView from "./CoworkParticipantView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { normalizeRoomCode, isCompleteRoomCode, ROOM_CODE_LENGTH } from "@/lib/coworkRoomCode";
import { Plus, Users2, ArrowRight, KeyRound, Loader2, VenetianMask, LogOut, History, MoreHorizontal, Power } from "lucide-react";
import CoworkIncognitoView from "./CoworkIncognitoView";
import { toast } from "sonner";
import { useFormato } from "@/hooks/useFormato";
import type { Formato } from "@/lib/formato";
import { useLanguage } from "@/hooks/useLanguage";
import { traducir } from "@/lib/i18n";
import { tituloBonito } from "@/lib/tituloBonito";
import { UserAvatar } from "@/components/UserAvatar";
import { cn } from "@/lib/utils";
import { ATASCO_MS, anotarAtasco, marcarRecargaPorAtasco, queHacerConElAtasco, tomarAtascoPrevio, ultimaRecargaPorAtasco } from "@/lib/coworkAtascado";

export default function CoworkPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionId = searchParams.get("session");
  const navigate = useNavigate();
  // `f` ya es la variable de las filas de finalizadas; por eso este se llama `formato`.
  const formato = useFormato();
  const { t } = useLanguage();
  const [showCreate, setShowCreate] = useState(false);
  const [autoJoining, setAutoJoining] = useState(false);
  const [autoJoinFailed, setAutoJoinFailed] = useState(false);
  
  const [userId, setUserId] = useState<string | null>(null);
  const [mySessions, setMySessions] = useState<Array<{ id: string; name: string; description: string | null; role: string; members: number; created_at: string; lastRoomId: string | null; createdBy: string | null }>>([]);
  const [finalizadas, setFinalizadas] = useState<SesionFinalizada[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [roomCode, setRoomCode] = useState("");
  const [joiningByCode, setJoiningByCode] = useState(false);

  // Vista de admin en el landing: TODAS las sesiones activas de la empresa,
  // con cuánta gente hay conectada en cada sala (contado por LiveKit).
  const { isAdmin } = useUserRole();
  // "Permisos de datos" de Cowork (Administración → Roles). Con "todos" o
  // "subordinados" el landing lista sesiones ajenas: la RPC del edge ya filtra
  // por alcance (todo, o solo las que tienen a alguien de nivel inferior). Antes
  // esto era solo-admin y un rol con "Todos los datos" veía únicamente las suyas.
  const { dataScope } = usePermissions();
  const veTodasLasSesiones = isAdmin || dataScope("Cowork") !== "self";
  const [allSessions, setAllSessions] = useState<AdminSessionRow[]>([]);
  const [enteringId, setEnteringId] = useState<string | null>(null);

  const cowork = useCoworkSession(sessionId);

  // Crear una sesión es acción de coordinación: los roles de nivel "miembro" solo
  // entran por el enlace o el código que les pasa su coordinador. El backend
  // rechaza igual la acción (cowork-session/createSession, vía la misma regla en
  // can_use_module_function) — esto es para no mostrar un botón que termina en
  // error.
  //
  // Misma precedencia que la DB: la fila explícita del modal de permisos manda;
  // sin fila, decide el nivel de acceso del rol.
  const { isSupervisorOrAbove, isLoading: tierLoading } = useRoleTier();
  const { explicitPermission, isLoading: permsLoading } = usePermissions();
  const canCreateSessions = explicitPermission("Cowork", "Crear sesión") ?? isSupervisorOrAbove;
  const permissionLoading = tierLoading || permsLoading;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id || null));
  }, []);

  // Cargar "Tus sesiones activas" en la pantalla de inicio (sin ?session= en la URL),
  // para no perder el acceso a una sesión en curso al navegar a otro menú y volver.
  useEffect(() => {
    if (sessionId) return;
    let alive = true;
    setLoadingSessions(true);
    cowork.listMyActiveSessions()
      .then((s) => { if (alive) setMySessions(s); })
      .catch(() => { /* noop */ })
      .finally(() => { if (alive) setLoadingSessions(false); });
    // Y las finalizadas hace poco, con quién las finalizó: la pregunta que hoy
    // se hace por chat ("¿quién cerró la sala?") se contesta acá.
    cowork.listMyEndedSessions()
      .then((s) => { if (alive) setFinalizadas(s); })
      .catch(() => { /* si el RPC aún no existe, la sección no se dibuja */ });
    return () => { alive = false; };
  }, [sessionId, cowork.listMyActiveSessions, cowork.listMyEndedSessions]);

  // Admin: cargar todas las sesiones activas y refrescar la ocupación cada 30s
  // mientras el landing esté abierto. Es UNA llamada al edge (que hace un solo
  // ListRooms a LiveKit) — nada de canales de presencia por sesión (#1458).
  useEffect(() => {
    if (sessionId || !veTodasLasSesiones) return;
    let alive = true;
    const load = () => {
      cowork.adminListSessions()
        .then((s) => { if (alive) setAllSessions(s); })
        .catch(() => { /* sin permiso o edge caído: la sección no se dibuja */ });
    };
    load();
    // Solo refresca la lista de sesiones mientras se mira la pantalla.
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 30000);
    return () => { alive = false; clearInterval(t); };
  }, [sessionId, veTodasLasSesiones, cowork.adminListSessions]);

  // La lista única. Para quien ve todas (admin, o data_scope de Cowork en
  // "todos"/"subordinados") la base es adminListSessions (con ocupación en vivo y
  // salas); las suyas se enriquecen con lo que sabe listMyActiveSessions (última
  // sala, quién la creó). Para el resto, las suyas.
  const filasActivas = useMemo(() => {
    type Fila = {
      id: string; name: string; role: string | null; members: number; createdBy: string | null;
      hostName: string | null; lastRoomId: string | null; online: number | null; incognito: string[];
      rooms: Array<{ id: string; name: string; online: number | null; gente?: string[] }>; admin: AdminSessionRow | null;
    };
    const mias = new Map(mySessions.map((m) => [m.id, m]));
    const porAlcance: Fila[] = veTodasLasSesiones
      ? allSessions.map((a): Fila => {
          const m = mias.get(a.id);
          return {
            id: a.id, name: a.name, role: a.my_role ?? m?.role ?? null, members: a.members,
            createdBy: m?.createdBy ?? null, hostName: a.host_name, lastRoomId: m?.lastRoomId ?? null,
            online: a.online, incognito: a.incognito, rooms: a.rooms, admin: a,
          };
        })
      : [];
    // Las PROPIAS que el alcance no trae van igual. Con "subordinados" el alcance
    // solo cubre sesiones creadas por gente de nivel inferior; si soy miembro de
    // una creada por alguien de nivel superior (una manager en la sala de un
    // admin), la sigo viendo: ser miembro es "propios" y se ve siempre. Antes,
    // con alcance activo, la lista era SOLO lo del alcance y esas desaparecían.
    const vistas = new Set(porAlcance.map((f) => f.id));
    const propias: Fila[] = mySessions
      .filter((m) => !vistas.has(m.id))
      .map((m): Fila => {
        const a = allSessions.find((x) => x.id === m.id);
        return {
          id: m.id, name: m.name, role: m.role, members: m.members, createdBy: m.createdBy,
          hostName: null, lastRoomId: m.lastRoomId, online: a?.online ?? null, incognito: a?.incognito ?? [],
          rooms: a?.rooms ?? [], admin: a ?? null,
        };
      });
    return [...porAlcance, ...propias];
  }, [veTodasLasSesiones, allSessions, mySessions]);

  // Entrar a una sesión ajena: el edge deja unirse como host sin código a los
  // admin y a quien tenga alcance de Cowork sobre esa sesión ("todos", o
  // "subordinados" si la creó alguien de nivel inferior). Queda como supervisor
  // de esa sesión (tablero con todas las salas).
  const handleAdminEnter = async (s: AdminSessionRow) => {
    setEnteringId(s.id);
    try {
      // Aunque YA sea miembro: si entró alguna vez como participante, el edge la
      // sube a host y le SUELTA la asignación de sala. Así un admin con membresía
      // vieja de participante (Grace, clavada en COORDINADORES) se libera al entrar.
      if (s.my_role !== "host") await cowork.joinSession(s.id, "host");
      setSearchParams({ session: s.id });
    } catch (e) {
      toast.error((e as Error).message || t("cowork.page.enterError"));
    } finally {
      setEnteringId(null);
    }
  };

  // Finalizar saca a TODOS de sus salas y no se puede deshacer, asi que se
  // confirma nombrando la sesion y cuanta gente hay adentro: "¿finalizar esta
  // sesion?" no dice que del otro lado hay veintitres personas trabajando.
  //
  // Con AlertDialog y no window.confirm: el nativo congela la pestaña mientras
  // esta abierto — con una llamada de LiveKit corriendo detras, eso se nota.
  const [porFinalizar, setPorFinalizar] = useState<{ id: string; name: string; members: number } | null>(null);
  const [finalizando, setFinalizando] = useState(false);

  const confirmarFinalizar = async () => {
    if (!porFinalizar) return;
    setFinalizando(true);
    try {
      await cowork.endSessionById(porFinalizar.id);
      setMySessions((prev) => prev.filter((s) => s.id !== porFinalizar.id));
      toast.success(t("cowork.page.ended"));
      setPorFinalizar(null);
      cowork.listMyEndedSessions().then(setFinalizadas).catch(() => {});
    } catch (e) {
      // El servidor ya dice por qué (por ejemplo, que solo el creador puede).
      toast.error(t("cowork.page.endError"), { description: (e as Error).message });
    } finally {
      setFinalizando(false);
    }
  };

  // Salir de una sesión que NO creé: me voy yo, la sesión sigue para los demás.
  // Se confirma porque para volver hace falta un enlace de host nuevo.
  const [porSalir, setPorSalir] = useState<{ id: string; name: string } | null>(null);
  const [saliendo, setSaliendo] = useState(false);
  const confirmarSalir = async () => {
    if (!porSalir) return;
    setSaliendo(true);
    try {
      await cowork.leaveSessionById(porSalir.id);
      setMySessions((prev) => prev.filter((s) => s.id !== porSalir.id));
      toast.success(t("cowork.page.left", { name: porSalir.name }));
      setPorSalir(null);
    } catch (e) {
      toast.error(t("cowork.page.leaveError"), { description: (e as Error).message });
    } finally {
      setSaliendo(false);
    }
  };

  // Entrar canjeando el código de sala que dio el coordinador. Es la vía de acceso
  // cuando el link largo no sobrevivió (o cuando el participante ya no tiene sala).
  const handleJoinByCode = async () => {
    const code = normalizeRoomCode(roomCode);
    if (!isCompleteRoomCode(code)) return;
    setJoiningByCode(true);
    try {
      const res = await cowork.joinByCode(code);
      setRoomCode("");
      setSearchParams({ session: res.sessionId, room: res.roomId });
    } catch (e: any) {
      toast.error(e.message || t("cowork.common.codeError"));
    } finally {
      setJoiningByCode(false);
    }
  };

  // Vigilante de la ruedita (lib/coworkAtascado.ts): si la carga o la entrada a
  // la sala no terminan en 20 s, se anota el paso trabado y se recarga una vez;
  // si vuelve a pasar enseguida, queda el botón «Reintentar».
  const [atascado, setAtascado] = useState(false);
  const cargando = !!sessionId && (cowork.loading || autoJoining);
  useEffect(() => {
    if (!cargando) return;
    const inicio = Date.now();
    const timer = window.setTimeout(() => {
      const paso = autoJoining ? "unirse" : (cowork.pasoDeCarga() || "cargar");
      anotarAtasco(paso, Math.round((Date.now() - inicio) / 1000));
      if (queHacerConElAtasco({ ultimaRecarga: ultimaRecargaPorAtasco(), ahora: Date.now() }) === "recargar") {
        marcarRecargaPorAtasco();
        window.location.reload();
      } else {
        setAtascado(true);
      }
    }, ATASCO_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargando, autoJoining]);
  // El atasco anterior (si lo hubo) se anota para saber la causa. Fuego y olvido.
  useEffect(() => {
    const previo = tomarAtascoPrevio();
    if (!previo) return;
    type InsertaCorte = (tabla: "llamada_cortes") => {
      insert: (fila: { sala: string | null; fase: string; motivo: string | null; contexto: Record<string, unknown> }) => PromiseLike<unknown>;
    };
    void (supabase.from as unknown as InsertaCorte)("llamada_cortes").insert({
      sala: sessionId ?? null, fase: "cowork_atascado", motivo: previo.paso,
      contexto: { segundos: previo.segundos, hace_s: Math.round((Date.now() - previo.t) / 1000), vis: document.visibilityState },
    });
  }, [sessionId]);

  // Auto-join from invite URL params
  useEffect(() => {
    if (!sessionId || cowork.loading || autoJoining || autoJoinFailed) return;

    const role = searchParams.get("role");
    const code = searchParams.get("code");
    const roomId = searchParams.get("room");

    // La decisión vive en lib/coworkAutoJoin (con tests): un host con ?room=
    // en la URL NO se auto-une como participante — era lo que lo degradaba.
    const decision = decidirAutoJoin({
      role, code, roomId,
      membresia: cowork.myMembership ? { role: cowork.myMembership.role } : null,
      tieneAsignacion: !!cowork.myAssignment,
    });
    if (decision === "nada") return;

    setAutoJoining(true);
    const doJoin = async () => {
      try {
        if (decision === "unirse-como-host") {
          await cowork.joinSession(sessionId, "host", code ?? undefined);
        } else if (roomId) {
          // El link (`?room=`) es la orden del coordinador: es LA sala a la que
          // quiere mandar a la persona, así que MANDA. Tu última sala solo se usa
          // si el link no trae sala. Antes era al revés y una asignación vieja
          // (fantasma: getMyLastRoomId lee hasta las inactivas) devolvía a Grace a
          // COORDINADORES ignorando el link de Chatters. Para mover a propósito
          // está el código de 6 caracteres (joinByCode).
          const ultimaSala = await cowork.getMyLastRoomId(sessionId);
          await cowork.joinSession(sessionId, "participant", undefined, salaParaAutoUnir(roomId, ultimaSala));
        }
        cowork.refetch();
      } catch (e) {
        console.error("Auto-join failed:", e);
        setAutoJoinFailed(true);
      } finally {
        setAutoJoining(false);
      }
    };
    doJoin();
  }, [sessionId, cowork.loading, cowork.myMembership, cowork.myAssignment, autoJoining, autoJoinFailed, searchParams]);

  // No session selected → landing
  if (!sessionId) {
    return (
      <div className="fondo-glass flex-1 min-h-0 overflow-y-auto">
      <div className="flex flex-col gap-6 p-4 pb-24 md:p-6">
        {/* Encabezado de la pantalla: va ARRIBA y las listas de salas abajo
            (pedido de Jhon, 03/09/2026). Al dejar de ser un pie se le bajó el
            alto: si no, en un portátil el título se comía la pantalla y había
            que scrollear para ver a qué sala entrar. */}
        <div className="w-full rounded-3xl border border-primary/10 bg-gradient-to-br from-primary/10 via-accent/5 to-transparent px-5 py-6 md:px-8 md:py-7">
          {/* En pantalla ancha el encabezado es una FILA (icono + título a la
              izquierda, acciones a la derecha): en columna se comía media
              pantalla y había que scrollear para ver las salas. En móvil se
              apila y queda centrado, como estaba. */}
          <div className="flex flex-col items-center gap-4 text-center md:flex-row md:items-center md:gap-5 md:text-left">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent/20 md:h-12 md:w-12">
              <Users2 className="h-7 w-7 text-primary md:h-6 md:w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-xl font-bold tracking-tight text-foreground md:text-2xl">
                {t("cowork.page.title")}
              </h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {canCreateSessions
                  ? mySessions.length > 0
                    ? t("cowork.page.subtitleCreateBack")
                    : t("cowork.page.subtitleCreate")
                  : mySessions.length > 0
                    ? t("cowork.page.subtitleBack")
                    : t("cowork.page.subtitleLink")}
              </p>
            </div>
            {!permissionLoading && canCreateSessions && (
              <Button
                onClick={() => setShowCreate(true)}
                size="lg"
                className="w-full gap-2 rounded-full px-7 shadow-md md:w-auto"
              >
                <Plus className="h-5 w-5" /> {t("cowork.page.createSession")}
              </Button>
            )}
          </div>

          {/* Entrar por código: la puerta que sobrevive al copy/paste de WhatsApp,
              a la PWA y a que el link largo se pierda. Visible para TODOS — para el
              nivel miembro es SU vía de acceso. */}
          <div className="mt-5 flex flex-col items-center gap-2 border-t border-border/40 pt-4 md:flex-row md:justify-between">
            <span className="text-xs text-muted-foreground">
              {permissionLoading || canCreateSessions
                ? t("cowork.page.enterWithCode")
                : t("cowork.page.enterWithCodeMember")}
            </span>
            <div className="flex w-full gap-2 md:w-auto">
              <Input
                value={roomCode}
                onChange={(e) => setRoomCode(normalizeRoomCode(e.target.value))}
                onKeyDown={(e) => e.key === "Enter" && handleJoinByCode()}
                placeholder="ABC234"
                maxLength={ROOM_CODE_LENGTH}
                className="rounded-full text-center font-mono uppercase tracking-[0.25em] md:w-40"
              />
              <Button
                onClick={handleJoinByCode}
                disabled={!isCompleteRoomCode(roomCode) || joiningByCode}
                className="shrink-0 gap-1 rounded-full"
              >
                {joiningByCode ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                {t("cowork.common.enter")}
              </Button>
            </div>
          </div>
        </div>

        {/* UNA sola lista (pedido de Jhon, 08/09): antes había "Tus sesiones" y
            aparte "Todas las sesiones" solo para admins, y daba la impresión de
            que faltaban sesiones. Ahora los admins ven TODAS aquí, con su rol en
            cada una; el resto ve las suyas. Las finalizadas van al final. */}
        {!loadingSessions && filasActivas.length > 0 && (
          <div className="w-full flex flex-col gap-2">
            <h2 className="text-xs font-semibold text-muted-foreground px-1">
              {t("cowork.page.activeSessions")}{veTodasLasSesiones ? ` · ${filasActivas.length}` : ""}
            </h2>
            {/* TARJETAS EN GRILLA (Alvaro, 10/2026: "tiene que ser tarjetas,
                cuadritos — como una plataforma sólida"): cada sesión es un
                cuadro compacto y parejo. UNA acción principal (Entrar/Volver),
                el resto en ⋯ (Finalizar es destructivo y ya se disparó sin
                querer: CHATTERS KASH, 4 veces en 4 días). Lo vivo se resume en
                una línea —salas activas y quiénes—; el detalle sala por sala
                vive en el Centro de operaciones. */}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filasActivas.map((s) => {
              const activas = s.rooms.filter((r) => (r.online ?? 0) > 0);
              const genteEnVivo = activas.flatMap((r) => r.gente ?? []);
              // Hay gente = LiveKit contó a alguien. online null (LiveKit calló)
              // NO enciende nada: fallo no es vacío.
              const n = s.online ?? 0;
              const hayGente = n > 0;
              const puedeFinalizar = s.createdBy === userId || isAdmin;
              const puedeSalir = s.role === "host" && s.createdBy !== userId && !isAdmin;
              const hayMenu = puedeFinalizar || puedeSalir || isAdmin;
              // La TARJETA ENTERA es la acción de entrar (estilo Linear/Stripe):
              // nada de botón gigante — Alvaro, 10/2026: "ese botón gigante de
              // Volver no se ve profesional". El ⋯ va en la esquina y frena la
              // burbuja para no entrar por accidente al abrir el menú.
              const entrarALaSesion = () => {
                // Un admin SIEMPRE entra como SUPERVISOR, aunque arrastre una
                // membresía vieja de participante. Si no, el landing lo pincha a su
                // "última sala" (room: s.lastRoomId) y, siendo esa un fantasma viejo
                // (Grace: COORDINADORES), queda atrapado ahí sin poder llegar a otra.
                // Al entrar como host el edge le SUELTA la asignación y lo deja en el
                // tablero, con todas las salas a mano. (19/10/2026)
                if (isAdmin && s.admin && enteringId !== s.id) {
                  void handleAdminEnter(s.admin);
                  return;
                }
                if (s.role) {
                  setSearchParams(
                    // Sin el `room` el participante vuelve SIN asignación y queda
                    // esperando una asignación que ya nadie puede hacer.
                    s.lastRoomId && s.role !== "host"
                      ? { session: s.id, room: s.lastRoomId }
                      : { session: s.id }
                  );
                } else if (s.admin && enteringId !== s.id) {
                  /* No es miembro pero la ve: admin, o alcance de Cowork sobre
                     esta sesión. El edge deja entrar como host sin código en
                     ambos casos (cowork_puede_supervisar); si no corresponde,
                     responde 403 y se muestra el error. */
                  void handleAdminEnter(s.admin);
                }
              };
              return (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                onClick={entrarALaSesion}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); entrarALaSesion(); } }}
                className={cn(
                  // El relleno, el borde vivo, el resplandor interior, la sombra
                  // honda y el alzado al pasar el mouse viven en .tarjeta-sesion
                  // (index.css). Aquí solo el layout.
                  "tarjeta-sesion group flex h-full cursor-pointer flex-col gap-3 p-5 text-left outline-none",
                  hayGente && "tarjeta-sesion--viva",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-[15px] font-semibold leading-snug text-foreground truncate">{tituloBonito(s.name)}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground truncate">
                      {s.role === "host" ? t("cowork.page.roleHost") : s.role === "participant" ? t("cowork.page.roleParticipant") : t("cowork.page.notJoined")}
                      {s.hostName && s.createdBy !== userId ? ` · ${t("cowork.page.byHost", { name: s.hostName })}` : ""}
                      {" · "}{s.members === 1 ? t("cowork.page.membersOne") : t("cowork.page.membersMany", { n: s.members })}
                    </div>
                  </div>
                  {hayMenu && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        {/* stopPropagation también en TECLADO: el menú vive dentro
                            de la tarjeta-botón y, sin esto, Enter sobre el ⋯ (o
                            dentro del menú, que es un portal de React y burbujea
                            por el árbol de componentes) también "entraría" a la
                            sesión. */}
                        <Button variant="ghost" size="icon" className="-mr-1.5 -mt-1 h-7 w-7 shrink-0 rounded-lg text-muted-foreground/70 hover:text-foreground" title={t("cowork.page.sessionMenu")} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                        {isAdmin && (
                          <DropdownMenuItem onClick={() => setSearchParams({ session: s.id, spy: "1" })}>
                            <VenetianMask className="mr-2 h-4 w-4" /> {t("cowork.page.incognito")}
                          </DropdownMenuItem>
                        )}
                        {puedeSalir && (
                          <DropdownMenuItem onClick={() => setPorSalir({ id: s.id, name: s.name })}>
                            <LogOut className="mr-2 h-4 w-4" /> {t("cowork.page.leave")}
                          </DropdownMenuItem>
                        )}
                        {puedeFinalizar && (
                          <>
                            {(isAdmin || puedeSalir) && <DropdownMenuSeparator />}
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setPorFinalizar({ id: s.id, name: s.name, members: s.members })}>
                              <Power className="mr-2 h-4 w-4" /> {t("cowork.page.end")}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>

                {/* El pulso de la sesión con la GENTE al frente (Alvaro eligió
                    la 8): se ve de un vistazo QUIÉN está, no solo cuántos. Las
                    caras salen de las salas activas; si LiveKit contó cabezas
                    pero no hay nombres (sin asignación), queda el conteo solo.
                    online null (LiveKit calló) NO dice "nadie conectado" — solo
                    cuántas salas hay. Fallo no es vacío. */}
                {hayGente ? (
                  <div className="flex flex-col gap-2">
                    {genteEnVivo.length > 0 && (
                      <div className="flex items-center">
                        {genteEnVivo.slice(0, 5).map((nombre, i) => (
                          <div key={`${s.id}-cara-${i}`} className={i === 0 ? "" : "-ml-1.5"}>
                            <UserAvatar name={tituloBonito(nombre)} size="xs" className="ring-2 ring-card" />
                          </div>
                        ))}
                        {genteEnVivo.length > 5 && (
                          <div className="z-10 -ml-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[9px] font-semibold text-muted-foreground ring-2 ring-card">
                            +{genteEnVivo.length - 5}
                          </div>
                        )}
                      </div>
                    )}
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
                      <span className="h-1.5 w-1.5 rounded-full bg-success" />
                      <span className="tabular-nums">{t("cowork.common.online", { n })}</span>
                      {activas.length > 0 && (
                        <span className="font-normal text-muted-foreground">
                          · {activas.length === 1 ? t("cowork.page.oneRoom") : t("cowork.page.roomsCount", { n: activas.length })}
                        </span>
                      )}
                    </span>
                  </div>
                ) : s.rooms.length > 0 ? (
                  s.online == null ? (
                    <p className="text-xs text-muted-foreground">{s.rooms.length === 1 ? t("cowork.page.oneRoom") : t("cowork.page.roomsCount", { n: s.rooms.length })}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">{s.rooms.length === 1 ? t("cowork.page.oneRoomIdle") : t("cowork.page.roomsIdle", { n: s.rooms.length })}</p>
                  )
                ) : null}
                {s.incognito.length > 0 && (
                  <p className="truncate text-[11px] text-primary" title={t("cowork.page.adminsOnly")}>🕶 {s.incognito.join(", ")}</p>
                )}

                {/* Pie quieto: nada de botón gigante. El pulso ya vive arriba
                    con las caras; acá solo la acción, como enlace fino que se
                    desliza un pelo al pasar — la tarjeta entera ya es el botón
                    (Alvaro: el botón gigante de Volver no se veía profesional). */}
                <div className="mt-auto flex items-center justify-end border-t border-border/40 pt-2.5">
                  <span className="inline-flex items-center gap-1 text-[13px] font-medium text-primary transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transform-none">
                    {enteringId === s.id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <>{s.role ? t("common.back") : t("cowork.common.enter")} <ArrowRight className="h-3.5 w-3.5" /></>}
                  </span>
                </div>
              </div>
              );
            })}
            </div>
          </div>
        )}

        {/* Quién finalizó qué, a la vista, al final de todo. Los admins ven TODAS
            las finalizadas de la empresa; el resto, las sesiones donde estuvo.
            Ventana de 10 días: lo más viejo se va solo (Jhon, 08/09). */}
        {finalizadas.length > 0 && (
          <div className="w-full flex flex-col gap-2">
            <h2 className="text-xs font-semibold text-muted-foreground px-1 flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" /> {t("cowork.page.recentlyEnded")} <span className="font-normal normal-case tracking-normal">· {t("cowork.page.last10Days")}</span>
            </h2>
            <div className="flex flex-col gap-2">
            {finalizadas.map((f) => (
              <div key={f.id} className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/40 px-4 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground/80 truncate">
                    {f.name}
                    {f.createdByName && <span className="font-normal text-muted-foreground"> · {t("cowork.page.byHost", { name: f.createdByName })}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {t("cowork.page.endedBy")} <span className="text-foreground/80 font-medium">{f.endedByName ?? t("cowork.page.endedByUnknown")}</span>
                    {" · "}{fechaCorta(f.endedAt, formato)} · {f.members === 1 ? t("cowork.page.membersOne") : t("cowork.page.membersMany", { n: f.members })}
                  </div>
                </div>
              </div>
            ))}
            </div>
          </div>
        )}

      <AlertDialog open={!!porSalir} onOpenChange={(o) => { if (!o && !saliendo) setPorSalir(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("cowork.page.leaveTitle", { name: porSalir?.name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("cowork.page.leaveDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saliendo} />
            <AlertDialogAction disabled={saliendo} onClick={(e) => { e.preventDefault(); void confirmarSalir(); }}>
              {saliendo ? t("cowork.page.leaving") : t("cowork.page.leave")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!porFinalizar} onOpenChange={(o) => { if (!o) setPorFinalizar(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("cowork.page.endTitle", { name: porFinalizar?.name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>
              {porFinalizar && porFinalizar.members > 0
                ? t("cowork.page.endDescPeople", { n: porFinalizar.members })
                : t("cowork.page.endDescAll")}
              {" "}{t("cowork.page.endCannotUndo")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={finalizando} />
            <AlertDialogAction
              disabled={finalizando}
              onClick={(e) => { e.preventDefault(); void confirmarFinalizar(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {finalizando ? t("cowork.page.ending") : t("cowork.page.endSession")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

        {canCreateSessions && (
          <CoworkCreateDialog
            open={showCreate}
            onOpenChange={setShowCreate}
            onCreate={async (name, roomNames, description) => {
              const result = await cowork.createSession(name, roomNames, description);
              setSearchParams({ session: result.sessionId });
              setShowCreate(false);
            }}
          />
        )}
  </div>
      </div>
    );
  }

  // Modo incógnito (solo admin): va ANTES de los checks de membresía/lobby a
  // propósito — la gracia es observar SIN ser miembro. Con ?spy=1 y sin rol
  // admin se cae al flujo normal (y el edge rechazaría los tokens igual).
  if (searchParams.get("spy") === "1" && isAdmin) {
    return (
      <CoworkIncognitoView
        sessionId={sessionId}
        cowork={cowork}
        onExit={() => setSearchParams({})}
      />
    );
  }

  if (atascado) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 min-h-0 gap-3 text-center px-4">
        <p className="text-base font-semibold">{t("cowork.atasco.titulo")}</p>
        <p className="text-sm text-muted-foreground max-w-sm">{t("cowork.atasco.desc")}</p>
        <Button onClick={() => window.location.reload()}>{t("cowork.atasco.reintentar")}</Button>
      </div>
    );
  }

  if (cowork.loading || autoJoining) {
    return (
      <div className="flex items-center justify-center flex-1 min-h-0">
        <div className="h-10 w-10 rounded-full border-[3px] border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  // Session ended → auto-redirect to main Maven dashboard
  if (cowork.session?.status === "ended") {
    return <CoworkSessionEndedRedirect session={cowork.session} />;
  }

  // Not a member yet → lobby
  if (!cowork.myMembership) {
    return (
      <CoworkLobby
        sessionId={sessionId}
        session={cowork.session}
        onJoin={async (role, hostCode, roomId) => {
          await cowork.joinSession(sessionId, role, hostCode, roomId);
          cowork.refetch();
        }}
      />
    );
  }

  // Host view
  if (cowork.isHost) {
    return <CoworkHostDashboard cowork={cowork} userId={userId!} />;
  }

  // Participant view
  return <CoworkParticipantView cowork={cowork} userId={userId!} />;
}

// Shown briefly while we redirect participants out of an ended Cowork session
// back to the main Maven dashboard.
/** dd/mm HH:MM en hora local, para las listas y la pantalla de finalizada. */
function fechaCorta(iso: string | null | undefined, formato: Formato): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString(formato.intl("es-CO"), { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function CoworkSessionEndedRedirect({ session }: { session: CoworkSessionRow | null }) {
  const navigate = useNavigate();
  const formato = useFormato();
  const { t } = useLanguage();
  const [quien, setQuien] = useState<{ nombre: string; foto: string | null; seed: string | null } | null>(null);

  // Quién la finalizó, con nombre. Antes esta pantalla decía "la finalizó el
  // supervisor" y te mandaba al dashboard a los 50 ms: nadie llegaba a leerla,
  // y la pregunta "¿quién cerró la sala?" terminaba en el chat. Ahora se queda
  // y lo dice; la persona decide a dónde ir.
  useEffect(() => {
    const uid = session?.ended_by;
    if (!uid) return;
    let vivo = true;
    supabase.from("profiles").select("full_name, avatar_url, avatar_seed").eq("id", uid).maybeSingle()
      .then(({ data }) => {
        if (!vivo || !data?.full_name) return;
        setQuien({ nombre: data.full_name, foto: data.avatar_url ?? null, seed: data.avatar_seed ?? null });
      });
    return () => { vivo = false; };
  }, [session?.ended_by]);

  useEffect(() => {
    // Con nombre va con su cara; sin nombre no hay a quién mostrarle la cara,
    // así que queda el aviso de sistema. Mismo id: el segundo reemplaza al
    // primero cuando llega el nombre, en vez de apilarse.
    if (quien) {
      // traducir() y no el hook: el aviso se arma una vez, cuando llega el nombre.
      avisarPersona({
        nombre: quien.nombre, foto: quien.foto, seed: quien.seed,
        titulo: traducir("cowork.page.ended"), detalle: traducir("cowork.ended.endedByName", { name: quien.nombre }),
        id: "sesion-finalizada",
      });
    } else {
      toast.info(traducir("cowork.ended.wasEnded"), { id: "sesion-finalizada" });
    }
  }, [quien]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
    <div className="min-h-full flex flex-col items-center justify-center gap-5 p-4 md:p-6">
      <div className="flex flex-col items-center gap-3 bg-muted/50 rounded-3xl px-6 md:px-10 py-8 md:py-10 max-w-sm w-full text-center">
        <div className="flex items-center justify-center h-14 w-14 rounded-full bg-muted">
          <Users2 className="h-7 w-7 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">{t("cowork.ended.title")}</h2>
        <p className="text-sm text-muted-foreground">
          {session?.ended_by
            ? <>{t("cowork.page.endedBy")} <span className="text-foreground font-medium">{quien?.nombre ?? "…"}</span>{session?.ended_at ? ` ${t("cowork.ended.onDate", { date: fechaCorta(session.ended_at, formato) })}` : ""}.</>
            : t("cowork.ended.bySupervisor")}
          {" "}{t("cowork.ended.linksDead")}
        </p>
        <div className="flex flex-wrap justify-center gap-2 mt-1">
          <Button variant="secondary" className="rounded-full px-6" onClick={() => navigate("/dashboard", { replace: true })}>
            {t("cowork.common.backToDashboard")}
          </Button>
          <Button className="rounded-full px-6" onClick={() => navigate("/cowork", { replace: true })}>
            {t("cowork.ended.goToCowork")}
          </Button>
        </div>
      </div>
    </div>
    </div>
  );
}
