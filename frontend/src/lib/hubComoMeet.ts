// EL SUPERVISOR HUB COMO GOOGLE MEET (Alvaro, 18/11/2026). Las reglas puras de
// la vista (se prueban sin montar la llamada):
//
//  · El dueño ve las pantallas en MOSAICO cuando hay dos o más: todas a la vez,
//    cada una en su recuadro (LiveKit les manda la capa chica 720p@5 por el
//    tamaño). Un clic agranda una: ocupa casi todo, las caras quedan chicas al
//    costado y llega la capa grande (1080p@15).
//  · El supervisor sin pantalla (o con la pantalla en negro) ve un aviso grande
//    con la causa y el botón «Compartir pantalla».
import type { LKParticipant } from "@/hooks/useLiveKit";
import type { FalloDePantalla } from "@/lib/fallosDePantalla";
import type { TranslationKey } from "@/lib/i18n";

/** Las pantallas ajenas para el mosaico, o null si va la vista de siempre
 *  (una sola pantalla, una fijada, la ventanita flotante o fuera del Hub). */
export function pantallasParaMosaico(
  participantes: LKParticipant[],
  s: { activo: boolean; fijado: string | null; compacto: boolean },
): LKParticipant[] | null {
  if (!s.activo || s.fijado || s.compacto) return null;
  const pantallas = participantes.filter((p) => p.isScreenSharing && !p.isLocal);
  return pantallas.length >= 2 ? pantallas : null;
}

/** Columnas del mosaico: como Meet, lo más parecido a un cuadrado. */
export function columnasDelMosaico(n: number): string {
  if (n <= 2) return "grid-cols-1 md:grid-cols-2";
  if (n <= 4) return "grid-cols-2";
  if (n <= 9) return "grid-cols-2 md:grid-cols-3";
  return "grid-cols-3 md:grid-cols-4";
}

/** Las claves del aviso al supervisor sin pantalla en el Hub. */
export function textoDePantallaDelHub(s: {
  negra: boolean;
  apagadaAMano: boolean;
  fallo: FalloDePantalla | null;
  enLaApp: boolean;
}): { titulo: TranslationKey; detalle: TranslationKey } {
  if (s.negra) return { titulo: "cowork.hubPantalla.negraTitulo", detalle: "cowork.hubPantalla.negraDetalle" };
  if (s.apagadaAMano) return { titulo: "cowork.hubPantalla.apagadaTitulo", detalle: "cowork.hubPantalla.apagadaDetalle" };
  if (s.fallo === "permiso") return { titulo: "cowork.hubPantalla.permisoTitulo", detalle: "cowork.hubPantalla.permisoDetalle" };
  if (s.enLaApp) return { titulo: "cowork.hubPantalla.sinPantallaTitulo", detalle: "cowork.hubPantalla.reintentandoDetalle" };
  return { titulo: "cowork.hubPantalla.sinPantallaTitulo", detalle: "cowork.hubPantalla.navegadorDetalle" };
}
