import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useCoworkSession, type AdminSessionRow } from "@/hooks/useCoworkSession";
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
import { Plus, Users2, ArrowRight, KeyRound, Loader2, VenetianMask } from "lucide-react";
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
  const [mySessions, setMySessions] = useState<Array<{ id: string; name: string; description: string | null; role: string; members: number; created_at: string; lastRoomId: string | null }>>([]);
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
    return () => { alive = false; };
  }, [sessionId, cowork.listMyActiveSessions]);

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
    } catch {
      toast.error("No se pudo finalizar la sesión");
    } finally {
      setFinalizando(false);
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
        {!loadingSessions && mySessions.length > 0 && (
          <div className="w-full max-w-lg flex flex-col gap-2">
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
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 w-full justify-end sm:w-auto">
                {s.role === "host" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive rounded-full"
                    onClick={() => setPorFinalizar({ id: s.id, name: s.name, members: s.members })}
                  >
                    Finalizar
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
        {isAdmin && allSessions.some((s) => !s.my_role) && (
          <div className="w-full max-w-lg flex flex-col gap-2">
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
                {s.rooms.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pl-13 sm:pl-[52px]">
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

        <div className="flex flex-col items-center gap-4 bg-primary/5 rounded-3xl px-6 md:px-10 py-10 md:py-12 max-w-lg w-full">
          <div className="flex items-center justify-center h-16 w-16 md:h-20 md:w-20 rounded-full bg-primary/10">
            <Users2 className="h-8 w-8 md:h-10 md:w-10 text-primary" />
          </div>
          <h1 className="text-xl md:text-3xl font-bold text-foreground tracking-tight text-center">
            Sala Cowork
          </h1>
          <p className="text-muted-foreground text-center text-sm md:text-base max-w-sm">
            {canCreateSessions
              ? mySessions.length > 0
                ? "Vuelve a una de tus salas activas o crea una nueva sesión."
                : "Crea una sesión cowork con múltiples salas y colabora en tiempo real."
              : mySessions.length > 0
                ? "Vuelve a una de tus salas activas."
                : "Abre el enlace que te compartió tu supervisor para entrar a tu sala."}
          </p>
          {!permissionLoading && (canCreateSessions ? (
            <Button
              onClick={() => setShowCreate(true)}
              size="lg"
              className="gap-2 rounded-full px-8 mt-2 shadow-md"
            >
              <Plus className="h-5 w-5" /> Crear sesión
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground/80 text-center max-w-sm mt-1">
              Solo los coordinadores pueden crear sesiones de Cowork.
            </p>
          ))}

          {/* Entrar por código: la puerta que sobrevive al copy/paste de WhatsApp,
              a la PWA y a que el link largo se pierda. Visible para TODOS — para el
              nivel miembro es SU vía de acceso. */}
          <div className="w-full max-w-xs flex flex-col gap-2 mt-3 pt-4 border-t border-border/40">
            <span className="text-xs text-muted-foreground text-center">
              Entrar con el código de tu sala
            </span>
            <div className="flex gap-2">
              <Input
                value={roomCode}
                onChange={(e) => setRoomCode(normalizeRoomCode(e.target.value))}
                onKeyDown={(e) => e.key === "Enter" && handleJoinByCode()}
                placeholder="ABC234"
                maxLength={ROOM_CODE_LENGTH}
                className="rounded-full text-center font-mono tracking-[0.25em] uppercase"
              />
              <Button
                onClick={handleJoinByCode}
                disabled={!isCompleteRoomCode(roomCode) || joiningByCode}
                className="rounded-full gap-1 shrink-0"
              >
                {joiningByCode ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                Entrar
              </Button>
            </div>
          </div>
        </div>

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
    return <CoworkSessionEndedRedirect />;
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
function CoworkSessionEndedRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    toast.info("La sesión fue finalizada por el supervisor");
    const t = setTimeout(() => navigate("/dashboard", { replace: true }), 50);
    return () => clearTimeout(t);
  }, [navigate]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
    <div className="min-h-full flex flex-col items-center justify-center gap-5 p-4 md:p-6">
      <div className="flex flex-col items-center gap-3 bg-muted/50 rounded-3xl px-6 md:px-10 py-8 md:py-10 max-w-sm w-full">
        <div className="flex items-center justify-center h-14 w-14 rounded-full bg-muted">
          <Users2 className="h-7 w-7 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">Esta sesión ha finalizado</h2>
        <Button
          variant="secondary"
          className="rounded-full px-6 mt-1"
          onClick={() => navigate("/dashboard", { replace: true })}
        >
          Volver al dashboard
        </Button>
      </div>
    </div>
    </div>
  );
}
