import type { ReactNode } from "react";
import { getTranslation, type TranslationKey } from "@/lib/i18n";

// Lo que las pantallas de Creadoras comparten para hablar en los dos idiomas.
//
// ⚠️ EL STATUS ES DATO. `creators.status` se guarda, se filtra y se compara con
// estos valores tal cual ("active", "pendiente_verificacion"…): acá solo se elige
// la ETIQUETA que se muestra. Antes cada pantalla tenía su propia copia del mapa
// en español (tabla, tarjetas, ficha, popup, info).
const CLAVE_ESTADO: Record<string, TranslationKey> = {
  active: "common.activeF",
  onboarding: "creadores.status.onboarding",
  leaving: "creadores.status.leaving",
  terminated: "creadores.status.terminated",
  paused: "creadores.status.paused",
  pendiente: "common.pending",
  pendiente_verificacion: "creadores.status.pendingVerification",
  borrador: "creadores.status.draft",
};

type T = (key: TranslationKey, params?: Record<string, string | number>) => string;

// Los idiomas se GUARDAN con su propio nombre ("Español", "Português"): ese valor no
// se toca. En pantalla se muestran en el idioma de la interfaz.
const CLAVE_IDIOMA: Record<string, TranslationKey> = {
  "Español": "creadores.lang.es",
  English: "creadores.lang.en",
  Italiano: "creadores.lang.it",
  "Português": "creadores.lang.pt",
  "Français": "creadores.lang.fr",
  Deutsch: "creadores.lang.de",
  "Русский": "creadores.lang.ru",
};

/** El nombre de un idioma guardado, en el idioma de la interfaz. */
export function etiquetaIdioma(t: T, idioma: string): string {
  const clave = CLAVE_IDIOMA[idioma];
  return clave ? t(clave) : idioma;
}

/** La etiqueta del status de una creadora; un valor desconocido se muestra tal cual. */
export function etiquetaEstado(t: T, status: string | null | undefined): string {
  if (!status) return "—";
  const clave = CLAVE_ESTADO[status];
  return clave ? t(clave) : status;
}

/** La etiqueta EN ESPAÑOL, sea cual sea el idioma de quien hace el cambio: para lo
 *  que se GUARDA (creator_history, creator_notes) y después leen otras personas. */
export function etiquetaEstadoGuardada(status: string | null | undefined): string {
  return etiquetaEstado((k, p) => getTranslation(k, "es", p), status);
}

/** Un texto traducido con `{name}` adentro, con el nombre en negrita. Se llama con
 *  `t("clave")` SIN parámetros, para que el `{name}` llegue entero. */
export function conNombre(texto: string, nombre: ReactNode): ReactNode {
  const i = texto.indexOf("{name}");
  if (i < 0) return texto;
  return (
    <>
      {texto.slice(0, i)}
      <strong>{nombre}</strong>
      {texto.slice(i + "{name}".length)}
    </>
  );
}
