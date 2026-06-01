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
import { Radio, Users, Plus, Loader2 } from "lucide-react";
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

const ChannelsPage = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [membersFor, setMembersFor] = useState<ChannelRow | null>(null);

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

  const userName = (id: string) => users.find((u) => u.id === id)?.full_name || id.slice(0, 8);

  return (
    <div className="space-y-4 px-6 py-5">
      <div className="flex items-center gap-2">
        <Radio className="h-5 w-5 text-primary" />
        <div className="flex-1">
          <h1 className="text-base font-semibold leading-tight">Canales del inbox</h1>
          <p className="text-xs text-muted-foreground">
            Cada número de WhatsApp es un canal. Mapeá quién lo atiende — un depto puede tener varios; admin ve todo.
          </p>
        </div>
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
                <th className="px-3 py-2 text-right font-medium">Atienden</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((c) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">{c.label || "(sin etiqueta)"}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{c.evolution_instance}</td>
                  <td className="px-3 py-2"><Badge variant="secondary-soft" className="text-[10px]">{deptLabel(c.department)}</Badge></td>
                  <td className="px-3 py-2 text-xs">{c.type === "dedicated" ? "Dedicado" : "Compartido"}</td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setMembersFor(c)}>
                      <Users className="h-3.5 w-3.5" /> {c.member_ids.length}
                    </Button>
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
              Registrá un número/línea. El nombre de la instancia es el de Evolution (donde está conectado el WhatsApp).
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
