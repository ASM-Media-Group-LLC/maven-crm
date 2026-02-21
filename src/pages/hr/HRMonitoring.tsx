import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users, TrendingUp, AlertTriangle, Clock, Search, ListIcon, LayoutGrid,
  RefreshCw, Settings, Eye, Monitor, Mouse, Keyboard, Wifi, WifiOff, Pause,
  CalendarDays, ChevronLeft, ChevronRight, Info,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, subMonths, addMonths, isToday, isSameMonth } from "date-fns";
import { es } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { HRPageHeader } from "@/components/hr/HRPageHeader";
import { HRMetricCard } from "@/components/hr/HRMetricCard";
import { DateRangePicker } from "@/components/ui/date-range-picker";

// ─── Types ────────────────────────────────────────────────────────────────────
interface AgentActivity {
  id: string;
  name: string;
  role: string;
  department: string;
  departmentCode: string;
  status: "activo" | "inactivo" | "desconectado" | "en_pausa";
  mouseActivity: number;
  keyboardActivity: number;
  hoursToday: number;
  lastActivity: string;
  alerts: number;
  avatarInitials: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const AGENT_STATUSES = [
  { value: "activo", label: "Activo" },
  { value: "inactivo", label: "Inactivo" },
  { value: "desconectado", label: "Desconectado" },
  { value: "en_pausa", label: "En Pausa" },
];

const AGENT_ROLES = [
  { value: "Closer Senior", label: "Closer Senior" },
  { value: "Closer", label: "Closer" },
  { value: "Chatter", label: "Chatter" },
  { value: "Lead Gen", label: "Lead Gen" },
  { value: "Especialista", label: "Especialista" },
  { value: "Manager", label: "Manager" },
];

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Wifi; dotColor: string }> = {
  activo: { label: "Activo", variant: "default", icon: Wifi, dotColor: "bg-green-500" },
  inactivo: { label: "Inactivo", variant: "secondary", icon: WifiOff, dotColor: "bg-amber-500" },
  desconectado: { label: "Desconectado", variant: "outline", icon: WifiOff, dotColor: "bg-muted-foreground/40" },
  en_pausa: { label: "En Pausa", variant: "secondary", icon: Pause, dotColor: "bg-blue-500" },
};

const MOCK_AGENTS: AgentActivity[] = [
  { id: "1", name: "Carlos Mendoza", role: "Closer Senior", department: "Ventas", departmentCode: "ventas", status: "activo", mouseActivity: 87, keyboardActivity: 72, hoursToday: 7.5, lastActivity: "Hace 2 min", alerts: 0, avatarInitials: "CM" },
  { id: "2", name: "Laura García", role: "Chatter", department: "Contenido", departmentCode: "contenido", status: "activo", mouseActivity: 92, keyboardActivity: 88, hoursToday: 6.8, lastActivity: "Hace 1 min", alerts: 0, avatarInitials: "LG" },
  { id: "3", name: "Miguel Torres", role: "Lead Gen", department: "LeadGen", departmentCode: "leadgen", status: "activo", mouseActivity: 45, keyboardActivity: 30, hoursToday: 5.2, lastActivity: "Hace 15 min", alerts: 2, avatarInitials: "MT" },
  { id: "4", name: "Ana Rodríguez", role: "Especialista", department: "Marketing", departmentCode: "marketing", status: "en_pausa", mouseActivity: 0, keyboardActivity: 0, hoursToday: 3.5, lastActivity: "Hace 45 min", alerts: 0, avatarInitials: "AR" },
  { id: "5", name: "Diego Vargas", role: "Closer", department: "Ventas", departmentCode: "ventas", status: "inactivo", mouseActivity: 12, keyboardActivity: 5, hoursToday: 2.1, lastActivity: "Hace 1h 20min", alerts: 1, avatarInitials: "DV" },
  { id: "6", name: "Sofía Martínez", role: "Manager", department: "Operaciones", departmentCode: "operaciones", status: "activo", mouseActivity: 68, keyboardActivity: 55, hoursToday: 8.0, lastActivity: "Hace 5 min", alerts: 0, avatarInitials: "SM" },
  { id: "7", name: "Andrés López", role: "Chatter", department: "Contenido", departmentCode: "contenido", status: "desconectado", mouseActivity: 0, keyboardActivity: 0, hoursToday: 0, lastActivity: "Hace 3h", alerts: 3, avatarInitials: "AL" },
];

// Mock calendar data: simulate which agents had activity on recent days
function getMockCalendarData(month: Date) {
  const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) });
  const today = new Date();
  const map: Record<string, string[]> = {};
  days.forEach((day) => {
    if (day > today) return;
    // Simulate: some agents active on weekdays
    const dow = getDay(day);
    if (dow === 0 || dow === 6) return; // skip weekends
    const statuses: string[] = [];
    MOCK_AGENTS.forEach((a) => {
      // Simple deterministic mock: use agent id + day combo
      const seed = day.getDate() + parseInt(a.id);
      if (seed % 3 === 0) statuses.push("activo");
      else if (seed % 5 === 0) statuses.push("inactivo");
      else if (seed % 7 === 0) statuses.push("en_pausa");
    });
    if (statuses.length > 0) map[format(day, "yyyy-MM-dd")] = statuses;
  });
  return map;
}

// ─── Departments Hook ─────────────────────────────────────────────────────────
function useDepartments() {
  return useQuery({
    queryKey: ["departments-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("id, name, code")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ─── Activity Bar ─────────────────────────────────────────────────────────────
function ActivityBar({ value }: { value: number }) {
  const color = value > 70 ? "bg-green-500" : value > 30 ? "bg-amber-500" : "bg-destructive";
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
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.desconectado;
  const StatusIcon = cfg.icon;
  return (
    <Badge variant={cfg.variant} className="gap-1">
      <StatusIcon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function HRMonitoring() {
  const { toast } = useToast();
  const { data: departments = [] } = useDepartments();

  const [agents] = useState<AgentActivity[]>(MOCK_AGENTS);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [view, setView] = useState<"list" | "grid" | "calendar">("list");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [calMonth, setCalMonth] = useState(new Date());
  const [apiModalOpen, setApiModalOpen] = useState(false);
  const [apiToken, setApiToken] = useState("");
  const [orgId, setOrgId] = useState("");

  const deptTabs = useMemo(() => {
    const mockDepts = [...new Set(MOCK_AGENTS.map((a) => a.department))];
    const dbDepts = departments.map((d) => d.name);
    return [...new Set([...mockDepts, ...dbDepts])].sort();
  }, [departments]);

  const filtered = useMemo(() => {
    return agents.filter((a) => {
      if (search && !a.name.toLowerCase().includes(search.toLowerCase()) && !a.role.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter && a.status !== statusFilter) return false;
      if (roleFilter && a.role !== roleFilter) return false;
      if (deptFilter !== "all" && a.department !== deptFilter) return false;
      return true;
    });
  }, [agents, search, statusFilter, roleFilter, deptFilter]);

  // KPIs
  const activeCount = agents.filter((a) => a.status === "activo").length;
  const avgProductivity = agents.length > 0
    ? Math.round(agents.reduce((sum, a) => sum + (a.mouseActivity + a.keyboardActivity) / 2, 0) / agents.length)
    : 0;
  const alertCount = agents.filter((a) => a.alerts > 0).length;
  const totalHours = agents.reduce((sum, a) => sum + a.hoursToday, 0).toFixed(1);

  const calendarData = useMemo(() => getMockCalendarData(calMonth), [calMonth]);

  function handleRefresh() {
    toast({ title: "Datos actualizados", description: "Se han actualizado los datos de monitoreo (mock)" });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-background px-6 py-4">
        <HRPageHeader
          title="Monitoreo"
          subtitle="Monitoreo en tiempo real de agentes"
          actions={
            <>
              <Badge variant="outline" className="gap-1.5 px-3 py-1.5 text-xs font-medium border-primary/50 text-primary bg-primary/10">
                <Wifi className="h-3 w-3" />
                Hubstaff Mock
              </Badge>
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4 mr-1.5" />
                Actualizar
              </Button>
              <Button variant="outline" size="sm" onClick={() => setApiModalOpen(true)}>
                <Settings className="h-4 w-4 mr-1.5" />
                Configurar API
              </Button>
            </>
          }
        />

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
          <HRMetricCard title="Agentes Activos" value={`${activeCount}/${agents.length}`} icon={Users} color="primary" subtitle="conectados ahora" />
          <HRMetricCard title="Productividad Hoy" value={`${avgProductivity}%`} icon={TrendingUp} color="success" subtitle="promedio general" />
          <HRMetricCard title="Alertas Activas" value={alertCount} icon={AlertTriangle} color={alertCount > 0 ? "warning" : "default"} subtitle="agentes con alertas" />
          <HRMetricCard title="Horas Totales Hoy" value={`${totalHours}h`} icon={Clock} color="default" subtitle="acumuladas del equipo" />
        </div>

        {/* Department Tabs */}
        <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1 mb-4 overflow-x-auto">
          <Button size="sm" variant={deptFilter === "all" ? "secondary" : "ghost"} onClick={() => setDeptFilter("all")} className="text-sm shrink-0">
            Todos
          </Button>
          {deptTabs.map((dept) => (
            <Button key={dept} size="sm" variant={deptFilter === dept ? "secondary" : "ghost"} onClick={() => setDeptFilter(dept)} className="text-sm shrink-0">
              {dept}
            </Button>
          ))}
        </div>

        {/* Filters Row */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar agente..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter || undefined} onValueChange={(val) => setStatusFilter(val === "__all__" ? "" : val)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {AGENT_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={roleFilter || undefined} onValueChange={(val) => setRoleFilter(val === "__all__" ? "" : val)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Rol" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {AGENT_ROLES.map((r) => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DateRangePicker from={dateFrom} to={dateTo} onApply={(f, t) => { setDateFrom(f); setDateTo(t); }} />
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
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {view === "list" ? (
          <MonitoringTable agents={filtered} />
        ) : view === "grid" ? (
          <MonitoringGrid agents={filtered} />
        ) : (
          <MonitoringCalendar month={calMonth} onMonthChange={setCalMonth} data={calendarData} />
        )}
      </div>

      {/* API Config Modal */}
      <Dialog open={apiModalOpen} onOpenChange={setApiModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configurar Integración Hubstaff</DialogTitle>
            <DialogDescription>Conecta tu cuenta de Hubstaff para obtener datos de actividad en tiempo real.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="api-token">API Token</Label>
              <Input id="api-token" type="password" placeholder="Ingresa tu token de Hubstaff" value={apiToken} onChange={(e) => setApiToken(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-id">Organization ID</Label>
              <Input id="org-id" placeholder="Ej: 123456" value={orgId} onChange={(e) => setOrgId(e.target.value)} />
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3">
              <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">La integración real con Hubstaff está en desarrollo. Actualmente se muestran datos simulados.</p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => toast({ title: "Próximamente", description: "La prueba de conexión estará disponible pronto." })}>
              Probar Conexión
            </Button>
            <Button disabled>Guardar Configuración</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Table View ───────────────────────────────────────────────────────────────
function MonitoringTable({ agents }: { agents: AgentActivity[] }) {
  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Monitor className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm">No se encontraron agentes</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Agente</TableHead>
            <TableHead>Departamento</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Mouse</TableHead>
            <TableHead>Teclado</TableHead>
            <TableHead className="text-right">Horas Hoy</TableHead>
            <TableHead>Última Actividad</TableHead>
            <TableHead className="text-center">Alertas</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {agents.map((agent) => (
            <TableRow key={agent.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs bg-primary/10 text-primary">{agent.avatarInitials}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium text-foreground">{agent.name}</p>
                    <p className="text-xs text-muted-foreground">{agent.role}</p>
                  </div>
                </div>
              </TableCell>
              <TableCell><Badge variant="outline" className="text-xs">{agent.department}</Badge></TableCell>
              <TableCell><AgentStatusBadge status={agent.status} /></TableCell>
              <TableCell><ActivityBar value={agent.mouseActivity} /></TableCell>
              <TableCell><ActivityBar value={agent.keyboardActivity} /></TableCell>
              <TableCell className="text-right font-medium text-sm">{agent.hoursToday}h</TableCell>
              <TableCell className="text-sm text-muted-foreground">{agent.lastActivity}</TableCell>
              <TableCell className="text-center">
                {agent.alerts > 0 ? (
                  <Badge variant="destructive" className="text-xs min-w-[24px] justify-center">{agent.alerts}</Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">0</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Grid View ────────────────────────────────────────────────────────────────
function MonitoringGrid({ agents }: { agents: AgentActivity[] }) {
  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Monitor className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm">No se encontraron agentes</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {agents.map((agent) => (
        <Card key={agent.id} className="relative overflow-hidden">
          {agent.alerts > 0 && (
            <div className="absolute top-3 right-3">
              <Badge variant="destructive" className="text-xs min-w-[24px] justify-center">{agent.alerts}</Badge>
            </div>
          )}
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="text-sm bg-primary/10 text-primary">{agent.avatarInitials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{agent.name}</p>
                <p className="text-xs text-muted-foreground">{agent.role}</p>
              </div>
            </div>
            <div className="flex items-center justify-between mb-4">
              <Badge variant="outline" className="text-xs">{agent.department}</Badge>
              <AgentStatusBadge status={agent.status} />
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground flex items-center gap-1"><Mouse className="h-3 w-3" /> Mouse</span>
                  <span className="text-xs font-medium">{agent.mouseActivity}%</span>
                </div>
                <ActivityBar value={agent.mouseActivity} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground flex items-center gap-1"><Keyboard className="h-3 w-3" /> Teclado</span>
                  <span className="text-xs font-medium">{agent.keyboardActivity}%</span>
                </div>
                <ActivityBar value={agent.keyboardActivity} />
              </div>
            </div>
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
              <div className="text-xs text-muted-foreground"><Clock className="h-3 w-3 inline mr-1" />{agent.hoursToday}h hoy</div>
              <div className="text-xs text-muted-foreground">{agent.lastActivity}</div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Calendar View ────────────────────────────────────────────────────────────
const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function MonitoringCalendar({ month, onMonthChange, data }: { month: Date; onMonthChange: (d: Date) => void; data: Record<string, string[]> }) {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Offset for first day (Monday = 0)
  const firstDow = (getDay(monthStart) + 6) % 7;
  const blanks = Array.from({ length: firstDow });

  return (
    <div className="space-y-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => onMonthChange(subMonths(month, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-sm font-semibold capitalize">{format(month, "MMMM yyyy", { locale: es })}</h3>
        <Button variant="ghost" size="sm" onClick={() => onMonthChange(addMonths(month, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
        ))}
        {blanks.map((_, i) => <div key={`b-${i}`} />)}
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const statuses = data[key] ?? [];
          const today = isToday(day);
          return (
            <div
              key={key}
              className={`min-h-[72px] rounded-lg border p-2 text-xs ${today ? "border-primary bg-primary/5" : "border-border"} ${!isSameMonth(day, month) ? "opacity-40" : ""}`}
            >
              <span className={`font-medium ${today ? "text-primary" : "text-foreground"}`}>{format(day, "d")}</span>
              {statuses.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {statuses.slice(0, 5).map((s, i) => (
                    <span key={i} className={`h-2 w-2 rounded-full ${STATUS_CONFIG[s]?.dotColor ?? "bg-muted-foreground/40"}`} />
                  ))}
                  {statuses.length > 5 && <span className="text-[10px] text-muted-foreground">+{statuses.length - 5}</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 justify-center pt-2">
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${cfg.dotColor}`} />
            <span className="text-xs text-muted-foreground">{cfg.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
