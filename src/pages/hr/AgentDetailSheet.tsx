import { useState, useMemo } from "react";
import {
  Clock, Mouse, Keyboard, TrendingUp, Monitor, X, Play, Pause, Coffee,
  LogOut, Zap, AlertTriangle, ChevronLeft,
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

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

interface AgentDetailSheetProps {
  agent: AgentActivity | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Deterministic seed helper ────────────────────────────────────────────────
function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// ─── Mock data generators ─────────────────────────────────────────────────────
function generateDailyData(agentId: string) {
  const base = parseInt(agentId) * 17;
  const hours = ["8:00", "9:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];
  return hours.map((h, i) => ({
    label: h,
    mouse: Math.round(seededRandom(base + i) * 60 + 20),
    keyboard: Math.round(seededRandom(base + i + 100) * 50 + 15),
  }));
}

function generateWeeklyData(agentId: string) {
  const base = parseInt(agentId) * 31;
  const days = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  return days.map((d, i) => ({
    label: d,
    mouse: i >= 5 ? 0 : Math.round(seededRandom(base + i * 3) * 50 + 30),
    keyboard: i >= 5 ? 0 : Math.round(seededRandom(base + i * 3 + 50) * 40 + 20),
  }));
}

function generateMonthlyData(agentId: string) {
  const base = parseInt(agentId) * 47;
  return Array.from({ length: 28 }, (_, i) => ({
    label: `${i + 1}`,
    mouse: Math.round(seededRandom(base + i * 2) * 55 + 25),
    keyboard: Math.round(seededRandom(base + i * 2 + 80) * 45 + 15),
  }));
}

function generateScreenshots(agentId: string) {
  const base = parseInt(agentId) * 13;
  const times = ["9:12 AM", "9:42 AM", "10:15 AM", "10:45 AM", "11:18 AM", "11:48 AM", "1:05 PM", "2:30 PM"];
  return times.map((t, i) => ({
    id: `ss-${i}`,
    timestamp: t,
    activity: Math.round(seededRandom(base + i * 7) * 60 + 30),
  }));
}

function generateTimeline(agentId: string) {
  const base = parseInt(agentId) * 23;
  const events = [
    { time: "8:00 AM", type: "start" as const, label: "Inicio de jornada" },
    { time: "8:00 - 10:30", type: "high" as const, label: "Alta actividad" },
    { time: "10:30 - 10:45", type: "break" as const, label: "Pausa corta" },
    { time: "10:45 - 12:00", type: "high" as const, label: "Alta actividad" },
    { time: "12:00 - 1:00 PM", type: "break" as const, label: "Almuerzo" },
    { time: "1:00 - 3:00 PM", type: "medium" as const, label: "Actividad moderada" },
    { time: "3:00 - 3:05 PM", type: "low" as const, label: "Baja actividad detectada" },
    { time: "3:05 - 5:00 PM", type: "high" as const, label: "Alta actividad" },
    { time: "5:00 PM", type: "end" as const, label: "Fin de jornada" },
  ];
  // Remove a random event based on agent to add variety
  const skip = Math.round(seededRandom(base) * 3) + 3;
  return events.filter((_, i) => i !== skip);
}

const TIMELINE_CONFIG: Record<string, { icon: typeof Play; color: string }> = {
  start: { icon: Play, color: "text-green-500" },
  high: { icon: Zap, color: "text-green-500" },
  medium: { icon: TrendingUp, color: "text-amber-500" },
  low: { icon: AlertTriangle, color: "text-red-500" },
  break: { icon: Coffee, color: "text-blue-500" },
  end: { icon: LogOut, color: "text-muted-foreground" },
};

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  activo: { label: "Activo", variant: "default" },
  inactivo: { label: "Inactivo", variant: "secondary" },
  desconectado: { label: "Desconectado", variant: "outline" },
  en_pausa: { label: "En Pausa", variant: "secondary" },
};

// ─── Mini KPI Card ────────────────────────────────────────────────────────────
function MiniKPI({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Clock }) {
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground truncate">{label}</p>
          <p className="text-sm font-bold text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AgentDetailSheet({ agent, open, onOpenChange }: AgentDetailSheetProps) {
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);

  const chartData = useMemo(() => {
    if (!agent) return [];
    if (period === "daily") return generateDailyData(agent.id);
    if (period === "weekly") return generateWeeklyData(agent.id);
    return generateMonthlyData(agent.id);
  }, [agent?.id, period]);

  const kpis = useMemo(() => {
    if (chartData.length === 0) return { hours: "0h", productivity: "0%", mouse: "0%", keyboard: "0%" };
    const avgMouse = Math.round(chartData.reduce((s, d) => s + d.mouse, 0) / chartData.length);
    const avgKeyboard = Math.round(chartData.reduce((s, d) => s + d.keyboard, 0) / chartData.length);
    const productivity = Math.round((avgMouse + avgKeyboard) / 2);
    const hoursMap = { daily: agent?.hoursToday ?? 0, weekly: (agent?.hoursToday ?? 0) * 5 * 0.9, monthly: (agent?.hoursToday ?? 0) * 22 * 0.85 };
    return {
      hours: `${hoursMap[period].toFixed(1)}h`,
      productivity: `${productivity}%`,
      mouse: `${avgMouse}%`,
      keyboard: `${avgKeyboard}%`,
    };
  }, [chartData, period, agent]);

  const screenshots = useMemo(() => (agent ? generateScreenshots(agent.id) : []), [agent?.id]);
  const timeline = useMemo(() => (agent ? generateTimeline(agent.id) : []), [agent?.id]);

  if (!agent) return null;

  const statusCfg = STATUS_LABELS[agent.status] ?? STATUS_LABELS.desconectado;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-xl md:max-w-2xl p-0 flex flex-col">
          {/* Header */}
          <div className="shrink-0 border-b border-border px-5 py-4">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => onOpenChange(false)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Avatar className="h-10 w-10">
                <AvatarFallback className="text-sm bg-primary/10 text-primary">{agent.avatarInitials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-foreground truncate">{agent.name}</h3>
                  <Badge variant={statusCfg.variant} className="text-xs">{statusCfg.label}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{agent.role} — {agent.department}</p>
              </div>
            </div>
          </div>

          {/* Scrollable content */}
          <ScrollArea className="flex-1">
            <div className="px-5 py-4 space-y-6">
              {/* Period Tabs */}
              <Tabs value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
                <TabsList className="w-full">
                  <TabsTrigger value="daily" className="flex-1">Diario</TabsTrigger>
                  <TabsTrigger value="weekly" className="flex-1">Semanal</TabsTrigger>
                  <TabsTrigger value="monthly" className="flex-1">Mensual</TabsTrigger>
                </TabsList>

                {/* KPIs */}
                <div className="grid grid-cols-2 gap-2 mt-4">
                  <MiniKPI label="Horas Totales" value={kpis.hours} icon={Clock} />
                  <MiniKPI label="Productividad" value={kpis.productivity} icon={TrendingUp} />
                  <MiniKPI label="Actividad Mouse" value={kpis.mouse} icon={Mouse} />
                  <MiniKPI label="Actividad Teclado" value={kpis.keyboard} icon={Keyboard} />
                </div>

                {/* Chart */}
                <TabsContent value={period} className="mt-4">
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs font-medium text-muted-foreground mb-3">
                        Rendimiento {period === "daily" ? "por hora" : period === "weekly" ? "por día" : "por día del mes"}
                      </p>
                      <ResponsiveContainer width="100%" height={200}>
                        <AreaChart data={chartData}>
                          <defs>
                            <linearGradient id="fillMouse" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="fillKeyboard" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                          <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                          <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" domain={[0, 100]} unit="%" />
                          <Tooltip
                            contentStyle={{
                              background: "hsl(var(--background))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: 8,
                              fontSize: 12,
                            }}
                          />
                          <Area type="monotone" dataKey="mouse" name="Mouse" stroke="hsl(var(--primary))" fill="url(#fillMouse)" strokeWidth={2} />
                          <Area type="monotone" dataKey="keyboard" name="Teclado" stroke="#6366f1" fill="url(#fillKeyboard)" strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                      <div className="flex items-center justify-center gap-4 mt-2">
                        <div className="flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                          <span className="text-xs text-muted-foreground">Mouse</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#6366f1" }} />
                          <span className="text-xs text-muted-foreground">Teclado</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>

              {/* Screenshots */}
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-3">Capturas de Pantalla</h4>
                <div className="grid grid-cols-4 gap-2">
                  {screenshots.map((ss) => (
                    <button
                      key={ss.id}
                      onClick={() => setScreenshotPreview(ss.timestamp)}
                      className="group relative aspect-video rounded-lg border border-border bg-muted/50 flex flex-col items-center justify-center gap-1 hover:border-primary/50 hover:bg-muted transition-colors cursor-pointer"
                    >
                      <Monitor className="h-5 w-5 text-muted-foreground/50 group-hover:text-primary/60" />
                      <span className="text-[10px] text-muted-foreground">{ss.timestamp}</span>
                      <div className="absolute bottom-1 right-1">
                        <span className={`text-[9px] font-medium ${ss.activity > 60 ? "text-green-600" : ss.activity > 30 ? "text-amber-600" : "text-red-500"}`}>
                          {ss.activity}%
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-2 italic">Las capturas reales estarán disponibles al conectar Hubstaff.</p>
              </div>

              {/* Timeline */}
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-3">Línea de Tiempo</h4>
                <div className="space-y-0">
                  {timeline.map((event, i) => {
                    const cfg = TIMELINE_CONFIG[event.type] ?? TIMELINE_CONFIG.end;
                    const EventIcon = cfg.icon;
                    return (
                      <div key={i} className="flex items-start gap-3 relative">
                        {/* Vertical line */}
                        {i < timeline.length - 1 && (
                          <div className="absolute left-[11px] top-6 bottom-0 w-px bg-border" />
                        )}
                        <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-background ${cfg.color}`}>
                          <EventIcon className="h-3 w-3" />
                        </div>
                        <div className="pb-4 min-w-0">
                          <p className="text-xs font-medium text-foreground">{event.label}</p>
                          <p className="text-[11px] text-muted-foreground">{event.time}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Screenshot Preview Dialog */}
      <Dialog open={!!screenshotPreview} onOpenChange={() => setScreenshotPreview(null)}>
        <DialogContent className="sm:max-w-2xl">
          <div className="aspect-video rounded-lg bg-muted/50 border border-border flex flex-col items-center justify-center gap-3">
            <Monitor className="h-12 w-12 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Captura de {screenshotPreview}</p>
            <p className="text-xs text-muted-foreground italic">Captura real disponible con integración Hubstaff</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
