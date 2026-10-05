// El buscador de arriba del Drive (Jhon, 06/10: «ponle buscador»). Busca en
// todo el Drive con drive_buscar, lo mismo que el diálogo «Abrir» de la
// Oficina. Aparte de la página para poder probarlo sin dibujarla.
import type { PasoDeRuta, UnidadConNombre, VistaDrive } from "@/hooks/useDrive";

/** En qué sección se abre una carpeta encontrada: la de la raíz de su ruta,
 *  igual que las migas y el panel de Detalles. Si está en una unidad
 *  compartida, «Unidades compartidas»; si es mía o de mi «Mi unidad» de
 *  Google, «Mi unidad»; si no, «Compartido conmigo». */
export function vistaDeLaRaiz(
  raiz: Pick<PasoDeRuta, "id" | "owner_id"> | undefined,
  unidades: ReadonlyMap<string, UnidadConNombre> | undefined,
  yo: string | undefined,
): VistaDrive {
  const unidad = raiz ? unidades?.get(raiz.id) : undefined;
  if (unidad?.tipo === "empresa") return "unidades";
  if ((!!yo && raiz?.owner_id === yo) || (unidad?.tipo === "personal" && !!yo && unidad.persona === yo)) return "mia";
  return "compartido";
}

/** La fila marcada con las flechas: da la vuelta en las puntas, como el
 *  buscador de Google. Sin resultados, ninguna (-1). */
export function moverMarca(actual: number, paso: 1 | -1, total: number): number {
  if (total <= 0) return -1;
  if (actual < 0) return paso === 1 ? 0 : total - 1;
  return (actual + paso + total) % total;
}
