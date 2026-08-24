// Documenta el avatar canónico de Maven: `UserAvatar` (components/UserAvatar.tsx).
// Los ejemplos usan el componente real — si UserAvatar cambia, esta página cambia con él.
import { UserAvatar, type UserAvatarSize } from "@/components/UserAvatar";
import { Check, X } from "lucide-react";

const sizeRows: { size: UserAvatarSize; px: string; usage: string }[] = [
  { size: "xs", px: "24px", usage: "Chips, menciones, celdas densas" },
  { size: "sm", px: "32px", usage: "Listas compactas, comentarios" },
  { size: "md", px: "40px", usage: "Default: menús de usuario, filas" },
  { size: "lg", px: "48px", usage: "Cards de perfil, headers" },
  { size: "xl", px: "64px", usage: "Páginas de perfil, hero" },
];

export const AvatarsSection = () => (
  <section id="avatars" className="space-y-8">
    <div>
      <h2 className="text-3xl font-bold tracking-tight">4.2 Avatares y Logos</h2>
      <p className="text-muted-foreground mt-1">
        Componente <code className="text-sm bg-muted px-1.5 py-0.5 rounded">UserAvatar</code>{" "}
        (<code className="text-sm bg-muted px-1.5 py-0.5 rounded">components/UserAvatar.tsx</code>) — el único avatar
        de la app. No usar <code className="text-sm bg-muted px-1.5 py-0.5 rounded">Avatar</code> de shadcn directo ni{" "}
        <code className="text-sm bg-muted px-1.5 py-0.5 rounded">&lt;img&gt;</code> sueltas.
      </p>
    </div>

    {/* Cadena de fallback */}
    <div className="space-y-4">
      <h3 className="text-xl font-semibold">Cadena de fallback</h3>
      <p className="text-sm text-muted-foreground">
        <code className="bg-muted px-1 py-0.5 rounded text-xs">foto real</code> →{" "}
        <code className="bg-muted px-1 py-0.5 rounded text-xs">muñequito elegido</code> (solo si la persona eligió uno
        en Settings: <code className="bg-muted px-1 py-0.5 rounded text-xs">profiles.avatar_seed</code>) →{" "}
        <code className="bg-muted px-1 py-0.5 rounded text-xs">iniciales</code> sobre degradé determinista por nombre.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-5">
          <UserAvatar name="Jhon Lopez" src="/placeholder.svg" size="lg" />
          <div className="text-sm">
            <p className="font-medium">1 · Foto real</p>
            <p className="text-muted-foreground">
              <code className="bg-muted px-1 py-0.5 rounded text-xs">src</code> = avatar_url / profile_photo_url
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-5">
          <UserAvatar name="Maria Rivas" seed="ds-demo-seed" size="lg" />
          <div className="text-sm">
            <p className="font-medium">2 · Muñequito elegido</p>
            <p className="text-muted-foreground">
              <code className="bg-muted px-1 py-0.5 rounded text-xs">seed</code> = avatar_seed · anillo automático
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-5">
          <UserAvatar name="Ana Lucia Torres" size="lg" />
          <div className="text-sm">
            <p className="font-medium">3 · Iniciales</p>
            <p className="text-muted-foreground">Degradé determinista por nombre</p>
          </div>
        </div>
      </div>
    </div>

    {/* Tamaños */}
    <div className="space-y-4">
      <h3 className="text-xl font-semibold">Tamaños</h3>
      <p className="text-sm text-muted-foreground">
        Cinco tamaños vía la prop <code className="bg-muted px-1 py-0.5 rounded text-xs">size</code> — nunca clases{" "}
        <code className="bg-muted px-1 py-0.5 rounded text-xs">h-* w-*</code> a mano.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {sizeRows.map((row) => (
          <div key={row.size} className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-center h-20">
              <UserAvatar name={`Demo ${row.size.toUpperCase()}`} size={row.size} />
            </div>
            <div className="text-center space-y-1">
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded">size="{row.size}"</code>
              <p className="text-xs text-muted-foreground">{row.px}</p>
              <p className="text-xs text-muted-foreground">{row.usage}</p>
            </div>
          </div>
        ))}
      </div>
    </div>

    {/* Anillo y estado */}
    <div className="space-y-4">
      <h3 className="text-xl font-semibold">Anillo y presencia</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-5">
          <UserAvatar name="Kash Podium" size="lg" ring />
          <div className="text-sm">
            <p className="font-medium">
              <code className="bg-muted px-1 py-0.5 rounded text-xs">ring</code>
            </p>
            <p className="text-muted-foreground">
              Anillo degradé azul→violeta para destacados/podios. Con muñequito el anillo es automático.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <UserAvatar name="On Line" size="md" status="online" />
            <UserAvatar name="Bu Sy" size="md" status="busy" />
            <UserAvatar name="Aw Ay" size="md" status="away" />
          </div>
          <div className="text-sm">
            <p className="font-medium">
              <code className="bg-muted px-1 py-0.5 rounded text-xs">status</code>
            </p>
            <p className="text-muted-foreground">
              Punto de presencia: <code className="bg-muted px-1 py-0.5 rounded text-xs">online</code> ·{" "}
              <code className="bg-muted px-1 py-0.5 rounded text-xs">busy</code> ·{" "}
              <code className="bg-muted px-1 py-0.5 rounded text-xs">away</code>
            </p>
          </div>
        </div>
      </div>
    </div>

    {/* Grupo de avatares */}
    <div className="space-y-4">
      <h3 className="text-xl font-semibold">Grupo de avatares</h3>
      <p className="text-sm text-muted-foreground">
        Avatares solapados con <code className="bg-muted px-1 py-0.5 rounded text-xs">-space-x-2</code>; los degradés
        por nombre separan visualmente sin bordes extra.
      </p>
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex -space-x-2">
          {["Juan Diaz", "Maria Rojas", "Alvaro Lopez", "Karla Perez"].map((n) => (
            <UserAvatar key={n} name={n} size="md" className="ring-2 ring-card rounded-full" />
          ))}
        </div>
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
          <Check className="h-4 w-4 text-success mt-0.5 shrink-0" aria-hidden="true" />
          <span>Siempre usar <code className="bg-muted px-1 py-0.5 rounded text-xs">UserAvatar</code> — nunca <code className="bg-muted px-1 py-0.5 rounded text-xs">Avatar</code> de shadcn a mano ni <code className="bg-muted px-1 py-0.5 rounded text-xs">&lt;img&gt;</code> directas para fotos de usuario</span>
        </div>
        <div className="flex items-start gap-2">
          <Check className="h-4 w-4 text-success mt-0.5 shrink-0" aria-hidden="true" />
          <span>Pasar siempre <code className="bg-muted px-1 py-0.5 rounded text-xs">name</code>: es la fuente de las iniciales y del degradé determinista</span>
        </div>
        <div className="flex items-start gap-2">
          <Check className="h-4 w-4 text-success mt-0.5 shrink-0" aria-hidden="true" />
          <span><code className="bg-muted px-1 py-0.5 rounded text-xs">seed</code> = únicamente el <code className="bg-muted px-1 py-0.5 rounded text-xs">avatar_seed</code> elegido en Settings (o un seed decorativo en ilustraciones tipo EmptyState)</span>
        </div>
        <div className="flex items-start gap-2">
          <X className="h-4 w-4 text-destructive mt-0.5 shrink-0" aria-hidden="true" />
          <span><strong className="text-foreground">Nunca pasar ids como <code className="bg-muted px-1 py-0.5 rounded text-xs">seed</code></strong> — un id genera un muñequito que la persona no eligió; sin foto ni seed, el fallback correcto son las iniciales</span>
        </div>
        <div className="flex items-start gap-2">
          <X className="h-4 w-4 text-destructive mt-0.5 shrink-0" aria-hidden="true" />
          <span>No crear variantes de forma cuadrada ni tamaños ad-hoc fuera de <code className="bg-muted px-1 py-0.5 rounded text-xs">xs–xl</code></span>
        </div>
      </div>
    </div>
  </section>
);
