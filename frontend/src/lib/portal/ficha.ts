import type { TranslationKey } from "@/lib/i18n";

// LA FICHA QUE EDITA LA CREADORA DESDE EL PORTAL: 22 columnas de creators, las de
// «Operaciones» que son suyas (su personaje, lo que jamás haría y cómo responder
// si pasa algo). NO entran precios, usuarios VIP ni la estrategia de recuperación:
// eso es de la agencia.
//
// La lista de verdad está en la base, portal_campos_ficha()
// (supabase/migrations/20261006100000_portal_creadoras_cuentas.sql): solo esas
// columnas se leen y se guardan desde el portal. Esta es su copia para dibujar;
// test/portal/fichaDelPortal.test.ts falla si se separan.
export const CAMPOS_FICHA = [
  // Mi personaje
  "tono_voz", "tono_emocional", "como_quieres_que_te_llamen", "emoji_frecuente",
  "personalidad_marca", "terminos_afecto", "frases_venta", "apodos_permitidos",
  "palabras_prohibidas", "hobbies", "mascotas_nombres", "comida_favorita",
  // Jamás haría
  "contenido_jamas_haria", "restricciones_seguridad",
  // Si pasa esto…
  "respuesta_sexo_en_persona", "respuesta_usuario_grosero", "respuesta_pedir_desnudos",
  "respuesta_cuanto_cobra_encuentro", "respuesta_muestra_intimas",
  "estrategia_material_gratis", "estrategia_problemas_personales", "estrategia_rechazo",
] as const;

export type CampoFicha = typeof CAMPOS_FICHA[number];
export type Ficha = Record<CampoFicha, string | null>;

export const esCampoFicha = (x: string): x is CampoFicha => (CAMPOS_FICHA as readonly string[]).includes(x);

/** Cómo se escribe cada respuesta. */
export type Control =
  | "texto"     // una línea
  | "parrafo"   // varias líneas
  | "etiquetas" // una lista: se guarda «a, b, c», como la lee Operaciones (parseCsv)
  | "tono";     // las opciones del onboarding, u otra escrita a mano

export interface DefCampo {
  clave: CampoFicha;
  control: Control;
  pregunta: TranslationKey;
  ayuda?: TranslationKey;
  ejemplo?: TranslationKey;
}

export type IdSeccion = "personaje" | "limites" | "situaciones";

export interface Seccion {
  id: IdSeccion;
  titulo: TranslationKey;
  descripcion: TranslationKey;
  campos: DefCampo[];
}

const situacion = (clave: CampoFicha, ejemplo?: TranslationKey): DefCampo => ({
  clave,
  control: "parrafo",
  pregunta: `portal.campo.${clave}` as TranslationKey,
  ayuda: "portal.ficha.situacionAyuda",
  ejemplo,
});

export const SECCIONES: Seccion[] = [
  {
    id: "personaje",
    titulo: "portal.ficha.seccion.personaje",
    descripcion: "portal.ficha.seccion.personajeTexto",
    campos: [
      { clave: "tono_voz", control: "tono", pregunta: "portal.campo.tono_voz", ayuda: "portal.campo.tono_voz.ayuda" },
      { clave: "tono_emocional", control: "texto", pregunta: "portal.campo.tono_emocional", ejemplo: "portal.campo.tono_emocional.ejemplo" },
      { clave: "como_quieres_que_te_llamen", control: "texto", pregunta: "portal.campo.como_quieres_que_te_llamen", ejemplo: "portal.campo.como_quieres_que_te_llamen.ejemplo" },
      { clave: "personalidad_marca", control: "parrafo", pregunta: "portal.campo.personalidad_marca", ejemplo: "portal.campo.personalidad_marca.ejemplo" },
      { clave: "emoji_frecuente", control: "texto", pregunta: "portal.campo.emoji_frecuente" },
      { clave: "terminos_afecto", control: "texto", pregunta: "portal.campo.terminos_afecto", ejemplo: "portal.campo.terminos_afecto.ejemplo" },
      { clave: "apodos_permitidos", control: "etiquetas", pregunta: "portal.campo.apodos_permitidos" },
      { clave: "palabras_prohibidas", control: "etiquetas", pregunta: "portal.campo.palabras_prohibidas" },
      { clave: "frases_venta", control: "parrafo", pregunta: "portal.campo.frases_venta", ayuda: "portal.campo.frases_venta.ayuda" },
      { clave: "hobbies", control: "parrafo", pregunta: "portal.campo.hobbies", ejemplo: "portal.campo.hobbies.ejemplo" },
      { clave: "mascotas_nombres", control: "texto", pregunta: "portal.campo.mascotas_nombres" },
      { clave: "comida_favorita", control: "texto", pregunta: "portal.campo.comida_favorita" },
    ],
  },
  {
    id: "limites",
    titulo: "portal.ficha.seccion.limites",
    descripcion: "portal.ficha.seccion.limitesTexto",
    campos: [
      { clave: "contenido_jamas_haria", control: "parrafo", pregunta: "portal.campo.contenido_jamas_haria", ayuda: "portal.campo.contenido_jamas_haria.ayuda" },
      { clave: "restricciones_seguridad", control: "parrafo", pregunta: "portal.campo.restricciones_seguridad", ejemplo: "portal.campo.restricciones_seguridad.ejemplo" },
    ],
  },
  {
    id: "situaciones",
    titulo: "portal.ficha.seccion.situaciones",
    descripcion: "portal.ficha.seccion.situacionesTexto",
    campos: [
      situacion("respuesta_sexo_en_persona"),
      situacion("respuesta_usuario_grosero"),
      situacion("respuesta_pedir_desnudos"),
      situacion("respuesta_cuanto_cobra_encuentro"),
      situacion("respuesta_muestra_intimas"),
      situacion("estrategia_material_gratis"),
      situacion("estrategia_problemas_personales"),
      { clave: "estrategia_rechazo", control: "parrafo", pregunta: "portal.campo.estrategia_rechazo", ejemplo: "portal.campo.estrategia_rechazo.ejemplo" },
    ],
  },
];

/** Las opciones de tono del onboarding (Step4WorkConfig). El VALOR se guarda en
 *  español, como siempre: la etiqueta la traduce etiquetaTono (etiquetasCreadora). */
export const TONOS: { valor: string; etiqueta: TranslationKey }[] = [
  { valor: "Dulce", etiqueta: "creadores.tone.sweet" },
  { valor: "Picante", etiqueta: "creadores.tone.spicy" },
  { valor: "Dominante", etiqueta: "creadores.tone.dominant" },
  { valor: "Tierna", etiqueta: "creadores.tone.tender" },
  { valor: "Directa", etiqueta: "creadores.tone.direct" },
  { valor: "Juguetona", etiqueta: "creadores.tone.playful" },
];

/** Cómo la agencia llama a cada columna (en el historial del perfil): las
 *  etiquetas de Operaciones, para que el historial use los mismos nombres. */
export const ETIQUETA_AGENCIA: Record<CampoFicha, TranslationKey> = {
  tono_voz: "cr.toneOfVoice",
  tono_emocional: "creadores.ops.emotionalTone",
  como_quieres_que_te_llamen: "creadores.ops.whatToCallHer",
  emoji_frecuente: "creadores.ops.frequentEmojis",
  personalidad_marca: "creadores.ops.brandPersonality",
  terminos_afecto: "creadores.ops.affectionTerms",
  frases_venta: "creadores.ops.salesLines",
  apodos_permitidos: "creadores.ops.allowedNicknames",
  palabras_prohibidas: "creadores.ops.bannedWords",
  hobbies: "creadores.ops.hobbies",
  mascotas_nombres: "creadores.ops.pets",
  comida_favorita: "creadores.ops.favoriteFood",
  contenido_jamas_haria: "portal.etiqueta.jamasHaria",
  restricciones_seguridad: "creadores.ops.safetyRestrictions",
  respuesta_sexo_en_persona: "creadores.ops.crisisMeetInPerson",
  respuesta_usuario_grosero: "creadores.ops.crisisRude",
  respuesta_pedir_desnudos: "creadores.ops.crisisFreeMaterial",
  respuesta_cuanto_cobra_encuentro: "creadores.ops.crisisMeetPrice",
  respuesta_muestra_intimas: "creadores.ops.crisisIntimate",
  estrategia_material_gratis: "creadores.ops.crisisFreeStrategy",
  estrategia_problemas_personales: "creadores.ops.crisisPersonal",
  estrategia_rechazo: "creadores.ops.crisisRejection",
};

/** Una respuesta cuenta como hecha si tiene algo escrito. */
export const tieneRespuesta = (v: string | null | undefined) => !!v && v.trim().length > 0;

export function respondidas(ficha: Partial<Ficha> | null | undefined, campos: readonly CampoFicha[] = CAMPOS_FICHA): number {
  if (!ficha) return 0;
  return campos.filter((c) => tieneRespuesta(ficha[c])).length;
}

/** «a, b, c» → ["a", "b", "c"] (igual que parseCsv de Operaciones). */
export function etiquetasDe(valor: string | null | undefined): string[] {
  if (!valor) return [];
  return valor.split(",").map((s) => s.trim()).filter(Boolean);
}

/** ["a", "b"] → «a, b»; sin repetidas (sin distinguir mayúsculas). */
export function textoDeEtiquetas(lista: string[]): string {
  const vistas = new Set<string>();
  const limpias: string[] = [];
  for (const x of lista) {
    const v = x.replace(/,/g, " ").trim();
    if (!v || vistas.has(v.toLowerCase())) continue;
    vistas.add(v.toLowerCase());
    limpias.push(v);
  }
  return limpias.join(", ");
}

/** Lo que cambió respecto de lo guardado (recortado; vacío = null). */
export function cambiosDe(guardada: Ficha, borrador: Partial<Record<CampoFicha, string>>): Partial<Record<CampoFicha, string>> {
  const cambios: Partial<Record<CampoFicha, string>> = {};
  for (const [k, v] of Object.entries(borrador) as [CampoFicha, string][]) {
    const nuevo = (v ?? "").trim();
    const antes = (guardada[k] ?? "").trim();
    if (nuevo !== antes) cambios[k] = nuevo;
  }
  return cambios;
}
