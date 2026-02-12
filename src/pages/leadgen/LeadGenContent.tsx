import { useState } from "react";
import { Plus, UserPlus, Database, CheckSquare, Users, BarChart3, Clock, Search, List, LayoutGrid, FileText, CalendarDays } from "lucide-react";
import LeadGenCantidadCard from "./LeadGenCantidadCard";
import LeadGenEstadosCard from "./LeadGenEstadosCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const tabs = [
  { id: "leads", label: "Leads", icon: CheckSquare },
  { id: "agentes", label: "Agentes", icon: Users },
  { id: "supervisores", label: "Supervisores", icon: Users },
  { id: "rendimiento", label: "Rendimiento", icon: BarChart3 },
  { id: "leads-hora", label: "Leads por Hora", icon: Clock },
];

const LeadGenContent = () => {
  const [activeTab, setActiveTab] = useState("leads");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
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
            <Button variant="outline" size="sm">
              <UserPlus className="h-4 w-4" />
              Contacto
            </Button>
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Lead
            </Button>
          </div>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="shrink-0 px-6 py-4 border-b">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <LeadGenCantidadCard />
          <LeadGenEstadosCard />
        </div>
      </div>

      {/* Tab bar */}
      <div className="shrink-0 border-b px-6 py-2 flex items-center justify-between gap-4">
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
      <div className="shrink-0 border-b px-6 py-3 flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar lead..." className="pl-9 h-9" />
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

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
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
      </div>
    </main>
  );
};

export default LeadGenContent;
