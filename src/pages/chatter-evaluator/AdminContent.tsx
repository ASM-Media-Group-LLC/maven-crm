import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft,
  GripVertical,
  Plus,
  Trash2,
  X,
  Save,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  useChatterCriteria,
  useChatterConfig,
  useUpsertCriterion,
  useDeleteCriterion,
  useReorderCriteria,
  useUpdateChatterConfig,
  useMavenUsers,
} from "@/hooks/useChatterEvaluator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Bell, ChevronsUpDown, Check as CheckIcon } from "lucide-react";
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
import type { ChatterCriterion } from "./types";

// ---------- Criteria editor ----------
const CriteriaSection = () => {
  const criteriaQ = useChatterCriteria();
  const upsert = useUpsertCriterion();
  const del = useDeleteCriterion();
  const reorder = useReorderCriteria();

  const serverItems = useMemo(() => criteriaQ.data ?? [], [criteriaQ.data]);
  const [items, setItems] = useState<ChatterCriterion[]>(serverItems);
  const [confirmDelete, setConfirmDelete] = useState<ChatterCriterion | null>(null);
  useEffect(() => setItems(serverItems), [serverItems]);

  const handleAdd = async () => {
    const label = prompt("Etiqueta del criterio (ES):");
    if (!label) return;
    const label_en = prompt("Etiqueta en inglés (opcional):") || null;
    try {
      await upsert.mutateAsync({
        patch: {
          label,
          label_en,
          weight: 1,
          position: items.length + 1,
          is_active: true,
        },
      });
      toast.success("Criterio agregado");
    } catch (e) {
      toast.error("Error", { description: (e as Error).message });
    }
  };

  const handleEdit = async (c: ChatterCriterion, key: "label" | "label_en") => {
    const next = prompt(
      key === "label" ? "Etiqueta (ES):" : "Etiqueta (EN):",
      c[key] ?? "",
    );
    if (next === null) return;
    try {
      await upsert.mutateAsync({
        id: c.id,
        patch: {
          label: key === "label" ? next : c.label,
          label_en: key === "label_en" ? next : c.label_en,
        },
      });
      toast.success("Criterio actualizado");
    } catch (e) {
      toast.error("Error", { description: (e as Error).message });
    }
  };

  const handleToggle = async (c: ChatterCriterion, active: boolean) => {
    try {
      await upsert.mutateAsync({
        id: c.id,
        patch: { label: c.label, label_en: c.label_en, is_active: active },
      });
    } catch (e) {
      toast.error("Error", { description: (e as Error).message });
    }
  };

  const handleConfirmedDelete = async () => {
    if (!confirmDelete) return;
    try {
      await del.mutateAsync(confirmDelete.id);
      setConfirmDelete(null);
      toast.success("Criterio eliminado");
    } catch (e) {
      toast.error("Error", { description: (e as Error).message });
    }
  };

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const next = Array.from(items);
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    setItems(next);
    try {
      await reorder.mutateAsync(next.map((c) => c.id));
    } catch (e) {
      setItems(serverItems);
      toast.error("No se pudo reordenar", { description: (e as Error).message });
    }
  };

  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Criterios de evaluación</h2>
            <p className="text-xs text-muted-foreground">
              Lista por defecto que ven los examiners cuando crean una sesión.
            </p>
          </div>
          <Button onClick={handleAdd} size="sm" variant="outline" className="gap-1">
            <Plus className="h-4 w-4" /> Agregar
          </Button>
        </div>

        {criteriaQ.isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {!criteriaQ.isLoading && items.length === 0 && (
          <p className="text-sm text-muted-foreground">Sin criterios todavía.</p>
        )}

        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="criteria" type="criterion">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                {items.map((c, i) => (
                  <Draggable key={c.id} draggableId={c.id} index={i}>
                    {(prov) => (
                      <div
                        ref={prov.innerRef}
                        {...prov.draggableProps}
                        className={`flex items-center gap-2 rounded-md border bg-card p-2 ${
                          c.is_active ? "" : "opacity-50"
                        }`}
                      >
                        <div {...prov.dragHandleProps} className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing">
                          <GripVertical className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-2 gap-2">
                          <button
                            onClick={() => handleEdit(c, "label")}
                            className="truncate text-left text-sm hover:text-primary"
                            title="Click para editar (ES)"
                          >
                            {c.label}
                          </button>
                          <button
                            onClick={() => handleEdit(c, "label_en")}
                            className="truncate text-left text-xs text-muted-foreground hover:text-primary"
                            title="Click para editar (EN)"
                          >
                            {c.label_en || "(sin EN)"}
                          </button>
                        </div>
                        <Switch
                          checked={c.is_active}
                          onCheckedChange={(v) => handleToggle(c, v)}
                          aria-label="Activo"
                        />
                        <Button
                          onClick={() => setConfirmDelete(c)}
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </CardContent>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar criterio</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete
                ? `¿Eliminar "${confirmDelete.label}"? No se puede deshacer.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-500 hover:bg-rose-600"
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmedDelete();
              }}
              disabled={del.isPending}
            >
              {del.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

// ---------- Config editor ----------
const ConfigSection = () => {
  const cfgQ = useChatterConfig();
  const update = useUpdateChatterConfig();

  const [appsUrl, setAppsUrl] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [fanName, setFanName] = useState("");
  const [fanAvatar, setFanAvatar] = useState("");
  const [notifyUserIds, setNotifyUserIds] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const usersQ = useMavenUsers();

  useEffect(() => {
    if (!cfgQ.data) return;
    setAppsUrl(cfgQ.data.apps_script_url ?? "");
    setEmails(cfgQ.data.notification_emails ?? []);
    setFanName(cfgQ.data.fan_name);
    setFanAvatar(cfgQ.data.fan_avatar_url);
    setNotifyUserIds(cfgQ.data.notify_user_ids ?? []);
  }, [cfgQ.data]);

  const toggleNotifyUser = (id: string) =>
    setNotifyUserIds((curr) =>
      curr.includes(id) ? curr.filter((x) => x !== id) : [...curr, id],
    );

  const addEmail = () => {
    const e = newEmail.trim().toLowerCase();
    if (!e || emails.includes(e)) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      toast.error("Email inválido");
      return;
    }
    setEmails([...emails, e]);
    setNewEmail("");
  };

  const removeEmail = (e: string) =>
    setEmails(emails.filter((x) => x !== e));

  const handleSave = async () => {
    try {
      await update.mutateAsync({
        apps_script_url: appsUrl || null,
        notification_emails: emails,
        notify_user_ids: notifyUserIds,
        fan_name: fanName,
        fan_avatar_url: fanAvatar,
      });
      toast.success("Config guardada");
    } catch (e) {
      toast.error("Error", { description: (e as Error).message });
    }
  };

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <h2 className="text-lg font-semibold">Configuración global</h2>

        <div>
          <Label htmlFor="apps_url">Google Apps Script URL</Label>
          <Input
            id="apps_url"
            value={appsUrl}
            onChange={(e) => setAppsUrl(e.target.value)}
            placeholder="https://script.google.com/macros/s/..../exec"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Webhook donde se envían las evaluaciones (Drive doc + Sheet + emails).
          </p>
        </div>

        <div>
          <Label>Emails de notificación</Label>
          <div className="mt-2 flex gap-2">
            <Input
              value={newEmail}
              placeholder="usuario@dominio.com"
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addEmail())}
            />
            <Button onClick={addEmail} variant="outline" size="sm" className="gap-1">
              <Plus className="h-4 w-4" /> Agregar
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {emails.map((e) => (
              <div
                key={e}
                className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs"
              >
                <span>{e}</span>
                <button
                  onClick={() => removeEmail(e)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Eliminar ${e}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {emails.length === 0 && (
              <p className="text-xs text-muted-foreground">Sin emails configurados.</p>
            )}
          </div>
        </div>

        <div className="border-t pt-5">
          <Label className="flex items-center gap-1.5">
            <Bell className="h-3.5 w-3.5" /> Notificaciones internas Maven
          </Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Empleados que reciben una notificación dentro de Maven cuando se envía una evaluación.
          </p>
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                className="mt-2 w-full justify-between font-normal"
              >
                {notifyUserIds.length === 0
                  ? "Seleccionar empleados…"
                  : `${notifyUserIds.length} seleccionado(s)`}
                <ChevronsUpDown className="h-4 w-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
              <div className="max-h-72 overflow-y-auto p-1">
                {usersQ.isLoading && (
                  <div className="p-3 text-xs text-muted-foreground">Cargando…</div>
                )}
                {!usersQ.isLoading && (usersQ.data ?? []).length === 0 && (
                  <div className="p-3 text-xs text-muted-foreground">
                    No hay usuarios Maven todavía.
                  </div>
                )}
                {(usersQ.data ?? []).map((u) => {
                  const selected = notifyUserIds.includes(u.id);
                  const name = u.full_name || "Sin nombre";
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleNotifyUser(u.id)}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted ${
                        selected ? "bg-primary/10" : ""
                      }`}
                    >
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border">
                        {selected && <CheckIcon className="h-3 w-3" />}
                      </span>
                      <div className="aspect-square h-6 w-6 shrink-0 overflow-hidden rounded-full bg-muted">
                        {u.avatar_url && (
                          <img src={u.avatar_url} alt={name} className="h-full w-full object-cover" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{name}</div>
                        {u.role && (
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            {u.role}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
          {notifyUserIds.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {notifyUserIds.map((id) => {
                const u = (usersQ.data ?? []).find((x) => x.id === id);
                const name = u?.full_name || id.slice(0, 8);
                return (
                  <div
                    key={id}
                    className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs"
                  >
                    <span>{name}</span>
                    <button
                      onClick={() => toggleNotifyUser(id)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Quitar ${name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t pt-5">
          <h3 className="mb-3 text-sm font-semibold">JavixBuster (fan compartido)</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="fan_name">Nombre</Label>
              <Input
                id="fan_name"
                value={fanName}
                onChange={(e) => setFanName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="fan_avatar">Avatar URL</Label>
              <Input
                id="fan_avatar"
                value={fanAvatar}
                onChange={(e) => setFanAvatar(e.target.value)}
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Cliente ficticio mostrado a todos los chatters durante las sesiones.
          </p>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={update.isPending} className="gap-2">
            {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar config
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

const ChatterAdminContent = () => (
  <main className="flex-1 overflow-y-auto p-6">
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/chatter-evaluator">
            <ArrowLeft className="mr-2 h-4 w-4" /> Volver
          </Link>
        </Button>
      </div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Administración</h1>
        <p className="text-sm text-muted-foreground">
          Criterios de evaluación y configuración global. Estos cambios afectan a todos los examiners.
        </p>
      </div>
      <CriteriaSection />
      <ConfigSection />
    </div>
  </main>
);

export default ChatterAdminContent;
