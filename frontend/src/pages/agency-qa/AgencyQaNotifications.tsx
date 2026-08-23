import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Bell,
  ChevronsUpDown,
  Check,
  Loader2,
  Mail,
  Plus,
  Save,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ListRow } from "@/components/ui/list-row";
import { useQaConfig, useUpdateQaConfig } from "@/hooks/useAgencyQa";
import { useMavenUsers } from "@/hooks/useChatterEvaluator";

// AgencyQaNotifications — config de avisos cuando se completa una QA.
// Dos bloques:
//
//   1. Emails externos — lista de destinatarios fuera del CRM
//      (clientes, auditores, supervisores). El correo sale por Resend
//      vía la edge function `send-notification-email`, con sender
//      "Maven CRM <noreply@mail.maven-ai.me>".
//
//   2. Notificaciones internas Maven — empleados del CRM que reciben
//      notificación in-app cuando se completa una QA (campana del
//      header). Multi-select con typeahead sobre todos los profiles.
//
// Cada uno de los 4 disparos (uploaded / analyzed / low_score / failed)
// tiene su switch independiente. El threshold de "low score" es config.
// (Antes había además un input de Google Apps Script URL — lo retiramos
// junto con la migración a Resend; la columna `apps_script_url` queda
// en DB pero el frontend ya no la lee ni escribe.)

const AgencyQaNotifications = () => {
  const cfgQ = useQaConfig();
  const usersQ = useMavenUsers();
  const update = useUpdateQaConfig();

  const [emails, setEmails] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [notifyUserIds, setNotifyUserIds] = useState<string[]>([]);
  const [notifyOnUploaded, setNotifyOnUploaded] = useState(false);
  const [notifyOnAnalyzed, setNotifyOnAnalyzed] = useState(true);
  const [notifyOnLowScore, setNotifyOnLowScore] = useState(true);
  const [notifyOnFailed, setNotifyOnFailed] = useState(true);
  const [lowScoreThreshold, setLowScoreThreshold] = useState(50);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerFilter, setPickerFilter] = useState("");

  useEffect(() => {
    if (!cfgQ.data) return;
    setEmails(cfgQ.data.notification_emails ?? []);
    setNotifyUserIds(cfgQ.data.notify_user_ids ?? []);
    setNotifyOnUploaded(cfgQ.data.notify_on_uploaded);
    setNotifyOnAnalyzed(cfgQ.data.notify_on_analyzed);
    setNotifyOnLowScore(cfgQ.data.notify_on_low_score);
    setNotifyOnFailed(cfgQ.data.notify_on_failed);
    setLowScoreThreshold(cfgQ.data.low_score_threshold);
  }, [cfgQ.data]);

  useEffect(() => {
    if (!pickerOpen) setPickerFilter("");
  }, [pickerOpen]);

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

  const removeEmail = (e: string) => setEmails(emails.filter((x) => x !== e));

  const toggleNotifyUser = (id: string) =>
    setNotifyUserIds((curr) =>
      curr.includes(id) ? curr.filter((x) => x !== id) : [...curr, id],
    );

  const handleSave = async () => {
    try {
      await update.mutateAsync({
        notification_emails: emails,
        notify_user_ids: notifyUserIds,
        notify_on_uploaded: notifyOnUploaded,
        notify_on_analyzed: notifyOnAnalyzed,
        notify_on_low_score: notifyOnLowScore,
        notify_on_failed: notifyOnFailed,
        low_score_threshold: Math.max(0, Math.min(100, lowScoreThreshold)),
      });
      toast.success("Configuración guardada");
    } catch (err) {
      toast.error("No se pudo guardar", {
        description: (err as Error).message,
      });
    }
  };

  const filteredUsers = (usersQ.data ?? []).filter((u) => {
    if (!pickerFilter.trim()) return true;
    const q = pickerFilter.toLowerCase();
    return (u.full_name ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Notificaciones</h2>
        <p className="text-xs text-muted-foreground">
          Cuando una QA se completa, las notificaciones salen por dos canales:
          el Apps Script que arma el Drive doc + emails externos, y la
          notificación interna en Maven (campana del header) para los
          empleados que elijas.
        </p>
      </div>

      {/* Disparos por evento */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Bell className="h-4 w-4" />
            Disparos automáticos
          </h3>

          <div className="space-y-3">
            <ListRow className="items-start justify-between p-3">
              <div className="flex-1 space-y-0.5">
                <Label htmlFor="notify-uploaded">QA cargada</Label>
                <p className="text-[11px] text-muted-foreground">
                  Aviso cuando alguien sube una llamada, antes del análisis IA.
                </p>
              </div>
              <Switch
                id="notify-uploaded"
                checked={notifyOnUploaded}
                onCheckedChange={setNotifyOnUploaded}
              />
            </ListRow>

            <ListRow className="items-start justify-between p-3">
              <div className="flex-1 space-y-0.5">
                <Label htmlFor="notify-analyzed">Análisis IA listo</Label>
                <p className="text-[11px] text-muted-foreground">
                  Aviso cuando Groq termina el análisis (incluye score y link
                  al detalle).
                </p>
              </div>
              <Switch
                id="notify-analyzed"
                checked={notifyOnAnalyzed}
                onCheckedChange={setNotifyOnAnalyzed}
              />
            </ListRow>

            <ListRow className="items-start justify-between p-3">
              <div className="flex-1 space-y-0.5">
                <div className="flex items-center gap-2">
                  <Label htmlFor="notify-low-score">Score bajo</Label>
                  <span className="text-[11px] text-muted-foreground">si score &lt;</span>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={lowScoreThreshold}
                    onChange={(e) => setLowScoreThreshold(Number(e.target.value))}
                    className="h-7 w-16 text-xs"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Aviso separado al supervisor para coachear antes de la
                  próxima call.
                </p>
              </div>
              <Switch
                id="notify-low-score"
                checked={notifyOnLowScore}
                onCheckedChange={setNotifyOnLowScore}
              />
            </ListRow>

            <ListRow className="items-start justify-between p-3">
              <div className="flex-1 space-y-0.5">
                <Label htmlFor="notify-failed">Análisis falló</Label>
                <p className="text-[11px] text-muted-foreground">
                  Aviso al evaluador cuando el dispatch a Groq falla
                  (rate limit, JSON inválido) — la QA queda sin análisis y
                  necesita re-dispararse manualmente.
                </p>
              </div>
              <Switch
                id="notify-failed"
                checked={notifyOnFailed}
                onCheckedChange={setNotifyOnFailed}
              />
            </ListRow>
          </div>
        </CardContent>
      </Card>

      {/* Emails externos (vía Resend) */}
      <Card>
        <CardContent className="space-y-5 p-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Mail className="h-4 w-4" />
            Emails externos
          </h3>

          <div className="space-y-1.5">
            <Label>Destinatarios</Label>
            <div className="flex gap-2">
              <Input
                value={newEmail}
                placeholder="usuario@dominio.com"
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && (e.preventDefault(), addEmail())
                }
              />
              <Button
                type="button"
                onClick={addEmail}
                variant="outline"
                size="sm"
                className="gap-1"
              >
                <Plus className="h-4 w-4" />
                Agregar
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {emails.map((e) => (
                <div
                  key={e}
                  className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs"
                >
                  <span>{e}</span>
                  <button
                    type="button"
                    onClick={() => removeEmail(e)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`Eliminar ${e}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {emails.length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Sin emails externos configurados.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notificaciones internas Maven */}
      <Card>
        <CardContent className="space-y-3 p-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Bell className="h-4 w-4" />
            Notificaciones internas Maven
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Empleados que reciben una notificación dentro de Maven (campana
            del header) cuando se completa una QA.
          </p>

          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <div className="relative">
                <Input
                  value={pickerFilter}
                  onFocus={() => setPickerOpen(true)}
                  onChange={(e) => {
                    setPickerFilter(e.target.value);
                    if (!pickerOpen) setPickerOpen(true);
                  }}
                  placeholder={
                    notifyUserIds.length === 0
                      ? "Seleccionar empleados…"
                      : `${notifyUserIds.length} seleccionado(s) — escribe para filtrar`
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
                  <div className="p-3 text-xs text-muted-foreground">
                    Cargando…
                  </div>
                )}
                {!usersQ.isLoading && filteredUsers.length === 0 && (
                  <div className="p-3 text-xs text-muted-foreground">
                    Sin resultados.
                  </div>
                )}
                {filteredUsers.map((u) => {
                  const checked = notifyUserIds.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleNotifyUser(u.id)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted",
                        checked && "bg-muted/60",
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate">
                          {u.full_name?.trim() || "(sin nombre)"}
                        </span>
                        {u.role && (
                          <span className="rounded-full border border-border/60 bg-background px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                            {u.role}
                          </span>
                        )}
                      </div>
                      <Check
                        className={cn(
                          "h-3.5 w-3.5 shrink-0",
                          checked ? "opacity-100 text-primary" : "opacity-0",
                        )}
                      />
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
                  <div
                    key={id}
                    className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary"
                  >
                    <span>{u?.full_name?.trim() || id.slice(0, 8)}</span>
                    <button
                      type="button"
                      onClick={() => toggleNotifyUser(id)}
                      className="hover:text-destructive"
                      aria-label="Remover"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={handleSave}
          disabled={update.isPending || cfgQ.isLoading}
          className="gap-1.5"
        >
          {update.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Guardar configuración
        </Button>
      </div>
    </div>
  );
};

export default AgencyQaNotifications;
