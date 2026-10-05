import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type VisibilidadDocumento = "privado" | "equipo";

export interface Documento {
  id: string;
  title: string;
  folder: string | null;
  visibility: VisibilidadDocumento;
  owner_id: string;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  deleted_at: string | null;
  /** Llave del archivo en R2. Null mientras se está creando. */
  storage_key: string | null;
  extension: string;
  size_bytes: number | null;
  /** Sube en cada guardado; ONLYOFFICE la usa para saber que el archivo cambió. */
  version: number;
}

export interface VersionDocumento {
  id: string;
  document_id: string;
  version: number;
  storage_key: string;
  size_bytes: number | null;
  saved_by: string | null;
  created_at: string;
}

/** Las columnas del listado. `content_html` NO va: con doscientos documentos de
 *  varias páginas cada uno, traer el cuerpo entero para pintar una lista de
 *  títulos son megas al pedo en cada carga. */
const COLUMNAS_LISTA =
  "id, title, folder, visibility, owner_id, created_at, updated_at, updated_by, deleted_at, extension, version, size_bytes";

/** `types.ts` es un archivo generado que no conoce estas tablas todavía. El
 *  `as never` evita que tsc tire "Type instantiation is excessively deep"; es el
 *  mismo patrón que usan grabaciones y los videos de creadoras. */
function tabla(nombre: string) {
  return supabase.from(nombre as never);
}

export interface FiltrosDocumentos {
  /** Texto libre: busca en título Y contenido, del lado de Postgres. */
  q: string;
  /** "mios" | "equipo" | "papelera" */
  vista: "todos" | "mios" | "papelera";
  /** Documentos, hojas o presentaciones. Cada uno es su propia sección del
   *  menú, como en Google: la lista de hojas no mezcla con la de documentos. */
  extension?: "docx" | "xlsx" | "pptx";
}

/** Listado de documentos. La búsqueda por texto va por `buscar_documentos`, que
 *  usa el índice en español; sin término se lee la tabla directo por RLS. */
export function useDocumentos(filtros: FiltrosDocumentos) {
  const { user } = useAuth();
  const termino = filtros.q.trim();

  return useQuery({
    queryKey: ["documentos", filtros.vista, filtros.extension, termino, user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Documento[]> => {
      // ⚠️ Se busca solo por TÍTULO. La búsqueda dentro del texto murió con el
      // editor propio: ahora el contenido es un .docx en R2 y para mirar adentro
      // habría que extraerle el texto al guardar. Queda pendiente.
      let q = tabla("documents").select(COLUMNAS_LISTA);
      if (termino) q = q.ilike("title", `%${termino.replace(/[%_]/g, "")}%`);
      // La papelera es solo la propia: RLS ya impide ver la de otro, pero
      // pedirlo explícito deja la intención escrita.
      q =
        filtros.vista === "papelera"
          ? q.not("deleted_at", "is", null)
          : q.is("deleted_at", null);
      if (filtros.vista === "mios" && user) q = q.eq("owner_id", user.id);
      if (filtros.extension) q = q.eq("extension", filtros.extension);

      const { data, error } = await q.order("updated_at", { ascending: false }).limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as Documento[];
    },
  });
}

/** Un documento con su contenido. Query aparte del listado a propósito: es la
 *  única que trae el cuerpo. */
export function useDocumento(id: string | undefined) {
  return useQuery({
    queryKey: ["documento", id],
    enabled: !!id,
    // El editor es la verdad mientras está abierto: si esta consulta se
    // revalidara sola al volver a la pestaña, pisaría lo que la persona está
    // escribiendo con lo último que alcanzó a guardarse.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    queryFn: async (): Promise<Documento> => {
      const { data, error } = await tabla("documents").select("*").eq("id", id!).single();
      if (error) throw error;
      return data as unknown as Documento;
    },
  });
}

export function useVersionesDeDocumento(id: string | undefined, abierto: boolean) {
  return useQuery({
    queryKey: ["documento-versiones", id],
    enabled: !!id && abierto,
    queryFn: async (): Promise<VersionDocumento[]> => {
      const { data, error } = await tabla("document_versions")
        .select("id, document_id, version, storage_key, size_bytes, saved_by, created_at")
        .eq("document_id", id!)
        .order("version", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as VersionDocumento[];
    },
  });
}

// Crear un documento YA NO es un insert: hay que subir además el archivo en
// blanco a R2, y eso lo hace la edge `oficina-doc`. Ver useOnlyOffice.ts.

interface ParcheDocumento {
  id: string;
  title?: string;
  visibility?: VisibilidadDocumento;
  folder?: string | null;
  deleted_at?: string | null;
}

/** Guardar. Lo usa tanto el guardado automático como los cambios de título o
 *  visibilidad, así que NO invalida la consulta del documento abierto: hacerlo
 *  volvería a traer el cuerpo del servidor y le pisaría el texto a quien está
 *  escribiendo. Solo refresca el listado, que sí quiere verse al día. */
export function useGuardarDocumento() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, ...campos }: ParcheDocumento) => {
      const { error } = await tabla("documents")
        .update({ ...campos, updated_by: user?.id ?? null } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documentos"] }),
  });
}

/** Un cambio que la RLS no deja hacer no da error: toca cero filas. */
export const SIN_PERMISO_DOCUMENTO = "sin_permiso";

/** El título de un documento («Sin título» → «Acta de la reunión»), desde la
 *  lista o desde el documento abierto, como en Google Docs.
 *
 *  Quién puede: lo dice la RLS de `documents` (el dueño, cualquiera si es del
 *  equipo, o a quien se lo compartieron con permiso de editar; ver
 *  20260917100000_oficina_compartir.sql). ⚠️ `.select("id")`: sin permiso, el
 *  UPDATE toca cero filas SIN error; sin pedir la fila de vuelta se vería
 *  como hecho.
 *
 *  Al terminar se pone el título nuevo en la consulta del documento abierto
 *  (que no se vuelve a pedir sola: staleTime Infinity) y se refresca la lista.
 *  El editor de ONLYOFFICE no se toca: no muestra el nombre (toolbarHideFileName
 *  en la edge oficina-doc) y la próxima vez que se abre ya llega con el nuevo. */
export function useRenombrarDocumento() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const limpio = title.trim().slice(0, 200);
      const { data, error } = await tabla("documents")
        .update({ title: limpio, updated_by: user?.id ?? null } as never)
        .eq("id", id)
        .select("id");
      if (error) throw error;
      if (!(data as unknown[] | null)?.length) throw new Error(SIN_PERMISO_DOCUMENTO);
      return limpio;
    },
    onSuccess: (title, { id }) => {
      qc.setQueryData<Documento>(["documento", id], (d) => (d ? { ...d, title } : d));
      return qc.invalidateQueries({ queryKey: ["documentos"] });
    },
  });
}

/** Los documentos que me compartieron CON permiso de editar: con esto la lista
 *  sabe a cuáles ofrecerles «Cambiar nombre» sin tener que probar. */
export function useDocumentosQuePuedoEditar() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["documentos", "puedo-editar", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await tabla("document_shares").select("document_id")
        .eq("user_id", user!.id).eq("puede_editar", true);
      if (error) throw error;
      return new Set(((data ?? []) as unknown as { document_id: string }[]).map((f) => f.document_id));
    },
  });
}

/** ¿Puedo cambiarle el nombre (escribirlo)? Lo mismo que la política de
 *  UPDATE de `documents`: el dueño, cualquiera si es del equipo, o con el
 *  permiso de editar compartido. En la papelera, solo el dueño. */
export function puedoEditarDocumento(d: Pick<Documento, "id" | "owner_id" | "visibility" | "deleted_at">, yo: string | undefined, compartidosParaEditar?: Set<string>): boolean {
  if (!yo) return false;
  if (d.owner_id === yo) return true;
  if (d.deleted_at) return false;
  return d.visibility === "equipo" || !!compartidosParaEditar?.has(d.id);
}

/** A la papelera, o de vuelta. Borrar de verdad es otra cosa y solo lo puede
 *  hacer el dueño desde la papelera. */
export function usePapelera() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, tirar }: { id: string; tirar: boolean }) => {
      const { error } = await tabla("documents")
        .update({ deleted_at: tirar ? new Date().toISOString() : null } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documentos"] }),
  });
}

export function useBorrarDocumento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await tabla("documents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documentos"] }),
  });
}
