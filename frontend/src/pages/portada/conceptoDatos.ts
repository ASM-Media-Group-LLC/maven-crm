// EL CONTENIDO DEL DOCUMENTO DE CONCEPTO.
//
// Son los datos TAL CUAL estaban en la versión anterior de /concept: los 19
// módulos con sus sub-funciones, los plugins que se venden aparte, los
// objetivos comerciales y los tres planes con sus precios. Se extrajeron del
// archivo viejo con un script, no a mano, para no perder ni cambiar una línea.
//
// El ÚNICO cambio de contenido: la ficha de videollamadas decía el nombre del
// proveedor que usamos. Eso no va en una página pública — pedido explícito de
// Jhon— así que dice "nuestro propio servidor de video".
//
// Lo que cambió es la piel: lo dibuja `Concepto.tsx` con el lenguaje visual
// de la portada (mismos tokens, misma tipografía, mismas tarjetas).
import {
  BarChart3,
  Bell,
  Brain,
  Building2,
  DollarSign,
  FileText,
  Globe,
  HeartHandshake,
  LayoutDashboard,
  Mail,
  Map,
  Megaphone,
  MessageSquare,
  Palette,
  Server,
  ShieldCheck,
  Target,
  TicketCheck,
  TrendingUp,
  UserPlus,
  Users,
  Video,
  Wallet,
} from "lucide-react";

export const MODULOS = [
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

export const PLUGINS = [
              {
                icon: Video,
                name: "Video Calls",
                description: "Videollamadas 1:1 y grupales con lobby, coworking virtual y compartir pantalla. Sobre nuestro propio servidor de video.",
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
            ];

export const OBJETIVOS = [
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

export const PLANES = [
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
