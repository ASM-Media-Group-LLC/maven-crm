// Lo que la pantalla necesita saber de un movimiento para poder DESHACERLO,
// como en Gmail («Conversación archivada · Deshacer», Jhon 03/10).
//
// Deshacer es mover de vuelta. Y mover de vuelta necesita el uid que el correo
// tiene AHORA en la carpeta de destino: los uid son POR CARPETA, así que el que
// tenía en Recibidos no sirve en Archivados. Con el uid viejo se movería OTRO
// correo (el que tenga ese número allá) o ninguno.
//
// Va suelto —sin IMAP ni Supabase— para poder probarlo sin red.

/** El campo `destino` de la respuesta de `bulk`. OPCIONAL a propósito: una
 *  pantalla vieja lo ignora, y una nueva contra una edge vieja no lo recibe y
 *  cae a buscar en la caché. */
export interface DestinoDelMovimiento {
  /** La carpeta a la que fueron a parar. */
  folder: string;
  /** El UIDVALIDITY de esa carpeta, si se conoce. */
  uidvalidity: number | null;
  /** [uid en el origen, uid en el destino], en el orden en que se pidieron. */
  mapa: [number, number][];
}

const esUid = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n > 0;

/** Arma el `destino` de la respuesta.
 *
 *  ⚠️ Solo pares de los uid que se PIDIERON mover, y ningún uid de destino
 *  repetido: si dos de origen dicen haber ido a parar al mismo, la respuesta del
 *  servidor está rota y se descartan los dos. Atar mal es peor que no atar: al
 *  deshacer, un par equivocado mueve un correo que nadie tocó. Lo que queda
 *  afuera, la pantalla lo busca en la caché o avisa que no pudo devolverlo. */
export function destinoParaLaRespuesta(
  folder: string,
  uidvalidity: number | null | undefined,
  mapa: Map<number, number>,
  pedidos: number[],
): DestinoDelMovimiento {
  const vecesDestino = new Map<number, number>();
  for (const [viejo, nuevo] of mapa) {
    if (esUid(viejo) && esUid(nuevo)) vecesDestino.set(nuevo, (vecesDestino.get(nuevo) ?? 0) + 1);
  }
  const pares: [number, number][] = [];
  const vistos = new Set<number>();
  for (const viejo of pedidos) {
    if (vistos.has(viejo)) continue;
    vistos.add(viejo);
    const nuevo = mapa.get(viejo);
    if (!esUid(viejo) || !esUid(nuevo) || vecesDestino.get(nuevo) !== 1) continue;
    pares.push([viejo, nuevo]);
  }
  return { folder, uidvalidity: esUid(uidvalidity) ? uidvalidity : null, mapa: pares };
}
