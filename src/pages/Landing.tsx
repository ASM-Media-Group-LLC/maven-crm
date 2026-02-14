import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";
import { Badge } from "@/components/ui/badge";
import AnimatedGradientBackground from "@/components/auth/AnimatedGradientBackground";
import AnimatedWaves from "@/components/auth/AnimatedWaves";
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
    <div className="min-h-screen bg-[hsl(240,10%,2%)] text-white">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-[hsl(240,10%,2%)]/80 backdrop-blur-xl transition-all duration-300">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Logo size="sm" />
          <div className="hidden items-center gap-6 md:flex">
            <a href="#funcionalidades" className="story-link text-sm text-white/60 transition-colors hover:text-white">
              <span>Funcionalidades</span>
            </a>
            <a href="#metricas" className="story-link text-sm text-white/60 transition-colors hover:text-white">
              <span>Métricas</span>
            </a>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" asChild className="border-white/10 text-white hover:bg-white/10">
              <Link to="/login">Iniciar Sesión</Link>
            </Button>
            <Button asChild>
              <Link to="/register">Registrarse</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden pb-20 pt-16 md:pt-24">
        <AnimatedGradientBackground />
        <AnimatedWaves />
        <div className="relative z-10 flex flex-col items-center px-4 text-center">
          <Badge variant="secondary" className="glass-card-subtle mb-8 animate-fade-in-up border-white/10 bg-white/5 text-sm font-normal text-white/80">
            Plataforma completa para agencias de creadores
          </Badge>
          <div className="animate-fade-in-up" style={{ animationDelay: "100ms" }}>
            <Logo size="lg" className="mb-6" />
          </div>
          <p className="mx-auto mb-4 max-w-2xl animate-fade-in-up text-lg text-white/60 md:text-xl" style={{ animationDelay: "200ms" }}>
            La plataforma todo-en-uno para gestionar creadores, ventas, leads, eventos y operaciones de tu agencia.
          </p>
          <div className="mb-10 h-1 w-24 animate-fade-in-up rounded-full bg-gradient-to-r from-accent to-primary" style={{ animationDelay: "250ms" }} />
          <div className="flex animate-fade-in-up items-center gap-4" style={{ animationDelay: "300ms" }}>
            <Button size="lg" asChild>
              <Link to="/register">Crear cuenta</Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="border-white/10 text-white hover:bg-white/10">
              <Link to="/login">Iniciar sesión</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Modules Grid */}
      <section id="funcionalidades" className="mx-auto max-w-6xl px-4 pb-20">
        <h2 className="mb-10 animate-fade-in-up text-center text-2xl font-bold text-white md:text-3xl">
          Todo lo que necesitas en un solo lugar
        </h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {modules.map((mod, i) => (
            <div
              key={mod.title}
              className="glass-card-subtle group animate-fade-in-up p-6 transition-all duration-300 hover:scale-[1.02] hover:border-white/15"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div className={`mb-4 inline-flex rounded-lg ${mod.color} p-3 transition-transform duration-300 group-hover:scale-110`}>
                <mod.icon className="h-6 w-6 text-white" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-white">{mod.title}</h3>
              <p className="mb-4 text-sm text-white/60">{mod.description}</p>
              <span className="text-xs font-medium text-primary">{mod.metric}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section id="metricas" className="py-16">
        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-8 px-4 md:grid-cols-4">
          {stats.map((stat, i) => (
            <div
              key={stat.label}
              className="glass-card-subtle flex animate-fade-in-up flex-col items-center p-6 text-center"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <stat.icon className="mb-3 h-8 w-8 animate-float text-primary" />
              <span className="text-3xl font-bold text-white">{stat.value}</span>
              <span className="mt-1 text-sm text-white/60">{stat.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[hsl(240,10%,2%)] py-10">
        <div className="mx-auto mb-10 h-px w-full max-w-6xl bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4">
          <Logo size="sm" />
          <p className="text-sm text-white/60">
            La plataforma integral para gestionar, escalar y optimizar tus operaciones.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
