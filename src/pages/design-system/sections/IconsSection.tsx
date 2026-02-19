import {
  User,
  Settings,
  LogOut,
  Loader2,
  Trash2,
  ExternalLink,
  Info,
  AlertCircle,
  CheckCircle,
  AlertTriangle,
  ChevronDown,
  Keyboard,
  Home,
  Search,
  Plus,
  X,
  Check,
  Eye,
  EyeOff,
  Mail,
  Lock,
  Calendar,
} from "lucide-react";
import InstagramIcon from "@/components/icons/InstagramIcon";
import TikTokIcon from "@/components/icons/TikTokIcon";
import XIconCustom from "@/components/icons/XIcon";

const sizes = [
  { className: "h-4 w-4", label: "16px", usage: "Botones, menu items, badges" },
  { className: "h-5 w-5", label: "20px", usage: "Iconos standalone, toolbars" },
  { className: "h-6 w-6", label: "24px", usage: "Default Lucide, headers de sección" },
  { className: "h-8 w-8", label: "32px", usage: "Empty states, iconos hero" },
];

const allowedColors = [
  { className: "text-foreground", label: "currentColor", usage: "Hereda del padre (default)" },
  { className: "text-muted-foreground", label: "text-muted-foreground", usage: "Iconos secundarios, hints" },
  { className: "text-primary", label: "text-primary", usage: "Acciones principales, enlaces" },
  { className: "text-destructive", label: "text-destructive", usage: "Eliminar, errores" },
];

const iconGallery = [
  { name: "Home", Icon: Home },
  { name: "Search", Icon: Search },
  { name: "User", Icon: User },
  { name: "Settings", Icon: Settings },
  { name: "LogOut", Icon: LogOut },
  { name: "Plus", Icon: Plus },
  { name: "X", Icon: X },
  { name: "Check", Icon: Check },
  { name: "Trash2", Icon: Trash2 },
  { name: "ExternalLink", Icon: ExternalLink },
  { name: "Eye", Icon: Eye },
  { name: "EyeOff", Icon: EyeOff },
  { name: "Mail", Icon: Mail },
  { name: "Lock", Icon: Lock },
  { name: "Calendar", Icon: Calendar },
  { name: "Info", Icon: Info },
  { name: "AlertCircle", Icon: AlertCircle },
  { name: "CheckCircle", Icon: CheckCircle },
  { name: "AlertTriangle", Icon: AlertTriangle },
  { name: "ChevronDown", Icon: ChevronDown },
  { name: "Keyboard", Icon: Keyboard },
  { name: "Loader2", Icon: Loader2 },
];

export const IconsSection = () => (
  <section id="icons" className="space-y-8">
    <div>
      <h2 className="text-3xl font-bold tracking-tight">4.1 Iconografía</h2>
      <p className="text-muted-foreground mt-1">
        Sistema de iconos basado exclusivamente en <code className="text-sm bg-muted px-1.5 py-0.5 rounded">lucide-react</code>. Prohibido usar otras librerías de iconos.
      </p>
    </div>

    {/* Tamaños estándar */}
    <div className="space-y-4">
      <h3 className="text-xl font-semibold">Tamaños estándar</h3>
      <p className="text-sm text-muted-foreground">Solo se permiten estos 4 tamaños. No usar valores arbitrarios.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {sizes.map((size) => (
          <div key={size.label} className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-center h-16">
              <Settings className={size.className} aria-hidden="true" />
            </div>
            <div className="text-center space-y-1">
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{size.className}</code>
              <p className="text-xs text-muted-foreground">{size.label}</p>
              <p className="text-xs text-muted-foreground">{size.usage}</p>
            </div>
          </div>
        ))}
      </div>
    </div>

    {/* Colores permitidos */}
    <div className="space-y-4">
      <h3 className="text-xl font-semibold">Colores permitidos</h3>
      <p className="text-sm text-muted-foreground">Los iconos solo deben usar estos colores semánticos.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {allowedColors.map((color) => (
          <div key={color.label} className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-center h-12">
              <Info className={`h-6 w-6 ${color.className}`} aria-hidden="true" />
            </div>
            <div className="text-center space-y-1">
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{color.label}</code>
              <p className="text-xs text-muted-foreground">{color.usage}</p>
            </div>
          </div>
        ))}
      </div>
    </div>

    {/* Galería de iconos frecuentes */}
    <div className="space-y-4">
      <h3 className="text-xl font-semibold">Galería de iconos frecuentes</h3>
      <p className="text-sm text-muted-foreground">Iconos disponibles y comúnmente utilizados en el proyecto.</p>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
        {iconGallery.map(({ name, Icon }) => (
          <div key={name} className="rounded-lg border border-border bg-card p-3 flex flex-col items-center gap-2 hover:bg-muted/50 transition-colors">
            <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            <span className="text-[10px] text-muted-foreground text-center leading-tight">{name}</span>
          </div>
        ))}
      </div>
    </div>

    {/* Iconos de marca / Redes Sociales */}
    <div className="space-y-4">
      <h3 className="text-xl font-semibold">Iconos de marca / Redes Sociales</h3>
      <p className="text-sm text-muted-foreground">
        Para redes sociales, usar siempre estos componentes custom en lugar de Lucide.
        Importar desde <code className="bg-muted px-1.5 py-0.5 rounded text-xs">@/components/icons/[Name]Icon</code>.
      </p>
      <div className="grid grid-cols-3 sm:grid-cols-3 gap-4 max-w-md">
        <div className="rounded-lg border border-border bg-card p-4 flex flex-col items-center gap-3">
          <InstagramIcon className="h-6 w-6" />
          <span className="text-xs text-muted-foreground">InstagramIcon</span>
          <span className="text-[10px] text-muted-foreground">Con gradiente</span>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 flex flex-col items-center gap-3">
          <TikTokIcon className="h-6 w-6" />
          <span className="text-xs text-muted-foreground">TikTokIcon</span>
          <span className="text-[10px] text-muted-foreground">currentColor</span>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 flex flex-col items-center gap-3">
          <XIconCustom className="h-6 w-6" />
          <span className="text-xs text-muted-foreground">XIcon</span>
          <span className="text-[10px] text-muted-foreground">currentColor</span>
        </div>
      </div>
    </div>

    {/* Reglas */}
    <div className="space-y-3">
      <h3 className="text-xl font-semibold">Reglas de uso</h3>
      <div className="rounded-lg border border-border bg-card p-5 space-y-2 text-sm text-muted-foreground">
        <div className="flex items-start gap-2">
          <Check className="h-4 w-4 text-[hsl(var(--success))] mt-0.5 shrink-0" aria-hidden="true" />
          <span>Siempre importar iconos individualmente de <code className="bg-muted px-1 py-0.5 rounded text-xs">lucide-react</code> (tree-shakable)</span>
        </div>
        <div className="flex items-start gap-2">
          <Check className="h-4 w-4 text-[hsl(var(--success))] mt-0.5 shrink-0" aria-hidden="true" />
          <span>Incluir <code className="bg-muted px-1 py-0.5 rounded text-xs">aria-hidden="true"</code> si el icono es decorativo</span>
        </div>
        <div className="flex items-start gap-2">
          <Check className="h-4 w-4 text-[hsl(var(--success))] mt-0.5 shrink-0" aria-hidden="true" />
          <span>Si el icono es el único elemento interactivo, acompañar con <code className="bg-muted px-1 py-0.5 rounded text-xs">aria-label</code> o tooltip</span>
        </div>
        <div className="flex items-start gap-2">
          <Check className="h-4 w-4 text-[hsl(var(--success))] mt-0.5 shrink-0" aria-hidden="true" />
          <span>Para redes sociales, usar <strong>siempre</strong> los iconos custom (<code className="bg-muted px-1 py-0.5 rounded text-xs">InstagramIcon</code>, <code className="bg-muted px-1 py-0.5 rounded text-xs">TikTokIcon</code>, <code className="bg-muted px-1 py-0.5 rounded text-xs">XIcon</code>) en lugar de Lucide</span>
        </div>
        <div className="flex items-start gap-2">
          <X className="h-4 w-4 text-destructive mt-0.5 shrink-0" aria-hidden="true" />
          <span>No usar iconos sin propósito semántico (decoración pura sin contexto)</span>
        </div>
        <div className="flex items-start gap-2">
          <X className="h-4 w-4 text-destructive mt-0.5 shrink-0" aria-hidden="true" />
          <span>No usar tamaños fuera de la escala estándar (16/20/24/32px)</span>
        </div>
        <div className="flex items-start gap-2">
          <X className="h-4 w-4 text-destructive mt-0.5 shrink-0" aria-hidden="true" />
          <span>No importar librerías de iconos alternativas (Font Awesome, Heroicons, etc.)</span>
        </div>
      </div>
    </div>
  </section>
);
