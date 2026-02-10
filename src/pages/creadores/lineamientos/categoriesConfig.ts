import {
  DollarSign,
  Palette,
  MessageSquare,
  Users,
  Crown,
  Clock,
  RefreshCw,
  Mail,
  Languages,
  Calendar,
  Phone,
  Globe,
  Target,
  Tag,
  Share2,
  UserPlus,
  TrendingUp,
  Shield,
  CheckCircle,
  Database,
  Link2,
  FileText,
  CreditCard,
  ClipboardList,
  AlertTriangle,
  AlertCircle,
  type LucideIcon,
} from "lucide-react";

export type FormType = "pricing" | "detail";

export interface CategoryItem {
  title: string;
  description: string;
  icon: LucideIcon;
  formType?: FormType;
}

export interface Category {
  category: string;
  items: CategoryItem[];
}

export const CATEGORIES: Category[] = [
  {
    category: "Operación Core",
    items: [
      { title: "Precios", description: "Lista de precios por tipo de contenido o servicio", icon: DollarSign, formType: "pricing" },
      { title: "Límites", description: "Contenido o acciones NO permitidas", icon: AlertCircle },
      { title: "Gustos y Preferencias", description: "Lo que le gusta y prefiere la creadora", icon: Crown },
      { title: "Estilo de Contenido", description: "Tipos de contenido y estilo visual", icon: Palette },
      { title: "Reglas de Sexting", description: "Lineamientos para conversaciones íntimas", icon: MessageSquare },
      { title: "Estrategia PPV", description: "Define la estrategia de pay-per-view", icon: DollarSign },
      { title: "Contenido Custom", description: "Lineamientos para contenido personalizado", icon: Palette },
    ],
  },
  {
    category: "Gestión de Chats",
    items: [
      { title: "Instrucciones para Chats", description: "Guía general de conversación", icon: MessageSquare },
      { title: "Tipo de Usuarios", description: "Clasificación y trato por tipo", icon: Users },
      { title: "Fans VIP / Whales", description: "Manejo de fans de alto valor", icon: Crown },
      { title: "Tiempos de Respuesta", description: "SLA y tiempos esperados", icon: Clock },
      { title: "Estrategia de Renewals", description: "Renovaciones y retención", icon: RefreshCw },
      { title: "Mass Messages", description: "Estrategia de mensajes masivos", icon: Mail },
      { title: "Idiomas", description: "Idiomas soportados y preferencias", icon: Languages },
    ],
  },
  {
    category: "Horarios",
    items: [
      { title: "Horarios y Disponibilidad", description: "Horarios de trabajo del creador", icon: Calendar },
      { title: "Contacto de Emergencia", description: "Información de contacto urgente", icon: Phone },
      { title: "Zonas Horarias", description: "Zonas horarias relevantes", icon: Globe },
    ],
  },
  {
    category: "Negocio y Crecimiento",
    items: [
      { title: "Metas y Objetivos", description: "Objetivos de negocio del creador", icon: Target },
      { title: "Promociones Permitidas", description: "Tipos de promociones autorizadas", icon: Tag },
      { title: "Cross-Promo Redes", description: "Promoción cruzada entre redes", icon: Share2 },
      { title: "Adquisición de Fans", description: "Estrategias para nuevos fans", icon: UserPlus },
      { title: "Técnicas de Upselling", description: "Métodos de venta adicional", icon: TrendingUp },
      { title: "Retención de Fans", description: "Estrategias de retención", icon: Shield },
    ],
  },
  {
    category: "Plataformas y Cuentas",
    items: [
      { title: "Reglas de Plataforma", description: "Normas y políticas de cada plataforma", icon: CheckCircle },
      { title: "Cuentas Backup", description: "Cuentas de respaldo configuradas", icon: Database },
      { title: "Redes Sociales", description: "Perfiles y estrategia social", icon: Link2 },
    ],
  },
  {
    category: "Administrativo",
    items: [
      { title: "Onboarding", description: "Proceso de incorporación", icon: ClipboardList },
      { title: "Estado de Verificación", description: "Verificación de identidad y cuenta", icon: CheckCircle },
      { title: "Contratos y Legales", description: "Documentos legales vigentes", icon: FileText },
      { title: "Info de Pagos", description: "Métodos y datos de pago", icon: CreditCard },
      { title: "Feedback de Reunión", description: "Notas de reuniones pasadas", icon: ClipboardList },
      { title: "Historial de Problemas", description: "Registro de incidencias", icon: AlertTriangle },
      { title: "Alertas Importantes", description: "Avisos críticos sobre la cuenta", icon: AlertCircle },
    ],
  },
];
