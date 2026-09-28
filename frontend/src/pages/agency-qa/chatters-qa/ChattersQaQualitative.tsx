import { useState } from "react";
import { toast } from "sonner";
import { Plus, FileText, Trash2, Loader2, AlertTriangle, ChevronRight, X, Mail, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { useFormato } from "@/hooks/useFormato";
import type { Formato } from "@/lib/formato";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { useBluModels, bluModelLabel } from "../../sales-performance/useBluMp";
import { COMPANIES, companyLabel, periodLabel, type CompanyCode } from "./useChatterScorecards";
import {
  veredictoLabel, veredictoTone, useQaReports, useCreateQaReport, useDeleteQaReport, useSendChatterQaEmail, useBluChatters, type EvaluatedModel, type ChatterQaReport,
} from "./useChatterQaReports";
import ChatterQaReportDetail from "./ChatterQaReportDetail";
import { useLanguage } from "@/hooks/useLanguage";
import { ConFormato } from "@/pages/admin/ConFormato";

const toneBadge: Record<string, string> = {
  good: "border-success/40 text-success", warn: "border-warning/40 text-warning", bad: "border-destructive/40 text-destructive",
};
// Mes actual YYYY-MM (en el navegador del usuario).
const currentMonth = () => new Date().toISOString().slice(0, 7);
// Día exacto en que se hizo el reporte (created_at).
const fmtDay = (f: Formato, iso?: string | null) => (iso ? format(new Date(iso), "d MMM yyyy", { locale: f.fechas }) : "—");

export default function ChattersQaQualitative() {
  const { t, language } = useLanguage();
  const f = useFormato();
  // En español queda el del navegador, como siempre; en inglés, en-US.
  const fechaLocal = language === "en" ? "en-US" : undefined;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: reports = [], isLoading } = useQaReports(null); // todos; filtramos en UI
  const create = useCreateQaReport();
  const del = useDeleteQaReport();
  const sendEmail = useSendChatterQaEmail();
  const { data: models = [] } = useBluModels();
  const { data: bluChatters = [] } = useBluChatters();

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [bluId, setBluId] = useState<number | null>(null);
  const [company, setCompany] = useState<CompanyCode>("CP");
  const [month, setMonth] = useState(currentMonth());
  const [newModels, setNewModels] = useState<EvaluatedModel[]>([]);
  const [toDelete, setToDelete] = useState<ChatterQaReport | null>(null);
  const [toResend, setToResend] = useState<ChatterQaReport | null>(null);
  // Filtro por fecha de creación (calendario de movimiento). Vacío = todos.
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  // Reportes filtrados por la fecha en que se HICIERON (created_at).
  const shown = reports.filter((r) => {
    if (!r.created_at) return true;
    const d = new Date(r.created_at);
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    return true;
  });

  if (selectedId) return <ChatterQaReportDetail id={selectedId} onBack={() => setSelectedId(null)} />;

  const addNewModel = (mid: string) => {
    const m = models.find((x) => String(x.id) === mid);
    if (!m || newModels.some((e) => e.model_id === m.id)) return;
    setNewModels([...newModels, { model_id: m.id, model_name: bluModelLabel(m) }]);
  };
  const submit = () => {
    if (!name.trim()) return;
    create.mutate(
      { chatter_name: name, company, period: `${month}-01`, blu_employee_id: bluId, source: "manual", evaluated_models: newModels },
      {
        onSuccess: (row) => { toast.success(t("agencyQa.qual.created")); setCreating(false); setName(""); setBluId(null); setNewModels([]); setSelectedId(row.id); },
        onError: (e) => toast.error((e as Error).message),
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t("agencyQa.qual.intro")}</p>
        <div className="flex items-center gap-2">
          <DateRangePicker from={dateFrom} to={dateTo} onApply={(f, t) => { setDateFrom(f); setDateTo(t); }} placeholder={t("agencyQa.qual.filterByDate")} />
          {!creating ? (
            <Button size="sm" className="gap-1.5" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> {t("agencyQa.qual.newReport")}</Button>
          ) : null}
        </div>
      </div>

      {creating && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-border p-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground">{t("agencyQa.qual.chatterFromBlu")}</label>
            <SearchableSelect
              value={bluId != null ? String(bluId) : ""}
              onValueChange={(v) => {
                const c = bluChatters.find((x) => String(x.blu_employee_id) === v);
                setBluId(c ? c.blu_employee_id : null);
                setName(c ? c.name : "");
                // Autosugerir hasta 4 modelos a las que el chatter está asignado en BLU (editable).
                // Tope = el análisis procesa máx 4 modelos; sugerir 17 reventaba el tiempo del edge.
                if (c?.assignedCreators?.length && models.length) {
                  const matched = models.filter((m) => c.assignedCreators.includes(m.id));
                  const suggested = matched.slice(0, 4).map((m) => ({ model_id: m.id, model_name: bluModelLabel(m) }));
                  if (suggested.length) {
                    setNewModels(suggested);
                    if (matched.length > suggested.length)
                      toast.info(t("agencyQa.qual.suggested", { name: c.name, total: matched.length, n: suggested.length }));
                  } else {
                    setNewModels([]);
                  }
                } else {
                  setNewModels([]);
                }
              }}
              options={bluChatters.map((c) => ({
                value: String(c.blu_employee_id),
                label: c.group_name ? `${c.name} · ${c.group_name}` : c.name,
                searchAdditional: String(c.blu_employee_id),
              }))}
              placeholder={bluChatters.length ? t("agencyQa.score.searchChatter") : t("agencyQa.qual.loadingChatters")}
              searchPlaceholder={t("agencyQa.qual.chatterName")}
              triggerClassName="h-9 w-56"
              popoverWidth="w-72"
            />
          </div>
          <Select value={company} onValueChange={(v) => setCompany(v as CompanyCode)}>
            <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>{COMPANIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.label} ({c.code})</SelectItem>)}</SelectContent>
          </Select>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground">{t("agencyQa.score.month")}</label>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-muted-foreground">{t("agencyQa.qual.modelsHint")}</label>
            <div className="flex min-h-9 flex-wrap items-center gap-1.5">
              {newModels.map((m) => (
                <Badge key={m.model_id} variant="secondary" className="gap-1">{m.model_name}
                  <button type="button" onClick={() => setNewModels(newModels.filter((e) => e.model_id !== m.model_id))}><X className="h-3 w-3" /></button>
                </Badge>
              ))}
              <Select value="" onValueChange={addNewModel}>
                <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder={t("agencyQa.addModel")} /></SelectTrigger>
                <SelectContent className="max-h-72">{models.map((m) => <SelectItem key={m.id} value={String(m.id)}>{bluModelLabel(m)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <Button size="sm" onClick={submit} disabled={!name.trim() || create.isPending}>{t("common.create")}</Button>
          <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setName(""); setBluId(null); setNewModels([]); }}>{t("common.cancel")}</Button>
        </div>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
      {!isLoading && reports.length === 0 && <p className="text-sm text-muted-foreground">{t("agencyQa.qual.empty", { button: t("agencyQa.qual.newReport") })}</p>}
      {!isLoading && reports.length > 0 && shown.length === 0 && <p className="text-sm text-muted-foreground">{t("agencyQa.qual.emptyRange")}</p>}

      <div className="space-y-2">
        {shown.map((r) => (
          <button key={r.id} type="button" onClick={() => setSelectedId(r.id)}
            className="flex w-full items-center gap-3 rounded-lg border border-border bg-card/40 px-4 py-3 text-left hover:bg-muted/30">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{r.chatter_name}</span>
                <span className="text-xs text-muted-foreground">{companyLabel(r.company)} · {periodLabel(r.period, language)} · {t("agencyQa.qual.madeOn", { date: fmtDay(f, r.created_at) })}</span>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {(r.evaluated_models ?? []).map((m) => m.model_name).join(", ") || t("agencyQa.qual.noModels")}
                {r.report?.hallazgo_principal ? ` · ${r.report.hallazgo_principal}` : ""}
              </p>
            </div>
            {r.status === "processing" && <Badge variant="outline" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" /> {t("agencyQa.qual.ai")}</Badge>}
            {r.status === "failed" && <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive"><AlertTriangle className="h-3 w-3" /> {t("agencyQa.failedBadge")}</Badge>}
            {r.veredicto && <Badge variant="outline" className={toneBadge[veredictoTone(r.veredicto)]}>{veredictoLabel(r.veredicto, language)}</Badge>}
            <span className="text-[10px] uppercase text-muted-foreground">{r.source === "manual" ? t("agencyQa.qual.manual") : t("agencyQa.qual.ai")}</span>
            {r.status === "ready" && (
              <button type="button" disabled={sendEmail.isPending}
                title={r.email_sent_at ? t("agencyQa.qual.sentResend", { date: new Date(r.email_sent_at).toLocaleString(fechaLocal) }) : t("agencyQa.qual.sendByEmail")}
                onClick={(e) => {
                  e.stopPropagation();
                  if (r.email_sent_at) { setToResend(r); return; } // ya enviado → confirmar reenvío con popup
                  sendEmail.mutate(r, { onSuccess: () => toast.success(t("agencyQa.qual.sentByEmail")), onError: (err) => toast.error((err as Error).message) });
                }}
                className={r.email_sent_at ? "text-success/70 hover:text-success" : "text-muted-foreground/50 hover:text-primary"}>
                {r.email_sent_at ? <MailCheck className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
              </button>
            )}
            <button type="button" onClick={(e) => { e.stopPropagation(); setToDelete(r); }}
              className="text-muted-foreground/40 hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        ))}
      </div>

      {/* Confirmar borrado — popup estilo Maven (shadcn AlertDialog), reemplaza al confirm() del navegador */}
      <AlertDialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" /> {t("agencyQa.qual.deleteTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              <ConFormato
                texto={t("agencyQa.qual.deleteBody", {
                  name: toDelete?.chatter_name ?? "",
                  extra: toDelete ? ` (${companyLabel(toDelete.company)} · ${periodLabel(toDelete.period, language)})` : "",
                })}
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending} />
            <AlertDialogAction
              disabled={del.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (!toDelete) return;
                del.mutate(toDelete.id, {
                  onSuccess: () => { toast.success(t("agencyQa.qual.deleted")); setToDelete(null); },
                  onError: (err) => toast.error((err as Error).message),
                });
              }}>
              {del.isPending ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> {t("agencyQa.eliminating")}</> : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmar REENVÍO de email (cuando ya se mandó) — popup estilo Maven */}
      <AlertDialog open={!!toResend} onOpenChange={(open) => !open && setToResend(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" /> {t("agencyQa.qual.resendTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              <ConFormato
                texto={t("agencyQa.qual.resendBody", {
                  name: toResend?.chatter_name ?? "",
                  when: toResend?.email_sent_at
                    ? t("agencyQa.qual.resendWhen", { date: new Date(toResend.email_sent_at).toLocaleString(fechaLocal) })
                    : "",
                })}
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sendEmail.isPending} />
            <AlertDialogAction
              disabled={sendEmail.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (!toResend) return;
                sendEmail.mutate(toResend, {
                  onSuccess: () => { toast.success(t("agencyQa.qual.resent")); setToResend(null); },
                  onError: (err) => toast.error((err as Error).message),
                });
              }}>
              {sendEmail.isPending ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> {t("agencyQa.sending")}</> : t("agencyQa.resend")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
