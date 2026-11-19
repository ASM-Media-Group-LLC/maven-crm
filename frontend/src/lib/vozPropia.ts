// HABLAR CUENTA COMO ACTIVIDAD (Alvaro, 19/11/2026: «teclado, ratón o
// hablando»). La app de computador mide el teclado y el ratón; quien habla en
// una llamada de trabajo sin tocar nada no está inactivo. La llamada (useLiveKit)
// anota cada segundo en que el micrófono propio capta voz, y al guardar cada
// tramo de uso (lib/escritorio.ts → filasDeUso) se le restan esos segundos a lo
// «inactivo». Vive fuera de React: lo leen la llamada y el guardado de tramos.

const segundos = new Set<number>();
const GUARDAR_MS = 3 * 60 * 60 * 1000; // con 3 horas alcanza: los tramos se guardan al minuto

/** La llamada avisa que la persona está hablando ahora. */
export function anotarVoz(ahora: number = Date.now()): void {
  segundos.add(Math.floor(ahora / 1000));
  if (segundos.size > 20_000) podar(ahora);
}

function podar(ahora: number): void {
  const limite = Math.floor((ahora - GUARDAR_MS) / 1000);
  for (const s of segundos) if (s < limite) segundos.delete(s);
}

/** Cuántos segundos habló entre dos instantes (ISO o ms). */
export function segundosDeVozEntre(desde: string | number, hasta: string | number): number {
  const a = Math.floor((typeof desde === "number" ? desde : Date.parse(desde)) / 1000);
  const b = Math.floor((typeof hasta === "number" ? hasta : Date.parse(hasta)) / 1000);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  let n = 0;
  for (const s of segundos) if (s >= a && s < b) n++;
  return n;
}

/** Para pruebas. */
export function olvidarVoz(): void {
  segundos.clear();
}
