import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2, Loader2, Search, Mail } from "lucide-react";
import ChatterEvaluatorHeader from "./ChatterEvaluatorHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  useBulkDeleteChatterSessions,
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
  const bulkDeleteMut = useBulkDeleteChatterSessions();
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
  // Bulk select — set de ids seleccionados. Sólo se rendea la columna
  // de checkboxes si el user puede borrar (canDelete), para no ofrecer
  // selección a quien no puede actuar sobre ella.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

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

  // Si la lista filtered cambia (search, refetch realtime, etc.), limpiamos
  // del selectedIds los ids que ya no aparecen — evita quedar con
  // selecciones huérfanas.
  useEffect(() => {
    if (selectedIds.size === 0) return;
    const valid = new Set(filtered.map((s) => s.id));
    let changed = false;
    const next = new Set<string>();
    for (const id of selectedIds) {
      if (valid.has(id)) next.add(id);
      else changed = true;
    }
    if (changed) setSelectedIds(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered]);

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((s) => selectedIds.has(s.id));
  const someVisibleSelected =
    !allVisibleSelected && filtered.some((s) => selectedIds.has(s.id));

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    if (allVisibleSelected) {
      // Deselecciona todas las visibles, pero deja intactas las que
      // estaban seleccionadas pero ya no son visibles (poco común con
      // el search, pero defensivo).
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const s of filtered) next.delete(s.id);
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const s of filtered) next.add(s.id);
        return next;
      });
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

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

  const confirmBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    const ids = Array.from(selectedIds);
    try {
      // Bulk DELETE en una sola query — antes era un loop con N awaits +
      // N invalidaciones que colgaba la UI con muchas sesiones.
      const { requested, deleted } = await bulkDeleteMut.mutateAsync(ids);
      setBulkDeleting(false);
      setBulkConfirmOpen(false);
      setSelectedIds(new Set());
      if (deleted === requested) {
        toast.success(`${deleted} sesion${deleted > 1 ? "es" : ""} eliminada${deleted > 1 ? "s" : ""}`);
      } else if (deleted === 0) {
        // RLS rechazó todo: la policy de DELETE pide examiner_user_id =
        // auth.uid(), así que un admin que ve sesiones de otros en el
        // History no las puede borrar (esa policy no acompañó al global
        // read scope todavía).
        toast.error("No se pudo eliminar ninguna sesión", {
          description: "Sólo puedes borrar tus propias sesiones. Las que creaste otros examiners requieren un permiso que todavía no está habilitado.",
        });
      } else {
        toast.warning(`${deleted} de ${requested} eliminadas`, {
          description: `${requested - deleted} no se pudieron borrar (probablemente eran de otros examiners).`,
        });
      }
    } catch (e) {
      setBulkDeleting(false);
      toast.error("Error al eliminar", { description: (e as Error).message });
    }
  };

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      <ChatterEvaluatorHeader />
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por chatter o personaje…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>

          {/* Bulk actions — sólo cuando el user puede borrar y tiene
              al menos una selección activa. Le mostramos el contador y
              los dos CTAs (limpiar / borrar). */}
          {canDelete && selectedIds.size > 0 && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-1.5 text-xs">
              <span className="font-medium">
                {selectedIds.size} seleccionada{selectedIds.size > 1 ? "s" : ""}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSelection}
                className="h-7 px-2 text-xs"
              >
                Limpiar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setBulkConfirmOpen(true)}
                className="h-7 px-2 text-xs"
              >
                <Trash2 className="mr-1.5 h-3 w-3" />
                Eliminar selección
              </Button>
            </div>
          )}
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
              <>
                {/* Header con el "Select all" para las visibles. Sólo
                    renderea si el user puede borrar — el resto no necesita
                    esta columna. */}
                {canDelete && (
                  <div className="flex items-center gap-3 border-b border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    <Checkbox
                      checked={
                        allVisibleSelected
                          ? true
                          : someVisibleSelected
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={toggleAllVisible}
                      aria-label="Seleccionar todas"
                    />
                    <span>
                      {allVisibleSelected
                        ? `Todas las ${filtered.length} visibles seleccionadas`
                        : someVisibleSelected
                          ? `${
                              filtered.filter((s) => selectedIds.has(s.id))
                                .length
                            } de ${filtered.length} seleccionadas`
                          : `Seleccionar las ${filtered.length} visibles`}
                    </span>
                  </div>
                )}
                <div className="divide-y divide-border">
                  {filtered.map((s) => {
                    const profile = profilesById.get(s.profile_id) ?? null;
                    const selected = selectedIds.has(s.id);
                    return (
                      <div
                        key={s.id}
                        className={
                          "group flex items-center gap-3 p-3 transition-colors " +
                          (selected
                            ? "bg-destructive/5 hover:bg-destructive/10"
                            : "hover:bg-muted/40")
                        }
                      >
                        {canDelete && (
                          <Checkbox
                            checked={selected}
                            onCheckedChange={() => toggleOne(s.id)}
                            aria-label="Seleccionar sesión"
                            className="shrink-0"
                          />
                        )}
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
              </>
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
            <AlertDialogCancel disabled={deleteMut.isPending} />
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
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

      <AlertDialog
        open={bulkConfirmOpen}
        onOpenChange={(o) => !bulkDeleting && setBulkConfirmOpen(o)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Eliminar {selectedIds.size} sesión
              {selectedIds.size > 1 ? "es" : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se borran permanentemente los mensajes y las evaluaciones de
              las <strong>{selectedIds.size}</strong> sesiones seleccionadas.
              No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleting} />
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void confirmBulkDelete();
              }}
              disabled={bulkDeleting}
            >
              {bulkDeleting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Eliminar {selectedIds.size}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
};

export default HistoryContent;
