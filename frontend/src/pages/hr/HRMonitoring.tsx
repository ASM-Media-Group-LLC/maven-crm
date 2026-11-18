import { formatUI } from "@/lib/formatoHora";
import { useState, useMemo } from "react";
import {
  Users, TrendingUp, AlertTriangle, Clock, Search, ListIcon, LayoutGrid,
  RefreshCw, Settings, Eye, Monitor, Mouse, Keyboard, Wifi, WifiOff, Pause,
  CalendarDays, ChevronLeft, ChevronRight, Info, Loader2,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, subMonths, addMonths, isToday, isSameMonth } from "date-fns";
import { useFormato } from "@/hooks/useFormato";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserAvatar } from "@/components/UserAvatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { HRPageHeader } from "@/components/hr/HRPageHeader";
import { HRMetricCard } from "@/components/hr/HRMetricCard";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import AgentDetailView from "@/pages/hr/AgentDetailSheet";
import { useHubstaffData, type HubstaffAgent } from "@/hooks/useHubstaffData";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { DIAS_CORTOS } from "./etiquetasRrhh";

type T = (key: TranslationKey, params?: Record<string, string | number>) => string;

// useHubstaffData (hooks/, fuera de esta pantalla) arma "Última actividad" y el
// nombre de respaldo como TEXTO en español. Se reconocen sus formas exactas y se
// dicen en el idioma de la interfaz; cualquier otra cosa se muestra tal cual.
function ultimaActividad(texto: string, t: T): string {
  if (texto === "Ahora") return t("hr.mon.last.now");
  if (texto === "Sin actividad") return t("hr.mon.last.none");
  const min = /^Hace (\d+) min$/.exec(texto);
  if (min) return t("hr.mon.last.min", { n: min[1] });
  const hm = /^Hace (\d+)h (\d+)min$/.exec(texto);
  if (hm) return t("hr.mon.last.hoursMin", { h: hm[1], m: hm[2] });
  return texto;
}
const nombreAgente = (nombre: string, t: T) => (nombre === "Sin nombre" ? t("hr.noName") : nombre);

// ─── Constants ────────────────────────────────────────────────────────────────
// `value` es el estado que calcula useHubstaffData (DATO del filtro); lo que se ve es la clave.
const AGENT_STATUSES: { value: string; label: TranslationKey }[] = [
  { value: "activo", label: "hr.mon.status.active" },
  { value: "inactivo", label: "hr.mon.status.idle" },
  { value: "desconectado", label: "hr.mon.status.offline" },
  { value: "en_pausa", label: "hr.mon.status.paused" },
];

const STATUS_CONFIG: Record<string, { label: TranslationKey; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Wifi; dotColor: string }> = {
  activo: { label: "hr.mon.status.active", variant: "default", icon: Wifi, dotColor: "bg-success" },
  inactivo: { label: "hr.mon.status.idle", variant: "secondary", icon: WifiOff, dotColor: "bg-warning" },
  desconectado: { label: "hr.mon.status.offline", variant: "outline", icon: WifiOff, dotColor: "bg-muted-foreground/40" },
  en_pausa: { label: "hr.mon.status.paused", variant: "secondary", icon: Pause, dotColor: "bg-primary" },
};

// ─── Activity Bar ─────────────────────────────────────────────────────────────
function ActivityBar({ value }: { value: number }) {
  const color = value > 70 ? "bg-success" : value > 30 ? "bg-warning" : "bg-destructive";
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs font-medium text-muted-foreground w-9 text-right">{value}%</span>
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function AgentStatusBadge({ status }: { status: string }) {
  const { t } = useLanguage();
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.desconectado;
  const StatusIcon = cfg.icon;
  return (
    <Badge variant={cfg.variant} className="gap-1">
      <StatusIcon className="h-3 w-3" />
      {t(cfg.label)}
    </Badge>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyMonitoringState({ onConfigure }: { onConfigure: () => void }) {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
        <Monitor className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">{t("hr.mon.emptyTitle")}</h3>
      <p className="text-sm text-muted-foreground max-w-md mb-6">
        {t("hr.mon.emptyDesc")}
      </p>
      <Button onClick={onConfigure}>
        <Settings className="h-4 w-4 mr-2" />
        {t("hr.mon.configureHubstaff")}
      </Button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function HRMonitoring() {
  const { t } = useLanguage();
  const f = useFormato();
  const { toast } = useToast();
  const { agents, isLoading, config, isEmpty, refetch } = useHubstaffData();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [view, setView] = useState<"list" | "grid" | "calendar">("list");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [calMonth, setCalMonth] = useState(new Date());
  const [apiModalOpen, setApiModalOpen] = useState(false);
  const [orgId, setOrgId] = useState(config?.org_id ?? "");
  const [selectedAgent, setSelectedAgent] = useState<HubstaffAgent | null>(null);

  const filtered = useMemo(() => {
    return agents.filter((a) => {
      if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter && a.status !== statusFilter) return false;
      return true;
    });
  }, [agents, search, statusFilter]);

  // KPIs
  const activeCount = agents.filter((a) => a.status === "activo").length;
  const avgProductivity = agents.length > 0
    ? Math.round(agents.reduce((sum, a) => sum + (a.mouseActivity + a.keyboardActivity) / 2, 0) / agents.length)
    : 0;
  const alertCount = agents.filter((a) => a.alerts > 0).length;
  const totalHours = agents.reduce((sum, a) => sum + a.hoursToday, 0).toFixed(1);

  async function handleSaveConfig() {
    if (!config) return;
    const { error } = await supabase
      .from("hubstaff_config")
      .update({ org_id: orgId })
      .eq("id", config.id);
    if (error) {
      toast({ title: t("common.error"), description: t("hr.mon.configSaveError"), variant: "destructive" });
    } else {
      toast({ title: t("hr.mon.saved"), description: t("hr.mon.configSaved") });
      setApiModalOpen(false);
    }
  }

  if (selectedAgent) {
    return <AgentDetailView agent={selectedAgent} onBack={() => setSelectedAgent(null)} />;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-background px-6 py-4">
        <HRPageHeader
          title={t("hr.mon.title")}
          subtitle={t("hr.mon.subtitle")}
          actions={
            <>
              <Badge variant="outline" className={`gap-1.5 px-3 py-1.5 text-xs font-medium ${config?.sync_enabled ? "border-success/50 text-success bg-success/10" : "border-warning/50 text-warning bg-warning/10"}`}>
                <Wifi className="h-3 w-3" />
                {config?.sync_enabled ? t("hr.mon.hubstaffConnected") : t("hr.mon.hubstaffPending")}
              </Badge>
              <Button variant="outline" size="sm" onClick={() => { refetch(); toast({ title: t("hr.mon.refreshed") }); }}>
                <RefreshCw className="h-4 w-4 mr-1.5" />
                {t("hr.mon.refresh")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setApiModalOpen(true)}>
                <Settings className="h-4 w-4 mr-1.5" />
                {t("hr.mon.configureApi")}
              </Button>
            </>
          }
        />

        {!isEmpty && (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
              <HRMetricCard title={t("hr.mon.activeAgents")} value={`${activeCount}/${agents.length}`} icon={Users} color="primary" subtitle={t("hr.mon.connectedNow")} />
              <HRMetricCard title={t("hr.mon.productivityToday")} value={`${avgProductivity}%`} icon={TrendingUp} color="success" subtitle={t("hr.mon.overallAvg")} />
              <HRMetricCard title={t("hr.mon.activeAlerts")} value={alertCount} icon={AlertTriangle} color={alertCount > 0 ? "warning" : "default"} subtitle={t("hr.mon.agentsWithAlerts")} />
              <HRMetricCard title={t("hr.mon.totalHoursToday")} value={`${totalHours}h`} icon={Clock} color="default" subtitle={t("hr.mon.teamAccrued")} />
            </div>

            {/* Filters Row */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder={t("hr.mon.searchAgent")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Select value={statusFilter || undefined} onValueChange={(val) => setStatusFilter(val === "__all__" ? "" : val)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder={t("common.status")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t("common.all")}</SelectItem>
                  {AGENT_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{t(s.label)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <DateRangePicker from={dateFrom} to={dateTo} onApply={(desde, hasta) => { setDateFrom(desde); setDateTo(hasta); }} />
              <div className="ml-auto flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
                <Button size="sm" variant={view === "list" ? "secondary" : "ghost"} onClick={() => setView("list")}>
                  <ListIcon className="h-4 w-4" />
                </Button>
                <Button size="sm" variant={view === "grid" ? "secondary" : "ghost"} onClick={() => setView("grid")}>
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button size="sm" variant={view === "calendar" ? "secondary" : "ghost"} onClick={() => setView("calendar")}>
                  <CalendarDays className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : isEmpty ? (
          <EmptyMonitoringState onConfigure={() => setApiModalOpen(true)} />
        ) : view === "list" ? (
          <MonitoringTable agents={filtered} onSelectAgent={setSelectedAgent} />
        ) : view === "grid" ? (
          <MonitoringGrid agents={filtered} onSelectAgent={setSelectedAgent} />
        ) : (
          <MonitoringCalendar month={calMonth} onMonthChange={setCalMonth} />
        )}
      </div>

      {/* API Config Modal */}
      <Dialog open={apiModalOpen} onOpenChange={setApiModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("hr.mon.configTitle")}</DialogTitle>
            <DialogDescription>{t("hr.mon.configDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="org-id">Organization ID</Label>
              <Input id="org-id" placeholder={t("hr.mon.orgIdExample")} value={orgId} onChange={(e) => setOrgId(e.target.value)} />
            </div>

            {/* Connection status */}
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
              <div className={`h-3 w-3 rounded-full ${config?.sync_enabled ? "bg-success" : config?.api_token_set ? "bg-warning" : "bg-muted-foreground/40"}`} />
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {config?.sync_enabled ? t("hr.mon.connected") : config?.api_token_set ? t("hr.mon.tokenSetSyncOff") : t("hr.mon.pendingSetup")}
                </p>
                {config?.last_sync_at && (
                  <p className="text-xs text-muted-foreground">{t("hr.mon.lastSync", { when: formatUI(new Date(config.last_sync_at), f.idioma === "en" ? "MM/dd/yyyy HH:mm" : "dd/MM/yyyy HH:mm") })}</p>
                )}
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
              <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                {t("hr.mon.tokenNote")}
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => toast({ title: t("common.comingSoon"), description: t("hr.mon.testSoon") })}>
              {t("hr.mon.testConnection")}
            </Button>
            <Button onClick={handleSaveConfig}>{t("hr.mon.saveConfig")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Table View ───────────────────────────────────────────────────────────────
function MonitoringTable({ agents, onSelectAgent }: { agents: HubstaffAgent[]; onSelectAgent: (a: HubstaffAgent) => void }) {
  const { t } = useLanguage();
  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Monitor className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm">{t("hr.mon.noAgentsFiltered")}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("hr.mon.agent")}</TableHead>
            <TableHead>{t("common.status")}</TableHead>
            <TableHead>{t("hr.mon.mouse")}</TableHead>
            <TableHead>{t("hr.mon.keyboard")}</TableHead>
            <TableHead className="text-right">{t("hr.mon.hoursToday")}</TableHead>
            <TableHead>{t("hr.mon.lastActivity")}</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {agents.map((agent) => (
            <TableRow key={agent.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <UserAvatar name={agent.name} size="sm" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{nombreAgente(agent.name, t)}</p>
                  </div>
                </div>
              </TableCell>
              <TableCell><AgentStatusBadge status={agent.status} /></TableCell>
              <TableCell><ActivityBar value={agent.mouseActivity} /></TableCell>
              <TableCell><ActivityBar value={agent.keyboardActivity} /></TableCell>
              <TableCell className="text-right font-medium text-sm">{agent.hoursToday}h</TableCell>
              <TableCell className="text-sm text-muted-foreground">{ultimaActividad(agent.lastActivity, t)}</TableCell>
              <TableCell>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onSelectAgent(agent)}>
                  <Eye className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Grid View ────────────────────────────────────────────────────────────────
function MonitoringGrid({ agents, onSelectAgent }: { agents: HubstaffAgent[]; onSelectAgent: (a: HubstaffAgent) => void }) {
  const { t } = useLanguage();
  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Monitor className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm">{t("hr.mon.noAgents")}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {agents.map((agent) => (
        <Card key={agent.id} className="relative overflow-hidden cursor-pointer hover:border-primary/50 transition-colors" onClick={() => onSelectAgent(agent)}>
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <UserAvatar name={agent.name} size="md" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{nombreAgente(agent.name, t)}</p>
              </div>
            </div>
            <div className="flex items-center justify-end mb-4">
              <AgentStatusBadge status={agent.status} />
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground flex items-center gap-1"><Mouse className="h-3 w-3" /> {t("hr.mon.mouse")}</span>
                  <span className="text-xs font-medium">{agent.mouseActivity}%</span>
                </div>
                <ActivityBar value={agent.mouseActivity} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground flex items-center gap-1"><Keyboard className="h-3 w-3" /> {t("hr.mon.keyboard")}</span>
                  <span className="text-xs font-medium">{agent.keyboardActivity}%</span>
                </div>
                <ActivityBar value={agent.keyboardActivity} />
              </div>
            </div>
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
              <div className="text-xs text-muted-foreground"><Clock className="h-3 w-3 inline mr-1" />{t("hr.mon.hoursTodayShort", { h: agent.hoursToday })}</div>
              <div className="text-xs text-muted-foreground">{ultimaActividad(agent.lastActivity, t)}</div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Calendar View ────────────────────────────────────────────────────────────
function MonitoringCalendar({ month, onMonthChange }: { month: Date; onMonthChange: (d: Date) => void }) {
  const { t } = useLanguage();
  const f = useFormato();
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const firstDow = (getDay(monthStart) + 6) % 7;
  const blanks = Array.from({ length: firstDow });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => onMonthChange(subMonths(month, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-sm font-semibold capitalize">{format(month, "MMMM yyyy", { locale: f.fechas })}</h3>
        <Button variant="ghost" size="sm" onClick={() => onMonthChange(addMonths(month, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {DIAS_CORTOS.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{t(d)}</div>
        ))}
        {blanks.map((_, i) => <div key={`b-${i}`} />)}
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const today = isToday(day);
          return (
            <div
              key={key}
              className={`min-h-[72px] rounded-lg border p-2 text-xs ${today ? "border-primary bg-primary/5" : "border-border"} ${!isSameMonth(day, month) ? "opacity-40" : ""}`}
            >
              <span className={`font-medium ${today ? "text-primary" : "text-foreground"}`}>{format(day, "d")}</span>
              <p className="text-[10px] text-muted-foreground mt-1 italic">{t("common.noData")}</p>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 justify-center pt-2">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${cfg.dotColor}`} />
            <span className="text-xs text-muted-foreground">{t(cfg.label)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
