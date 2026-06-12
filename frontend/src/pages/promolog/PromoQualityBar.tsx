// Barra de CALIDAD de promo (Fase 1) — vista de usuario.
//
// A nivel usuario es UNA sola barra continua llena hasta el score del día (0-100%),
// con el % al lado. El score sale del modelo interno (Σ peso_red × calidad, IG 60% +
// X/TG/FB ~13,3% c/u) — ese desglose por red es INTERNO: vive en el tooltip y en el
// popup de detalle, NO en la barra (antes se dibujaba un segmento por red y se veía
// fragmentada/inconsistente, con bloques "flotando" cuando una red promocionaba y otra no).

import { cn } from "@/lib/utils";
import type { NetworkScore } from "./promoScore";

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
  const thin = variant === "thin";

  // Tooltip = desglose por red (el detalle "interno" sigue disponible al pasar el mouse).
  const promoted = networks.filter((n) => n.promoted && n.quality > 0);
  const breakdown = promoted.length
    ? promoted.map((n) => `${NET_LABEL[n.network] ?? n.network} ${pct(n.quality)}`).join(" · ")
    : "sin promo que sume al score";
  const tip = `Calidad de promo: ${pct(score)} — ${breakdown}`;

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
