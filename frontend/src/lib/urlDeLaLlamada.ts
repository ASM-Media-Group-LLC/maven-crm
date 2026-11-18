// La dirección de la pestaña de una llamada del Messenger.
//   nombre  → lo que se ve arriba (y el título de la grabación). Antes faltaba
//             y arriba salía «call-<uuid>».
//   directo → entra ya, sin la sala previa (contestar = estar hablando).
//   audio   → llamada de voz: arranca con la cámara apagada.
export function urlDeLaLlamada(
  sala: string,
  o: { nombre?: string | null; admin?: boolean; directo?: boolean; audio?: boolean } = {},
): string {
  const q = new URLSearchParams();
  if (o.admin) q.set("admin", "1");
  if (o.nombre) q.set("name", o.nombre);
  if (o.directo) q.set("directo", "1");
  if (o.audio) q.set("audio", "1");
  const s = q.toString();
  return `/call/${encodeURIComponent(sala)}${s ? `?${s}` : ""}`;
}
