import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2, Loader2, Search, Mail } from "lucide-react";
import ChatterEvaluatorHeader from "./ChatterEvaluatorHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useChatterSessions,
  useChatterProfiles,
  useDeleteChatterSession,
  useResendChatterEmail,
} from "@/hooks/useChatterEvaluator";
import type { ChatterSession, ChatterProfile } from "./types";

// Página dedicada al historial de sesiones cerradas. Sale de la página
// principal del Chatter Evaluator (/chatter-evaluator → botón History).
//
// Permisos:
//   - Listado: cualquier usuario con acceso a "Chatters → Evaluator"
//     (mismo gate de la home).
//   - Borrar: requiere "Chatters → Borrar Historial". Admin lo tiene
//     siempre via canAccess; otros roles dependen del toggle en
//     Settings → Usuarios → Roles.

const fmtDate = (iso: string): string => {
  try {
    return new Date(iso).toLocaleString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

const HistoryContent = () => {
  // scope='global' → admin/role con data_scope='all' ve sesiones de TODOS
  // los examiners. Roles con data_scope='self' siguen viendo sólo las
  // propias (el RLS aplica el filtro por examiner_user_id).
  const sessionsQ = useChatterSessions("all", "global");
  const profilesQ = useChatterProfiles();
  const deleteMut = useDeleteChatterSession();
  const resendMut = useResendChatterEmail();
  const [resendingId, setResendingId] = useState<string | null>(null);

  const handleResend = async (sessionId: string) => {
    setResendingId(sessionId);
    try {
      await resendMut.mutateAsync(sessionId);
      // El toast de éxito/fallo lo emite fireWebhookInBackground.
    } catch (e) {
      toast.error("No se pudo reenviar", {
        description: (e as Error).message,
      });
    } finally {
      setResendingId(null);
    }
  };
  const qc = useQueryClient();
  const { canAccess } = usePermissions();
  const canDelete = canAccess("Chatters", "Borrar Historial");

  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ChatterSession | null>(null);

  // Realtime — refresca cuando una sesión se cierra desde el workspace.
  useEffect(() => {
    const channel = supabase
      .channel("chatter-sessions-history-page")
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

  // Solo cerradas, más recientes arriba, filtradas por búsqueda libre
  // (matchea contra nombre del chatter y nombre del personaje).
  const filtered = useMemo(() => {
    const closed = (sessionsQ.data ?? []).filter((s) => s.status === "ended");
    closed.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    if (!search.trim()) return closed;
    const q = search.toLowerCase().trim();
    return closed.filter((s) => {
      const profile = profilesById.get(s.profile_id);
      return (
        s.chatter_name.toLowerCase().includes(q) ||
        (profile?.name ?? "").toLowerCase().includes(q)
      );
    });
  }, [sessionsQ.data, profilesById, search]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMut.mutateAsync(deleteTarget.id);
      toast.success("Sesión eliminada");
      setDeleteTarget(null);
    } catch (e) {
      toast.error("No se pudo eliminar", { description: (e as Error).message });
    }
  };

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      <ChatterEvaluatorHeader />
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por chatter o personaje…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        <Card>
          <CardContent className="p-0">
            {sessionsQ.isLoading ? (
              <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando…
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                {search.trim()
                  ? "Ninguna sesión coincide con la búsqueda."
                  : "Aún no hay sesiones cerradas."}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filtered.map((s) => {
                  const profile = profilesById.get(s.profile_id) ?? null;
                  return (
                    <div
                      key={s.id}
                      className="group flex items-center gap-3 p-3 transition-colors hover:bg-muted/40"
                    >
                      <Link
                        to={`/chatter-evaluator/history/${s.id}`}
                        className="flex flex-1 items-center gap-3"
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
                              {(profile?.name ?? s.chatter_name)[0]}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">
                              {s.chatter_name}
                            </span>
                            <Badge variant="outline" className="text-[10px]">
                              cerrada
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="truncate">
                              {profile?.name ?? "(sin perfil)"}
                            </span>
                            <span>·</span>
                            <span>{fmtDate(s.created_at)}</span>
                          </div>
                        </div>
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleResend(s.id)}
                        disabled={resendingId === s.id}
                        className="h-8 w-8 text-muted-foreground hover:bg-primary/15 hover:text-primary"
                        title="Reenviar email del reporte"
                        aria-label="Reenviar email"
                      >
                        {resendingId === s.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Mail className="h-4 w-4" />
                        )}
                      </Button>
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget(s)}
                          className="h-8 w-8 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                          title="Eliminar sesión"
                          aria-label="Eliminar sesión"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar sesión</AlertDialogTitle>
            <AlertDialogDescription>
              Se borran permanentemente los mensajes y la evaluación de la
              sesión de <strong>{deleteTarget?.chatter_name}</strong>. No se
              puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-500 hover:bg-rose-600"
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
};

export default HistoryContent;
