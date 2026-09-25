import { useState, useMemo } from "react";
import { startOfMonth, endOfDay, format } from "date-fns";
import {
  Activity, Users, AlertTriangle, UserX, ChevronRight, ArrowLeft, MessageCircle,
  Instagram, Send, CalendarDays, ExternalLink, Bot,
} from "lucide-react";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Card } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import StatChip from "@/components/StatChip";
import { cn } from "@/lib/utils";
import { useFormato } from "@/hooks/useFormato";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { resultLabel, stageLabel } from "../hooks/useCloserLeads";
import {
  useCloserActivity, useCloserActivityDetail,
  type CloserActivityRow, type CloserActivityDetailRow,
} from "../hooks/useCloserActivity";

// ── Estado del closer (semáforo de supervisión) ──────────────────────────
type Estado = "sin_gestion" | "atrasado" | "al_dia" | "sin_leads";

// El estado se basa en el pipeline ACTUAL (leads asignados + vencidos por
// cadencia), NO en la actividad del rango — si dependiera del rango, elegir
// "Hoy" (casi siempre 0 contactos) marcaba a todos como "Sin gestión".
const estadoOf = (r: CloserActivityRow): Estado => {
  if (r.leads_assigned === 0) return "sin_leads";
  if (r.leads_overdue === 0) return "al_dia";
  if (r.leads_overdue / r.leads_assigned >= 0.75) return "sin_gestion"; // ≥75% del pipeline vencido
  return "atrasado";
};

const ESTADO_META: Record<Estado, { labelKey: TranslationKey; variant: BadgeProps["variant"]; prio: number }> = {
  sin_gestion: { labelKey: "closers.activity.state.noMgmt",  variant: "destructive-soft", prio: 0 },
  atrasado:    { labelKey: "closers.activity.state.late",    variant: "warning-soft",     prio: 1 },
  al_dia:      { labelKey: "closers.activity.state.ok",      variant: "success-soft",     prio: 2 },
  sin_leads:   { labelKey: "closers.activity.state.noLeads", variant: "secondary",        prio: 3 },
};

// ── Helpers de presentación ──────────────────────────────────────────────
const igUrl = (handle: string | null) => {
  const h = String(handle ?? "").replace(/^@+/, "").trim();
  return h ? `https://instagram.com/${h}` : null;
};

const fmtMoney = (n: number) => {
  if (!n) return null;
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
};

const resultVariant = (r: string | null): BadgeProps["variant"] => {
  switch (r) {
    case "Contestó":
    case "Interesada": return "success-soft";
    case "No contestó": return "warning-soft";
    case "No interesada": return "destructive-soft";
    default: return "secondary"; // Pendiente / sin resultado
  }
};

const channelIcon = (channel: string | null) => {
  switch (channel) {
    case "Instagram": return Instagram;
    case "Telegram": return Send;
    default: return MessageCircle; // WhatsApp / otros
  }
};

// Chips de conteo por categoría (canal o resultado): "WhatsApp 12". La llave es
// el valor guardado (dato); `labelOf` decide cómo se muestra.
const CountChips = ({ data, labelOf }: { data: Record<string, number>; labelOf?: (k: string) => string }) => {
  const entries = Object.entries(data ?? {}).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([k, n]) => (
        <span key={k} className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium">
          {labelOf ? labelOf(k) : k}
          <span className="tabular-nums text-muted-foreground">{n}</span>
        </span>
      ))}
    </div>
  );
};

interface Props {
  isAdmin: boolean;
  isManager: boolean;
  viewAsCloserId: string | null;
}

const ClosersActivityDashboard = ({ isAdmin, isManager, viewAsCloserId }: Props) => {
  const f = useFormato();
  const { t } = useLanguage();
  // Default = mes en curso (hoy suele estar vacío → parecía roto).
  const [from, setFrom] = useState<Date>(() => startOfMonth(new Date()));
  const [to, setTo] = useState<Date>(() => endOfDay(new Date()));

  const { data: rows = [], isLoading } = useCloserActivity(from, to, viewAsCloserId);
  const [selectedEmp, setSelectedEmp] = useState<CloserActivityRow | null>(null);

  // Orden por atención: sin gestión → atrasado → al día → sin leads; luego vencidos/contactos.
  const sorted = useMemo(() =>
    [...rows].sort((a, b) => {
      const pa = ESTADO_META[estadoOf(a)].prio, pb = ESTADO_META[estadoOf(b)].prio;
      if (pa !== pb) return pa - pb;
      if (b.leads_overdue !== a.leads_overdue) return b.leads_overdue - a.leads_overdue;
      return b.total_contacts - a.total_contacts;
    }),
  [rows]);

  const totals = useMemo(() =>
    rows.reduce(
      (acc, r) => {
        acc.contacts += Number(r.total_contacts) || 0;
        acc.touched += Number(r.leads_touched) || 0;
        acc.overdue += Number(r.leads_overdue) || 0;
        if (estadoOf(r) === "sin_gestion") acc.sinGestion += 1;
        return acc;
      },
      { contacts: 0, touched: 0, overdue: 0, sinGestion: 0 },
    ),
  [rows]);

  const rangeLabel =
    format(from, "yyyy-MM-dd") === format(to, "yyyy-MM-dd")
      ? format(from, f.idioma === "en" ? "EEEE, MMMM d" : "EEEE d 'de' MMMM", { locale: f.fechas })
      : `${format(from, "d MMM", { locale: f.fechas })} – ${format(to, "d MMM yyyy", { locale: f.fechas })}`;

  const dateBar = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold">{t("closers.activity.title")}</h3>
        <p className="text-xs text-muted-foreground capitalize">{rangeLabel}</p>
      </div>
      <DateRangePicker
        from={from}
        to={to}
        onApply={(desde, hasta) => {
          setFrom(desde ?? startOfMonth(new Date()));
          setTo(hasta ?? endOfDay(desde ?? new Date()));
        }}
        placeholder={t("closers.selectDates")}
      />
    </div>
  );

  if (selectedEmp) {
    return (
      <div className="space-y-6">
        {dateBar}
        <EmployeeActivityDetail emp={selectedEmp} from={from} to={to} onBack={() => setSelectedEmp(null)} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {dateBar}

      {/* KPIs de supervisión */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatChip label={t("closers.contacts")} value={totals.contacts} icon={<Activity className="h-3.5 w-3.5" />} color="bg-primary" hint={t("closers.activity.contactsHint")} />
        <StatChip label={t("closers.activity.touched")} value={totals.touched} icon={<Users className="h-3.5 w-3.5" />} color="bg-primary" hint={t("closers.activity.touchedHint")} />
        <StatChip label={t("closers.activity.overdueLeads")} value={totals.overdue} icon={<AlertTriangle className="h-3.5 w-3.5" />} color="bg-destructive" hint={t("closers.activity.overdueLeadsHint")} />
        <StatChip label={t("closers.activity.noMgmtClosers")} value={totals.sinGestion} icon={<UserX className="h-3.5 w-3.5" />} color="bg-warning" hint={t("closers.activity.noMgmtClosersHint")} />
      </div>

      {/* Leyenda */}
      <p className="text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground/80">{t("common.status")}:</span>{" "}
        <span className="text-destructive">● {t("closers.activity.state.noMgmt")}</span> {t("closers.activity.legendNoMgmt")}{" "}
        <span className="text-warning">● {t("closers.activity.state.late")}</span> {t("closers.activity.legendLate")}{" "}
        <span className="text-success">● {t("closers.activity.state.ok")}</span> {t("closers.activity.legendOk")}{"  "}
        <span className="font-medium text-foreground/80">Auto</span> {t("closers.activity.legendAuto")}
      </p>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead>{t("closers.activity.employee")}</TableHead>
                <TableHead className="text-right">{t("closers.activity.assigned")}</TableHead>
                <TableHead className="text-right">{t("closers.activity.overdue")}</TableHead>
                <TableHead className="text-right">{t("closers.activity.touchedShort")}</TableHead>
                <TableHead className="text-right">{t("closers.contacts")}</TableHead>
                <TableHead>{t("closers.results")}</TableHead>
                <TableHead>{t("closers.activity.last")}</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}><TableCell colSpan={9}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
                ))
              ) : sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                    {t("closers.activity.empty")}
                    <br /><span className="text-xs">{t("closers.activity.emptyHint")}</span>
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map((r) => {
                  const est = estadoOf(r);
                  const meta = ESTADO_META[est];
                  return (
                    <TableRow key={r.employee_id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedEmp(r)}>
                      <TableCell><Badge variant={meta.variant} className="whitespace-nowrap">{t(meta.labelKey)}</Badge></TableCell>
                      <TableCell className="font-medium">{r.employee_name}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{r.leads_assigned}</TableCell>
                      <TableCell className={cn("text-right font-semibold tabular-nums", r.leads_overdue > 0 ? "text-destructive" : "text-muted-foreground")}>
                        {r.leads_overdue || "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{r.leads_touched}</TableCell>
                      <TableCell className="text-right">
                        <span className="font-bold tabular-nums">{r.total_contacts}</span>
                        {r.total_contacts > 0 && (
                          <span className="block text-[10px] text-muted-foreground">
                            {r.manual_contacts}m · {r.auto_contacts}a
                          </span>
                        )}
                      </TableCell>
                      <TableCell><CountChips data={r.by_result} labelOf={(k) => resultLabel(t, k)} /></TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {r.last_activity ? format(new Date(r.last_activity), "d MMM HH:mm", { locale: f.fechas }) : "—"}
                      </TableCell>
                      <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
};

// ── Tracking detallado de un empleado: resumen + timeline agrupado por día ──
const EmployeeActivityDetail = ({
  emp, from, to, onBack,
}: {
  emp: CloserActivityRow;
  from: Date;
  to: Date;
  onBack: () => void;
}) => {
  const f = useFormato();
  const { t } = useLanguage();
  const { data: contacts = [], isLoading } = useCloserActivityDetail(from, to, emp.employee_id);

  const byDay = useMemo(() => {
    const groups = new Map<string, CloserActivityDetailRow[]>();
    for (const c of contacts) {
      const key = format(new Date(c.contact_date), "yyyy-MM-dd");
      const arr = groups.get(key) ?? [];
      arr.push(c);
      groups.set(key, arr);
    }
    return Array.from(groups.entries());
  }, [contacts]);

  const stats = [
    { label: t("closers.activity.assigned"), value: emp.leads_assigned },
    { label: t("closers.activity.overdue"), value: emp.leads_overdue, danger: emp.leads_overdue > 0 },
    { label: t("closers.contacts"), value: emp.total_contacts },
    { label: t("closers.activity.touched"), value: emp.leads_touched },
    { label: t("closers.activity.activeDays"), value: byDay.length },
  ];

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="-ml-2 h-8 text-muted-foreground" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" /> {t("common.back")}
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-bold">{emp.employee_name}</h3>
          <div className="flex flex-wrap gap-4">
            {stats.map((s) => (
              <div key={s.label} className="text-right">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className={cn("text-lg font-bold tabular-nums leading-tight", s.danger && "text-destructive")}>{s.value}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t("closers.activity.channels")}</span>
            <CountChips data={emp.by_channel} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t("closers.results")}</span>
            <CountChips data={emp.by_result} labelOf={(k) => resultLabel(t, k)} />
          </div>
        </div>
      </div>

      <Card className="p-4">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
          </div>
        ) : contacts.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("closers.activity.noContacts")}</p>
        ) : (
          <div className="space-y-6">
            {byDay.map(([dayKey, dayRows]) => (
              <div key={dayKey}>
                <div className="mb-2 flex items-center gap-2">
                  <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold capitalize">
                    {format(new Date(dayRows[0].contact_date), f.idioma === "en" ? "EEEE, MMMM d" : "EEEE d 'de' MMMM", { locale: f.fechas })}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{t(dayRows.length === 1 ? "closers.activity.contactsOne" : "closers.activity.contactsMany", { n: dayRows.length })}</span>
                </div>
                <div className="space-y-0 pl-1">
                  {dayRows.map((c, idx) => {
                    const Icon = channelIcon(c.channel);
                    const url = igUrl(c.lead_handle);
                    const money = fmtMoney(Number(c.lead_monetization ?? 0));
                    const showNote = c.notes && c.notes !== "(auto)";
                    return (
                      <div key={c.contact_id} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-border bg-background", c.is_auto ? "text-warning" : "text-muted-foreground")}>
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          {idx < dayRows.length - 1 && <div className="min-h-[16px] w-px flex-1 bg-border" />}
                        </div>
                        <div className="min-w-0 flex-1 pb-4 pt-0.5">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {format(new Date(c.contact_date), "HH:mm")}
                            </span>
                            {url ? (
                              <a href={url} target="_blank" rel="noopener noreferrer"
                                 className="inline-flex items-center gap-0.5 text-sm font-medium text-primary hover:underline">
                                @{c.lead_handle} <ExternalLink className="h-3 w-3 opacity-60" />
                              </a>
                            ) : (
                              <span className="text-sm font-medium">{c.lead_handle ?? t("closers.noHandleParen")}</span>
                            )}
                            {c.is_auto && (
                              <Badge variant="warning-soft" className="h-5 gap-1 text-[10px]"><Bot className="h-3 w-3" /> Auto</Badge>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            {c.channel && <Badge variant="secondary" className="h-5 text-[11px]">{c.channel}</Badge>}
                            {c.result && <Badge variant={resultVariant(c.result)} className="h-5 text-[11px]">{resultLabel(t, c.result)}</Badge>}
                            {c.lead_stage && c.lead_stage !== "Asignada" && <Badge variant="outline" className="h-5 text-[11px]">{stageLabel(t, c.lead_stage)}</Badge>}
                            {c.lead_category && <span className="text-[11px] text-muted-foreground">cat. {c.lead_category}</span>}
                            {money && <span className="text-[11px] font-medium tabular-nums text-success">{money}</span>}
                          </div>
                          {showNote && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{c.notes}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

export default ClosersActivityDashboard;
