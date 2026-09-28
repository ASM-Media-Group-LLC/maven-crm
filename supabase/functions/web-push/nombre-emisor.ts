// Quién aparece como emisor en el push de un mensaje del Messenger (el título del
// directo y el «Nombre: …» del cuerpo en un grupo; ver armarTituloYCuerpo en
// _shared/push-notify.ts).
//
// Pura y aparte de index.ts (que arranca el servidor al importarse) para poder
// probarla. Hoy es el nombre del perfil, o «Alguien» si no hay nombre: lo mismo que
// hacía index.ts en línea. Cuando la escritura por API llegue, acá se suma el
// nombre visible de la key, para que el celular diga lo mismo que la burbuja y la
// campana (y no el nombre real de la persona detrás).

export const EMISOR_DESCONOCIDO = "Alguien";

export function nombreDelEmisor(perfil: { full_name?: string | null } | null | undefined): string {
  return perfil?.full_name || EMISOR_DESCONOCIDO;
}
