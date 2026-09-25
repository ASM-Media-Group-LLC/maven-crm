// Tab "Alertas" de Scouter Assist — vista para managers que quieres ver
// rápido qué spammers están dejando tareas sin completar día a día.
// Cada fila = (spammer × día) con totales y la cantidad de tasks
// pendientes acumuladas.
//
// Lógica de rollover: el cron `scouter-generate-tasks` puede mover las
// assignments pending del día anterior al día actual antes de generar
// nuevas. Esta vista NO hace el rollover — solo lo refleja: los
// pending son las assignments que NO se completaron y siguen vivas.

import { useMemo, useState } from "react";
import { Loader2, AlertTriangle, ClipboardList } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSpammerAlerts } from "@/hooks/useSpammerTasks";
import { useFormato } from "@/hooks/useFormato";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";

const LOOKBACK_OPTIONS: Array<{ value: number; labelKey: TranslationKey }> = [
  { value: 1, labelKey: "common.today" },
  { value: 3, labelKey: "scouter.alerts.last3" },
  { value: 7, labelKey: "scouter.alerts.lastWeek" },
  { value: 30, labelKey: "scouter.alerts.lastMonth" },
];

const fmtDate = (iso: string, locale: string): string => {
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString(locale, {
      weekday: "short",
      day: "2-digit",
      month: "short",
    });
  } catch {
    return iso;
  }
};

const ScouterAlertas = () => {
  const { t } = useLanguage();
  const f = useFormato();
  const [lookback, setLookback] = useState(7);
  const alertsQ = useSpammerAlerts(lookback);
  const rows = alertsQ.data ?? [];

  // Solo nos interesan las filas con pending > 0 — las completadas al
  // 100% no son una alerta. Si quieres ver todo, usa el tab de Mis
  // Tareas con vista de manager.
  const alertRows = useMemo(() => rows.filter((r) => r.pending > 0), [rows]);

  // Stats agregadas para el header.
  const totalPendingTasks = alertRows.reduce((a, r) => a + r.pending_tasks, 0);
  const spammersWithBacklog = new Set(alertRows.map((r) => r.spammer_id)).size;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <h2 className="text-base font-semibold">{t("scouter.alerts.title")}</h2>
          {alertsQ.isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : (
            <span className="text-xs text-muted-foreground">
              {t(spammersWithBacklog === 1 ? "scouter.alerts.spammersOne" : "scouter.alerts.spammersOther", { count: spammersWithBacklog })} ·
              {" "}
              {t(totalPendingTasks === 1 ? "scouter.alerts.tasksOne" : "scouter.alerts.tasksOther", { count: totalPendingTasks })}
            </span>
          )}
        </div>
        <Select
          value={String(lookback)}
          onValueChange={(v) => setLookback(parseInt(v, 10))}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t("common.period")} />
          </SelectTrigger>
          <SelectContent>
            {LOOKBACK_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={String(o.value)}>
                {t(o.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border border-border bg-card">
        {alertsQ.isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : alertRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
            <ClipboardList className="h-7 w-7 text-muted-foreground/50" />
            <p className="text-sm font-medium">{t("scouter.alerts.empty")}</p>
            <p className="text-xs text-muted-foreground">
              {t("scouter.alerts.emptyHint")}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Spammer</TableHead>
                <TableHead>{t("common.day")}</TableHead>
                <TableHead className="text-right">{t("scouter.alerts.col.assignments")}</TableHead>
                <TableHead className="text-right">{t("scouter.tasks.completed")}</TableHead>
                <TableHead className="text-right">{t("common.pendingPl")}</TableHead>
                <TableHead className="text-right">{t("scouter.alerts.col.pendingTasks")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alertRows.map((r) => (
                <TableRow key={`${r.spammer_id}-${r.date}`}>
                  <TableCell className="font-medium">{r.spammer_name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {fmtDate(r.date, f.intl("es-ES"))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.total_assignments}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-success">
                    {r.done}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Badge
                      variant="outline"
                      className="border-warning/40 bg-warning/10 text-warning"
                    >
                      {r.pending}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {r.pending_tasks}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
};

export default ScouterAlertas;
