// Avatar único de Maven — cadena de fallback: foto real → muñequito DiceBear
// (SOLO si la persona eligió uno: profiles.avatar_seed) → iniciales sobre un
// degradé determinista. Reglas:
//   - Por defecto: foto o iniciales. NO pasar ids como `seed`.
//   - `seed`: únicamente el avatar_seed elegido en Settings (o un seed
//     decorativo en ilustraciones tipo EmptyState). Cuando hay muñequito,
//     lleva SIEMPRE el anillo degradé azul→violeta (como en los mockups).
//   - `ring`: fuerza el anillo también sin muñequito (destacados/podios).
//   - `status`: punto de presencia (online/busy/away) sobre el borde.
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { tonoDeAvatar } from "@/lib/avatarColor";
import type { CSSProperties } from "react";
import { dicebearUri, initials } from "@/lib/avatar";
import { cn } from "@/lib/utils";

export type UserAvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

const SIZES: Record<UserAvatarSize, { avatar: string; text: string; dot: string }> = {
  xs: { avatar: "h-6 w-6", text: "text-[10px]", dot: "h-2 w-2 border" },
  sm: { avatar: "h-8 w-8", text: "text-xs", dot: "h-2.5 w-2.5 border-2" },
  md: { avatar: "h-10 w-10", text: "text-sm", dot: "h-3 w-3 border-2" },
  lg: { avatar: "h-12 w-12", text: "text-base", dot: "h-3 w-3 border-2" },
  xl: { avatar: "h-16 w-16", text: "text-xl", dot: "h-4 w-4 border-2" },
};

const STATUS_COLORS = {
  online: "bg-success",
  busy: "bg-warning",
  away: "bg-muted-foreground",
} as const;

export interface UserAvatarProps {
  name: string | null | undefined;
  /** URL de la foto real (avatar_url / profile_photo_url / profile_picture_url). */
  src?: string | null;
  /** avatar_seed elegido por la persona (o seed decorativo). Sin seed ni foto → iniciales. */
  seed?: string | null;
  size?: UserAvatarSize;
  /** Anillo degradé azul→violeta para elementos destacados. */
  ring?: boolean;
  status?: keyof typeof STATUS_COLORS | null;
  /** Clase de color del puntito, para cuando la manda otro sistema (el estado
   *  del Messenger, que tiene su propia paleta y colores personalizados). Gana
   *  sobre `status`, que se sigue usando para decidir SI se dibuja el punto. */
  statusClassName?: string | null;
  className?: string;
}

export function UserAvatar({
  name,
  src,
  seed,
  size = "md",
  ring = false,
  status = null,
  statusClassName = null,
  className,
}: UserAvatarProps) {
  const s = SIZES[size];
  const fallbackSeed = seed || null;

  // El muñequito elegido lleva anillo siempre; `ring` lo fuerza para el resto.
  const showRing = ring || (!src && !!fallbackSeed);

  // ⚠️ El anillo se dibuja DENTRO del cuadrado, no por fuera.
  //
  // Antes eran dos envoltorios con `p-[2px]` ALREDEDOR del avatar, así que quien
  // tiene muñequito medía 8px MÁS que quien tiene foto o iniciales del mismo
  // `size`: en la lista del Messenger esas filas sobresalían y los nombres no
  // alineaban. Y el tamaño que llegaba por `className` se aplicaba al ENVOLTORIO
  // y no al avatar, que se quedaba en su `size` por defecto — un
  // `className="h-7 w-7"` daba ~48px en un hueco de 28.
  //
  // Ahora el cuadrado exterior mide siempre lo que pidió quien lo usa (`size` o
  // `className`) y el anillo se come 4px por dentro. Todos los avatares del
  // mismo tamaño ocupan lo mismo, tengan muñequito o no.
  const core = (
    <Avatar className={showRing ? "h-full w-full" : cn(s.avatar, className)}>
      {src ? <AvatarImage src={src} alt={name ?? ""} /> : null}
      {fallbackSeed ? (
        <AvatarFallback className="bg-secondary p-0">
          <img
            src={dicebearUri(fallbackSeed)}
            alt={name ?? ""}
            className="h-full w-full"
            draggable={false}
          />
        </AvatarFallback>
      ) : (
        <AvatarFallback
          style={{ "--av-h": tonoDeAvatar(name) } as CSSProperties}
          className={cn("avatar-iniciales font-semibold", s.text)}
        >
          {initials(name)}
        </AvatarFallback>
      )}
    </Avatar>
  );

  if (!showRing && !status) return core;

  return (
    <div className={cn("relative inline-flex shrink-0", s.avatar, className)}>
      {showRing ? (
        <div className="h-full w-full rounded-full bg-gradient-to-br from-primary to-accent p-[2px]">
          {/* ua-ring-gap: sobre una superficie translúcida (.glass-panel del
              muelle) este hueco opaco punzaba un disco sólido detrás del
              muñequito. La clase deja que el CSS lo vuelva transparente ahí;
              en el resto de la app no cambia nada. */}
          <div className="ua-ring-gap h-full w-full rounded-full bg-background p-[2px]">{core}</div>
        </div>
      ) : (
        core
      )}
      {status ? (
        <span
          className={cn(
            "absolute bottom-0 right-0 rounded-full border-background",
            s.dot,
            statusClassName || STATUS_COLORS[status],
            status === "online" && "animate-presence-pulse motion-reduce:animate-none",
          )}
        />
      ) : null}
    </div>
  );
}
