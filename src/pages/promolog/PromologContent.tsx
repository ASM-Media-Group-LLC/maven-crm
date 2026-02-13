import { useState } from "react";
import {
  CalendarDays,
  Users,
  Target,
  Settings,
  Plus,
  CheckCircle,
  AlertTriangle,
  TrendingUp,
  Send,
  Check,
  Minus,
  X,
} from "lucide-react";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import InstagramIcon from "@/components/icons/InstagramIcon";
import TikTokIcon from "@/components/icons/TikTokIcon";
import XIcon from "@/components/icons/XIcon";

const kpiCards = [
  {
    title: "Total Modelos",
    value: "142",
    subtitle: "Registradas en sistema - Filtrando",
    icon: Users,
    borderColor: "border-t-primary",
  },
  {
    title: "Tickets ingresados",
    value: "5",
    subtitle: "Tickets ingresados hoy",
    icon: CheckCircle,
    borderColor: "border-t-green-500",
  },
  {
    title: "⚠️ NO Chequeadas",
    value: "129",
    subtitle: "Equipo no las revisó",
    icon: AlertTriangle,
    borderColor: "border-t-destructive",
  },
  {
    title: "Completadas Hoy",
    value: "5",
    subtitle: "Tickets ingresados hoy",
    icon: TrendingUp,
    borderColor: "border-t-muted-foreground",
  },
];

const socialCards = [
  { name: "Instagram", value: 3, icon: <InstagramIcon className="h-6 w-6" /> },
  { name: "TikTok", value: 0, icon: <TikTokIcon className="h-6 w-6" /> },
  { name: "X", value: 2, icon: <XIcon className="h-6 w-6" /> },
  { name: "Telegram", value: 0, icon: <Send className="h-6 w-6" /> },
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
  const [date, setDate] = useState<Date>(new Date());
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"dashboard" | "agentes">("dashboard");

  const formattedDate = date.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const shortDate = date.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
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
        {kpiCards.map((card) => (
          <Card key={card.title} className={`border-t-[3px] ${card.borderColor}`}>
            <CardContent className="flex items-start gap-4 p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <card.icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 space-y-0.5">
                <p className="text-xs font-medium text-muted-foreground">
                  {card.title}
                </p>
                <p className="text-2xl font-bold tracking-tight">{card.value}</p>
                <p className="text-xs text-muted-foreground">{card.subtitle}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Conditional: Social Section or Agents Section */}
      {view === "dashboard" ? (
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">
              Promociones por Red Social y Plataforma{" "}
              <span className="text-sm font-normal text-muted-foreground">
                (solo tickets &apos;Sí&apos;)
              </span>
            </h2>
            <p className="text-sm text-muted-foreground">Red Social</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {socialCards.map((s) => (
              <Card key={s.name}>
                <CardContent className="flex flex-col items-center justify-center gap-2 p-5">
                  {s.icon}
                  <p className="text-xs text-muted-foreground">{s.name}</p>
                  <p className="text-2xl font-bold">{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
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
