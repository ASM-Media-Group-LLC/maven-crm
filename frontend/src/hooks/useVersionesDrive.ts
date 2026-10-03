import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { llamarDrive, useInvalidarDrive } from "@/hooks/useDrive";

// Drive: las VERSIONES de un archivo, como «Administrar versiones» de Google
// (Jhon, 03/10: «las versiones ya se guardan, pero no hay forma de verlas»).
//
// Las guarda la edge oficina-doc cada vez que alguien edita EN SU LUGAR un
// archivo del Drive desde la Oficina (migración 20261002200000: una fila por
// versión, con su archivo en el NAS; la vigente es la de storage_key igual al
// de la ficha). Aquí:
//   · la lista se lee directo de la base: la RLS de drive_versiones deja ver
//     las de lo que la persona puede ver (drive_mi_rol);
//   · bajar una versión vieja y restaurarla pasan por la edge `drive`
//     (abrir_version y restaurar_version): firmar un permiso del NAS y mover
//     el puntero de la ficha no se puede hacer desde el navegador. Restaurar
//     pide dueño o editor, como editar.

/** `types.ts` es generado y todavía no conoce esta tabla. */
const tabla = (n: string) => supabase.from(n as never);

export interface VersionDrive {
  id: string;
  storage_key: string;
  size: number | null;
  /** Quién la guardó (null: no se sabe; en el original importado, sin dueño). */
  saved_by: string | null;
  created_at: string;
  /** La que se ve hoy al abrir el archivo. */
  actual: boolean;
}

/** Sin la tabla (la migración no se aplicó) no hay versiones: no es un error. */
const sinTabla = (e: { code?: string } | null) => e?.code === "42P01" || e?.code === "PGRST205";

/** De la más nueva a la más vieja; la actual es la MÁS NUEVA cuyo archivo es
 *  el de la ficha (si se restauró una vieja, su archivo aparece dos veces). */
export function marcarActual(filas: Omit<VersionDrive, "actual">[], storageKey: string | null): VersionDrive[] {
  let marcada = false;
  return filas.map((v) => {
    const actual = !marcada && !!storageKey && v.storage_key === storageKey;
    if (actual) marcada = true;
    return { ...v, actual };
  });
}

export function useVersionesDrive(itemId: string | null) {
  return useQuery({
    queryKey: ["drive-versiones", itemId],
    enabled: !!itemId,
    staleTime: 15_000,
    queryFn: async (): Promise<VersionDrive[]> => {
      const [versiones, ficha] = await Promise.all([
        tabla("drive_versiones").select("id, storage_key, size, saved_by, created_at")
          .eq("item_id", itemId!).order("created_at", { ascending: false }),
        tabla("drive_items").select("storage_key").eq("id", itemId!).maybeSingle(),
      ]);
      if (versiones.error) {
        if (sinTabla(versiones.error as { code?: string })) return [];
        throw versiones.error;
      }
      if (ficha.error) throw ficha.error;
      const clave = (ficha.data as unknown as { storage_key: string | null } | null)?.storage_key ?? null;
      return marcarActual((versiones.data ?? []) as unknown as Omit<VersionDrive, "actual">[], clave);
    },
  });
}

/** Baja una versión (la edge firma el permiso del NAS con el nombre del archivo). */
export async function bajarVersion(versionId: string): Promise<void> {
  const { url } = await llamarDrive<{ url: string }>("abrir_version", { version: versionId });
  window.location.href = url; // Content-Disposition: attachment → no navega
}

/** Vuelve a dejar vigente una versión vieja. La de hoy no se pierde: queda en
 *  el historial (la restaurada entra como versión nueva, como en Google). */
export function useRestaurarVersion() {
  const invalidar = useInvalidarDrive();
  return useMutation({
    mutationFn: (versionId: string) => llamarDrive<{ ok: true }>("restaurar_version", { version: versionId }),
    onSuccess: invalidar,
  });
}
