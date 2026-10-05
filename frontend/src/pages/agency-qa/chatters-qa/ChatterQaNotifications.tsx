import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bell, ChevronsUpDown, Check, Loader2, Mail, Plus, Save, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ListRow } from "@/components/ui/list-row";
import { useMavenUsers } from "@/hooks/useChatterEvaluator";
import { useChatterQaConfig, useUpdateChatterQaConfig } from "./useChatterQaReports";
import { useLanguage } from "@/hooks/useLanguage";
import { ConFormato } from "@/pages/admin/ConFormato";

// Config de avisos del QA de Chatters. Los toggles son para el disparo AUTOMÁTICO (futuro);
// los botones "Enviar email" (detalle) y "Reenviar QA" (lista) mandan siempre, sin gatear.
// Destinatarios: emails externos (Resend) + empleados Maven (also_include_user_ids).
export default function ChatterQaNotifications() {
  const { t } = useLanguage();
  const cfgQ = useChatterQaConfig();
  const usersQ = useMavenUsers();
  const update = useUpdateChatterQaConfig();

  const [emails, setEmails] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [notifyUserIds, setNotifyUserIds] = useState<string[]>([]);
  const [onAnalyzed, setOnAnalyzed] = useState(true);
  const [onLowScore, setOnLowScore] = useState(true);
  const [onFailed, setOnFailed] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerFilter, setPickerFilter] = useState("");

  useEffect(() => {
    if (!cfgQ.data) return;
    setEmails(cfgQ.data.notification_emails ?? []);
    setNotifyUserIds(cfgQ.data.notify_user_ids ?? []);
    setOnAnalyzed(cfgQ.data.notify_on_analyzed);
    setOnLowScore(cfgQ.data.notify_on_low_score);
    setOnFailed(cfgQ.data.notify_on_failed);
  }, [cfgQ.data]);
  useEffect(() => { if (!pickerOpen) setPickerFilter(""); }, [pickerOpen]);

  const addEmail = () => {
    const e = newEmail.trim().toLowerCase();
    if (!e || emails.includes(e)) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { toast.error(t("common.invalidEmail")); return; }
    setEmails([...emails, e]); setNewEmail("");
  };
  const toggleUser = (id: string) => setNotifyUserIds((c) => c.includes(id) ? c.filter((x) => x !== id) : [...c, id]);

  const save = async () => {
    try {
      await update.mutateAsync({ notification_emails: emails, notify_user_ids: notifyUserIds, notify_on_analyzed: onAnalyzed, notify_on_low_score: onLowScore, notify_on_failed: onFailed });
      toast.success(t("agencyQa.notif.saved"));
    } catch (err) { toast.error(t("common.couldNotSave"), { description: (err as Error).message }); }
  };

  const filtered = (usersQ.data ?? []).filter((u) => !pickerFilter.trim() || (u.full_name ?? "").toLowerCase().includes(pickerFilter.toLowerCase()));

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        <ConFormato texto={t("agencyQa.notif.chatIntro")} />
      </p>

      <Card><CardContent className="space-y-4 p-6">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Bell className="h-4 w-4" /> {t("agencyQa.notif.triggers")}</h3>
        <div className="space-y-3">
          <ListRow className="items-start justify-between p-3">
            <div className="flex-1 space-y-0.5"><Label>{t("agencyQa.notif.draftReady")}</Label><p className="text-[11px] text-muted-foreground">{t("agencyQa.notif.draftReadyHint")}</p></div>
            <Switch checked={onAnalyzed} onCheckedChange={setOnAnalyzed} />
          </ListRow>
          <ListRow className="items-start justify-between p-3">
            <div className="flex-1 space-y-0.5"><Label>{t("agencyQa.notif.badVerdict")}</Label><p className="text-[11px] text-muted-foreground">{t("agencyQa.notif.badVerdictHint")}</p></div>
            <Switch checked={onLowScore} onCheckedChange={setOnLowScore} />
          </ListRow>
          <ListRow className="items-start justify-between p-3">
            <div className="flex-1 space-y-0.5"><Label>{t("agencyQa.notif.aiFailed")}</Label><p className="text-[11px] text-muted-foreground">{t("agencyQa.notif.aiFailedHint")}</p></div>
            <Switch checked={onFailed} onCheckedChange={setOnFailed} />
          </ListRow>
        </div>
      </CardContent></Card>

      <Card><CardContent className="space-y-4 p-6">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Mail className="h-4 w-4" /> {t("agencyQa.notif.externalEmails")}</h3>
        <div className="space-y-1.5">
          <Label>{t("agencyQa.notif.recipients")}</Label>
          <div className="flex gap-2">
            <Input value={newEmail} placeholder={t("agencyQa.notif.emailPlaceholder")} onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addEmail())} />
            <Button type="button" onClick={addEmail} variant="outline" size="sm" className="gap-1"><Plus className="h-4 w-4" /> {t("common.add")}</Button>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {emails.map((e) => (
              <div key={e} className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs">
                <span>{e}</span>
                <button type="button" onClick={() => setEmails(emails.filter((x) => x !== e))} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
              </div>
            ))}
            {emails.length === 0 && <p className="text-[11px] text-muted-foreground">{t("agencyQa.notif.noEmails")}</p>}
          </div>
        </div>
      </CardContent></Card>

      <Card><CardContent className="space-y-3 p-6">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Bell className="h-4 w-4" /> {t("agencyQa.notif.internal")}</h3>
        <p className="text-[11px] text-muted-foreground">{t("agencyQa.notif.chatInternalHint")}</p>
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <div className="relative">
              <Input value={pickerFilter} onFocus={() => setPickerOpen(true)}
                onChange={(e) => { setPickerFilter(e.target.value); if (!pickerOpen) setPickerOpen(true); }}
                placeholder={notifyUserIds.length === 0 ? t("agencyQa.notif.pickEmployees") : t("agencyQa.notif.selectedFilter", { n: notifyUserIds.length })}
                className="w-full pr-8" />
              <ChevronsUpDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
            <div className="max-h-72 overflow-y-auto p-1">
              {usersQ.isLoading && <div className="p-3 text-xs text-muted-foreground">{t("common.loading")}</div>}
              {!usersQ.isLoading && filtered.length === 0 && <div className="p-3 text-xs text-muted-foreground">{t("common.noResults")}</div>}
              {filtered.map((u) => {
                const checked = notifyUserIds.includes(u.id);
                return (
                  <button key={u.id} type="button" onClick={() => toggleUser(u.id)}
                    className={cn("flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted", checked && "bg-muted/60")}>
                    <span className="truncate">{u.full_name?.trim() || t("agencyQa.noName")}</span>
                    <Check className={cn("h-3.5 w-3.5 shrink-0", checked ? "opacity-100 text-primary" : "opacity-0")} />
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
        {notifyUserIds.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {notifyUserIds.map((id) => {
              const u = (usersQ.data ?? []).find((x) => x.id === id);
              return (
                <div key={id} className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                  <span>{u?.full_name?.trim() || id.slice(0, 8)}</span>
                  <button type="button" onClick={() => toggleUser(id)} className="hover:text-destructive"><X className="h-3 w-3" /></button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent></Card>

      <div className="flex justify-end">
        <Button type="button" onClick={save} disabled={update.isPending || cfgQ.isLoading} className="gap-1.5">
          {update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} {t("agencyQa.notif.save")}
        </Button>
      </div>
    </div>
  );
}
