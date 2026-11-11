// COSTOS Y CONEXIONES, SOLO EL DUEÑO (Alvaro, 11/11/2026). Reglas puras de la
// página /oficina/costos (tests en test/oficina/costos.test.ts). Los montos
// vienen de costos_servicios (facturas reales, «falta» cuando hace falta que
// el dueño inicie sesión); la foto de cada mes, de costos_mensuales.

export type Categoria = "ia" | "servidores" | "correos" | "otras";
export type Fuente = "factura" | "estimado" | "falta";

export interface ServicioCosto {
  id: string;
  dia_cobro?: number | null;
  nombre: string;
  categoria: Categoria;
  proveedor: string;
  es_maven: boolean;
  monto_usd: number | null;
  ciclo: "mensual" | "anual" | "uso";
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


// ── Cobros, proyección y la serie del año (Alvaro, 11/11: «cuánto voy gastando
// este mes, cuánto es el del año, cuánto me va a costar la proyección») ──────

export interface Cobro { servicio_id: string; fecha: string; monto_usd: number; fuente: "factura" | "estimado"; nota: string | null }

const diasDelMes = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
};
const mesDe = (fecha: string) => fecha.slice(0, 7);
/** "2026-11" + n meses → "2027-01". */
export function sumarMeses(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** Lo que vale el servicio en esa fecha (con el aumento anunciado, si ya rige). */
export function montoVigente(s: ServicioCosto, fecha: string): number | null {
  const prox = num(s.proximo_monto_usd);
  if (prox !== null && s.proximo_cobro && fecha >= s.proximo_cobro && s.ciclo !== "anual") return prox;
  return num(s.monto_usd);
}

/** Lo que el servicio cobra en un mes completo (YYYY-MM). Lo anual, solo en su mes. */
export function esperadoEnMes(s: ServicioCosto, mes: string): number {
  if (!s.activo || !s.es_maven) return 0;
  if (s.ciclo === "anual") {
    if (!s.proximo_cobro) return 0;
    const [a, m] = s.proximo_cobro.split("-").map(Number);
    const [ma, mm] = mes.split("-").map(Number);
    return mm === m && ma >= a ? num(s.monto_usd) ?? 0 : 0;
  }
  const dia = String(Math.min(s.dia_cobro ?? 1, 28)).padStart(2, "0");
  return montoVigente(s, `${mes}-${dia}`) ?? 0;
}

export interface Tramo { gastado: number; proyectado: number }

/** ¿La fecha cae a 3 días o menos del día de cobro? (sin día fijo, cualquiera sirve). */
function cercaDelDia(fecha: string, dia: number | null | undefined): boolean {
  if (dia == null) return true;
  return Math.abs(Number(fecha.slice(8, 10)) - dia) <= 3;
}

/** ¿Ya pasó (o es hoy)? Fechas YYYY-MM-DD. */
function yaPaso(fecha: string, hoy: string): boolean {
  return fecha.localeCompare(hoy) <= 0;
}

/** El mes en curso, por servicio: lo ya cobrado (hasta hoy) y cómo cierra.
 *  · Cobros con fecha futura del mes (ya anunciados) cuentan en la proyección.
 *  · Lo que se cobra por uso cierra al ritmo de lo que va del mes.
 *  · Lo fijo que todavía no tiene cobro este mes suma su monto. */
export function mesEnCurso(servicios: ServicioCosto[], cobros: Cobro[], hoy: string): Map<string, Tramo> {
  const mes = mesDe(hoy);
  const dia = Number(hoy.slice(8, 10));
  const fuera = new Set(servicios.filter((s) => !s.es_maven || !s.activo).map((s) => s.id));
  const res = new Map<string, Tramo>();
  const tramo = (id: string) => { let t = res.get(id); if (!t) { t = { gastado: 0, proyectado: 0 }; res.set(id, t); } return t; };
  for (const c of cobros) {
    if (mesDe(c.fecha) !== mes || fuera.has(c.servicio_id)) continue;
    const t = tramo(c.servicio_id);
    const m = num(c.monto_usd) ?? 0;
    if (c.fecha <= hoy) t.gastado += m;
    t.proyectado += m;
  }
  // ¿Ya está el cobro FIJO de este mes? (cerca de su día de cobro). Un cobro
  // suelto (uso extra de Claude a principio de mes) no reemplaza al fijo.
  const tieneFijo = (s: ServicioCosto) => cobros.some((c) => c.servicio_id === s.id && mesDe(c.fecha) === mes && cercaDelDia(c.fecha, s.dia_cobro));
  for (const s of servicios) {
    if (!s.activo || !s.es_maven) continue;
    if (s.ciclo === "uso") {
      const usado = res.get(s.id)?.gastado ?? 0;
      const cierre = usado > 0 ? (usado / Math.max(dia, 1)) * diasDelMes(mes) : montoVigente(s, hoy) ?? 0;
      const tt = tramo(s.id);
      tt.proyectado = Math.max(tt.proyectado, cierre);
    } else if (!tieneFijo(s)) {
      const e = esperadoEnMes(s, mes);
      if (e > 0) tramo(s.id).proyectado += e;
    }
  }
  for (const t of res.values()) { t.gastado = dos(t.gastado); t.proyectado = dos(t.proyectado); }
  return res;
}

export interface Tablero {
  mes: string;
  gastadoMes: number;
  cierreMes: number;
  gastadoAno: number;
  cierreAno: number;
  proximos12: number;
  promedioProximo: number;
  /** Lo que vale cada servicio al mes desde el mes que viene (para «en qué se va»). */
  porServicio: { servicio: ServicioCosto; mes: Tramo; alMes: number; ano: number }[];
}

export function tablero(servicios: ServicioCosto[], cobros: Cobro[], hoy: string): Tablero {
  const mes = mesDe(hoy);
  const ano = hoy.slice(0, 4);
  const maven = servicios.filter((s) => s.activo && s.es_maven);
  const ids = new Set(maven.map((s) => s.id));
  const enCurso = mesEnCurso(servicios, cobros, hoy);
  let gastadoMes = 0, cierreMes = 0;
  for (const t of enCurso.values()) { gastadoMes += t.gastado; cierreMes += t.proyectado; }
  let gastadoAno = 0, antesDelMes = 0;
  for (const c of cobros) {
    if (!ids.has(c.servicio_id) || !c.fecha.startsWith(ano)) continue;
    const m = num(c.monto_usd) ?? 0;
    if (c.fecha <= hoy) gastadoAno += m;
    if (mesDe(c.fecha) < mes) antesDelMes += m;
  }
  let restoDelAno = 0;
  for (let k = 1; sumarMeses(mes, k).startsWith(ano); k++) {
    restoDelAno += maven.reduce((a, s) => a + esperadoEnMes(s, sumarMeses(mes, k)), 0);
  }
  let proximos12 = 0;
  for (let k = 1; k <= 12; k++) proximos12 += maven.reduce((a, s) => a + esperadoEnMes(s, sumarMeses(mes, k)), 0);
  const siguiente = sumarMeses(mes, 1);
  const porServicio = maven.map((s) => {
    const anoS = cobros.filter((c) => c.servicio_id === s.id && c.fecha.startsWith(ano) && yaPaso(c.fecha, hoy))
      .reduce((a, c) => a + (num(c.monto_usd) ?? 0), 0);
    const alMes = s.ciclo === "anual" ? (num(s.monto_usd) ?? 0) / 12 : montoVigente(s, `${siguiente}-28`) ?? 0;
    return { servicio: s, mes: enCurso.get(s.id) ?? { gastado: 0, proyectado: 0 }, alMes: dos(alMes), ano: dos(anoS) };
  }).sort((a, b) => b.alMes - a.alMes || b.mes.proyectado - a.mes.proyectado);
  return {
    mes,
    gastadoMes: dos(gastadoMes),
    cierreMes: dos(cierreMes),
    gastadoAno: dos(gastadoAno),
    cierreAno: dos(antesDelMes + cierreMes + restoDelAno),
    proximos12: dos(proximos12),
    promedioProximo: dos(proximos12 / 12),
    porServicio,
  };
}

export interface BarraMes { mes: string; real: Record<Categoria, number>; proyectado: Record<Categoria, number> }
const vacio = (): Record<Categoria, number> => ({ ia: 0, servidores: 0, correos: 0, otras: 0 });

/** Los 12 meses del año, por categoría: lo real (cobrado) y lo proyectado. */
export function serieDelAno(servicios: ServicioCosto[], cobros: Cobro[], hoy: string): BarraMes[] {
  const ano = hoy.slice(0, 4);
  const mesHoy = mesDe(hoy);
  const cat = new Map(servicios.filter((s) => s.es_maven && s.activo).map((s) => [s.id, s.categoria]));
  const enCurso = mesEnCurso(servicios, cobros, hoy);
  const serie: BarraMes[] = [];
  for (let m = 1; m <= 12; m++) {
    const mes = `${ano}-${String(m).padStart(2, "0")}`;
    const b: BarraMes = { mes, real: vacio(), proyectado: vacio() };
    if (mes < mesHoy) {
      for (const c of cobros) {
        const k = cat.get(c.servicio_id);
        if (k && mesDe(c.fecha) === mes) b.real[k] += num(c.monto_usd) ?? 0;
      }
    } else if (mes === mesHoy) {
      for (const [id, t] of enCurso) {
        const k = cat.get(id);
        if (!k) continue;
        b.real[k] += t.gastado;
        b.proyectado[k] += Math.max(0, t.proyectado - t.gastado);
      }
    } else {
      for (const s of servicios) {
        if (!s.es_maven || !s.activo) continue;
        b.proyectado[s.categoria] += esperadoEnMes(s, mes);
      }
    }
    for (const k of CATEGORIAS) { b.real[k] = dos(b.real[k]); b.proyectado[k] = dos(b.proyectado[k]); }
    serie.push(b);
  }
  return serie;
}

// ── El desglose de un mes (al tocar una barra de la gráfica) ───────────────

export interface LineaMes { servicio: ServicioCosto; real: number; proyectado: number; cobros: Cobro[] }

function sumaDe(cs: Cobro[]): number {
  return dos(cs.reduce((a, c) => a + (num(c.monto_usd) ?? 0), 0));
}

/** Qué se cobró (o se va a cobrar) en un mes, servicio por servicio. */
export function desgloseDelMes(servicios: ServicioCosto[], cobros: Cobro[], hoy: string, mes: string): LineaMes[] {
  const mesHoy = mesDe(hoy);
  const enCurso = mes === mesHoy ? mesEnCurso(servicios, cobros, hoy) : null;
  const pasado = mes.localeCompare(mesHoy) < 0;
  const lineas: LineaMes[] = [];
  for (const s of servicios) {
    if (!s.activo || !s.es_maven) continue;
    const cs = cobros.filter((c) => c.servicio_id === s.id && mesDe(c.fecha) === mes);
    let real = 0;
    let proyectado = 0;
    if (pasado) {
      real = sumaDe(cs);
    } else if (enCurso) {
      const t = enCurso.get(s.id);
      real = t?.gastado ?? 0;
      proyectado = dos(Math.max(0, (t?.proyectado ?? 0) - real));
    } else {
      proyectado = dos(esperadoEnMes(s, mes));
    }
    if (real > 0 || proyectado > 0) lineas.push({ servicio: s, real, proyectado, cobros: cs });
  }
  return lineas.sort((a, b) => b.real + b.proyectado - (a.real + a.proyectado));
}
