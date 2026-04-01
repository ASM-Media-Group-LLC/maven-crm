import { useMemo, useState } from "react";
import { format, subDays, isSameDay, subMonths } from "date-fns";
import { es } from "date-fns/locale";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line, ResponsiveContainer } from "recharts";
import { BarChart3, Clock, Users, ChevronsUpDown, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandItem } from "@/components/ui/command";
import { useLeadGenAgentLeads } from "./useLeadGen";
import type { LeadGenEntry } from "./useLeadGen";

interface Props {
  profiles: Array<{ id: string; full_name: string | null }>;
  agentIds: string[];
  dateFrom?: string;
  dateTo?: string;
}

const LeadGenPerformanceView = ({ profiles, agentIds, dateFrom, dateTo }: Props) => {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const agents = useMemo(() => {
    return agentIds.map(id => {
      const p = profiles.find(pr => pr.id === id);
      return { id, name: p?.full_name || `Agente ${id.slice(0, 6)}` };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [agentIds, profiles]);

  // Fetch ALL leads for selected agent (no pagination limit)
  const { data: agentLeads = [], isLoading } = useLeadGenAgentLeads(selectedAgent, dateFrom, dateTo);

  const selectedName = !selectedAgent ? "Seleccionar agente" : (agents.find(a => a.id === selectedAgent)?.name || "Agente");

  const now = new Date();

  const hourlyData = useMemo(() => Array.from({ length: 24 }, (_, i) => ({
    hour: `${i}:00`,
    count: agentLeads.filter(l => isSameDay(new Date(l.created_at), now) && new Date(l.created_at).getHours() === i).length,
  })), [agentLeads, now]);

  const weeklyData = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const day = subDays(now, 6 - i);
    return {
      label: format(day, "EEE dd", { locale: es }),
      count: agentLeads.filter(l => isSameDay(new Date(l.created_at), day)).length,
    };
  }), [agentLeads, now]);

  const last30Data = useMemo(() => Array.from({ length: 30 }, (_, i) => {
    const day = subDays(now, 29 - i);
    return {
      label: format(day, "d MMM", { locale: es }),
      count: agentLeads.filter(l => isSameDay(new Date(l.created_at), day)).length,
    };
  }), [agentLeads, now]);

  const yearlyData = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const month = subMonths(now, 11 - i);
    return {
      label: format(month, "MMM yy", { locale: es }),
      count: agentLeads.filter(l => {
        const d = new Date(l.created_at);
        return d.getMonth() === month.getMonth() && d.getFullYear() === month.getFullYear();
      }).length,
    };
  }), [agentLeads, now]);

  const tooltipStyle = { backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="rounded-lg border overflow-hidden bg-gradient-to-br from-primary/15 via-primary/10 to-primary/5 border-l-[3px] border-l-primary mb-6">
          <div className="p-6 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-primary">Rendimiento por Agente</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Selecciona un agente para analizar su actividad
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[200px] h-9 justify-between font-normal">
                    {selectedName}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] p-0">
                  <Command>
                    <CommandInput placeholder="Buscar agente..." />
                    <CommandList>
                      <CommandEmpty>No encontrado</CommandEmpty>
                      {agents.map(a => (
                        <CommandItem key={a.id} onSelect={() => { setSelectedAgent(a.id); setOpen(false); }}>
                          {a.name}
                          {selectedAgent === a.id && <Check className="ml-auto h-4 w-4" />}
                        </CommandItem>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-primary" />
              </div>
            </div>
          </div>
        </div>

        {!selectedAgent ? (
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
                  <p className="text-sm font-medium text-muted-foreground">Total de Leads — {selectedName}</p>
                  <p className="text-4xl font-bold text-primary mt-1">{agentLeads.length}</p>
                </div>
                <p className="text-sm text-muted-foreground">{format(now, "dd/MM/yyyy")}</p>
              </div>
            </div>

            {[
              { title: "Leads por Hora del Día", icon: Clock, iconColor: "text-primary", data: hourlyData, dataKey: "hour", type: "bar", color: "hsl(var(--primary))" },
              { title: "Leads por Día (Última Semana)", icon: BarChart3, iconColor: "text-emerald-500", data: weeklyData, dataKey: "label", type: "bar", color: "#10b981" },
              { title: "Leads por Día (Últimos 30 días)", icon: BarChart3, iconColor: "text-violet-500", data: last30Data, dataKey: "label", type: "line", color: "#8b5cf6" },
              { title: "Leads por Mes (Últimos 12 meses)", icon: BarChart3, iconColor: "text-amber-500", data: yearlyData, dataKey: "label", type: "bar", color: "#f59e0b" },
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
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis dataKey={chart.dataKey} tick={{ fontSize: 10 }} interval={4} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                          <Tooltip contentStyle={tooltipStyle} />
                          <Line type="monotone" dataKey="count" name="Leads" stroke={chart.color} strokeWidth={2} dot={{ fill: chart.color, r: 3 }} activeDot={{ r: 5 }} />
                        </LineChart>
                      ) : (
                        <BarChart data={chart.data}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis dataKey={chart.dataKey} tick={{ fontSize: 10 }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                          <Tooltip contentStyle={tooltipStyle} />
                          <Bar dataKey="count" name="Leads" fill={chart.color} radius={[4, 4, 0, 0]} />
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

export default LeadGenPerformanceView;
