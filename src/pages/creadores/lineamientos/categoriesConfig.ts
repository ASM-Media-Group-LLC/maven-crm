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

export type FormType = "pricing" | "detail" | "language";

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
      { title: "Instrucciones para Chats", description: "Guía general de conversación", icon: MessageSquare, formType: "detail" },
      { title: "Tipo de Usuarios", description: "Clasificación y trato por tipo", icon: Users, formType: "detail" },
      { title: "Fans VIP / Whales", description: "Manejo de fans de alto valor", icon: Crown, formType: "detail" },
      { title: "Tiempos de Respuesta", description: "SLA y tiempos esperados", icon: Clock, formType: "detail" },
      { title: "Estrategia de Renewals", description: "Renovaciones y retención", icon: RefreshCw, formType: "detail" },
      { title: "Mass Messages", description: "Estrategia de mensajes masivos", icon: Mail, formType: "detail" },
      { title: "Idiomas", description: "Idiomas soportados y preferencias", icon: Languages, formType: "language" },
    ],
  },
  {
    category: "Horarios",
    items: [
      { title: "Horarios y Disponibilidad", description: "Horarios de trabajo del creador", icon: Calendar, formType: "detail" },
      { title: "Contacto de Emergencia", description: "Información de contacto urgente", icon: Phone, formType: "detail" },
      { title: "Zonas Horarias", description: "Zonas horarias relevantes", icon: Globe, formType: "detail" },
    ],
  },
  {
    category: "Negocio y Crecimiento",
    items: [
      { title: "Metas y Objetivos", description: "Objetivos de negocio del creador", icon: Target, formType: "detail" },
      { title: "Promociones Permitidas", description: "Tipos de promociones autorizadas", icon: Tag, formType: "detail" },
      { title: "Cross-Promo Redes", description: "Promoción cruzada entre redes", icon: Share2, formType: "detail" },
      { title: "Adquisición de Fans", description: "Estrategias para nuevos fans", icon: UserPlus, formType: "detail" },
      { title: "Técnicas de Upselling", description: "Métodos de venta adicional", icon: TrendingUp, formType: "detail" },
      { title: "Retención de Fans", description: "Estrategias de retención", icon: Shield, formType: "detail" },
    ],
  },
  {
    category: "Plataformas y Cuentas",
    items: [
      { title: "Reglas de Plataforma", description: "Normas y políticas de cada plataforma", icon: CheckCircle, formType: "detail" },
      { title: "Cuentas Backup", description: "Cuentas de respaldo configuradas", icon: Database, formType: "detail" },
      { title: "Redes Sociales", description: "Perfiles y estrategia social", icon: Link2, formType: "detail" },
    ],
  },
  {
    category: "Administrativo",
    items: [
      { title: "Onboarding", description: "Proceso de incorporación", icon: ClipboardList, formType: "detail" },
      { title: "Estado de Verificación", description: "Verificación de identidad y cuenta", icon: CheckCircle, formType: "detail" },
      { title: "Contratos y Legales", description: "Documentos legales vigentes", icon: FileText, formType: "detail" },
      { title: "Info de Pagos", description: "Métodos y datos de pago", icon: CreditCard, formType: "detail" },
      { title: "Feedback de Reunión", description: "Notas de reuniones pasadas", icon: ClipboardList, formType: "detail" },
      { title: "Historial de Problemas", description: "Registro de incidencias", icon: AlertTriangle, formType: "detail" },
      { title: "Alertas Importantes", description: "Avisos críticos sobre la cuenta", icon: AlertCircle, formType: "detail" },
    ],
  },
];
