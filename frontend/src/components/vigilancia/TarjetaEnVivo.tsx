import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { UserAvatar } from "@/components/UserAvatar";
import { useLanguage } from "@/hooks/useLanguage";
import type { VistaDe } from "@/hooks/useVistaEnVivo";
import { horaBogota } from "@/lib/llegadas";
import { cn } from "@/lib/utils";

// LA TARJETA EN VIVO de una persona (las pantallas de «Los números de hoy»,
// Alvaro, 20/11/2026: «a todo el mundo más vigilado», como Presencia de Argos).
// Arriba su pantalla con la cámara en la esquina; abajo quién es, en qué está y
// POR QUÉ aparece en este número (llegó tarde, nota 45, sin cámara…).

export type TonoEstado = "verde" | "naranja" | "rojo" | "neutro" | "gris";
export type TonoCifra = "mal" | "ojo" | "bien" | "neutro";

const PUNTO: Record<TonoEstado, string> = {
  verde: "bg-success",
  naranja: "bg-warning",
  rojo: "bg-destructive",
  neutro: "bg-primary",
  gris: "bg-muted-foreground/50",
};

const CIFRA: Record<TonoCifra, string> = {
  mal: "text-destructive",
  ojo: "text-warning",
  bien: "text-success",
  neutro: "text-foreground/85",
};

export interface TarjetaEnVivoProps {
  userId: string;
  nombre: string;
  equipo?: string | null;
  foto?: { foto: string | null; seed: string | null };
  vista: VistaDe | null;
  estado?: { texto: string; tono: TonoEstado } | null;
  /** Por qué aparece en este número. */
  motivo: ReactNode;
  /** La cifra de la persona a la derecha (+12 min, 45, 3 h 10 min…). */
  cifra?: ReactNode;
  tonoCifra?: TonoCifra;
  /** Qué tiene en pantalla ahora (la línea de Argos). */
  enPantalla?: string | null;
  /** A dónde lleva el toque (su vista en vivo). */
  enlace: string;
  volverA: string;
}

export function TarjetaEnVivo(p: TarjetaEnVivoProps) {
  const { t } = useLanguage();
  const imagen = p.vista?.pantallaUrl ?? p.vista?.camaraUrl ?? null;
  const conInset = !!(p.vista?.pantallaUrl && p.vista?.camaraUrl);
  return (
    <li>
      <Link
        to={p.enlace}
        state={{ volverA: p.volverA }}
        className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border/40 bg-card/20 transition-colors hover:border-foreground/25 hover:bg-card/40"
      >
        <div className="relative aspect-video w-full overflow-hidden bg-foreground/[0.04]">
          {imagen ? (
            <img src={imagen} alt="" loading="lazy"
              className={cn("h-full w-full object-cover object-top", !p.vista?.enVivo && "opacity-70 grayscale-[35%]")} />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <UserAvatar name={p.nombre} src={p.foto?.foto} seed={p.foto?.seed} size="lg" />
              <span className="text-[11px]">{t("dashboard.hoy.sinPantallazos")}</span>
            </div>
          )}
          {conInset && (
            <img src={p.vista!.camaraUrl!} alt="" loading="lazy" className="absolute right-2 top-2 h-12 w-16 rounded-lg object-cover ring-1 ring-black/40" />
          )}
          {p.vista?.cuando && (
            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium tabular-nums text-white backdrop-blur">
              {p.vista.enVivo && <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />}
              {p.vista.enVivo ? horaBogota(p.vista.cuando) : t("dashboard.hoy.ultima", { h: horaBogota(p.vista.cuando) })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2.5 px-3 pb-2 pt-3">
          <UserAvatar name={p.nombre} src={p.foto?.foto} seed={p.foto?.seed} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight">{p.nombre}</p>
            {p.estado ? (
              <span className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[11px] font-medium text-foreground/85">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PUNTO[p.estado.tono]}`} aria-hidden />
                <span className="truncate">{p.estado.texto}</span>
              </span>
            ) : p.equipo ? (
              <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{p.equipo}</span>
            ) : null}
          </div>
          {p.cifra != null && (
            <span className={cn("shrink-0 font-display text-lg font-semibold tabular-nums", CIFRA[p.tonoCifra ?? "neutro"])}>{p.cifra}</span>
          )}
        </div>
        <dl className="mt-auto grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-t border-border/30 px-3 py-2.5 text-[11.5px] leading-snug">
          <dt className="whitespace-nowrap text-muted-foreground">{t("dashboard.hoy.porQue")}</dt>
          <dd className="truncate text-foreground/90">{p.motivo}</dd>
          {p.enPantalla && (
            <>
              <dt className="whitespace-nowrap text-muted-foreground">{t("dashboard.hoy.enPantalla")}</dt>
              <dd className="truncate text-foreground/80" title={p.enPantalla}>{p.enPantalla}</dd>
            </>
          )}
        </dl>
      </Link>
    </li>
  );
}
