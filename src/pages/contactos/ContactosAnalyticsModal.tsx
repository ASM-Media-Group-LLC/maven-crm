import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { getCountryFlag, getCountryName } from "@/lib/country-utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(210, 70%, 55%)",
  "hsl(150, 60%, 45%)",
  "hsl(45, 80%, 50%)",
  "hsl(0, 65%, 55%)",
  "hsl(280, 60%, 55%)",
  "hsl(180, 50%, 45%)",
  "hsl(30, 70%, 50%)",
];

const ContactosAnalyticsModal = ({ open, onOpenChange }: Props) => {
  // Fetch all contacts with created_by
  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ["contactos-analytics-full"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("closers_contacts")
        .select("created_at, created_by, country_code, physical_appearance, status, city")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch profiles for agent names
  const agentIds = useMemo(() => {
    const ids = new Set<string>();
    contacts.forEach((c) => { if (c.created_by) ids.add(c.created_by); });
    return Array.from(ids);
  }, [contacts]);

  const { data: profiles = {} } = useQuery({
    queryKey: ["analytics-profiles", agentIds],
    enabled: agentIds.length > 0 && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", agentIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data ?? []).forEach((p) => { map[p.id] = p.full_name || "Sin nombre"; });
      return map;
    },
  });

  // === Chart data ===

  // 1. Monthly trend
  const monthlyData = useMemo(() => {
    if (!contacts.length) return [];
    const months: Record<string, number> = {};
    contacts.forEach((c) => {
      if (!c.created_at) return;
      const key = format(parseISO(c.created_at), "yyyy-MM");
      months[key] = (months[key] || 0) + 1;
    });
    const keys = Object.keys(months).sort();
    if (!keys.length) return [];
    const result: { label: string; count: number; cumulative: number }[] = [];
    let cumulative = 0;
    const start = parseISO(`${keys[0]}-01`);
    const end = parseISO(`${keys[keys.length - 1]}-01`);
    const current = new Date(start);
    while (current <= end) {
      const key = format(current, "yyyy-MM");
      const count = months[key] || 0;
      cumulative += count;
      result.push({ label: format(current, "MMM yy", { locale: es }), count, cumulative });
      current.setMonth(current.getMonth() + 1);
    }
    return result;
  }, [contacts]);

  // 2. By agent
  const agentData = useMemo(() => {
    const map: Record<string, number> = {};
    contacts.forEach((c) => {
      const name = (c.created_by && profiles[c.created_by]) || "Sin asignar";
      map[name] = (map[name] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [contacts, profiles]);

  // 3. By agent per month (stacked)
  const agentMonthlyData = useMemo(() => {
    if (!contacts.length) return { data: [] as any[], agents: [] as string[] };
    const agentSet = new Set<string>();
    const monthMap: Record<string, Record<string, number>> = {};
    contacts.forEach((c) => {
      if (!c.created_at) return;
      const month = format(parseISO(c.created_at), "MMM yy", { locale: es });
      const key = format(parseISO(c.created_at), "yyyy-MM");
      const agent = (c.created_by && profiles[c.created_by]) || "Sin asignar";
      agentSet.add(agent);
      if (!monthMap[key]) monthMap[key] = { _label: month as any };
      monthMap[key][agent] = (monthMap[key][agent] || 0) + 1;
    });
    const agents = Array.from(agentSet);
    const data = Object.keys(monthMap)
      .sort()
      .map((k) => ({ label: monthMap[k]._label, ...monthMap[k] }));
    return { data, agents };
  }, [contacts, profiles]);

  // 4. By country
  const countryData = useMemo(() => {
    const map: Record<string, number> = {};
    contacts.forEach((c) => {
      const country = c.country_code || "N/A";
      map[country] = (map[country] || 0) + 1;
    });
    return Object.entries(map)
      .map(([code, count]) => ({
        name: code !== "N/A" ? `${getCountryFlag(code)} ${getCountryName(code) || code}` : "Sin país",
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [contacts]);

  // 5. By category
  const categoryData = useMemo(() => {
    const map: Record<string, number> = {};
    contacts.forEach((c) => {
      const cat = c.physical_appearance || "Sin categoría";
      map[cat] = (map[cat] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [contacts]);

  // 6. By status
  const statusLabels: Record<string, string> = {
    new: "Nuevo", contacted: "Contactado", interested: "Interesado",
    not_interested: "Descartado", converted: "Convertido",
  };
  const statusData = useMemo(() => {
    const map: Record<string, number> = {};
    contacts.forEach((c) => {
      const s = statusLabels[c.status || ""] || c.status || "Sin estado";
      map[s] = (map[s] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [contacts]);

  // 7. By city (top 10)
  const cityData = useMemo(() => {
    const map: Record<string, number> = {};
    contacts.forEach((c) => {
      if (c.city) map[c.city] = (map[c.city] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [contacts]);

  const total = contacts.length;

  const tooltipStyle = {
    backgroundColor: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 8,
    fontSize: 12,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Analítica de Contactos</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Total histórico: <span className="font-semibold text-foreground">{total}</span> contactos
          </p>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">Cargando datos…</p>
          </div>
        ) : (
          <Tabs defaultValue="monthly" className="flex-1 min-h-0 flex flex-col">
            <TabsList className="shrink-0 w-full justify-start flex-wrap h-auto gap-1 p-1">
              <TabsTrigger value="monthly">Por Mes</TabsTrigger>
              <TabsTrigger value="agents">Por Agente</TabsTrigger>
              <TabsTrigger value="agentTrend">Agente × Mes</TabsTrigger>
              <TabsTrigger value="country">Por País</TabsTrigger>
              <TabsTrigger value="city">Por Ciudad</TabsTrigger>
              <TabsTrigger value="category">Categoría</TabsTrigger>
              <TabsTrigger value="status">Estado</TabsTrigger>
            </TabsList>

            <div className="flex-1 min-h-0 overflow-auto pt-4">
              {/* Monthly */}
              <TabsContent value="monthly" className="mt-0 h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v, "Contactos"]} />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </TabsContent>

              {/* By Agent */}
              <TabsContent value="agents" className="mt-0 h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={agentData} layout="vertical" margin={{ left: 100 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={100} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v, "Contactos"]} />
                    <Bar dataKey="count" fill="hsl(210, 70%, 55%)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </TabsContent>

              {/* Agent x Month (stacked) */}
              <TabsContent value="agentTrend" className="mt-0 h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={agentMonthlyData.data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    {agentMonthlyData.agents.map((agent, i) => (
                      <Bar key={agent} dataKey={agent} stackId="a" fill={COLORS[i % COLORS.length]} />
                    ))}
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </BarChart>
                </ResponsiveContainer>
              </TabsContent>

              {/* By Country */}
              <TabsContent value="country" className="mt-0 h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={countryData} layout="vertical" margin={{ left: 120 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={120} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v, "Contactos"]} />
                    <Bar dataKey="count" fill="hsl(150, 60%, 45%)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </TabsContent>

              {/* By City */}
              <TabsContent value="city" className="mt-0 h-[400px]">
                {cityData.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                    No hay datos de ciudad disponibles
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cityData} layout="vertical" margin={{ left: 100 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={100} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v, "Contactos"]} />
                      <Bar dataKey="count" fill="hsl(180, 50%, 45%)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </TabsContent>

              {/* Category Pie */}
              <TabsContent value="category" className="mt-0 h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={140}
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      labelLine
                    >
                      {categoryData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </TabsContent>

              {/* Status Pie */}
              <TabsContent value="status" className="mt-0 h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={140}
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      labelLine
                    >
                      {statusData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </TabsContent>
            </div>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ContactosAnalyticsModal;
