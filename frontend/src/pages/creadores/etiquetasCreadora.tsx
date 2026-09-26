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

// Tono de voz, personalidad de marca, estrategia de rechazo y plataforma de
// videollamada: los selects del onboarding GUARDAN el valor en español ("Dulce",
// "Rechazo suave", "Otro") y ese valor no se toca. Pero en la ficha son campos de
// texto libre: lo que no es una de estas opciones se muestra tal cual.
export const CLAVE_TONO: Record<string, TranslationKey> = {
  Dulce: "creadores.tone.sweet",
  Picante: "creadores.tone.spicy",
  Dominante: "creadores.tone.dominant",
  Tierna: "creadores.tone.tender",
  Directa: "creadores.tone.direct",
  Juguetona: "creadores.tone.playful",
};
const CLAVE_RECHAZO: Record<string, TranslationKey> = {
  Humor: "creadores.step4.rejHumor",
  Firmeza: "creadores.step4.rejFirm",
  "Rechazo suave": "creadores.step4.rejSoft",
};
// Telegram, WhatsApp, Zoom y Skype son nombres propios: solo "Otro" se traduce.
const CLAVE_PLATAFORMA: Record<string, TranslationKey> = {
  Otro: "cr.offCatOther",
};

/** La etiqueta de una opción guardada, si lo es (sin distinguir mayúsculas ni
 *  espacios de los bordes); si no, el texto tal cual lo escribieron. */
function etiquetaDeOpcion(mapa: Record<string, TranslationKey>, t: T, valor: string): string {
  const buscado = valor.trim().toLowerCase();
  const clave = Object.entries(mapa).find(([guardado]) => guardado.toLowerCase() === buscado)?.[1];
  return clave ? t(clave) : valor;
}

/** Tono de voz o personalidad de marca (comparten las opciones). */
export const etiquetaTono = (t: T, valor: string) => etiquetaDeOpcion(CLAVE_TONO, t, valor);
export const etiquetaRechazo = (t: T, valor: string) => etiquetaDeOpcion(CLAVE_RECHAZO, t, valor);
export const etiquetaPlataformaVideollamada = (t: T, valor: string) => etiquetaDeOpcion(CLAVE_PLATAFORMA, t, valor);

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
