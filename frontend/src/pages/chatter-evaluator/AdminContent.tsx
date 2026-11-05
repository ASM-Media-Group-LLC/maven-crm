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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  GripVertical,
  Plus,
  Trash2,
  X,
  Save,
  Loader2,
} from "lucide-react";
import ChatterEvaluatorHeader from "./ChatterEvaluatorHeader";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/useLanguage";
import {
  useChatterCriteria,
  useChatterConfig,
  useUpsertCriterion,
  useDeleteCriterion,
  useReorderCriteria,
  useUpdateChatterConfig,
  useMavenUsers,
  useChatterProfiles,
  useDeleteChatterProfile,
} from "@/hooks/useChatterEvaluator";
import { NewProfileDialog } from "./NewProfileDialog";
import ExaminadoresSection from "./ExaminadoresSection";
import type { ChatterProfile } from "./types";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Bell, ChevronsUpDown, Check as CheckIcon, UserPlus, Pencil } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
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

// ---------- Models / character profiles ----------
// Lists every chatter profile in chatter_profiles and lets the admin add
// new ones. Mirrors the original Roleplaychatters Admin → Modelos screen
// (index.html line 1283 onward) — same default fields, same key/avatar
// layout — but with Maven's color palette and using shadcn primitives.
const ProfilesSection = () => {
  const { t } = useLanguage();
  const profilesQ = useChatterProfiles();
  const del = useDeleteChatterProfile();
  const [newOpen, setNewOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ChatterProfile | null>(null);

  const profiles = profilesQ.data ?? [];

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t("chatters.admin.models")}</h2>
            <p className="text-xs text-muted-foreground">
              {t("chatters.admin.modelsDesc")}
            </p>
          </div>
          <Button onClick={() => setNewOpen(true)} className="gap-2">
            <UserPlus className="h-4 w-4" /> {t("chatters.newProfile.title")}
          </Button>
        </div>

        {profilesQ.isLoading && (
          <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
        )}

        {!profilesQ.isLoading && profiles.length === 0 && (
          <div className="rounded-md border border-dashed">
            <EmptyState
              className="py-8"
              icon={<UserPlus className="h-8 w-8 text-muted-foreground" />}
              title={t("chatters.admin.noModels")}
              action={
                <Button variant="outline" size="sm" onClick={() => setNewOpen(true)} className="gap-1">
                  <Plus className="h-3 w-3" /> {t("chatters.admin.createFirst")}
                </Button>
              }
            />
          </div>
        )}

        {profiles.length > 0 && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {profiles.map((p) => {
              const meta = [
                p.nationality,
                p.location,
                p.age,
              ].filter(Boolean).join(" · ");
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-3 rounded-lg border bg-card p-3"
                >
                  <div className="aspect-square h-12 w-12 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-purple-600 to-amber-500">
                    {p.avatar_url ? (
                      <img
                        src={p.avatar_url}
                        alt={p.name}
                        className="h-full w-full object-cover"
                        style={{
                          objectPosition: `${p.avatar_x ?? 50}% ${p.avatar_y ?? 50}%`,
                          transform: `scale(${(p.avatar_zoom ?? 100) / 100})`,
                        }}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-base font-bold text-white">
                        {p.name[0]}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{p.name}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {meta || <span className="font-mono opacity-60">{p.key}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button asChild size="icon" variant="ghost" className="h-8 w-8" title={t("common.edit")}>
                      <Link to={`/chatter-evaluator/${p.key}/edit`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      title={t("common.delete")}
                      onClick={() => setConfirmDelete(p)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <NewProfileDialog open={newOpen} onOpenChange={setNewOpen} />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("chatters.admin.deleteModel")}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete
                ? t("chatters.admin.deleteModelConfirm", { name: confirmDelete.name })
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending} />
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (!confirmDelete) return;
                del.mutate(confirmDelete.id, {
                  onSuccess: () => {
                    setConfirmDelete(null);
                    toast.success(t("chatters.admin.modelDeleted"));
                  },
                  onError: (err) =>
                    toast.error(t("common.couldNotDelete"), {
                      description: (err as Error).message,
                    }),
                });
              }}
              disabled={del.isPending}
            >
              {del.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

// ---------- Criteria editor ----------
const CriteriaSection = () => {
  const { t } = useLanguage();
  const criteriaQ = useChatterCriteria();
  const upsert = useUpsertCriterion();
  const del = useDeleteCriterion();
  const reorder = useReorderCriteria();

  const serverItems = useMemo(() => criteriaQ.data ?? [], [criteriaQ.data]);
  const [items, setItems] = useState<ChatterCriterion[]>(serverItems);
  const [confirmDelete, setConfirmDelete] = useState<ChatterCriterion | null>(null);
  // Editor dialog state. `editing` holds the criterion currently being
  // created (null id) or edited (existing id). The earlier prompt()
  // calls were the browser's native dialog — replaced by this Maven-
  // styled editor with both ES and EN inputs at once.
  const [editing, setEditing] = useState<{ id?: string; label: string; label_en: string } | null>(null);
  useEffect(() => setItems(serverItems), [serverItems]);

  const openCreate = () =>
    setEditing({ label: "", label_en: "" });
  const openEdit = (c: ChatterCriterion) =>
    setEditing({ id: c.id, label: c.label, label_en: c.label_en ?? "" });

  const handleSaveEdit = async () => {
    if (!editing) return;
    const label = editing.label.trim();
    if (!label) {
      toast.error(t("chatters.admin.spanishLabelRequired"));
      return;
    }
    const label_en = editing.label_en.trim() || null;
    try {
      if (editing.id) {
        // Edit: keep position/weight/is_active untouched (they're not in
        // this dialog), so we just patch the labels.
        await upsert.mutateAsync({
          id: editing.id,
          patch: { label, label_en },
        });
        toast.success(t("chatters.admin.criterionUpdated"));
      } else {
        await upsert.mutateAsync({
          patch: {
            label,
            label_en,
            weight: 1,
            position: items.length + 1,
            is_active: true,
          },
        });
        toast.success(t("chatters.admin.criterionAdded"));
      }
      setEditing(null);
    } catch (e) {
      toast.error(t("common.error"), { description: (e as Error).message });
    }
  };

  const handleToggle = async (c: ChatterCriterion, active: boolean) => {
    try {
      await upsert.mutateAsync({
        id: c.id,
        patch: { label: c.label, label_en: c.label_en, is_active: active },
      });
    } catch (e) {
      toast.error(t("common.error"), { description: (e as Error).message });
    }
  };

  const handleConfirmedDelete = async () => {
    if (!confirmDelete) return;
    try {
      await del.mutateAsync(confirmDelete.id);
      setConfirmDelete(null);
      toast.success(t("chatters.admin.criterionDeleted"));
    } catch (e) {
      toast.error(t("common.error"), { description: (e as Error).message });
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
      toast.error(t("chatters.vault.couldNotReorder"), { description: (e as Error).message });
    }
  };

  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t("chatters.admin.criteria")}</h2>
            <p className="text-xs text-muted-foreground">
              {t("chatters.admin.criteriaDesc")}
            </p>
          </div>
          <Button onClick={openCreate} size="sm" variant="outline" className="gap-1">
            <Plus className="h-4 w-4" /> {t("common.add")}
          </Button>
        </div>

        {criteriaQ.isLoading && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
        {!criteriaQ.isLoading && items.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("chatters.admin.noCriteria")}</p>
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
                        <button
                          onClick={() => openEdit(c)}
                          className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-2 gap-2 rounded text-left transition-colors hover:bg-muted/50 px-1 py-0.5"
                          title={t("chatters.admin.editCriterion")}
                        >
                          <span className="truncate text-sm">{c.label}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {c.label_en || t("chatters.admin.noEn")}
                          </span>
                        </button>
                        <Switch
                          checked={c.is_active}
                          onCheckedChange={(v) => handleToggle(c, v)}
                          aria-label={t("common.active")}
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
            <AlertDialogTitle>{t("chatters.admin.deleteCriterion")}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete
                ? t("chatters.admin.deleteCriterionConfirm", { name: confirmDelete.label })
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending} />
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmedDelete();
              }}
              disabled={del.isPending}
            >
              {del.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Maven-styled criterion editor — replaces the native prompt()
          chain that used to ask for ES then EN one at a time. */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing?.id ? t("chatters.admin.editCriterion") : t("chatters.admin.newCriterion")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="crit_es" className="text-xs">
                {t("chatters.admin.labelEs")} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="crit_es"
                autoFocus
                value={editing?.label ?? ""}
                onChange={(e) =>
                  setEditing((curr) => (curr ? { ...curr, label: e.target.value } : curr))
                }
                placeholder={t("chatters.admin.labelEsPh")}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="crit_en" className="text-xs">{t("chatters.admin.labelEn")}</Label>
              <Input
                id="crit_en"
                value={editing?.label_en ?? ""}
                onChange={(e) =>
                  setEditing((curr) => (curr ? { ...curr, label_en: e.target.value } : curr))
                }
                placeholder="Optional English label"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={upsert.isPending}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={!editing?.label.trim() || upsert.isPending}
              className="gap-2"
            >
              {upsert.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing?.id ? t("common.save") : t("common.add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

// ---------- Config editor ----------
const ConfigSection = () => {
  const { t } = useLanguage();
  const cfgQ = useChatterConfig();
  const update = useUpdateChatterConfig();

  const [emails, setEmails] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [fanName, setFanName] = useState("");
  const [fanAvatar, setFanAvatar] = useState("");
  const [notifyUserIds, setNotifyUserIds] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerFilter, setPickerFilter] = useState("");
  const usersQ = useMavenUsers();
  // Reset the filter every time the popover opens so reopening doesn't
  // remember a stale search term.
  useEffect(() => {
    if (!pickerOpen) setPickerFilter("");
  }, [pickerOpen]);

  useEffect(() => {
    if (!cfgQ.data) return;
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
      toast.error(t("common.invalidEmail"));
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
        notification_emails: emails,
        notify_user_ids: notifyUserIds,
        fan_name: fanName,
        fan_avatar_url: fanAvatar,
      });
      toast.success(t("chatters.admin.configSaved"));
    } catch (e) {
      toast.error(t("common.error"), { description: (e as Error).message });
    }
  };

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <h2 className="text-lg font-semibold">{t("chatters.admin.globalConfig")}</h2>

        <div>
          <Label>{t("chatters.admin.notificationEmails")}</Label>
          <div className="mt-2 flex gap-2">
            <Input
              value={newEmail}
              placeholder={t("chatters.admin.emailPh")}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addEmail())}
            />
            <Button onClick={addEmail} variant="outline" size="sm" className="gap-1">
              <Plus className="h-4 w-4" /> {t("common.add")}
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
                  aria-label={t("chatters.admin.deleteN", { name: e })}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {emails.length === 0 && (
              <p className="text-xs text-muted-foreground">{t("chatters.admin.noEmails")}</p>
            )}
          </div>
        </div>

        <div className="border-t pt-5">
          <Label className="flex items-center gap-1.5">
            <Bell className="h-3.5 w-3.5" /> {t("chatters.admin.inAppNotifications")}
          </Label>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("chatters.admin.inAppNotificationsDesc")}
          </p>
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              {/* Editable trigger — typing here filters the list directly
                  instead of opening a separate search box inside the
                  popover. The placeholder doubles as a "N seleccionado(s)"
                  counter when the input is empty and there are picks. */}
              <div className="relative mt-2">
                <Input
                  value={pickerFilter}
                  onFocus={() => setPickerOpen(true)}
                  onChange={(e) => {
                    setPickerFilter(e.target.value);
                    if (!pickerOpen) setPickerOpen(true);
                  }}
                  placeholder={
                    notifyUserIds.length === 0
                      ? t("chatters.admin.selectEmployees")
                      : t("chatters.admin.nSelectedTypeToFilter", { n: notifyUserIds.length })
                  }
                  className="w-full pr-8"
                />
                <ChevronsUpDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
              </div>
            </PopoverTrigger>
            <PopoverContent
              className="w-[var(--radix-popover-trigger-width)] p-0"
              align="start"
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <div className="max-h-72 overflow-y-auto p-1">
                {usersQ.isLoading && (
                  <div className="p-3 text-xs text-muted-foreground">{t("common.loading")}</div>
                )}
                {!usersQ.isLoading && (usersQ.data ?? []).length === 0 && (
                  <div className="p-3 text-xs text-muted-foreground">
                    {t("chatters.admin.noMavenUsers")}
                  </div>
                )}
                {(() => {
                  const q = pickerFilter.trim().toLowerCase();
                  const filtered = (usersQ.data ?? []).filter((u) => {
                    if (!q) return true;
                    const name = (u.full_name ?? "").toLowerCase();
                    const role = (u.role ?? "").toLowerCase();
                    return name.includes(q) || role.includes(q);
                  });
                  if (!usersQ.isLoading && q && filtered.length === 0) {
                    return (
                      <div className="p-3 text-xs text-muted-foreground">
                        {t("chatters.admin.noResultsFor", { q: pickerFilter })}
                      </div>
                    );
                  }
                  return filtered.map((u) => {
                    const selected = notifyUserIds.includes(u.id);
                    const name = u.full_name || t("chatters.newSess.noName");
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
                            <div className="text-xs capitalize text-muted-foreground">
                              {u.role}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  });
                })()}
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
                      aria-label={t("chatters.newProfile.removeN", { name: name })}
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
          <h3 className="mb-3 text-sm font-semibold">{t("chatters.admin.sharedFan")}</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="fan_name">{t("common.name")}</Label>
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
            {t("chatters.admin.sharedFanDesc")}
          </p>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={update.isPending} className="gap-2">
            {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t("chatters.admin.saveConfig")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

const ChatterAdminContent = () => (
  <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
    <ChatterEvaluatorHeader />
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <ProfilesSection />
      <ExaminadoresSection />
      <CriteriaSection />
      <ConfigSection />
    </div>
  </main>
);

export default ChatterAdminContent;
