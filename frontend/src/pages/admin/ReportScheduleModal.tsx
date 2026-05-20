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
import { filterMetricsByPermissions, DEFAULT_METRICS_BY_MODULE, METRICS_CATALOG } from "@/hooks/reportMetricsCatalog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule: ReportScheduleWithRecipients | null;
}

const ReportScheduleModal = ({ open, onOpenChange, schedule }: Props) => {
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
      toast.error("Email inválido", {
        description: "Verificá que no tenga puntos antes/después del @ y que tenga un dominio válido.",
      });
      return;
    }
    if (recipients.includes(v)) {
      toast.error("Ese email ya está en la lista");
      return;
    }
    setRecipients([...recipients, v]);
    setEmailInput("");
  };

  const removeEmail = (e: string) => setRecipients(recipients.filter((x) => x !== e));

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Falta el nombre");
      return;
    }
    if (recipients.length === 0) {
      toast.error("Agregá al menos un destinatario");
      return;
    }
    if (!roleName) {
      toast.error("Elegí un rol");
      return;
    }
    if (roleName === COMBINED_ROLE_SENTINEL && combinedRoles.length < 2) {
      toast.error("Elegí al menos 2 roles para combinar");
      return;
    }
    if (selectedMetrics.length === 0) {
      toast.error("Seleccioná al menos una métrica");
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
          toast.error("Elegí al menos un día de la semana");
          setSaving(false);
          return;
        }
        dispatchWeekdaysPayload = [...dispatchWeekdays].sort((a, b) => a - b);
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
        toast.success("Reporte actualizado");
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
        toast.success("Reporte creado");
      }
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Error al guardar", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar reporte" : "Nuevo reporte"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="report-name">Nombre *</Label>
            <Input
              id="report-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Reporte semanal LLGs"
              maxLength={120}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="report-subject">Asunto del email (opcional)</Label>
            <Input
              id="report-subject"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              placeholder={`Maven CRM · Reporte ${period === "daily" ? "diario" : period === "weekly" ? "semanal" : period === "monthly" ? "mensual" : "anual"} ${roleName || "rol"}`}
              maxLength={200}
            />
            <p className="text-[11px] text-muted-foreground">
              Si lo dejás vacío, se genera automático según rol y periodicidad.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Rol *</Label>
              <Select value={roleName} onValueChange={handleRoleChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Elegí un rol" />
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
                    Combinado (varios roles)
                  </SelectItem>
                </SelectContent>
              </Select>
              {/* Multi-select de roles combinados — visible sólo cuando
                  el admin eligió "Combinado". Cada rol marcado genera
                  una sección en el email. Min 2 para guardar. */}
              {roleName === COMBINED_ROLE_SENTINEL && (
                <div className="mt-2 rounded-md border border-border bg-muted/30 p-2 space-y-1.5">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    Roles a combinar ({combinedRoles.length})
                  </p>
                  {roles.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Cargando roles…</p>
                  ) : (
                    <div className="space-y-1">
                      {roles.map((r) => (
                        <label key={r.id} className="flex items-center gap-2 cursor-pointer text-sm">
                          <Checkbox
                            checked={combinedRoles.includes(r.name)}
                            onCheckedChange={() => toggleCombinedRole(r.name)}
                          />
                          <span>{r.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Periodicidad *</Label>
              <Select value={period} onValueChange={(v) => setPeriod(v as ReportPeriod)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Diario</SelectItem>
                  <SelectItem value="weekly">Semanal</SelectItem>
                  <SelectItem value="quincenal">Quincenal</SelectItem>
                  <SelectItem value="monthly">Mensual</SelectItem>
                  <SelectItem value="annual">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Hora envío *</Label>
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

          <div className="space-y-1.5">
            <Label>Destinatarios *</Label>
            <p className="text-[11px] text-muted-foreground -mt-1">
              Email libre — pueden ser users de Maven o externos.
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
                placeholder="ejemplo@dominio.com"
                type="email"
              />
              <Button type="button" variant="outline" size="icon" onClick={addEmail} title="Agregar">
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
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Selector de días según periodicidad. daily no muestra nada. */}
          {period === "weekly" && (
            <div className="space-y-1.5">
              <Label>Días de la semana *</Label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { v: 1, l: "Lun" }, { v: 2, l: "Mar" }, { v: 3, l: "Mié" },
                  { v: 4, l: "Jue" }, { v: 5, l: "Vie" }, { v: 6, l: "Sáb" }, { v: 7, l: "Dom" },
                ].map((d) => {
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
                El reporte se manda en cada uno de los días elegidos.
              </p>
            </div>
          )}

          {period === "quincenal" && (
            <div className="space-y-1.5">
              <Label>Días del mes *</Label>
              <div className="flex items-center gap-2">
                <Select value={String(dispatchDayOfMonth)} onValueChange={(v) => setDispatchDayOfMonth(Number(v))}>
                  <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                      <SelectItem key={d} value={String(d)}>Día {d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                  <Checkbox
                    checked={dispatchUseSecondDay}
                    onCheckedChange={(v) => setDispatchUseSecondDay(!!v)}
                  />
                  + un 2do día
                </label>
                {dispatchUseSecondDay && (
                  <Select value={String(dispatchDayOfMonth2)} onValueChange={(v) => setDispatchDayOfMonth2(Number(v))}>
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                        <SelectItem key={d} value={String(d)}>Día {d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Cap a día 28 para evitar conflictos con febrero.
              </p>
            </div>
          )}

          {period === "monthly" && (
            <div className="space-y-1.5">
              <Label>Día del mes *</Label>
              <Select value={String(dispatchDayOfMonth)} onValueChange={(v) => setDispatchDayOfMonth(Number(v))}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                    <SelectItem key={d} value={String(d)}>Día {d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {period === "annual" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Mes *</Label>
                <Select value={String(dispatchMonthOfYear)} onValueChange={(v) => setDispatchMonthOfYear(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]
                      .map((m, i) => (<SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Día *</Label>
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
              const weekdayLabels = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
              const monthLabels = ["", "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
              if (period === "daily") return `Cada día a las ${hh} Miami recibirás los datos del día anterior (00:00 a 23:59).`;
              if (period === "weekly") {
                const list = dispatchWeekdays.length === 0 ? "(elegí días)"
                  : dispatchWeekdays.sort((a, b) => a - b).map((d) => weekdayLabels[d]).join(", ");
                return `Los ${list} a las ${hh} Miami recibirás los últimos 7 días.`;
              }
              if (period === "quincenal") {
                const list = dispatchUseSecondDay
                  ? `días ${Math.min(dispatchDayOfMonth, dispatchDayOfMonth2)} y ${Math.max(dispatchDayOfMonth, dispatchDayOfMonth2)}`
                  : `día ${dispatchDayOfMonth}`;
                return `Los ${list} de cada mes a las ${hh} Miami recibirás los últimos 15 días.`;
              }
              if (period === "monthly") {
                return `El día ${dispatchDayOfMonth} de cada mes a las ${hh} Miami recibirás los datos del mes pasado.`;
              }
              return `El ${dispatchDayOfMonth} de ${monthLabels[dispatchMonthOfYear]} a las ${hh} Miami recibirás los datos del año anterior.`;
            })()}
          </div>

          {/* Métricas disponibles según permisos del rol */}
          <div className="space-y-2">
            <Label>Métricas a incluir *</Label>
            {availableMetrics.length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic">
                {roleName
                  ? `El rol "${roleName}" no tiene permisos para ninguna métrica de este módulo.`
                  : "Elegí un rol para ver las métricas disponibles."}
              </p>
            ) : (
              <div className="rounded-md border border-border/60 bg-muted/10 p-2.5 max-h-72 overflow-y-auto space-y-1.5">
                {/* Las seleccionadas van primero, en el ORDEN que el user
                    eligió — eso define el orden de columnas en el correo.
                    Las disponibles (no seleccionadas) van debajo en el orden
                    del catálogo. Las seleccionadas tienen flechas ▲▼ para
                    reordenar; las disponibles sólo el check para agregar. */}
                {(() => {
                  // Selected: respetan el orden de selectedMetrics.
                  const selectedInOrder = selectedMetrics
                    .map((k) => availableMetrics.find((m) => m.key === k))
                    .filter((m): m is (typeof availableMetrics)[number] => !!m);
                  const unselected = availableMetrics.filter(
                    (m) => !selectedMetrics.includes(m.key),
                  );

                  const moveMetric = (key: string, direction: -1 | 1) => {
                    const idx = selectedMetrics.indexOf(key);
                    if (idx < 0) return;
                    const next = [...selectedMetrics];
                    const swapIdx = idx + direction;
                    if (swapIdx < 0 || swapIdx >= next.length) return;
                    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
                    setSelectedMetrics(next);
                  };

                  return (
                    <>
                      {selectedInOrder.map((m, idx) => (
                        <div
                          key={m.key}
                          className="flex items-center gap-2 text-sm rounded px-1.5 py-1 bg-primary/5 ring-1 ring-primary/15"
                        >
                          <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="w-5 shrink-0 text-center text-[10px] font-mono text-muted-foreground tabular-nums">
                            {idx + 1}
                          </span>
                          <Checkbox
                            checked
                            onCheckedChange={() =>
                              setSelectedMetrics(
                                selectedMetrics.filter((k) => k !== m.key),
                              )
                            }
                          />
                          <span className="flex-1 truncate">{m.label}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={idx === 0}
                            onClick={() => moveMetric(m.key, -1)}
                            className="h-6 w-6 shrink-0"
                            aria-label="Subir"
                            title="Subir"
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={idx === selectedInOrder.length - 1}
                            onClick={() => moveMetric(m.key, 1)}
                            className="h-6 w-6 shrink-0"
                            aria-label="Bajar"
                            title="Bajar"
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                      {selectedInOrder.length > 0 && unselected.length > 0 && (
                        <div className="my-1.5 border-t border-border/40" />
                      )}
                      {unselected.map((m) => (
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
                          {m.label}
                        </label>
                      ))}
                    </>
                  );
                })()}
              </div>
            )}
            {availableMetrics.length > 0 && (
              <p className="text-[10px] text-muted-foreground">
                Métricas seleccionadas aparecen arriba en el orden de las
                columnas del correo. Usá ▲▼ para reordenar.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear reporte"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReportScheduleModal;
