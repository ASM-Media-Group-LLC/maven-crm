import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, Legend, LabelList, ComposedChart, Line,
} from "recharts";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { getCountryFlag, getCountryName } from "@/lib/country-utils";
import CategoryAuditLog from "./CategoryAuditLog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: string;
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

// Phone prefix → ISO code mapping for resolving country_code field
const PHONE_TO_CODE: Record<string, string> = {
  "+54": "AR", "+591": "BO", "+55": "BR", "+44": "GB", "+56": "CL",
  "+57": "CO", "+506": "CR", "+53": "CU", "+1809": "DO", "+593": "EC",
  "+503": "SV", "+34": "ES", "+1": "US", "+502": "GT", "+504": "HN",
  "+39": "IT", "+52": "MX", "+505": "NI", "+507": "PA", "+595": "PY",
  "+51": "PE", "+1787": "PR", "+66": "TH", "+598": "UY", "+58": "VE",
};

/** Resolve a country_code (ISO, phone prefix, or country name) to a clean ISO code */
function resolveToISO(raw: string | null): string {
  if (!raw) return "N/A";
  const trimmed = raw.trim();
  if (!trimmed) return "N/A";

  // Already a 2-letter ISO code
  if (/^[A-Z]{2}$/i.test(trimmed)) return trimmed.toUpperCase();

  // Phone prefix → try longest match first
  if (trimmed.startsWith("+")) {
    for (const len of [5, 4, 3, 2]) {
      const prefix = trimmed.slice(0, len);
      if (PHONE_TO_CODE[prefix]) return PHONE_TO_CODE[prefix];
    }
  }

  // Try as country name via getCountryName (returns same input if not found)
  const nameResolved = getCountryName(trimmed);
  if (nameResolved !== trimmed) {
    // It was resolved — now find the code
    const flag = getCountryFlag(trimmed);
    if (flag) {
      // Find by flag match — iterate known codes
      for (const code of Object.keys(PHONE_TO_CODE)) {
        // skip, use a reverse approach
      }
    }
  }

  return trimmed.toUpperCase();
}

const ContactosAnalyticsModal = ({ open, onOpenChange, defaultTab = "monthly" }: Props) => {
  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ["contactos-analytics-full"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("closers_contacts")
        .select("created_at, created_by, country_code, physical_appearance, status, city, handle")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch creator handles to determine conversions
  const { data: creatorHandles = new Set<string>() } = useQuery({
    queryKey: ["creator-handles-for-analytics"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creators")
        .select("instagram_handle");
      if (error) throw error;
      const set = new Set<string>();
      (data ?? []).forEach((c) => {
        if (c.instagram_handle) {
          set.add(c.instagram_handle.toLowerCase().replace(/^@+/, "").trim());
        }
      });
      return set;
    },
  });

  // Fetch closer_creators with revenue data
  const { data: closerCreators = [] } = useQuery({
    queryKey: ["contactos-closer-creators-revenue"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("closer_creators")
        .select("id, source_contact_id, estimated_monetization, stage, created_at, assigned_to");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch platform sales
  const { data: platformSales = [] } = useQuery({
    queryKey: ["contactos-platform-sales-revenue"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("closer_platform_sales")
        .select("creator_id, price, platform");
      if (error) throw error;
      return data ?? [];
    },
  });

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
        .rpc("get_agent_names", { _user_ids: agentIds });
      if (error) throw error;
      const map: Record<string, string> = {};
      (data ?? []).forEach((p: any) => { map[p.id] = p.full_name || "Sin nombre"; });
      return map;
    },
  });

  const shortName = (full: string) => {
    const parts = full.trim().split(/\s+/);
    if (parts.length <= 1) return full;
    return `${parts[0]} ${parts[1]?.[0] || ""}.`;
  };

  const isConverted = (handle: string) => {
    if (!handle) return false;
    const normalized = handle.toLowerCase().replace(/^@+/, "").trim();
    return creatorHandles instanceof Set && creatorHandles.has(normalized);
  };

  // 1. Monthly trend with conversions
  const monthlyData = useMemo(() => {
    if (!contacts.length) return [];
    const months: Record<string, { count: number; converted: number }> = {};
    contacts.forEach((c) => {
      if (!c.created_at) return;
      const key = format(parseISO(c.created_at), "yyyy-MM");
      if (!months[key]) months[key] = { count: 0, converted: 0 };
      months[key].count += 1;
      if (isConverted(c.handle)) months[key].converted += 1;
    });
    const keys = Object.keys(months).sort();
    if (!keys.length) return [];
    const result: { label: string; count: number; converted: number; cumulative: number; convRate: string }[] = [];
    let cumulative = 0;
    const start = parseISO(`${keys[0]}-01`);
    const end = parseISO(`${keys[keys.length - 1]}-01`);
    const current = new Date(start);
    while (current <= end) {
      const key = format(current, "yyyy-MM");
      const count = months[key]?.count || 0;
      const converted = months[key]?.converted || 0;
      cumulative += count;
      const convRate = count > 0 ? `${Math.round((converted / count) * 100)}%` : "0%";
      result.push({ label: format(current, "MMM yy", { locale: es }), count, converted, cumulative, convRate });
      current.setMonth(current.getMonth() + 1);
    }
    return result;
  }, [contacts, creatorHandles]);

  // KPIs
  const kpis = useMemo(() => {
    if (!monthlyData.length) return { total: 0, totalConverted: 0, avg: 0, bestMonth: "", bestCount: 0, convRate: "0%" };
    const total = monthlyData.reduce((s, m) => s + m.count, 0);
    const totalConverted = monthlyData.reduce((s, m) => s + m.converted, 0);
    const avg = Math.round(total / monthlyData.length);
    let bestMonth = "";
    let bestCount = 0;
    monthlyData.forEach((m) => { if (m.count > bestCount) { bestCount = m.count; bestMonth = m.label; } });
    const convRate = total > 0 ? `${Math.round((totalConverted / total) * 100)}%` : "0%";
    return { total, totalConverted, avg, bestMonth, bestCount, convRate };
  }, [monthlyData]);

  // 2. By agent
  const agentData = useMemo(() => {
    const map: Record<string, number> = {};
    contacts.forEach((c) => {
      const name = (c.created_by && profiles[c.created_by]) || "Sin asignar";
      map[name] = (map[name] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, count]) => ({ name: shortName(name), fullName: name, count }))
      .sort((a, b) => b.count - a.count);
  }, [contacts, profiles]);

  // 3. Agent per month (stacked) with totals
  const agentMonthlyData = useMemo(() => {
    if (!contacts.length) return { data: [] as any[], agents: [] as string[] };
    const agentSet = new Set<string>();
    const monthMap: Record<string, Record<string, number>> = {};
    const monthLabels: Record<string, string> = {};
    contacts.forEach((c) => {
      if (!c.created_at) return;
      const key = format(parseISO(c.created_at), "yyyy-MM");
      const label = format(parseISO(c.created_at), "MMM yy", { locale: es });
      monthLabels[key] = label;
      const agent = shortName((c.created_by && profiles[c.created_by]) || "Sin asignar");
      agentSet.add(agent);
      if (!monthMap[key]) monthMap[key] = {};
      monthMap[key][agent] = (monthMap[key][agent] || 0) + 1;
    });
    const agents = Array.from(agentSet);
    const data = Object.keys(monthMap)
      .sort()
      .map((k) => {
        const row: any = { label: monthLabels[k], ...monthMap[k] };
        row._total = Object.values(monthMap[k]).reduce((s: number, v: number) => s + v, 0);
        return row;
      });
    return { data, agents };
  }, [contacts, profiles]);

  // 4. By country — FIX: use getCountryFlag/getCountryName for proper resolution & grouping
  const countryData = useMemo(() => {
    const map: Record<string, number> = {};
    contacts.forEach((c) => {
      const iso = resolveToISO(c.country_code);
      // Group by resolved name to merge duplicates
      const name = iso !== "N/A" ? getCountryName(iso) || iso : "Sin país";
      map[name] = (map[name] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, count]) => {
        const flag = getCountryFlag(name);
        return {
          name: name !== "Sin país" ? `${flag} ${name}` : "Sin país",
          count,
        };
      })
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

  // 7. By city
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

  // 8. Revenue data
  const revenueData = useMemo(() => {
    // Build map: contact_id → contact info
    const contactMap = new Map<string, typeof contacts[0]>();
    // We need contact IDs — but our query doesn't have id. Use source_contact_id from closer_creators
    // Build map: closer_creator source_contact_id → creator data
    const salesByCreator = new Map<string, number>();
    platformSales.forEach((s) => {
      salesByCreator.set(s.creator_id, (salesByCreator.get(s.creator_id) || 0) + (s.price || 0));
    });

    const activeStages = new Set(["Completada", "Confirmada", "completada", "confirmada"]);
    
    let totalOF = 0;
    let totalPlatform = 0;
    let monetizedCount = 0;
    const monthlyRevenue: Record<string, { of: number; platform: number }> = {};
    const agentRevenue: Record<string, { contacts: number; converted: number; revenue: number }> = {};

    // Process closer_creators that came from contacts
    closerCreators.forEach((cc) => {
      const ofRev = (activeStages.has(cc.stage) && cc.estimated_monetization) ? cc.estimated_monetization : 0;
      const platRev = salesByCreator.get(cc.id) || 0;
      
      if (ofRev > 0 || platRev > 0) monetizedCount++;
      totalOF += ofRev;
      totalPlatform += platRev;

      // Monthly grouping by creator created_at
      if (cc.created_at) {
        const key = format(parseISO(cc.created_at), "yyyy-MM");
        if (!monthlyRevenue[key]) monthlyRevenue[key] = { of: 0, platform: 0 };
        monthlyRevenue[key].of += ofRev;
        monthlyRevenue[key].platform += platRev;
      }

      // Agent revenue
      const agentId = cc.assigned_to || "sin_asignar";
      if (!agentRevenue[agentId]) agentRevenue[agentId] = { contacts: 0, converted: 0, revenue: 0 };
      agentRevenue[agentId].converted += 1;
      agentRevenue[agentId].revenue += ofRev + platRev;
    });

    // Count contacts per agent
    contacts.forEach((c) => {
      const agentId = c.created_by || "sin_asignar";
      if (!agentRevenue[agentId]) agentRevenue[agentId] = { contacts: 0, converted: 0, revenue: 0 };
      agentRevenue[agentId].contacts += 1;
    });

    const totalRevenue = totalOF + totalPlatform;
    const totalConverted = closerCreators.filter(cc => activeStages.has(cc.stage)).length;
    const monetizationRate = totalConverted > 0 ? Math.round((monetizedCount / totalConverted) * 100) : 0;

    // Monthly chart data
    const monthlyKeys = Object.keys(monthlyRevenue).sort();
    const monthlyChart = monthlyKeys.map((k) => ({
      label: format(parseISO(`${k}-01`), "MMM yy", { locale: es }),
      of: Math.round(monthlyRevenue[k].of),
      platform: Math.round(monthlyRevenue[k].platform),
      total: Math.round(monthlyRevenue[k].of + monthlyRevenue[k].platform),
    }));

    // Agent ranking
    const agentRanking = Object.entries(agentRevenue)
      .map(([id, data]) => ({
        name: shortName((id !== "sin_asignar" && profiles[id]) || "Sin asignar"),
        fullName: (id !== "sin_asignar" && profiles[id]) || "Sin asignar",
        ...data,
      }))
      .filter((a) => a.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    return {
      totalOF,
      totalPlatform,
      totalRevenue,
      monetizationRate,
      monthlyChart,
      agentRanking,
    };
  }, [closerCreators, platformSales, contacts, profiles]);

  const total = contacts.length;

  const tooltipStyle = {
    backgroundColor: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 8,
    fontSize: 12,
  };

  const MonthlyTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const count = payload.find((p: any) => p.dataKey === "count")?.value || 0;
    const converted = payload.find((p: any) => p.dataKey === "converted")?.value || 0;
    const cumulative = payload.find((p: any) => p.dataKey === "cumulative")?.value || 0;
    const rate = count > 0 ? Math.round((converted / count) * 100) : 0;
    return (
      <div style={tooltipStyle} className="p-2 shadow-lg">
        <p className="font-semibold text-foreground">{label}</p>
        <p className="text-sm" style={{ color: "hsl(210, 70%, 55%)" }}>Contactos: {count}</p>
        <p className="text-sm" style={{ color: "hsl(150, 60%, 45%)" }}>Convertidos: {converted} ({rate}%)</p>
        <p className="text-sm text-muted-foreground">Acumulado: {cumulative}</p>
      </div>
    );
  };

  const RevenueTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const of = payload.find((p: any) => p.dataKey === "of")?.value || 0;
    const platform = payload.find((p: any) => p.dataKey === "platform")?.value || 0;
    return (
      <div style={tooltipStyle} className="p-2 shadow-lg">
        <p className="font-semibold text-foreground">{label}</p>
        <p className="text-sm" style={{ color: "hsl(280, 60%, 55%)" }}>OF: ${of.toLocaleString()}</p>
        <p className="text-sm" style={{ color: "hsl(45, 80%, 50%)" }}>Plataformas: ${platform.toLocaleString()}</p>
        <p className="text-sm text-muted-foreground">Total: ${(of + platform).toLocaleString()}</p>
      </div>
    );
  };

  const fmtMoney = (n: number) => `$${Math.round(n).toLocaleString()}`;

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
          <Tabs defaultValue={defaultTab} key={defaultTab} className="flex-1 min-h-0 flex flex-col">
            <TabsList className="shrink-0 w-full justify-start flex-wrap h-auto gap-1 p-1">
              <TabsTrigger value="monthly">Por Mes</TabsTrigger>
              <TabsTrigger value="agents">Por Agente</TabsTrigger>
              <TabsTrigger value="agentTrend">Agente × Mes</TabsTrigger>
              <TabsTrigger value="revenue">Revenue</TabsTrigger>
              <TabsTrigger value="country">Por País</TabsTrigger>
              <TabsTrigger value="city">Por Ciudad</TabsTrigger>
              <TabsTrigger value="category">Categoría</TabsTrigger>
              <TabsTrigger value="status">Estado</TabsTrigger>
              <TabsTrigger value="audit" className="text-amber-500">⚠ Auditoría</TabsTrigger>
            </TabsList>

            <div className="flex-1 min-h-0 overflow-auto pt-4">
              {/* Monthly with KPIs and dual bars */}
              <TabsContent value="monthly" className="mt-0">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-xs text-muted-foreground">Total Registrados</p>
                    <p className="text-xl font-bold text-foreground">{kpis.total}</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-xs text-muted-foreground">Convertidos a Creadoras</p>
                    <p className="text-xl font-bold" style={{ color: "hsl(150, 60%, 45%)" }}>{kpis.totalConverted}</p>
                    <p className="text-xs text-muted-foreground">{kpis.convRate} tasa</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-xs text-muted-foreground">Promedio Mensual</p>
                    <p className="text-xl font-bold text-foreground">{kpis.avg}</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-xs text-muted-foreground">Mejor Mes</p>
                    <p className="text-xl font-bold text-foreground">{kpis.bestCount}</p>
                    <p className="text-xs text-muted-foreground">{kpis.bestMonth}</p>
                  </div>
                </div>

                <div className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis yAxisId="right" orientation="right" allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip content={<MonthlyTooltip />} />
                      <Bar yAxisId="left" dataKey="count" fill="hsl(210, 70%, 55%)" radius={[4, 4, 0, 0]} name="Contactos">
                        <LabelList dataKey="count" position="top" style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      </Bar>
                      <Bar yAxisId="left" dataKey="converted" fill="hsl(150, 60%, 45%)" radius={[4, 4, 0, 0]} name="Convertidos">
                        <LabelList dataKey="converted" position="top" style={{ fontSize: 10, fill: "hsl(150, 60%, 45%)" }} formatter={(v: number) => v > 0 ? v : ""} />
                      </Bar>
                      <Line yAxisId="right" type="monotone" dataKey="cumulative" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Acumulado" />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </TabsContent>

              {/* By Agent */}
              <TabsContent value="agents" className="mt-0 h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={agentData} layout="vertical" margin={{ left: 80, right: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={80} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number, _: any, props: any) => [v, props.payload.fullName]} />
                    <Bar dataKey="count" fill="hsl(210, 70%, 55%)" radius={[0, 4, 4, 0]}>
                      <LabelList dataKey="count" position="right" style={{ fontSize: 11, fontWeight: 600, fill: "hsl(var(--foreground))" }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </TabsContent>

              {/* Agent x Month (stacked) with totals */}
              <TabsContent value="agentTrend" className="mt-0 h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={agentMonthlyData.data}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    {agentMonthlyData.agents.map((agent, i) => (
                      <Bar key={agent} dataKey={agent} stackId="a" fill={COLORS[i % COLORS.length]}>
                        <LabelList dataKey={agent} position="inside" style={{ fontSize: 9, fill: "#fff" }} formatter={(v: number) => v > 0 ? v : ""} />
                      </Bar>
                    ))}
                    {agentMonthlyData.agents.length > 0 && (
                      <Bar dataKey="_total" stackId="b" fill="transparent" isAnimationActive={false}>
                        <LabelList dataKey="_total" position="top" style={{ fontSize: 11, fontWeight: 700, fill: "hsl(var(--foreground))" }} />
                      </Bar>
                    )}
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </BarChart>
                </ResponsiveContainer>
              </TabsContent>

              {/* Revenue Tab */}
              <TabsContent value="revenue" className="mt-0">
                {/* KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-xs text-muted-foreground">Revenue OF</p>
                    <p className="text-xl font-bold" style={{ color: "hsl(280, 60%, 55%)" }}>{fmtMoney(revenueData.totalOF)}</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-xs text-muted-foreground">Revenue Plataformas</p>
                    <p className="text-xl font-bold" style={{ color: "hsl(45, 80%, 50%)" }}>{fmtMoney(revenueData.totalPlatform)}</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-xs text-muted-foreground">Revenue Total</p>
                    <p className="text-xl font-bold text-foreground">{fmtMoney(revenueData.totalRevenue)}</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-xs text-muted-foreground">Tasa Monetización</p>
                    <p className="text-xl font-bold text-foreground">{revenueData.monetizationRate}%</p>
                  </div>
                </div>

                {/* Monthly Revenue Chart */}
                {revenueData.monthlyChart.length > 0 ? (
                  <div className="h-[280px] mb-6">
                    <p className="text-xs text-muted-foreground mb-2 font-semibold">Revenue por Mes</p>
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={revenueData.monthlyChart}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                        <Tooltip content={<RevenueTooltip />} />
                        <Bar dataKey="of" fill="hsl(280, 60%, 55%)" radius={[4, 4, 0, 0]} name="OF" stackId="rev">
                          <LabelList dataKey="of" position="inside" style={{ fontSize: 9, fill: "#fff" }} formatter={(v: number) => v > 0 ? `$${(v / 1000).toFixed(1)}k` : ""} />
                        </Bar>
                        <Bar dataKey="platform" fill="hsl(45, 80%, 50%)" radius={[4, 4, 0, 0]} name="Plataformas" stackId="rev">
                          <LabelList dataKey="platform" position="inside" style={{ fontSize: 9, fill: "#fff" }} formatter={(v: number) => v > 0 ? `$${(v / 1000).toFixed(1)}k` : ""} />
                        </Bar>
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground mb-6">
                    Sin datos de revenue todavía. Conforme se conviertan contactos y se registre monetización, los datos aparecerán aquí.
                  </div>
                )}

                {/* Agent Revenue Ranking */}
                {revenueData.agentRanking.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2 font-semibold">Top Agentes por Revenue</p>
                    <div className="rounded-lg border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left p-2 text-xs font-semibold text-muted-foreground">#</th>
                            <th className="text-left p-2 text-xs font-semibold text-muted-foreground">Agente</th>
                            <th className="text-right p-2 text-xs font-semibold text-muted-foreground">Contactos</th>
                            <th className="text-right p-2 text-xs font-semibold text-muted-foreground">Conv.</th>
                            <th className="text-right p-2 text-xs font-semibold text-muted-foreground">Revenue</th>
                          </tr>
                        </thead>
                        <tbody>
                          {revenueData.agentRanking.map((a, i) => (
                            <tr key={i} className="border-b last:border-0">
                              <td className="p-2 text-xs text-muted-foreground">{i + 1}</td>
                              <td className="p-2 text-xs font-medium text-foreground">{a.fullName}</td>
                              <td className="p-2 text-xs text-right text-muted-foreground">{a.contacts}</td>
                              <td className="p-2 text-xs text-right" style={{ color: "hsl(150, 60%, 45%)" }}>{a.converted}</td>
                              <td className="p-2 text-xs text-right font-semibold text-foreground">{fmtMoney(a.revenue)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* By Country */}
              <TabsContent value="country" className="mt-0 h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={countryData} layout="vertical" margin={{ left: 140, right: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={140} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v, "Contactos"]} />
                    <Bar dataKey="count" fill="hsl(150, 60%, 45%)" radius={[0, 4, 4, 0]}>
                      <LabelList dataKey="count" position="right" style={{ fontSize: 11, fontWeight: 600, fill: "hsl(var(--foreground))" }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </TabsContent>

              {/* By City */}
              <TabsContent value="city" className="mt-0 h-[400px]">
                {cityData.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                    No hay datos de ciudad disponibles todavía.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cityData} layout="vertical" margin={{ left: 100 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={100} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v, "Contactos"]} />
                      <Bar dataKey="count" fill="hsl(180, 50%, 45%)" radius={[0, 4, 4, 0]}>
                        <LabelList dataKey="count" position="right" style={{ fontSize: 11, fontWeight: 600, fill: "hsl(var(--foreground))" }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </TabsContent>

              {/* Category */}
              <TabsContent value="category" className="mt-0 h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categoryData} layout="vertical" margin={{ left: 120, right: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={120} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v, "Contactos"]} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {categoryData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                      <LabelList dataKey="value" position="right" style={{ fontSize: 11, fontWeight: 600, fill: "hsl(var(--foreground))" }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </TabsContent>

              {/* Status */}
              <TabsContent value="status" className="mt-0 h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statusData} layout="vertical" margin={{ left: 100, right: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={100} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v, "Contactos"]} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {statusData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                      <LabelList dataKey="value" position="right" style={{ fontSize: 11, fontWeight: 600, fill: "hsl(var(--foreground))" }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </TabsContent>

              <TabsContent value="audit" className="mt-0">
                <CategoryAuditLog open={open} />
              </TabsContent>
            </div>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ContactosAnalyticsModal;
