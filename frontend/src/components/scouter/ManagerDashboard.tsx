import { useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Users } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { useSpammerProgress } from "@/hooks/useSpammerProgress";
import { useUserRole } from "@/hooks/useUserRole";
import { SpammerDetailModal } from "./SpammerDetailModal";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";

// ─── Helpers ──────────────────────────────────────────────────────────────

function addDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

function formatDisplayDate(
  dateStr: string,
  t: (key: TranslationKey) => string,
  enIngles: boolean,
): string {
  const today = new Date().toISOString().slice(0, 10);
  if (dateStr === today) return t("common.today");
  const d = new Date(dateStr + "T00:00:00");
  // "es" a secas es el que ya usaba: en español no cambia nada.
  return d.toLocaleDateString(enIngles ? "en-US" : "es", { weekday: "short", day: "numeric", month: "short" });
}

// ─── Props ────────────────────────────────────────────────────────────────

interface ManagerDashboardProps {
  date: string; // "YYYY-MM-DD"
  onDateChange: (date: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────

export const ManagerDashboard = ({ date, onDateChange }: ManagerDashboardProps) => {
  // Arriba de todo: el componente sale antes (`return null`) según el rol.
  const { t, language } = useLanguage();
  const { role, isLoading: roleLoading } = useUserRole();
  const { data: rows, isLoading } = useSpammerProgress(date);
  const [selectedSpammer, setSelectedSpammer] = useState<{
    id: string;
    name: string | null;
  } | null>(null);

  const isToday = date === new Date().toISOString().slice(0, 10);

  // Gate: only admin, manager, supervisor can view
  if (roleLoading) return null;
  if (!role || !["admin", "manager", "supervisor"].includes(role)) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">{t("scouter.teamProgress")}</h3>
        </div>

        {/* Date navigation */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onDateChange(addDays(date, -1))}
            className="flex h-7 w-7 items-center justify-center rounded border border-border transition-colors hover:bg-muted"
            aria-label={t("scouter.progress.previousDay")}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[80px] text-center text-xs font-medium text-muted-foreground">
            {formatDisplayDate(date, t, language === "en")}
          </span>
          <button
            type="button"
            onClick={() => onDateChange(addDays(date, 1))}
            disabled={isToday}
            className="flex h-7 w-7 items-center justify-center rounded border border-border transition-colors hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label={t("scouter.progress.nextDay")}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ── Table ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">{t("common.loading")}</span>
        </div>
      ) : !rows || rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
          <Users className="h-8 w-8 mb-2 opacity-30" />
          <p className="text-sm">{t("scouter.progress.noData")}</p>
        </div>
      ) : (
        <Table containerClassName="rounded-lg border border-border overflow-hidden">
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="text-xs">Spammer</TableHead>
              <TableHead className="text-xs text-right">{t("scouter.progress.col.assigned")}</TableHead>
              <TableHead className="text-xs text-right">{t("scouter.tasks.completed")}</TableHead>
              <TableHead className="text-xs text-right">{t("common.pendingPl")}</TableHead>
              <TableHead className="text-xs min-w-[120px]">{t("scouter.progress.col.completion")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const pct = Math.round(row.completion_rate * 100);
              return (
                <TableRow
                  key={row.spammer_id}
                  className="cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() =>
                    setSelectedSpammer({
                      id: row.spammer_id,
                      name: row.spammer_name,
                    })
                  }
                >
                  <TableCell className="text-sm font-medium">
                    {row.spammer_name ?? (
                      <span className="text-muted-foreground italic text-xs">{t("scouter.noName")}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {row.total_tasks}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-success">
                    {row.completed_tasks}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-warning">
                    {row.pending_tasks}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress
                        value={pct}
                        className="h-1.5 flex-1 bg-muted/40"
                        indicatorClassName={
                          pct === 100
                            ? "bg-success"
                            : pct >= 50
                            ? "bg-sky-500"
                            : "bg-primary"
                        }
                      />
                      <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                        {pct}%
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {/* Drill-down modal */}
      <SpammerDetailModal
        open={!!selectedSpammer}
        onOpenChange={(o) => !o && setSelectedSpammer(null)}
        spammerId={selectedSpammer?.id ?? null}
        spammerName={selectedSpammer?.name ?? null}
        date={date}
      />
    </div>
  );
};
