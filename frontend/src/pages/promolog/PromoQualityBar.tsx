// Barra de CALIDAD de promo del DÍA — vista de usuario.
//
// UNA sola barra continua llena hasta el score del día (0-100%), con el % al lado.
// v2 (2026-08-13): el score = calidad de la MEJOR promo válida del día, con la MISMA
// escala que el score de periodo del Dashboard (link 1.0 · funnel 0.85 · mención 0.6 ·
// difusa 0.3) — se retiró el Σ peso_red con IG 60% fijo, que capaba a las creadoras
// que no viven en IG. El desglose por red vive en el tooltip.

import { cn } from "@/lib/utils";
import type { NetworkScore } from "./promoScore";
import { useLanguage } from "@/hooks/useLanguage";

const NET_LABEL: Record<string, string> = {
  instagram: "Instagram",
  x: "X / Twitter",
  telegram: "Telegram",
  facebook: "Facebook",
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

// Color del relleno según nivel de calidad (lectura de un vistazo). Un solo color por
// barra → consistente dentro de cada fila (nada de segmentos de distinto color).
function fillColor(score: number): string {
  if (score >= 0.7) return "#10b981"; // emerald — alta
  if (score >= 0.4) return "#f59e0b"; // amber — media
  if (score > 0) return "#f43f5e"; // rose — baja
  return "transparent";
}

interface Props {
  networks: NetworkScore[];
  score: number;
  variant?: "full" | "thin";
  className?: string;
}

export default function PromoQualityBar({ networks, score, variant = "full", className }: Props) {
  const { t } = useLanguage();
  const thin = variant === "thin";

  // Tooltip = desglose por red (el detalle "interno" sigue disponible al pasar el mouse).
  const promoted = networks.filter((n) => n.promoted && n.quality > 0);
  const breakdown = promoted.length
    ? promoted.map((n) => `${NET_LABEL[n.network] ?? n.network} ${pct(n.quality)}`).join(" · ")
    : t("promolog.noPromoForScore");
  const tip = t("promolog.qualityTip", { pct: pct(score), breakdown });

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className={cn(
          "relative flex-1 overflow-hidden rounded-full bg-muted/40 ring-1 ring-border/50",
          thin ? "h-1.5" : "h-2.5",
        )}
        style={{ minWidth: thin ? 32 : 84 }}
        title={tip}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300"
          style={{ width: pct(score), backgroundColor: fillColor(score) }}
        />
      </div>
      {!thin && (
        <span className="w-9 shrink-0 text-right text-xs font-semibold tabular-nums">{pct(score)}</span>
      )}
    </div>
  );
}
