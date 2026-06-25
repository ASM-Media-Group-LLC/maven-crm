import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, LabelList,
} from "recharts";
import { format, subDays, parseISO, startOfDay, endOfDay } from "date-fns";
import { es } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SuperContactsProductivityModal = ({ open, onOpenChange }: Props) => {
  const [dateRange, setDateRange] = useState<"7d" | "14d" | "30d" | "custom">("7d");
  const [customFrom, setCustomFrom] = useState<Date | undefined>(subDays(new Date(), 7));
  const [customTo, setCustomTo] = useState<Date | undefined>(new Date());

  const from = useMemo(() => {
    if (dateRange === "custom" && customFrom) return startOfDay(customFrom);
    const days = dateRange === "7d" ? 7 : dateRange === "14d" ? 14 : 30;
    return startOfDay(subDays(new Date(), days));
  }, [dateRange, customFrom]);

  const to = useMemo(() => {
    if (dateRange === "custom" && customTo) return endOfDay(customTo);
    return endOfDay(new Date());
  }, [dateRange, customTo]);

  // Query closers_contacts for links (handles) and numbers (phone)
  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ["productivity-contacts", from.toISOString(), to.toISOString()],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("closers_contacts")
        // phone es admin-only (revocado): para CONTAR cuántos tienen número usamos el
        // proxy no-PII phone_first_set_at (1:1 con "tiene phone").
        .select("id, handle, phone_first_set_at, created_by, created_at, name")
        .gte("created_at", from.toISOString())
        .lte("created_at", to.toISOString())
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Get profiles for agent names
  const agentIds = useMemo(() => {
    const ids = new Set<string>();
    contacts.forEach((c) => { if (c.created_by) ids.add(c.created_by); });
    return Array.from(ids);
  }, [contacts]);

  const { data: profileMap = {} } = useQuery({
    queryKey: ["productivity-profiles", agentIds],
    enabled: agentIds.length > 0 && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("get_agent_names", { _user_ids: agentIds });
      if (error) throw error;
      const map: Record<string, string> = {};
      (data ?? []).forEach((p: any) => { map[p.id] = p.full_name || "Sin nombre"; });
      return map;
    },
  });

  // --- DAILY DATA ---
  const dailyData = useMemo(() => {
    if (!contacts.length) return [];
    const map: Record<string, { links: number; numbers: number }> = {};
    contacts.forEach((c) => {
      const day = format(parseISO(c.created_at!), "yyyy-MM-dd");
      if (!map[day]) map[day] = { links: 0, numbers: 0 };
      map[day].links += 1; // each contact = 1 link/handle
      if (c.phone_first_set_at) map[day].numbers += 1;
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, vals]) => ({
        day,
        label: format(parseISO(day), "dd MMM", { locale: es }),
        ...vals,
        ratio: vals.links ? Math.round((vals.numbers / vals.links) * 100) : 0,
      }));
  }, [contacts]);

  // --- BY AGENT ---
  const agentData = useMemo(() => {
    const map: Record<string, { links: number; numbers: number }> = {};
    contacts.forEach((c) => {
      const agent = c.created_by || "unknown";
      if (!map[agent]) map[agent] = { links: 0, numbers: 0 };
      map[agent].links += 1;
      if (c.phone_first_set_at) map[agent].numbers += 1;
    });
    return Object.entries(map)
      .map(([id, vals]) => ({
        agent: profileMap[id] || id.slice(0, 8),
        ...vals,
        ratio: vals.links ? Math.round((vals.numbers / vals.links) * 100) : 0,
      }))
      .sort((a, b) => b.links - a.links);
  }, [contacts, profileMap]);

  // --- AGENT × DAY (table) ---
  const agentDayTable = useMemo(() => {
    const daySet = new Set<string>();
    const map: Record<string, Record<string, { links: number; numbers: number }>> = {};
    contacts.forEach((c) => {
      const day = format(parseISO(c.created_at!), "yyyy-MM-dd");
      const agent = c.created_by || "unknown";
      daySet.add(day);
      if (!map[agent]) map[agent] = {};
      if (!map[agent][day]) map[agent][day] = { links: 0, numbers: 0 };
      map[agent][day].links += 1;
      if (c.phone_first_set_at) map[agent][day].numbers += 1;
    });
    const days = Array.from(daySet).sort();
    const agents = Object.keys(map).sort();
    return { days, agents, map };
  }, [contacts]);

  // KPIs
  const kpis = useMemo(() => {
    const totalLinks = contacts.length;
    const totalNumbers = contacts.filter((c) => c.phone_first_set_at).length;
    const convRate = totalLinks ? Math.round((totalNumbers / totalLinks) * 100) : 0;
    const avgLinksDay = dailyData.length ? Math.round(totalLinks / dailyData.length) : 0;
    return { totalLinks, totalNumbers, convRate, avgLinksDay };
  }, [contacts, dailyData]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Productividad — Links vs Números</DialogTitle>
        </DialogHeader>

        {/* Filtros */}
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as any)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Últimos 7 días</SelectItem>
              <SelectItem value="14d">Últimos 14 días</SelectItem>
              <SelectItem value="30d">Últimos 30 días</SelectItem>
              <SelectItem value="custom">Rango personalizado</SelectItem>
            </SelectContent>
          </Select>

          {dateRange === "custom" && (
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("w-[130px] text-left font-normal", !customFrom && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {customFrom ? format(customFrom, "dd/MM/yy") : "Desde"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} /></PopoverContent>
              </Popover>
              <span className="text-muted-foreground">→</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("w-[130px] text-left font-normal", !customTo && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {customTo ? format(customTo, "dd/MM/yy") : "Hasta"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={customTo} onSelect={setCustomTo} /></PopoverContent>
              </Popover>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">Cargando datos…</div>
        ) : !contacts.length ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">Sin datos en el rango seleccionado</div>
        ) : (
          <div className="space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-bold">{kpis.totalLinks}</p>
                <p className="text-xs text-muted-foreground">Links ingresados</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-bold">{kpis.totalNumbers}</p>
                <p className="text-xs text-muted-foreground">Números obtenidos</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-bold">{kpis.convRate}%</p>
                <p className="text-xs text-muted-foreground">Tasa link→número</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-2xl font-bold">{kpis.avgLinksDay}</p>
                <p className="text-xs text-muted-foreground">Prom. links/día</p>
              </div>
            </div>

            {/* Gráfica diaria */}
            <div>
              <h3 className="text-sm font-medium mb-2">Links vs Números por día</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" fontSize={11} />
                  <YAxis allowDecimals={false} />
                  <Tooltip formatter={(val: number, name: string) => [val, name === "links" ? "Links" : "Números"]} />
                  <Legend formatter={(val) => (val === "links" ? "Links" : "Números")} />
                  <Bar dataKey="links" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="links" position="top" fontSize={10} />
                  </Bar>
                  <Bar dataKey="numbers" fill="hsl(150, 60%, 45%)" radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="numbers" position="top" fontSize={10} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Por agente */}
            <div>
              <h3 className="text-sm font-medium mb-2">Rendimiento por agente</h3>
              {agentData.length ? (
                <ResponsiveContainer width="100%" height={Math.max(180, agentData.length * 45)}>
                  <BarChart data={agentData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="agent" width={120} fontSize={12} />
                    <Tooltip formatter={(val: number, name: string) => [val, name === "links" ? "Links" : "Números"]} />
                    <Legend formatter={(val) => (val === "links" ? "Links" : "Números")} />
                    <Bar dataKey="links" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]}>
                      <LabelList dataKey="links" position="right" fontSize={10} />
                    </Bar>
                    <Bar dataKey="numbers" fill="hsl(150, 60%, 45%)" radius={[0, 4, 4, 0]}>
                      <LabelList dataKey="numbers" position="right" fontSize={10} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">Sin datos de agentes</p>
              )}
            </div>

            {/* Tabla agente × día */}
            <div>
              <h3 className="text-sm font-medium mb-2">Detalle Agente × Día</h3>
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-2 font-medium sticky left-0 bg-muted/50">Agente</th>
                      {agentDayTable.days.map((d) => (
                        <th key={d} className="p-2 font-medium text-center min-w-[70px]">
                          {format(parseISO(d), "dd/MM", { locale: es })}
                        </th>
                      ))}
                      <th className="p-2 font-medium text-center bg-muted/80">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agentDayTable.agents.map((agentId) => {
                      const agentName = profileMap[agentId] || agentId.slice(0, 8);
                      let totalL = 0, totalN = 0;
                      return (
                        <tr key={agentId} className="border-b last:border-0">
                          <td className="p-2 font-medium sticky left-0 bg-background">{agentName}</td>
                          {agentDayTable.days.map((d) => {
                            const cell = agentDayTable.map[agentId]?.[d];
                            if (cell) { totalL += cell.links; totalN += cell.numbers; }
                            return (
                              <td key={d} className="p-2 text-center">
                                {cell ? (
                                  <span>
                                    <span className="text-primary font-medium">{cell.links}</span>
                                    <span className="text-muted-foreground mx-0.5">/</span>
                                    <span className="text-green-600 font-medium">{cell.numbers}</span>
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="p-2 text-center bg-muted/30 font-medium">
                            <span className="text-primary">{totalL}</span>
                            <span className="text-muted-foreground mx-0.5">/</span>
                            <span className="text-green-600">{totalN}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Formato: <span className="text-primary">Links</span> / <span className="text-green-600">Números</span></p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default SuperContactsProductivityModal;
