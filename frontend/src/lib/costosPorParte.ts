// COSTOS POR PARTE DE MAVEN, PIEZA POR PIEZA (Alvaro, 13/11/2026). Reglas
// puras de la pestaña «Por parte de Maven» de /oficina/costos (tests en
// test/oficina/costosPorParte.test.ts).
//
// «Cuánto cuesta cada parte de Maven, pieza por pieza, con el uso real de cada
// día.» Cada pieza trae su cuenta (uso × precio) y tres números:
//   · hoy      lo de hoy (un servicio fijo: su mes ÷ los días del mes)
//   · mes      lo que va del mes (fijo: prorrateado a los días que van)
//   · cierre   cómo cierra el mes: lo que se cobra por uso, al ritmo de hoy
//              (lo del mes ÷ días que van × días del mes); lo fijo, su mes.
// Lo compartido (servidor de Supabase de Maven, servidor principal, dominio) va
// junto en «Base de Maven», sin repartir. Lo que no es Maven va aparte y no
// suma. Un dato que falta es null (se dice «falta dato»), nunca 0.
//
// El uso sale de la RPC costos_uso_del_mes() (fotos, fotos juzgadas por la IA,
// videos y GB por bucket, día por día). Si esa consulta falla, `uso` es null:
// las piezas que dependen del uso quedan en null con `sinUso`, y la página dice
// que falló con Reintentar.

import { mensual, num, type Cobro, type ServicioCosto } from "@/lib/costos";

export type Parte = "argos" | "base" | "cowork" | "correo" | "messenger_drive" | "herramientas" | "otras";

/** Las partes de Maven, en el orden en que se muestran. «otras» va aparte. */
export const PARTES_DE_MAVEN: readonly Exclude<Parte, "otras">[] = ["argos", "base", "cowork", "correo", "messenger_drive", "herramientas"];
const TODAS: readonly Parte[] = [...PARTES_DE_MAVEN, "otras"];

/** Por si la columna `parte` todavía no está (antes de aplicar la migración del 13/11). */
const PARTE_POR_SERVICIO: Record<string, Parte> = {
  google_ia: "argos", elevenlabs: "argos",
  supabase_maven: "base", contabo_principal: "base", godaddy_maven: "base",
  contabo_llamadas: "cowork",
  resend: "correo", zoho: "correo",
  github: "herramientas", claude: "herramientas",
  supabase_otros: "otras",
};

/** El color de cada parte (barra apilada y puntitos). Paleta de la app, por variable. */
export const COLOR_PARTE: Record<Parte, string> = {
  argos: "hsl(var(--primary))",
  base: "hsl(var(--muted-foreground) / 0.75)",
  cowork: "hsl(var(--success))",
  correo: "hsl(var(--warning))",
  messenger_drive: "hsl(var(--chart-3))",
  herramientas: "hsl(var(--chart-6))",
  otras: "hsl(var(--muted-foreground) / 0.4)",
};

/** Lo que trae el plan Pro de Supabase en archivos y lo que cobra por GB de más al mes. */
export const ALMACEN_INCLUIDO_GB = 100;
export const PRECIO_GB_EXTRA_USD = 0.021;
export const BUCKET_FOTOS = "monitor-capturas";
export const BUCKET_VIDEOS = "argos-clips";
export const BUCKET_CHAT = "chat-files";
export const BUCKET_DRIVE = "creator-files";

export type ServicioConParte = ServicioCosto & {
  parte?: string | null;
  precio_unitario_usd?: number | string | null;
  unidad?: string | null;
};

export function parteDe(s: ServicioConParte): Parte {
  if (!s.es_maven) return "otras";
  if (s.parte && (TODAS as readonly string[]).includes(s.parte)) return s.parte as Parte;
  return PARTE_POR_SERVICIO[s.id] ?? "base";
}

export interface DiaDeUso { dia: string; pantalla: number; camara: number; juzgadas: number; al_nas: number; videos: number; video_seg: number }
export interface Cubeta { bucket: string; gb: number; archivos: number }
export interface UsoDelMes {
  desde: string;
  hoy: string;
  dias_del_mes: number;
  calculado_at: string;
  dias: DiaDeUso[];
  almacenamiento: Cubeta[];
}

/** Qué pieza es (decide el texto que se muestra). «servicio» = un renglón de costos_servicios. */
export type ClavePieza = "ia" | "fotos" | "videos" | "push" | "velocidad" | "ruido" | "mensajes" | "drive" | "servicio";

export interface Pieza {
  clave: ClavePieza;
  servicio?: ServicioConParte;
  hoy: number | null;
  mes: number | null;
  cierre: number | null;
  /** No cuesta (gratis o dentro de un plan que ya se paga). */
  gratis: boolean;
  /** Depende del uso y el uso no se pudo leer. */
  sinUso: boolean;
  /** Los números para la cuenta (fotos de hoy, GB, precio…). */
  datos: Record<string, number>;
  /** Facturas de este mes de ese servicio (hasta hoy): con qué se cuadra. null = ninguna. */
  facturado: number | null;
}

export interface ResumenParte {
  parte: Parte;
  piezas: Pieza[];
  hoy: number;
  mes: number;
  cierre: number;
  /** Piezas sin dato (no suman). */
  faltan: number;
  /** Piezas que dependen del uso y el uso no se pudo leer. */
  sinUso: number;
}

export interface DiaCosto { dia: string; fijo: number; uso: number; futuro: boolean }

export interface CostosPorParte {
  dia: number;
  diasDelMes: number;
  partes: ResumenParte[];
  otras: ResumenParte;
  total: { hoy: number; mes: number; cierre: number; faltan: number; sinUso: number };
  /** Cada día del mes: lo fijo del día y lo que se cobra por uso (lo que falta, al ritmo de hoy). */
  serie: DiaCosto[];
  /** Lo facturado el mes pasado (servicios de Maven). null = no hay facturas. */
  mesPasado: number | null;
  /** La última factura cargada del mes (YYYY-MM-DD). */
  cuadradoAl: string | null;
  /** Lo que vale cada servicio en este mes, para que «Por proveedor» diga lo mismo. */
  porServicio: Map<string, { hoy: number | null; mes: number | null; cierre: number | null }>;
  almacenTotalGb: number | null;
}

const dos = (n: number) => Math.round(n * 100) / 100;
const cuatro = (n: number) => Math.round(n * 10_000) / 10_000;

export function diasDelMes(fecha: string): number {
  const [a, m] = fecha.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

/** "2026-11-13" → "2026-10" */
function mesAnteriorDe(hoy: string): string {
  const [a, m] = hoy.split("-").map(Number);
  return new Date(Date.UTC(a, m - 2, 1)).toISOString().slice(0, 7);
}

/** Un costo del mes que no depende del uso: hoy = 1/días, en el mes = prorrateado, al cierre = el mes. */
function prorrateo(alMes: number, dia: number, dias: number) {
  return { hoy: cuatro(alMes / dias), mes: dos((alMes * dia) / dias), cierre: dos(alMes) };
}

/** Al ritmo de hoy: lo del mes ÷ días que van × días del mes. */
export function proyectar(delMes: number, dia: number, dias: number): number {
  return dos((delMes / Math.max(dia, 1)) * dias);
}

const vacia = (clave: ClavePieza, extra: Partial<Pieza> = {}): Pieza =>
  ({ clave, hoy: 0, mes: 0, cierre: 0, gratis: true, sinUso: false, datos: {}, facturado: null, ...extra });

export function calcularCostosPorParte(
  servicios: readonly ServicioConParte[],
  cobros: readonly Cobro[],
  uso: UsoDelMes | null,
  hoyFecha: string,
): CostosPorParte {
  const hoy = uso?.hoy ?? hoyFecha;
  const mesHoy = hoy.slice(0, 7);
  const dia = Number(hoy.slice(8, 10));
  const dias = uso?.dias_del_mes ?? diasDelMes(hoy);
  const activos = servicios.filter((s) => s.activo);

  // Facturas de este mes (hasta hoy), por servicio: con eso se cuadra cada pieza.
  const facturado = new Map<string, number>();
  let cuadradoAl: string | null = null;
  for (const c of cobros) {
    if (c.fuente !== "factura" || c.fecha.slice(0, 7) !== mesHoy || c.fecha > hoy) continue;
    facturado.set(c.servicio_id, dos((facturado.get(c.servicio_id) ?? 0) + (num(c.monto_usd) ?? 0)));
    if (!cuadradoAl || c.fecha > cuadradoAl) cuadradoAl = c.fecha;
  }

  // El uso, sumado.
  const diasUso = uso?.dias ?? [];
  const deHoy = diasUso.find((d) => d.dia === hoy);
  const suma = (k: keyof Omit<DiaDeUso, "dia">) => diasUso.reduce((a, d) => a + (num(d[k]) ?? 0), 0);
  const gbDe = (bucket: string) => num(uso?.almacenamiento.find((b) => b.bucket === bucket)?.gb) ?? 0;
  const almacenTotalGb = uso ? dos(uso.almacenamiento.reduce((a, b) => a + (num(b.gb) ?? 0), 0)) : null;
  const excesoGb = almacenTotalGb === null ? 0 : Math.max(0, almacenTotalGb - ALMACEN_INCLUIDO_GB);

  /** Un bucket: gratis dentro del plan; si Maven se pasa, su parte de lo que se paga de más. */
  const pedazoDeAlmacen = (clave: ClavePieza, bucket: string, datos: Record<string, number>): Pieza => {
    if (!uso) return vacia(clave, { hoy: null, mes: null, cierre: null, gratis: false, sinUso: true });
    const gb = gbDe(bucket);
    const base = { ...datos, gb: dos(gb), totalGb: almacenTotalGb ?? 0, incluidoGb: ALMACEN_INCLUIDO_GB, excesoGb: dos(excesoGb), precioGb: PRECIO_GB_EXTRA_USD };
    if (excesoGb <= 0 || !almacenTotalGb) return vacia(clave, { datos: base });
    const alMes = excesoGb * PRECIO_GB_EXTRA_USD * (gb / almacenTotalGb);
    return { clave, ...prorrateo(alMes, dia, dias), gratis: false, sinUso: false, datos: base, facturado: null };
  };

  const porServicio: CostosPorParte["porServicio"] = new Map();
  const deServicio = (s: ServicioConParte): Pieza => {
    const precio = num(s.precio_unitario_usd);
    const fact = facturado.get(s.id) ?? null;
    if (precio !== null && s.unidad === "foto_juzgada") {
      if (!uso) {
        const p = { clave: "ia" as const, servicio: s, hoy: null, mes: null, cierre: null, gratis: false, sinUso: true, datos: { precio }, facturado: fact };
        porServicio.set(s.id, p);
        return p;
      }
      const juzgadasHoy = num(deHoy?.juzgadas) ?? 0;
      const juzgadasMes = suma("juzgadas");
      const mes = dos(juzgadasMes * precio);
      const p: Pieza = {
        clave: "ia", servicio: s,
        hoy: dos(juzgadasHoy * precio), mes, cierre: proyectar(mes, dia, dias),
        gratis: false, sinUso: false,
        datos: { precio, juzgadasHoy, juzgadasMes },
        facturado: fact,
      };
      porServicio.set(s.id, p);
      return p;
    }
    const alMes = mensual(s);
    const p: Pieza = alMes === null
      ? { clave: "servicio", servicio: s, hoy: null, mes: null, cierre: null, gratis: false, sinUso: false, datos: {}, facturado: fact }
      : { clave: "servicio", servicio: s, ...prorrateo(alMes, dia, dias), gratis: alMes === 0, sinUso: false, datos: { alMes }, facturado: fact };
    porServicio.set(s.id, p);
    return p;
  };

  const serviciosDe = (parte: Parte) => activos.filter((s) => parteDe(s) === parte).sort((a, b) => a.orden - b.orden);

  const piezasDe = (parte: Parte): Pieza[] => {
    const propios = serviciosDe(parte).map(deServicio);
    const ia = propios.filter((p) => p.clave === "ia");
    const resto = propios.filter((p) => p.clave !== "ia");
    switch (parte) {
      case "argos": {
        const fotos = pedazoDeAlmacen("fotos", BUCKET_FOTOS, {
          fotosHoy: (num(deHoy?.pantalla) ?? 0) + (num(deHoy?.camara) ?? 0),
          fotosMes: suma("pantalla") + suma("camara"),
          alNasMes: suma("al_nas"),
        });
        const videos = pedazoDeAlmacen("videos", BUCKET_VIDEOS, {
          videosHoy: num(deHoy?.videos) ?? 0,
          videosMes: suma("videos"),
          minutosMes: Math.round(suma("video_seg") / 60),
        });
        return [...ia, fotos, videos, ...resto, vacia("push"), vacia("velocidad")];
      }
      case "cowork":
        return [...ia, ...resto, vacia("ruido")];
      case "messenger_drive":
        return [
          ...ia, ...resto,
          pedazoDeAlmacen("mensajes", BUCKET_CHAT, {}),
          pedazoDeAlmacen("drive", BUCKET_DRIVE, {}),
        ];
      default:
        return [...ia, ...resto];
    }
  };

  const resumir = (parte: Parte, piezas: Pieza[]): ResumenParte => {
    let h = 0, m = 0, c = 0, faltan = 0, sinUso = 0;
    for (const p of piezas) {
      if (p.sinUso) { sinUso++; continue; }
      if (p.cierre === null) { faltan++; continue; }
      h += p.hoy ?? 0; m += p.mes ?? 0; c += p.cierre;
    }
    return { parte, piezas, hoy: dos(h), mes: dos(m), cierre: dos(c), faltan, sinUso };
  };

  const partes = PARTES_DE_MAVEN.map((p) => resumir(p, piezasDe(p))).filter((r) => r.piezas.length > 0);
  // «Otras / no es Maven»: solo su mes (no hay uso de Maven que medir).
  const otras = resumir("otras", serviciosDe("otras").map(deServicio));

  const total = partes.reduce((a, p) => ({
    hoy: dos(a.hoy + p.hoy), mes: dos(a.mes + p.mes), cierre: dos(a.cierre + p.cierre),
    faltan: a.faltan + p.faltan, sinUso: a.sinUso + p.sinUso,
  }), { hoy: 0, mes: 0, cierre: 0, faltan: 0, sinUso: 0 });

  // Día por día: lo fijo del día (todo lo que no es por uso) + lo que se cobra por uso.
  const piezasMaven = partes.flatMap((p) => p.piezas);
  const fijoDelDia = piezasMaven
    .filter((p) => p.clave !== "ia" && p.cierre !== null && !p.sinUso)
    .reduce((a, p) => a + (p.cierre ?? 0) / dias, 0);
  const precios = piezasMaven.filter((p) => p.clave === "ia" && !p.sinUso).map((p) => p.datos.precio ?? 0);
  const precioFoto = precios.reduce((a, b) => a + b, 0);
  const usoDelMes = diasUso.reduce((a, d) => a + (num(d.juzgadas) ?? 0) * precioFoto, 0);
  const ritmo = usoDelMes / Math.max(dia, 1);
  const serie: DiaCosto[] = [];
  for (let d = 1; d <= dias; d++) {
    const fecha = `${mesHoy}-${String(d).padStart(2, "0")}`;
    const futuro = d > dia;
    const u = futuro ? ritmo : (num(diasUso.find((x) => x.dia === fecha)?.juzgadas) ?? 0) * precioFoto;
    serie.push({ dia: fecha, fijo: dos(fijoDelDia), uso: dos(u), futuro });
  }

  // El mes pasado, en facturas de servicios de Maven.
  const deMaven = new Set(activos.filter((s) => parteDe(s) !== "otras").map((s) => s.id));
  const antes = mesAnteriorDe(hoy);
  const delMesPasado = cobros.filter((c) => c.fecha.slice(0, 7) === antes && deMaven.has(c.servicio_id));
  const mesPasado = delMesPasado.length ? dos(delMesPasado.reduce((a, c) => a + (num(c.monto_usd) ?? 0), 0)) : null;

  return { dia, diasDelMes: dias, partes, otras, total, serie, mesPasado, cuadradoAl, porServicio, almacenTotalGb };
}

/** Lo que pesa cada parte en el cierre del mes (para la barra apilada), en %. Suma 100 entre las que tienen dato. */
export function pesoDePartes(partes: readonly ResumenParte[]): { parte: Parte; pct: number }[] {
  const total = partes.reduce((a, p) => a + p.cierre, 0);
  if (total <= 0) return [];
  return partes.filter((p) => p.cierre > 0).map((p) => ({ parte: p.parte, pct: (p.cierre / total) * 100 }));
}

/** Lo que se ahorra en una parte (ahorro_usd y ahorro_detalle de sus servicios). */
export function ahorrosDe(parte: ResumenParte): ServicioConParte[] {
  return parte.piezas
    .map((p) => p.servicio)
    .filter((s): s is ServicioConParte => !!s && (num(s.ahorro_usd) ?? 0) > 0 && !!s.ahorro_detalle);
}
