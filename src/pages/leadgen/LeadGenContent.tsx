import { useState } from "react";
import { Plus, UserPlus, Database, CheckSquare, Users, BarChart3, Clock, Search, List, LayoutGrid, FileText, CalendarDays, Eye } from "lucide-react";
import { BarChart, Bar, XAxis, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import LeadGenCantidadCard from "./LeadGenCantidadCard";
import LeadGenEstadosCard from "./LeadGenEstadosCard";
import AddLeadModal from "./AddLeadModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

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
].map((s) => ({ ...s, totalQA: 0, aPlus: 0, a: 0, bPlus: 0, b: 0, c: 0, aprobados: 0, rechazados: 0 }));

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

const LeadGenContent = () => {
  const [activeTab, setActiveTab] = useState("leads");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [addLeadOpen, setAddLeadOpen] = useState(false);
  const [selectedAgente, setSelectedAgente] = useState("todos");

  return (
    <main className="flex-1 flex flex-col h-full min-w-0">
      {/* Header */}
      <header className="shrink-0 px-6 pt-6 pb-4 border-b">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">LeadGen</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Marketing y generación de leads · 0 leads
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setAddLeadOpen(true)}>
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

      {/* Scrollable content: KPIs + tabs + filters + tab content */}
      <div className="flex-1 overflow-auto">
        {/* KPI Cards */}
        <div className="px-6 py-4 border-b">
          <div className="grid grid-cols-2 gap-6">
            <LeadGenCantidadCard />
            <LeadGenEstadosCard />
          </div>
        </div>

        {/* Tab bar */}
        <div className="border-b px-6 py-2 flex items-center justify-between gap-4">
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
          <Button variant="outline" size="sm">
            <Database className="h-4 w-4" />
            Base de Datos
          </Button>
        </div>

        {/* Filters bar */}
        <div className="border-b px-6 py-3 flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={activeTab === "agentes" ? "Buscar agente..." : activeTab === "supervisores" ? "Buscar supervisor..." : activeTab === "rendimiento" || activeTab === "leads-hora" ? "Buscar..." : "Buscar lead..."} className="pl-9 h-9" />
          </div>
          <div className="flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <Select defaultValue="hoy">
              <SelectTrigger className="w-[120px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hoy">Hoy</SelectItem>
                <SelectItem value="ayer">Ayer</SelectItem>
                <SelectItem value="semana">Esta semana</SelectItem>
                <SelectItem value="mes">Este mes</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {activeTab === "supervisores" || activeTab === "rendimiento" || activeTab === "leads-hora" ? null : activeTab === "agentes" ? (
            <Select>
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue placeholder="Rendimiento" />
              </SelectTrigger>
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
                <SelectTrigger className="w-[120px] h-9">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="nuevo">Nuevo</SelectItem>
                  <SelectItem value="contactado">Contactado</SelectItem>
                </SelectContent>
              </Select>
              <Select>
                <SelectTrigger className="w-[120px] h-9">
                  <SelectValue placeholder="Calidad" />
                </SelectTrigger>
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
                <SelectTrigger className="w-[100px] h-9">
                  <SelectValue placeholder="QA" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="aprobado">Aprobado</SelectItem>
                  <SelectItem value="pendiente">Pendiente</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}
          <div className="flex border rounded-md">
            <Button
              variant={viewMode === "list" ? "default" : "ghost"}
              size="sm"
              className="rounded-r-none h-9 w-9 p-0"
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "grid" ? "default" : "ghost"}
              size="sm"
              className="rounded-l-none h-9 w-9 p-0"
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Tab content */}
        <div className="p-6">
          {activeTab === "leads" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Leads (0)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-16">
                  <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground text-sm">
                    No hay leads para revisar con estos filtros
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === "agentes" && (
            <div className="space-y-6">
              <div className="rounded-lg border overflow-hidden bg-gradient-to-br from-primary/15 via-primary/10 to-primary/5 border-l-[3px] border-l-primary">
                <div className="p-6 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-primary">Rendimiento de Agentes</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {format(new Date(), "d 'de' MMMM, yyyy", { locale: es })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-right">
                    <div>
                      <p className="text-3xl font-bold text-primary">0</p>
                      <p className="text-xs text-muted-foreground">Agentes Activos</p>
                    </div>
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                  </div>
                </div>
              </div>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center justify-center py-16">
                    <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                      <Users className="h-8 w-8 text-muted-foreground/50" />
                    </div>
                    <p className="text-muted-foreground text-sm">
                      No hay datos para esta fecha
                    </p>
                  </div>
                </CardContent>
              </Card>
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
                  <Select value={selectedAgente} onValueChange={setSelectedAgente}>
                    <SelectTrigger className="w-[200px] h-9">
                      <SelectValue placeholder="Todos los agentes" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos los agentes</SelectItem>
                      {mockSupervisores.map((s) => (
                        <SelectItem key={s.email} value={s.name}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                    <BarChart3 className="h-8 w-8 text-muted-foreground/50" />
                  </div>
                  <p className="text-muted-foreground text-sm">
                    Selecciona un agente para ver su rendimiento
                  </p>
                </div>
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
                                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                                  {initials}
                                </AvatarFallback>
                              </Avatar>
                              <span className="font-medium text-sm">{sup.name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{sup.email}</TableCell>
                          <TableCell className="text-center">
                            <Badge className="justify-center">{sup.totalQA}</Badge>
                          </TableCell>
                          <TableCell className="text-center font-medium text-primary">{sup.aPlus}</TableCell>
                          <TableCell className="text-center font-medium text-green-500">{sup.a}</TableCell>
                          <TableCell className="text-center font-medium text-yellow-500">{sup.bPlus}</TableCell>
                          <TableCell className="text-center font-medium text-yellow-500">{sup.b}</TableCell>
                          <TableCell className="text-center font-medium">{sup.c}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="success" className="justify-center">{sup.aprobados}</Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="destructive" className="justify-center">{sup.rechazados}</Badge>
                          </TableCell>
                          <TableCell className="text-center sticky right-0 bg-card">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <AddLeadModal open={addLeadOpen} onOpenChange={setAddLeadOpen} />
    </main>
  );
};

export default LeadGenContent;
