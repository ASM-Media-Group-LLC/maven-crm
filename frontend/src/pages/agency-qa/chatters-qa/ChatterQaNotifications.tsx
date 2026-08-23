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

// Config de avisos del QA de Chatters. Los toggles son para el disparo AUTOMÁTICO (futuro);
// los botones "Enviar email" (detalle) y "Reenviar QA" (lista) mandan siempre, sin gatear.
// Destinatarios: emails externos (Resend) + empleados Maven (also_include_user_ids).
export default function ChatterQaNotifications() {
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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { toast.error("Email inválido"); return; }
    setEmails([...emails, e]); setNewEmail("");
  };
  const toggleUser = (id: string) => setNotifyUserIds((c) => c.includes(id) ? c.filter((x) => x !== id) : [...c, id]);

  const save = async () => {
    try {
      await update.mutateAsync({ notification_emails: emails, notify_user_ids: notifyUserIds, notify_on_analyzed: onAnalyzed, notify_on_low_score: onLowScore, notify_on_failed: onFailed });
      toast.success("Configuración guardada");
    } catch (err) { toast.error("No se pudo guardar", { description: (err as Error).message }); }
  };

  const filtered = (usersQ.data ?? []).filter((u) => !pickerFilter.trim() || (u.full_name ?? "").toLowerCase().includes(pickerFilter.toLowerCase()));

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-xs text-muted-foreground">
        A quién se le manda el QA. Los botones <b>Enviar email</b> (en el reporte) y <b>Reenviar QA</b> (en la lista) usan estos destinatarios. Los switches gobiernan el aviso automático cuando termine el borrador IA.
      </p>

      <Card><CardContent className="space-y-4 p-6">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Bell className="h-4 w-4" /> Disparos automáticos</h3>
        <div className="space-y-3">
          <ListRow className="items-start justify-between p-3">
            <div className="flex-1 space-y-0.5"><Label>Borrador IA listo</Label><p className="text-[11px] text-muted-foreground">Avisar cuando la IA termina el QA de un chatter.</p></div>
            <Switch checked={onAnalyzed} onCheckedChange={setOnAnalyzed} />
          </ListRow>
          <ListRow className="items-start justify-between p-3">
            <div className="flex-1 space-y-0.5"><Label>Veredicto crítico / requiere mejora</Label><p className="text-[11px] text-muted-foreground">Aviso extra al supervisor cuando el veredicto no es bueno.</p></div>
            <Switch checked={onLowScore} onCheckedChange={setOnLowScore} />
          </ListRow>
          <ListRow className="items-start justify-between p-3">
            <div className="flex-1 space-y-0.5"><Label>Análisis IA falló</Label><p className="text-[11px] text-muted-foreground">Aviso cuando el borrador IA no se pudo generar (reintentar).</p></div>
            <Switch checked={onFailed} onCheckedChange={setOnFailed} />
          </ListRow>
        </div>
      </CardContent></Card>

      <Card><CardContent className="space-y-4 p-6">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Mail className="h-4 w-4" /> Emails externos</h3>
        <div className="space-y-1.5">
          <Label>Destinatarios</Label>
          <div className="flex gap-2">
            <Input value={newEmail} placeholder="usuario@dominio.com" onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addEmail())} />
            <Button type="button" onClick={addEmail} variant="outline" size="sm" className="gap-1"><Plus className="h-4 w-4" /> Agregar</Button>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {emails.map((e) => (
              <div key={e} className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs">
                <span>{e}</span>
                <button type="button" onClick={() => setEmails(emails.filter((x) => x !== e))} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
              </div>
            ))}
            {emails.length === 0 && <p className="text-[11px] text-muted-foreground">Sin emails externos configurados.</p>}
          </div>
        </div>
      </CardContent></Card>

      <Card><CardContent className="space-y-3 p-6">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Bell className="h-4 w-4" /> Notificaciones internas Maven</h3>
        <p className="text-[11px] text-muted-foreground">Empleados que reciben copia del QA por email (y notificación in-app).</p>
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <div className="relative">
              <Input value={pickerFilter} onFocus={() => setPickerOpen(true)}
                onChange={(e) => { setPickerFilter(e.target.value); if (!pickerOpen) setPickerOpen(true); }}
                placeholder={notifyUserIds.length === 0 ? "Seleccionar empleados…" : `${notifyUserIds.length} seleccionado(s) — escribe para filtrar`}
                className="w-full pr-8" />
              <ChevronsUpDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
            <div className="max-h-72 overflow-y-auto p-1">
              {usersQ.isLoading && <div className="p-3 text-xs text-muted-foreground">Cargando…</div>}
              {!usersQ.isLoading && filtered.length === 0 && <div className="p-3 text-xs text-muted-foreground">Sin resultados.</div>}
              {filtered.map((u) => {
                const checked = notifyUserIds.includes(u.id);
                return (
                  <button key={u.id} type="button" onClick={() => toggleUser(u.id)}
                    className={cn("flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted", checked && "bg-muted/60")}>
                    <span className="truncate">{u.full_name?.trim() || "(sin nombre)"}</span>
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
          {update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Guardar configuración
        </Button>
      </div>
    </div>
  );
}
