// Servidor de llamadas por persona (Alvaro, 19/11/2026).
//
// Desde el 19/11 todas las llamadas van a Miami (secreto LIVEKIT_URL). Para
// comparar, unas pocas personas siguen en el servidor viejo (St. Louis). Solo
// gente que trabaja sola en su sala: si alguien de esta lista entra a una sala
// compartida, no se oye ni se ve con los que están en el otro servidor.
//
// Para devolver a alguien a Miami: se saca de la lista y se despliega.

export const URL_STLOUIS = "wss://lk.asmtech.ai";

/** Personas que se quedan en St. Louis para comparar (id de profiles). */
export const EN_STLOUIS = new Set<string>([
  "adda098b-e139-41b0-ade8-214d57a56eb0", // Brayan Esneider Castaño Hoyos (solo en su Cowork)
]);

/** URL wss:// del servidor de llamadas para esta persona. */
export function urlDeLiveKit(userId: string | null | undefined): string {
  if (userId && EN_STLOUIS.has(userId)) return URL_STLOUIS;
  return Deno.env.get("LIVEKIT_URL")!;
}
