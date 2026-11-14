import type { TranslationKey } from "@/lib/i18n";

// EL SALDO DE GEMINI, EN VIVO (Alvaro, 14/11/2026: «tienes que estar muy pilas de
// cuánto queda… conectadísimo»). Gemini es prepago: al llegar a 0 Google corta la
// llave y Argos deja de juzgar. Google no da el saldo por API, así que la base lo
// lleva sola (ia_saldo_estado(), migración 20261114080000):
//   saldo ≈ último saldo anotado − fotos juzgadas desde entonces × precio por foto
// y si Google responde «prepayment credits are depleted», el estado es sin_saldo
// al momento. Aquí solo se decide cómo se dice cada estado.

export type EstadoSaldo = "bien" | "pocos_dias" | "se_acaba_hoy" | "anotar" | "sin_saldo" | "sin_dato";

export interface SaldoGemini {
  estado: EstadoSaldo;
  saldo_usd: number | null;
  punto: { id: number; saldo_usd: number; medido_at: string; origen: "recarga" | "lectura" } | null;
  juzgadas_desde: number;
  gastado_usd: number;
  precio_foto_usd: number;
  ritmo_dia_usd: number;
  dias_restantes: number | null;
  se_acaba_at: string | null;
  ultimo_ok: string | null;
  sin_saldo_at: string | null;
  argos_activo: boolean;
  calculado_at: string;
}

const ESTADOS: readonly EstadoSaldo[] = ["bien", "pocos_dias", "se_acaba_hoy", "anotar", "sin_saldo", "sin_dato"];

/** La respuesta de la base es un saldo de verdad (si no, la página dice que falló: nunca ceros). */
export function esSaldoGemini(x: unknown): x is SaldoGemini {
  const s = x as Partial<SaldoGemini> | null;
  return !!s && typeof s === "object" && ESTADOS.includes(s.estado as EstadoSaldo) && typeof s.calculado_at === "string";
}

/** Cómo se dice cada estado: el texto de la pastilla y su color (puntito; sin fondos de color). */
export function nivelDelSaldo(s: SaldoGemini): { clave: TranslationKey; color: string; urgente: boolean } {
  switch (s.estado) {
    case "sin_saldo": return { clave: "oficina.costos.saldo.estado.sinSaldo", color: "hsl(var(--destructive))", urgente: true };
    case "se_acaba_hoy": return { clave: "oficina.costos.saldo.estado.hoy", color: "hsl(var(--destructive))", urgente: true };
    case "pocos_dias": return { clave: "oficina.costos.saldo.estado.pocos", color: "hsl(var(--warning))", urgente: true };
    case "anotar": return { clave: "oficina.costos.saldo.estado.anotar", color: "hsl(var(--warning))", urgente: false };
    case "sin_dato": return { clave: "oficina.costos.saldo.estado.sinDato", color: "hsl(var(--muted-foreground))", urgente: false };
    default: return { clave: "oficina.costos.saldo.estado.bien", color: "hsl(var(--success))", urgente: false };
  }
}

/** Lo que queda contra el último saldo anotado (0–100), para la barra. */
export function porcentajeQueQueda(s: SaldoGemini): number {
  if (s.estado === "sin_saldo") return 0;
  const base = s.punto?.saldo_usd ?? 0;
  if (base <= 0 || s.saldo_usd === null) return 0;
  return Math.max(0, Math.min(100, (s.saldo_usd / base) * 100));
}

/** «3,8» días (una cifra decimal, con coma en español). */
export function diasConUnDecimal(d: number, idioma: string): string {
  return d.toLocaleString(idioma === "en" ? "en-US" : "es-CO", { maximumFractionDigits: 1, minimumFractionDigits: d < 10 ? 1 : 0 });
}

/** Lo que se escribe en la casilla («19,87», «19.87», «$ 20») como número; null si no es un saldo. */
export function leerSaldo(texto: string): number | null {
  const limpio = texto.replace(/[^\d,.-]/g, "").replace(",", ".");
  if (!limpio || !/^-?\d+(\.\d{1,2})?$/.test(limpio)) return null;
  const n = Number(limpio);
  return Number.isFinite(n) && n > -1000 && n < 100000 ? n : null;
}
