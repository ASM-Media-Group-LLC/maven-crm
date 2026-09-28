import type { TranslationKey } from "@/lib/i18n";
import { hrGestion } from "@/lib/i18n/hrGestion";
import { HR_ROLE_LABEL } from "./useHrPeople";

// CÓMO SE VE UN VALOR GUARDADO EN LA BASE.
//
// Las listas de lib/hrConstants.ts (tipo de contrato, modalidad, estado del
// empleado, del candidato, de la capacitación…) traen su `label` en español. El
// `value` es lo que se guarda en la base y se compara contra ella: NO se toca.
// La etiqueta se dibuja desde el diccionario, con la clave
// "hrg.opt.<grupo>.<valor>" (lib/i18n/hrGestion.ts).
//
// De las listas se usa solo el `value`, a propósito: la etiqueta sale de acá y
// no del `label`, que es texto en español y lo puede cambiar quien traduzca ese
// archivo. Si llega un valor que todavía no tiene clave, se ve el valor tal
// cual: nunca una traducción inventada.
export type GrupoHr =
  | "contract" | "modality" | "empStatus"
  | "incSeverity" | "incType" | "incCategory" | "incImpact"
  | "applStatus" | "applSource"
  | "trainStatus" | "trainModality" | "trainRole" | "trainContent"
  | "perfStatus" | "histType" | "histField" | "infraction" | "hrRole"
  | "deductionType" | "deductionStatus" | "commissionStatus"
  | "gender" | "bankAccount" | "salaryFreq" | "docType";

export type Traductor = (clave: TranslationKey, params?: Record<string, string | number>) => string;

/** La etiqueta traducida de `valor`, o `undefined` si no tiene clave. */
export function etiquetaHr(t: Traductor, grupo: GrupoHr, valor: string | null | undefined): string | undefined {
  if (valor == null || valor === "") return undefined;
  const clave = `hrg.opt.${grupo}.${valor}`;
  return clave in hrGestion ? t(clave as TranslationKey) : undefined;
}

/** Igual que `etiquetaHr`, pero sin clave devuelve el valor (o "—" si no hay). */
export function etiquetaHrO(t: Traductor, grupo: GrupoHr, valor: string | null | undefined): string {
  return etiquetaHr(t, grupo, valor) ?? (valor || "—");
}

/** El rol de una persona (user_roles.role) como se lee: los que se escriben
 *  distinto en inglés salen del diccionario; el resto, de HR_ROLE_LABEL. */
export function rolHr(t: Traductor, rol: string | null | undefined): string {
  if (!rol) return "—";
  return etiquetaHr(t, "hrRole", rol) ?? HR_ROLE_LABEL[rol] ?? rol;
}
