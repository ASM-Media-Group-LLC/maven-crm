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

  // Fetch creator monetization (real monthly revenue tracking)
  const { data: creatorMonetization = [] } = useQuery({
    queryKey: ["contactos-creator-monetization"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creator_monetization")
        .select("creator_id, month_year, amount");
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
    const salesByCreator = new Map<string, number>();
    const salesByPlatform = new Map<string, number>();
    platformSales.forEach((s) => {
      salesByCreator.set(s.creator_id, (salesByCreator.get(s.creator_id) || 0) + (s.price || 0));
      salesByPlatform.set(s.platform, (salesByPlatform.get(s.platform) || 0) + (s.price || 0));
    });

    // Real monetization data by month
    const realMonthlyRev: Record<string, number> = {};
    let totalMonetization = 0;
    creatorMonetization.forEach((m) => {
      const amt = m.amount || 0;
      totalMonetization += amt;
      if (m.month_year) {
        const key = format(parseISO(m.month_year), "yyyy-MM");
        realMonthlyRev[key] = (realMonthlyRev[key] || 0) + amt;
      }
    });

    const activeStages = new Set(["Completada", "Confirmada", "completada", "confirmada"]);
    
    let totalOF = 0;
    let totalPlatform = 0;
    let monetizedCount = 0;
    const monthlyRevenue: Record<string, { of: number; platform: number; monetization: number }> = {};
    const agentRevenue: Record<string, { contacts: number; converted: number; revenue: number }> = {};

    closerCreators.forEach((cc) => {
      const ofRev = (activeStages.has(cc.stage) && cc.estimated_monetization) ? cc.estimated_monetization : 0;
      const platRev = salesByCreator.get(cc.id) || 0;
      
      if (ofRev > 0 || platRev > 0) monetizedCount++;
      totalOF += ofRev;
      totalPlatform += platRev;

      if (cc.created_at) {
        const key = format(parseISO(cc.created_at), "yyyy-MM");
        if (!monthlyRevenue[key]) monthlyRevenue[key] = { of: 0, platform: 0, monetization: 0 };
        monthlyRevenue[key].of += ofRev;
        monthlyRevenue[key].platform += platRev;
      }

      const agentId = cc.assigned_to || "sin_asignar";
      if (!agentRevenue[agentId]) agentRevenue[agentId] = { contacts: 0, converted: 0, revenue: 0 };
      agentRevenue[agentId].converted += 1;
      agentRevenue[agentId].revenue += ofRev + platRev;
    });

    // Merge real monetization into monthly
    Object.entries(realMonthlyRev).forEach(([key, amt]) => {
      if (!monthlyRevenue[key]) monthlyRevenue[key] = { of: 0, platform: 0, monetization: 0 };
      monthlyRevenue[key].monetization += amt;
    });

    contacts.forEach((c) => {
      const agentId = c.created_by || "sin_asignar";
      if (!agentRevenue[agentId]) agentRevenue[agentId] = { contacts: 0, converted: 0, revenue: 0 };
      agentRevenue[agentId].contacts += 1;
    });

    const totalRevenue = totalOF + totalPlatform;
    const totalConverted = closerCreators.filter(cc => activeStages.has(cc.stage)).length;
    const monetizationRate = totalConverted > 0 ? Math.round((monetizedCount / totalConverted) * 100) : 0;
    const avgRevenuePerCreator = totalConverted > 0 ? Math.round(totalRevenue / totalConverted) : 0;

    // Monthly chart data with all revenue streams
    const allMonthKeys = new Set([...Object.keys(monthlyRevenue)]);
    const monthlyChart = Array.from(allMonthKeys).sort().map((k) => ({
      label: format(parseISO(`${k}-01`), "MMM yy", { locale: es }),
      of: Math.round(monthlyRevenue[k]?.of || 0),
      platform: Math.round(monthlyRevenue[k]?.platform || 0),
      monetization: Math.round(monthlyRevenue[k]?.monetization || 0),
      total: Math.round((monthlyRevenue[k]?.of || 0) + (monthlyRevenue[k]?.platform || 0) + (monthlyRevenue[k]?.monetization || 0)),
    }));

    // Platform breakdown
    const platformBreakdown = Array.from(salesByPlatform.entries())
      .map(([platform, revenue]) => ({ platform, revenue: Math.round(revenue) }))
      .sort((a, b) => b.revenue - a.revenue);

    // Agent ranking
    const agentRanking = Object.entries(agentRevenue)
      .map(([id, data]) => ({
        name: shortName((id !== "sin_asignar" && profiles[id]) || "Sin asignar"),
        fullName: (id !== "sin_asignar" && profiles[id]) || "Sin asignar",
        ...data,
        convRate: data.contacts > 0 ? Math.round((data.converted / data.contacts) * 100) : 0,
      }))
      .filter((a) => a.revenue > 0 || a.converted > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // Stage funnel
    const stageCounts: Record<string, number> = {};
    closerCreators.forEach((cc) => {
      stageCounts[cc.stage] = (stageCounts[cc.stage] || 0) + 1;
    });
    const stageFunnel = Object.entries(stageCounts)
      .map(([stage, count]) => ({ stage, count }))
      .sort((a, b) => b.count - a.count);

    return {
      totalOF,
      totalPlatform,
      totalRevenue,
      totalMonetization,
      monetizationRate,
      avgRevenuePerCreator,
      totalConverted,
      totalLeads: closerCreators.length,
      monthlyChart,
      agentRanking,
      platformBreakdown,
      stageFunnel,
    };
  }, [closerCreators, platformSales, contacts, profiles, creatorMonetization]);

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
    const monetization = payload.find((p: any) => p.dataKey === "monetization")?.value || 0;
    const total = of + platform + monetization;
    return (
      <div style={tooltipStyle} className="p-2 shadow-lg">
        <p className="font-semibold text-foreground">{label}</p>
        <p className="text-sm" style={{ color: "hsl(280, 60%, 55%)" }}>OF: ${of.toLocaleString()}</p>
        <p className="text-sm" style={{ color: "hsl(45, 80%, 50%)" }}>Plataformas: ${platform.toLocaleString()}</p>
        {monetization > 0 && <p className="text-sm" style={{ color: "hsl(150, 60%, 45%)" }}>Monetización: ${monetization.toLocaleString()}</p>}
        <p className="text-sm font-semibold text-foreground">Total: ${total.toLocaleString()}</p>
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
                {/* KPI Row 1 */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-xs text-muted-foreground">Revenue OF</p>
                    <p className="text-xl font-bold" style={{ color: "hsl(280, 60%, 55%)" }}>{fmtMoney(revenueData.totalOF)}</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-xs text-muted-foreground">Revenue Plataformas</p>
                    <p className="text-xl font-bold" style={{ color: "hsl(45, 80%, 50%)" }}>{fmtMoney(revenueData.totalPlatform)}</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-xs text-muted-foreground">Monetización Real</p>
                    <p className="text-xl font-bold" style={{ color: "hsl(150, 60%, 45%)" }}>{fmtMoney(revenueData.totalMonetization)}</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-xs text-muted-foreground">Revenue Total</p>
                    <p className="text-xl font-bold text-foreground">{fmtMoney(revenueData.totalRevenue)}</p>
                  </div>
                </div>

                {/* KPI Row 2 */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-xs text-muted-foreground">Total Leads</p>
                    <p className="text-lg font-bold text-foreground">{revenueData.totalLeads}</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-xs text-muted-foreground">Convertidos</p>
                    <p className="text-lg font-bold" style={{ color: "hsl(150, 60%, 45%)" }}>{revenueData.totalConverted}</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-xs text-muted-foreground">Rev. Prom/Creadora</p>
                    <p className="text-lg font-bold text-foreground">{fmtMoney(revenueData.avgRevenuePerCreator)}</p>
                  </div>
                  <div className="rounded-lg border bg-card p-3 text-center">
                    <p className="text-xs text-muted-foreground">Tasa Monetización</p>
                    <p className="text-lg font-bold text-foreground">{revenueData.monetizationRate}%</p>
                  </div>
                </div>

                {/* Stage Funnel */}
                {revenueData.stageFunnel.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs text-muted-foreground mb-2 font-semibold">Funnel por Etapa</p>
                    <div className="flex gap-1 h-6 rounded-md overflow-hidden">
                      {revenueData.stageFunnel.map((s, i) => {
                        const pct = revenueData.totalLeads > 0 ? (s.count / revenueData.totalLeads) * 100 : 0;
                        return (
                          <div
                            key={s.stage}
                            className="flex items-center justify-center text-[9px] font-medium text-white"
                            style={{ width: `${Math.max(pct, 3)}%`, backgroundColor: COLORS[i % COLORS.length] }}
                            title={`${s.stage}: ${s.count} (${Math.round(pct)}%)`}
                          >
                            {pct > 8 ? `${s.stage} (${s.count})` : ""}
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap gap-3 mt-1">
                      {revenueData.stageFunnel.map((s, i) => (
                        <span key={s.stage} className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          {s.stage}: {s.count}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Monthly Revenue Chart */}
                {revenueData.monthlyChart.length > 0 ? (
                  <div className="h-[280px] mb-4">
                    <p className="text-xs text-muted-foreground mb-2 font-semibold">Revenue por Mes</p>
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={revenueData.monthlyChart}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                        <Tooltip content={<RevenueTooltip />} />
                        <Bar dataKey="of" fill="hsl(280, 60%, 55%)" radius={[4, 4, 0, 0]} name="OF" stackId="rev" />
                        <Bar dataKey="platform" fill="hsl(45, 80%, 50%)" radius={[0, 0, 0, 0]} name="Plataformas" stackId="rev" />
                        <Bar dataKey="monetization" fill="hsl(150, 60%, 45%)" radius={[4, 4, 0, 0]} name="Monetización" stackId="rev" />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-[150px] text-sm text-muted-foreground mb-4">
                    Sin datos de revenue todavía.
                  </div>
                )}

                {/* Platform Breakdown + Agent Ranking side by side */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Platform breakdown */}
                  {revenueData.platformBreakdown.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2 font-semibold">Ventas por Plataforma</p>
                      <div className="rounded-lg border overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/50">
                              <th className="text-left p-2 text-xs font-semibold text-muted-foreground">Plataforma</th>
                              <th className="text-right p-2 text-xs font-semibold text-muted-foreground">Revenue</th>
                            </tr>
                          </thead>
                          <tbody>
                            {revenueData.platformBreakdown.map((p, i) => (
                              <tr key={i} className="border-b last:border-0">
                                <td className="p-2 text-xs font-medium text-foreground">{p.platform}</td>
                                <td className="p-2 text-xs text-right font-semibold text-foreground">{fmtMoney(p.revenue)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
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
                              <th className="text-right p-2 text-xs font-semibold text-muted-foreground">Conv.</th>
                              <th className="text-right p-2 text-xs font-semibold text-muted-foreground">%Conv</th>
                              <th className="text-right p-2 text-xs font-semibold text-muted-foreground">Revenue</th>
                            </tr>
                          </thead>
                          <tbody>
                            {revenueData.agentRanking.map((a, i) => (
                              <tr key={i} className="border-b last:border-0">
                                <td className="p-2 text-xs text-muted-foreground">{i + 1}</td>
                                <td className="p-2 text-xs font-medium text-foreground">{a.fullName}</td>
                                <td className="p-2 text-xs text-right" style={{ color: "hsl(150, 60%, 45%)" }}>{a.converted}</td>
                                <td className="p-2 text-xs text-right text-muted-foreground">{a.convRate}%</td>
                                <td className="p-2 text-xs text-right font-semibold text-foreground">{fmtMoney(a.revenue)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
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
