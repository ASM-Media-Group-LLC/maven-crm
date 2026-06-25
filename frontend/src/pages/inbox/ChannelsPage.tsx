// Canales del inbox (Slice 5b) — admin: dar de alta los números (canales) y
// mapear quién los atiende. Un departamento puede tener muchos canales; un
// canal puede ser dedicado (1 persona) o compartido (varios miembros).
//
// La conexión real del número a WhatsApp (escanear QR en Evolution) es un paso
// operativo aparte; acá se REGISTRA el canal con el nombre de su instancia de
// Evolution + se mapean los miembros. La visibilidad del inbox deriva de eso.
//
// Admin-only (ruta AdminRoute). (supabase as any): tablas wa_* aún no están en
// los tipos generados.

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Radio, Users, Plus, Loader2, Bot, ArrowLeft, Pencil, Trash2 } from "lucide-react";
import type { WaChannel, WaChannelDepartment, WaChannelType } from "./types";

const DEPTS: { value: WaChannelDepartment; label: string }[] = [
  { value: "closer", label: "Closers" },
  { value: "manager", label: "Managers" },
  { value: "recruitment", label: "Reclutamiento" },
  { value: "chatter", label: "Chatters" },
  { value: "other", label: "Otro" },
];
const deptLabel = (d: string) => DEPTS.find((x) => x.value === d)?.label ?? d;

interface ChannelRow extends WaChannel {
  member_ids: string[];
}
interface Profile {
  id: string;
  full_name: string | null;
}

const EMPTY_FORM = {
  label: "",
  evolution_instance: "",
  phone_e164: "",
  department: "closer" as WaChannelDepartment,
  type: "shared" as WaChannelType,
};

// Salud de envío por línea (RPC wa_line_health): color del puntito según % de fallo 24h.
const HEALTH_UI: Record<string, { dot: string; text: string; label: string }> = {
  critico: { dot: "bg-rose-500", text: "font-semibold text-rose-500", label: "Crítico" },
  alerta: { dot: "bg-amber-500", text: "text-amber-600", label: "Alerta" },
  ok: { dot: "bg-emerald-500", text: "text-muted-foreground", label: "OK" },
  sin_datos: { dot: "bg-muted-foreground/40", text: "text-muted-foreground", label: "Sin datos" },
};
interface LineHealth { channel_id: string; total: number; ok: number; sent_pend: number; failed: number; pct_fallo: number | null; health: string; }

const ChannelsPage = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [membersFor, setMembersFor] = useState<ChannelRow | null>(null);
  // Editar / eliminar un canal (admin). editForm suma `active` (activar/desactivar).
  const [editing, setEditing] = useState<ChannelRow | null>(null);
  const [editForm, setEditForm] = useState({ ...EMPTY_FORM, active: true, default_assignees: [] as string[] });
  const [deleting, setDeleting] = useState<ChannelRow | null>(null);
  // Buscador del listado de auto-asignar (la lista de usuarios puede ser larga → scrollear era molesto).
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const openEdit = (c: ChannelRow) => {
    setEditForm({
      label: c.label ?? "",
      evolution_instance: c.evolution_instance,
      phone_e164: c.phone_e164 ?? "",
      department: c.department,
      type: c.type,
      active: c.active,
      default_assignees: c.default_assignees ?? [],
    });
    setAssigneeSearch("");
    setEditing(c);
  };

  const { data: channels = [], isLoading } = useQuery({
    queryKey: ["wa-channels"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("wa_channels")
        .select("*, members:wa_channel_members(user_id)")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as any[]).map((c) => ({
        ...c,
        member_ids: (c.members ?? []).map((m: { user_id: string }) => m.user_id),
      })) as ChannelRow[];
    },
  });

  // Salud de envío por línea (últimas 24h) — detecta líneas que empiezan a rebotar
  // (ej. time-lock de WhatsApp por outreach en frío). Refresca cada minuto.
  const { data: healthRows = [] } = useQuery({
    queryKey: ["wa-line-health"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("wa_line_health", { p_hours: 24 });
      if (error) throw error;
      return (data ?? []) as LineHealth[];
    },
    refetchInterval: 60000,
  });

  const { data: users = [] } = useQuery({
    queryKey: ["wa-channel-users"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .order("full_name", { ascending: true });
      return (data ?? []) as Profile[];
    },
  });

  const createChannel = useMutation({
    mutationFn: async () => {
      const instance = form.evolution_instance.trim();
      if (!instance) throw new Error("Falta el nombre de la instancia de Evolution.");
      const { error } = await (supabase as any).from("wa_channels").insert({
        label: form.label.trim() || null,
        evolution_instance: instance,
        phone_e164: form.phone_e164.trim() || null,
        department: form.department,
        type: form.type,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Canal creado" });
      setNewOpen(false);
      setForm(EMPTY_FORM);
      qc.invalidateQueries({ queryKey: ["wa-channels"] });
    },
    onError: (e: Error) => toast({ title: "No se pudo crear", description: e.message, variant: "destructive" }),
  });

  const updateChannel = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const instance = editForm.evolution_instance.trim();
      if (!instance) throw new Error("Falta el nombre de la instancia de Evolution.");
      const { error } = await (supabase as any).from("wa_channels").update({
        label: editForm.label.trim() || null,
        evolution_instance: instance,
        phone_e164: editForm.phone_e164.trim() || null,
        department: editForm.department,
        type: editForm.type,
        active: editForm.active,
        default_assignees: editForm.default_assignees,
      }).eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Canal actualizado" });
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["wa-channels"] });
    },
    onError: (e: Error) => toast({ title: "No se pudo actualizar", description: e.message, variant: "destructive" }),
  });

  // Eliminar = hard delete. Los miembros caen por ON DELETE CASCADE; las conversaciones
  // de este canal quedan con channel_id = NULL (no se borran) y salen de la bandeja.
  const deleteChannel = useMutation({
    mutationFn: async () => {
      if (!deleting) return;
      const { error } = await (supabase as any).from("wa_channels").delete().eq("id", deleting.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Canal eliminado" });
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ["wa-channels"] });
    },
    onError: (e: Error) => toast({ title: "No se pudo eliminar", description: e.message, variant: "destructive" }),
  });

  const userName = (id: string) => users.find((u) => u.id === id)?.full_name || id.slice(0, 8);

  return (
    <div className="space-y-4 px-6 py-5">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" className="h-7 w-7 -ml-1" title="Volver a la bandeja">
          <Link to="/inbox"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <Radio className="h-5 w-5 text-primary" />
        <div className="flex-1">
          <h1 className="text-base font-semibold leading-tight">Canales del inbox</h1>
          <p className="text-xs text-muted-foreground">
            Quién atiende cada número en la bandeja. Para <b>conectar/agregar un número</b> (QR), usá el{" "}
            <a href="https://evolution.147-93-3-97.nip.io/manager" target="_blank" rel="noreferrer" className="underline hover:text-foreground">panel del gateway</a>.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/inbox/bots"><Bot className="h-4 w-4" /> Bots</Link>
        </Button>
        <Button size="sm" onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4" /> Nuevo canal
        </Button>
      </div>

      <div className="rounded-md border">
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando…
          </div>
        ) : channels.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Todavía no hay canales. Creá uno con el nombre de su instancia de Evolution.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Canal</th>
                <th className="px-3 py-2 font-medium">Instancia</th>
                <th className="px-3 py-2 font-medium">Depto</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">Salud 24h</th>
                <th className="px-3 py-2 text-right font-medium">Atienden</th>
                <th className="px-3 py-2 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((c) => (
                <tr key={c.id} className={`border-b last:border-0 ${c.active ? "" : "opacity-50"}`}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{c.label || "(sin etiqueta)"}</span>
                      {!c.active && <Badge variant="secondary-soft" className="text-[10px]">Inactivo</Badge>}
                    </div>
                    {c.phone_e164 && <div className="text-xs text-muted-foreground">{c.phone_e164}</div>}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{c.evolution_instance}</td>
                  <td className="px-3 py-2"><Badge variant="secondary-soft" className="text-[10px]">{deptLabel(c.department)}</Badge></td>
                  <td className="px-3 py-2 text-xs">{c.type === "dedicated" ? "Dedicado" : "Compartido"}</td>
                  <td className="px-3 py-2">
                    {(() => {
                      const h = healthRows.find((r) => r.channel_id === c.id);
                      const ui = HEALTH_UI[h?.health ?? "sin_datos"] ?? HEALTH_UI.sin_datos;
                      return (
                        <span
                          className="inline-flex items-center gap-1.5 text-xs"
                          title={h ? `Últimas 24h · ${h.total} enviados · ${h.ok} entregados · ${h.sent_pend} sin confirmar · ${h.failed} fallidos` : "Sin datos en 24h"}
                        >
                          <span className={`h-2 w-2 shrink-0 rounded-full ${ui.dot}`} />
                          {!h || h.health === "sin_datos"
                            ? <span className="text-muted-foreground">sin datos</span>
                            : <span className={ui.text}>{h.pct_fallo ?? 0}% fallo <span className="text-muted-foreground">({h.total})</span></span>}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setMembersFor(c)}>
                      <Users className="h-3.5 w-3.5" /> {c.member_ids.length}
                    </Button>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Editar canal" onClick={() => openEdit(c)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        className="h-7 w-7 text-rose-500 hover:bg-rose-500/10 hover:text-rose-600"
                        title="Eliminar canal" onClick={() => setDeleting(c)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Nuevo canal */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo canal</DialogTitle>
            <DialogDescription>
              Registrá quién atiende un canal. El "nombre de instancia" debe coincidir con una línea ya conectada en el panel del gateway.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Etiqueta</Label>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Ej. Closers-1 / Línea Julieth" />
            </div>
            <div className="space-y-1">
              <Label>Instancia de Evolution *</Label>
              <Input value={form.evolution_instance} onChange={(e) => setForm({ ...form, evolution_instance: e.target.value })} placeholder="ej. maven-closers-1" className="font-mono" />
            </div>
            <div className="space-y-1">
              <Label>Número (opcional)</Label>
              <Input value={form.phone_e164} onChange={(e) => setForm({ ...form, phone_e164: e.target.value })} placeholder="+57…" />
            </div>
            <div className="flex gap-3">
              <div className="flex-1 space-y-1">
                <Label>Departamento</Label>
                <Select value={form.department} onValueChange={(v) => setForm({ ...form, department: v as WaChannelDepartment })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DEPTS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 space-y-1">
                <Label>Tipo</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as WaChannelType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shared">Compartido</SelectItem>
                    <SelectItem value="dedicated">Dedicado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Cancelar</Button>
            <Button onClick={() => createChannel.mutate()} disabled={createChannel.isPending || !form.evolution_instance.trim()}>
              {createChannel.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar canal */}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar canal</DialogTitle>
            <DialogDescription>
              Cambiá la etiqueta, el número, el departamento o el tipo. Desactivalo para ocultarlo de los selectores sin borrarlo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Etiqueta</Label>
              <Input value={editForm.label} onChange={(e) => setEditForm({ ...editForm, label: e.target.value })} placeholder="Ej. Closers-1 / Línea Julieth" />
            </div>
            <div className="space-y-1">
              <Label>Instancia de Evolution *</Label>
              <Input value={editForm.evolution_instance} onChange={(e) => setEditForm({ ...editForm, evolution_instance: e.target.value })} className="font-mono" />
            </div>
            <div className="space-y-1">
              <Label>Número (opcional)</Label>
              <Input value={editForm.phone_e164} onChange={(e) => setEditForm({ ...editForm, phone_e164: e.target.value })} placeholder="+57…" />
            </div>
            <div className="flex gap-3">
              <div className="flex-1 space-y-1">
                <Label>Departamento</Label>
                <Select value={editForm.department} onValueChange={(v) => setEditForm({ ...editForm, department: v as WaChannelDepartment })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DEPTS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 space-y-1">
                <Label>Tipo</Label>
                <Select value={editForm.type} onValueChange={(v) => setEditForm({ ...editForm, type: v as WaChannelType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shared">Compartido</SelectItem>
                    <SelectItem value="dedicated">Dedicado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-2 pt-1">
              <Checkbox checked={editForm.active} onCheckedChange={(v) => setEditForm({ ...editForm, active: v === true })} />
              <span className="text-sm">Activo <span className="text-muted-foreground">(si lo desactivás, deja de aparecer en los selectores)</span></span>
            </label>
            {/* Auto-asignación por línea: las conversaciones NUEVAS de esta línea se asignan
                a quien marques (uno o varios). Las existentes no se tocan. */}
            <div className="space-y-1.5 pt-1">
              <Label>Auto-asignar conversaciones nuevas a</Label>
              <p className="text-[11px] text-muted-foreground">Cada conversación NUEVA de esta línea se asigna automáticamente a quien marques (podés elegir varias personas). Las existentes no se tocan.</p>
              <Input
                value={assigneeSearch}
                onChange={(e) => setAssigneeSearch(e.target.value)}
                placeholder="Buscar persona…"
                className="h-8 text-sm"
              />
              {(() => {
                const q = assigneeSearch.trim().toLowerCase();
                const filtered = q
                  ? users.filter((u) => (u.full_name ?? "").toLowerCase().includes(q))
                  : users;
                return (
                  <div className="max-h-40 overflow-y-auto rounded-md border border-border p-2 space-y-1">
                    {users.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Sin usuarios</p>
                    ) : filtered.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Nadie coincide con “{assigneeSearch}”.</p>
                    ) : filtered.map((u) => {
                      const on = editForm.default_assignees.includes(u.id);
                      return (
                        <label key={u.id} className="flex cursor-pointer items-center gap-2">
                          <Checkbox
                            checked={on}
                            onCheckedChange={(v) => setEditForm((f) => ({
                              ...f,
                              default_assignees: v === true
                                ? [...f.default_assignees, u.id]
                                : f.default_assignees.filter((x) => x !== u.id),
                            }))}
                          />
                          <span className="text-sm">{u.full_name ?? u.id.slice(0, 8)}</span>
                        </label>
                      );
                    })}
                  </div>
                );
              })()}
              {editForm.default_assignees.length > 0 && (
                <p className="text-[11px] text-muted-foreground">{editForm.default_assignees.length} persona(s) — auto-asignación activa en esta línea</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={() => updateChannel.mutate()} disabled={updateChannel.isPending || !editForm.evolution_instance.trim()}>
              {updateChannel.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Eliminar canal (confirmación) */}
      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este canal?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <b>{deleting?.label || deleting?.evolution_instance}</b>
              {deleting?.phone_e164 ? ` (${deleting.phone_e164})` : ""}. Las conversaciones de este canal
              no se borran, pero quedan sin canal y dejan de aparecer en la bandeja. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteChannel.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); deleteChannel.mutate(); }}
              className="bg-rose-500 text-white hover:bg-rose-600"
            >
              {deleteChannel.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Miembros del canal */}
      <MembersDialog
        channel={membersFor}
        users={users}
        userName={userName}
        onOpenChange={(o) => !o && setMembersFor(null)}
        onChanged={() => qc.invalidateQueries({ queryKey: ["wa-channels"] })}
      />
    </div>
  );
};

// Diálogo para agregar/quitar miembros de un canal (toggle = insert/delete fila).
const MembersDialog = ({
  channel, users, userName, onOpenChange, onChanged,
}: {
  channel: ChannelRow | null;
  users: Profile[];
  userName: (id: string) => string;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) => {
  const { toast } = useToast();
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setMemberIds(new Set(channel?.member_ids ?? []));
    setSearch("");
  }, [channel]);

  const toggle = async (userId: string) => {
    if (!channel || busy) return;
    const isMember = memberIds.has(userId);
    setBusy(userId);
    if (isMember) {
      const { error } = await (supabase as any)
        .from("wa_channel_members").delete()
        .eq("channel_id", channel.id).eq("user_id", userId);
      if (!error) {
        const next = new Set(memberIds); next.delete(userId); setMemberIds(next); onChanged();
      } else {
        toast({ title: "Error al quitar", description: error.message, variant: "destructive" });
      }
    } else {
      const { error } = await (supabase as any)
        .from("wa_channel_members").insert({ channel_id: channel.id, user_id: userId });
      if (!error) {
        const next = new Set(memberIds); next.add(userId); setMemberIds(next); onChanged();
      } else {
        toast({ title: "Error al agregar", description: error.message, variant: "destructive" });
      }
    }
    setBusy(null);
  };

  const q = search.trim().toLowerCase();
  const filtered = q ? users.filter((u) => (u.full_name ?? "").toLowerCase().includes(q)) : users;

  return (
    <Dialog open={channel !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Quién atiende este canal</DialogTitle>
          <DialogDescription>
            {channel ? `${channel.label || channel.evolution_instance} · ${memberIds.size} atendiendo` : ""}
          </DialogDescription>
        </DialogHeader>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar persona…" className="h-9" />
        <ScrollArea className="max-h-80 rounded-md border">
          <div className="divide-y">
            {filtered.map((u) => (
              <label key={u.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/40">
                <Checkbox checked={memberIds.has(u.id)} disabled={busy === u.id} onCheckedChange={() => toggle(u.id)} />
                <span className="flex-1 truncate text-sm">{u.full_name || userName(u.id)}</span>
                {busy === u.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </label>
            ))}
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ChannelsPage;
