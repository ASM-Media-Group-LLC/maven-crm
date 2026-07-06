import { useState, useMemo } from "react";
import { startOfToday, endOfDay, format } from "date-fns";
import { es } from "date-fns/locale";
import { Activity, Users, Hand, Bot, ChevronRight } from "lucide-react";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import KpiCard from "@/components/dashboard/KpiCard";
import {
  useCloserActivity, useCloserActivityDetail, type CloserActivityRow,
} from "../hooks/useCloserActivity";

// Chip de conteo por categoría (canal o resultado): "WhatsApp 12".
const CountChips = ({ data }: { data: Record<string, number> }) => {
  const entries = Object.entries(data ?? {}).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([k, n]) => (
        <span
          key={k}
          className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium"
        >
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
  // Estado de fecha PROPIO del dashboard (independiente del filtro de pipeline
  // del header, que es otra semántica). Default: hoy — es un "dashboard diario".
  const [from, setFrom] = useState<Date>(startOfToday());
  const [to, setTo] = useState<Date>(endOfDay(startOfToday()));

  const { data: rows = [], isLoading } = useCloserActivity(from, to, viewAsCloserId);
  const [detailEmp, setDetailEmp] = useState<CloserActivityRow | null>(null);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.contacts += Number(r.total_contacts) || 0;
        acc.leads += Number(r.leads_touched) || 0;
        acc.manual += Number(r.manual_contacts) || 0;
        acc.auto += Number(r.auto_contacts) || 0;
        return acc;
      },
      { contacts: 0, leads: 0, manual: 0, auto: 0 },
    );
  }, [rows]);

  const rangeLabel =
    format(from, "d MMM", { locale: es }) === format(to, "d MMM", { locale: es })
      ? format(from, "EEEE d 'de' MMMM", { locale: es })
      : `${format(from, "d MMM", { locale: es })} – ${format(to, "d MMM yyyy", { locale: es })}`;

  return (
    <div className="space-y-6">
      {/* Barra de fecha + subtítulo del rango */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Actividad de contactos</h3>
          <p className="text-xs text-muted-foreground capitalize">{rangeLabel}</p>
        </div>
        <DateRangePicker
          from={from}
          to={to}
          onApply={(f, t) => {
            // Sin selección → volver a "hoy" (no tiene sentido un dashboard
            // diario sin fecha).
            setFrom(f ?? startOfToday());
            setTo(t ?? endOfDay(f ?? startOfToday()));
          }}
          placeholder="Seleccionar fechas"
        />
      </div>

      {/* KPIs agregados del rango */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Contactos" value={totals.contacts} icon={Activity} color="bg-blue-500" />
        <KpiCard label="Leads contactados" value={totals.leads} icon={Users} color="bg-violet-500" />
        <KpiCard label="Manuales" value={totals.manual} icon={Hand} color="bg-emerald-500" />
        <KpiCard label="Automáticos" value={totals.auto} icon={Bot} color="bg-amber-500" subtitle="Desde la bandeja WA/TG" />
      </div>

      {/* Tabla por empleado */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empleado</TableHead>
                <TableHead className="text-right">Contactos</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">Manual</TableHead>
                <TableHead className="text-right">Auto</TableHead>
                <TableHead>Canales</TableHead>
                <TableHead>Resultados</TableHead>
                <TableHead>Última</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={9}><Skeleton className="h-6 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                    Sin actividad de contactos en este rango.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow
                    key={r.employee_id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setDetailEmp(r)}
                  >
                    <TableCell className="font-medium">{r.employee_name}</TableCell>
                    <TableCell className="text-right font-bold tabular-nums">{r.total_contacts}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{r.leads_touched}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{r.manual_contacts}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{r.auto_contacts}</TableCell>
                    <TableCell><CountChips data={r.by_channel} /></TableCell>
                    <TableCell><CountChips data={r.by_result} /></TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {r.last_activity ? format(new Date(r.last_activity), "d MMM HH:mm", { locale: es }) : "—"}
                    </TableCell>
                    <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <ActivityDetailDialog
        emp={detailEmp}
        from={from}
        to={to}
        onClose={() => setDetailEmp(null)}
      />
    </div>
  );
};

// ── Drill-down: cada contacto del empleado en el rango (canal/resultado/notas) ──
const ActivityDetailDialog = ({
  emp, from, to, onClose,
}: {
  emp: CloserActivityRow | null;
  from: Date;
  to: Date;
  onClose: () => void;
}) => {
  const { data: contacts = [], isLoading } = useCloserActivityDetail(from, to, emp?.employee_id ?? null);

  return (
    <Dialog open={!!emp} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{emp?.employee_name}</DialogTitle>
          <DialogDescription>
            {emp?.total_contacts} contacto{emp?.total_contacts === 1 ? "" : "s"} · {emp?.leads_touched} lead
            {emp?.leads_touched === 1 ? "" : "s"} en el rango seleccionado.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)
          ) : contacts.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Sin contactos registrados.</p>
          ) : (
            contacts.map((c) => (
              <div key={c.contact_id} className="rounded-xl border border-border p-3 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted-foreground">
                    {format(new Date(c.contact_date), "dd/MM/yyyy HH:mm")}
                  </span>
                  {c.lead_handle && <span className="font-medium">@{c.lead_handle}</span>}
                  {c.channel && <Badge variant="secondary">{c.channel}</Badge>}
                  {c.result && <Badge variant="outline">{c.result}</Badge>}
                  {c.is_auto && (
                    <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400">
                      <Bot className="mr-1 h-3 w-3" /> Auto
                    </Badge>
                  )}
                </div>
                {c.notes && c.notes !== "(auto)" && (
                  <p className="text-sm text-muted-foreground">{c.notes}</p>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ClosersActivityDashboard;
