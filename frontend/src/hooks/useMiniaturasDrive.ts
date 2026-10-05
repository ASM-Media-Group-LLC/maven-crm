import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { DriveItem } from "@/hooks/useDrive";
import { extensionParaMiniatura } from "@/lib/drive/miniaturas";

// Las miniaturas de lo que se está viendo en la cuadrícula o la galería. Las
// hace el NAS; la edge `drive` (acción miniaturas) firma las URLs de a muchas:
// una página de la cuadrícula cuesta UNA llamada, no una por cuadrito. Nada de
// esto frena la lista: mientras no llegan (o si no hay), se ve el ícono.

/** De a cuántas por llamada (la edge acepta hasta 200). */
export const MINIATURAS_POR_PEDIDO = 100;

export const tieneMiniatura = (i: Pick<DriveItem, "tipo" | "estado" | "nombre" | "mime">) =>
  i.tipo === "archivo" && i.estado === "listo" && extensionParaMiniatura(i.nombre, i.mime) !== null;

async function pedirMiniaturas(ids: string[]): Promise<Record<string, string>> {
  const { data, error } = await supabase.functions.invoke("drive", { body: { action: "miniaturas", ids } });
  if (error) throw error;
  return ((data as { urls?: Record<string, string> } | null)?.urls) ?? {};
}

/** id → URL de la miniatura, para los que tienen. `items`: lo que está
 *  dibujado, en orden (los tramos quedan fijos al ir bajando la página). */
export function useMiniaturasDrive(items: readonly DriveItem[], habilitado: boolean): Map<string, string> {
  const tramos = useMemo(() => {
    if (!habilitado) return [];
    const ids = items.filter(tieneMiniatura).map((i) => i.id);
    const salida: string[][] = [];
    for (let n = 0; n < ids.length; n += MINIATURAS_POR_PEDIDO) salida.push(ids.slice(n, n + MINIATURAS_POR_PEDIDO));
    return salida;
  }, [items, habilitado]);

  return useQueries({
    queries: tramos.map((ids) => ({
      // ⚠️ No empieza con "drive": mover o subir invalida ["drive"] y no hace
      // falta volver a firmar las miniaturas por eso.
      queryKey: ["drive-miniaturas", ids],
      queryFn: () => pedirMiniaturas(ids),
      // La URL vale entre 6 y 12 h (la edge la redondea a tramos de 6 h).
      staleTime: 3 * 3600 * 1000,
      gcTime: 6 * 3600 * 1000,
      retry: 1,
    })),
    combine: juntar,
  });
}

/** Fuera del hook: con la misma función, react-query no vuelve a juntar si
 *  ningún tramo cambió. */
function juntar(resultados: { data?: Record<string, string> }[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of resultados) if (r.data) for (const [id, url] of Object.entries(r.data)) m.set(id, url);
  return m;
}
