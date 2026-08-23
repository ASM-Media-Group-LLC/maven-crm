// Avatar único de Maven — cadena de fallback: foto real → muñequito DiceBear
// (seed determinista, normalmente el id del usuario) → iniciales sobre un
// degradé determinista. Reemplaza a los Avatar+AvatarFallback armados a mano
// en cada pantalla. Reglas:
//   - `seed`: pasar SIEMPRE que haya un id estable; si falta, se usa `name`.
//   - `ring`: anillo degradé azul→violeta, reservado para lo destacado
//     (perfil propio, selección, podios) — no ponérselo a todo.
//   - `status`: punto de presencia (online/busy/away) sobre el borde.
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { avatarGradient } from "@/lib/avatarColor";
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
  /** Clave estable para el muñequito (id de usuario/contacto). Sin seed ni foto → iniciales. */
  seed?: string | null;
  size?: UserAvatarSize;
  /** Anillo degradé azul→violeta para elementos destacados. */
  ring?: boolean;
  status?: keyof typeof STATUS_COLORS | null;
  className?: string;
}

export function UserAvatar({
  name,
  src,
  seed,
  size = "md",
  ring = false,
  status = null,
  className,
}: UserAvatarProps) {
  const s = SIZES[size];
  const fallbackSeed = seed || null;

  const core = (
    <Avatar className={cn(s.avatar, !ring && className)}>
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
          className={cn(
            "bg-gradient-to-br font-semibold text-white",
            avatarGradient(name),
            s.text,
          )}
        >
          {initials(name)}
        </AvatarFallback>
      )}
    </Avatar>
  );

  if (!ring && !status) return core;

  return (
    <div className={cn("relative inline-flex shrink-0", className)}>
      {ring ? (
        <div className="rounded-full bg-gradient-to-br from-primary to-accent p-[2px]">
          <div className="rounded-full bg-background p-[2px]">{core}</div>
        </div>
      ) : (
        core
      )}
      {status ? (
        <span
          className={cn(
            "absolute bottom-0 right-0 rounded-full border-background",
            s.dot,
            STATUS_COLORS[status],
            status === "online" && "animate-presence-pulse motion-reduce:animate-none",
          )}
        />
      ) : null}
    </div>
  );
}
