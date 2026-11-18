// LA HORA DE TODA LA EMPRESA: AM/PM O MILITAR (Alvaro, 18/11/2026: «en el
// admin, que el dueño tenga la opción: ¿quiere hora militar o PM AM? Yo quiero
// la PM»). Lo decide el dueño para todos (app_flags 'reloj_24h': prendido =
// 17:25, apagado = 5:25 PM). Por defecto AM/PM.
//
// Cómo llega a TODA la plataforma sin tocar cada pantalla: al arrancar,
// `instalarFormatoHora()` envuelve `toLocaleTimeString`, `toLocaleString` e
// `Intl.DateTimeFormat`: cuando se pide una hora, se usa el reloj de la empresa
// y «p. m.» sale como «PM». Las pantallas que arman la hora con date-fns usan
// `formatUI` (abajo), y las que tenían «2:41 pm» a mano usan a12().

import { format as formatDateFns } from "date-fns";

const CLAVE_LOCAL = "maven.reloj24h";

let reloj24 = (() => {
  try { return localStorage.getItem(CLAVE_LOCAL) === "1"; } catch { return false; }
})();
const oyentes = new Set<() => void>();

/** ¿La empresa usa hora militar (17:25)? Si no, AM/PM (5:25 PM). */
export function usaReloj24(): boolean {
  return reloj24;
}

/** Lo fija el valor de la empresa (al arrancar y cuando el dueño lo cambia). */
export function fijarReloj24(v: boolean): void {
  if (v === reloj24) return;
  reloj24 = v;
  try { localStorage.setItem(CLAVE_LOCAL, v ? "1" : "0"); } catch { /* sin storage */ }
  oyentes.forEach((o) => o());
}

export function alCambiarReloj(fn: () => void): () => void {
  oyentes.add(fn);
  return () => { oyentes.delete(fn); };
}

/** «5:25 p. m.» / «5:25 p.m.» / «5:25 pm» → «5:25 PM». */
export function arreglarAmPm(s: string): string {
  return s
    .replace(/(\d)[\s\u00a0\u202f]*([ap])\.?[\s\u00a0\u202f]*m\.?(?![a-zà-ú])/gi, (_m, d: string, ap: string) => `${d} ${ap.toUpperCase()}M`);
}

type OpcionesFecha = Intl.DateTimeFormatOptions | undefined;

/** Si se pide una hora, aplica el reloj de la empresa. */
function conReloj(o: OpcionesFecha, siempreHora = false): OpcionesFecha {
  const pideHora = siempreHora || (!!o && (o.hour !== undefined || o.timeStyle !== undefined));
  if (!pideHora) return o;
  // Quien pidió 24 h o 12 h a propósito (hour12 / hourCycle) se respeta: puede
  // estar armando un dato («14:05» para hacer cuentas), no algo que se ve.
  if (o && (o.hour12 !== undefined || o.hourCycle !== undefined)) return o;
  const nuevo: Intl.DateTimeFormatOptions = { ...(o ?? {}) };
  delete nuevo.hourCycle;
  nuevo.hour12 = !reloj24;
  return nuevo;
}

let instalado = false;

/** Se llama UNA vez al arrancar (main.tsx), antes del primer render. */
export function instalarFormatoHora(): void {
  if (instalado || typeof Date === "undefined") return;
  instalado = true;

  const tiempoOrig = Date.prototype.toLocaleTimeString;
  Date.prototype.toLocaleTimeString = function (this: Date, locales?: string | string[], o?: Intl.DateTimeFormatOptions) {
    const explicito = !!o && (o.hour12 !== undefined || o.hourCycle !== undefined);
    const s = tiempoOrig.call(this, locales, conReloj(o, true));
    return reloj24 || explicito ? s : arreglarAmPm(s);
  };

  const todoOrig = Date.prototype.toLocaleString;
  Date.prototype.toLocaleString = function (this: Date, locales?: string | string[], o?: Intl.DateTimeFormatOptions) {
    // Sin opciones, toLocaleString trae fecha y hora.
    const explicito = !!o && (o.hour12 !== undefined || o.hourCycle !== undefined);
    const s = todoOrig.call(this, locales, o ? conReloj(o) : conReloj(undefined, true));
    return reloj24 || explicito ? s : arreglarAmPm(s);
  };

  const Orig = Intl.DateTimeFormat;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Envuelto = function (this: unknown, locales?: string | string[], o?: Intl.DateTimeFormatOptions): any {
    const fmt = new Orig(locales, conReloj(o));
    if (reloj24 || !(o && (o.hour !== undefined || o.timeStyle !== undefined)) || o.hour12 !== undefined || o.hourCycle !== undefined) return fmt;
    const format = fmt.format.bind(fmt);
    const formatToParts = fmt.formatToParts.bind(fmt);
    return Object.assign(Object.create(Object.getPrototypeOf(fmt)), {
      format: (d?: Date | number) => arreglarAmPm(format(d)),
      formatToParts: (d?: Date | number) => formatToParts(d).map((p) => p.type === "dayPeriod" ? { ...p, value: /p/i.test(p.value) ? "PM" : "AM" } : p),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      formatRange: (fmt as any).formatRange?.bind(fmt),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      formatRangeToParts: (fmt as any).formatRangeToParts?.bind(fmt),
      resolvedOptions: fmt.resolvedOptions.bind(fmt),
    });
  } as unknown as typeof Intl.DateTimeFormat;
  Envuelto.supportedLocalesOf = Orig.supportedLocalesOf.bind(Orig);
  Object.defineProperty(Envuelto, "prototype", { value: Orig.prototype });
  (Intl as { DateTimeFormat: typeof Intl.DateTimeFormat }).DateTimeFormat = Envuelto;
}

/** date-fns `format` para lo que se MUESTRA: «HH:mm» sigue el reloj de la
 *  empresa («h:mm a» = 5:25 PM). Lo que va a un campo o a la base sigue con
 *  `format` de date-fns tal cual. */
export const formatUI: typeof formatDateFns = ((fecha: Date | number | string, patron: string, opciones?: Parameters<typeof formatDateFns>[2]) => {
  const p = reloj24 ? patron : patron.replace(/HH:mm(:ss)?/g, (_m, seg: string | undefined) => `h:mm${seg ?? ""} a`);
  const s = formatDateFns(fecha as Date, p, opciones);
  return reloj24 ? s : arreglarAmPm(s);
}) as typeof formatDateFns;

/** Hora corta para MOSTRAR, con el reloj de la empresa: «5:25 PM» o «17:25».
 *  Por defecto en Bogotá. */
export function horaUI(fecha: Date | string | number, zona = "America/Bogota", conSegundos = false): string {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  const s = d.toLocaleTimeString(reloj24 ? "es-CO" : "en-US", {
    timeZone: zona, hour: reloj24 ? "2-digit" : "numeric", minute: "2-digit", ...(conSegundos ? { second: "2-digit" } : {}), hour12: !reloj24,
  });
  return reloj24 ? s : arreglarAmPm(s);
}
