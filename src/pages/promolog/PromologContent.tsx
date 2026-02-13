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
} from "lucide-react";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
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

const PromologContent = () => {
  const [date, setDate] = useState<Date>(new Date());
  const [open, setOpen] = useState(false);

  const formattedDate = date.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
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
        <Button variant="outline" size="sm">
          <Users className="mr-2 h-4 w-4" />
          Ver Agentes
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

      {/* Social Section */}
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
    </main>
  );
};

export default PromologContent;
