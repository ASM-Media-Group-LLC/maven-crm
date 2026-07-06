import { useState, useMemo } from "react";
import { startOfMonth, endOfDay, format } from "date-fns";
import { es } from "date-fns/locale";
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
import KpiCard from "@/components/dashboard/KpiCard";
import { cn } from "@/lib/utils";
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

const ESTADO_META: Record<Estado, { label: string; variant: BadgeProps["variant"]; prio: number }> = {
  sin_gestion: { label: "Sin gestión", variant: "destructive-soft", prio: 0 },
  atrasado:    { label: "Atrasado",    variant: "warning-soft",     prio: 1 },
  al_dia:      { label: "Al día",      variant: "success-soft",     prio: 2 },
  sin_leads:   { label: "Sin leads",   variant: "secondary",        prio: 3 },
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

// Chips de conteo por categoría (canal o resultado): "WhatsApp 12".
const CountChips = ({ data }: { data: Record<string, number> }) => {
  const entries = Object.entries(data ?? {}).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([k, n]) => (
        <span key={k} className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium">
          {k}
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
      ? format(from, "EEEE d 'de' MMMM", { locale: es })
      : `${format(from, "d MMM", { locale: es })} – ${format(to, "d MMM yyyy", { locale: es })}`;

  const dateBar = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold">Actividad y gestión de closers</h3>
        <p className="text-xs text-muted-foreground capitalize">{rangeLabel}</p>
      </div>
      <DateRangePicker
        from={from}
        to={to}
        onApply={(f, t) => {
          setFrom(f ?? startOfMonth(new Date()));
          setTo(t ?? endOfDay(f ?? new Date()));
        }}
        placeholder="Seleccionar fechas"
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
        <KpiCard label="Contactos" value={totals.contacts} icon={Activity} color="bg-blue-500" subtitle="Registrados en el rango" />
        <KpiCard label="Leads tocados" value={totals.touched} icon={Users} color="bg-violet-500" subtitle="Leads distintos contactados" />
        <KpiCard label="Leads vencidos" value={totals.overdue} icon={AlertTriangle} color="bg-rose-500" subtitle="Contacto fuera de cadencia" />
        <KpiCard label="Closers sin gestión" value={totals.sinGestion} icon={UserX} color="bg-amber-500" subtitle="Todos sus leads vencidos" />
      </div>

      {/* Leyenda */}
      <p className="text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground/80">Estado:</span>{" "}
        <span className="text-rose-500">● Sin gestión</span> (≥75% de sus leads asignados vencidos) ·{" "}
        <span className="text-amber-500">● Atrasado</span> (algunos leads con contacto vencido por cadencia) ·{" "}
        <span className="text-emerald-500">● Al día</span> (sin vencidos).{"  "}
        <span className="font-medium text-foreground/80">Auto</span> = contacto registrado solo al escribir desde la bandeja WA/TG.
      </p>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Estado</TableHead>
                <TableHead>Empleado</TableHead>
                <TableHead className="text-right">Asignados</TableHead>
                <TableHead className="text-right">Vencidos</TableHead>
                <TableHead className="text-right">Tocados</TableHead>
                <TableHead className="text-right">Contactos</TableHead>
                <TableHead>Resultados</TableHead>
                <TableHead>Última</TableHead>
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
                    Sin closers ni actividad en este rango.
                    <br /><span className="text-xs">Probá ampliar las fechas arriba a la derecha.</span>
                  </TableCell>
                </TableRow>
              ) : (
                sorted.map((r) => {
                  const est = estadoOf(r);
                  const meta = ESTADO_META[est];
                  return (
                    <TableRow key={r.employee_id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedEmp(r)}>
                      <TableCell><Badge variant={meta.variant} className="whitespace-nowrap">{meta.label}</Badge></TableCell>
                      <TableCell className="font-medium">{r.employee_name}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{r.leads_assigned}</TableCell>
                      <TableCell className={cn("text-right font-semibold tabular-nums", r.leads_overdue > 0 ? "text-rose-500" : "text-muted-foreground")}>
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
                      <TableCell><CountChips data={r.by_result} /></TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {r.last_activity ? format(new Date(r.last_activity), "d MMM HH:mm", { locale: es }) : "—"}
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
    { label: "Asignados", value: emp.leads_assigned },
    { label: "Vencidos", value: emp.leads_overdue, danger: emp.leads_overdue > 0 },
    { label: "Contactos", value: emp.total_contacts },
    { label: "Leads tocados", value: emp.leads_touched },
    { label: "Días activos", value: byDay.length },
  ];

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="-ml-2 h-8 text-muted-foreground" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Volver
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-bold">{emp.employee_name}</h3>
          <div className="flex flex-wrap gap-4">
            {stats.map((s) => (
              <div key={s.label} className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
                <p className={cn("text-lg font-bold tabular-nums leading-tight", s.danger && "text-rose-500")}>{s.value}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Canales</span>
            <CountChips data={emp.by_channel} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Resultados</span>
            <CountChips data={emp.by_result} />
          </div>
        </div>
      </div>

      <Card className="p-4">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
          </div>
        ) : contacts.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Sin contactos registrados en este rango.</p>
        ) : (
          <div className="space-y-6">
            {byDay.map(([dayKey, dayRows]) => (
              <div key={dayKey}>
                <div className="mb-2 flex items-center gap-2">
                  <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold capitalize">
                    {format(new Date(dayRows[0].contact_date), "EEEE d 'de' MMMM", { locale: es })}
                  </span>
                  <span className="text-[11px] text-muted-foreground">· {dayRows.length} contacto{dayRows.length === 1 ? "" : "s"}</span>
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
                          <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-border bg-background", c.is_auto ? "text-amber-500" : "text-muted-foreground")}>
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
                              <span className="text-sm font-medium">{c.lead_handle ?? "(sin handle)"}</span>
                            )}
                            {c.is_auto && (
                              <Badge variant="warning-soft" className="h-5 gap-1 text-[10px]"><Bot className="h-3 w-3" /> Auto</Badge>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            {c.channel && <Badge variant="secondary" className="h-5 text-[11px]">{c.channel}</Badge>}
                            {c.result && <Badge variant={resultVariant(c.result)} className="h-5 text-[11px]">{c.result}</Badge>}
                            {c.lead_stage && c.lead_stage !== "Asignada" && <Badge variant="outline" className="h-5 text-[11px]">{c.lead_stage}</Badge>}
                            {c.lead_category && <span className="text-[11px] text-muted-foreground">cat. {c.lead_category}</span>}
                            {money && <span className="text-[11px] font-medium tabular-nums text-emerald-600 dark:text-emerald-400">{money}</span>}
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
