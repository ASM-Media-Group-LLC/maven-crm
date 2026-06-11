// Barra segmentada de CALIDAD de promo (Fase 1).
//
// Cada red ocupa un ancho proporcional a su PESO (IG 60%, X/TG/FB ~13,3% c/u) y se
// rellena según la CALIDAD de su promo (0-100%). Así el área coloreada de cada banda
// = peso×calidad = lo que aporta al score, y la "llenura" total de la barra = el score.
//
// La identidad de cada red se ve en la columna "Red Social" contigua (en la tabla) y
// en el tooltip; acá usamos color de marca por banda para no recargar.

import { cn } from "@/lib/utils";
import type { NetworkScore } from "./promoScore";

const NET_COLOR: Record<string, string> = {
  instagram: "#E1306C", // rosa IG
  x: "#8b98a5", // gris-azulado (X es B/N → visible en dark)
  telegram: "#229ED9", // azul Telegram
  facebook: "#1877F2", // azul Facebook
};

const NET_LABEL: Record<string, string> = {
  instagram: "Instagram",
  x: "X / Twitter",
  telegram: "Telegram",
  facebook: "Facebook",
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

interface Props {
  networks: NetworkScore[];
  score: number;
  variant?: "full" | "thin";
  className?: string;
}

export default function PromoQualityBar({ networks, score, variant = "full", className }: Props) {
  const thin = variant === "thin";
  const totalWeight = networks.reduce((s, n) => s + n.weight, 0) || 1;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className={cn(
          "flex flex-1 overflow-hidden rounded-full bg-muted/40 ring-1 ring-border/50",
          thin ? "h-1.5" : "h-2.5",
        )}
        style={{ minWidth: thin ? 32 : 84 }}
        title={thin ? `Calidad de promo: ${pct(score)}` : undefined}
      >
        {networks.map((n) => {
          const color = NET_COLOR[n.network] || "#888";
          const tip = !n.scanned
            ? `${NET_LABEL[n.network]} · sin escanear`
            : n.promoted
            ? `${NET_LABEL[n.network]} · calidad ${pct(n.quality)} → aporta ${pct(n.contribution)}`
            : `${NET_LABEL[n.network]} · revisada, sin promo`;
          return (
            <div
              key={n.network}
              className="relative h-full border-r border-background/60 last:border-r-0"
              style={{ flexBasis: `${(n.weight / totalWeight) * 100}%` }}
              title={tip}
            >
              {n.promoted && n.quality > 0 && (
                <div
                  className="absolute inset-y-0 left-0"
                  style={{ width: pct(n.quality), backgroundColor: color }}
                />
              )}
            </div>
          );
        })}
      </div>
      {!thin && (
        <span className="w-9 shrink-0 text-right text-xs font-semibold tabular-nums">{pct(score)}</span>
      )}
    </div>
  );
}
