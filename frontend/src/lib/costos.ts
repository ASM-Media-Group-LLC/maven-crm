// COSTOS Y CONEXIONES, SOLO EL DUEÑO (Alvaro, 11/11/2026). Reglas puras de la
// página /oficina/costos (tests en test/oficina/costos.test.ts). Los montos
// vienen de costos_servicios (facturas reales, «falta» cuando hace falta que
// el dueño inicie sesión); la foto de cada mes, de costos_mensuales.

export type Categoria = "ia" | "servidores" | "correos" | "otras";
export type Fuente = "factura" | "estimado" | "falta";

export interface ServicioCosto {
  id: string;
  nombre: string;
  categoria: Categoria;
  proveedor: string;
  es_maven: boolean;
  monto_usd: number | null;
  ciclo: "mensual" | "anual";
  fuente: Fuente;
  detalle: string | null;
  proximo_cobro: string | null;
  proximo_monto_usd: number | null;
  proximo_detalle: string | null;
  ahorro_usd: number | null;
  ahorro_detalle: string | null;
  orden: number;
  activo: boolean;
  revisado_at: string;
}

export interface MesCosto { mes: string; servicio_id: string; monto_usd: number }

export const CATEGORIAS: readonly Categoria[] = ["ia", "servidores", "correos", "otras"];

const dos = (n: number) => Math.round(n * 100) / 100;
/** PostgREST manda numeric como texto: se pasa a número (null se queda null). */
export const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Lo que vale al mes (lo anual se reparte en 12). null = falta el dato. */
export function mensual(s: Pick<ServicioCosto, "monto_usd" | "ciclo">): number | null {
  const m = num(s.monto_usd);
  if (m === null) return null;
  return s.ciclo === "anual" ? dos(m / 12) : m;
}

/** "2026-11-11" → "2026-10-01" (el mes anterior, primer día). */
export function mesAnterior(hoy: string): string {
  const [a, m] = hoy.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 2, 1));
  return d.toISOString().slice(0, 10);
}

export interface Resumen {
  total: number;
  faltan: number;
  proximo: number;
  ahorro: number;
  fuera: number;
  mesPasado: number | null;
  cambioPct: number | null;
}

/** Los cuatro números de arriba. `total` es SOLO Maven (es_maven); lo que va en
 *  las mismas facturas pero no es Maven se cuenta aparte (`fuera`). */
export function resumenCostos(servicios: ServicioCosto[], meses: MesCosto[], hoy: string): Resumen {
  const activos = servicios.filter((s) => s.activo);
  const maven = activos.filter((s) => s.es_maven);
  let total = 0, proximo = 0, faltan = 0;
  for (const s of maven) {
    const m = mensual(s);
    if (m === null) { faltan++; continue; }
    total += m;
    proximo += num(s.proximo_monto_usd) ?? m;
  }
  const ahorro = activos.reduce((a, s) => a + (num(s.ahorro_usd) ?? 0), 0);
  const fuera = activos.filter((s) => !s.es_maven).reduce((a, s) => a + (mensual(s) ?? 0), 0);
  const ids = new Set(maven.map((s) => s.id));
  const antes = mesAnterior(hoy);
  const filas = meses.filter((m) => m.mes === antes && ids.has(m.servicio_id));
  const mesPasado = filas.length ? dos(filas.reduce((a, m) => a + (num(m.monto_usd) ?? 0), 0)) : null;
  const cambioPct = mesPasado && mesPasado > 0 ? Math.round((total / mesPasado - 1) * 100) : null;
  return { total: dos(total), faltan, proximo: dos(proximo), ahorro: dos(ahorro), fuera: dos(fuera), mesPasado, cambioPct };
}

export interface Proximo { fecha: string; servicio: ServicioCosto; monto: number | null; cambia: boolean }

/** Lo que viene en los próximos `dias` días: cobros y aumentos, por fecha. */
export function loQueViene(servicios: ServicioCosto[], hoy: string, dias = 90): Proximo[] {
  const tope = new Date(Date.parse(`${hoy}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);
  return servicios
    .filter((s) => s.activo && s.proximo_cobro && s.proximo_cobro >= hoy && s.proximo_cobro <= tope)
    .map((s) => ({
      fecha: s.proximo_cobro as string,
      servicio: s,
      monto: num(s.proximo_monto_usd) ?? num(s.monto_usd),
      cambia: num(s.proximo_monto_usd) !== null,
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Dónde ahorrar, de mayor a menor. */
export function dondeAhorrar(servicios: ServicioCosto[]): ServicioCosto[] {
  return servicios
    .filter((s) => s.activo && (num(s.ahorro_usd) ?? 0) > 0 && s.ahorro_detalle)
    .sort((a, b) => (num(b.ahorro_usd) ?? 0) - (num(a.ahorro_usd) ?? 0));
}

/** «USD 48», «USD 2,50», «USD 1.234». */
export function usd(n: number): string {
  const entero = Number.isInteger(n);
  return `USD ${n.toLocaleString("es-CO", { minimumFractionDigits: entero ? 0 : 2, maximumFractionDigits: 2 })}`;
}

// ── Conexiones ─────────────────────────────────────────────────────────────

export type Semaforo = "ok" | "atencion" | "mal" | "apagado";

export interface ChequeoVivo { id: string; estado: "ok" | "mal" | "sin_configurar"; ms: number | null; detalle: string }

export const semaforoDeChequeo = (c: Pick<ChequeoVivo, "estado">): Semaforo =>
  c.estado === "ok" ? "ok" : c.estado === "mal" ? "mal" : "apagado";

/** El peor de varios semáforos (para el resumen de arriba). */
export function peor(estados: Semaforo[]): Semaforo {
  if (estados.includes("mal")) return "mal";
  if (estados.includes("atencion")) return "atencion";
  return "ok";
}

/** ¿Pasó más de `horas` desde `iso`? (null = nunca → sí pasó). */
export function hacePasMasDe(iso: string | null | undefined, horas: number, ahora: number): boolean {
  if (!iso) return true;
  return ahora - Date.parse(iso) > horas * 3_600_000;
}
