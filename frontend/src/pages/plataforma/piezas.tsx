import type { ReactNode } from "react";
import { AlertTriangle, Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { claveDeError } from "@/lib/plataforma";
import { cn } from "@/lib/utils";

// Piezas chicas de los paneles de la plataforma, con el sistema de diseño de
// Maven: vidrio, números como baldosa o barra (no anillos), avatar de UNA letra,
// el acento morado solo en acentos (nunca de fondo).

/** Número grande con su etiqueta (baldosa). */
export function Baldosa({ valor, etiqueta, vivo, tono, pie, className }: {
  valor: ReactNode; etiqueta: string; vivo?: boolean; tono?: "bien" | "alerta" | "mal"; pie?: ReactNode; className?: string;
}) {
  return (
    <div className={cn("vidrio p-4 min-w-0", className)}>
      <div className="text-[11.5px] font-medium text-muted-foreground">{etiqueta}</div>
      <div className={cn(
        "mt-1 flex items-center gap-2 text-2xl font-semibold tabular-nums leading-tight",
        tono === "alerta" && "text-warning",
        tono === "mal" && "text-destructive",
      )}>
        {vivo && <span className="h-2 w-2 rounded-full bg-success shadow-[0_0_10px] shadow-success/70" aria-hidden />}
        {valor}
      </div>
      {pie && <div className="mt-1.5 text-xs text-muted-foreground">{pie}</div>}
    </div>
  );
}

/** Barra de uso (personas del plan): verde → ámbar al 85 % → rojo lleno. */
export function BarraDeUso({ usadas, total, className }: { usadas: number; total: number; className?: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((usadas / total) * 100)) : 0;
  const color = usadas >= total ? "bg-destructive" : pct >= 85 ? "bg-warning" : "bg-success";
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)} role="progressbar" aria-valuenow={usadas} aria-valuemin={0} aria-valuemax={total}>
      <div className={cn("h-full rounded-full transition-[width]", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Chip({ children, tono = "neutro", punto, className }: {
  children: ReactNode; tono?: "neutro" | "bien" | "alerta" | "mal" | "acento"; punto?: boolean; className?: string;
}) {
  const tonos = {
    neutro: "border-border/70 text-muted-foreground bg-background/50",
    bien: "border-success/30 text-success bg-success/10",
    alerta: "border-warning/35 text-warning bg-warning/10",
    mal: "border-destructive/35 text-destructive bg-destructive/10",
    acento: "border-primary/40 text-primary bg-background/50",
  } as const;
  const puntos = { neutro: "bg-muted-foreground/60", bien: "bg-success", alerta: "bg-warning", mal: "bg-destructive", acento: "bg-primary" } as const;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[11px] font-semibold backdrop-blur-md", tonos[tono], className)}>
      {punto && <span className={cn("h-1.5 w-1.5 rounded-full", puntos[tono])} aria-hidden />}
      {children}
    </span>
  );
}

const tonoDe = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

/** Avatar de UNA letra (decisión de diseño de Maven). */
export function Inicial({ nombre, className }: { nombre: string; className?: string }) {
  return (
    <span
      className={cn("avatar-iniciales inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold", className)}
      style={{ ["--av-h" as string]: tonoDe(nombre) }}
      aria-hidden
    >
      {(nombre.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

export function Cargando({ className }: { className?: string }) {
  return <div className={cn("flex justify-center p-10", className)}><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
}

/** El texto de un error de la plataforma (clave estable → t()). */
export function useTextoDeError() {
  const { t } = useLanguage();
  return (e: unknown) => {
    const clave = claveDeError(e);
    return clave ? t(`plataforma.error.${clave}` as TranslationKey) : t("plataforma.error.generico");
  };
}

/** Un fallo NO es «vacío» (CLAUDE.md): se dice y se ofrece reintentar. */
export function ErrorConReintento({ error, onReintentar }: { error: unknown; onReintentar: () => void }) {
  const { t } = useLanguage();
  const texto = useTextoDeError();
  return (
    <div className="vidrio flex flex-col items-start gap-3 p-6 text-sm" role="alert">
      <div className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4 text-warning" />{t("plataforma.cargaFallo")}</div>
      <p className="text-muted-foreground">{texto(error)}</p>
      <Button variant="outline" size="sm" onClick={onReintentar}><RotateCw className="mr-1.5 h-3.5 w-3.5" />{t("plataforma.reintentar")}</Button>
    </div>
  );
}

/** Logo del cliente sobre SU color de marca (como la OrgCard de Lumina). */
export function LogoDeCliente({ nombre, logo, color, alto = "h-[132px]", className }: {
  nombre: string; logo?: string | null; color?: string; alto?: string; className?: string;
}) {
  const c = color || "#475569";
  return (
    <div
      className={cn("relative flex items-center justify-center overflow-hidden", alto, className)}
      style={{ background: `radial-gradient(90% 120% at 50% -20%, ${c}cc, transparent 72%), linear-gradient(180deg, ${c}55, ${c}10)` }}
    >
      {logo
        ? <img src={logo} alt={nombre} className="relative max-h-[54px] max-w-[70%] object-contain drop-shadow-[0_8px_22px_rgba(0,0,0,0.45)]" loading="lazy" />
        : <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-semibold text-white shadow-lg" style={{ background: `linear-gradient(135deg, ${c}, ${c}99)` }}>{(nombre.trim()[0] ?? "?").toUpperCase()}</span>}
    </div>
  );
}

export const fechaCorta = (iso: string | null | undefined, idioma: string) =>
  iso ? new Date(iso).toLocaleDateString(idioma, { day: "numeric", month: "short", year: "numeric" }) : "—";

export function haceCuanto(iso: string | null, t: (k: TranslationKey, p?: Record<string, string | number>) => string): string {
  if (!iso) return t("plataforma.nunca");
  const seg = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seg < 120) return t("plataforma.ahora");
  if (seg < 3600) return t("plataforma.haceMin", { n: Math.round(seg / 60) });
  if (seg < 86400) return t("plataforma.haceH", { n: Math.round(seg / 3600) });
  return t("plataforma.haceD", { n: Math.round(seg / 86400) });
}
