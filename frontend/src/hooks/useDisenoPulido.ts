import { useEsDueno } from "@/hooks/useEsDueno";
import { disenoPulidoPrendido } from "@/lib/disenoDePrueba";

/** ¿Va el diseño pulido? Solo para el dueño que lo prendió con su link
 *  (`?diseno=pulido`); el resto del equipo ve el de siempre. */
export function useDisenoPulido(): boolean {
  const { esDueno } = useEsDueno();
  return esDueno === true && disenoPulidoPrendido();
}
