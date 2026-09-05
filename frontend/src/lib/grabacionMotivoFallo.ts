// Traduce el error técnico que guarda la edge `recordings` a algo que una
// persona entienda en la lista de Grabaciones. El texto crudo queda para el
// tooltip, por si hay que depurar.
//
// Los dos casos reales vistos en prod (05/09/2026):
//   · "Request failed with status 503": el grabador (egress) ya estaba
//     ocupado con OTRA grabación. Con el techo actual de CPU solo cabe una a
//     la vez; las dos fallas de la semana coincidieron con una grabación viva.
//   · "el egress terminó sin stop y no dejó archivo": el grabador entró a la
//     sala y nadie tenía cámara ni micrófono publicados — sin ninguna pista no
//     arranca ("Start signal not received") y no queda MP4.
export function motivoDeFallo(error: string | null | undefined): string {
  const e = (error ?? "").toLowerCase();
  if (!e) return "Falló sin detalle.";
  if (e.includes("503") || e.includes("no egress available") || e.includes("service unavailable")) {
    return "El grabador estaba ocupado con otra grabación. Solo puede grabar una reunión a la vez; vuelve a intentar cuando termine la otra.";
  }
  if (e.includes("sin stop") || e.includes("start signal") || e.includes("no dejó archivo")) {
    return "No dejó archivo: al empezar nadie tenía la cámara ni el micrófono activos. Para grabar, al menos una persona debe tener algo encendido.";
  }
  if (e.includes("permission denied")) {
    return "El servidor de grabaciones no pudo escribir el archivo. Es un problema de infraestructura, avísale al admin.";
  }
  return error!.slice(0, 160);
}
