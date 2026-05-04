import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";
import { Badge } from "@/components/ui/badge";
import AnimatedGradientBackground from "@/components/auth/AnimatedGradientBackground";
import ScrollReveal from "@/components/landing/ScrollReveal";
import {
  LayoutDashboard, Users, DollarSign, MessageSquare, Video, ListTodo,
  Calendar, Target, TrendingUp, Megaphone, TicketCheck, Building2,
  Wallet, ShieldCheck, Bell, Palette, Map, Check, Star, Zap,
  Brain, ChevronRight, Globe, BarChart3, FileText, UserPlus,
  Settings, Clock, BookOpen, HeartHandshake, Mail, Server, Plug
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

/* ─── Module Data ─── */
const modules = [
  {
    icon: LayoutDashboard,
    name: "Dashboard",
    description: "Centro de comando con visibilidad total de la operación.",
    features: [
      "KPIs globales en tiempo real",
      "Announcements internos con audiencia segmentada",
      "Métricas de creadores, ventas y HR",
      "Clari AI — Asistente flotante con contexto de la agencia",
      "Widgets personalizables por rol",
    ],
  },
  {
    icon: Users,
    name: "Gestión de Creadores",
    description: "Perfiles 360° con toda la información operativa, comercial y personal de cada creador.",
    features: [
      "Perfil completo: Info personal, operaciones, lineamientos, redes sociales",
      "Monetización mensual con histórico y gráficos",
      "Documentos, notas y tickets por creador",
      "Historial de cambios y auditoría",
      "Onboarding wizard paso a paso",
      "Offboarding con checklist y aprobaciones",
      "Verificación de perfil y export PDF",
      "Cambio de status y categorías",
      "Módulo de Prospectos independiente",
      "Asignación de manager, specialist y closer",
    ],
  },
  {
    icon: DollarSign,
    name: "Creator Sales",
    description: "Analítica avanzada de ventas por creador con comparativas y tendencias.",
    features: [
      "Sales Overview con KPIs consolidados",
      "Comparativa mes a mes por creador",
      "Top 10 creadoras por revenue",
      "Indicadores: subiendo, bajando, alto potencial, en riesgo",
      "Earnings detallados por creador y período",
      "Heatmaps de actividad de ventas",
      "Trends y proyecciones",
      "Tracking de chargebacks",
    ],
  },
  {
    icon: Brain,
    name: "AI Sales Chat",
    description: "Asistente de inteligencia artificial entrenado para optimizar las ventas de chatters.",
    features: [
      "Chat conversacional con IA especializada",
      "Conversaciones persistentes por usuario",
      "Contexto de lineamientos del creador",
      "Configuración de personalidad y tono",
      "Sugerencias de respuestas y estrategias",
    ],
  },
  {
    icon: HeartHandshake,
    name: "Contactos",
    description: "CRM completo para gestionar la base de contactos de la agencia.",
    features: [
      "Vista grid y tabla con filtros avanzados",
      "Creación rápida de contactos",
      "Historial de interacciones",
      "Archivos multimedia por contacto",
      "Asignación a closers",
      "Conversión a creador desde contacto",
    ],
  },
  {
    icon: Target,
    name: "Closers",
    description: "Pipeline de cierre de ventas con seguimiento multi-plataforma.",
    features: [
      "Pipeline visual: Nuevas → Asignadas → Completadas",
      "Ventas por plataforma multi-producto con precios",
      "Monetización y comisión editables inline",
      "Conversión directa a Creadora",
      "KPI cards con revenue por plataforma (OF, Blu, Piclink, etc.)",
      "Historial de contacto y seguimiento",
      "Devolución a etapa anterior",
    ],
  },
  {
    icon: TrendingUp,
    name: "LeadGen & Marketing",
    description: "Captura y calificación de leads con métricas de performance.",
    features: [
      "Base de datos de leads con calificación",
      "Captura automática desde formularios",
      "Conversión de lead a contacto/closer",
      "Performance por agente y por canal",
      "Vista supervisor con métricas globales",
      "Filtros por fuente, estado y fecha",
    ],
  },
  {
    icon: Megaphone,
    name: "Promolog",
    description: "Registro diario de promociones realizadas por cada creador.",
    features: [
      "Registro diario de promos por creador",
      "Vista grid y tabla",
      "Filtros por fecha y creador",
      "Historial completo de promociones",
    ],
  },
  {
    icon: Calendar,
    name: "Eventos",
    description: "Gestión completa de eventos con agenda compartida.",
    features: [
      "Creación de eventos con invitados y checklist",
      "Links compartibles públicos",
      "Agenda compartida con token de acceso",
      "Vista calendario mensual/semanal",
      "Cierre de evento con resumen",
      "Notificaciones automáticas",
    ],
  },
  {
    icon: ListTodo,
    name: "Tareas & Proyectos",
    description: "Gestión de tareas estilo Kanban con proyectos y carpetas.",
    features: [
      "Kanban board + vista lista",
      "Subtareas y dependencias",
      "Asignación a múltiples usuarios",
      "Proyectos con carpetas organizativas",
      "Compartir externo con link público",
      "Countdown y fechas límite",
      "Prioridades editables inline",
      "Filtros avanzados y búsqueda",
    ],
  },
  {
    icon: MessageSquare,
    name: "Messenger",
    description: "Sistema de mensajería interna en tiempo real estilo Google Chat.",
    features: [
      "Chat en tiempo real con WebSockets",
      "Rooms / canales por equipo",
      "Envío de archivos y multimedia",
      "Reacciones con emojis",
      "Respuestas en hilo",
      "Mensajes fijados y búsqueda",
      "Espacios organizativos (Spaces)",
      "Indicadores de lectura y presencia online",
    ],
  },
  {
    icon: Video,
    name: "Video Calls",
    description: "Videollamadas integradas con lobby y coworking virtual.",
    features: [
      "Videollamadas 1:1 y grupales",
      "Coworking virtual con salas temáticas",
      "Compartir pantalla con permisos",
      "Lobby de espera",
      "Integración con LiveKit",
    ],
  },
  {
    icon: TicketCheck,
    name: "Tickets de Soporte",
    description: "Sistema de tickets internos con prioridades y seguimiento.",
    features: [
      "Creación y asignación de tickets",
      "Prioridades (baja, media, alta, urgente)",
      "Comentarios y actualización de estado",
      "Filtros por estado, prioridad y asignado",
      "Historial completo del ticket",
    ],
  },
  {
    icon: Building2,
    name: "HR & RRHH",
    description: "Suite completa de recursos humanos para la gestión del equipo.",
    features: [
      "Dashboard HR con métricas del equipo",
      "Directorio de empleados",
      "Onboarding y offboarding de empleados",
      "Nómina y deducciones",
      "Vacaciones, permisos y ausencias",
      "Control de asistencia con check-in/out",
      "Incidencias laborales",
      "Monitoreo de rendimiento",
      "Capacitación: chatters y tech",
      "Performance reviews",
      "Horarios y turnos",
      "Hora Bank y overtime tracking",
      "Organigrama interactivo",
      "Módulo de Applicants (reclutamiento)",
      "Announcements internos segmentados",
    ],
  },
  {
    icon: Wallet,
    name: "Finanzas",
    description: "Control financiero integral con facturación profesional.",
    features: [
      "Dashboard financiero con KPIs",
      "Facturación: Invoices A4 con preview",
      "Notas de pago A4 con preview",
      "Comisiones por creador y empleado",
      "Control de nómina",
      "Control financiero por centro de costo",
      "Cobranzas y seguimiento de pagos",
      "Reportes exportables",
      "Horas fijas y variables",
      "Configuración de métodos de pago",
    ],
  },
  {
    icon: ShieldCheck,
    name: "Administración",
    description: "Control total de accesos, roles y auditoría.",
    features: [
      "Gestión de usuarios y invitaciones",
      "Roles custom (admin, manager, closer, chatter, etc.)",
      "Permisos granulares por módulo",
      "Log de auditoría completo",
      "Configuración global de la plataforma",
    ],
  },
  {
    icon: Bell,
    name: "Notificaciones",
    description: "Sistema global de notificaciones en tiempo real.",
    features: [
      "Notificaciones push en la plataforma",
      "Centro de notificaciones unificado",
      "Configuración por tipo de notificación",
    ],
  },
  {
    icon: Palette,
    name: "Design System",
    description: "Documentación interna del sistema de diseño para consistencia visual.",
    features: [
      "Catálogo de componentes UI",
      "Guía de tokens y colores",
      "Referencia de tipografía y espaciado",
    ],
  },
  {
    icon: Map,
    name: "Roadmap",
    description: "Roadmap público del producto para transparencia con clientes.",
    features: [
      "Vista pública del roadmap",
      "Categorías por módulo",
      "Estados: planificado, en progreso, completado",
    ],
  },
];

/* ─── Pricing Data ─── */
const pricingTiers = [
  {
    name: "Starter",
    price: "$299",
    period: "/mes",
    description: "Para agencias que inician su digitalización",
    highlight: false,
    features: [
      "5 módulos principales",
      "Hasta 25 creadores",
      "5 usuarios del equipo",
      "Messenger básico",
      "Soporte por email",
      "Dashboard con KPIs",
      "Gestión de contactos",
    ],
    cta: "Comenzar",
  },
  {
    name: "Professional",
    price: "$799",
    period: "/mes",
    description: "Para agencias en crecimiento que necesitan escalar",
    highlight: true,
    features: [
      "12 módulos completos",
      "Hasta 100 creadores",
      "25 usuarios del equipo",
      "AI Sales Chat incluido",
      "Messenger + Video Calls",
      "HR & Finanzas completo",
      "Facturación A4 profesional",
      "Soporte prioritario",
      "Reportes avanzados",
    ],
    cta: "Elegir Professional",
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "Para agencias líderes con necesidades específicas",
    highlight: false,
    features: [
      "Todos los módulos ilimitados",
      "Creadores ilimitados",
      "Usuarios ilimitados",
      "IA personalizada",
      "Integraciones custom",
      "Soporte dedicado 24/7",
      "Onboarding personalizado",
      "SLA garantizado",
      "API access",
    ],
    cta: "Contactar ventas",
  },
];

const marketingGoals = [
  {
    icon: Globe,
    title: "Audiencia Target",
    description: "Agencias de creadores digitales de contenido en Latinoamérica, España y USA que gestionan entre 10 y 500+ creadores.",
  },
  {
    icon: BarChart3,
    title: "Propuesta de Valor",
    description: "Reemplazar 8+ herramientas fragmentadas con una sola plataforma integrada, reduciendo costos operativos hasta un 60%.",
  },
  {
    icon: FileText,
    title: "Diferenciadores",
    description: "IA integrada para ventas, gestión 360° de creadores, facturación profesional, y HR completo — todo en español y diseñado para la industria.",
  },
  {
    icon: UserPlus,
    title: "Estrategia de Crecimiento",
    description: "Modelo freemium → trial → paid. Onboarding guiado, content marketing y partnerships con agencias líderes.",
  },
];

/* ─── Page Component ─── */
const Concept = () => {
  return (
    <div className="min-h-screen bg-[hsl(240,10%,2%)] text-white">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-[hsl(240,10%,2%)]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Logo size="sm" />
          <div className="hidden items-center gap-6 md:flex">
            {[
              { href: "#modulos", label: "Módulos" },
              { href: "#marketing", label: "Marketing" },
              { href: "#pricing", label: "Pricing" },
            ].map((link) => (
              <a key={link.href} href={link.href} className="text-sm text-white/50 transition-colors hover:text-white">
                {link.label}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" asChild className="border-white/10 text-white hover:bg-white/10">
              <Link to="/">← Inicio</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden pb-16 pt-16 md:pt-24">
        <AnimatedGradientBackground />
        <div className="relative z-10 flex flex-col items-center px-4 text-center">
          <Badge variant="secondary" className="glass-card-subtle mb-6 border-white/10 bg-white/5 text-sm font-normal text-white/80">
            Concept Document — Confidencial
          </Badge>
          <Logo size="lg" className="mb-6" />
          <h1 className="mb-4 max-w-4xl text-3xl font-bold tracking-tight md:text-5xl">
            La plataforma operativa para{" "}
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              agencias de creadores
            </span>
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-lg text-white/50">
            Maven centraliza gestión de creadores, ventas, HR, finanzas, comunicación y más en un solo ecosistema diseñado específicamente para la industria de creadores digitales.
          </p>
          <div className="flex flex-wrap justify-center gap-4 text-sm text-white/40">
            <span className="flex items-center gap-1.5"><Settings className="h-4 w-4 text-primary" />19 módulos</span>
            <span className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-accent" />Tiempo real</span>
            <span className="flex items-center gap-1.5"><Brain className="h-4 w-4 text-primary" />IA integrada</span>
            <span className="flex items-center gap-1.5"><BookOpen className="h-4 w-4 text-accent" />100% español</span>
          </div>
        </div>
      </section>

      <div className="mx-auto h-px max-w-4xl bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

      {/* Executive Summary */}
      <section className="py-16">
        <div className="mx-auto max-w-4xl px-4">
          <ScrollReveal>
            <div className="glass-card p-8 md:p-12">
              <h2 className="mb-6 text-2xl font-bold">Resumen Ejecutivo</h2>
              <div className="space-y-4 text-white/60 leading-relaxed">
                <p>
                  <strong className="text-white">Maven</strong> es un ecosistema SaaS diseñado exclusivamente para agencias que gestionan creadores de contenido digital. A diferencia de herramientas genéricas como Notion, Slack o hojas de cálculo, Maven integra todos los procesos operativos en una sola plataforma.
                </p>
                <p>
                  Desde la prospección y cierre de nuevos creadores, pasando por la gestión diaria de contenido y ventas, hasta la nómina, facturación y recursos humanos del equipo — Maven elimina la fragmentación y reduce el tiempo operativo significativamente.
                </p>
                <p>
                  La plataforma está construida con <strong className="text-white">inteligencia artificial integrada</strong>, mensajería en tiempo real, videollamadas, y un sistema de permisos granular que permite a cada miembro del equipo ver exactamente lo que necesita.
                </p>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <div className="mx-auto h-px max-w-4xl bg-gradient-to-r from-transparent via-accent/20 to-transparent" />

      {/* Plugins */}
      <section className="py-16">
        <div className="mx-auto max-w-5xl px-4">
          <ScrollReveal>
            <div className="mb-10 text-center">
              <Badge variant="secondary" className="mb-4 border-white/10 bg-white/5 text-white/70">
                <Plug className="mr-1.5 inline h-3.5 w-3.5" />
                También vendidos por separado
              </Badge>
              <h2 className="text-3xl font-bold md:text-4xl">Plugins Disponibles</h2>
              <p className="mx-auto mt-3 max-w-2xl text-white/50">
                Módulos que se integran a la plataforma o pueden adquirirse de forma independiente.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              {
                icon: Video,
                name: "Video Calls",
                description: "Videollamadas 1:1 y grupales con lobby, coworking virtual y compartir pantalla. Integración con LiveKit.",
              },
              {
                icon: MessageSquare,
                name: "Messenger",
                description: "Mensajería en tiempo real estilo Google Chat. Canales por equipo, archivos, reacciones, hilos y espacios organizativos.",
              },
              {
                icon: Mail,
                name: "Email Server",
                description: "Correos corporativos integrados a la plataforma. Dominio propio, bandejas por usuario y notificaciones unificadas.",
              },
              {
                icon: Server,
                name: "Organization Server",
                description: "Servidor de organización y gestión de equipos. Estructura de departamentos, roles y permisos granulares centralizados.",
              },
            ].map((plugin) => (
              <ScrollReveal key={plugin.name}>
                <div className="glass-card flex items-start gap-4 rounded-xl border-white/[0.06] p-6">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                    <plugin.icon className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{plugin.name}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-white/50">{plugin.description}</p>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto h-px max-w-4xl bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

      {/* Modules */}
      <section id="modulos" className="py-16">
        <div className="mx-auto max-w-5xl px-4">
          <ScrollReveal>
            <div className="mb-12 text-center">
              <Badge variant="secondary" className="mb-4 border-white/10 bg-white/5 text-white/70">
                Plataforma Completa
              </Badge>
              <h2 className="text-3xl font-bold md:text-4xl">19 Módulos Integrados</h2>
              <p className="mx-auto mt-3 max-w-2xl text-white/50">
                Cada módulo está diseñado para resolver una necesidad específica de las agencias de creadores, con sub-funciones detalladas y flujos optimizados.
              </p>
            </div>
          </ScrollReveal>

          <Accordion type="multiple" defaultValue={modules.map(m => m.name)} className="space-y-3">
            {modules.map((mod, i) => (
              <ScrollReveal key={mod.name} delay={i * 40}>
                <AccordionItem value={mod.name} className="glass-card border-white/[0.06] rounded-xl overflow-hidden">
                  <AccordionTrigger className="px-6 py-4 hover:no-underline hover:bg-white/[0.02] [&[data-state=open]]:bg-white/[0.03]">
                    <div className="flex items-center gap-4 text-left">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <mod.icon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <span className="font-semibold text-white">{mod.name}</span>
                        <p className="text-sm text-white/40 mt-0.5">{mod.description}</p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-6 pb-5">
                    <ul className="grid gap-2 sm:grid-cols-2 pt-2">
                      {mod.features.map((feat) => (
                        <li key={feat} className="flex items-start gap-2 text-sm text-white/60">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                          {feat}
                        </li>
                      ))}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              </ScrollReveal>
            ))}
          </Accordion>
        </div>
      </section>

      <div className="mx-auto h-px max-w-4xl bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

      {/* Marketing Goals */}
      <section id="marketing" className="py-16">
        <div className="mx-auto max-w-5xl px-4">
          <ScrollReveal>
            <div className="mb-12 text-center">
              <Badge variant="secondary" className="mb-4 border-white/10 bg-white/5 text-white/70">
                Estrategia Comercial
              </Badge>
              <h2 className="text-3xl font-bold md:text-4xl">Objetivos de Marketing</h2>
            </div>
          </ScrollReveal>
          <div className="grid gap-6 md:grid-cols-2">
            {marketingGoals.map((goal, i) => (
              <ScrollReveal key={goal.title} delay={i * 100}>
                <div className="glass-card h-full p-6">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                    <goal.icon className="h-5 w-5 text-accent" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold">{goal.title}</h3>
                  <p className="text-sm text-white/50 leading-relaxed">{goal.description}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto h-px max-w-4xl bg-gradient-to-r from-transparent via-accent/20 to-transparent" />

      {/* Pricing */}
      <section id="pricing" className="py-16">
        <div className="mx-auto max-w-5xl px-4">
          <ScrollReveal>
            <div className="mb-12 text-center">
              <Badge variant="secondary" className="mb-4 border-white/10 bg-white/5 text-white/70">
                Planes & Precios
              </Badge>
              <h2 className="text-3xl font-bold md:text-4xl">Pricing para Agencias</h2>
              <p className="mx-auto mt-3 max-w-xl text-white/50">
                Planes flexibles que crecen con tu agencia. Todos incluyen actualizaciones y soporte.
              </p>
            </div>
          </ScrollReveal>
          <div className="grid gap-6 md:grid-cols-3">
            {pricingTiers.map((tier, i) => (
              <ScrollReveal key={tier.name} delay={i * 120}>
                <div
                  className={`glass-card relative flex h-full flex-col p-6 ${
                    tier.highlight
                      ? "border-primary/40 ring-1 ring-primary/20"
                      : ""
                  }`}
                >
                  {tier.highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge className="bg-primary text-primary-foreground">
                        <Star className="mr-1 h-3 w-3" /> Más popular
                      </Badge>
                    </div>
                  )}
                  <div className="mb-6">
                    <h3 className="text-xl font-bold">{tier.name}</h3>
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="text-3xl font-bold">{tier.price}</span>
                      <span className="text-white/40">{tier.period}</span>
                    </div>
                    <p className="mt-2 text-sm text-white/40">{tier.description}</p>
                  </div>
                  <ul className="mb-8 flex-1 space-y-2.5">
                    {tier.features.map((feat) => (
                      <li key={feat} className="flex items-center gap-2 text-sm text-white/60">
                        <Check className="h-4 w-4 shrink-0 text-emerald-400" />
                        {feat}
                      </li>
                    ))}
                  </ul>
                  <Button
                    className={`w-full ${
                      tier.highlight
                        ? "transition-all duration-300 hover:scale-105 hover:shadow-[0_0_25px_hsl(var(--primary)/0.4)]"
                        : ""
                    }`}
                    variant={tier.highlight ? "default" : "outline"}
                    asChild
                  >
                    <Link to="/register">
                      {tier.cta} <ChevronRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto h-px max-w-4xl bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

      {/* CTA */}
      <section className="relative overflow-hidden py-20">
        <AnimatedGradientBackground />
        <div className="relative z-10 mx-auto max-w-3xl px-4 text-center">
          <ScrollReveal direction="scale">
            <div className="glass-card p-10 md:p-14">
              <Zap className="mx-auto mb-4 h-10 w-10 text-primary" />
              <h2 className="mb-4 text-2xl font-bold md:text-3xl">
                ¿Listo para transformar tu agencia?
              </h2>
              <p className="mb-8 text-white/50">
                Agenda una demo personalizada y descubre cómo Maven puede optimizar cada proceso de tu operación.
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <Button size="lg" asChild className="transition-all duration-300 hover:scale-105 hover:shadow-[0_0_25px_hsl(var(--primary)/0.4)]">
                  <Link to="/register">Solicitar demo</Link>
                </Button>
                <Button size="lg" variant="outline" asChild className="border-white/10 text-white hover:bg-white/10">
                  <Link to="/">Volver al inicio</Link>
                </Button>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] py-8">
        <div className="mx-auto max-w-6xl px-4 text-center text-sm text-white/30">
          © {new Date().getFullYear()} Maven — Documento de concepto. Todos los precios son referenciales y sujetos a cambios.
        </div>
      </footer>
    </div>
  );
};

export default Concept;
