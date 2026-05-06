import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Clock, CircleDot, CircleDashed, Trash2, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useChatterSessions,
  useChatterProfiles,
  useEndChatterSession,
  useDeleteChatterSession,
} from "@/hooks/useChatterEvaluator";
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
  canDelete,
  onSelect,
  onEnd,
  onDelete,
}: {
  session: ChatterSession;
  profile: ChatterProfile | null;
  active: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onEnd: () => void;
  onDelete: () => void;
}) => {
  const isEnded = session.status === "ended";
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group flex w-full items-center gap-2 rounded-md p-2 text-left transition-colors ${
        active ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-muted"
      }`}
    >
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
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="truncate">{profile?.name ?? "?"}</span>
          <span>·</span>
          <Clock className="h-2.5 w-2.5" />
          <span>{formatRelative(session.created_at)}</span>
        </div>
      </div>
      {/* Acciones por estado:
          - Sesión abierta → X para cerrarla.
          - Sesión cerrada + permiso "Borrar Historial" → trash para eliminar.
          - Sesión cerrada sin permiso → no muestra nada. */}
      {!isEnded ? (
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
      ) : canDelete ? (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onDelete();
            }
          }}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/20 hover:text-destructive group-hover:opacity-100"
          aria-label="Eliminar permanentemente"
          title="Eliminar permanentemente"
        >
          <Trash2 className="h-3 w-3" />
        </span>
      ) : null}
    </button>
  );
};

// HistoryPanel — listado unificado de TODAS las sesiones (abiertas y
// cerradas). Click en una row → se selecciona en el chat. El delete
// de sesiones cerradas requiere permiso "Chatters → Borrar Historial"
// (admin-only por default, configurable desde Settings → Roles).
export const HistoryPanel = ({ selectedId, onSelect }: Props) => {
  const sessionsQ = useChatterSessions("all");
  const profilesQ = useChatterProfiles();
  const endMut = useEndChatterSession();
  const deleteMut = useDeleteChatterSession();
  const qc = useQueryClient();
  const { canAccess } = usePermissions();
  const canDelete = canAccess("Chatters", "Borrar Historial");

  const [endTarget, setEndTarget] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Realtime — mantiene la lista actualizada cuando otra persona crea
  // una sesión, el chatter reclama el link, etc.
  useEffect(() => {
    const channel = supabase
      .channel("chatter-sessions-history")
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

  // Orden: abiertas primero (más reciente arriba), después cerradas.
  const all = sessionsQ.data ?? [];
  const sorted = useMemo(() => {
    const copy = [...all];
    copy.sort((a, b) => {
      const aOpen = a.status !== "ended" ? 0 : 1;
      const bOpen = b.status !== "ended" ? 0 : 1;
      if (aOpen !== bOpen) return aOpen - bOpen;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    return copy;
  }, [all]);

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

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMut.mutateAsync(deleteTarget);
      if (selectedId === deleteTarget) onSelect(null);
      setDeleteTarget(null);
      toast.success("Sesión eliminada");
    } catch (e) {
      toast.error("No se pudo eliminar", { description: (e as Error).message });
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-2 space-y-1">
        {sessionsQ.isLoading && (
          <p className="p-2 text-xs text-muted-foreground">Cargando…</p>
        )}
        {!sessionsQ.isLoading && sorted.length === 0 && (
          <p className="p-4 text-center text-xs text-muted-foreground">
            Aún no hay sesiones.
          </p>
        )}
        {sorted.map((s) => (
          <SessionRow
            key={s.id}
            session={s}
            profile={profilesById.get(s.profile_id) ?? null}
            active={s.id === selectedId}
            canDelete={canDelete}
            onSelect={() => onSelect(s.id)}
            onEnd={() => setEndTarget(s.id)}
            onDelete={() => setDeleteTarget(s.id)}
          />
        ))}
      </div>

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

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar sesión</AlertDialogTitle>
            <AlertDialogDescription>
              Se borran permanentemente los mensajes y la evaluación de esta
              sesión cerrada. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-500 hover:bg-rose-600"
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default HistoryPanel;
