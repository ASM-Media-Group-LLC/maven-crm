// Lógica pura de drive-aporte-nas (Alvaro, 10/11/2026): a quién se avisa cuando
// llega contenido de una modelo por el link, y cuándo se avisa que el NAS se
// está llenando. Sin red ni base adentro: se prueba en aporte-y-espacio.test.ts.

/** La misma llave con la que la carpeta de la modelo casa con su grupo de
 *  chatters: «MEEL_SILVERA» ↔ «Meelsilvera», «SASSY ANDREA» ↔ «sassyandrea». */
export function llaveDeModelo(s: string | null | undefined): string {
  return String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** «1,4 GB», «320 MB», «850 KB» — para el texto del aviso. */
export function tamanoLegible(bytes: number): string {
  const b = Math.max(0, Number(bytes) || 0);
  const fmt = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: n < 10 ? 1 : 0 });
  if (b >= 1e12) return `${fmt(b / 1e12)} TB`;
  if (b >= 1e9) return `${fmt(b / 1e9)} GB`;
  if (b >= 1e6) return `${fmt(b / 1e6)} MB`;
  return `${fmt(Math.max(1, b / 1e3))} KB`;
}

export interface ArchivoQueLlego { token: string; carpeta: string | null; quien: string | null; size: number }
export interface Tanda { token: string; carpeta: string | null; quienes: string[]; archivos: number; bytes: number }

/** Una tanda por link: si la modelo sube 480 fotos, es UN aviso, no 480. */
export function agruparPorLink(llegaron: ArchivoQueLlego[]): Tanda[] {
  const m = new Map<string, Tanda>();
  for (const a of llegaron) {
    const t = m.get(a.token) ?? { token: a.token, carpeta: a.carpeta, quienes: [], archivos: 0, bytes: 0 };
    const q = (a.quien ?? "").trim();
    if (q && !t.quienes.includes(q)) t.quienes.push(q);
    t.archivos += 1;
    t.bytes += Math.max(0, Number(a.size) || 0);
    m.set(a.token, t);
  }
  return [...m.values()];
}

/** El texto del aviso. Quien mandó el link lo abre (tiene la carpeta); al
 *  chatter le llega solo como información (decisión de Alvaro: sin acceso a la
 *  carpeta), con el nombre de quien la tiene para que se la pida. */
export function textoDelAviso(t: Tanda, carpetaNombre: string, dueno: string | null, paraChatter: boolean) {
  const quien = t.quienes.length ? t.quienes.join(", ") : carpetaNombre;
  const n = t.archivos;
  const base = `${quien} subió ${n} archivo${n === 1 ? "" : "s"} (${tamanoLegible(t.bytes)}) a «${carpetaNombre}».`;
  return {
    title: `Llegó contenido de ${carpetaNombre}`,
    message: paraChatter && dueno ? `${base} Lo tiene ${dueno} en el Drive.` : base,
  };
}

// ── Espacio del NAS ──────────────────────────────────────────────────────────

export interface RaizDelNas { ok: boolean; libre?: number; total?: number }

/** Suma los discos que respondieron. null si ninguno dio números. */
export function resumenDelDisco(raices: RaizDelNas[] | null | undefined) {
  const buenas = (raices ?? []).filter((r) => r.ok && Number(r.total) > 0 && Number(r.libre) >= 0);
  if (!buenas.length) return null;
  const total = buenas.reduce((s, r) => s + Number(r.total), 0);
  const libre = buenas.reduce((s, r) => s + Number(r.libre), 0);
  return { total, libre, pct: ((total - libre) / total) * 100, discos: buenas.map((r) => ({ total: Number(r.total), libre: Number(r.libre) })) };
}

/** Una muestra por hora alcanza para el ritmo (el cron corre cada 2 min). */
export function tocaMuestra(ultimaISO: string | null | undefined, ahoraMs: number): boolean {
  if (!ultimaISO) return true;
  const t = Date.parse(ultimaISO);
  return !Number.isFinite(t) || ahoraMs - t >= 55 * 60_000;
}

export const NIVELES_DE_ALERTA = [80, 90] as const;
/** Por debajo de esto el aviso se rearma (se liberó espacio o se cambió disco). */
export const REARME_PCT = 75;

/** Los niveles que se acaban de cruzar y todavía no se avisaron. */
export function nivelesPorAvisar(pct: number, yaAvisados: number[]): number[] {
  return NIVELES_DE_ALERTA.filter((n) => pct >= n && !yaAvisados.includes(n));
}

// ── Videos grandes (Alvaro, 16/11/2026: hasta 50 GB por archivo) ─────────────

/** Tamaño de cada parte que viaja de Supabase al NAS. */
export const TAMANO_PARTE = 32 * 1024 * 1024;

/** Partes que le faltan a un aporte para estar entero en el NAS. */
export function partesQueFaltan(size: number, hechas: number | null | undefined): number {
  if (!Number.isFinite(size) || size <= 0) return 1;
  if (size <= TAMANO_PARTE) return 1;
  return Math.max(0, Math.ceil(size / TAMANO_PARTE) - Math.max(0, hechas ?? 0));
}

/** Lo que está por terminar va primero: una foto no espera horas detrás de un
 *  video de 50 GB que se lleva todas las partes de cada ronda. Empate: el más
 *  viejo primero (el orden en que llegaron). */
export function ordenarPorLoQueFalta<T extends { size: number | null; nas_parte: number | null }>(aportes: T[]): T[] {
  return aportes
    .map((a, i) => ({ a, i, falta: partesQueFaltan(Number(a.size ?? 0), a.nas_parte) }))
    .sort((x, y) => x.falta - y.falta || x.i - y.i)
    .map((x) => x.a);
}

/** Al juntar las partes el NAS lee y escribe el video entero; uno de 20 GB
 *  tarda minutos, más de lo que el edge espera la respuesta. El NAS lo termina
 *  igual, así que mientras tanto no se le vuelve a pedir (dos juntadas del
 *  mismo video gastan el doble de disco y se pisan). Se cuenta lento a
 *  propósito (30 MB/s) y nunca menos de 10 minutos. */
export const JUNTAR_MB_POR_SEG = 30;
export const JUNTAR_MINIMO_MS = 10 * 60_000;
export function esperaDeJuntar(size: number): number {
  const seg = Math.ceil(Math.max(0, size) / (JUNTAR_MB_POR_SEG * 1024 * 1024));
  return Math.max(JUNTAR_MINIMO_MS, seg * 1000);
}
export function tocaPedirJuntar(juntandoISO: string | null | undefined, size: number, ahoraMs: number): boolean {
  if (!juntandoISO) return true;
  const t = Date.parse(juntandoISO);
  return !Number.isFinite(t) || ahoraMs - t >= esperaDeJuntar(size);
}
