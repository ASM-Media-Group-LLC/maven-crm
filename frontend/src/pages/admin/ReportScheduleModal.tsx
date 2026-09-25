import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X, Plus, ChevronUp, ChevronDown, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import {
  useCreateReportSchedule,
  useUpdateReportSchedule,
  useTenantRoles,
  useRolePermissions,
  roleToModule,
  COMBINED_ROLE_SENTINEL,
  type ReportPeriod,
  type ReportScheduleWithRecipients,
} from "@/hooks/useReportSchedules";
import { filterMetricsByPermissions, DEFAULT_METRICS_BY_MODULE, METRICS_CATALOG, metricsAreFromFallback } from "@/hooks/reportMetricsCatalog";
import { useLanguage } from "@/hooks/useLanguage";
import { useFormato } from "@/hooks/useFormato";
import type { TranslationKey } from "@/lib/i18n";
import { ConFormato } from "./ConFormato";
import { etiquetaMetrica } from "./etiquetasMetricas";

// La llave (value del Select, report_schedules.period) no cambia; solo lo que se ve.
const PERIODOS: { value: ReportPeriod; label: TranslationKey; enFrase: TranslationKey }[] = [
  { value: "daily", label: "admin.reports.periodDaily", enFrase: "admin.schedule.periodLowerDaily" },
  { value: "weekly", label: "admin.reports.periodWeekly", enFrase: "admin.schedule.periodLowerWeekly" },
  { value: "quincenal", label: "admin.reports.periodBiweekly", enFrase: "admin.schedule.periodLowerBiweekly" },
  { value: "monthly", label: "admin.reports.periodMonthly", enFrase: "admin.schedule.periodLowerMonthly" },
  { value: "annual", label: "admin.reports.periodAnnual", enFrase: "admin.schedule.periodLowerAnnual" },
];

// 1 = lunes … 7 = domingo, como lo guarda dispatch_weekdays.
const DIAS_CORTOS: TranslationKey[] = [
  "admin.schedule.wd1", "admin.schedule.wd2", "admin.schedule.wd3", "admin.schedule.wd4",
  "admin.schedule.wd5", "admin.schedule.wd6", "admin.schedule.wd7",
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule: ReportScheduleWithRecipients | null;
}

const ReportScheduleModal = ({ open, onOpenChange, schedule }: Props) => {
  const { t } = useLanguage();
  const f = useFormato();
  const isEdit = !!schedule;
  const [name, setName] = useState("");
  const [roleName, setRoleName] = useState<string>("");
  // Cuando roleName === COMBINED_ROLE_SENTINEL, este array guarda
  // los roles que el admin quiere combinar en una sola entrega de email.
  const [combinedRoles, setCombinedRoles] = useState<string[]>([]);
  const [period, setPeriod] = useState<ReportPeriod>("weekly");
  const [dispatchHour, setDispatchHour] = useState<number>(8);
  // Días en que dispara — semantics depende del period (ver ReportSchedule).
  const [dispatchWeekdays, setDispatchWeekdays] = useState<number[]>([1]); // weekly → Lun
  const [dispatchDayOfMonth, setDispatchDayOfMonth] = useState<number>(1); // monthly/annual
  const [dispatchDayOfMonth2, setDispatchDayOfMonth2] = useState<number>(16); // quincenal segundo día
  const [dispatchUseSecondDay, setDispatchUseSecondDay] = useState<boolean>(true); // quincenal: ¿usa el 2do día?
  const [dispatchMonthOfYear, setDispatchMonthOfYear] = useState<number>(1); // annual → mes
  const [emailSubject, setEmailSubject] = useState<string>("");
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState("");
  const [saving, setSaving] = useState(false);

  const createSchedule = useCreateReportSchedule();
  const updateSchedule = useUpdateReportSchedule();
  const { data: roles = [] } = useTenantRoles();
  const { data: rolePermissions = [] } = useRolePermissions(roleName);

  // Catálogo filtrado por permisos del rol elegido.
  const availableMetrics = roleName
    ? filterMetricsByPermissions(roleToModule(roleName), rolePermissions)
    : [];
  // True cuando el filtro estricto por permisos del rol dio vacío y
  // estamos cayendo al fallback (todas las métricas del módulo). Mostramos
  // un hint en el UI para que el admin sepa que tildar es decisión suya.
  const usingFallbackMetrics = roleName && roleName !== COMBINED_ROLE_SENTINEL
    ? metricsAreFromFallback(roleToModule(roleName), rolePermissions, availableMetrics)
    : false;

  // Reset/hydrate state cuando abre el modal.
  useEffect(() => {
    if (open) {
      if (schedule) {
        setName(schedule.name);
        const inferredRole = schedule.role_name ?? (
          schedule.module === "closers" ? "closer" :
          schedule.module === "chatters" ? "Chatter Supervisor" :
          schedule.module === "combined" ? COMBINED_ROLE_SENTINEL :
          "employee"
        );
        setRoleName(inferredRole);
        // Para schedules combined, restaurar la lista de roles guardada.
        // Default a [LLG, closer] si quedó vacío (migración del flow viejo).
        setCombinedRoles(
          schedule.module === "combined"
            ? (schedule.combined_roles && schedule.combined_roles.length > 0
                ? schedule.combined_roles
                : ["LLG", "closer"])
            : [],
        );
        setPeriod(schedule.period);
        setDispatchHour(schedule.dispatch_hour ?? 8);
        // Día/s del schedule
        setDispatchWeekdays(schedule.dispatch_weekdays ?? [1]);
        const dom = schedule.dispatch_days_of_month ?? [1];
        setDispatchDayOfMonth(dom[0] ?? 1);
        setDispatchDayOfMonth2(dom[1] ?? 16);
        setDispatchUseSecondDay(dom.length > 1);
        setDispatchMonthOfYear(schedule.dispatch_month_of_year ?? 1);
        setEmailSubject(schedule.email_subject ?? "");
        // Auto-clean: si el schedule trae metrics inconsistentes con el
        // módulo (e.g. data legacy con module='llg' pero metrics=[closer.*]),
        // las descartamos. Si después del filtro no queda nada, usamos el
        // default del módulo.
        //
        // Caso especial 'combined': acepta tanto llg.* como closer.*
        const persisted = schedule.metrics ?? [];
        const consistent = persisted.filter((k) => {
          const def = METRICS_CATALOG.find((m) => m.key === k);
          if (!def) return false;
          if (schedule.module === "combined") {
            return def.module === "llg" || def.module === "closers";
          }
          return def.module === schedule.module;
        });
        setSelectedMetrics(
          consistent.length > 0
            ? consistent
            : DEFAULT_METRICS_BY_MODULE[schedule.module] ?? [],
        );
        setRecipients(schedule.recipients.map((r) => r.email));
      } else {
        setName("");
        setRoleName("employee");
        setCombinedRoles([]);
        setPeriod("weekly");
        setDispatchHour(8);
        setDispatchWeekdays([1]);
        setDispatchDayOfMonth(1);
        setDispatchDayOfMonth2(16);
        setDispatchUseSecondDay(true);
        setDispatchMonthOfYear(1);
        setEmailSubject("");
        setSelectedMetrics(DEFAULT_METRICS_BY_MODULE.llg);
        setRecipients([]);
      }
      setEmailInput("");
    }
  }, [open, schedule]);

  // Cuando el USER cambia el rol manualmente, si el nuevo rol mapea a un
  // módulo distinto, reseteamos selectedMetrics al default del nuevo módulo.
  // Importante: este handler reemplaza al useEffect previo, que se disparaba
  // también durante la hidratación inicial y stompeaba las métricas que el
  // primer useEffect acababa de cargar.
  const handleRoleChange = (newRole: string) => {
    const oldModule = roleName ? roleToModule(roleName) : null;
    const newModule = roleToModule(newRole);
    if (oldModule && oldModule !== newModule) {
      setSelectedMetrics(DEFAULT_METRICS_BY_MODULE[newModule] ?? []);
    }
    setRoleName(newRole);
    // Si elegimos Combinado y no hay roles previos, default a [LLG, closer]
    // (el caso de uso original de Alvaro). El admin puede tildar/destildar
    // los checkboxes para customizar.
    if (newRole === COMBINED_ROLE_SENTINEL && combinedRoles.length === 0) {
      setCombinedRoles(["LLG", "closer"]);
    }
  };

  // Toggle de un rol dentro del set de combinados.
  const toggleCombinedRole = (role: string) => {
    setCombinedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  };

  // Email validation: local part no termina con punto, dominio tiene
  // al menos un punto, no admite dobles puntos. Mismo criterio que
  // Resend usa antes de mandar (sino devuelve 422 "Invalid `to` field").
  const isValidEmail = (raw: string): boolean => {
    const v = raw.trim().toLowerCase();
    if (!v || v.length > 254) return false;
    const at = v.indexOf("@");
    if (at < 1 || at !== v.lastIndexOf("@")) return false;
    const local = v.slice(0, at);
    const domain = v.slice(at + 1);
    if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
    if (!/^[a-zA-Z0-9._%+-]+$/.test(local)) return false;
    if (domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) return false;
    if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain)) return false;
    return true;
  };

  const addEmail = () => {
    const v = emailInput.trim().toLowerCase();
    if (!v) return;
    if (!isValidEmail(v)) {
      toast.error(t("common.invalidEmail"), {
        description: t("admin.schedule.invalidEmailDesc"),
      });
      return;
    }
    if (recipients.includes(v)) {
      toast.error(t("admin.schedule.duplicateEmail"));
      return;
    }
    setRecipients([...recipients, v]);
    setEmailInput("");
  };

  const removeEmail = (e: string) => setRecipients(recipients.filter((x) => x !== e));

  // Nombres de mes y día en el idioma de la interfaz (1 = enero / 1 = lunes).
  // El 1/1/2024 fue lunes: de ahí sale el día de la semana.
  const nombreDelMes = (mes: number) =>
    new Date(2024, mes - 1, 1).toLocaleDateString(f.intl("es-CO"), { month: "long" });
  const nombreDelDia = (dia: number) =>
    new Date(2024, 0, dia).toLocaleDateString(f.intl("es-CO"), { weekday: "long" });

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error(t("admin.schedule.missingName"));
      return;
    }
    if (recipients.length === 0) {
      toast.error(t("admin.schedule.addRecipient"));
      return;
    }
    if (!roleName) {
      toast.error(t("admin.schedule.pickRole"));
      return;
    }
    if (roleName === COMBINED_ROLE_SENTINEL && combinedRoles.length < 2) {
      toast.error(t("admin.schedule.pickTwoRoles"));
      return;
    }
    if (selectedMetrics.length === 0) {
      toast.error(t("admin.schedule.pickMetric"));
      return;
    }
    setSaving(true);
    try {
      const recipientsPayload = recipients.map((email) => ({ email, user_id: null }));
      const subjectPayload = emailSubject.trim() ? emailSubject.trim() : null;
      const derivedModule = roleToModule(roleName);
      // Defensive clamp al guardar: solo persistimos métricas que pertenecen
      // al módulo derivado del rol elegido. Evita que el schedule quede
      // con metrics inconsistentes con su módulo.
      // Combined acepta llg.* + closer.* (las dos familias son válidas).
      const consistentMetrics = selectedMetrics.filter((k) => {
        const def = METRICS_CATALOG.find((m) => m.key === k);
        if (!def) return false;
        if (derivedModule === "combined") {
          return def.module === "llg" || def.module === "closers";
        }
        return def.module === derivedModule;
      });
      const metricsPayload = consistentMetrics.length > 0 ? consistentMetrics : null;
      // Payload de días según period — los campos no aplicables van NULL.
      let dispatchWeekdaysPayload: number[] | null = null;
      let dispatchDaysOfMonthPayload: number[] | null = null;
      let dispatchMonthOfYearPayload: number | null = null;
      if (period === "weekly") {
        if (dispatchWeekdays.length === 0) {
          toast.error(t("admin.schedule.pickWeekday"));
          setSaving(false);
          return;
        }
        dispatchWeekdaysPayload = [...dispatchWeekdays].sort((a, b) => a - b);
      } else if (period === "daily") {
        // Opcional: si seleccionó días, persistimos; si no, NULL =
        // "todos los días". El dispatcher respeta el NULL.
        dispatchWeekdaysPayload =
          dispatchWeekdays.length > 0
            ? [...dispatchWeekdays].sort((a, b) => a - b)
            : null;
      } else if (period === "quincenal") {
        dispatchDaysOfMonthPayload = dispatchUseSecondDay
          ? [dispatchDayOfMonth, dispatchDayOfMonth2].sort((a, b) => a - b)
          : [dispatchDayOfMonth];
      } else if (period === "monthly") {
        dispatchDaysOfMonthPayload = [dispatchDayOfMonth];
      } else if (period === "annual") {
        dispatchDaysOfMonthPayload = [dispatchDayOfMonth];
        dispatchMonthOfYearPayload = dispatchMonthOfYear;
      }

      // Payload: combined_roles solo se persiste para schedules
      // combinados; en single, va NULL para no contaminar.
      const combinedRolesPayload =
        derivedModule === "combined" ? combinedRoles : null;
      // role_name: para combined, ignorado por el backend pero guardamos
      // el sentinel para que el modal pueda re-hidratar a "Combinado"
      // al editar.
      const roleNamePayload =
        derivedModule === "combined" ? COMBINED_ROLE_SENTINEL : roleName;

      if (isEdit && schedule) {
        await updateSchedule.mutateAsync({
          id: schedule.id,
          patch: {
            name: name.trim(),
            module: derivedModule,
            role_name: roleNamePayload,
            period,
            dispatch_hour: dispatchHour,
            dispatch_weekdays: dispatchWeekdaysPayload,
            dispatch_days_of_month: dispatchDaysOfMonthPayload,
            dispatch_month_of_year: dispatchMonthOfYearPayload,
            email_subject: subjectPayload,
            metrics: metricsPayload,
            combined_roles: combinedRolesPayload,
          },
          recipients: recipientsPayload,
        });
        toast.success(t("admin.schedule.updated"));
      } else {
        await createSchedule.mutateAsync({
          name: name.trim(),
          role_name: roleNamePayload,
          module: derivedModule,
          period,
          dispatch_hour: dispatchHour,
          dispatch_weekdays: dispatchWeekdaysPayload,
          dispatch_days_of_month: dispatchDaysOfMonthPayload,
          dispatch_month_of_year: dispatchMonthOfYearPayload,
          email_subject: subjectPayload,
          metrics: metricsPayload,
          combined_roles: combinedRolesPayload,
          recipients: recipientsPayload,
        });
        toast.success(t("admin.schedule.created"));
      }
      onOpenChange(false);
    } catch (e: any) {
      toast.error(t("common.errorSaving"), { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Layout: header fijo + middle scrolleable + footer fijo.
          La scrollbar vive DENTRO del padding del middle así no se
          mete con los bordes redondeados del modal (antes la
          scrollbar se salía del border-radius y quedaba feo).
          overflow-hidden en DialogContent + overflow-y-auto en el
          wrapper interno. */}
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>{isEdit ? t("admin.schedule.editTitle") : t("admin.reports.new")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-y-auto -mx-2 px-2">
          <div className="space-y-1.5">
            <Label htmlFor="report-name">{t("admin.schedule.name")}</Label>
            <Input
              id="report-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("admin.schedule.namePlaceholder")}
              maxLength={120}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="report-subject">{t("admin.schedule.subject")}</Label>
            <Input
              id="report-subject"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              placeholder={t("admin.schedule.subjectPlaceholder", {
                period: t(PERIODOS.find((p) => p.value === period)?.enFrase ?? "admin.schedule.periodLowerWeekly"),
                role: roleName || t("common.role").toLowerCase(),
              })}
              maxLength={200}
            />
            <p className="text-[11px] text-muted-foreground">
              {t("admin.schedule.subjectHint")}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>{t("admin.schedule.role")}</Label>
              <Select value={roleName} onValueChange={handleRoleChange}>
                <SelectTrigger>
                  <SelectValue placeholder={t("admin.schedule.pickRole")} />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.name}>
                      {r.name}
                    </SelectItem>
                  ))}
                  {/* Opción especial: combina múltiples roles en un solo
                      email. Pedido por Alvaro 2026-05-20. Al elegirla
                      aparece debajo un multi-checkbox para tildar los
                      roles que se quieren incluir como secciones. */}
                  <SelectItem value={COMBINED_ROLE_SENTINEL}>
                    {t("admin.schedule.combined")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("admin.schedule.frequency")}</Label>
              <Select value={period} onValueChange={(v) => setPeriod(v as ReportPeriod)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIODOS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{t(p.label)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("admin.schedule.sendTime")}</Label>
              <Select value={String(dispatchHour)} onValueChange={(v) => setDispatchHour(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {Array.from({ length: 24 }, (_, h) => (
                    <SelectItem key={h} value={String(h)}>
                      {String(h).padStart(2, "0")}:00 (Miami)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Multi-select de roles combinados — full-width fuera del
              grid de 3 columnas para que los nombres no se trunquen.
              Cada rol marcado genera una sección en el email. Min 2
              para guardar. Layout responsive: 2 cols mobile → 3 md →
              4 cols lg. */}
          {roleName === COMBINED_ROLE_SENTINEL && (
            <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                {t("admin.schedule.rolesToCombine", { n: combinedRoles.length })}
              </p>
              {roles.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">{t("admin.schedule.loadingRoles")}</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-1.5">
                  {roles.map((r) => (
                    <label key={r.id} className="flex items-center gap-2 cursor-pointer text-sm">
                      <Checkbox
                        checked={combinedRoles.includes(r.name)}
                        onCheckedChange={() => toggleCombinedRole(r.name)}
                      />
                      <span className="truncate">{r.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{t("admin.schedule.recipients")}</Label>
            <p className="text-[11px] text-muted-foreground -mt-1">
              {t("admin.schedule.recipientsHint")}
            </p>
            <div className="flex gap-2">
              <Input
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addEmail();
                  }
                }}
                placeholder={t("admin.schedule.emailPlaceholder")}
                type="email"
              />
              <Button type="button" variant="outline" size="icon" onClick={addEmail} title={t("common.add")} aria-label={t("common.add")}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {recipients.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {recipients.map((e) => (
                  <Badge key={e} variant="secondary" className="gap-1 pr-1">
                    {e}
                    <button
                      type="button"
                      onClick={() => removeEmail(e)}
                      className="hover:bg-muted-foreground/20 rounded-full p-0.5"
                      aria-label={`${t("admin.manageUsers.remove")} ${e}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Selector de días según periodicidad.
              · weekly: obligatorio, mínimo 1 día.
              · daily: opcional — si no se selecciona ninguno, manda
                todos los días (comportamiento histórico). Útil para
                "todos los días" o "solo lun-vie".
              · quincenal/monthly/annual: usa día del mes (más abajo). */}
          {(period === "weekly" || period === "daily") && (
            <div className="space-y-1.5">
              <Label>
                {t("admin.schedule.weekdays")}
                {period === "weekly" ? " *" : (
                  <span className="text-muted-foreground font-normal text-xs ml-1">
                    {t("admin.schedule.weekdaysOptional")}
                  </span>
                )}
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {DIAS_CORTOS.map((clave, i) => ({ v: i + 1, l: t(clave) })).map((d) => {
                  const isSelected = dispatchWeekdays.includes(d.v);
                  return (
                    <button
                      key={d.v}
                      type="button"
                      onClick={() => {
                        setDispatchWeekdays((prev) =>
                          isSelected ? prev.filter((x) => x !== d.v) : [...prev, d.v]
                        );
                      }}
                      className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        isSelected
                          ? "bg-primary text-primary-foreground ring-1 ring-primary"
                          : "bg-muted/40 text-muted-foreground hover:bg-muted/60"
                      }`}
                    >
                      {d.l}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {period === "daily"
                  ? dispatchWeekdays.length === 0
                    ? t("admin.schedule.dailyEmpty")
                    : t("admin.schedule.dailyOnly", { n: dispatchWeekdays.length })
                  : t("admin.schedule.weeklyEach")}
              </p>
            </div>
          )}

          {period === "quincenal" && (
            <div className="space-y-1.5">
              <Label>{t("admin.schedule.daysOfMonth")}</Label>
              <div className="flex items-center gap-2">
                <Select value={String(dispatchDayOfMonth)} onValueChange={(v) => setDispatchDayOfMonth(Number(v))}>
                  <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                      <SelectItem key={d} value={String(d)}>{t("admin.schedule.dayN", { n: d })}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                  <Checkbox
                    checked={dispatchUseSecondDay}
                    onCheckedChange={(v) => setDispatchUseSecondDay(!!v)}
                  />
                  {t("admin.schedule.secondDay")}
                </label>
                {dispatchUseSecondDay && (
                  <Select value={String(dispatchDayOfMonth2)} onValueChange={(v) => setDispatchDayOfMonth2(Number(v))}>
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                        <SelectItem key={d} value={String(d)}>{t("admin.schedule.dayN", { n: d })}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {t("admin.schedule.cap28")}
              </p>
            </div>
          )}

          {period === "monthly" && (
            <div className="space-y-1.5">
              <Label>{t("admin.schedule.dayOfMonth")}</Label>
              <Select value={String(dispatchDayOfMonth)} onValueChange={(v) => setDispatchDayOfMonth(Number(v))}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                    <SelectItem key={d} value={String(d)}>{t("admin.schedule.dayN", { n: d })}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {period === "annual" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("admin.schedule.month")}</Label>
                <Select value={String(dispatchMonthOfYear)} onValueChange={(v) => setDispatchMonthOfYear(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => nombreDelMes(i + 1))
                      .map((m, i) => (<SelectItem key={i+1} value={String(i+1)}>{m.charAt(0).toUpperCase() + m.slice(1)}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("admin.schedule.day")}</Label>
                <Select value={String(dispatchDayOfMonth)} onValueChange={(v) => setDispatchDayOfMonth(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                      <SelectItem key={d} value={String(d)}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Pista del rango que cubriría según period + días + hora elegidos */}
          <div className="rounded-md border border-border/60 bg-muted/20 p-2.5 text-[11px] text-muted-foreground">
            {(() => {
              const hh = `${String(dispatchHour).padStart(2, "0")}:00`;
              if (period === "daily") return t("admin.schedule.sumDaily", { hh });
              if (period === "weekly") {
                const list = dispatchWeekdays.length === 0 ? t("admin.schedule.sumPickDays")
                  : [...dispatchWeekdays].sort((a, b) => a - b).map((d) => nombreDelDia(d)).join(", ");
                return t("admin.schedule.sumWeekly", { days: list, hh });
              }
              if (period === "quincenal") {
                const list = dispatchUseSecondDay
                  ? t("admin.schedule.sumTwoDays", {
                      a: Math.min(dispatchDayOfMonth, dispatchDayOfMonth2),
                      b: Math.max(dispatchDayOfMonth, dispatchDayOfMonth2),
                    })
                  : t("admin.schedule.sumOneDay", { a: dispatchDayOfMonth });
                return t("admin.schedule.sumBiweekly", { days: list, hh });
              }
              if (period === "monthly") {
                return t("admin.schedule.sumMonthly", { d: dispatchDayOfMonth, hh });
              }
              return t("admin.schedule.sumAnnual", { d: dispatchDayOfMonth, month: nombreDelMes(dispatchMonthOfYear), hh });
            })()}
          </div>

          {/* Métricas disponibles según permisos del rol.
              Single mode: lista plana con selected al top + unselected
                abajo, ordenables con ▲▼.
              Combined mode: AGRUPADAS por módulo (LLG / Closers /
                Chatters) con header de sección. Dentro de cada grupo,
                mismo patrón (selected al top, unselected abajo). */}
          <div className="space-y-2">
            <Label>{t("admin.schedule.metrics")}</Label>
            {usingFallbackMetrics && (
              <div className="rounded-md border border-warning/40 bg-warning/10 px-2.5 py-2 text-[11px] text-warning">
                <ConFormato texto={t("admin.schedule.fallbackWarning", { role: roleName, module: roleToModule(roleName) })} />
              </div>
            )}
            {availableMetrics.length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic">
                {roleName
                  ? t("admin.schedule.noMetricsInModule", { module: roleToModule(roleName) })
                  : t("admin.schedule.pickRoleForMetrics")}
              </p>
            ) : (
              <div className="rounded-md border border-border/60 bg-muted/10 p-2.5 max-h-72 overflow-y-auto space-y-1.5">
                {(() => {
                  // Selected: respetan el orden de selectedMetrics.
                  const selectedInOrder = selectedMetrics
                    .map((k) => availableMetrics.find((m) => m.key === k))
                    .filter((m): m is (typeof availableMetrics)[number] => !!m);
                  const unselected = availableMetrics.filter(
                    (m) => !selectedMetrics.includes(m.key),
                  );

                  // Reorder dentro de selectedMetrics. En combined este
                  // reorder mueve dentro del array global, pero el efecto
                  // visible es solo dentro del grupo del mismo módulo
                  // (cada sección del email se renderiza con sus
                  // métricas en el orden global, filtrando las suyas).
                  const moveMetric = (key: string, direction: -1 | 1) => {
                    const idx = selectedMetrics.indexOf(key);
                    if (idx < 0) return;
                    const next = [...selectedMetrics];
                    const swapIdx = idx + direction;
                    if (swapIdx < 0 || swapIdx >= next.length) return;
                    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
                    setSelectedMetrics(next);
                  };

                  // Render de una fila de métrica seleccionada
                  const renderSelectedRow = (m: typeof availableMetrics[number], globalIdx: number, isFirst: boolean, isLast: boolean) => (
                    <div
                      key={m.key}
                      className="flex items-center gap-2 text-sm rounded px-1.5 py-1 bg-primary/5 ring-1 ring-primary/15"
                    >
                      <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="w-5 shrink-0 text-center text-[10px] font-mono text-muted-foreground tabular-nums">
                        {globalIdx + 1}
                      </span>
                      <Checkbox
                        checked
                        onCheckedChange={() =>
                          setSelectedMetrics(
                            selectedMetrics.filter((k) => k !== m.key),
                          )
                        }
                      />
                      <span className="flex-1 truncate">{etiquetaMetrica(t, m)}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={isFirst}
                        onClick={() => moveMetric(m.key, -1)}
                        className="h-6 w-6 shrink-0"
                        aria-label={t("admin.schedule.moveUp")}
                        title={t("admin.schedule.moveUp")}
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={isLast}
                        onClick={() => moveMetric(m.key, 1)}
                        className="h-6 w-6 shrink-0"
                        aria-label={t("admin.schedule.moveDown")}
                        title={t("admin.schedule.moveDown")}
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );

                  // Render de una fila de métrica no-seleccionada
                  const renderUnselectedRow = (m: typeof availableMetrics[number]) => (
                    <label
                      key={m.key}
                      className="flex items-center gap-2.5 text-sm cursor-pointer hover:bg-muted/40 rounded px-1.5 py-1 transition-colors"
                    >
                      <Checkbox
                        checked={false}
                        onCheckedChange={() =>
                          setSelectedMetrics([...selectedMetrics, m.key])
                        }
                      />
                      {etiquetaMetrica(t, m)}
                    </label>
                  );

                  // Combined mode: agrupar por módulo
                  if (roleName === COMBINED_ROLE_SENTINEL) {
                    const MODULE_LABELS: Record<string, string> = {
                      llg: "LLG",
                      closers: "Closers",
                      chatters: "Chatters",
                    };
                    // Determinar qué módulos están realmente involucrados
                    // según los roles que el admin tildó. Si no hay roles
                    // seleccionados, mostrar las 3 familias.
                    const involvedModules = combinedRoles.length > 0
                      ? Array.from(new Set(combinedRoles.map((r) => roleToModule(r))))
                      : ["llg", "closers", "chatters"];

                    return (
                      <>
                        {involvedModules.map((mod, modIdx) => {
                          const moduleSelected = selectedInOrder.filter((m) => m.module === mod);
                          const moduleUnselected = unselected.filter((m) => m.module === mod);
                          if (moduleSelected.length === 0 && moduleUnselected.length === 0) return null;
                          return (
                            <div key={mod} className={modIdx > 0 ? "pt-2 mt-2 border-t border-border/40" : ""}>
                              <p className="text-xs font-semibold text-primary/80 px-1 pb-1">
                                {MODULE_LABELS[mod] ?? mod}
                              </p>
                              <div className="space-y-1.5">
                                {moduleSelected.map((m) =>
                                  renderSelectedRow(
                                    m,
                                    selectedMetrics.indexOf(m.key),
                                    selectedMetrics.indexOf(m.key) === 0,
                                    selectedMetrics.indexOf(m.key) === selectedMetrics.length - 1,
                                  ),
                                )}
                                {moduleUnselected.map((m) => renderUnselectedRow(m))}
                              </div>
                            </div>
                          );
                        })}
                      </>
                    );
                  }

                  // Single mode: lista plana clásica
                  return (
                    <>
                      {selectedInOrder.map((m, idx) =>
                        renderSelectedRow(m, idx, idx === 0, idx === selectedInOrder.length - 1),
                      )}
                      {selectedInOrder.length > 0 && unselected.length > 0 && (
                        <div className="my-1.5 border-t border-border/40" />
                      )}
                      {unselected.map((m) => renderUnselectedRow(m))}
                    </>
                  );
                })()}
              </div>
            )}
            {availableMetrics.length > 0 && (
              <p className="text-[10px] text-muted-foreground">
                {roleName === COMBINED_ROLE_SENTINEL
                  ? t("admin.schedule.combinedHint")
                  : t("admin.schedule.singleHint")}
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t("admin.saving") : isEdit ? t("admin.schedule.saveChanges") : t("admin.schedule.createReport")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReportScheduleModal;
