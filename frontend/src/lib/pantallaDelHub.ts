// La pantalla que el supervisor comparte en el Supervisor Hub (la que Argos le
// pide para tomarle fotos). Es la ÚNICA captura de pantalla del supervisor: el
// tablero de Cowork reenvía un clon de esta misma a la sala donde está hablando,
// en vez de pedirle al navegador otra pantalla (Alvaro, 16/11/2026: «solo una
// compartida de pantalla, no varias»).
//
// Vive en un módulo, no en la página, por la misma razón que el latido: el Hub
// sigue vivo en la ventanita flotante cuando el supervisor navega a otra sección.

type Oyente = (track: MediaStreamTrack | null) => void;

let actual: MediaStreamTrack | null = null;
const oyentes = new Set<Oyente>();

export function fijarPantallaDelHub(track: MediaStreamTrack | null): void {
  if (track === actual) return;
  actual = track;
  oyentes.forEach((o) => {
    try { o(track); } catch { /* un oyente roto no frena a los demás */ }
  });
}

export function pantallaDelHub(): MediaStreamTrack | null {
  return actual;
}

export function suscribirPantallaDelHub(oyente: Oyente): () => void {
  oyentes.add(oyente);
  return () => { oyentes.delete(oyente); };
}
