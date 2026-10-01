// ¿Hay una llamada de LiveKit CONECTADA en esta pestaña, ahora?
//
// Lo pregunta `main.tsx` antes de recargar la página por un deploy. Cada merge
// a main despliega, y al desplegar cambian los nombres de los chunks: la
// pestaña que quedó abierta, al pedir uno, recibe 404 y Maven se recarga solo
// para pasar a la versión nueva. Eso está bien en una tabla; en medio de una
// reunión o de una sesión de Cowork es que se te caiga la llamada sin aviso —
// Jhon lo vivió en un Meet el 10/09/2026, en un día con diez deploys.
//
// A nivel de módulo, como la pausa y el latido: lo escribe `useLiveKit` al
// conectar y desconectar, y lo lee quien lo necesite sin depender de React.
// Es POR PESTAÑA a propósito (una recarga también lo es), así que no va a
// localStorage; `llamadaEnMaven.ts` cubre el caso entre pestañas para otra cosa.

const salasConectadas = new Set<string>();

export function marcarLlamadaActiva(sala: string): void {
  salasConectadas.add(sala);
}

export function quitarLlamadaActiva(sala: string): void {
  salasConectadas.delete(sala);
}

/**
 * Una llamada que está ENTRANDO (pidiendo el token, conectando, publicando)
 * también cuenta: recargar en ese momento la corta igual, y `marcarLlamadaActiva`
 * recién llega cuando `room.connect` termina. Lo marca `useLiveKit` al empezar
 * `connect()`; devuelve cómo soltarlo, y se suelta siempre al terminar el intento
 * (bien, mal o reemplazado). Si conectó, para entonces ya quedó la sala marcada.
 * Cada intento tiene su propia marca: dos a la vez no se pisan.
 */
let conexiones = 0;
export function marcarConexionEnCurso(sala: string): () => void {
  const marca = `conectando:${sala}:${++conexiones}`;
  salasConectadas.add(marca);
  return () => { salasConectadas.delete(marca); };
}

export function hayLlamadaActiva(): boolean {
  return salasConectadas.size > 0;
}

/** Para tests. */
export function olvidarLlamadasActivas(): void {
  salasConectadas.clear();
}
