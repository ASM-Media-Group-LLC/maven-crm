// Lo que el Supervisor Hub necesita saber de la pantalla compartida (Alvaro,
// 18/11/2026): por qué no se pudo compartir y si una pantalla ajena no me la
// dejan ver. Va aparte de hooks/useLiveKit para poder probarlo sin la llamada.

/** ¿LiveKit dice que esta pantalla NO me la dejan ver? (solo publicaciones remotas). */
export function pantallaSinPermiso(pub: unknown): boolean {
  return (pub as { permissionStatus?: string } | undefined)?.permissionStatus === "not_allowed";
}

export type FalloDePantalla = "permiso" | "falla";

/** Por qué no se pudo compartir: el permiso del computador o cualquier otra falla.
 *  En la app (pantalla automática) nadie cancela una ventanita: un NotAllowedError
 *  es el sistema negando el permiso (macOS sin «Grabación de pantalla»). */
export function clasificarFalloDePantalla(err: unknown): FalloDePantalla {
  const nombre = (err as { name?: string } | null)?.name;
  const msg = String((err as { message?: string } | null)?.message ?? "").toLowerCase();
  if (nombre === "NotAllowedError" || nombre === "SecurityError" || msg.includes("permission")) return "permiso";
  return "falla";
}
