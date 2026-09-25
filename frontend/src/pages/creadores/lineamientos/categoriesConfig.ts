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
import type { TranslationKey } from "@/lib/i18n";

export type FormType = "pricing" | "detail" | "language";

// ⚠️ `category` y `title` son DATO: se guardan en creator_guidelines
// (guideline_type / title) y la pestaña los compara con lo guardado para saber
// qué ítem ya tiene contenido. Se quedan en español siempre. Lo que se MUESTRA
// es `label` (y `description`), que son claves del diccionario.
export interface CategoryItem {
  title: string;
  label: TranslationKey;
  description: TranslationKey;
  icon: LucideIcon;
  formType?: FormType;
}

export interface Category {
  category: string;
  label: TranslationKey;
  items: CategoryItem[];
}

export const CATEGORIES: Category[] = [
  {
    category: "Operación Core",
    label: "creadores.guide.cat.ops",
    items: [
      { title: "Precios", label: "creadores.guide.item.prices", description: "creadores.guide.item.prices.desc", icon: DollarSign, formType: "pricing" },
      { title: "Límites", label: "creadores.guide.item.limits", description: "creadores.guide.item.limits.desc", icon: AlertCircle },
      { title: "Gustos y Preferencias", label: "creadores.guide.item.likes", description: "creadores.guide.item.likes.desc", icon: Crown },
      { title: "Estilo de Contenido", label: "creadores.guide.item.contentStyle", description: "creadores.guide.item.contentStyle.desc", icon: Palette },
      { title: "Reglas de Sexting", label: "creadores.guide.item.sexting", description: "creadores.guide.item.sexting.desc", icon: MessageSquare },
      { title: "Estrategia PPV", label: "creadores.guide.item.ppv", description: "creadores.guide.item.ppv.desc", icon: DollarSign },
      { title: "Contenido Custom", label: "creadores.guide.item.custom", description: "creadores.guide.item.custom.desc", icon: Palette },
    ],
  },
  {
    category: "Gestión de Chats",
    label: "creadores.guide.cat.chats",
    items: [
      { title: "Instrucciones para Chats", label: "creadores.guide.item.chatInstructions", description: "creadores.guide.item.chatInstructions.desc", icon: MessageSquare, formType: "detail" },
      { title: "Tipo de Usuarios", label: "creadores.guide.item.userTypes", description: "creadores.guide.item.userTypes.desc", icon: Users, formType: "detail" },
      { title: "Fans VIP / Whales", label: "creadores.guide.item.vip", description: "creadores.guide.item.vip.desc", icon: Crown, formType: "detail" },
      { title: "Tiempos de Respuesta", label: "creadores.guide.item.responseTimes", description: "creadores.guide.item.responseTimes.desc", icon: Clock, formType: "detail" },
      { title: "Estrategia de Renewals", label: "creadores.guide.item.renewals", description: "creadores.guide.item.renewals.desc", icon: RefreshCw, formType: "detail" },
      { title: "Mass Messages", label: "creadores.guide.item.mass", description: "creadores.guide.item.mass.desc", icon: Mail, formType: "detail" },
      { title: "Idiomas", label: "creadores.guide.item.languages", description: "creadores.guide.item.languages.desc", icon: Languages, formType: "language" },
    ],
  },
  {
    category: "Horarios",
    label: "creadores.guide.cat.schedule",
    items: [
      { title: "Horarios y Disponibilidad", label: "creadores.guide.item.availability", description: "creadores.guide.item.availability.desc", icon: Calendar, formType: "detail" },
      { title: "Contacto de Emergencia", label: "creadores.guide.item.emergency", description: "creadores.guide.item.emergency.desc", icon: Phone, formType: "detail" },
      { title: "Zonas Horarias", label: "creadores.guide.item.timeZones", description: "creadores.guide.item.timeZones.desc", icon: Globe, formType: "detail" },
    ],
  },
  {
    category: "Negocio y Crecimiento",
    label: "creadores.guide.cat.business",
    items: [
      { title: "Metas y Objetivos", label: "creadores.guide.item.goals", description: "creadores.guide.item.goals.desc", icon: Target, formType: "detail" },
      { title: "Promociones Permitidas", label: "creadores.guide.item.promos", description: "creadores.guide.item.promos.desc", icon: Tag, formType: "detail" },
      { title: "Cross-Promo Redes", label: "creadores.guide.item.crossPromo", description: "creadores.guide.item.crossPromo.desc", icon: Share2, formType: "detail" },
      { title: "Adquisición de Fans", label: "creadores.guide.item.acquisition", description: "creadores.guide.item.acquisition.desc", icon: UserPlus, formType: "detail" },
      { title: "Técnicas de Upselling", label: "creadores.guide.item.upselling", description: "creadores.guide.item.upselling.desc", icon: TrendingUp, formType: "detail" },
      { title: "Retención de Fans", label: "creadores.guide.item.retention", description: "creadores.guide.item.retention.desc", icon: Shield, formType: "detail" },
    ],
  },
  {
    category: "Plataformas y Cuentas",
    label: "creadores.guide.cat.platforms",
    items: [
      { title: "Reglas de Plataforma", label: "creadores.guide.item.platformRules", description: "creadores.guide.item.platformRules.desc", icon: CheckCircle, formType: "detail" },
      { title: "Cuentas Backup", label: "creadores.guide.item.backup", description: "creadores.guide.item.backup.desc", icon: Database, formType: "detail" },
      { title: "Redes Sociales", label: "creadores.guide.item.socials", description: "creadores.guide.item.socials.desc", icon: Link2, formType: "detail" },
    ],
  },
  {
    category: "Administrativo",
    label: "creadores.guide.cat.admin",
    items: [
      { title: "Onboarding", label: "creadores.guide.item.onboarding", description: "creadores.guide.item.onboarding.desc", icon: ClipboardList, formType: "detail" },
      { title: "Estado de Verificación", label: "creadores.guide.item.verification", description: "creadores.guide.item.verification.desc", icon: CheckCircle, formType: "detail" },
      { title: "Contratos y Legales", label: "creadores.guide.item.contracts", description: "creadores.guide.item.contracts.desc", icon: FileText, formType: "detail" },
      { title: "Info de Pagos", label: "creadores.guide.item.payments", description: "creadores.guide.item.payments.desc", icon: CreditCard, formType: "detail" },
      { title: "Feedback de Reunión", label: "creadores.guide.item.meetingFeedback", description: "creadores.guide.item.meetingFeedback.desc", icon: ClipboardList, formType: "detail" },
      { title: "Historial de Problemas", label: "creadores.guide.item.issues", description: "creadores.guide.item.issues.desc", icon: AlertTriangle, formType: "detail" },
      { title: "Alertas Importantes", label: "creadores.guide.item.alerts", description: "creadores.guide.item.alerts.desc", icon: AlertCircle, formType: "detail" },
    ],
  },
];
