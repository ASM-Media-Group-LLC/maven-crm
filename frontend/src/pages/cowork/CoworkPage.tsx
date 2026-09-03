import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useCoworkSession, type AdminSessionRow, type SesionFinalizada, type CoworkSessionRow } from "@/hooks/useCoworkSession";
import { useUserRole } from "@/hooks/useUserRole";
import { useRoleTier } from "@/hooks/useRoleTier";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
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
import { normalizeRoomCode, isCompleteRoomCode, ROOM_CODE_LENGTH } from "@/lib/coworkRoomCode";
import { Plus, Users2, ArrowRight, KeyRound, Loader2, VenetianMask, LogOut, History } from "lucide-react";
import CoworkIncognitoView from "./CoworkIncognitoView";
import { toast } from "sonner";

export default function CoworkPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionId = searchParams.get("session");
  const navigate = useNavigate();
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
    if (sessionId || !isAdmin) return;
    let alive = true;
    const load = () => {
      cowork.adminListSessions()
        .then((s) => { if (alive) setAllSessions(s); })
        .catch(() => { /* sin permiso o edge caído: la sección no se dibuja */ });
    };
    load();
    const t = setInterval(load, 30000);
    return () => { alive = false; clearInterval(t); };
  }, [sessionId, isAdmin, cowork.adminListSessions]);

  // Entrar a una sesión ajena: el edge deja a los admin unirse como host sin
  // código. Queda como supervisor de esa sesión (tablero con todas las salas).
  const handleAdminEnter = async (s: AdminSessionRow) => {
    setEnteringId(s.id);
    try {
      if (!s.my_role) await cowork.joinSession(s.id, "host");
      setSearchParams({ session: s.id });
    } catch (e) {
      toast.error((e as Error).message || "No se pudo entrar a la sesión");
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
      toast.success("Sesión finalizada");
      setPorFinalizar(null);
      cowork.listMyEndedSessions().then(setFinalizadas).catch(() => {});
    } catch (e) {
      // El servidor ya dice por qué (por ejemplo, que solo el creador puede).
      toast.error("No se pudo finalizar la sesión", { description: (e as Error).message });
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
      toast.success(`Saliste de «${porSalir.name}»`);
      setPorSalir(null);
    } catch (e) {
      toast.error("No se pudo salir de la sesión", { description: (e as Error).message });
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
      toast.error(e.message || "No se pudo entrar con ese código");
    } finally {
      setJoiningByCode(false);
    }
  };

  // Auto-join from invite URL params
  useEffect(() => {
    if (!sessionId || cowork.loading || autoJoining || autoJoinFailed) return;

    const role = searchParams.get("role");
    const code = searchParams.get("code");
    const roomId = searchParams.get("room");

    const canAutoJoin = (role === "host" && code) || roomId;
    if (!canAutoJoin) return;

    if (cowork.myMembership) {
      const wantsHost = role === "host" && code;
      const isHost = cowork.myMembership.role === "host";
      const needsRoomAssignment = !wantsHost && !isHost && roomId && !cowork.myAssignment;
      if (((wantsHost && isHost) || (!wantsHost && !isHost)) && !needsRoomAssignment) return;
    }

    setAutoJoining(true);
    const doJoin = async () => {
      try {
        if (role === "host" && code) {
          await cowork.joinSession(sessionId, "host", code);
        } else if (roomId) {
          await cowork.joinSession(sessionId, "participant", undefined, roomId);
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
      <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="min-h-full flex flex-col items-center justify-center gap-6 p-4 md:p-6">
        {/* Encabezado de la pantalla: va ARRIBA y las listas de salas abajo
            (pedido de Jhon, 03/09/2026). Al dejar de ser un pie se le bajó el
            alto: si no, en un portátil el título se comía la pantalla y había
            que scrollear para ver a qué sala entrar. */}
        <div className="w-full max-w-3xl rounded-3xl bg-primary/5 px-5 py-6 md:px-8 md:py-7">
          {/* En pantalla ancha el encabezado es una FILA (icono + título a la
              izquierda, acciones a la derecha): en columna se comía media
              pantalla y había que scrollear para ver las salas. En móvil se
              apila y queda centrado, como estaba. */}
          <div className="flex flex-col items-center gap-4 text-center md:flex-row md:items-center md:gap-5 md:text-left">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 md:h-12 md:w-12">
              <Users2 className="h-7 w-7 text-primary md:h-6 md:w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
                Sala Cowork
              </h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {canCreateSessions
                  ? mySessions.length > 0
                    ? "Vuelve a una de tus salas activas o crea una nueva sesión."
                    : "Crea una sesión cowork con múltiples salas y colabora en tiempo real."
                  : mySessions.length > 0
                    ? "Vuelve a una de tus salas activas."
                    : "Abre el enlace que te compartió tu supervisor para entrar a tu sala."}
              </p>
            </div>
            {!permissionLoading && canCreateSessions && (
              <Button
                onClick={() => setShowCreate(true)}
                size="lg"
                className="w-full gap-2 rounded-full px-7 shadow-md md:w-auto"
              >
                <Plus className="h-5 w-5" /> Crear sesión
              </Button>
            )}
          </div>

          {/* Entrar por código: la puerta que sobrevive al copy/paste de WhatsApp,
              a la PWA y a que el link largo se pierda. Visible para TODOS — para el
              nivel miembro es SU vía de acceso. */}
          <div className="mt-5 flex flex-col items-center gap-2 border-t border-border/40 pt-4 md:flex-row md:justify-between">
            <span className="text-xs text-muted-foreground">
              {permissionLoading || canCreateSessions
                ? "Entrar con el código de tu sala"
                : "Solo los coordinadores crean sesiones — entrá con el código de tu sala"}
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
                Entrar
              </Button>
            </div>
          </div>
        </div>

        {!loadingSessions && mySessions.length > 0 && (
          <div className="w-full max-w-3xl flex flex-col gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
              Tus sesiones activas
            </h2>
            {mySessions.map((s) => {
              // Ocupación en vivo (solo llega para admins; para el resto queda undefined).
              const viva = allSessions.find((a) => a.id === s.id);
              return (
              <div
                key={s.id}
                className="flex flex-wrap items-center gap-3 bg-card border border-border rounded-2xl px-4 py-3"
              >
                <div className="flex items-center justify-center h-10 w-10 rounded-full bg-primary/10 shrink-0">
                  <Users2 className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-foreground truncate">{s.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {s.role === "host" ? "Host" : "Participante"} · {s.members} {s.members === 1 ? "miembro" : "miembros"}
                    {viva?.online != null && (
                      <span className={viva.online > 0 ? "text-emerald-500 font-medium" : ""}>
                        {" "}· {viva.online} en línea
                      </span>
                    )}
                    {!!viva?.incognito?.length && (
                      <span className="text-violet-500" title="Solo los admins ven esto">
                        {" "}· 🕶 {viva.incognito.join(", ")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 w-full justify-end sm:w-auto">
                {/* Finalizar apaga la sesión para TODOS: solo quien la creó (o un
                    admin). Los demás hosts tienen Salir, que se los lleva solo a
                    ellos. Antes cualquier host veía Finalizar, y CHATTERS KASH se
                    finalizó cuatro veces en cuatro días por hosts que querían irse. */}
                {s.role === "host" && (s.createdBy === userId || isAdmin) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive rounded-full"
                    onClick={() => setPorFinalizar({ id: s.id, name: s.name, members: s.members })}
                  >
                    Finalizar
                  </Button>
                )}
                {s.role === "host" && s.createdBy !== userId && !isAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-foreground rounded-full gap-1"
                    title="Salir de esta sesión (sigue para los demás)"
                    onClick={() => setPorSalir({ id: s.id, name: s.name })}
                  >
                    <LogOut className="h-4 w-4" /> Salir
                  </Button>
                )}
                {/* Incógnito también en las sesiones PROPIAS (solo admin): entrar
                    como host te anuncia en el hub; esto observa sin aparecer. */}
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-full gap-1 shrink-0 text-violet-500 hover:text-violet-600"
                    title="Entrar de incógnito: ver y escuchar sin que nadie te vea"
                    onClick={() => setSearchParams({ session: s.id, spy: "1" })}
                  >
                    <VenetianMask className="h-4 w-4" /> Incógnito
                  </Button>
                )}
                <Button
                  size="sm"
                  className="rounded-full gap-1 shrink-0"
                  onClick={() => setSearchParams(
                    // Sin el `room` el participante vuelve SIN asignación y queda
                    // esperando una asignación que ya nadie puede hacer.
                    s.lastRoomId && s.role !== "host"
                      ? { session: s.id, room: s.lastRoomId }
                      : { session: s.id }
                  )}
                >
                  Volver <ArrowRight className="h-4 w-4" />
                </Button>
                </div>
              </div>
              );
            })}
          </div>
        )}

        {/* Admin: TODAS las sesiones activas de la empresa (las que no son suyas),
            con la gente conectada en cada sala según LiveKit. */}
        {/* Quién finalizó qué, a la vista. Cuatro cierres en cuatro días por
            cuatro personas distintas se ven de un vistazo acá; antes había que
            rastrearlo en los registros del servidor. */}
        {finalizadas.length > 0 && (
          <div className="w-full max-w-lg flex flex-col gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1 flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" /> Finalizadas recientemente
            </h2>
            {finalizadas.map((f) => (
              <div key={f.id} className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/40 px-4 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground/80 truncate">{f.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    La finalizó <span className="text-foreground/80 font-medium">{f.endedByName ?? "alguien sin registro"}</span>
                    {" · "}{fechaCorta(f.endedAt)} · {f.members} {f.members === 1 ? "miembro" : "miembros"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {isAdmin && allSessions.some((s) => !s.my_role) && (
          <div className="w-full max-w-3xl flex flex-col gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
              Todas las sesiones activas
            </h2>
            {allSessions.filter((s) => !s.my_role).map((s) => (
              <div
                key={s.id}
                className="flex flex-col gap-2 bg-card border border-border rounded-2xl px-4 py-3"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center justify-center h-10 w-10 rounded-full bg-primary/10 shrink-0">
                    <Users2 className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-foreground truncate">{s.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {s.host_name ? `Host: ${s.host_name} · ` : ""}{s.members} {s.members === 1 ? "miembro" : "miembros"}
                      {s.online != null && (
                        <span className={s.online > 0 ? "text-emerald-500 font-medium" : ""}>
                          {" "}· {s.online} en línea
                        </span>
                      )}
                    </div>
                  </div>
                  {s.incognito.length > 0 && (
                    <span className="text-[11px] text-violet-500 shrink-0" title="Solo los admins ven esto">
                      🕶 {s.incognito.join(", ")}
                    </span>
                  )}
                  {/* Incógnito: observar sin unirse — no crea membresía ni
                      aparece en ninguna lista (token hidden solo-lectura). */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-full gap-1 shrink-0 text-violet-500 hover:text-violet-600"
                    title="Entrar de incógnito: ver y escuchar sin que nadie te vea"
                    onClick={() => setSearchParams({ session: s.id, spy: "1" })}
                  >
                    <VenetianMask className="h-4 w-4" /> Incógnito
                  </Button>
                  <Button
                    size="sm"
                    className="rounded-full gap-1 shrink-0"
                    disabled={enteringId === s.id}
                    onClick={() => handleAdminEnter(s)}
                  >
                    {enteringId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Entrar <ArrowRight className="h-4 w-4" /></>}
                  </Button>
                </div>
                {/* pl-[52px] = ancho del avatar (40) + gap (12): alinea los chips
                    con el nombre. Antes decía `pl-13`, que Tailwind no genera
                    (no existe en la escala) y en móvil no sangraba nada. */}
                {s.rooms.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pl-[52px]">
                    {s.rooms.map((r) => (
                      <span
                        key={r.id}
                        className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-[11px] text-muted-foreground"
                      >
                        <span className={
                          r.online != null && r.online > 0
                            ? "h-1.5 w-1.5 rounded-full bg-emerald-500"
                            : "h-1.5 w-1.5 rounded-full bg-muted-foreground/30"
                        } />
                        {r.name}
                        <span className="font-semibold text-foreground/80">{r.online ?? "–"}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

      <AlertDialog open={!!porSalir} onOpenChange={(o) => { if (!o && !saliendo) setPorSalir(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Salir de «{porSalir?.name}»?</AlertDialogTitle>
            <AlertDialogDescription>
              La sesión sigue para los demás; solo te vas tú. Para volver a entrar como host vas a necesitar
              un enlace nuevo de quien la creó.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saliendo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={saliendo} onClick={(e) => { e.preventDefault(); void confirmarSalir(); }}>
              {saliendo ? "Saliendo…" : "Salir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!porFinalizar} onOpenChange={(o) => { if (!o) setPorFinalizar(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Finalizar «{porFinalizar?.name}»?</AlertDialogTitle>
            <AlertDialogDescription>
              {porFinalizar && porFinalizar.members > 0
                ? `Se cierra para las ${porFinalizar.members} personas que están adentro: salen de sus salas y se corta lo que estén haciendo.`
                : "Se cierra la sesión para todos los participantes."}
              {" "}No se puede deshacer — para volver a usarla hay que crear una nueva.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={finalizando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={finalizando}
              onClick={(e) => { e.preventDefault(); void confirmarFinalizar(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {finalizando ? "Finalizando…" : "Finalizar sesión"}
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
function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("es-CO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function CoworkSessionEndedRedirect({ session }: { session: CoworkSessionRow | null }) {
  const navigate = useNavigate();
  const [quien, setQuien] = useState<string | null>(null);

  // Quién la finalizó, con nombre. Antes esta pantalla decía "la finalizó el
  // supervisor" y te mandaba al dashboard a los 50 ms: nadie llegaba a leerla,
  // y la pregunta "¿quién cerró la sala?" terminaba en el chat. Ahora se queda
  // y lo dice; la persona decide a dónde ir.
  useEffect(() => {
    const uid = session?.ended_by;
    if (!uid) return;
    let vivo = true;
    supabase.from("profiles").select("full_name").eq("id", uid).maybeSingle()
      .then(({ data }) => { if (vivo) setQuien(data?.full_name ?? null); });
    return () => { vivo = false; };
  }, [session?.ended_by]);

  useEffect(() => {
    toast.info(quien ? `La sesión la finalizó ${quien}` : "La sesión fue finalizada", { id: "sesion-finalizada" });
  }, [quien]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
    <div className="min-h-full flex flex-col items-center justify-center gap-5 p-4 md:p-6">
      <div className="flex flex-col items-center gap-3 bg-muted/50 rounded-3xl px-6 md:px-10 py-8 md:py-10 max-w-sm w-full text-center">
        <div className="flex items-center justify-center h-14 w-14 rounded-full bg-muted">
          <Users2 className="h-7 w-7 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">Esta sesión ha finalizado</h2>
        <p className="text-sm text-muted-foreground">
          {session?.ended_by
            ? <>La finalizó <span className="text-foreground font-medium">{quien ?? "…"}</span>{session?.ended_at ? ` el ${fechaCorta(session.ended_at)}` : ""}.</>
            : "La finalizó un supervisor."}
          {" "}Los enlaces y códigos de esta sesión ya no sirven: pide el de la sesión nueva.
        </p>
        <div className="flex flex-wrap justify-center gap-2 mt-1">
          <Button variant="secondary" className="rounded-full px-6" onClick={() => navigate("/dashboard", { replace: true })}>
            Volver al dashboard
          </Button>
          <Button className="rounded-full px-6" onClick={() => navigate("/cowork", { replace: true })}>
            Ir a Cowork
          </Button>
        </div>
      </div>
    </div>
    </div>
  );
}
