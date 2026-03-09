import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, UserPlus, Database, CheckSquare, Users, BarChart3, Clock, Search, List, LayoutGrid, FileText, Eye, ChevronsUpDown, Check, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import AgentDetailView from "./AgentDetailView";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandItem } from "@/components/ui/command";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line, ResponsiveContainer } from "recharts";
import { format, isSameDay, subDays, startOfDay, subMonths, addDays, startOfWeek, endOfWeek, isToday, isFuture } from "date-fns";
import { es } from "date-fns/locale";
import LeadGenCantidadCard from "./LeadGenCantidadCard";
import LeadGenEstadosCard from "./LeadGenEstadosCard";
import LeadGenTable from "./LeadGenTable";
import LeadGenGrid from "./LeadGenGrid";
import AddLeadModal from "./AddLeadModal";
import AddContactoModal from "./AddContactoModal";
import ViewLeadModal from "./ViewLeadModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { useLeadGenEntries } from "./useLeadGen";
import type { LeadGenEntry } from "./useLeadGen";

const mockSupervisores = [
  { name: "Luisroman07", email: "luisroman07@unlok.me" },
  { name: "Brayan123", email: "brayan123@unlok.me" },
  { name: "lorena_lozano", email: "lorena.lozano@unlok.me" },
  { name: "monica.duque", email: "monica.duque@unlok.me" },
  { name: "Fabiana_Duran", email: "fabiana.duran@unlok.me" },
  { name: "lizeth.jerez", email: "lizeth.jerez@unlok.me" },
  { name: "carolina.jaramillo", email: "carolina.jaramillo@unlok.me" },
  { name: "cheryl.gonzalez", email: "cheryl.gonzalez@unlok.me" },
  { name: "Andres.Gaviria", email: "andres.gaviria@unlok.me" },
].map((s) => ({ ...s, totalQA: 0, aPlus: 0, a: 0, bPlus: 0, b: 0, c: 0, aprobados: 0, rechazados: 0, mejorar: 0 }));

const tabs = [
  { id: "leads", label: "Leads", icon: CheckSquare },
  { id: "agentes", label: "Agentes", icon: Users },
  { id: "supervisores", label: "Supervisores", icon: Users },
  { id: "rendimiento", label: "Rendimiento", icon: BarChart3 },
  { id: "leads-hora", label: "Leads por Hora", icon: Clock },
];

const hourlyData = Array.from({ length: 24 }, (_, i) => ({
  hour: String(i).padStart(2, "0"),
  leads: 0,
}));

const getWeekDays = (offset: number): Date[] => {
  const now = new Date();
  const monday = startOfWeek(addDays(now, offset * 7), { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
};

const DAY_LABELS = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];

const knownStatuses = new Set(["no_response", "contactado", "respondio", "interesado", "no_interesado"]);

const LeadGenContent = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("leads");
  const [viewMode, setViewMode] = useState<"list" | "grid" | "calendar">("list");
  const [weekOffset, setWeekOffset] = useState(0);
  const [addLeadOpen, setAddLeadOpen] = useState(false);
  const [selectedAgente, setSelectedAgente] = useState("todos");
  const [agentSelectOpen, setAgentSelectOpen] = useState(false);
  const [addContactoOpen, setAddContactoOpen] = useState(false);
  const [viewLeadOpen, setViewLeadOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<LeadGenEntry | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<(typeof mockSupervisores)[number] | null>(null);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [activeFilter, setActiveFilter] = useState<{ type: "categoria" | "status" | null; value: string | null }>({ type: null, value: null });

  const { data: leads = [], isLoading: leadsLoading } = useLeadGenEntries();

  const filteredLeads = leads.filter((lead) => {
    if (activeFilter.type === "categoria") {
      return lead.quality?.toLowerCase() === activeFilter.value;
    }
    if (activeFilter.type === "status") {
      if (activeFilter.value === "respondieron") return lead.status === "contactado" || lead.status === "respondio";
      if (activeFilter.value === "interesadas") return lead.status === "interesado";
      if (activeFilter.value === "no_interesadas") return lead.status === "no_interesado";
      if (activeFilter.value === "otros") return !knownStatuses.has(lead.status);
      if (activeFilter.value === "con_telefono") return !!(lead.phone_raw || lead.phone_e164);
    }
    return true;
  });

  if (selectedAgent) {
    return <AgentDetailView agent={selectedAgent} leads={leads} onBack={() => setSelectedAgent(null)} />;
  }

  return (
    <main className="flex-1 flex flex-col h-full min-w-0">
      {/* Header */}
      <header className="shrink-0 px-6 pt-6 pb-4 border-b">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">LeadGen</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Marketing y generación de leads · {leads.length.toLocaleString()} leads
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setAddLeadOpen(true)}>
              <Plus className="h-4 w-4" />
              Agregar Lead
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAddContactoOpen(true)}>
              <UserPlus className="h-4 w-4" />
              Agregar Contacto
            </Button>
          </div>
        </div>
      </header>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto">
        {/* KPI Cards */}
        <div className="px-6 py-4">
          <div className="grid grid-cols-2 gap-6">
            <LeadGenCantidadCard leads={leads} activeFilter={activeFilter} onFilterChange={setActiveFilter} />
            <LeadGenEstadosCard leads={leads} activeFilter={activeFilter} onFilterChange={setActiveFilter} />
          </div>
        </div>

        {/* Tab bar */}
        <div className="px-6 py-2 flex items-center justify-between gap-4">
          <div className="inline-flex items-center gap-1 rounded-lg bg-muted/50 p-1">
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
          <Button variant="outline" size="sm" onClick={() => navigate("/leadgen/base-datos")}>
            <Database className="h-4 w-4" />
            Base de Datos
          </Button>
        </div>

        {/* Filters bar */}
        <div className="px-6 py-3 flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={activeTab === "agentes" ? "Buscar agente..." : activeTab === "supervisores" ? "Buscar supervisor..." : "Buscar lead..."} className="pl-9 h-9" />
          </div>
          <DateRangePicker
            from={dateFrom}
            to={dateTo}
            onApply={(from, to) => { setDateFrom(from); setDateTo(to); }}
            placeholder="Selecciona fechas"
            className="h-9"
          />
          {activeTab === "supervisores" || activeTab === "rendimiento" || activeTab === "leads-hora" ? null : activeTab === "agentes" ? (
            <Select>
              <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Rendimiento" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="alto">Alto</SelectItem>
                <SelectItem value="medio">Medio</SelectItem>
                <SelectItem value="bajo">Bajo</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <>
              <Select>
                <SelectTrigger className="w-[120px] h-9"><SelectValue placeholder="Estado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="no_response">Sin Resp.</SelectItem>
                  <SelectItem value="contactado">Contactado</SelectItem>
                </SelectContent>
              </Select>
              <Select>
                <SelectTrigger className="w-[120px] h-9"><SelectValue placeholder="Calidad" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="a+">A+</SelectItem>
                  <SelectItem value="a">A</SelectItem>
                  <SelectItem value="b+">B+</SelectItem>
                  <SelectItem value="b">B</SelectItem>
                  <SelectItem value="c">C</SelectItem>
                </SelectContent>
              </Select>
              <Select>
                <SelectTrigger className="w-[100px] h-9"><SelectValue placeholder="QA" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="aprobado">Aprobado</SelectItem>
                  <SelectItem value="pendiente">Pendiente</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}
          <div className="ml-auto flex gap-1">
            <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="icon" className="h-9 w-9" onClick={() => setViewMode("list")}>
              <List className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="icon" className="h-9 w-9" onClick={() => setViewMode("grid")}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
            {(activeTab === "agentes" || activeTab === "supervisores") && (
              <Button variant={viewMode === "calendar" ? "secondary" : "ghost"} size="icon" className="h-9 w-9" onClick={() => setViewMode("calendar")}>
                <Calendar className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Tab content */}
        <div className="p-6">
          {activeTab === "leads" && (
            <>
              {leadsLoading ? (
                <div className="flex items-center justify-center py-16">
                  <p className="text-muted-foreground text-sm">Cargando leads...</p>
                </div>
              ) : viewMode === "grid" ? (
                <LeadGenGrid
                  leads={filteredLeads}
                  onView={(lead) => { setSelectedLead(lead); setViewLeadOpen(true); }}
                />
              ) : (
                filteredLeads.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-muted-foreground text-sm">No hay leads para revisar con estos filtros</p>
                  </div>
                ) : (
                  <LeadGenTable
                    leads={filteredLeads}
                    onView={(lead) => { setSelectedLead(lead); setViewLeadOpen(true); }}
                  />
                )
              )}
            </>
          )}

          {activeTab === "agentes" && (
            <div className="space-y-6">
              <div className="rounded-lg border overflow-hidden bg-gradient-to-br from-primary/15 via-primary/10 to-primary/5 border-l-[3px] border-l-primary">
                <div className="p-6 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-primary">Rendimiento de Agentes</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {viewMode === "calendar"
                        ? (() => { const days = getWeekDays(weekOffset); return `${format(days[0], "d 'de' MMMM", { locale: es })} – ${format(days[6], "d 'de' MMMM, yyyy", { locale: es })}`; })()
                        : format(new Date(), "d 'de' MMMM, yyyy", { locale: es })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-right">
                    <div>
                      <p className="text-3xl font-bold text-primary">{mockSupervisores.length}</p>
                      <p className="text-xs text-muted-foreground">Agentes Activos</p>
                    </div>
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                  </div>
                </div>
              </div>

              {viewMode === "calendar" ? (() => {
                const weekDays = getWeekDays(weekOffset);
                const leadsInDay = (agente: typeof mockSupervisores[0], day: Date) =>
                  leads.filter(l => l.company?.toLowerCase() === agente.name.toLowerCase() && isSameDay(new Date(l.created_at), day)).length;
                const colTotals = weekDays.map(day => mockSupervisores.reduce((sum, ag) => sum + leadsInDay(ag, day), 0));
                const grandTotal = colTotals.reduce((a, b) => a + b, 0);
                return (
                  <Card>
                    <CardContent className="pt-4 px-4 pb-4">
                      <div className="flex items-center justify-between mb-4">
                        <Button variant="outline" size="sm" onClick={() => setWeekOffset(w => w - 1)}>
                          <ChevronLeft className="h-4 w-4 mr-1" /> Semana anterior
                        </Button>
                        <span className="text-sm font-medium text-muted-foreground">
                          {format(weekDays[0], "d 'de' MMMM", { locale: es })} – {format(weekDays[6], "d 'de' MMMM, yyyy", { locale: es })}
                        </span>
                        <Button variant="outline" size="sm" onClick={() => setWeekOffset(w => w + 1)} disabled={weekOffset >= 0}>
                          Semana siguiente <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </div>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="min-w-[140px]">Agente</TableHead>
                              {weekDays.map((day, i) => (
                                <TableHead key={i} className={`text-center min-w-[70px] ${isToday(day) ? "bg-primary/10 text-primary font-bold" : ""}`}>
                                  {DAY_LABELS[i]} {format(day, "d")}
                                </TableHead>
                              ))}
                              <TableHead className="text-center font-semibold">Total</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {mockSupervisores.map((ag) => {
                              const dayCounts = weekDays.map(day => leadsInDay(ag, day));
                              const rowTotal = dayCounts.reduce((a, b) => a + b, 0);
                              return (
                                <TableRow key={ag.email}>
                                  <TableCell className="font-medium text-sm">{ag.name}</TableCell>
                                  {dayCounts.map((cnt, i) => (
                                    <TableCell key={i} className={`text-center text-sm ${isToday(weekDays[i]) ? "bg-primary/10 text-primary font-bold" : ""} ${(cnt === 0 || isFuture(startOfDay(weekDays[i]))) ? "text-muted-foreground" : ""}`}>
                                      {isFuture(startOfDay(weekDays[i])) || cnt === 0 ? "—" : cnt}
                                    </TableCell>
                                  ))}
                                  <TableCell className="text-center font-semibold">{rowTotal > 0 ? rowTotal : "—"}</TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                          <tfoot>
                            <TableRow className="border-t-2 bg-muted/30">
                              <TableCell className="font-bold text-sm">Total</TableCell>
                              {colTotals.map((t, i) => (
                                <TableCell key={i} className={`text-center font-bold text-sm ${isToday(weekDays[i]) ? "bg-primary/10 text-primary" : ""} ${(t === 0 || isFuture(startOfDay(weekDays[i]))) ? "text-muted-foreground" : ""}`}>
                                  {isFuture(startOfDay(weekDays[i])) || t === 0 ? "—" : t}
                                </TableCell>
                              ))}
                              <TableCell className="text-center"><Badge variant="default">{grandTotal}</Badge></TableCell>
                            </TableRow>
                          </tfoot>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                );
              })() : viewMode === "list" ? (
                <Card>
                  <CardContent className="pt-6 px-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Agente</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead className="text-center">Leads Hoy</TableHead>
                          <TableHead className="text-center">A+</TableHead>
                          <TableHead className="text-center">A</TableHead>
                          <TableHead className="text-center">B+</TableHead>
                          <TableHead className="text-center">B</TableHead>
                          <TableHead className="text-center">C</TableHead>
                          <TableHead className="text-center sticky right-0 bg-card z-20">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mockSupervisores.map((ag) => {
                          const initials = ag.name.slice(0, 2).toUpperCase();
                          return (
                            <TableRow key={ag.email} className="cursor-pointer" onClick={() => setSelectedAgent(ag)}>
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  <Avatar className="h-8 w-8">
                                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">{initials}</AvatarFallback>
                                  </Avatar>
                                  <span className="font-medium text-sm">{ag.name}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">{ag.email}</TableCell>
                              <TableCell className="text-center"><Badge className="justify-center">0</Badge></TableCell>
                              <TableCell className="text-center font-medium text-primary">0</TableCell>
                              <TableCell className="text-center font-medium">0</TableCell>
                              <TableCell className="text-center font-medium">0</TableCell>
                              <TableCell className="text-center font-medium">0</TableCell>
                              <TableCell className="text-center font-medium">0</TableCell>
                              <TableCell className="text-center sticky right-0 bg-card">
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(e) => { e.stopPropagation(); setSelectedAgent(ag); }}>
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {mockSupervisores.map((ag) => {
                    const initials = ag.name.slice(0, 2).toUpperCase();
                    return (
                      <Card key={ag.email} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setSelectedAgent(ag)}>
                        <CardContent className="p-4">
                          <div className="flex items-center gap-3 mb-3">
                            <Avatar className="h-10 w-10">
                              <AvatarFallback className="bg-primary text-primary-foreground font-semibold">{initials}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-semibold text-sm">{ag.name}</p>
                              <p className="text-xs text-muted-foreground">{ag.email}</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-5 gap-px rounded-lg overflow-hidden border">
                            {[
                              { label: "A+", value: 0, color: "text-primary" },
                              { label: "A", value: 0, color: "text-primary" },
                              { label: "B+", value: 0, color: "text-muted-foreground" },
                              { label: "B", value: 0, color: "text-muted-foreground" },
                              { label: "C", value: 0, color: "text-muted-foreground" },
                            ].map((item) => (
                              <div key={item.label} className="bg-muted/30 p-2 text-center">
                                <p className="text-xs text-muted-foreground">{item.label}</p>
                                <p className={`text-sm font-bold ${item.color}`}>{item.value}</p>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === "rendimiento" && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-2 font-semibold">
                    <Users className="h-5 w-5" />
                    Rendimiento por Agente
                  </div>
                  <Popover open={agentSelectOpen} onOpenChange={setAgentSelectOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-[200px] h-9 justify-between font-normal">
                        {selectedAgente === "todos" ? "Todos los agentes" : selectedAgente}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[200px] p-0">
                      <Command>
                        <CommandInput placeholder="Buscar agente..." />
                        <CommandList>
                          <CommandEmpty>No encontrado</CommandEmpty>
                          <CommandItem onSelect={() => { setSelectedAgente("todos"); setAgentSelectOpen(false); }}>
                            Todos los agentes
                            {selectedAgente === "todos" && <Check className="ml-auto h-4 w-4" />}
                          </CommandItem>
                          {mockSupervisores.map((s) => (
                            <CommandItem key={s.email} onSelect={() => { setSelectedAgente(s.name); setAgentSelectOpen(false); }}>
                              {s.name}
                              {selectedAgente === s.name && <Check className="ml-auto h-4 w-4" />}
                            </CommandItem>
                          ))}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                {selectedAgente === "todos" ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                      <BarChart3 className="h-8 w-8 text-muted-foreground/50" />
                    </div>
                    <p className="text-muted-foreground text-sm">Selecciona un agente para ver su rendimiento</p>
                  </div>
                ) : (() => {
                  const now = new Date();
                  const agentLeads = leads.filter(l => l.company?.toLowerCase() === selectedAgente.toLowerCase());

                  const hourlyAgentData = Array.from({ length: 24 }, (_, i) => ({
                    hour: `${i}:00`,
                    count: agentLeads.filter(l => isSameDay(new Date(l.created_at), now) && new Date(l.created_at).getHours() === i).length,
                  }));

                  const weeklyData = Array.from({ length: 7 }, (_, i) => {
                    const day = subDays(now, 6 - i);
                    return {
                      label: format(day, "EEE dd", { locale: es }),
                      count: agentLeads.filter(l => isSameDay(new Date(l.created_at), day)).length,
                    };
                  });

                  const last30Data = Array.from({ length: 30 }, (_, i) => {
                    const day = subDays(now, 29 - i);
                    return {
                      label: format(day, "d MMM", { locale: es }),
                      count: agentLeads.filter(l => isSameDay(new Date(l.created_at), day)).length,
                    };
                  });

                  const yearlyData = Array.from({ length: 12 }, (_, i) => {
                    const month = subMonths(now, 11 - i);
                    return {
                      label: format(month, "MMM yy", { locale: es }),
                      count: agentLeads.filter(l => {
                        const d = new Date(l.created_at);
                        return d.getMonth() === month.getMonth() && d.getFullYear() === month.getFullYear();
                      }).length,
                    };
                  });

                  return (
                    <div className="space-y-6">
                      <div className="rounded-lg border border-primary/30 bg-gradient-to-r from-primary/15 to-primary/5 p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">Total de Leads — {selectedAgente}</p>
                            <p className="text-4xl font-bold text-primary mt-1">{agentLeads.length}</p>
                          </div>
                          <p className="text-sm text-muted-foreground">{format(now, "dd/MM/yyyy")}</p>
                        </div>
                      </div>

                      <Card>
                        <CardContent className="pt-6">
                          <h4 className="text-sm font-semibold mb-4 flex items-center gap-2">
                            <Clock className="h-4 w-4 text-primary" />
                            Leads por Hora del Día
                          </h4>
                          <div className="h-[250px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={hourlyAgentData}>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                                <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
                                <Bar dataKey="count" name="Leads" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardContent className="pt-6">
                          <h4 className="text-sm font-semibold mb-4 flex items-center gap-2">
                            <BarChart3 className="h-4 w-4 text-emerald-500" />
                            Leads por Día (Última Semana)
                          </h4>
                          <div className="h-[250px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={weeklyData}>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
                                <Bar dataKey="count" name="Leads" fill="#10b981" radius={[4, 4, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardContent className="pt-6">
                          <h4 className="text-sm font-semibold mb-4 flex items-center gap-2">
                            <BarChart3 className="h-4 w-4 text-violet-500" />
                            Leads por Día (Últimos 30 días)
                          </h4>
                          <div className="h-[250px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={last30Data}>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={4} />
                                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
                                <Line type="monotone" dataKey="count" name="Leads" stroke="#8b5cf6" strokeWidth={2} dot={{ fill: '#8b5cf6', r: 3 }} activeDot={{ r: 5 }} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardContent className="pt-6">
                          <h4 className="text-sm font-semibold mb-4 flex items-center gap-2">
                            <BarChart3 className="h-4 w-4 text-amber-500" />
                            Leads por Mes (Últimos 12 meses)
                          </h4>
                          <div className="h-[250px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={yearlyData}>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
                                <Bar dataKey="count" name="Leads" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}

          {activeTab === "leads-hora" && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 font-semibold mb-6">
                  <BarChart3 className="h-5 w-5" />
                  Leads por Hora (Hoy)
                </div>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hourlyData}>
                      <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                      <Bar dataKey="leads" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === "supervisores" && (
            <div className="space-y-6">
              <div className="rounded-lg border overflow-hidden bg-gradient-to-br from-primary/15 via-primary/10 to-primary/5 border-l-[3px] border-l-primary">
                <div className="p-6 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-primary">Rendimiento de Supervisores</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {viewMode === "calendar"
                        ? (() => { const days = getWeekDays(weekOffset); return `${format(days[0], "d 'de' MMMM", { locale: es })} – ${format(days[6], "d 'de' MMMM, yyyy", { locale: es })}`; })()
                        : format(new Date(), "d 'de' MMMM, yyyy", { locale: es })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-right">
                    <div>
                      <p className="text-3xl font-bold text-primary">{mockSupervisores.length}</p>
                      <p className="text-xs text-muted-foreground">Supervisores Activos</p>
                    </div>
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                  </div>
                </div>
              </div>

              {viewMode === "calendar" ? (() => {
                const weekDays = getWeekDays(weekOffset);
                const colTotals = weekDays.map(() => 0);
                return (
                  <Card>
                    <CardContent className="pt-4 px-4 pb-4">
                      <div className="flex items-center justify-between mb-4">
                        <Button variant="outline" size="sm" onClick={() => setWeekOffset(w => w - 1)}>
                          <ChevronLeft className="h-4 w-4 mr-1" /> Semana anterior
                        </Button>
                        <span className="text-sm font-medium text-muted-foreground">
                          {format(weekDays[0], "d 'de' MMMM", { locale: es })} – {format(weekDays[6], "d 'de' MMMM, yyyy", { locale: es })}
                        </span>
                        <Button variant="outline" size="sm" onClick={() => setWeekOffset(w => w + 1)} disabled={weekOffset >= 0}>
                          Semana siguiente <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </div>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="min-w-[140px]">Supervisor</TableHead>
                              {weekDays.map((day, i) => (
                                <TableHead key={i} className={`text-center min-w-[70px] ${isToday(day) ? "bg-primary/10 text-primary font-bold" : ""}`}>
                                  {DAY_LABELS[i]} {format(day, "d")}
                                </TableHead>
                              ))}
                              <TableHead className="text-center font-semibold">Total</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {mockSupervisores.map((sup) => (
                              <TableRow key={sup.email}>
                                <TableCell className="font-medium text-sm">{sup.name}</TableCell>
                                {weekDays.map((day, i) => (
                                  <TableCell key={i} className={`text-center text-sm text-muted-foreground ${isToday(day) ? "bg-primary/10" : ""}`}>—</TableCell>
                                ))}
                                <TableCell className="text-center text-muted-foreground">—</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                          <tfoot>
                            <TableRow className="border-t-2 bg-muted/30">
                              <TableCell className="font-bold text-sm">Total</TableCell>
                              {weekDays.map((day, i) => (
                                <TableCell key={i} className={`text-center text-sm text-muted-foreground ${isToday(day) ? "bg-primary/10" : ""}`}>—</TableCell>
                              ))}
                              <TableCell className="text-center"><Badge variant="default">0</Badge></TableCell>
                            </TableRow>
                          </tfoot>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                );
              })() : viewMode === "list" ? (
                <Card>
                  <CardContent className="pt-6 px-0">
                    <div className="max-h-[calc(100vh-24rem)] overflow-auto">
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-card">
                          <TableRow>
                            <TableHead>Supervisor</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead className="text-center">Total QA</TableHead>
                            <TableHead className="text-center">A+</TableHead>
                            <TableHead className="text-center">A</TableHead>
                            <TableHead className="text-center">B+</TableHead>
                            <TableHead className="text-center">B</TableHead>
                            <TableHead className="text-center">C</TableHead>
                            <TableHead className="text-center">Aprobados</TableHead>
                            <TableHead className="text-center">Rechazados</TableHead>
                            <TableHead className="text-center sticky right-0 bg-card z-20">Acciones</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {mockSupervisores.map((sup) => {
                            const initials = sup.name.slice(0, 2).toUpperCase();
                            return (
                              <TableRow key={sup.email}>
                                <TableCell>
                                  <div className="flex items-center gap-3">
                                    <Avatar className="h-8 w-8">
                                      <AvatarFallback className="bg-primary text-primary-foreground text-xs">{initials}</AvatarFallback>
                                    </Avatar>
                                    <span className="font-medium text-sm">{sup.name}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">{sup.email}</TableCell>
                                <TableCell className="text-center"><Badge className="justify-center">{sup.totalQA}</Badge></TableCell>
                                <TableCell className="text-center font-medium text-primary">{sup.aPlus}</TableCell>
                                <TableCell className="text-center font-medium">{sup.a}</TableCell>
                                <TableCell className="text-center font-medium">{sup.bPlus}</TableCell>
                                <TableCell className="text-center font-medium">{sup.b}</TableCell>
                                <TableCell className="text-center font-medium">{sup.c}</TableCell>
                                <TableCell className="text-center"><Badge variant="success" className="justify-center">{sup.aprobados}</Badge></TableCell>
                                <TableCell className="text-center"><Badge variant="destructive" className="justify-center">{sup.rechazados}</Badge></TableCell>
                                <TableCell className="text-center sticky right-0 bg-card">
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0"><Eye className="h-4 w-4" /></Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {mockSupervisores.map((sup) => {
                    const initials = sup.name.slice(0, 2).toUpperCase();
                    return (
                      <Card key={sup.email}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                                <Users className="h-5 w-5 text-primary" />
                              </div>
                              <div>
                                <p className="font-semibold text-sm">{sup.name}</p>
                                <p className="text-xs text-muted-foreground">{sup.email}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <CheckSquare className="h-4 w-4" />
                              <span className="text-sm font-medium">{sup.totalQA}</span>
                              <span className="text-xs">QA reviews</span>
                            </div>
                          </div>
                          <div className="grid grid-cols-5 gap-px rounded-lg overflow-hidden border mb-3">
                            {[
                              { label: "A+", value: sup.aPlus, color: "text-primary" },
                              { label: "A", value: sup.a, color: "text-success" },
                              { label: "B+", value: sup.bPlus, color: "text-warning" },
                              { label: "B", value: sup.b, color: "text-muted-foreground" },
                              { label: "C", value: sup.c, color: "text-muted-foreground" },
                            ].map((item) => (
                              <div key={item.label} className="bg-muted/30 p-3 text-center">
                                <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
                                <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
                              </div>
                            ))}
                          </div>
                          <div className="grid grid-cols-3 gap-px rounded-lg overflow-hidden border">
                            <div className="bg-success/5 p-3 text-center">
                              <p className="text-xs text-muted-foreground mb-1">Aprobados</p>
                              <p className="text-lg font-bold text-success">{sup.aprobados}</p>
                            </div>
                            <div className="bg-warning/5 p-3 text-center">
                              <p className="text-xs text-muted-foreground mb-1">Mejorar</p>
                              <p className="text-lg font-bold text-warning">{sup.mejorar}</p>
                            </div>
                            <div className="bg-destructive/5 p-3 text-center">
                              <p className="text-xs text-muted-foreground mb-1">Rechazados</p>
                              <p className="text-lg font-bold text-destructive">{sup.rechazados}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <AddLeadModal open={addLeadOpen} onOpenChange={setAddLeadOpen} />
      <AddContactoModal open={addContactoOpen} onOpenChange={setAddContactoOpen} />
      <ViewLeadModal open={viewLeadOpen} onOpenChange={setViewLeadOpen} lead={selectedLead} />
    </main>
  );
};

export default LeadGenContent;
