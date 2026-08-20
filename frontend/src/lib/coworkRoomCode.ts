// Código de sala de Cowork: 6 caracteres de un alfabeto SIN I/L/O/0/1, para que
// se pueda dictar por voz sin que nadie confunda O con 0 ni l con 1.
//
// La gente pega el código como le llega: con espacios, en minúscula, con guiones
// ("abc-234", " 4ktEup "). Normalizamos siempre en el mismo lugar en vez de repetir
// la regex en cada input. La edge function `cowork-session/joinByCode` repite esta
// limpieza del lado del servidor — no confiamos en que el cliente la haya hecho.
export const ROOM_CODE_LENGTH = 6;

export function normalizeRoomCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, ROOM_CODE_LENGTH);
}

export function isCompleteRoomCode(raw: string): boolean {
  return normalizeRoomCode(raw).length === ROOM_CODE_LENGTH;
}
