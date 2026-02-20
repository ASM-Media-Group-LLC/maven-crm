import { useState, useMemo } from "react";
import { ArrowLeft, Plus, UserPlus, Clock, Eye, Search, List, LayoutGrid, FileText, BarChart3 } from "lucide-react";
import { format, isSameDay, differenceInMinutes, startOfDay, endOfDay, subDays } from "date-fns";
import { es } from "date-fns/locale";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { Tables } from "@/integrations/supabase/types";

type Lead = Tables<"leads">;

interface AgentDetailViewProps {
  agent: { name: string; email: string };
  leads: Lead[];
  onBack: () => void;
}

const qualityCards = [
  { key: "a+", label: "Top Quality", bg: "bg-gradient-to-br from-emerald-600 to-emerald-900", text: "text-emerald-100" },
  { key: "a", label: "Excelente", bg: "bg-gradient-to-br from-blue-600 to-blue-900", text: "text-blue-100" },
  { key: "b+", label: "Buena", bg: "bg-gradient-to-br from-cyan-600 to-cyan-900", text: "text-cyan-100" },
  { key: "b", label: "Regular", bg: "bg-gradient-to-br from-violet-600 to-violet-900", text: "text-violet-100" },
  { key: "c", label: "Básica", bg: "border bg-card", text: "text-foreground" },
];

const qualityBadgeColors: Record<string, string> = {
  "a+": "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "a": "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "b+": "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  "b": "bg-violet-500/15 text-violet-400 border-violet-500/30",
  "c": "bg-muted text-muted-foreground border-border",
};

const tabs = [
  { id: "leads", label: "Leads" },
  { id: "rendimiento", label: "Rendimiento" },
  { id: "qa", label: "QA / Retroalimentación" },
];

const AgentDetailView = ({ agent, leads, onBack }: AgentDetailViewProps) => {
  const [activeTab, setActiveTab] = useState("leads");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCalidad, setFilterCalidad] = useState("");
  const [filterEstado, setFilterEstado] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(new Date());
  const [dateTo, setDateTo] = useState<Date | undefined>(new Date());

  const agentLeads = useMemo(() =>
    leads.filter(l =>
      l.compania?.toLowerCase() === agent.name.toLowerCase() ||
      l.compania?.toLowerCase() === agent.email.toLowerCase()
    ), [leads, agent]);

  const now = new Date();
  const todayLeads = useMemo(() =>
    agentLeads.filter(l => isSameDay(new Date(l.created_at), now)),
    [agentLeads]);

  const lastHourLeads = useMemo(() =>
    todayLeads.filter(l => differenceInMinutes(now, new Date(l.created_at)) < 60),
    [todayLeads]);

  const minutesSinceStart = Math.max(60, differenceInMinutes(now, startOfDay(now)));
  const hoursWorked = minutesSinceStart / 60;
  const avgPerHour = hoursWorked > 0 ? (todayLeads.length / hoursWorked).toFixed(1) : "0";

  const qualityCounts = useMemo(() => {
    const counts: Record<string, number> = { "a+": 0, "a": 0, "b+": 0, "b": 0, "c": 0 };
    agentLeads.forEach(l => {
      const cat = l.categoria?.toLowerCase();
      if (cat && counts[cat] !== undefined) counts[cat]++;
    });
    return counts;
  }, [agentLeads]);

  const filteredLeads = useMemo(() => {
    let result = agentLeads;
    if (dateFrom) result = result.filter(l => new Date(l.created_at) >= startOfDay(dateFrom));
    if (dateTo) result = result.filter(l => new Date(l.created_at) <= endOfDay(dateTo));
    if (filterCalidad) result = result.filter(l => l.categoria?.toLowerCase() === filterCalidad);
    if (filterEstado) result = result.filter(l => l.status?.toLowerCase() === filterEstado);
    if (searchTerm) result = result.filter(l =>
      l.url_perfil?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.compania?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    return result;
  }, [agentLeads, dateFrom, dateTo, filterCalidad, filterEstado, searchTerm]);

  const initials = agent.name.slice(0, 2).toUpperCase();
  const activeHours = Math.floor(hoursWorked);
  const activeMinutes = Math.floor(minutesSinceStart % 60);

  return (
    <main className="flex-1 flex flex-col h-full min-w-0">
      {/* Header */}
      <header className="shrink-0 px-6 pt-6 pb-4 border-b">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
          <button onClick={onBack} className="hover:text-foreground transition-colors">LeadGen</button>
          <span>/</span>
          <span className="text-foreground">Detalle Agente</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={onBack} className="h-9 w-9 shrink-0">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-xl font-semibold">{agent.name}</h1>
              <p className="text-sm text-muted-foreground">@{agent.name}</p>
            </div>
            <div className="flex items-center gap-4 ml-4">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {String(activeHours).padStart(2, "0")}h {String(activeMinutes).padStart(2, "0")}min
                </span>
                <span className="text-xs text-muted-foreground">Tiempo Activo</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50">
                <span className="text-sm font-medium">{lastHourLeads.length}</span>
                <Badge variant="secondary" className="text-xs">Última Hora</Badge>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Plus className="h-4 w-4" />
              Lead
            </Button>
            <Button variant="outline" size="sm">
              <UserPlus className="h-4 w-4" />
              Contacto
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        {/* KPI Cards */}
        <div className="px-6 py-4">
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground mb-1">Última Hora</p>
                <p className="text-3xl font-bold">{lastHourLeads.length}</p>
                <p className="text-xs text-muted-foreground mt-1">Modelos contactados</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground mb-1">Total Hoy</p>
                <p className="text-3xl font-bold">{todayLeads.length}</p>
                <p className="text-xs text-muted-foreground mt-1">Modelos contactados</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Promedio por Hora</p>
                    <p className="text-3xl font-bold">{avgPerHour}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Objetivo: 10 · Esperados: {Math.round(hoursWorked * 10)}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" className="text-xs">
                    Ver QA (0)
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Quality Cards */}
        <div className="px-6 pb-4">
          <div className="grid grid-cols-5 gap-3">
            {qualityCards.map((q) => (
              <div
                key={q.key}
                className={`rounded-xl p-4 text-center ${q.bg}`}
              >
                <p className={`text-3xl font-bold ${q.text}`}>{qualityCounts[q.key]}</p>
                <p className={`text-xs mt-1 ${q.text} opacity-80`}>{q.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Internal Tab bar */}
        <div className="px-6 py-2">
          <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
            {tabs.map((tab) => (
              <Button
                key={tab.id}
                variant={activeTab === tab.id ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setActiveTab(tab.id)}
                className="text-xs"
              >
                {tab.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === "leads" && (
            <div className="space-y-4">
              {/* Filters */}
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar lead..."
                    className="pl-9 h-9"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <DateRangePicker
                  from={dateFrom}
                  to={dateTo}
                  onApply={(f, t) => { setDateFrom(f); setDateTo(t); }}
                  placeholder="Seleccionar fechas"
                  className="h-9"
                />
                <Select value={filterCalidad} onValueChange={setFilterCalidad}>
                  <SelectTrigger className="w-[120px] h-9">
                    <SelectValue placeholder="Calidad" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todas</SelectItem>
                    <SelectItem value="a+">A+</SelectItem>
                    <SelectItem value="a">A</SelectItem>
                    <SelectItem value="b+">B+</SelectItem>
                    <SelectItem value="b">B</SelectItem>
                    <SelectItem value="c">C</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterEstado} onValueChange={setFilterEstado}>
                  <SelectTrigger className="w-[120px] h-9">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos</SelectItem>
                    <SelectItem value="nuevo">Nuevo</SelectItem>
                    <SelectItem value="contactado">Contactado</SelectItem>
                    <SelectItem value="no_response">No Response</SelectItem>
                  </SelectContent>
                </Select>
                <div className="ml-auto flex gap-1">
                  <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="icon" className="h-9 w-9" onClick={() => setViewMode("list")}>
                    <List className="h-4 w-4" />
                  </Button>
                  <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="icon" className="h-9 w-9" onClick={() => setViewMode("grid")}>
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                Leads Encontrados: <span className="font-semibold text-foreground">{filteredLeads.length}</span>
              </p>

              {filteredLeads.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground text-sm">No hay leads para este agente con estos filtros</p>
                </div>
              ) : viewMode === "list" ? (
                <Card>
                  <CardContent className="pt-4 px-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[60px]">#</TableHead>
                          <TableHead>Handle</TableHead>
                          <TableHead>Calidad</TableHead>
                          <TableHead>Estado</TableHead>
                          <TableHead>País</TableHead>
                          <TableHead>Fecha</TableHead>
                          <TableHead className="text-center">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredLeads.map((lead, idx) => {
                          const cat = lead.categoria?.toLowerCase() || "c";
                          const badgeClass = qualityBadgeColors[cat] || qualityBadgeColors["c"];
                          return (
                            <TableRow key={lead.id}>
                              <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                              <TableCell>
                                <p className="font-medium text-sm">{lead.url_perfil}</p>
                              </TableCell>
                              <TableCell>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${badgeClass}`}>
                                  {lead.categoria?.toUpperCase()}
                                </span>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs capitalize">{lead.status}</Badge>
                              </TableCell>
                              <TableCell className="text-sm">{lead.pais || "—"}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {format(new Date(lead.created_at), "dd MMM, HH:mm", { locale: es })}
                              </TableCell>
                              <TableCell className="text-center">
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
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
                  {filteredLeads.map((lead) => {
                    const cat = lead.categoria?.toLowerCase() || "c";
                    const badgeClass = qualityBadgeColors[cat] || qualityBadgeColors["c"];
                    return (
                      <Card key={lead.id}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <p className="font-medium text-sm truncate">{lead.url_perfil}</p>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${badgeClass}`}>
                              {lead.categoria?.toUpperCase()}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <Badge variant="outline" className="text-xs capitalize">{lead.status}</Badge>
                            <span>{format(new Date(lead.created_at), "dd MMM, HH:mm", { locale: es })}</span>
                          </div>
                          {lead.pais && <p className="text-xs text-muted-foreground mt-1">{lead.pais}</p>}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === "rendimiento" && (() => {
            const dailyData = Array.from({ length: 7 }, (_, i) => {
              const day = subDays(now, 6 - i);
              return {
                label: format(day, "EEE dd", { locale: es }),
                count: agentLeads.filter(l => isSameDay(new Date(l.created_at), day)).length,
              };
            });

            const hourlyData = Array.from({ length: 24 }, (_, i) => ({
              hour: `${String(i).padStart(2, "0")}:00`,
              count: todayLeads.filter(l => new Date(l.created_at).getHours() === i).length,
            }));
            const firstHourIdx = hourlyData.findIndex(h => h.count > 0);
            const lastHourIdx = hourlyData.length - 1 - [...hourlyData].reverse().findIndex(h => h.count > 0);
            const filteredHourly = firstHourIdx >= 0 ? hourlyData.slice(firstHourIdx, lastHourIdx + 1) : hourlyData;

            const qualityDistData = Object.entries(qualityCounts)
              .filter(([_, v]) => v > 0)
              .map(([key, value]) => ({ category: key.toUpperCase(), count: value }));

            const qualityBarColors: Record<string, string> = {
              "A+": "hsl(160, 60%, 45%)",
              "A": "hsl(217, 71%, 53%)",
              "B+": "hsl(187, 72%, 50%)",
              "B": "hsl(263, 70%, 50%)",
              "C": "hsl(215, 14%, 50%)",
            };

            const daysWithActivity = dailyData.filter(d => d.count > 0).length || 1;
            const avgPerDay = (agentLeads.length / daysWithActivity).toFixed(1);

            return (
              <div className="space-y-6">
                {/* KPI Summary */}
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <BarChart3 className="h-5 w-5 text-primary" />
                      <h3 className="font-semibold">Resumen del Rango Seleccionado</h3>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="rounded-lg border bg-muted/30 p-4 text-center">
                        <p className="text-2xl font-bold text-primary">{agentLeads.length}</p>
                        <p className="text-xs text-muted-foreground mt-1">Total Leads</p>
                      </div>
                      <div className="rounded-lg border bg-muted/30 p-4 text-center">
                        <p className="text-2xl font-bold text-primary">{avgPerDay}</p>
                        <p className="text-xs text-muted-foreground mt-1">Promedio/Día</p>
                      </div>
                      <div className="rounded-lg border bg-muted/30 p-4 text-center">
                        <p className="text-2xl font-bold text-primary">{hoursWorked.toFixed(1)}h</p>
                        <p className="text-xs text-muted-foreground mt-1">Horas Activas</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Leads por Día */}
                  <Card>
                    <CardContent className="p-5">
                      <h3 className="font-semibold mb-4">Leads por Día</h3>
                      <div className="h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={dailyData}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                            <XAxis dataKey="label" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                            <Tooltip
                              contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                              labelStyle={{ color: "hsl(var(--foreground))" }}
                            />
                            <Bar dataKey="count" name="Leads" fill="hsl(263, 70%, 50%)" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Leads por Hora */}
                  <Card>
                    <CardContent className="p-5">
                      <h3 className="font-semibold mb-4">Leads por Hora (Hoy)</h3>
                      <div className="h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={filteredHourly}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                            <XAxis dataKey="hour" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                            <Tooltip
                              contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                              labelStyle={{ color: "hsl(var(--foreground))" }}
                            />
                            <Line
                              type="monotone"
                              dataKey="count"
                              name="Leads"
                              stroke="hsl(187, 72%, 50%)"
                              strokeWidth={2}
                              dot={{ r: 4, fill: "hsl(var(--card))", stroke: "hsl(187, 72%, 50%)", strokeWidth: 2 }}
                              activeDot={{ r: 6 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Distribución por Calidad */}
                {qualityDistData.length > 0 && (
                  <Card>
                    <CardContent className="p-5">
                      <h3 className="font-semibold mb-4">Distribución por Calidad</h3>
                      <div className="h-[220px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={qualityDistData} layout="vertical" margin={{ left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                            <YAxis type="category" dataKey="category" tick={{ fontSize: 13, fontWeight: 600 }} className="fill-muted-foreground" width={40} />
                            <Tooltip
                              contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                              labelStyle={{ color: "hsl(var(--foreground))" }}
                            />
                            <Bar
                              dataKey="count"
                              name="Leads"
                              radius={[0, 4, 4, 0]}
                              shape={(props: any) => {
                                const color = qualityBarColors[props.category] || "hsl(var(--primary))";
                                return <rect {...props} fill={color} />;
                              }}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            );
          })()}

          {activeTab === "qa" && (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                <FileText className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <p className="text-muted-foreground text-sm">QA / Retroalimentación no disponible aún</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
};

export default AgentDetailView;
