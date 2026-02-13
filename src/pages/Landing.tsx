import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  FileText,
  Target,
  Contact,
  Receipt,
  CalendarDays,
  TrendingUp,
  BarChart3,
  Clock,
  Zap,
} from "lucide-react";

const modules = [
  {
    icon: Users,
    title: "Gestión de Creadores",
    description: "Administra perfiles, contratos, monetización y seguimiento de cada creador en un solo lugar.",
    metric: "215+ creadores",
    color: "bg-accent",
  },
  {
    icon: FileText,
    title: "Promolog",
    description: "Registro y seguimiento de promociones, campañas y acciones de marketing por creador.",
    metric: "Tracking diario",
    color: "bg-primary",
  },
  {
    icon: Target,
    title: "LeadGen & Marketing",
    description: "Captura, califica y convierte leads en creadores activos con pipeline visual.",
    metric: "Pipeline completo",
    color: "bg-success",
  },
  {
    icon: Contact,
    title: "Contacts & Closers",
    description: "Gestiona contactos, asigna closers y da seguimiento a cada oportunidad de negocio.",
    metric: "CRM integrado",
    color: "bg-warning",
  },
  {
    icon: Receipt,
    title: "Sales & Revenue",
    description: "Dashboards de ventas, earnings por creador, métricas de rendimiento y reportes.",
    metric: "$2.3M+ tracked",
    color: "bg-destructive",
  },
  {
    icon: CalendarDays,
    title: "Eventos & Calendario",
    description: "Organiza eventos, gestiona invitados, checklists y comparte links externos.",
    metric: "Gestión completa",
    color: "bg-primary",
  },
];

const stats = [
  { icon: Users, value: "215+", label: "Creadores activos" },
  { icon: BarChart3, value: "2.3K+", label: "Registros procesados" },
  { icon: Clock, value: "24/7", label: "Monitoreo continuo" },
  { icon: TrendingUp, value: "↑ 32%", label: "Crecimiento mensual" },
];

const Landing = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md transition-all duration-300">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Logo size="sm" />
          <div className="hidden items-center gap-6 md:flex">
            <a href="#funcionalidades" className="story-link text-sm text-muted-foreground transition-colors hover:text-foreground">
              <span>Funcionalidades</span>
            </a>
            <a href="#metricas" className="story-link text-sm text-muted-foreground transition-colors hover:text-foreground">
              <span>Métricas</span>
            </a>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" asChild>
              <Link to="/login">Iniciar Sesión</Link>
            </Button>
            <Button asChild>
              <Link to="/register">Registrarse</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero-gradient flex flex-col items-center px-4 pb-20 pt-16 text-center md:pt-24">
        <Badge variant="secondary" className="mb-8 animate-fade-in-up text-sm font-normal">
          Plataforma completa para agencias de creadores
        </Badge>
        <div className="animate-fade-in-up" style={{ animationDelay: "100ms" }}>
          <Logo size="lg" className="mb-6" />
        </div>
        <p className="mx-auto mb-4 max-w-2xl animate-fade-in-up text-lg text-muted-foreground md:text-xl" style={{ animationDelay: "200ms" }}>
          La plataforma todo-en-uno para gestionar creadores, ventas, leads, eventos y operaciones de tu agencia.
        </p>
        <div className="mb-10 h-1 w-24 animate-fade-in-up rounded-full bg-gradient-to-r from-accent to-primary" style={{ animationDelay: "250ms" }} />
        <div className="flex animate-fade-in-up items-center gap-4" style={{ animationDelay: "300ms" }}>
          <Button size="lg" asChild>
            <Link to="/register">Crear cuenta</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link to="/login">Iniciar sesión</Link>
          </Button>
        </div>
      </section>

      {/* Modules Grid */}
      <section id="funcionalidades" className="mx-auto max-w-6xl px-4 pb-20">
        <h2 className="mb-10 animate-fade-in-up text-center text-2xl font-bold md:text-3xl">
          Todo lo que necesitas en un solo lugar
        </h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {modules.map((mod, i) => (
            <div
              key={mod.title}
              className="group animate-fade-in-up rounded-lg border border-border bg-card p-6 transition-all duration-300 hover:border-primary/30 hover:bg-muted/50"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div className={`mb-4 inline-flex rounded-lg ${mod.color} p-3 transition-transform duration-300 group-hover:scale-110`}>
                <mod.icon className="h-6 w-6 text-white" />
              </div>
              <h3 className="mb-2 text-lg font-semibold">{mod.title}</h3>
              <p className="mb-4 text-sm text-muted-foreground">{mod.description}</p>
              <span className="text-xs font-medium text-primary">{mod.metric}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section id="metricas" className="border-t border-border bg-card py-16">
        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-8 px-4 md:grid-cols-4">
          {stats.map((stat, i) => (
            <div key={stat.label} className="flex animate-fade-in-up flex-col items-center text-center" style={{ animationDelay: `${i * 100}ms` }}>
              <stat.icon className="mb-3 h-8 w-8 animate-float text-primary" />
              <span className="text-3xl font-bold">{stat.value}</span>
              <span className="mt-1 text-sm text-muted-foreground">{stat.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10">
        <div className="mx-auto mb-10 h-px w-full max-w-6xl bg-gradient-to-r from-transparent via-border to-transparent" />
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4">
          <Logo size="sm" />
          <p className="text-sm text-muted-foreground">
            La plataforma CRM para agencias de creadores de contenido.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
