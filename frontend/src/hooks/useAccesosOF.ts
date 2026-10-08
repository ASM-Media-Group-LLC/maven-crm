import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminInvoke } from "@/lib/adminInvoke";
import type { TranslationKey } from "@/lib/i18n";

// Los accesos de OnlyFans de cada creadora (edge creadora-accesos; la base:
// 20261008120000_creadora_accesos). La contraseña NUNCA se guarda en el
// navegador: se pide a la edge cuando un admin la ve o la copia (y queda
// anotado), y no entra en la caché de react-query.

export interface AccesosOF {
  of_correo: string | null;
  of_usuario: string | null;
  doble_verificacion: boolean | null;
  tiene_clave: boolean;
  clave_cambiada_en: string | null;
  actualizado_en?: string | null;
  actualizado_desde?: "equipo" | "creadora" | "importador" | null;
}

export interface EventoAcceso {
  accion: "guardar" | "importar" | "ver_clave" | "copiar_clave";
  desde: "equipo" | "creadora" | "importador";
  campos: string[];
  en: string;
  quien: string | null;
}

export interface CambiosAccesos {
  of_correo?: string | null;
  of_usuario?: string | null;
  /** La contraseña nueva; null para borrarla (solo admin). */
  clave?: string | null;
  doble_verificacion?: boolean | null;
}

const llamar = <T,>(accion: string, cuerpo: Record<string, unknown>) =>
  adminInvoke<T>("creadora-accesos", { accion, ...cuerpo });

// ── Equipo (pestaña Portal de la ficha): SOLO admins ─────────────────────────

/** Solo admins: a cualquier otro la edge le contesta solo_admin. */
export function useAccesosOF(creatorId: string) {
  return useQuery({
    queryKey: ["accesos-of", creatorId],
    queryFn: () =>
      llamar<{ accesos: AccesosOF | null; eventos: EventoAcceso[] }>("ver", { creator_id: creatorId }),
  });
}

export function useGuardarAccesosOF(creatorId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cambios: CambiosAccesos) => llamar<{ accesos: AccesosOF }>("guardar", { creator_id: creatorId, cambios }),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["accesos-of", creatorId] }),
  });
}

/** Solo admin. Cada llamada queda anotada (ver o copiar). */
export async function pedirClave(creatorId: string, para: "ver" | "copiar"): Promise<string> {
  const r = await llamar<{ clave: string }>("ver_clave", { creator_id: creatorId, para });
  return r.clave;
}

// ── La creadora (su portal) ──────────────────────────────────────────────────

export function useMisAccesos(creatorId: string) {
  return useQuery({
    queryKey: ["mis-accesos", creatorId],
    queryFn: async () => (await llamar<{ accesos: AccesosOF }>("mis_accesos", { creator_id: creatorId })).accesos,
  });
}

export function useGuardarMisAccesos(creatorId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cambios: Omit<CambiosAccesos, "clave"> & { clave?: string }) =>
      llamar<{ accesos: AccesosOF }>("guardar_mios", { creator_id: creatorId, cambios }),
    onSuccess: (r) => qc.setQueryData(["mis-accesos", creatorId], r.accesos),
  });
}

// ── El importador (admin) ────────────────────────────────────────────────────

export interface FilaPrevia {
  fila: number;
  nombre: string | null;
  instagram: string | null;
  creator_id: string | null;
  creadora: string | null;
  como: "usuario_of" | "correo" | "instagram" | "nombre" | null;
  repetida: boolean;
  trae: { of_correo: boolean; of_usuario: boolean; clave: boolean; doble: boolean };
  ya_tiene: { of_correo: boolean; of_usuario: boolean; clave: boolean; doble: boolean };
}

export interface Previa {
  documento: string;
  columnas: string[];
  filas: FilaPrevia[];
  creadoras: { id: string; nombre: string }[];
}

export const previaDeImportacion = (documentoId: string) => llamar<Previa>("importar_previa", { documento_id: documentoId });

export const importarAccesos = (documentoId: string, asignaciones: { fila: number; creator_id: string }[], pisar: boolean) =>
  llamar<{ guardadas: number; sin_cambios: number; campos: Record<string, number> }>("importar", {
    documento_id: documentoId,
    asignaciones,
    pisar,
  });

// ── Errores ──────────────────────────────────────────────────────────────────

const ERRORES = [
  "solo_admin", "no_existe", "sin_clave", "no_se_pudo_abrir", "sin_llave", "correo_invalido", "usuario_invalido",
  "clave_invalida", "no_es_tuya", "documento_no_existe", "no_es_hoja", "sin_columnas", "asignacion_invalida",
] as const;

/** El código que contesta la edge → la clave del texto. */
export function claveDeErrorAccesos(e: unknown): TranslationKey {
  const codigo = (e as Error)?.message ?? "";
  return (ERRORES as readonly string[]).includes(codigo) ? (`portal.accesos.error.${codigo}` as TranslationKey) : "portal.accesos.error.generico";
}
