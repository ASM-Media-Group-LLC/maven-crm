import { useMemo, useState, useEffect } from "react";
import { format, subDays, isSameDay, subMonths } from "date-fns";
import { es } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line, ResponsiveContainer } from "recharts";
import { CHART_AXIS, CHART_GRID } from "@/lib/chartTheme";
import { BarChart3, Clock, ChevronsUpDown, Check, CheckCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandItem } from "@/components/ui/command";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { usePromologActiveAgents, usePromologAgentEntries } from "./usePromologAgentStats";

interface Props {
  profiles: Array<{ id: string; full_name: string | null }>;
}

const PromologPerformanceView = ({ profiles }: Props) => {
  const { user } = useAuth();
  const { role, isAgent, isEmployee } = useUserRole();
  const isCloser = role === "closer";
  const isOperational = isAgent || isCloser || isEmployee;

  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // Auto-select for operational roles
  useEffect(() => {
    if (isOperational && user?.id) {
      setSelectedAgent(user.id);
    }
  }, [isOperational, user?.id]);

  const effectiveAgent = isOperational ? user?.id ?? null : selectedAgent;

  // Get profile IDs for the active agents hook
  const profileIds = useMemo(() => profiles.filter(p => p.full_name).map(p => p.id), [profiles]);

  // Lightweight query: just get distinct active agent IDs
  const { data: activeAgentIds = [], isLoading: agentsLoading } = usePromologActiveAgents(profileIds);

  // Build agents list from active IDs + profiles
  const agents = useMemo(() => {
    return activeAgentIds
      .map(id => {
        const p = profiles.find(pr => pr.id === id);
        return p?.full_name ? { id, name: p.full_name } : null;
      })
      .filter((a): a is { id: string; name: string } => a !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [activeAgentIds, profiles]);

  // Fetch entries only for the selected agent
  const { data: agentEntries = [], isLoading: entriesLoading } = usePromologAgentEntries(effectiveAgent);

  const isLoading = agentsLoading || entriesLoading;

  const selectedName = !effectiveAgent
    ? "Seleccionar agente"
    : (profiles.find(p => p.id === effectiveAgent)?.full_name || "Agente");

  const now = new Date();

  const hourlyData = useMemo(() => Array.from({ length: 24 }, (_, i) => ({
    hour: `${i}:00`,
    count: agentEntries.filter(l => isSameDay(new Date(l.created_at), now) && new Date(l.created_at).getHours() === i).length,
  })), [agentEntries, now]);

  const weeklyData = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const day = subDays(now, 6 - i);
    return {
      label: format(day, "EEE dd", { locale: es }),
      count: agentEntries.filter(l => isSameDay(new Date(l.created_at), day)).length,
    };
  }), [agentEntries, now]);

  const last30Data = useMemo(() => Array.from({ length: 30 }, (_, i) => {
    const day = subDays(now, 29 - i);
    return {
      label: format(day, "d MMM", { locale: es }),
      count: agentEntries.filter(l => isSameDay(new Date(l.created_at), day)).length,
    };
  }), [agentEntries, now]);

  const yearlyData = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const month = subMonths(now, 11 - i);
    return {
      label: format(month, "MMM yy", { locale: es }),
      count: agentEntries.filter(l => {
        const d = new Date(l.created_at);
        return d.getMonth() === month.getMonth() && d.getFullYear() === month.getFullYear();
      }).length,
    };
  }), [agentEntries, now]);

  // Result distribution — BINARIO Sí/No. Sí = promocionó ('true'/'yes'/'partial');
  // No = todo lo demás (incl. 'false'/'pending'/null), para que si + no === total.
  const resultDist = useMemo(() => {
    const si = agentEntries.filter(e => e.promoted === "true" || e.promoted === "yes" || e.promoted === "partial").length;
    const no = agentEntries.filter(e => e.promoted !== "true" && e.promoted !== "yes" && e.promoted !== "partial").length;
    const total = agentEntries.length || 1;
    return [
      { label: "Sí", count: si, pct: Math.round((si / total) * 100), color: "bg-success" },
      { label: "No", count: no, pct: Math.round((no / total) * 100), color: "bg-destructive" },
    ];
  }, [agentEntries]);

  const tooltipStyle = { backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-base font-semibold">Rendimiento por Agente</h3>
            <p className="text-sm text-muted-foreground">
              {format(now, "dd 'de' MMMM, yyyy", { locale: es })} · {agents.length} agentes activos
            </p>
          </div>
          {!isOperational && (
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[220px] h-9 justify-between font-normal">
                  {selectedName}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[220px] p-0">
                <Command>
                  <CommandInput placeholder="Buscar agente..." />
                  <CommandList>
                    <CommandEmpty>No encontrado</CommandEmpty>
                    {agents.map(a => (
                      <CommandItem key={a.id} value={a.name} onSelect={() => { setSelectedAgent(a.id); setOpen(false); }}>
                        {a.name}
                        {selectedAgent === a.id && <Check className="ml-auto h-4 w-4" />}
                      </CommandItem>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          )}
        </div>

        {!effectiveAgent ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
              <BarChart3 className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <p className="text-muted-foreground text-sm">Selecciona un agente para ver su rendimiento</p>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-20">
            <p className="text-muted-foreground text-sm">Cargando datos del agente...</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="rounded-lg border border-primary/30 bg-gradient-to-r from-primary/15 to-primary/5 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total de Promos — {selectedName}</p>
                  <p className="text-4xl font-bold text-primary mt-1">{agentEntries.length}</p>
                </div>
                <p className="text-sm text-muted-foreground">{format(now, "dd/MM/yyyy")}</p>
              </div>
            </div>

            <Card>
              <CardContent className="pt-6">
                <h4 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                  Distribución por Resultado
                </h4>
                <div className="space-y-3">
                  {resultDist.map(r => (
                    <div key={r.label} className="flex items-center gap-3">
                      <span className="text-sm w-16">{r.label}</span>
                      <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full ${r.color} rounded-full transition-all`} style={{ width: `${r.pct}%` }} />
                      </div>
                      <span className="text-sm font-medium w-16 text-right">{r.count} ({r.pct}%)</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {[
              { title: "Promos por Hora del Día", icon: Clock, iconColor: "text-primary", data: hourlyData, dataKey: "hour", type: "bar", color: "hsl(var(--primary))" },
              { title: "Promos por Día (Última Semana)", icon: BarChart3, iconColor: "text-emerald-500", data: weeklyData, dataKey: "label", type: "bar", color: "#10b981" },
              { title: "Promos por Día (Últimos 30 días)", icon: BarChart3, iconColor: "text-violet-500", data: last30Data, dataKey: "label", type: "line", color: "#8b5cf6" },
              { title: "Promos por Mes (Últimos 12 meses)", icon: BarChart3, iconColor: "text-amber-500", data: yearlyData, dataKey: "label", type: "bar", color: "#f59e0b" },
            ].map((chart, i) => (
              <Card key={i}>
                <CardContent className="pt-6">
                  <h4 className="text-sm font-semibold mb-4 flex items-center gap-2">
                    <chart.icon className={`h-4 w-4 ${chart.iconColor}`} />
                    {chart.title}
                  </h4>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      {chart.type === "line" ? (
                        <LineChart data={chart.data}>
                          {/* stroke como ATRIBUTO: className="stroke-border" no pisaba el #ccc default (auditoría #16) */}
                          <CartesianGrid {...CHART_GRID} />
                          <XAxis dataKey={chart.dataKey} {...CHART_AXIS} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} interval={4} />
                          <YAxis allowDecimals={false} {...CHART_AXIS} />
                          <Tooltip contentStyle={tooltipStyle} />
                          <Line type="monotone" dataKey="count" name="Promos" stroke={chart.color} strokeWidth={2} dot={{ fill: chart.color, r: 3 }} activeDot={{ r: 5 }} />
                        </LineChart>
                      ) : (
                        <BarChart data={chart.data}>
                          <CartesianGrid {...CHART_GRID} />
                          <XAxis dataKey={chart.dataKey} {...CHART_AXIS} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                          <YAxis allowDecimals={false} {...CHART_AXIS} />
                          <Tooltip contentStyle={tooltipStyle} />
                          <Bar dataKey="count" name="Promos" fill={chart.color} radius={[4, 4, 0, 0]} />
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PromologPerformanceView;
