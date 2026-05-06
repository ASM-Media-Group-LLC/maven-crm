import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Plus, X, Clock, CircleDot, CircleDashed, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  useChatterSessions,
  useChatterProfiles,
  useEndChatterSession,
} from "@/hooks/useChatterEvaluator";
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
  onSelect,
  onEnd,
}: {
  session: ChatterSession;
  profile: ChatterProfile | null;
  active: boolean;
  onSelect: () => void;
  onEnd: () => void;
}) => (
  <button
    type="button"
    onClick={onSelect}
    className={`group flex w-full items-center gap-2 rounded-md p-2 text-left transition-colors ${
      active ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-muted"
    }`}
  >
    <div className="aspect-square h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted">
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
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <span className="truncate">{profile?.name ?? "?"}</span>
        <span>·</span>
        <Clock className="h-2.5 w-2.5" />
        <span>{formatRelative(session.created_at)}</span>
      </div>
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

// SessionsPanel — listado de sesiones ABIERTAS (status !== 'ended').
// Antes tenía tabs Abiertas/Cerradas; el listado de cerradas se movió
// al tab History del rail derecho. El header ahora solo tiene "+ Nueva".
export const SessionsPanel = ({ selectedId, onSelect }: Props) => {
  const sessionsQ = useChatterSessions("all");
  const profilesQ = useChatterProfiles();
  const endMut = useEndChatterSession();
  const qc = useQueryClient();
  const [newOpen, setNewOpen] = useState(false);
  const [endTarget, setEndTarget] = useState<string | null>(null);

  // Realtime — refresca la lista cuando otra persona crea, cierra o
  // edita una sesión.
  useEffect(() => {
    const channel = supabase
      .channel("chatter-sessions-list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chatter_sessions" },
        () => qc.invalidateQueries({ queryKey: ["chatter-sessions"] }),
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

  // Solo sesiones abiertas — las cerradas viven en /chatter-evaluator/history.
  const open = useMemo(
    () => (sessionsQ.data ?? []).filter((s) => s.status !== "ended"),
    [sessionsQ.data],
  );

  const confirmEnd = async () => {
    if (!endTarget) return;
    try {
      await endMut.mutateAsync(endTarget);
      if (selectedId === endTarget) onSelect(null);
      setEndTarget(null);
    } catch (e) {
      toast.error("No se pudo cerrar", { description: (e as Error).message });
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header del rail (110px de ancho). Label arriba + botón abajo en
          full-width: con el label y el botón en la misma fila el botón
          desbordaba la columna y se metía sobre el chat. Vertical stack
          mantiene todo dentro del rail incluso con el texto largo de
          "Nueva sesión". */}
      <div className="flex shrink-0 flex-col gap-2 border-b p-2">
        <span className="text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Sesiones
        </span>
        <Button
          size="sm"
          onClick={() => setNewOpen(true)}
          className="h-7 w-full gap-1 px-1 text-[11px]"
          title="Nueva sesión"
        >
          <Plus className="h-3 w-3 shrink-0" />
          <span className="truncate">Nueva sesión</span>
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
        {open.map((s) => (
          <SessionRow
            key={s.id}
            session={s}
            profile={profilesById.get(s.profile_id) ?? null}
            active={s.id === selectedId}
            onSelect={() => onSelect(s.id)}
            onEnd={() => setEndTarget(s.id)}
          />
        ))}
      </div>

      <NewSessionDialog open={newOpen} onOpenChange={setNewOpen} />

      <AlertDialog open={!!endTarget} onOpenChange={(o) => !o && setEndTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cerrar sesión</AlertDialogTitle>
            <AlertDialogDescription>
              El aspirante ya no podrá enviar mensajes y el link se invalida.
              La sesión queda como "cerrada" en el historial.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={endMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-500 hover:bg-rose-600"
              onClick={(e) => {
                e.preventDefault();
                void confirmEnd();
              }}
              disabled={endMut.isPending}
            >
              {endMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Cerrar sesión
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SessionsPanel;
