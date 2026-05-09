import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertTriangle,
  ExternalLink,
  Instagram,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  UserCog,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useTenantProfiles } from "@/hooks/useAgencyQa";
import {
  SPAM_ACCOUNT_STATUS_OPTIONS,
  type ScouterSpamAccount,
  type SpamAccountStatus,
  useCreateSpamAccount,
  useDeleteSpamAccount,
  useSpamAccounts,
  useUpdateSpamAccount,
} from "@/hooks/useScouterSpamAccounts";

// ScouterCuentas — registro de cuentas de Instagram que los scouters /
// spammers usan personalmente para hacer outreach manual. El manager
// las ve para auditar y rotar las que se queman. Estilo Maven: header
// + tabla en Card + dialog de form + alert dialog para borrar.

const STATUS_STYLES: Record<SpamAccountStatus, { bg: string; text: string }> = {
  active: { bg: "bg-emerald-500/15", text: "text-emerald-400" },
  shadowbanned: { bg: "bg-amber-500/15", text: "text-amber-400" },
  banned: { bg: "bg-rose-500/15", text: "text-rose-400" },
  retired: { bg: "bg-muted/40", text: "text-muted-foreground" },
};

const StatusPill = ({ status }: { status: SpamAccountStatus }) => {
  const cfg = STATUS_STYLES[status];
  const label =
    SPAM_ACCOUNT_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        cfg.bg,
        cfg.text,
      )}
    >
      {label}
    </span>
  );
};

const ScouterCuentas = () => {
  const accountsQ = useSpamAccounts();
  const profilesQ = useTenantProfiles();
  const create = useCreateSpamAccount();
  const update = useUpdateSpamAccount();
  const del = useDeleteSpamAccount();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ScouterSpamAccount | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ScouterSpamAccount | null>(
    null,
  );

  // Stats compactos arriba del listado.
  const stats = useMemo(() => {
    const list = accountsQ.data ?? [];
    return {
      total: list.length,
      active: list.filter((a) => a.status === "active").length,
      banned: list.filter((a) => a.status === "banned").length,
      shadowbanned: list.filter((a) => a.status === "shadowbanned").length,
    };
  }, [accountsQ.data]);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (acc: ScouterSpamAccount) => {
    setEditing(acc);
    setDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await del.mutateAsync(pendingDelete.id);
      toast.success("Cuenta eliminada");
      setPendingDelete(null);
    } catch (err) {
      toast.error("No se pudo eliminar", {
        description: (err as Error).message,
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Header — propósito del tab. Tono pedagógico para que el manager
          entienda qué pasa al primer vistazo. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 via-rose-500 to-amber-500 text-white shadow-sm">
            <Instagram className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Cuentas de spam</h2>
            <p className="text-xs text-muted-foreground">
              Registro de cuentas de Instagram que los scouters usan
              personalmente para hacer outreach (DMs, follows, comentarios).
              Sirve para auditar el roster y rotar las que se quemen.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={openCreate} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Agregar cuenta
        </Button>
      </div>

      {/* Stats compactos */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatBox label="Total" value={stats.total} />
        <StatBox label="Activas" value={stats.active} accent="text-emerald-400" />
        <StatBox
          label="Shadowban"
          value={stats.shadowbanned}
          accent="text-amber-400"
        />
        <StatBox label="Baneadas" value={stats.banned} accent="text-rose-400" />
      </div>

      {/* Tabla */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {accountsQ.isLoading ? (
            <div className="flex items-center gap-1.5 p-6 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Cargando cuentas…
            </div>
          ) : (accountsQ.data?.length ?? 0) === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center">
              <Instagram className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-medium">Sin cuentas todavía</p>
              <p className="max-w-md text-xs text-muted-foreground">
                Agregá la primera cuenta de IG que un scouter use para outreach.
                Después podés rotarla, marcarla como baneada, etc.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border/60 bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold">Handle</th>
                    <th className="px-4 py-2 text-left font-semibold">Nombre</th>
                    <th className="px-4 py-2 text-left font-semibold">Scouter</th>
                    <th className="px-4 py-2 text-left font-semibold">Estado</th>
                    <th className="px-4 py-2 text-left font-semibold">Notas</th>
                    <th className="px-4 py-2 text-right font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {(accountsQ.data ?? []).map((acc) => (
                    <tr key={acc.id} className="hover:bg-muted/20">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs">@{acc.instagram_handle}</span>
                          {(acc.instagram_url || acc.instagram_handle) && (
                            <a
                              href={
                                acc.instagram_url ||
                                `https://instagram.com/${acc.instagram_handle}`
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground transition-colors hover:text-pink-400"
                              title="Abrir en Instagram"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-foreground/90">
                        {acc.display_name ?? "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5 text-xs">
                          <UserCog className="h-3 w-3 text-muted-foreground" />
                          <span className="text-foreground/90">
                            {acc.scouter_name ?? <span className="italic text-muted-foreground">sin asignar</span>}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusPill status={acc.status} />
                      </td>
                      <td className="px-4 py-2.5 max-w-[200px] truncate text-xs text-muted-foreground" title={acc.notes ?? undefined}>
                        {acc.notes ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="inline-flex gap-1">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => openEdit(acc)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Editar</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                  onClick={() => setPendingDelete(acc)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Eliminar</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <SpamAccountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        profiles={profilesQ.data ?? []}
        onSubmit={async (data) => {
          try {
            if (editing) {
              await update.mutateAsync({
                id: editing.id,
                patch: data,
              });
              toast.success("Cuenta actualizada");
            } else {
              await create.mutateAsync(data);
              toast.success("Cuenta agregada");
            }
            setDialogOpen(false);
          } catch (err) {
            toast.error("No se pudo guardar", {
              description: (err as Error).message,
            });
          }
        }}
        loading={create.isPending || update.isPending}
      />

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Eliminar cuenta
            </AlertDialogTitle>
            <AlertDialogDescription>
              ¿Seguro que querés borrar la cuenta{" "}
              <strong>@{pendingDelete?.instagram_handle}</strong>? Esta acción no
              se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={del.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {del.isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Borrando…
                </>
              ) : (
                "Borrar"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const StatBox = ({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) => (
  <div className="rounded-lg border border-border/60 bg-card px-3 py-2">
    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
      {label}
    </div>
    <div className={cn("text-lg font-semibold tabular-nums", accent ?? "")}>
      {value}
    </div>
  </div>
);

interface SpamAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: ScouterSpamAccount | null;
  profiles: Array<{ id: string; full_name: string | null }>;
  onSubmit: (data: {
    instagram_handle: string;
    instagram_url: string | null;
    display_name: string | null;
    scouter_id: string | null;
    status: SpamAccountStatus;
    notes: string | null;
  }) => Promise<void>;
  loading: boolean;
}

const SCOUTER_NONE = "__none__";

const SpamAccountDialog = ({
  open,
  onOpenChange,
  editing,
  profiles,
  onSubmit,
  loading,
}: SpamAccountDialogProps) => {
  const [handle, setHandle] = useState("");
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [scouterId, setScouterId] = useState<string>(SCOUTER_NONE);
  const [status, setStatus] = useState<SpamAccountStatus>("active");
  const [notes, setNotes] = useState("");

  // Sync state cuando cambia editing.
  useMemo(() => {
    if (open) {
      if (editing) {
        setHandle(editing.instagram_handle);
        setUrl(editing.instagram_url ?? "");
        setName(editing.display_name ?? "");
        setScouterId(editing.scouter_id ?? SCOUTER_NONE);
        setStatus(editing.status);
        setNotes(editing.notes ?? "");
      } else {
        setHandle("");
        setUrl("");
        setName("");
        setScouterId(SCOUTER_NONE);
        setStatus("active");
        setNotes("");
      }
    }
  }, [open, editing]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void onSubmit({
      instagram_handle: handle,
      instagram_url: url || null,
      display_name: name || null,
      scouter_id: scouterId === SCOUTER_NONE ? null : scouterId,
      status,
      notes: notes || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editing ? "Editar cuenta de spam" : "Nueva cuenta de spam"}
          </DialogTitle>
          <DialogDescription>
            Cuenta de IG que un scouter usa personalmente para outreach. El
            handle se normaliza automáticamente (lowercase, sin @).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="handle">Instagram *</Label>
            <Input
              id="handle"
              placeholder="@user o instagram.com/user"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="url">URL completa (opcional)</Label>
            <Input
              id="url"
              placeholder="https://instagram.com/user"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">Nombre visible (opcional)</Label>
            <Input
              id="name"
              placeholder="María L. (cuenta personal)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Scouter dueño</Label>
              <Select value={scouterId} onValueChange={setScouterId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin asignar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SCOUTER_NONE}>Sin asignar</SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name ?? "(sin nombre)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as SpamAccountStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SPAM_ACCOUNT_STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Textarea
              id="notes"
              rows={2}
              placeholder="Ej: 6 meses de antigüedad, 1.2k seguidores reales..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || !handle.trim()}>
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : editing ? (
                "Guardar"
              ) : (
                "Agregar"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ScouterCuentas;
