import { useEffect, useState, useMemo } from "react";
import { Loader2, ClipboardList, RefreshCw, Hourglass } from "lucide-react";
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
import {
  getTopUpCooldownRemaining,
  useDailyAssignments,
  useGenerateTasks,
  TOP_UP_TARGET,
} from "@/hooks/useSpammerTasks";
import { useUserRole } from "@/hooks/useUserRole";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import type { DailyAssignment } from "@/hooks/useSpammerTasks";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";

// ─── Helpers ──────────────────────────────────────────────────────────────

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Filter bar ───────────────────────────────────────────────────────────

type StatusFilter = "all" | "pending" | "done" | "skipped";

// `value` es el status / ai_strategy que viene de la base: no se traduce.
const STATUS_FILTER_OPTIONS: Array<{ value: StatusFilter; labelKey: TranslationKey }> = [
  { value: "all",     labelKey: "common.allStatuses" },
  { value: "pending", labelKey: "common.pendingPl" },
  { value: "done",    labelKey: "scouter.tasks.completed" },
  { value: "skipped", labelKey: "scouter.tasks.skipped" },
];

// Las estrategias que se dicen igual en inglés quedan como texto (`label`).
const STRATEGY_OPTIONS: Array<{ value: string; label?: string; labelKey?: TranslationKey }> = [
  { value: "all",           labelKey: "scouter.tasks.allStrategies" },
  { value: "warm_approach", label: "Warm approach" },
  { value: "cold_follow",   label: "Cold follow" },
  { value: "multi_account", labelKey: "scouter.strategy.multiAccount" },
  { value: "re_engage",     label: "Re-engage" },
];

// ─── Component ────────────────────────────────────────────────────────────

const MisTareas = () => {
  // Arriba de todo: el componente sale antes (cargando / onboarding).
  const { t } = useLanguage();
  const [selectedDate, setSelectedDate] = useState<string>(todayIso());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [strategyFilter, setStrategyFilter] = useState<string>("all");

  const accountsQ = useSpammerAccounts();
  const assignmentsQ = useDailyAssignments(selectedDate);
  const { isAdmin, isLoading: roleLoading } = useUserRole();
  const { dataScope } = usePermissions();

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

  // Vista de gestión = "Permisos de datos" de Scouter Assist, no el nombre del rol
  // (08/09). Con nombres literales, Operations Sales y Closer + quedaban afuera
  // aunque tuvieran "Todos los datos". El admin entra siempre; la RLS decide qué
  // filas llegan (has_scouter_global_scope / has_scouter_team_scope).
  const isManagerRole = isAdmin || dataScope("Scouter Assist") !== "self";

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
  const { user } = useAuth();

  // Cooldown del botón "Generar tareas" — 5h después de cada uso
  // exitoso. Usamos un tick que se actualiza cada minuto para que el
  // contador se refresque sin polling agresivo. La fuente de verdad
  // está en localStorage por user_id (ver useSpammerTasks).
  const [cooldownTick, setCooldownTick] = useState(0);
  const cooldownRemainingMs = useMemo(
    () => getTopUpCooldownRemaining(user?.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.id, cooldownTick, generateTasks.isSuccess],
  );
  useEffect(() => {
    if (cooldownRemainingMs <= 0) return;
    const t = setInterval(() => setCooldownTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, [cooldownRemainingMs]);

  const canTopUp =
    isToday && pendingCount < TOP_UP_TARGET && cooldownRemainingMs === 0;

  // Formato compacto: "4h 23m" o "23m" si queda <1h.
  const fmtCooldown = (ms: number): string => {
    if (ms <= 0) return "";
    const totalMin = Math.ceil(ms / 60_000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  // Loading state
  if (accountsQ.isLoading || roleLoading) {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">{t("common.loading")}</span>
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
            <SelectValue placeholder={t("common.status")} />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTER_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {t(o.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Account filter */}
        <Select value={accountFilter} onValueChange={setAccountFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder={t("scouter.tasks.spammerAccount")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("scouter.tasks.allAccounts")}</SelectItem>
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
            <SelectValue placeholder={t("scouter.tasks.strategy")} />
          </SelectTrigger>
          <SelectContent>
            {STRATEGY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.labelKey ? t(o.labelKey) : o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {assignmentsQ.isLoading
            ? t("common.loading")
            : t(filtered.length === 1 ? "scouter.tasks.countOne" : "scouter.tasks.countOther", { count: filtered.length })}
        </span>

        {/* Top-up button — only visible to non-managers (a manager
            looking at this view typically isn't the assignee), only on
            today's date, disabled cuando ya alcanzó el target o cuando
            está en cooldown 5h post-uso. El cooldown se muestra como
            "Espera 4h 23m" en el botón. */}
        {!isManagerRole && isToday && (
          <Button
            size="sm"
            variant={canTopUp ? "default" : "outline"}
            disabled={!canTopUp || generateTasks.isPending}
            onClick={() => generateTasks.mutate(pendingCount)}
            className="ml-auto gap-2"
            title={
              cooldownRemainingMs > 0
                ? t("scouter.tasks.cooldownTitle", { time: fmtCooldown(cooldownRemainingMs) })
                : !canTopUp
                  ? t("scouter.tasks.fullTitle", { pending: pendingCount, target: TOP_UP_TARGET })
                  : t("scouter.tasks.generateTitle", { count: TOP_UP_TARGET - pendingCount })
            }
          >
            {generateTasks.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : cooldownRemainingMs > 0 ? (
              <Hourglass className="h-3.5 w-3.5" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            <span className="text-xs">
              {cooldownRemainingMs > 0 ? (
                <>{t("scouter.tasks.wait", { time: fmtCooldown(cooldownRemainingMs) })}</>
              ) : (
                <>
                  {t("scouter.tasks.fillTo", { target: TOP_UP_TARGET })}
                  <span className="ml-1 opacity-70">
                    ({pendingCount}/{TOP_UP_TARGET})
                  </span>
                </>
              )}
            </span>
          </Button>
        )}
      </div>

      {/* Task list */}
      {assignmentsQ.isLoading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">{t("scouter.tasks.loading")}</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-10 text-center space-y-2">
          <ClipboardList className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium">
            {assignments.length === 0
              ? t("scouter.tasks.noneToday")
              : t("scouter.tasks.noneFiltered")}
          </p>
          {assignments.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {t("scouter.tasks.noneTodayHint")}
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
          <div className="text-xs font-bold text-muted-foreground mb-3">
            {t("scouter.tasks.managerView")}
          </div>
          <ManagerDashboard date={selectedDate} onDateChange={setSelectedDate} />
        </div>
      )}
    </div>
  );
};

export default MisTareas;
