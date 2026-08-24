// ─── Sparkline (mini-sistema de charts de Maven — ver lib/chartTheme.ts) ────
//
// Línea de tendencia en SVG puro para filas de tabla (ola 3 UX, #21): sin
// Recharts, sin ejes, sin tooltip pesado — solo la FORMA de la curva, que es
// lo que un badge ↑/=/↓ no puede contar (caída reciente vs mes flojo parejo).
//
//   - `stroke` viene en tokens hsl(var(--…)) (success/destructive/muted) para
//     heredar el tema, igual que CHART_SERIES del chartTheme.
//   - 30-40px de alto pensado para celdas; el relleno degradado es sutil y
//     apunta a transparente para no pelear con el fondo de la card.
//   - Accesible: role="img" + <title> (tooltip nativo liviano del navegador).
//
// Reutilizable en cualquier tabla con series numéricas (Dashboard2, HR,
// Closers…): recibe los valores YA ordenados cronológicamente.
import { useId } from "react";

interface SparklineProps {
  /** Serie en orden cronológico (viejo → nuevo). Con <2 puntos no renderiza. */
  values: number[];
  width?: number;
  height?: number;
  /** Color de línea en token, p. ej. TREND_COLOR.up de lib/chartTheme. */
  stroke: string;
  className?: string;
  /** Descripción accesible (y tooltip nativo). */
  title?: string;
}

export function Sparkline({
  values,
  width = 88,
  height = 32,
  stroke,
  className,
  title,
}: SparklineProps) {
  // useId ANTES del early-return: las reglas de hooks no admiten condicionales.
  const gradientId = useId();
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const pad = 2;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  // Serie plana → línea centrada (sin span el mapeo dividiría por 0).
  const norm = (v: number) => (span === 0 ? 0.5 : (v - min) / span);
  const points = values.map((v, i) => {
    const x = pad + (i * innerW) / (values.length - 1);
    const y = pad + (1 - norm(v)) * innerH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = points.join(" ");
  const area = `${pad},${height - pad} ${line} ${width - pad},${height - pad}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.22} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradientId})`} />
      <polyline
        points={line}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
