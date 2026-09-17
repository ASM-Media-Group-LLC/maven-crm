import {
  addDays, eachDayOfInterval, endOfMonth, endOfWeek, startOfMonth, startOfWeek,
} from "date-fns";

/** Las 6 semanas que dibuja la vista de mes.
 *
 *  Siempre 42 días, aunque sobren: una grilla que cambia de alto entre meses
 *  hace saltar la página al navegar. La semana arranca en LUNES, como el resto
 *  de Maven y como lo lee el equipo. */
export function diasDelMes(mes: Date): Date[] {
  return eachDayOfInterval({
    start: startOfWeek(startOfMonth(mes), { weekStartsOn: 1 }),
    end: endOfWeek(addDays(startOfWeek(startOfMonth(mes), { weekStartsOn: 1 }), 41), {
      weekStartsOn: 1,
    }),
  }).slice(0, 42);
}

/** El rango que hay que pedirle a la base para llenar esa grilla. */
export function rangoDelMes(mes: Date): { desde: Date; hasta: Date } {
  const dias = diasDelMes(mes);
  const desde = new Date(dias[0]);
  desde.setHours(0, 0, 0, 0);
  const hasta = new Date(dias[dias.length - 1]);
  hasta.setHours(23, 59, 59, 999);
  return { desde, hasta };
}

/** La casilla de la grilla a la que pertenece una fecha, en hora LOCAL. */
export function claveDeDia(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Igual pero leyendo la fecha en UTC.
 *
 *  ⚠️ Los eventos de DÍA COMPLETO se guardan anclados a medianoche UTC (la
 *  convención de iCalendar para valores DATE) y hay que leerlos igual. Si se
 *  leyeran en hora local, en Bogotá (UTC-5) un feriado del 17 se dibujaría el
 *  16: la medianoche UTC del 17 son las 19:00 del 16 allá. */
export function claveDeDiaUTC(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

interface EventoUbicable {
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
}

/** En qué casillas de la grilla se dibuja un evento.
 *
 *  Uno que cruza la medianoche ocupa los dos días: si solo se pusiera en el de
 *  inicio, una reunión del lunes a la noche que termina el martes desaparecería
 *  del martes, que es cuando la gente la busca. */
export function diasQueOcupa(ev: EventoUbicable): string[] {
  const clave = ev.all_day ? claveDeDiaUTC : claveDeDia;
  const inicio = new Date(ev.starts_at);
  const fin = ev.ends_at ? new Date(ev.ends_at) : inicio;

  const dias: string[] = [];
  const cursor = new Date(inicio);
  // Tope de seguridad: un evento con fecha rota no puede colgar el render.
  for (let i = 0; i < 400; i++) {
    dias.push(clave(cursor));
    if (clave(cursor) === clave(fin) || cursor > fin) break;
    cursor.setDate(cursor.getDate() + 1);
  }
  return [...new Set(dias)];
}

/** Agrupa los eventos por casilla, listo para pintar la grilla. */
export function porDia<T extends EventoUbicable>(eventos: T[]): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const ev of eventos) {
    for (const dia of diasQueOcupa(ev)) {
      const ya = mapa.get(dia);
      if (ya) ya.push(ev);
      else mapa.set(dia, [ev]);
    }
  }
  return mapa;
}

/** La hora que se muestra en la píldora del evento. Los de día completo no
 *  llevan: inventarles una sería mentir. */
export function horaDe(ev: EventoUbicable): string | null {
  if (ev.all_day) return null;
  const d = new Date(ev.starts_at);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Convierte lo que escribe la persona en el formulario al instante que se
 *  guarda. Un día completo se ancla a medianoche UTC; uno con hora usa la
 *  zona de quien lo crea, que es lo que espera. */
export function aInstante(fecha: string, hora: string | null): string {
  if (!hora) return new Date(`${fecha}T00:00:00.000Z`).toISOString();
  return new Date(`${fecha}T${hora}:00`).toISOString();
}

/** El camino de vuelta: del instante guardado a los campos del formulario. */
export function aCampos(iso: string, todoElDia: boolean): { fecha: string; hora: string } {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  if (todoElDia) {
    return { fecha: claveDeDiaUTC(d), hora: "" };
  }
  return { fecha: claveDeDia(d), hora: `${p(d.getHours())}:${p(d.getMinutes())}` };
}
