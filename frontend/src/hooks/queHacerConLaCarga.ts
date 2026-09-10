/**
 * Qué hacer con la respuesta de una petición que alimenta la lista de chats.
 *
 * Existe por lo que vio Grace (10/09): estaba mandando una nota de voz, se le
 * cortó la conexión un minuto, y Messenger quedó EN BLANCO — "Inicia una
 * conversación", "Sin grupos todavía" — como si nunca hubiera hablado con
 * nadie. A Brayan le pasó lo mismo.
 *
 * La causa: el código leía `data` sin mirar `error`. Una petición que se cae
 * devuelve `data: null`, y `null` se trataba igual que "cero filas": se borraba
 * la lista entera. PostgREST NUNCA devuelve null cuando la consulta funciona —
 * si no hay filas, devuelve []. Así que null es fallo, siempre, y un fallo no
 * es "no tienes chats": es "no pude averiguarlo, deja lo que había".
 */
export type Veredicto = "abortar" | "vaciar" | "seguir";

export function queHacerConLaCarga(r: {
  error: unknown;
  data: unknown[] | null | undefined;
}): Veredicto {
  if (r.error || r.data == null) return "abortar";
  if (r.data.length === 0) return "vaciar";
  return "seguir";
}

/**
 * Cuánto esperar antes de reintentar la carga de mensajes del chat abierto,
 * según el número de intento fallido (0 = primer fallo). `null` = ya no más.
 * Suman ~67 s: cubren un corte como los de Grace (un minuto) sin martillar el
 * servidor; los cortes más largos los cubre el evento `online` del navegador.
 */
export const ESPERAS_DE_REINTENTO_MS = [2_000, 5_000, 10_000, 20_000, 30_000] as const;

export function esperaDeReintento(intento: number): number | null {
  return ESPERAS_DE_REINTENTO_MS[intento] ?? null;
}
