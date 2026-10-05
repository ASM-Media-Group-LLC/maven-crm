// «Agrupar por fecha» en el Drive (Jhon, 02/10): Hoy, Ayer, Esta semana, Este
// mes y después mes por mes, como los grupos de Google. Aparte de la página
// para poder probarlo sin dibujarla.
import { isSameDay, isSameMonth, isSameWeek, startOfMonth, subDays } from "date-fns";

export type TipoDeGrupo = "hoy" | "ayer" | "semana" | "mes" | "otroMes";

export interface Grupo<T> {
  clave: string;
  tipo: TipoDeGrupo;
  /** El primer día del mes (para «septiembre de 2026»). */
  inicio: Date;
  items: T[];
}

/** En qué grupo cae una fecha. Una fecha del futuro (reloj adelantado) es «Hoy». */
export function grupoDe(fecha: Date, ahora = new Date()): { clave: string; tipo: TipoDeGrupo; inicio: Date } {
  const inicio = startOfMonth(fecha);
  if (fecha.getTime() > ahora.getTime() || isSameDay(fecha, ahora)) return { clave: "hoy", tipo: "hoy", inicio };
  if (isSameDay(fecha, subDays(ahora, 1))) return { clave: "ayer", tipo: "ayer", inicio };
  if (isSameWeek(fecha, ahora, { weekStartsOn: 1 })) return { clave: "semana", tipo: "semana", inicio };
  if (isSameMonth(fecha, ahora)) return { clave: "mes", tipo: "mes", inicio };
  return { clave: `${inicio.getFullYear()}-${inicio.getMonth()}`, tipo: "otroMes", inicio };
}

/** Los grupos, del más nuevo al más viejo. Adentro: carpetas primero (como en
 *  la lista) y después de lo más nuevo a lo más viejo. */
export function agruparPorFecha<T extends { tipo: "carpeta" | "archivo" }>(
  items: readonly T[],
  fechaDe: (i: T) => string,
  ahora = new Date(),
): Grupo<T>[] {
  const fechas = new Map<T, number>(items.map((i) => [i, new Date(fechaDe(i)).getTime() || 0]));
  const ordenados = [...items].sort((a, b) => fechas.get(b)! - fechas.get(a)!);
  const grupos = new Map<string, Grupo<T>>();
  for (const i of ordenados) {
    const g = grupoDe(new Date(fechas.get(i)!), ahora);
    if (!grupos.has(g.clave)) grupos.set(g.clave, { ...g, items: [] });
    grupos.get(g.clave)!.items.push(i);
  }
  return [...grupos.values()].map((g) => ({
    ...g,
    // sort es estable: dentro de cada tipo queda el orden por fecha.
    items: g.items.sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === "carpeta" ? -1 : 1)),
  }));
}

/** Los grupos recortados a los primeros `limite` elementos (lo que se dibuja). */
export function recortarGrupos<T>(grupos: readonly Grupo<T>[], limite: number): Grupo<T>[] {
  const salida: Grupo<T>[] = [];
  let quedan = limite;
  for (const g of grupos) {
    if (quedan <= 0) break;
    salida.push({ ...g, items: g.items.slice(0, quedan) });
    quedan -= g.items.length;
  }
  return salida;
}
