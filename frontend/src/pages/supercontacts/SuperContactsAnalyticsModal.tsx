import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, LabelList, ComposedChart, Line,
} from "recharts";
import { format, parseISO, isWithinInterval } from "date-fns";
import { es } from "date-fns/locale";
import { getCountryFlag } from "@/lib/country-utils";
import { Progress } from "@/components/ui/progress";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { useAllOutreach, type SuperContactOutreach } from "./useSuperContacts";

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

const STATUS_LABELS: Record<string, string> = {
  new: "Nuevo",
  contacted: "Contactado",
  interested: "Interesado",
  not_interested: "No interesado",
  converted: "Convertido",
};

const BRAND_COLORS: Record<string, string> = {
  Cash: "hsl(var(--primary))",
  Exchange: "hsl(210, 70%, 55%)",
  Ora: "hsl(45, 80%, 50%)",
  "Link Hunter": "hsl(150, 60%, 45%)",
  Lumina: "hsl(280, 60%, 55%)",
  BLU: "hsl(0, 65%, 55%)",
  Maven: "hsl(180, 50%, 45%)",
  Blue: "hsl(220, 80%, 60%)",
  Traffix: "hsl(30, 70%, 50%)",
};

const BRANDS = ["Cash", "Exchange", "Ora", "Link Hunter", "Lumina", "BLU", "Maven", "Blue", "Traffix"];

const SuperContactsAnalyticsModal = ({ open, onOpenChange }: Props) => {
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ["super-contacts-analytics"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("super_contacts")
        .select("created_at, status, country, city, category, enriched, followers_count")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: allOutreach = [] } = useAllOutreach(open);

  const filteredOutreach = useMemo(() => {
    if (!dateFrom && !dateTo) return allOutreach;
    return allOutreach.filter((o) => {
      const d = parseISO(o.created_at);
      if (dateFrom && dateTo) return isWithinInterval(d, { start: dateFrom, end: dateTo });
      if (dateFrom) return d >= dateFrom;
      if (dateTo) return d <= dateTo;
      return true;
    });
  }, [allOutreach, dateFrom, dateTo]);

  // --- POR MES ---
  const monthlyData = useMemo(() => {
    if (!contacts.length) return [];
    const map: Record<string, number> = {};
    contacts.forEach((c) => {
      const key = format(parseISO(c.created_at), "yyyy-MM");
      map[key] = (map[key] || 0) + 1;
    });
    const sorted = Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
    let cumulative = 0;
    return sorted.map(([month, count]) => {
      cumulative += count;
      return { month, label: format(parseISO(month + "-01"), "MMM yy", { locale: es }), count, cumulative };
    });
  }, [contacts]);

  const monthlyKPIs = useMemo(() => {
    if (!monthlyData.length) return { total: 0, avg: 0, bestMonth: "—" };
    const total = contacts.length;
    const avg = Math.round(total / monthlyData.length);
    const best = monthlyData.reduce((a, b) => (b.count > a.count ? b : a), monthlyData[0]);
    return { total, avg, bestMonth: best.label };
  }, [contacts, monthlyData]);

  // --- POR ESTADO ---
  const statusData = useMemo(() => {
    const map: Record<string, number> = {};
    contacts.forEach((c) => { const s = c.status || "new"; map[s] = (map[s] || 0) + 1; });
    return Object.entries(map).map(([status, count]) => ({
      status, label: STATUS_LABELS[status] || status, count,
      pct: contacts.length ? Math.round((count / contacts.length) * 100) : 0,
    })).sort((a, b) => b.count - a.count);
  }, [contacts]);

  // --- POR PAÍS ---
  const countryData = useMemo(() => {
    const map: Record<string, number> = {};
    contacts.forEach((c) => { const country = c.country?.trim() || "N/A"; map[country] = (map[country] || 0) + 1; });
    return Object.entries(map).map(([code, count]) => ({
      code, label: code !== "N/A" ? `${getCountryFlag(code)} ${code}` : "N/A", count,
    })).sort((a, b) => b.count - a.count);
  }, [contacts]);

  // --- POR CIUDAD ---
  const cityData = useMemo(() => {
    const map: Record<string, number> = {};
    contacts.forEach((c) => { const city = c.city?.trim(); if (city) map[city] = (map[city] || 0) + 1; });
    return Object.entries(map).map(([city, count]) => ({ city, count })).sort((a, b) => b.count - a.count).slice(0, 15);
  }, [contacts]);

  // --- POR CATEGORÍA ---
  const categoryData = useMemo(() => {
    const map: Record<string, number> = {};
    contacts.forEach((c) => { const cat = c.category?.trim() || "Sin categoría"; map[cat] = (map[cat] || 0) + 1; });
    return Object.entries(map).map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count);
  }, [contacts]);

  // --- ENRICHMENT ---
  const enrichmentStats = useMemo(() => {
    const enriched = contacts.filter((c) => c.enriched).length;
    const notEnriched = contacts.length - enriched;
    const pct = contacts.length ? Math.round((enriched / contacts.length) * 100) : 0;
    return { enriched, notEnriched, pct };
  }, [contacts]);

  // --- OUTREACH BY BRAND ---
  const outreachByBrand = useMemo(() => {
    const map: Record<string, number> = {};
    filteredOutreach.forEach((o) => { map[o.brand] = (map[o.brand] || 0) + 1; });
    return Object.entries(map).map(([brand, count]) => ({ brand, count })).sort((a, b) => b.count - a.count);
  }, [filteredOutreach]);

  // --- RESPONSE RATES ---
  const responseRates = useMemo(() => {
    const map: Record<string, { total: number; positive: number; negative: number; no_response: number; pending: number }> = {};
    filteredOutreach.forEach((o) => {
      if (!map[o.brand]) map[o.brand] = { total: 0, positive: 0, negative: 0, no_response: 0, pending: 0 };
      map[o.brand].total++;
      map[o.brand][o.response_status as keyof typeof map[string]]++;
    });
    return Object.entries(map).map(([brand, stats]) => ({
      brand, ...stats,
      rate: stats.total > 0 ? Math.round((stats.positive / stats.total) * 100) : 0,
    })).sort((a, b) => b.total - a.total);
  }, [filteredOutreach]);

  // --- OUTREACH CALENDAR ---
  const outreachCalendar = useMemo(() => {
    const map: Record<string, number> = {};
    filteredOutreach.forEach((o) => {
      const day = format(parseISO(o.created_at), "yyyy-MM-dd");
      map[day] = (map[day] || 0) + 1;
    });
    return Object.entries(map).map(([date, count]) => ({
      date, label: format(parseISO(date), "d MMM", { locale: es }), count,
    })).sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
  }, [filteredOutreach]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Analytics — Wishlist</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">Cargando datos…</div>
        ) : !contacts.length ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">Sin datos aún</div>
        ) : (
          <Tabs defaultValue="month" className="w-full">
            <TabsList className="flex flex-wrap h-auto gap-1">
              <TabsTrigger value="month">Por Mes</TabsTrigger>
              <TabsTrigger value="status">Por Estado</TabsTrigger>
              <TabsTrigger value="country">Por País</TabsTrigger>
              <TabsTrigger value="city">Por Ciudad</TabsTrigger>
              <TabsTrigger value="category">Categoría</TabsTrigger>
              <TabsTrigger value="enrichment">Enrichment</TabsTrigger>
              <TabsTrigger value="outreach">Alcance</TabsTrigger>
              <TabsTrigger value="responses">Respuestas</TabsTrigger>
              <TabsTrigger value="activity">Actividad</TabsTrigger>
            </TabsList>

            {/* POR MES */}
            <TabsContent value="month" className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg border p-3 text-center"><p className="text-2xl font-bold">{monthlyKPIs.total}</p><p className="text-xs text-muted-foreground">Total contactos</p></div>
                <div className="rounded-lg border p-3 text-center"><p className="text-2xl font-bold">{monthlyKPIs.avg}</p><p className="text-xs text-muted-foreground">Promedio mensual</p></div>
                <div className="rounded-lg border p-3 text-center"><p className="text-2xl font-bold">{monthlyKPIs.bestMonth}</p><p className="text-xs text-muted-foreground">Mejor mes</p></div>
              </div>
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" fontSize={11} />
                  <YAxis yAxisId="left" allowDecimals={false} />
                  <YAxis yAxisId="right" orientation="right" allowDecimals={false} />
                  <Tooltip />
                  <Bar yAxisId="left" dataKey="count" name="Registrados" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="count" position="top" fontSize={11} />
                  </Bar>
                  <Line yAxisId="right" type="monotone" dataKey="cumulative" name="Acumulado" stroke="hsl(150, 60%, 45%)" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </TabsContent>

            {/* POR ESTADO */}
            <TabsContent value="status" className="space-y-4">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={statusData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="label" width={120} fontSize={12} />
                  <Tooltip formatter={(val: number, _: string, entry: any) => [`${val} (${entry.payload.pct}%)`, "Contactos"]} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    <LabelList dataKey="count" position="right" fontSize={11} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </TabsContent>

            {/* POR PAÍS */}
            <TabsContent value="country" className="space-y-4">
              {countryData.length ? (
                <ResponsiveContainer width="100%" height={Math.max(200, countryData.length * 35)}>
                  <BarChart data={countryData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="label" width={80} fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="count" name="Contactos" fill="hsl(210, 70%, 55%)" radius={[0, 4, 4, 0]}>
                      <LabelList dataKey="count" position="right" fontSize={11} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-center text-muted-foreground py-8">Sin datos de país</p>}
            </TabsContent>

            {/* POR CIUDAD */}
            <TabsContent value="city" className="space-y-4">
              {cityData.length ? (
                <ResponsiveContainer width="100%" height={Math.max(200, cityData.length * 35)}>
                  <BarChart data={cityData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="city" width={120} fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="count" name="Contactos" fill="hsl(150, 60%, 45%)" radius={[0, 4, 4, 0]}>
                      <LabelList dataKey="count" position="right" fontSize={11} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-center text-muted-foreground py-8">Sin datos de ciudad</p>}
            </TabsContent>

            {/* CATEGORÍA */}
            <TabsContent value="category" className="space-y-4">
              {categoryData.length ? (
                <ResponsiveContainer width="100%" height={Math.max(200, categoryData.length * 40)}>
                  <BarChart data={categoryData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="category" width={130} fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="count" name="Contactos" fill="hsl(45, 80%, 50%)" radius={[0, 4, 4, 0]}>
                      <LabelList dataKey="count" position="right" fontSize={11} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-center text-muted-foreground py-8">Sin datos</p>}
            </TabsContent>

            {/* ENRICHMENT */}
            <TabsContent value="enrichment" className="space-y-6">
              <div className="rounded-lg border p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Contactos enriquecidos</span>
                  <span className="text-2xl font-bold">{enrichmentStats.pct}%</span>
                </div>
                <Progress value={enrichmentStats.pct} className="h-3" />
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>✅ Enriquecidos: {enrichmentStats.enriched}</span>
                  <span>⏳ Pendientes: {enrichmentStats.notEnriched}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border p-4 text-center">
                  <p className="text-3xl font-bold text-success">{enrichmentStats.enriched}</p>
                  <p className="text-xs text-muted-foreground mt-1">Con datos completos</p>
                </div>
                <div className="rounded-lg border p-4 text-center">
                  <p className="text-3xl font-bold text-orange-500">{enrichmentStats.notEnriched}</p>
                  <p className="text-xs text-muted-foreground mt-1">Pendientes de enriquecer</p>
                </div>
              </div>
            </TabsContent>

            {/* OUTREACH */}
            <TabsContent value="outreach" className="space-y-4">
              <div className="flex justify-end">
                <DateRangePicker from={dateFrom} to={dateTo} onApply={(f, t) => { setDateFrom(f); setDateTo(t); }} placeholder="Filtrar por fecha" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-2xl font-bold">{filteredOutreach.length}</p>
                  <p className="text-xs text-muted-foreground">Total alcances</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-2xl font-bold">{new Set(filteredOutreach.map((o) => o.contact_id)).size}</p>
                  <p className="text-xs text-muted-foreground">Creadoras contactadas</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-2xl font-bold">{new Set(filteredOutreach.map((o) => o.brand)).size}</p>
                  <p className="text-xs text-muted-foreground">Marcas activas</p>
                </div>
              </div>
              {outreachByBrand.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(200, outreachByBrand.length * 45)}>
                  <BarChart data={outreachByBrand} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="brand" width={100} fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="count" name="Alcances" radius={[0, 4, 4, 0]}>
                      {outreachByBrand.map((entry) => <Cell key={entry.brand} fill={BRAND_COLORS[entry.brand] || COLORS[0]} />)}
                      <LabelList dataKey="count" position="right" fontSize={11} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-center text-muted-foreground py-8">Sin datos de alcance</p>}
            </TabsContent>

            {/* RESPONSES */}
            <TabsContent value="responses" className="space-y-4">
              <div className="flex justify-end">
                <DateRangePicker from={dateFrom} to={dateTo} onApply={(f, t) => { setDateFrom(f); setDateTo(t); }} placeholder="Filtrar por fecha" />
              </div>
              {responseRates.length > 0 ? (
                <ResponsiveContainer width="100%" height={Math.max(200, responseRates.length * 45)}>
                  <BarChart data={responseRates} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="brand" width={100} fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="positive" name="Positiva" stackId="a" fill="hsl(150, 60%, 45%)" />
                    <Bar dataKey="negative" name="Negativa" stackId="a" fill="hsl(0, 65%, 55%)" />
                    <Bar dataKey="no_response" name="Sin respuesta" stackId="a" fill="hsl(0, 0%, 70%)" />
                    <Bar dataKey="pending" name="Pendiente" stackId="a" fill="hsl(45, 80%, 50%)" radius={[0, 4, 4, 0]}>
                      <LabelList dataKey="total" position="right" fontSize={11} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-center text-muted-foreground py-8">Sin datos</p>}
            </TabsContent>

            {/* ACTIVITY CALENDAR */}
            <TabsContent value="activity" className="space-y-4">
              <div className="flex justify-end">
                <DateRangePicker from={dateFrom} to={dateTo} onApply={(f, t) => { setDateFrom(f); setDateTo(t); }} placeholder="Filtrar por fecha" />
              </div>
              {outreachCalendar.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={outreachCalendar}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" fontSize={10} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" name="Alcances" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]}>
                      <LabelList dataKey="count" position="top" fontSize={10} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-center text-muted-foreground py-8">Sin actividad</p>}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default SuperContactsAnalyticsModal;
