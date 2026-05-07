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

// ─── Helpers ──────────────────────────────────────────────────────────────

function addDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

function formatDisplayDate(dateStr: string): string {
  const today = new Date().toISOString().slice(0, 10);
  if (dateStr === today) return "Hoy";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" });
}

// ─── Props ────────────────────────────────────────────────────────────────

interface ManagerDashboardProps {
  date: string; // "YYYY-MM-DD"
  onDateChange: (date: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────

export const ManagerDashboard = ({ date, onDateChange }: ManagerDashboardProps) => {
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
          <h3 className="text-sm font-semibold">Progreso del equipo</h3>
        </div>

        {/* Date navigation */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onDateChange(addDays(date, -1))}
            className="flex h-7 w-7 items-center justify-center rounded border border-border transition-colors hover:bg-muted"
            aria-label="Día anterior"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[80px] text-center text-xs font-medium text-muted-foreground">
            {formatDisplayDate(date)}
          </span>
          <button
            type="button"
            onClick={() => onDateChange(addDays(date, 1))}
            disabled={isToday}
            className="flex h-7 w-7 items-center justify-center rounded border border-border transition-colors hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Día siguiente"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ── Table ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Cargando...</span>
        </div>
      ) : !rows || rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
          <Users className="h-8 w-8 mb-2 opacity-30" />
          <p className="text-sm">Sin datos para este día</p>
        </div>
      ) : (
        <Table containerClassName="rounded-lg border border-border overflow-hidden">
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="text-xs">Spammer</TableHead>
              <TableHead className="text-xs text-right">Asignadas</TableHead>
              <TableHead className="text-xs text-right">Completadas</TableHead>
              <TableHead className="text-xs text-right">Pendientes</TableHead>
              <TableHead className="text-xs min-w-[120px]">% Completado</TableHead>
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
                      <span className="text-muted-foreground italic text-xs">Sin nombre</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {row.total_tasks}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-emerald-400">
                    {row.completed_tasks}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-amber-400">
                    {row.pending_tasks}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress
                        value={pct}
                        className="h-1.5 flex-1 bg-muted/40"
                        indicatorClassName={
                          pct === 100
                            ? "bg-emerald-500"
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
