import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  CalendarDays,
  Users,
  Target,
  Settings,
  Plus,
  Send,
  Check,
  Minus,
  X,
  ChevronDown,
  Filter,
  Table2,
  Info,
  AlertTriangle,
  TrendingUp,
  CheckCircle,
} from "lucide-react";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import InstagramIcon from "@/components/icons/InstagramIcon";
import TikTokIcon from "@/components/icons/TikTokIcon";
import XIcon from "@/components/icons/XIcon";
import PromologEntryCard, { type PromologEntry } from "./PromologEntryCard";

const socialCards = [
  { name: "Instagram", value: 3, icon: <InstagramIcon className="h-6 w-6" />, bg: "bg-pink-500/10" },
  { name: "TikTok", value: 0, icon: <TikTokIcon className="h-6 w-6" />, bg: "bg-slate-500/10" },
  { name: "X", value: 2, icon: <XIcon className="h-6 w-6" />, bg: "bg-slate-500/10" },
  { name: "Telegram", value: 0, icon: <Send className="h-6 w-6" />, bg: "bg-blue-500/10" },
];

const platformCards = [
  {
    name: "OnlyFans",
    value: 5,
    bg: "bg-blue-500/10",
    icon: (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-white text-[10px] font-bold">
        OF
      </span>
    ),
  },
  {
    name: "Unlok",
    value: 0,
    bg: "bg-purple-500/10",
    icon: (
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-500 text-white text-[10px] font-bold">
        U
      </span>
    ),
  },
  {
    name: "Otra",
    value: 0,
    bg: "bg-muted/50",
    icon: (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Info className="h-4 w-4" />
      </span>
    ),
  },
];

const mockEntries: PromologEntry[] = [
  {
    id: "1",
    ticketNumber: "PL065201",
    name: "Desieee Daniela Gonzalez angel",
    handle: "deziig",
    network: "instagram",
    platform: "OnlyFans",
    result: "Sí",
    date: "13 feb 2026",
    time: "10:05 AM",
    agent: "lorena_lozano",
    notes: "CC promociona en IG, publica foto",
  },
  {
    id: "2",
    ticketNumber: "PL068144",
    name: "Veronica Sanchez",
    network: "x",
    platform: "OnlyFans",
    result: "Sí",
    date: "13 feb 2026",
    time: "09:57 AM",
    agent: "lorena_lozano",
    notes: "CC promociona en reddit, publica foto",
  },
  {
    id: "3",
    ticketNumber: "PL111676",
    name: "Valentin Magallanes",
    handle: "valentin.only",
    network: "instagram",
    platform: "OnlyFans",
    result: "Sí",
    date: "13 feb 2026",
    time: "09:53 AM",
    agent: "lorena_lozano",
    notes: "CC promociona en IG, publica video",
  },
  {
    id: "4",
    ticketNumber: "PL641620",
    name: "Elizabeth Loaiza",
    handle: "elizabethloaiza",
    network: "instagram",
    platform: "OnlyFans",
    result: "Sí",
    date: "13 feb 2026",
    time: "09:48 AM",
    agent: "lorena_lozano",
    notes: "CC promociona en IG, publica foto",
  },
  {
    id: "5",
    ticketNumber: "PL492883",
    name: "Alejandra Rojas Soto",
    handle: "alemiarojas",
    network: "x",
    platform: "OnlyFans",
    result: "Sí",
    date: "13 feb 2026",
    time: "09:25 AM",
    agent: "lorena_lozano",
    notes: "CC promociona en X, publica video",
  },
];

const agentsData = [
  {
    name: "lorena_lozano",
    tickets: 5,
    si: 5,
    parcial: 0,
    no: 0,
    badges: [
      { label: "IG", value: 3 },
      { label: "X", value: 2 },
    ],
  },
];

const PromologContent = () => {
  const { data: creators = [] } = useQuery({
    queryKey: ["creators-dropdown"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creators")
        .select("id, name, artistic_name")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const [date, setDate] = useState<Date>(new Date());
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"dashboard" | "agentes">("dashboard");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const formattedDate = date.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const shortDate = date.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
  });

  return (
    <main className="flex-1 overflow-auto p-6 min-w-0 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Promolog</h1>
        <p className="text-sm text-muted-foreground">
          Seguimiento promocional diario
        </p>
      </div>

      {/* Action Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" className="gap-2">
              <CalendarDays className="h-4 w-4" />
              {formattedDate}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={date}
              onSelect={(d) => {
                if (d) {
                  setDate(d);
                  setOpen(false);
                }
              }}
              locale={es}
              weekStartsOn={1}
              className="p-3 pointer-events-auto"
            />
            <Separator />
            <div className="flex items-center gap-2 p-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDate(new Date());
                  setOpen(false);
                }}
              >
                Hoy
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() - 7);
                  setDate(d);
                  setOpen(false);
                }}
              >
                7 días
              </Button>
            </div>
          </PopoverContent>
        </Popover>
        <Button
          variant={view === "agentes" ? "default" : "outline"}
          size="sm"
          onClick={() => setView(view === "dashboard" ? "agentes" : "dashboard")}
        >
          <Users className="mr-2 h-4 w-4" />
          {view === "dashboard" ? "Ver Agentes" : "Ver Dashboard"}
        </Button>
        <Button variant="outline" size="sm">
          <Target className="mr-2 h-4 w-4" />
          Ver Campañas
        </Button>
        <Button variant="outline" size="sm">
          <Settings className="mr-2 h-4 w-4" />
          Agregar Campaña
        </Button>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Agregar Entrada
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-t-[3px] border-t-purple-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-muted-foreground">Total Modelos</p>
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold text-green-500">142</p>
            <p className="text-xs text-muted-foreground">Registradas en sistema - Filtrando</p>
          </CardContent>
        </Card>
        <Card className="border-t-[3px] border-t-blue-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-muted-foreground">Tickets ingresados</p>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold text-blue-500">6</p>
            <p className="text-xs text-muted-foreground">Tickets ingresados hoy</p>
          </CardContent>
        </Card>
        <Card className="border-t-[3px] border-t-red-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-muted-foreground">NO Chequeadas</p>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold text-red-500">128</p>
            <p className="text-xs text-muted-foreground">Equipo no las revisó</p>
          </CardContent>
        </Card>
        <Card className="border-t-[3px] border-t-green-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-muted-foreground">Completadas Hoy</p>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold">6</p>
            <p className="text-xs text-muted-foreground">Tickets ingresados hoy</p>
          </CardContent>
        </Card>
      </div>

      {/* Conditional: Dashboard or Agents */}
      {view === "dashboard" ? (
        <div className="space-y-6">
          {/* Social & Platform Section */}
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">
                Promociones por Red Social y Plataforma{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  (solo tickets &apos;Sí&apos;)
                </span>
              </h2>
            </div>

            {/* Red Social */}
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Red Social</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {socialCards.map((s) => (
                  <Card key={s.name} className={s.bg}>
                    <CardContent className="flex items-center gap-3 p-4">
                      {s.icon}
                      <div>
                        <p className="text-xs text-muted-foreground">{s.name}</p>
                        <p className="text-xl font-bold">{s.value}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Plataforma */}
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Plataforma</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {platformCards.map((p) => (
                  <Card key={p.name} className={p.bg}>
                    <CardContent className="flex items-center gap-3 p-4">
                      {p.icon}
                      <div>
                        <p className="text-xs text-muted-foreground">{p.name}</p>
                        <p className="text-xl font-bold">{p.value}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Footer date range */}
            <p className="text-xs text-center text-muted-foreground">
              Mostrando datos del {shortDate} al {shortDate}
            </p>
          </div>

          {/* Filters (collapsible) */}
          <Card className="bg-muted/30">
            <CardContent className="p-4">
              <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground w-full justify-start hover:bg-transparent hover:text-muted-foreground">
                    <Filter className="h-4 w-4" />
                    Filtros
                    <ChevronDown
                      className={`h-4 w-4 ml-auto transition-transform ${filtersOpen ? "rotate-180" : ""}`}
                    />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2 w-full">
                      <label className="text-sm font-medium">Creador/a</label>
                      <Select>
                        <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                        <SelectContent>
                        <SelectItem value="__all__">Todos</SelectItem>
                        {creators.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}{c.artistic_name ? ` (${c.artistic_name})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 w-full">
                      <label className="text-sm font-medium">Red Social</label>
                      <Select>
                        <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__">Todas</SelectItem>
                          <SelectItem value="instagram">Instagram</SelectItem>
                          <SelectItem value="tiktok">TikTok</SelectItem>
                          <SelectItem value="x">X</SelectItem>
                          <SelectItem value="telegram">Telegram</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 w-full">
                      <label className="text-sm font-medium">Estado</label>
                      <Select>
                        <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__">Todos</SelectItem>
                          <SelectItem value="si">Sí</SelectItem>
                          <SelectItem value="parcial">Parcial</SelectItem>
                          <SelectItem value="no">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>

          {/* Tabs */}
          <Tabs defaultValue="tabla">
            <TabsList>
              <TabsTrigger value="tabla" className="gap-1.5">
                <Table2 className="h-4 w-4" />
                Tabla
              </TabsTrigger>
              <TabsTrigger value="calendario" className="gap-1.5">
                <CalendarDays className="h-4 w-4" />
                Calendario
              </TabsTrigger>
              <TabsTrigger value="campanas" className="gap-1.5">
                <Target className="h-4 w-4" />
                Campañas
              </TabsTrigger>
            </TabsList>

            <TabsContent value="tabla">
              {/* Entradas Recientes */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Entradas Recientes</h2>
                  <Button variant="ghost" size="sm">
                    <Filter className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-3">
                  {mockEntries.map((entry) => (
                    <PromologEntryCard key={entry.id} entry={entry} />
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="calendario">
              <Card>
                <CardContent className="p-6 text-sm text-muted-foreground text-center">
                  Vista de calendario próximamente...
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="campanas">
              <Card>
                <CardContent className="p-6 text-sm text-muted-foreground text-center">
                  Vista de campañas próximamente...
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Desempeño por Agente</h2>
            <p className="text-sm text-muted-foreground">
              Mostrando {agentsData.length} agente con actividad entre {shortDate} - {shortDate}
            </p>
          </div>

          <div className="space-y-3">
            {agentsData.map((agent) => (
              <Card key={agent.name}>
                <CardContent className="flex items-center gap-4 p-4">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-muted">
                      <Users className="h-5 w-5 text-muted-foreground" />
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{agent.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {agent.tickets} tickets ingresados
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500/15">
                        <Check className="h-3 w-3 text-green-600" />
                      </span>
                      <span className="text-sm font-medium">{agent.si}</span>
                      <span className="text-xs text-muted-foreground">Sí</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-yellow-500/15">
                        <Minus className="h-3 w-3 text-yellow-600" />
                      </span>
                      <span className="text-sm font-medium">{agent.parcial}</span>
                      <span className="text-xs text-muted-foreground">Parcial</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/15">
                        <X className="h-3 w-3 text-red-600" />
                      </span>
                      <span className="text-sm font-medium">{agent.no}</span>
                      <span className="text-xs text-muted-foreground">No</span>
                    </div>

                    <Separator orientation="vertical" className="h-8" />

                    <div className="flex items-center gap-1.5">
                      {agent.badges.map((b) => (
                        <Badge key={b.label} variant="outline" className="text-xs">
                          {b.label} {b.value}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </main>
  );
};

export default PromologContent;
