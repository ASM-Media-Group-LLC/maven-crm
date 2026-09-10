import { ChevronLeft, ChevronRight, CheckCircle2, Clock, SkipForward } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { DailyAssignment } from "@/hooks/useSpammerTasks";

// ─── Props ────────────────────────────────────────────────────────────────

interface DailyProgressProps {
  assignments: DailyAssignment[];
  selectedDate: string; // "YYYY-MM-DD"
  onDateChange: (date: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function addDays(dateStr: string, delta: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

function formatDisplayDate(dateStr: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = addDays(today, -1);
  if (dateStr === today) return "Hoy";
  if (dateStr === yesterday) return "Ayer";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" });
}

// ─── Component ────────────────────────────────────────────────────────────

export const DailyProgress = ({ assignments, selectedDate, onDateChange }: DailyProgressProps) => {
  const total = assignments.length;
  const done = assignments.filter((a) => a.status === "done").length;
  const skipped = assignments.filter((a) => a.status === "skipped").length;
  const pending = assignments.filter(
    (a) => a.status === "pending" || a.status === "in_progress",
  ).length;

  // Progress is based on settled (done + skipped) out of the expected 50
  const target = Math.max(total, 50);
  const settled = done + skipped;
  const pct = target > 0 ? Math.round((settled / target) * 100) : 0;

  const isToday = selectedDate === new Date().toISOString().slice(0, 10);

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      {/* ── Date navigation ── */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => onDateChange(addDays(selectedDate, -1))}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border transition-colors hover:bg-muted"
          aria-label="Día anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <span className="text-sm font-semibold text-foreground">
          {formatDisplayDate(selectedDate)}
        </span>

        <button
          type="button"
          onClick={() => onDateChange(addDays(selectedDate, 1))}
          disabled={isToday}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border transition-colors hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Día siguiente"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* ── Progress bar ── */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {settled}/{target} completadas
          </span>
          <span>{pct}%</span>
        </div>
        <Progress
          value={pct}
          className="h-2.5 bg-muted/40"
          indicatorClassName={
            pct === 100
              ? "bg-success"
              : pct >= 50
              ? "bg-primary"
              : "bg-primary"
          }
        />
      </div>

      {/* ── Stats pills ── */}
      <div className="flex flex-wrap gap-2">
        <StatPill
          icon={<CheckCircle2 className="h-3.5 w-3.5 text-success" />}
          label="Listas"
          value={done}
          color="emerald"
        />
        <StatPill
          icon={<Clock className="h-3.5 w-3.5 text-warning" />}
          label="Pendientes"
          value={pending}
          color="amber"
        />
        <StatPill
          icon={<SkipForward className="h-3.5 w-3.5 text-muted-foreground" />}
          label="Saltadas"
          value={skipped}
          color="zinc"
        />
      </div>
    </div>
  );
};

// ─── Sub-component ────────────────────────────────────────────────────────

const COLOR_MAP: Record<string, string> = {
  emerald: "border-success/30 bg-success/10 text-success",
  amber: "border-warning/30 bg-warning/10 text-warning",
  zinc: "border-border bg-muted text-muted-foreground",
};

const StatPill = ({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: "emerald" | "amber" | "zinc";
}) => (
  <div
    className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${COLOR_MAP[color]}`}
  >
    {icon}
    <span>{value}</span>
    <span className="text-muted-foreground font-normal">{label}</span>
  </div>
);
