import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import {
  MAX_FONDOS_PROPIOS,
  listarFondosPropios, guardarFondoPropio, borrarFondoPropio, urlDeFondoPropio,
  type FondoPropio, type FalloAlGuardar,
} from "@/lib/fondoDeLlamada";

// Vive en su propio archivo y no dentro de `BackgroundSelector.tsx` por dos
// motivos: lo usan DOS pantallas (el selector del lobby y el diálogo de la
// llamada, que antes tenían cada una su lista y divergían), y un hook exportado
// desde un archivo que exporta un componente rompe el refresco en caliente.

/** Qué se le dice a la persona cuando su imagen no se pudo guardar. */
const MOTIVO_DE_FALLO: Record<FalloAlGuardar, string> = {
  limite: `Se guardan hasta ${MAX_FONDOS_PROPIOS}. Borrá uno y volvé a intentar.`,
  ilegible: "Este navegador no puede abrir esa imagen. Probá con un JPG o un PNG.",
  "sin-almacen": "Este navegador no está guardando datos del sitio, así que el fondo no se puede recordar.",
};

/** Los fondos propios de la persona, ya con su URL de esta pestaña. */
export function useFondosPropios(activo: boolean) {
  const [fondos, setFondos] = useState<Array<{ id: string; url: string; creado: number }>>([]);

  const recargar = useCallback(async () => {
    const filas = await listarFondosPropios();
    const conUrl = await Promise.all(
      filas.map(async (f: FondoPropio) => ({ id: f.id, creado: f.creado, url: (await urlDeFondoPropio(f.id)) ?? "" })),
    );
    setFondos(conUrl.filter((f) => f.url));
  }, []);

  useEffect(() => { if (activo) void recargar(); }, [activo, recargar]);

  const subir = useCallback(async (file: File): Promise<string | null> => {
    const { fondo, motivo } = await guardarFondoPropio(file, Date.now());
    if (fondo) {
      await recargar();
      return `custom:${fondo.id}`;
    }
    // El aviso dice lo que DE VERDAD pasó. Antes siempre culpaba al límite,
    // incluso con la lista vacía y el almacenamiento bloqueado.
    toast.error("No se pudo guardar el fondo", { description: MOTIVO_DE_FALLO[motivo ?? "sin-almacen"] });
    return null;
  }, [recargar]);

  const borrar = useCallback(async (id: string) => {
    await borrarFondoPropio(id);
    await recargar();
  }, [recargar]);

  return { fondos, subir, borrar, recargar };
}
