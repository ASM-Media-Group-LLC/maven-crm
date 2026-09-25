// El nombre de una plantilla de fondo, en el idioma de quien mira.
//
// Las plantillas viven en `@/lib/fondoDeLlamada` con su `label` en español, y
// su `id` ("tpl-office") es lo que se GUARDA como preferencia: eso no se toca.
// Acá solo se elige cómo se LEE el nombre. Si mañana aparece una plantilla sin
// clave, se ve su label de siempre en vez de un hueco.
import type { TranslationKey } from "@/lib/i18n";
import type { Traductor } from "../preview";

const NOMBRE: Record<string, TranslationKey> = {
  "tpl-office": "messenger.bg.tplOficina",
  "tpl-bookshelf": "messenger.bg.tplBiblioteca",
  "tpl-beach": "messenger.bg.tplPlaya",
  "tpl-mountains": "messenger.bg.tplMontanas",
  "tpl-cafe": "messenger.bg.tplCafe",
  "tpl-livingroom": "messenger.bg.tplSala",
  "tpl-forest": "messenger.bg.tplBosque",
  "tpl-abstract": "messenger.bg.tplAbstracto",
};

export function nombreDelFondo(tpl: { id: string; label: string }, t: Traductor): string {
  const clave = NOMBRE[tpl.id];
  return clave ? t(clave) : tpl.label;
}
