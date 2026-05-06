import { useState, useMemo } from "react";
import { Loader2, ClipboardList, Plus, Instagram, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DailyProgress } from "@/components/scouter/DailyProgress";
import { TaskCard } from "@/components/scouter/TaskCard";
import { ManagerDashboard } from "@/components/scouter/ManagerDashboard";
import SpammerOnboarding from "@/pages/scouter/SpammerOnboarding";
import {
  useSpammerAccounts,
  useInsertSpammerAccount,
  type AccountNiche,
} from "@/hooks/useSpammerAccounts";
import { useDailyAssignments } from "@/hooks/useSpammerTasks";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
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

// ─── Add-account constants ────────────────────────────────────────────────

const MAX_ACCOUNTS = 4;
const IG_HANDLE_RE = /^[a-zA-Z0-9_.]{1,30}$/;
const NICHES: { value: AccountNiche; label: string }[] = [
  { value: "lifestyle", label: "Lifestyle" },
  { value: "fitness", label: "Fitness" },
  { value: "adult", label: "Adulto" },
  { value: "business", label: "Business" },
  { value: "mixed", label: "Mixto" },
];

// ─── Component ────────────────────────────────────────────────────────────

const MisTareas = () => {
  const [selectedDate, setSelectedDate] = useState<string>(todayIso());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [strategyFilter, setStrategyFilter] = useState<string>("all");

  // Add-account inline form state
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [newHandle, setNewHandle] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newNiche, setNewNiche] = useState<AccountNiche | "">("");

  const accountsQ = useSpammerAccounts();
  const assignmentsQ = useDailyAssignments(selectedDate);
  const insertAccount = useInsertSpammerAccount();
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

  // Add-account helpers
  const cleanedHandle = newHandle.trim().replace(/^@+/, "");
  const handleError =
    cleanedHandle.length > 0 && !IG_HANDLE_RE.test(cleanedHandle)
      ? "Solo letras, números, puntos y guiones bajos (máx 30)."
      : null;
  const canSaveAccount =
    cleanedHandle.length > 0 &&
    !handleError &&
    newDisplayName.trim().length > 0 &&
    newNiche !== "";
  const canAddMore = accounts.length > 0 && accounts.length < MAX_ACCOUNTS;

  const handleAddAccount = async () => {
    if (!canSaveAccount) return;
    try {
      await insertAccount.mutateAsync({
        instagram_handle: cleanedHandle,
        display_name: newDisplayName.trim(),
        account_niche: newNiche as AccountNiche,
      });
      setNewHandle("");
      setNewDisplayName("");
      setNewNiche("");
      setShowAddAccount(false);
      toast.success("Cuenta agregada correctamente");
    } catch {
      // toast shown by mutation onError
    }
  };

  const resetAddForm = () => {
    setShowAddAccount(false);
    setNewHandle("");
    setNewDisplayName("");
    setNewNiche("");
  };

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
      {/* DailyProgress + Add account button */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <DailyProgress
            assignments={assignments}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
          />
        </div>
        {canAddMore && !showAddAccount && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1 shrink-0 mt-1"
            onClick={() => setShowAddAccount(true)}
          >
            <Instagram className="h-3.5 w-3.5" />
            Agregar cuenta
          </Button>
        )}
      </div>

      {/* Inline add-account form */}
      {showAddAccount && (
        <div className="rounded-lg border border-dashed border-amber-400/40 bg-amber-400/5 p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-amber-400 flex items-center gap-1.5">
              <Instagram className="h-3.5 w-3.5" />
              Nueva cuenta de Instagram
            </p>
            <button
              type="button"
              onClick={resetAddForm}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Handle */}
          <div>
            <div className="flex items-center gap-0">
              <div className="flex h-8 items-center rounded-l-md border border-r-0 border-input bg-muted px-2.5 text-xs text-muted-foreground select-none">
                @
              </div>
              <Input
                value={newHandle}
                onChange={(e) => setNewHandle(e.target.value)}
                placeholder="handle_de_instagram"
                className={`h-8 text-xs rounded-l-none ${handleError ? "border-destructive" : ""}`}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
            {handleError && (
              <p className="mt-0.5 text-[10px] text-destructive">{handleError}</p>
            )}
          </div>

          {/* Display name + niche + save */}
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              value={newDisplayName}
              onChange={(e) => setNewDisplayName(e.target.value)}
              placeholder="Nombre descriptivo"
              className="h-8 text-xs flex-1 min-w-[140px]"
            />
            <Select value={newNiche} onValueChange={(v) => setNewNiche(v as AccountNiche)}>
              <SelectTrigger className="h-8 text-xs w-[120px]">
                <SelectValue placeholder="Nicho…" />
              </SelectTrigger>
              <SelectContent>
                {NICHES.map((n) => (
                  <SelectItem key={n.value} value={n.value} className="text-xs">
                    {n.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-8 text-xs gap-1"
              onClick={handleAddAccount}
              disabled={!canSaveAccount || insertAccount.isPending}
            >
              {insertAccount.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Plus className="h-3 w-3" />
              )}
              Guardar
            </Button>
          </div>

          <p className="text-[10px] text-muted-foreground">
            {accounts.length}/{MAX_ACCOUNTS} cuentas registradas
          </p>
        </div>
      )}

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
