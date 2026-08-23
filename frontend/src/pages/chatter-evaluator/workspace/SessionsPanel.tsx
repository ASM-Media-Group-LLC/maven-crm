import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Plus, X, Clock, CircleDot, CircleDashed, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  useChatterSessions,
  useChatterProfiles,
  useEndChatterSession,
} from "@/hooks/useChatterEvaluator";
import { playSoundFile } from "./VolumeControl";
import { loadDismissedFromStorage, dismissSession, DISMISSED_EVENT } from "./dismissedSessions";
import { NewSessionDialog } from "../NewSessionDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ChatterSession, ChatterProfile } from "../types";

interface Props {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

const formatRelative = (iso: string): string => {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
};

const StatusDot = ({ status }: { status: ChatterSession["status"] }) => {
  if (status === "active") return <CircleDot className="h-3 w-3 text-emerald-500" />;
  if (status === "waiting") return <CircleDashed className="h-3 w-3 text-amber-500" />;
  return <CircleDashed className="h-3 w-3 text-muted-foreground" />;
};

const SessionRow = ({
  session,
  profile,
  active,
  unread,
  totalSpent,
  isTyping,
  onSelect,
  onEnd,
}: {
  session: ChatterSession;
  profile: ChatterProfile | null;
  active: boolean;
  unread: number;
  totalSpent: number;
  isTyping: boolean;
  onSelect: () => void;
  onEnd: () => void;
}) => (
  <button
    type="button"
    onClick={onSelect}
    className={`group relative flex w-full items-center gap-1.5 rounded-md p-1.5 text-left transition-colors ${
      active ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-muted"
    }`}
  >
    {/* Unread badge — anclada a la esquina superior derecha del card,
        OUTSIDE del flujo inline para no robarle ancho al nombre.
        Mismo lugar que típicamente usan iOS / Discord para
        notificaciones de chat. */}
    {unread > 0 && (
      <span
        className="pointer-events-none absolute -right-1 -top-1 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white shadow ring-2 ring-background"
        aria-label={`${unread} mensajes sin leer`}
      >
        {unread > 99 ? "99+" : unread}
      </span>
    )}
    <div className="aspect-square h-9 w-9 shrink-0 overflow-hidden rounded-full bg-muted">
      {profile?.avatar_url ? (
        <img
          src={profile.avatar_url}
          alt={profile.name}
          className="h-full w-full object-cover"
          style={{
            objectPosition: `${profile.avatar_x ?? 50}% ${profile.avatar_y ?? 50}%`,
            transform: `scale(${(profile.avatar_zoom ?? 100) / 100})`,
          }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs">
          {(profile?.name ?? session.chatter_name)[0]}
        </div>
      )}
    </div>
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5">
        <StatusDot status={session.status} />
        <span className="truncate text-sm font-medium">{session.chatter_name}</span>
      </div>
      {isTyping ? (
        <div className="flex items-center gap-1 text-[11px] font-medium text-emerald-500">
          <span className="inline-flex gap-0.5">
            <span className="h-1 w-1 animate-pulse rounded-full bg-current" style={{ animationDelay: "0ms" }} />
            <span className="h-1 w-1 animate-pulse rounded-full bg-current" style={{ animationDelay: "150ms" }} />
            <span className="h-1 w-1 animate-pulse rounded-full bg-current" style={{ animationDelay: "300ms" }} />
          </span>
          <span>escribiendo…</span>
        </div>
      ) : (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          {/* Nombre del modelo: flex-1 + min-w-0 + truncate para que tome
              todo el espacio disponible. Los chips de tiempo y $ son
              shrink-0 (anchura fija, no compiten por ancho). */}
          <span className="min-w-0 flex-1 truncate">{profile?.name ?? "?"}</span>
          <span className="flex shrink-0 items-center gap-0.5 whitespace-nowrap">
            <Clock className="h-2.5 w-2.5" />
            {formatRelative(session.created_at)}
          </span>
          <span className="shrink-0 whitespace-nowrap font-mono font-bold text-emerald-500">
            ${totalSpent}
          </span>
        </div>
      )}
    </div>
    <span
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onEnd();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onEnd();
        }
      }}
      className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/20 hover:text-destructive group-hover:opacity-100"
      aria-label="Cerrar sesión"
      title="Cerrar sesión"
    >
      <X className="h-3 w-3" />
    </span>
  </button>
);

// Constante compartida con la vista del chat: cuántos ms después del
// último timestamp de typing_chatter_at consideramos que el chatter
// dejó de escribir. Misma lógica que el original Roleplaychatters.
const TYPING_TIMEOUT_MS = 3500;

// SessionsPanel — listado de sesiones activas + ended pendientes de
// dismiss por el user. Antes tenía tabs Abiertas/Cerradas; el listado
// de cerradas se movió al tab History del rail derecho. El header ahora
// solo tiene "+ Nueva".
//
// El concepto de "dismiss del workspace" es local al usuario: cuando
// hace click en la X del SessionRow, la sesión deja de aparecer en su
// rail. Eso NO toca el status de la DB (la sesión queda exactamente
// como estaba). Persistido en localStorage para que sobreviva refreshes. La lógica de
// load/persist/dismiss vive en ./dismissedSessions (compartida con WorkspaceContent, que
// auto-dismissea al enviar la evaluación).

export const SessionsPanel = ({ selectedId, onSelect }: Props) => {
  const sessionsQ = useChatterSessions("all");
  const profilesQ = useChatterProfiles();
  const qc = useQueryClient();
  const [newOpen, setNewOpen] = useState(false);
  const endMut = useEndChatterSession();
  // dismissed local del workspace (persist en localStorage)
  const [dismissed, setDismissed] = useState<Set<string>>(loadDismissedFromStorage);
  // Sesión en proceso de confirmar "terminar y cerrar" (sólo cuando
  // la sesión todavía está viva — para ended dismisseamos directo).
  const [endConfirm, setEndConfirm] = useState<ChatterSession | null>(null);

  // Tick cada segundo para que el "escribiendo" auto-expire al envejecer
  // typing_chatter_at más allá de TYPING_TIMEOUT_MS sin necesidad de
  // recibir un nuevo evento realtime.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  // Re-sincroniza el set de dismissed cuando cambia desde OTRA vista (WorkspaceContent
  // auto-dismissea al enviar la evaluación) o desde otra pestaña (evento storage).
  useEffect(() => {
    const resync = () => setDismissed(loadDismissedFromStorage());
    window.addEventListener(DISMISSED_EVENT, resync);
    window.addEventListener("storage", resync);
    return () => {
      window.removeEventListener(DISMISSED_EVENT, resync);
      window.removeEventListener("storage", resync);
    };
  }, []);

  // Unread counts por sesión — el RPC filtra por examiner_user_id =
  // auth.uid() así sólo trae las del user logueado.
  //
  // Polling cada 2s para que el ping de notificación cross-session
  // tenga lag mínimo. El RPC es barato (un count + filter por user),
  // 2s no estresa el DB y da feedback perceptual "tiempo real".
  const unreadQ = useQuery({
    queryKey: ["chatter-sessions-unread"],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase.rpc("chatter_sessions_unread_counts" as never);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const row of (data ?? []) as Array<{ session_id: string; unread_count: number }>) {
        map[row.session_id] = Number(row.unread_count) || 0;
      }
      return map;
    },
    refetchOnWindowFocus: true,
    refetchInterval: 2_000,
    refetchIntervalInBackground: false,
    staleTime: 1_500,
  });
  const unreadById = unreadQ.data ?? {};

  // Total gastado por el fan en cada sesión (suma de tips + purchases).
  // Mismo cálculo que `chatterTotalSpent` en ChatterPublicView, pero
  // agregado por session_id desde el backend con un RPC. Polling 5s —
  // los tips/purchases entran con menos frecuencia que mensajes normales.
  const totalSpentQ = useQuery({
    queryKey: ["chatter-sessions-total-spent"],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase.rpc(
        "chatter_sessions_total_spent" as never,
      );
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const row of (data ?? []) as Array<{
        session_id: string;
        total_spent: number | string;
      }>) {
        map[row.session_id] = Number(row.total_spent) || 0;
      }
      return map;
    },
    refetchOnWindowFocus: true,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    staleTime: 4_000,
  });
  const totalSpentById = totalSpentQ.data ?? {};

  // Ping de notificación cross-session: cuando el unread count de una
  // sesión sube (vs el snapshot anterior) y NO es la sesión activa,
  // sonar. Usa el polling del unread RPC en vez de un listener
  // realtime separado — eso es lo que rompió el realtime del ChatPanel
  // en PR #139 (dos subscriptions overlapping a chatter_messages).
  //
  // Lag perceptual: hasta ~2s (intervalo del polling). Aceptable para
  // "tenés mensaje pendiente en otra conversación".
  //
  // Skip del primer render (prev=null) para no sonar al cargar la
  // app si ya había mensajes pendientes de antes.
  const prevUnreadRef = useRef<Record<string, number> | null>(null);
  const selectedIdRef = useRef(selectedId);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);
  useEffect(() => {
    const prev = prevUnreadRef.current;
    prevUnreadRef.current = unreadById;
    if (!prev) return;
    for (const [sessionId, count] of Object.entries(unreadById)) {
      const prevCount = prev[sessionId] ?? 0;
      if (count > prevCount && sessionId !== selectedIdRef.current) {
        playSoundFile("notification");
        break;
      }
    }
  }, [unreadById]);

  // Realtime — refresca la lista cuando otra persona crea, cierra o
  // edita una sesión. NOTA: ya NO escuchamos chatter_messages aquí
  // porque tener dos subscriptions overlapping a la misma tabla
  // (esta sin filter + la del ChatPanel con filter por session_id)
  // hacía que el evento se ruteara solo a una, rompiendo el realtime
  // del chat (notif sonaba pero mensaje no aparecía). La actualización
  // de unread counts y el sonido de notificación cross-session se
  // re-implementan después con un mecanismo que no compita.
  useEffect(() => {
    const channel = supabase
      .channel("chatter-sessions-list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chatter_sessions" },
        () => {
          qc.invalidateQueries({ queryKey: ["chatter-sessions"] });
          qc.invalidateQueries({ queryKey: ["chatter-sessions-unread"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const profilesById = useMemo(() => {
    const m = new Map<string, ChatterProfile>();
    for (const p of profilesQ.data ?? []) m.set(p.id, p);
    return m;
  }, [profilesQ.data]);

  // Mostramos en el rail:
  //   · Todas las sesiones activas (waiting/active) que NO están dismissed
  //   · Sesiones ended que el user todavía NO dismisseó (típicamente
  //     porque está terminando la evaluación final)
  // Las ended dismissed quedan en el historial (/chatter-evaluator/history).
  const open = useMemo(
    () => (sessionsQ.data ?? []).filter((s) => !dismissed.has(s.id)),
    [sessionsQ.data, dismissed],
  );

  // Quitar una sesión del workspace del user (no toca el status del DB).
  // Si era la sesión activa, también la des-seleccionamos para que el
  // ChatPanel se vacíe.
  const dismissFromWorkspace = (sessionId: string) => {
    // Escribe localStorage + dispara DISMISSED_EVENT → el listener de abajo re-sincroniza
    // `dismissed` (mismo path que el auto-dismiss al enviar la evaluación en WorkspaceContent).
    dismissSession(sessionId);
    if (selectedId === sessionId) onSelect(null);
  };

  // Click en la X del SessionRow:
  //   · status='ended' → dismiss directo (la sesión ya está terminada
  //     en DB; cerrarla del workspace es puramente local).
  //   · status vivo (waiting/active) → pedir confirmación antes de
  //     terminar la sesión en DB Y dismissearla del workspace. Avisar
  //     al user que al cerrarla pierde la posibilidad de mandar la
  //     evaluación.
  const handleEndClick = (session: ChatterSession) => {
    if (session.status === "ended") {
      dismissFromWorkspace(session.id);
    } else {
      setEndConfirm(session);
    }
  };

  const confirmEndAndDismiss = async () => {
    if (!endConfirm) return;
    const sessionId = endConfirm.id;
    try {
      await endMut.mutateAsync(sessionId);
      dismissFromWorkspace(sessionId);
      setEndConfirm(null);
      toast.success("Sesión terminada y cerrada del workspace");
    } catch (e) {
      toast.error("No se pudo terminar", { description: (e as Error).message });
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header del rail (220px). Con esa anchura ya entra el label y el
          botón "+ Nueva sesión" lado a lado sin desbordar. */}
      <div className="flex shrink-0 items-center justify-between border-b p-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Sesiones
        </span>
        <Button size="sm" onClick={() => setNewOpen(true)} className="h-7 gap-1 text-xs">
          <Plus className="h-3 w-3" /> Nueva sesión
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2 space-y-1">
        {sessionsQ.isLoading && (
          <p className="p-2 text-xs text-muted-foreground">Cargando…</p>
        )}
        {!sessionsQ.isLoading && open.length === 0 && (
          <p className="p-4 text-center text-xs italic text-muted-foreground">
            Sin sesiones abiertas.
          </p>
        )}
        {open.map((s) => {
          const ts = s.typing_chatter_at ? new Date(s.typing_chatter_at).getTime() : 0;
          const isTyping = !!ts && now - ts < TYPING_TIMEOUT_MS;
          return (
            <SessionRow
              key={s.id}
              session={s}
              profile={profilesById.get(s.profile_id) ?? null}
              active={s.id === selectedId}
              unread={unreadById[s.id] ?? 0}
              totalSpent={totalSpentById[s.id] ?? 0}
              isTyping={isTyping}
              onSelect={() => {
                // Marcar la sesión como leída INMEDIATAMENTE al click —
                // antes esto se hacía solo en el useEffect del ChatPanel,
                // que tenía race con el polling del unread (cada 2s) y
                // dejaba el badge stuck en el count viejo cuando el user
                // navegaba rápido entre sesiones. Ahora:
                //   1. Optimistic update del badge a 0
                //   2. UPDATE de read_by_examiner_at = now() (fire-and-
                //      forget — el polling natural sincroniza después)
                //   3. Switch a la sesión
                // El effect del ChatPanel sigue funcionando para mensajes
                // nuevos que entran MIENTRAS el examiner mira la sesión.
                if (!document.hidden && document.hasFocus()) {
                  qc.setQueryData<Record<string, number>>(
                    ["chatter-sessions-unread"],
                    (prev) => ({ ...(prev ?? {}), [s.id]: 0 }),
                  );
                  void supabase
                    .from("chatter_sessions" as never)
                    .update({ read_by_examiner_at: new Date().toISOString() } as never)
                    .eq("id", s.id as never);
                }
                onSelect(s.id);
              }}
              onEnd={() => handleEndClick(s)}
            />
          );
        })}
      </div>

      <NewSessionDialog open={newOpen} onOpenChange={setNewOpen} />

      <AlertDialog
        open={!!endConfirm}
        onOpenChange={(o) => !o && !endMut.isPending && setEndConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cerrar sesión activa</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>Esta sesión todavía está abierta. Si la cierras del workspace ahora:</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>
                    Se <strong>termina la sesión para el chatter</strong> — no podrá enviar más mensajes y el link se invalida.
                  </li>
                  <li>
                    <strong>NO vas a poder enviar la evaluación</strong> después porque la sesión sale de tu workspace.
                  </li>
                </ul>
                <p className="mt-2">¿Estás seguro?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={endMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-500 hover:bg-rose-600"
              onClick={(e) => {
                e.preventDefault();
                void confirmEndAndDismiss();
              }}
              disabled={endMut.isPending}
            >
              {endMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Terminar y cerrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SessionsPanel;
