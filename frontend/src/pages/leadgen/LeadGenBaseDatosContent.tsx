import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format, subDays, isToday } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowLeft, Search, List, LayoutGrid, Eye, ChevronsUpDown, Check,
  Database, BarChart3,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid,
} from "recharts";

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
import EarningsPagination from "@/pages/sales-performance/EarningsPagination";
import { useLeadGenEntries, useLeadGenProfiles } from "./useLeadGen";
import type { LeadGenEntry } from "./useLeadGen";
import { LEADGEN_COMPANIES } from "./leadgenConstants";

const calidadColors: Record<string, string> = {
  "a+": "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  a: "bg-green-500/15 text-green-400 border-green-500/30",
  "b+": "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  b: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  c: "bg-red-500/15 text-red-400 border-red-500/30",
};


const LeadGenBaseDatosContent = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"leads" | "analisis">("leads");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterAgencia, setFilterAgencia] = useState("");
  const [agenciaSelectOpen, setAgenciaSelectOpen] = useState(false);
  const [filterAgente, setFilterAgente] = useState("");
  const [agenteSelectOpen, setAgenteSelectOpen] = useState(false);
  const [filterCalidad, setFilterCalidad] = useState("");
  const [page, setPage] = useState(0);
  
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  const { data: paginatedData, isLoading } = useLeadGenEntries(page);
  const leads = paginatedData?.data || [];
  const totalCount = paginatedData?.total || 0;
  const totalPages = Math.ceil(totalCount / 100);
  const { data: profiles = [] } = useLeadGenProfiles();

  const profilesMap = useMemo(() => {
    const map: Record<string, string> = {};
    profiles.forEach(p => { map[p.id] = p.full_name || "Sin nombre"; });
    return map;
  }, [profiles]);

  const agentesUnicos = useMemo(() => {
    const names = new Set<string>();
    leads.forEach(l => {
      const name = profilesMap[l.lg_user_id];
      if (name) names.add(name);
    });
    return [...names].sort();
  }, [leads, profilesMap]);

  const filtered = useMemo(() => {
    return leads.filter((l) => {
      if (searchTerm && !l.model_handle.toLowerCase().includes(searchTerm.toLowerCase()) && !(l.company || "").toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (filterAgencia && l.company !== filterAgencia) return false;
      if (filterAgente) {
        const agentName = profilesMap[l.lg_user_id];
        if (agentName !== filterAgente) return false;
      }
      if (filterCalidad && l.quality?.toLowerCase() !== filterCalidad) return false;
      
      if (dateFrom) {
        const d = new Date(l.created_at);
        const start = new Date(dateFrom);
        start.setHours(0, 0, 0, 0);
        if (d < start) return false;
      }
      if (dateTo) {
        const d = new Date(l.created_at);
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        if (d > end) return false;
      }
      return true;
    });
  }, [leads, searchTerm, filterAgencia, filterAgente, profilesMap, filterCalidad, dateFrom, dateTo]);

  const totalLeads = filtered.length;
  const conContacto = filtered.filter((l) => ["contactado", "cerrado"].includes(l.status)).length;
  const aPlus = filtered.filter((l) => l.quality?.toLowerCase() === "a+").length;
  const aCount = filtered.filter((l) => l.quality?.toLowerCase() === "a").length;
  const bPlus = filtered.filter((l) => l.quality?.toLowerCase() === "b+").length;
  const bCount = filtered.filter((l) => l.quality?.toLowerCase() === "b").length;
  const cCount = filtered.filter((l) => l.quality?.toLowerCase() === "c").length;

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
      <header className="shrink-0 px-6 pt-6 pb-4 border-b">
        <div className="flex items-start justify-between gap-4">
          <div>
            <button onClick={() => navigate("/leadgen")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1 transition-colors">
              <ArrowLeft className="h-3 w-3" />LeadGen
            </button>
            <h1 className="text-2xl font-semibold">Base de Datos</h1>
            <p className="text-sm text-muted-foreground mt-1">Todos los leads registrados en el sistema</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-primary">{totalCount.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">leads totales</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        {/* KPI Cards */}
        <div className="px-6 py-4">
          <div className="grid grid-cols-4 gap-4">
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground font-medium mb-1">PÁGINA ACTUAL</p><div className="flex items-baseline gap-4"><div><p className="text-2xl font-bold">{totalLeads.toLocaleString()}</p><p className="text-xs text-muted-foreground">Filtrados</p></div><div><p className="text-2xl font-bold text-primary">{conContacto.toLocaleString()}</p><p className="text-xs text-muted-foreground">Con Contacto</p></div></div></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground font-medium mb-1">CATEGORÍA ALTA</p><div className="flex items-baseline gap-4"><div><p className="text-2xl font-bold text-emerald-400">{aPlus.toLocaleString()}</p><p className="text-xs text-muted-foreground">A+</p></div><div><p className="text-2xl font-bold text-green-400">{aCount.toLocaleString()}</p><p className="text-xs text-muted-foreground">A</p></div></div></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground font-medium mb-1">CATEGORÍA MEDIA</p><div className="flex items-baseline gap-4"><div><p className="text-2xl font-bold text-yellow-400">{bPlus.toLocaleString()}</p><p className="text-xs text-muted-foreground">B+</p></div><div><p className="text-2xl font-bold text-orange-400">{bCount.toLocaleString()}</p><p className="text-xs text-muted-foreground">B</p></div></div></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground font-medium mb-1">CATEGORÍA BAJA</p><div className="flex items-baseline gap-4"><div><p className="text-2xl font-bold text-red-400">{cCount.toLocaleString()}</p><p className="text-xs text-muted-foreground">C</p></div></div></CardContent></Card>
          </div>
        </div>

        {/* Tab bar */}
        <div className="px-6 py-2">
          <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <Button key={tab.id} variant={activeTab === tab.id ? "secondary" : "ghost"} size="sm" onClick={() => setActiveTab(tab.id)} className="text-xs">
                  <Icon className="h-3.5 w-3.5" />{tab.label}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Filters */}
        <div className="px-6 py-3 flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar lead..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 h-9" />
          </div>

          <Popover open={agenciaSelectOpen} onOpenChange={setAgenciaSelectOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[180px] h-9 justify-between font-normal">
                {filterAgencia || "Agencia"}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0">
              <Command>
                <CommandInput placeholder="Buscar agencia..." />
                <CommandList>
                  <CommandEmpty>No encontrado</CommandEmpty>
                  <CommandItem onSelect={() => { setFilterAgencia(""); setAgenciaSelectOpen(false); }}>
                    Todas{!filterAgencia && <Check className="ml-auto h-4 w-4" />}
                  </CommandItem>
                  {LEADGEN_COMPANIES.map((a) => (
                    <CommandItem key={a} onSelect={() => { setFilterAgencia(a); setAgenciaSelectOpen(false); }}>
                      {a}{filterAgencia === a && <Check className="ml-auto h-4 w-4" />}
                    </CommandItem>
                  ))}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <Popover open={agenteSelectOpen} onOpenChange={setAgenteSelectOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[180px] h-9 justify-between font-normal">
                {filterAgente || "Agente"}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0">
              <Command>
                <CommandInput placeholder="Buscar agente..." />
                <CommandList>
                  <CommandEmpty>No encontrado</CommandEmpty>
                  <CommandItem onSelect={() => { setFilterAgente(""); setAgenteSelectOpen(false); }}>
                    Todos{!filterAgente && <Check className="ml-auto h-4 w-4" />}
                  </CommandItem>
                  {agentesUnicos.map((a) => (
                    <CommandItem key={a} onSelect={() => { setFilterAgente(a); setAgenteSelectOpen(false); }}>
                      {a}{filterAgente === a && <Check className="ml-auto h-4 w-4" />}
                    </CommandItem>
                  ))}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <Select value={filterCalidad || undefined} onValueChange={(v) => setFilterCalidad(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-[120px] h-9"><SelectValue placeholder="Categoría" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas</SelectItem>
              <SelectItem value="a+">A+</SelectItem><SelectItem value="a">A</SelectItem>
              <SelectItem value="b+">B+</SelectItem><SelectItem value="b">B</SelectItem>
              <SelectItem value="c">C</SelectItem>
            </SelectContent>
          </Select>


          <DateRangePicker from={dateFrom} to={dateTo} onApply={(from, to) => { setDateFrom(from); setDateTo(to); }} placeholder="Filtrar por fecha" className="h-9" />

          {activeTab === "leads" && (
            <div className="ml-auto flex gap-1">
              <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="icon" className="h-9 w-9" onClick={() => setViewMode("list")}><List className="h-4 w-4" /></Button>
              <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="icon" className="h-9 w-9" onClick={() => setViewMode("grid")}><LayoutGrid className="h-4 w-4" /></Button>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-6">
          {activeTab === "leads" && (
            <>
              <p className="text-sm text-muted-foreground mb-4">
                Mostrando: <span className="font-semibold text-foreground">{filtered.length}</span> de {totalCount.toLocaleString()} leads (página {page + 1} de {totalPages})
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
                          <span className="text-xs text-muted-foreground">#{page * 100 + idx + 1}</span>
                          <Badge variant="outline" className={calidadColors[lead.quality?.toLowerCase()] || ""}>
                            {lead.quality?.toUpperCase()}
                          </Badge>
                        </div>
                        <p className="font-medium text-sm truncate">@{lead.model_handle}</p>
                        <p className="text-xs text-muted-foreground">{lead.company || "—"}</p>
                        <div className="flex items-center justify-end">
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
                            <TableHead>Agencia</TableHead>
                            <TableHead>Categoría</TableHead>
                            
                            <TableHead>País</TableHead>
                            <TableHead>Fecha</TableHead>
                            <TableHead className="text-center sticky right-0 bg-card z-20">Acciones</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filtered.map((lead, idx) => (
                            <TableRow key={lead.id}>
                              <TableCell className="text-xs text-muted-foreground">{page * 100 + idx + 1}</TableCell>
                              <TableCell className="font-medium text-sm max-w-[200px] truncate">@{lead.model_handle}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{profilesMap[lead.lg_user_id] || "—"}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{lead.company || "—"}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={calidadColors[lead.quality?.toLowerCase()] || ""}>
                                  {lead.quality?.toUpperCase()}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm">{lead.country_code || "—"}</TableCell>
                              <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                                {format(new Date(lead.created_at), "dd MMM yyyy", { locale: es })}
                              </TableCell>
                              <TableCell className="text-center sticky right-0 bg-card">
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0"><Eye className="h-4 w-4" /></Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
              {totalPages > 1 && (
                <div className="mt-4">
                  <EarningsPagination currentPage={page + 1} totalPages={totalPages} onPageChange={(p) => setPage(p - 1)} />
                </div>
              )}
            </>
          )}

          {activeTab === "analisis" && (
            <div className="space-y-6">
              <Card>
                <CardContent className="p-6">
                  <h3 className="text-sm font-semibold mb-4">Leads por Hora (Hoy)</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={hourlyData}>
                      <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="leads" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <h3 className="text-sm font-semibold mb-4">Leads Últimos 7 Días</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={weeklyData}>
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="leads" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <h3 className="text-sm font-semibold mb-4">Tendencia Últimos 30 Días</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={4} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="leads" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
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
