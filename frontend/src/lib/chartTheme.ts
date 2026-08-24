// ─── Mini-sistema de charts de Maven (ola 2 UX — auditoría dataviz #14/#15) ───
//
// Fuente única de estilo para los charts de Recharts. Tres piezas:
//
//   1. CHART_SERIES / CHART_COLOR — colores de serie leídos de los tokens
//      --chart-1..6 (index.css), calibrados POR MODO (los pasos dark difieren
//      de los light) y validados con simulación de daltonismo (protan/deutan
//      ΔE ≥ 15 entre vecinos) y contraste ≥ 3:1 sobre la superficie de card.
//      El ORDEN ES FIJO: se asigna en secuencia y nunca se cicla ni se saltea.
//      Un chart de UNA sola serie usa CHART_SERIES[0] (el azul de marca).
//   2. CHART_GRID — props canónicos de <CartesianGrid>. El color va como
//      ATRIBUTO stroke: una clase Tailwind (`className="stroke-border"`)
//      aplica al <g> contenedor y NO pisa el presentation attribute
//      stroke="#ccc" de cada línea hija (auditoría #16).
//   3. CHART_AXIS — props canónicos de ejes: ticks con fill tokenizado
//      (legibles en ambos temas) y sin ejes duros (axisLine/tickLine).
//
// Uso típico:
//   <CartesianGrid {...CHART_GRID} />
//   <XAxis dataKey="day" {...CHART_AXIS} />
//   <Line stroke={CHART_COLOR.azul} … />
//   <Tooltip content={<MavenTooltip />} />   ← components/charts/MavenTooltip

export const CHART_SERIES = [
  "hsl(var(--chart-1))", // azul (primary)
  "hsl(var(--chart-2))", // verde (familia success)
  "hsl(var(--chart-3))", // cyan
  "hsl(var(--chart-4))", // ámbar (familia warning)
  "hsl(var(--chart-5))", // violeta (familia accent)
  "hsl(var(--chart-6))", // pink (#e8467c)
] as const;

/** Alias semánticos: el mismo dato viste el mismo color en toda la app. */
export const CHART_COLOR = {
  azul: CHART_SERIES[0],
  verde: CHART_SERIES[1],
  cyan: CHART_SERIES[2],
  ambar: CHART_SERIES[3],
  violeta: CHART_SERIES[4],
  pink: CHART_SERIES[5],
} as const;

/** Rejilla tenue del sistema: solo líneas horizontales, punteado sutil. */
export const CHART_GRID = {
  stroke: "hsl(var(--border) / 0.5)",
  strokeDasharray: "3 3",
  vertical: false,
} as const;

/** Ejes del sistema: ticks tokenizados, sin línea de eje ni tick marks. */
export const CHART_AXIS = {
  tick: { fill: "hsl(var(--muted-foreground))", fontSize: 11 },
  axisLine: false,
  tickLine: false,
} as const;
