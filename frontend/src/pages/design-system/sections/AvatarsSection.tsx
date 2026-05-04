import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Check, X } from "lucide-react";

const avatarSizes = [
  { className: "h-8 w-8", label: "32px", usage: "Listas compactas, comentarios", initials: "AB" },
  { className: "h-10 w-10", label: "40px", usage: "Default, menús de usuario", initials: "CD" },
  { className: "h-12 w-12", label: "48px", usage: "Cards de perfil, headers", initials: "EF" },
  { className: "h-16 w-16", label: "64px", usage: "Páginas de perfil, hero", initials: "GH" },
];

const avatarGroupData = [
  { initials: "JD", color: "bg-primary" },
  { initials: "MR", color: "bg-accent" },
  { initials: "AL", color: "bg-[hsl(var(--success))]" },
  { initials: "KP", color: "bg-[hsl(var(--warning))]" },
  { initials: "+3", color: "bg-muted" },
];

export const AvatarsSection = () => (
  <section id="avatars" className="space-y-8">
    <div>
      <h2 className="text-3xl font-bold tracking-tight">4.2 Avatares y Logos</h2>
      <p className="text-muted-foreground mt-1">
        Componente <code className="text-sm bg-muted px-1.5 py-0.5 rounded">Avatar</code> de Radix/shadcn con fallback de iniciales y reglas para logos.
      </p>
    </div>

    {/* Tamaños */}
    <div className="space-y-4">
      <h3 className="text-xl font-semibold">Tamaños</h3>
      <p className="text-sm text-muted-foreground">Cuatro tamaños estándar con sus casos de uso.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {avatarSizes.map((size) => (
          <div key={size.label} className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-center h-20">
              <Avatar className={size.className}>
                <AvatarImage src="/placeholder.svg" alt="Avatar ejemplo" />
                <AvatarFallback className="text-xs">{size.initials}</AvatarFallback>
              </Avatar>
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

    {/* Fallback */}
    <div className="space-y-4">
      <h3 className="text-xl font-semibold">Fallback con iniciales</h3>
      <p className="text-sm text-muted-foreground">
        Cuando la imagen no carga, <code className="bg-muted px-1 py-0.5 rounded text-xs">AvatarFallback</code> muestra iniciales sobre fondo <code className="bg-muted px-1 py-0.5 rounded text-xs">bg-muted</code>.
      </p>
      <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-5">
        <Avatar className="h-10 w-10">
          <AvatarImage src="/placeholder.svg" alt="Con imagen" />
          <AvatarFallback>JD</AvatarFallback>
        </Avatar>
        <div className="text-sm">
          <p className="font-medium">Con imagen válida</p>
          <p className="text-muted-foreground">Muestra la imagen cargada</p>
        </div>
      </div>
      <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-5">
        <Avatar className="h-10 w-10">
          <AvatarImage src="/invalid-url-that-wont-load.jpg" alt="Sin imagen" />
          <AvatarFallback>MR</AvatarFallback>
        </Avatar>
        <div className="text-sm">
          <p className="font-medium">Con fallback</p>
          <p className="text-muted-foreground">Muestra las iniciales cuando la imagen falla</p>
        </div>
      </div>
    </div>

    {/* Grupo de avatares */}
    <div className="space-y-4">
      <h3 className="text-xl font-semibold">Grupo de avatares</h3>
      <p className="text-sm text-muted-foreground">
        Patrón de avatares solapados con <code className="bg-muted px-1 py-0.5 rounded text-xs">-space-x-2</code> y borde para separación visual.
      </p>
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex -space-x-2">
          {avatarGroupData.map((avatar, i) => (
            <Avatar key={i} className="h-10 w-10 border-2 border-card">
              <AvatarFallback className={`${avatar.color} text-primary-foreground text-xs`}>
                {avatar.initials}
              </AvatarFallback>
            </Avatar>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Cada avatar usa <code className="bg-muted px-1 py-0.5 rounded">border-2 border-card</code> para crear separación visual.
        </p>
      </div>
    </div>

    {/* Logos e imágenes de marca */}
    <div className="space-y-4">
      <h3 className="text-xl font-semibold">Logos e imágenes de marca</h3>
      <div className="rounded-lg border border-border bg-card p-5 space-y-3 text-sm text-muted-foreground">
        <p>Reglas para el manejo de logos e imágenes corporativas:</p>
        <ul className="space-y-2 ml-4">
          <li className="flex items-start gap-2">
            <span className="text-muted-foreground mt-0.5">•</span>
            <span>Mantener siempre el aspect ratio original — usar <code className="bg-muted px-1 py-0.5 rounded text-xs">object-contain</code></span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-muted-foreground mt-0.5">•</span>
            <span>Tamaños recomendados: <code className="bg-muted px-1 py-0.5 rounded text-xs">h-8</code> para navbar, <code className="bg-muted px-1 py-0.5 rounded text-xs">h-12</code> para headers, <code className="bg-muted px-1 py-0.5 rounded text-xs">h-16–h-24</code> para landing/hero</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-muted-foreground mt-0.5">•</span>
            <span>Almacenar archivos estáticos en <code className="bg-muted px-1 py-0.5 rounded text-xs">public/</code> o cargar desde CDN</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-muted-foreground mt-0.5">•</span>
            <span>Formatos permitidos: SVG (preferido), PNG con fondo transparente, WebP</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-muted-foreground mt-0.5">•</span>
            <span>Incluir siempre <code className="bg-muted px-1 py-0.5 rounded text-xs">alt</code> descriptivo para accesibilidad</span>
          </li>
        </ul>
      </div>
    </div>

    {/* Reglas */}
    <div className="space-y-3">
      <h3 className="text-xl font-semibold">Reglas de uso</h3>
      <div className="rounded-lg border border-border bg-card p-5 space-y-2 text-sm text-muted-foreground">
        <div className="flex items-start gap-2">
          <Check className="h-4 w-4 text-[hsl(var(--success))] mt-0.5 shrink-0" aria-hidden="true" />
          <span>Siempre usar el componente <code className="bg-muted px-1 py-0.5 rounded text-xs">Avatar</code> — nunca <code className="bg-muted px-1 py-0.5 rounded text-xs">&lt;img&gt;</code> directas para fotos de usuario</span>
        </div>
        <div className="flex items-start gap-2">
          <Check className="h-4 w-4 text-[hsl(var(--success))] mt-0.5 shrink-0" aria-hidden="true" />
          <span>Siempre incluir <code className="bg-muted px-1 py-0.5 rounded text-xs">AvatarFallback</code> con iniciales</span>
        </div>
        <div className="flex items-start gap-2">
          <Check className="h-4 w-4 text-[hsl(var(--success))] mt-0.5 shrink-0" aria-hidden="true" />
          <span>Usar <code className="bg-muted px-1 py-0.5 rounded text-xs">rounded-full</code> siempre (ya incluido en el componente base)</span>
        </div>
        <div className="flex items-start gap-2">
          <X className="h-4 w-4 text-destructive mt-0.5 shrink-0" aria-hidden="true" />
          <span>No crear variantes de forma cuadrada o redondeada personalizada</span>
        </div>
        <div className="flex items-start gap-2">
          <X className="h-4 w-4 text-destructive mt-0.5 shrink-0" aria-hidden="true" />
          <span>No omitir el fallback — siempre debe haber contenido visible si la imagen falla</span>
        </div>
      </div>
    </div>
  </section>
);
