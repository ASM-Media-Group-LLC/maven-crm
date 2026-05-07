import { useState, useMemo } from "react";
import { Loader2, ClipboardList, RefreshCw } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DailyProgress } from "@/components/scouter/DailyProgress";
import { TaskCard } from "@/components/scouter/TaskCard";
import { ManagerDashboard } from "@/components/scouter/ManagerDashboard";
import SpammerOnboarding from "@/pages/scouter/SpammerOnboarding";
import { useSpammerAccounts } from "@/hooks/useSpammerAccounts";
import { useDailyAssignments, useGenerateTasks, TOP_UP_TARGET } from "@/hooks/useSpammerTasks";
import { useUserRole } from "@/hooks/useUserRole";
import type { DailyAssignment } from "@/hooks/useSpammerTasks";

// ─── Helpers ──────────────────────────────────────────────────────────────

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Filter bar ───────────────────────────────────────────────────────────

type StatusFilter = "all" | "pending" | "done" | "skipped";

const STATUS_FILTER_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all",     label: "Todos los estados" },
  { value: "pending", label: "Pendientes" },
  { value: "done",    label: "Completadas" },
  { value: "skipped", label: "Saltadas" },
];

const STRATEGY_OPTIONS = [
  { value: "all",           label: "Todas las estrategias" },
  { value: "warm_approach", label: "Warm approach" },
  { value: "cold_follow",   label: "Cold follow" },
  { value: "multi_account", label: "Multi cuenta" },
  { value: "re_engage",     label: "Re-engage" },
];

// ─── Component ────────────────────────────────────────────────────────────

const MisTareas = () => {
  const [selectedDate, setSelectedDate] = useState<string>(todayIso());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [strategyFilter, setStrategyFilter] = useState<string>("all");

  const accountsQ = useSpammerAccounts();
  const assignmentsQ = useDailyAssignments(selectedDate);
  const { isAdmin, isManager, isSupervisor, isLoading: roleLoading } = useUserRole();

  const accounts = accountsQ.data ?? [];
  const assignments = assignmentsQ.data ?? [];

  // Build unique account options from the tasks in assignments
  const accountOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const a of assignments) {
      for (const t of a.tasks ?? []) {
        if (t.from_account && !seen.has(t.from_account.id)) {
          seen.set(t.from_account.id, t.from_account.instagram_handle);
        }
      }
    }
    return Array.from(seen.entries()).map(([id, handle]) => ({ id, handle }));
  }, [assignments]);

  // Apply filters
  const filtered = useMemo<DailyAssignment[]>(() => {
    return assignments.filter((a) => {
      // Status filter: map in_progress to pending bucket
      if (statusFilter !== "all") {
        const effective =
          a.status === "in_progress" ? "pending" : a.status;
        if (effective !== statusFilter) return false;
      }

      // Account filter: any task from the selected account
      if (accountFilter !== "all") {
        const hasAccount = (a.tasks ?? []).some(
          (t) => t.from_account_id === accountFilter,
        );
        if (!hasAccount) return false;
      }

      // Strategy filter
      if (strategyFilter !== "all" && a.ai_strategy !== strategyFilter) {
        return false;
      }

      return true;
    });
  }, [assignments, statusFilter, accountFilter, strategyFilter]);

  const isManagerRole = isAdmin || isManager || isSupervisor;

  // Top-up: count assignments not finished yet (pending + in_progress).
  // We only show the button on today's date — no point topping up a past day.
  const pendingCount = useMemo(
    () =>
      assignments.filter(
        (a) => a.status === "pending" || a.status === "in_progress",
      ).length,
    [assignments],
  );
  const isToday = selectedDate === todayIso();
  const generateTasks = useGenerateTasks();
  const canTopUp = isToday && pendingCount < TOP_UP_TARGET;

  // Loading state
  if (accountsQ.isLoading || roleLoading) {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Cargando...</span>
      </div>
    );
  }

  // Onboarding gate: if spammer has no registered accounts, show wizard
  // Managers/admins bypass the gate since they may have 0 accounts themselves
  if (accounts.length === 0 && !isManagerRole) {
    return <SpammerOnboarding />;
  }

  return (
    <div className="space-y-5">
      {/* DailyProgress */}
      <DailyProgress
        assignments={assignments}
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
      />

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Status filter */}
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as StatusFilter)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTER_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Account filter */}
        <Select value={accountFilter} onValueChange={setAccountFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Cuenta spammer" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las cuentas</SelectItem>
            {accountOptions.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                @{a.handle}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Strategy filter */}
        <Select value={strategyFilter} onValueChange={setStrategyFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Estrategia" />
          </SelectTrigger>
          <SelectContent>
            {STRATEGY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {assignmentsQ.isLoading
            ? "Cargando..."
            : `${filtered.length} tarea${filtered.length === 1 ? "" : "s"}`}
        </span>

        {/* Top-up button — only visible to non-managers (a manager
            looking at this view typically isn't the assignee), only on
            today's date, and disabled when already at target. The
            mutation passes the current pending count and asks the edge
            function to generate (TOP_UP_TARGET - pending) new assignments. */}
        {!isManagerRole && isToday && (
          <Button
            size="sm"
            variant={canTopUp ? "default" : "outline"}
            disabled={!canTopUp || generateTasks.isPending}
            onClick={() => generateTasks.mutate(pendingCount)}
            className="ml-auto gap-2"
            title={
              !canTopUp
                ? `Ya tenés ${pendingCount}/${TOP_UP_TARGET} tareas pendientes`
                : `Generar ${TOP_UP_TARGET - pendingCount} tareas más`
            }
          >
            {generateTasks.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            <span className="text-xs">
              Llenar a {TOP_UP_TARGET}
              <span className="ml-1 opacity-70">
                ({pendingCount}/{TOP_UP_TARGET})
              </span>
            </span>
          </Button>
        )}
      </div>

      {/* Task list */}
      {assignmentsQ.isLoading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Cargando tareas...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-10 text-center space-y-2">
          <ClipboardList className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium">
            {assignments.length === 0
              ? "No hay tareas para hoy"
              : "Sin tareas con los filtros aplicados"}
          </p>
          {assignments.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Un admin debe generar la asignación diaria desde Settings.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((assignment) => (
            <TaskCard
              key={assignment.id}
              assignment={assignment}
              accounts={accounts}
            />
          ))}
        </div>
      )}

      {/* Manager dashboard section — visible only to admin/manager/supervisor */}
      {isManagerRole && (
        <div className="pt-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
            Vista de manager
          </div>
          <ManagerDashboard date={selectedDate} onDateChange={setSelectedDate} />
        </div>
      )}
    </div>
  );
};

export default MisTareas;
