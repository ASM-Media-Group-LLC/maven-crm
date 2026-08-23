// Telegram — Cuentas: vincular cuentas en el gateway + CONFIG POR LÍNEA (tg_channels):
// etiqueta + auto-asignación de conversaciones nuevas (espejo del editor de canales de
// WhatsApp/ChannelsPage). Las líneas aparecen solas acá (el ingest las upsertea lazy al
// primer mensaje); la vinculación en sí (teléfono + código) vive en el /manager del gateway.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import TelegramIcon from "@/components/icons/TelegramIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { ExternalLink, Radio, Inbox, Pencil, Users, Loader2, RefreshCw } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";

// Panel del gateway de Telegram (Dokploy) — ahí se vincula la cuenta (teléfono + código).
// El gateway de Telegram se sirve por HTTP (nip.io sin TLS) — verificado en vivo.
const TG_GATEWAY_MANAGER = "http://telegram-gw.147.93.3.97.nip.io/manager";

interface TgChannelRow {
  id: string;
  account_id: string;
  label: string | null;
  default_assignees: string[];
}

const TelegramChannelsPage = () => {
  const { canAccess } = usePermissions();
  const { toast } = useToast();
  const qc = useQueryClient();
  const canEdit = canAccess("Telegram", "Cuentas");

  const [editing, setEditing] = useState<TgChannelRow | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editAssignees, setEditAssignees] = useState<string[]>([]);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [syncing, setSyncing] = useState(false);

  // Sincroniza tg_channels con las cuentas vinculadas del gateway (edge tg-sync-channels):
  // así aparecen TODAS las líneas aunque no hayan recibido un DM todavía. Corre 1 vez al
  // abrir (silencioso) + botón manual. Preserva default_assignees y labels editados a mano.
  const syncChannels = async (opts?: { manual?: boolean }) => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("tg-sync-channels", {});
      const res = data as { ok?: boolean; synced?: number; accounts?: number; error?: string } | null;
      if (error || !res?.ok) {
        if (opts?.manual) toast({ title: "No se pudo sincronizar", description: res?.error || error?.message || "Error", variant: "destructive" });
        return;
      }
      qc.invalidateQueries({ queryKey: ["tg-channels"] });
      qc.invalidateQueries({ queryKey: ["my-tg-channels"] });
      if (opts?.manual) toast({ title: `Sincronizado: ${res.accounts} línea(s)` });
    } finally {
      setSyncing(false);
    }
  };
  const didAutoSync = useRef(false);
  useEffect(() => {
    if (canEdit && !didAutoSync.current) { didAutoSync.current = true; void syncChannels(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit]);

  // Líneas configuradas (el ingest las crea lazy al primer mensaje de cada cuenta).
  const { data: channels = [], isLoading } = useQuery({
    queryKey: ["tg-channels"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tg_channels")
        .select("id, account_id, label, default_assignees")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TgChannelRow[];
    },
  });

  const { data: users = [] } = useQuery({
    queryKey: ["tg-channels-users"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name").order("full_name", { ascending: true });
      return (data ?? []) as { id: string; full_name: string | null }[];
    },
  });
  const userName = (id: string) => users.find((u) => u.id === id)?.full_name ?? id.slice(0, 8);

  const openEdit = (c: TgChannelRow) => {
    setEditLabel(c.label ?? "");
    setEditAssignees(c.default_assignees ?? []);
    setAssigneeSearch("");
    setEditing(c);
  };

  const updateChannel = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const { error } = await (supabase as any).from("tg_channels").update({
        label: editLabel.trim() || null,
        default_assignees: editAssignees,
        updated_at: new Date().toISOString(),
      }).eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Línea actualizada" });
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["tg-channels"] });
    },
    onError: (e: Error) => toast({ title: "No se pudo guardar", description: e.message, variant: "destructive" }),
  });

  const filteredUsers = users.filter(
    (u) => !assigneeSearch.trim() || (u.full_name ?? "").toLowerCase().includes(assigneeSearch.trim().toLowerCase()),
  );

  return (
    <div className="space-y-5 px-6 py-5 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-2">
        <TelegramIcon className="h-6 w-6 text-sky-500" />
        <div className="flex-1">
          <h1 className="text-base font-semibold leading-tight">Telegram · Cuentas</h1>
          <p className="text-xs text-muted-foreground">
            Líneas del canal Telegram — vinculación y auto-asignación. <span className="text-sky-500 font-medium">Beta</span>
          </p>
        </div>
        {canAccess("Telegram", "Bandeja") && (
          <Button asChild variant="ghost" size="sm" className="gap-1.5 text-xs">
            <Link to="/telegram/bandeja"><Inbox className="h-4 w-4" /> Bandeja</Link>
          </Button>
        )}
      </div>

      {/* Líneas (tg_channels) + auto-asignación — espejo del editor de canales de WhatsApp. */}
      <div className="rounded-lg border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-sky-500" />
          <h2 className="text-sm font-semibold">Líneas y auto-asignación</h2>
          {canEdit && (
            <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1.5 text-xs" disabled={syncing} onClick={() => syncChannels({ manual: true })} title="Traer las cuentas vinculadas del gateway">
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} /> Sincronizar
            </Button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Cada conversación NUEVA de una línea se asigna automáticamente a quien marques (puedes elegir
          varias personas) — igual que en WhatsApp. Las líneas aparecen acá solas al recibir su primer mensaje.
        </p>
        {isLoading ? (
          <div className="flex justify-center py-6 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : channels.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Todavía no hay líneas registradas — aparecen al recibir el primer mensaje.
          </p>
        ) : (
          <div className="divide-y rounded-md border">
            {channels.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-500/10 text-sky-600">
                  <TelegramIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{c.label || c.account_id}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {c.account_id}
                    {" · "}
                    {(c.default_assignees ?? []).length > 0
                      ? `auto-asigna a ${(c.default_assignees ?? []).map(userName).join(", ")}`
                      : "sin auto-asignación"}
                  </div>
                </div>
                {canEdit && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => openEdit(c)} title="Editar línea">
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Conectar cuenta (gateway) */}
      <div className="rounded-lg border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-sky-500" />
          <h2 className="text-sm font-semibold">Vincular una cuenta de Telegram</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Las cuentas se vinculan en el <b>panel del gateway</b> (por <b>teléfono + código</b> que llega a la app
          de Telegram). Son cuentas de usuario (MTProto) multi-línea: pueden conversar y unirse a canales.
        </p>
        <Button asChild size="sm">
          <a href={TG_GATEWAY_MANAGER} target="_blank" rel="noreferrer">
            Abrir panel del gateway <ExternalLink className="h-4 w-4 ml-1" />
          </a>
        </Button>
        <p className="text-[11px] text-muted-foreground">
          Ojo: como en WhatsApp, una cuenta se puede restringir si se usa para contacto en frío masivo.
          Pensado para conversaciones tibias / entrantes.
        </p>
      </div>

      {/* Editor de línea (label + auto-asignación) — espejo del diálogo de ChannelsPage (WA). */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar línea {editing?.account_id}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Etiqueta</Label>
              <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} placeholder="Ej: Kash Miami" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label>Auto-asignar conversaciones nuevas a</Label>
              <p className="text-[11px] text-muted-foreground">
                Cada conversación NUEVA de esta línea se asigna automáticamente a quien marques
                (puedes elegir varias personas). Las existentes no se tocan.
              </p>
              <Input value={assigneeSearch} onChange={(e) => setAssigneeSearch(e.target.value)} placeholder="Buscar persona…" className="h-8 text-sm" />
              <div className="max-h-44 space-y-1 overflow-auto rounded-md border p-2">
                {filteredUsers.map((u) => {
                  const on = editAssignees.includes(u.id);
                  return (
                    <label key={u.id} className="flex cursor-pointer items-center gap-2">
                      <Checkbox
                        checked={on}
                        onCheckedChange={(v) =>
                          setEditAssignees((curr) =>
                            v === true ? [...curr, u.id] : curr.filter((x) => x !== u.id),
                          )
                        }
                      />
                      <span className="text-sm">{u.full_name ?? u.id.slice(0, 8)}</span>
                    </label>
                  );
                })}
              </div>
              {editAssignees.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  {editAssignees.length} persona(s) — auto-asignación activa en esta línea
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button size="sm" onClick={() => updateChannel.mutate()} disabled={updateChannel.isPending}>
              {updateChannel.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TelegramChannelsPage;
