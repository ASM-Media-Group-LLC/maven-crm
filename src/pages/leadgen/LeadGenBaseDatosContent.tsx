import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, subDays, startOfDay, isToday } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowLeft, Search, List, LayoutGrid, Eye, ChevronsUpDown, Check,
  Database, BarChart3, TrendingUp,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid,
} from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandItem,
} from "@/components/ui/command";
import { DateRangePicker } from "@/components/ui/date-range-picker";

import type { LeadGenEntry } from "./useLeadGen";
import { useLeadGenEntries } from "./useLeadGen";

type Lead = LeadGenEntry;

const calidadColors: Record<string, string> = {
  "a+": "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  a: "bg-green-500/15 text-green-400 border-green-500/30",
  "b+": "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  b: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  c: "bg-red-500/15 text-red-400 border-red-500/30",
};

const statusLabels: Record<string, string> = {
  nuevo: "Nuevo",
  no_response: "Sin Respuesta",
  contactado: "Contactado",
  cerrado: "Cerrado",
  rechazado: "Rechazado",
};

const LeadGenBaseDatosContent = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"leads" | "analisis">("leads");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterAgente, setFilterAgente] = useState("todos");
  const [agentSelectOpen, setAgentSelectOpen] = useState(false);
  const [filterCalidad, setFilterCalidad] = useState("todos");
  const [filterEstado, setFilterEstado] = useState("todos");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads-base-datos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Lead[];
    },
  });

  // Derive unique agents from compania
  const agentes = useMemo(
    () => [...new Set(leads.map((l) => l.compania))].sort(),
    [leads]
  );

  // Filter leads
  const filtered = useMemo(() => {
    return leads.filter((l) => {
      if (searchTerm && !l.url_perfil.toLowerCase().includes(searchTerm.toLowerCase()) && !l.compania.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (filterAgente !== "todos" && l.compania !== filterAgente) return false;
      if (filterCalidad !== "todos" && l.categoria !== filterCalidad) return false;
      if (filterEstado !== "todos" && l.status !== filterEstado) return false;
      if (dateFrom) {
        const d = new Date(l.created_at);
        if (d < startOfDay(dateFrom)) return false;
      }
      if (dateTo) {
        const d = new Date(l.created_at);
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        if (d > end) return false;
      }
      return true;
    });
  }, [leads, searchTerm, filterAgente, filterCalidad, filterEstado, dateFrom, dateTo]);

  // KPIs
  const totalLeads = filtered.length;
  const conContacto = filtered.filter((l) => ["contactado", "cerrado"].includes(l.status)).length;
  const aPlus = filtered.filter((l) => l.categoria === "a+").length;
  const aCount = filtered.filter((l) => l.categoria === "a").length;
  const bPlus = filtered.filter((l) => l.categoria === "b+").length;
  const bCount = filtered.filter((l) => l.categoria === "b").length;
  const cCount = filtered.filter((l) => l.categoria === "c").length;

  // Charts data
  const hourlyData = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({ hour: String(i).padStart(2, "0"), leads: 0 }));
    filtered.filter((l) => isToday(new Date(l.created_at))).forEach((l) => {
      const h = new Date(l.created_at).getHours();
      hours[h].leads++;
    });
    return hours;
  }, [filtered]);

  const weeklyData = useMemo(() => {
    const days: { label: string; date: string; leads: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const key = format(d, "yyyy-MM-dd");
      days.push({ label: format(d, "EEE d", { locale: es }), date: key, leads: 0 });
    }
    filtered.forEach((l) => {
      const key = format(new Date(l.created_at), "yyyy-MM-dd");
      const found = days.find((d) => d.date === key);
      if (found) found.leads++;
    });
    return days;
  }, [filtered]);

  const monthlyData = useMemo(() => {
    const days: { label: string; date: string; leads: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const key = format(d, "yyyy-MM-dd");
      days.push({ label: format(d, "d MMM", { locale: es }), date: key, leads: 0 });
    }
    filtered.forEach((l) => {
      const key = format(new Date(l.created_at), "yyyy-MM-dd");
      const found = days.find((d) => d.date === key);
      if (found) found.leads++;
    });
    return days;
  }, [filtered]);

  const tabs = [
    { id: "leads" as const, label: "Leads", icon: Database },
    { id: "analisis" as const, label: "Análisis", icon: BarChart3 },
  ];

  return (
    <main className="flex-1 flex flex-col h-full min-w-0">
      {/* Header */}
      <header className="shrink-0 px-6 pt-6 pb-4 border-b">
        <div className="flex items-start justify-between gap-4">
          <div>
            <button
              onClick={() => navigate("/leadgen")}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1 transition-colors"
            >
              <ArrowLeft className="h-3 w-3" />
              LeadGen
            </button>
            <h1 className="text-2xl font-semibold">Base de Datos</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Todos los leads registrados en el sistema
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-primary">{leads.length}</p>
            <p className="text-xs text-muted-foreground">leads</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        {/* KPI Cards */}
        <div className="px-6 py-4">
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground font-medium mb-1">GENERAL</p>
                <div className="flex items-baseline gap-4">
                  <div>
                    <p className="text-2xl font-bold">{totalLeads}</p>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-primary">{conContacto}</p>
                    <p className="text-xs text-muted-foreground">Con Contacto</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground font-medium mb-1">CALIDAD ALTA</p>
                <div className="flex items-baseline gap-4">
                  <div>
                    <p className="text-2xl font-bold text-emerald-400">{aPlus}</p>
                    <p className="text-xs text-muted-foreground">A+</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-400">{aCount}</p>
                    <p className="text-xs text-muted-foreground">A</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground font-medium mb-1">CALIDAD MEDIA</p>
                <div className="flex items-baseline gap-4">
                  <div>
                    <p className="text-2xl font-bold text-yellow-400">{bPlus}</p>
                    <p className="text-xs text-muted-foreground">B+</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-orange-400">{bCount}</p>
                    <p className="text-xs text-muted-foreground">B</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground font-medium mb-1">CALIDAD BAJA</p>
                <div className="flex items-baseline gap-4">
                  <div>
                    <p className="text-2xl font-bold text-red-400">{cCount}</p>
                    <p className="text-xs text-muted-foreground">C</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Tab bar */}
        <div className="px-6 py-2">
          <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <Button
                  key={tab.id}
                  variant={activeTab === tab.id ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setActiveTab(tab.id)}
                  className="text-xs"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Filters (shared) */}
        <div className="px-6 py-3 flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar lead..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9"
            />
          </div>

          {/* Agent combobox */}
          <Popover open={agentSelectOpen} onOpenChange={setAgentSelectOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[180px] h-9 justify-between font-normal">
                {filterAgente === "todos" ? "Agente" : filterAgente}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0">
              <Command>
                <CommandInput placeholder="Buscar agente..." />
                <CommandList>
                  <CommandEmpty>No encontrado</CommandEmpty>
                  <CommandItem onSelect={() => { setFilterAgente("todos"); setAgentSelectOpen(false); }}>
                    Todos
                    {filterAgente === "todos" && <Check className="ml-auto h-4 w-4" />}
                  </CommandItem>
                  {agentes.map((a) => (
                    <CommandItem key={a} onSelect={() => { setFilterAgente(a); setAgentSelectOpen(false); }}>
                      {a}
                      {filterAgente === a && <Check className="ml-auto h-4 w-4" />}
                    </CommandItem>
                  ))}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <Select value={filterCalidad} onValueChange={setFilterCalidad}>
            <SelectTrigger className="w-[120px] h-9">
              <SelectValue placeholder="Calidad" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Calidad</SelectItem>
              <SelectItem value="a+">A+</SelectItem>
              <SelectItem value="a">A</SelectItem>
              <SelectItem value="b+">B+</SelectItem>
              <SelectItem value="b">B</SelectItem>
              <SelectItem value="c">C</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterEstado} onValueChange={setFilterEstado}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Estado</SelectItem>
              <SelectItem value="nuevo">Nuevo</SelectItem>
              <SelectItem value="no_response">Sin Respuesta</SelectItem>
              <SelectItem value="contactado">Contactado</SelectItem>
              <SelectItem value="cerrado">Cerrado</SelectItem>
              <SelectItem value="rechazado">Rechazado</SelectItem>
            </SelectContent>
          </Select>

          <DateRangePicker
            from={dateFrom}
            to={dateTo}
            onApply={(from, to) => { setDateFrom(from); setDateTo(to); }}
            placeholder="Filtrar por fecha"
            className="h-9"
          />

          {activeTab === "leads" && (
            <div className="ml-auto flex gap-1">
              <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="icon" className="h-9 w-9" onClick={() => setViewMode("list")}>
                <List className="h-4 w-4" />
              </Button>
              <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="icon" className="h-9 w-9" onClick={() => setViewMode("grid")}>
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-6">
          {activeTab === "leads" && (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                Leads Encontrados: <span className="font-semibold text-foreground">{filtered.length}</span>
              </p>
              {isLoading ? (
                <div className="flex items-center justify-center py-16">
                  <p className="text-muted-foreground text-sm">Cargando leads...</p>
                </div>
              ) : viewMode === "grid" ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filtered.map((lead, idx) => (
                    <Card key={lead.id} className="hover:border-primary/30 transition-colors">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">#{idx + 1}</span>
                          <Badge variant="outline" className={calidadColors[lead.categoria] || ""}>
                            {lead.categoria.toUpperCase()}
                          </Badge>
                        </div>
                        <p className="font-medium text-sm truncate">{lead.url_perfil}</p>
                        <p className="text-xs text-muted-foreground">{lead.compania}</p>
                        <div className="flex items-center justify-between">
                          <Badge variant="secondary" className="text-xs">
                            {statusLabels[lead.status] || lead.status}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(lead.created_at), "d MMM", { locale: es })}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <div className="max-h-[calc(100vh-28rem)] overflow-auto">
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-card">
                          <TableRow>
                            <TableHead className="w-12">#</TableHead>
                            <TableHead>Handle</TableHead>
                            <TableHead>Agente</TableHead>
                            <TableHead>Calidad</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead>País</TableHead>
                            <TableHead>Fecha</TableHead>
                            <TableHead className="text-center sticky right-0 bg-card z-20">Acciones</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filtered.map((lead, idx) => (
                            <TableRow key={lead.id}>
                              <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                              <TableCell className="font-medium text-sm max-w-[200px] truncate">{lead.url_perfil}</TableCell>
                              <TableCell className="text-sm">{lead.compania}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={calidadColors[lead.categoria] || ""}>
                                  {lead.categoria.toUpperCase()}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary" className="text-xs">
                                  {statusLabels[lead.status] || lead.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm">{lead.pais || "—"}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {format(new Date(lead.created_at), "d MMM yy", { locale: es })}
                              </TableCell>
                              <TableCell className="text-center sticky right-0 bg-card z-20">
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                          {filtered.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                                No se encontraron leads
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {activeTab === "analisis" && (
            <div className="space-y-6">
              {/* Total card */}
              <Card className="bg-gradient-to-br from-primary/15 via-primary/10 to-primary/5 border-l-[3px] border-l-primary">
                <CardContent className="p-6 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground font-medium">Total de Leads Filtrados</p>
                    <p className="text-4xl font-bold text-primary mt-1">{filtered.length}</p>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <TrendingUp className="h-6 w-6 text-primary" />
                  </div>
                </CardContent>
              </Card>

              {/* Leads por hora */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 font-semibold mb-4">
                    <BarChart3 className="h-5 w-5" />
                    Leads por Hora del Día (Hoy)
                  </div>
                  <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={hourlyData}>
                        <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="leads" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Leads por día - semana */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 font-semibold mb-4">
                    <BarChart3 className="h-5 w-5" />
                    Leads por Día (Última Semana)
                  </div>
                  <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={weeklyData}>
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="leads" fill="hsl(142, 71%, 45%)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Leads por día - 30 días */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 font-semibold mb-4">
                    <TrendingUp className="h-5 w-5" />
                    Leads por Día (Últimos 30 días)
                  </div>
                  <div className="h-[280px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={monthlyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={2} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Line
                          type="monotone"
                          dataKey="leads"
                          stroke="hsl(270, 70%, 60%)"
                          strokeWidth={2}
                          dot={{ r: 3, fill: "hsl(270, 70%, 60%)" }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </main>
  );
};

export default LeadGenBaseDatosContent;
