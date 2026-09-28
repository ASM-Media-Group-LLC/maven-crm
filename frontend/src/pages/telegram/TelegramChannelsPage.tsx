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
import { PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";

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
  const { t } = useLanguage();
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
        if (opts?.manual) toast({ title: t("tg.ch.syncError"), description: res?.error || error?.message || t("common.error"), variant: "destructive" });
        return;
      }
      qc.invalidateQueries({ queryKey: ["tg-channels"] });
      qc.invalidateQueries({ queryKey: ["my-tg-channels"] });
      if (opts?.manual) toast({ title: t("tg.ch.synced", { n: res.accounts ?? 0 }) });
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
      toast({ title: t("tg.ch.updated") });
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["tg-channels"] });
    },
    onError: (e: Error) => toast({ title: t("common.couldNotSave"), description: e.message, variant: "destructive" }),
  });

  const filteredUsers = users.filter(
    (u) => !assigneeSearch.trim() || (u.full_name ?? "").toLowerCase().includes(assigneeSearch.trim().toLowerCase()),
  );

  return (
    <div className="space-y-5 px-6 py-5">
      {/* Header */}
      <PageHeader
        icon={<TelegramIcon />}
        title={t("nav.cat.tgAccounts")}
        subtitle={t("tg.ch.subtitle")}
        actions={
          canAccess("Telegram", "Bandeja") && (
            <Button asChild variant="ghost" size="sm" className="gap-1.5 text-xs">
              <Link to="/telegram/bandeja"><Inbox className="h-4 w-4" /> {t("tg.ch.inbox")}</Link>
            </Button>
          )
        }
      />

      {/* Líneas (tg_channels) + auto-asignación — espejo del editor de canales de WhatsApp. */}
      <div className="rounded-lg border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-telegram" />
          <h2 className="text-sm font-semibold">{t("tg.ch.linesTitle")}</h2>
          {canEdit && (
            <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1.5 text-xs" disabled={syncing} onClick={() => syncChannels({ manual: true })} title={t("tg.ch.syncHelp")}>
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} /> {t("tg.ch.sync")}
            </Button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {t("tg.ch.linesHelp")}
        </p>
        {isLoading ? (
          <div className="flex justify-center py-6 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : channels.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {t("tg.ch.noLines")}
          </p>
        ) : (
          <div className="divide-y rounded-md border">
            {channels.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-telegram/10 text-telegram">
                  <TelegramIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{c.label || c.account_id}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {c.account_id}
                    {" · "}
                    {(c.default_assignees ?? []).length > 0
                      ? t("tg.ch.autoAssignsTo", { names: (c.default_assignees ?? []).map(userName).join(", ") })
                      : t("tg.ch.noAutoAssign")}
                  </div>
                </div>
                {canEdit && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => openEdit(c)} title={t("tg.ch.editLine")} aria-label={t("tg.ch.editLine")}>
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
          <Radio className="h-4 w-4 text-telegram" />
          <h2 className="text-sm font-semibold">{t("tg.ch.linkTitle")}</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("tg.ch.linkP1")}<b>{t("tg.ch.linkPanel")}</b>{t("tg.ch.linkP2")}<b>{t("tg.ch.linkPhoneCode")}</b>{t("tg.ch.linkP3")}
        </p>
        <Button asChild size="sm">
          <a href={TG_GATEWAY_MANAGER} target="_blank" rel="noreferrer">
            {t("tg.ch.openPanel")} <ExternalLink className="h-4 w-4 ml-1" />
          </a>
        </Button>
        <p className="text-[11px] text-muted-foreground">
          {t("tg.ch.warning")}
        </p>
      </div>

      {/* Editor de línea (label + auto-asignación) — espejo del diálogo de ChannelsPage (WA). */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("tg.ch.editLineTitle", { id: editing?.account_id ?? "" })}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("tg.ch.label")}</Label>
              <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} placeholder={t("tg.ch.labelPlaceholder")} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("tg.ch.autoAssignLabel")}</Label>
              <p className="text-[11px] text-muted-foreground">
                {t("tg.ch.autoAssignHelp")}
              </p>
              <Input value={assigneeSearch} onChange={(e) => setAssigneeSearch(e.target.value)} placeholder={t("common.searchPerson")} className="h-8 text-sm" />
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
                  {t("tg.ch.autoAssignActive", { n: editAssignees.length })}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditing(null)}>{t("common.cancel")}</Button>
            <Button size="sm" onClick={() => updateChannel.mutate()} disabled={updateChannel.isPending}>
              {updateChannel.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("common.save")}

            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TelegramChannelsPage;
