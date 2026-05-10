// Formatos compactos para números en UI — usados en KPI cards, badges, etc.
// Ejemplos:
//   42     → "42"
//   6219   → "6.22k"
//   123456 → "123.46k"
//   2300000 → "2.30M"
//
// Para <1000 devolvemos el número tal cual (la lectura exacta es deseable).
// Para >=1000 usamos sufijo "k" (miles) / "M" (millones) con 2 decimales.
// 2 decimales = balance entre precisión visual y compacidad: "6.22k" se lee
// rápido sin perder señal del orden real (6.2k sería demasiada imprecisión
// para volúmenes en el rango 1-10k que es lo más común en estos cards).
export function formatCompact(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "0";
  const abs = Math.abs(n);
  if (abs < 1000) return String(n);
  if (abs < 1_000_000) return `${(n / 1000).toFixed(2)}k`;
  if (abs < 1_000_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  return `${(n / 1_000_000_000).toFixed(2)}B`;
}
