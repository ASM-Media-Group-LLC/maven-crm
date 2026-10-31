import type { FaceState } from "@/hooks/useFaceWatch";
import type { TranslationKey } from "@/lib/i18n";

// Catálogo ÚNICO de las faltas del monitor de cámara de Cowork. Vive aparte para
// que el navegador (useMonitorCamara), el panel de RRHH (HRMonitorIA) y el edge
// (monitor-vision) hablen de los MISMOS slugs, y para que una guarda verifique
// que cada slug tiene su etiqueta traducida. Si se agrega un tipo, se agrega acá
// y en el edge; el test avisa si algo quedó sin etiqueta.

export type FaltaTipo =
  | "camara_apagada"
  | "camara_tapada"
  | "se_fue"
  | "cara_incompleta"
  | "celular"
  | "distraido"
  | "no_mira";

export const TIPOS_FALTA: readonly FaltaTipo[] = [
  "camara_apagada",
  "camara_tapada",
  "se_fue",
  "cara_incompleta",
  "celular",
  "distraido",
  "no_mira",
];

// Faltas GRATIS: las saca el detector de cara del navegador (useFaceWatch). El
// estado "ok"/"unavailable" no es falta. Las demás (celular/distraido/no_mira)
// las juzga la IA en el edge monitor-vision.
export const TIPO_POR_CARA: Partial<Record<FaceState, FaltaTipo>> = {
  cam_off: "camara_apagada",
  too_dark: "camara_tapada",
  no_face: "se_fue",
  too_small: "cara_incompleta",
};

// Las que produce la IA (deben coincidir con faltaDe() del edge monitor-vision).
export const TIPOS_IA: readonly FaltaTipo[] = ["celular", "distraido", "no_mira"];

export const LABEL_FALTA: Record<FaltaTipo, TranslationKey> = {
  camara_apagada: "hr.monia.tipo.camApagada",
  camara_tapada: "hr.monia.tipo.camTapada",
  se_fue: "hr.monia.tipo.seFue",
  cara_incompleta: "hr.monia.tipo.caraIncompleta",
  celular: "hr.monia.tipo.celular",
  distraido: "hr.monia.tipo.distraido",
  no_mira: "hr.monia.tipo.noMira",
};
