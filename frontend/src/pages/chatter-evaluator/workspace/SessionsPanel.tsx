import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, X, Clock, CircleDot, CircleDashed, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  useChatterSessions,
  useChatterProfiles,
  useEndChatterSession,
  useDeleteChatterSession,
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
  if (status === "active")  return <CircleDot className="h-3 w-3 text-emerald-500" />;
  if (status === "waiting") return <CircleDashed className="h-3 w-3 text-amber-500" />;
  return <CircleDashed className="h-3 w-3 text-muted-foreground" />;
};

const SessionRow = ({
  session,
  profile,
  active,
  onSelect,
  onEnd,
  onDelete,
}: {
  session: ChatterSession;
  profile: ChatterProfile | null;
  active: boolean;
  onSelect: () => void;
  onEnd: () => void;
  onDelete: () => void;
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
    {session.status !== "ended" ? (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onEnd(); }}
        className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/20 hover:text-destructive group-hover:opacity-100"
        aria-label="Cerrar sesión"
        title="Cerrar sesión"
      >
        <X className="h-3 w-3" />
      </button>
    ) : (
      // Closed sessions get a trash icon instead — fully removes the
      // session row + cascades messages/evaluation, since the user
      // explicitly asked for a way to clean up the closed list.
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/20 hover:text-destructive group-hover:opacity-100"
        aria-label="Eliminar sesión"
        title="Eliminar permanentemente"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    )}
  </button>
);

export const SessionsPanel = ({ selectedId, onSelect }: Props) => {
  const sessionsQ = useChatterSessions("all");
  const profilesQ = useChatterProfiles();
  const endMut = useEndChatterSession();
  const deleteMut = useDeleteChatterSession();
  const qc = useQueryClient();
  const [newOpen, setNewOpen] = useState(false);
  const [tab, setTab] = useState<"open" | "ended">("open");
  // Confirm dialogs — replace the browser-native confirm() the user
  // flagged as ugly. Both keep the target session id in state.
  const [endTarget, setEndTarget] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Realtime: keep the list in sync when sessions are updated externally
  // (e.g. the chatter claims a device, status flips to active) or other
  // examiners create new ones.
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

  const all = sessionsQ.data ?? [];
  const open = all.filter((s) => s.status !== "ended");
  const ended = all.filter((s) => s.status === "ended");
  const visible = tab === "open" ? open : ended;

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
      <div className="flex items-center justify-between border-b p-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setTab("open")}
            className={`rounded px-2 py-1 text-xs font-medium ${
              tab === "open" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            Abiertas
            <Badge variant="outline" className="ml-1.5 h-4 px-1 text-[9px]">{open.length}</Badge>
          </button>
          <button
            type="button"
            onClick={() => setTab("ended")}
            className={`rounded px-2 py-1 text-xs font-medium ${
              tab === "ended" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            Cerradas
            <Badge variant="outline" className="ml-1.5 h-4 px-1 text-[9px]">{ended.length}</Badge>
          </button>
        </div>
        <Button size="sm" onClick={() => setNewOpen(true)} className="h-7 gap-1 text-xs">
          <Plus className="h-3 w-3" /> Nueva
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2 space-y-1">
        {sessionsQ.isLoading && (
          <p className="p-2 text-xs text-muted-foreground">Cargando…</p>
        )}
        {!sessionsQ.isLoading && visible.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-6 text-center text-xs text-muted-foreground">
            {tab === "open" ? (
              <>
                <p>Sin sesiones abiertas.</p>
                <Button size="sm" onClick={() => setNewOpen(true)} className="gap-1">
                  <Plus className="h-3 w-3" /> Nueva sesión
                </Button>
              </>
            ) : (
              <p>No hay sesiones cerradas todavía.</p>
            )}
          </div>
        )}
        {visible.map((s) => (
          <SessionRow
            key={s.id}
            session={s}
            profile={profilesById.get(s.profile_id) ?? null}
            active={s.id === selectedId}
            onSelect={() => onSelect(s.id)}
            onEnd={() => setEndTarget(s.id)}
            onDelete={() => setDeleteTarget(s.id)}
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
              La sesión se mueve a la pestaña "Cerradas".
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

export default SessionsPanel;
