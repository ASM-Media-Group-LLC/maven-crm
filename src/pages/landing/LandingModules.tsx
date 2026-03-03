import {
  Users,
  FileText,
  Target,
  Contact,
  Receipt,
  CalendarDays,
  Briefcase,
  DollarSign,
  MessageSquare,
  ListTodo,
  LifeBuoy,
  Bot,
} from "lucide-react";
import ScrollReveal from "@/components/landing/ScrollReveal";

const modules = [
  {
    icon: Users,
    title: "Gestión de Creadores",
    description: "Perfiles completos, contratos, monetización, lineamientos y seguimiento operativo de cada creador.",
    metric: "215+ creadores",
    color: "bg-accent",
    glow: "hsl(271 91% 50% / 0.3)",
  },
  {
    icon: FileText,
    title: "Promolog",
    description: "Registro y seguimiento de promociones, campañas y acciones de marketing por creador.",
    metric: "Tracking diario",
    color: "bg-primary",
    glow: "hsl(211 100% 50% / 0.3)",
  },
  {
    icon: Target,
    title: "LeadGen & Marketing",
    description: "Pipeline visual para capturar, calificar y convertir leads en creadores activos.",
    metric: "Pipeline completo",
    color: "bg-success",
    glow: "hsl(145 63% 32% / 0.3)",
  },
  {
    icon: Contact,
    title: "Contacts & Closers",
    description: "CRM integrado para gestionar contactos, agencias y asignar closers a oportunidades.",
    metric: "CRM integrado",
    color: "bg-warning",
    glow: "hsl(40 96% 40% / 0.3)",
  },
  {
    icon: Receipt,
    title: "Sales & Revenue",
    description: "Dashboards de ventas, earnings por creador, comparativas y reportes de rendimiento.",
    metric: "$2.3M+ tracked",
    color: "bg-destructive",
    glow: "hsl(0 84% 60% / 0.3)",
  },
  {
    icon: CalendarDays,
    title: "Eventos & Calendario",
    description: "Organiza eventos, gestiona invitados, checklists, links compartibles y métricas post-evento.",
    metric: "Gestión completa",
    color: "bg-primary",
    glow: "hsl(211 100% 50% / 0.3)",
  },
  {
    icon: Briefcase,
    title: "HR & Recursos Humanos",
    description: "Onboarding, nómina, vacaciones, asistencia, monitoreo, capacitación y organigrama completo.",
    metric: "20+ sub-módulos",
    color: "bg-accent",
    glow: "hsl(271 91% 50% / 0.3)",
  },
  {
    icon: DollarSign,
    title: "Finanzas",
    description: "Facturación, comisiones, nómina, control financiero, cobranzas y reportes detallados.",
    metric: "Control total",
    color: "bg-success",
    glow: "hsl(145 63% 32% / 0.3)",
  },
  {
    icon: MessageSquare,
    title: "Messenger Interno",
    description: "Chat en tiempo real, videollamadas, archivos compartidos, reacciones y hilos de conversación.",
    metric: "Comunicación 24/7",
    color: "bg-warning",
    glow: "hsl(40 96% 40% / 0.3)",
  },
  {
    icon: ListTodo,
    title: "Tareas & Proyectos",
    description: "Kanban, lista, subtareas, asignaciones, contadores y proyectos compartibles externamente.",
    metric: "Productividad máxima",
    color: "bg-destructive",
    glow: "hsl(0 84% 60% / 0.3)",
  },
  {
    icon: LifeBuoy,
    title: "Tickets de Soporte",
    description: "Sistema de tickets interno para incidencias, seguimiento por prioridad y resolución.",
    metric: "Soporte organizado",
    color: "bg-primary",
    glow: "hsl(211 100% 50% / 0.3)",
  },
  {
    icon: Bot,
    title: "AI Sales Chat",
    description: "Asistente de ventas con IA que ayuda a chatters con respuestas inteligentes y estrategias.",
    metric: "IA integrada",
    color: "bg-accent",
    glow: "hsl(271 91% 50% / 0.3)",
  },
];

const LandingModules = () => (
  <section id="modulos" className="mx-auto max-w-6xl px-4 pb-20 pt-20">
    <ScrollReveal>
      <h2 className="mb-3 text-center text-2xl font-bold text-white md:text-3xl">
        12 módulos. Una sola plataforma.
      </h2>
      <p className="mx-auto mb-12 max-w-2xl text-center text-white/50">
        Cada área de tu agencia cubierta con herramientas especializadas que trabajan juntas.
      </p>
    </ScrollReveal>
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {modules.map((mod, i) => (
        <ScrollReveal key={mod.title} delay={i * 60} direction={i % 2 === 0 ? "up" : "scale"} className="h-full">
          <div
            className="glass-card-subtle group h-full p-5 transition-all duration-500 hover:scale-[1.03] hover:border-white/15"
            style={{
              ["--card-glow" as string]: mod.glow,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow = `0 0 30px -5px ${mod.glow}, inset 0 0 30px -15px ${mod.glow}`;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow = "none";
            }}
          >
            <div className={`mb-3 inline-flex rounded-lg ${mod.color} p-2.5 transition-all duration-500 group-hover:scale-110 group-hover:shadow-lg`}>
              <mod.icon className="h-5 w-5 text-white" />
            </div>
            <h3 className="mb-1.5 text-base font-semibold text-white">{mod.title}</h3>
            <p className="mb-3 text-sm leading-relaxed text-white/55">{mod.description}</p>
            <span className="text-xs font-medium text-primary transition-colors duration-300 group-hover:text-accent">{mod.metric}</span>
          </div>
        </ScrollReveal>
      ))}
    </div>
  </section>
);

export default LandingModules;
