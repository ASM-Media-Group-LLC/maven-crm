// storyEvidence — helpers para reconstruir la galería de evidencia de Promolog.
//
// Contexto: el bot Promolog crea 1 `promolog_entry` POR story (con su propia
// imagen, veredicto promovió/no, confianza y razonamiento). La tabla deduplica
// esas entries (1 fila por creador+día+resultado) para no inundar el listado,
// pero eso esconde el resto de las historias. En el modal de detalle queremos
// lo contrario: ver TODAS las historias del día con su veredicto, que es lo
// que un manager necesita para validar ("subió 10, ninguna promocionó → acá
// están las 10"; "promocionó → acá están las que sí").
//
// Estas funciones son puras (sin React) para poder testearlas aislado.

import type { PromologEntry } from "./PromologEntryCard";

// Devuelve TODAS las stories analizadas por la IA que pertenecen al mismo
// creador + día que `entry`, ordenadas por story_index (slide 0,1,2…).
//
// Reglas:
//  · Solo aplica a entries del bot (analyzed_by_ai). Las manuales del chatter
//    son 1-por-promo con su propio screenshot subido → se muestran solas, no
//    como galería.
//  · Dedupe por story_index (un re-run del webhook el mismo día podría duplicar
//    una story): se conserva la que tenga evidencia; si ninguna tiene, la
//    primera en orden.
//  · Las entries sin story_index (legacy o la entry "sin stories del día") se
//    devuelven al final, preservando el orden por id.
export function collectDayStories(
  allEntries: PromologEntry[],
  entry: PromologEntry | null | undefined,
): PromologEntry[] {
  if (!entry || !entry.analyzed_by_ai || entry.creator_id == null) return [];

  // Agrupamos por SCAN (apify_run_id), NO por la fecha de la story. Cada story
  // trae su propia fecha de posteo (un highlight puede ser de hace meses), así
  // que agrupar por `date` partía la galería en grupos de 1 → solo se veía 1
  // foto. Todas las stories de un mismo run de Apify = una galería. Fallback a
  // `date` para entries legacy/manuales sin apify_run_id.
  const sameScan = allEntries.filter(
    (e) =>
      e.analyzed_by_ai === true &&
      e.creator_id != null &&
      e.creator_id === entry.creator_id &&
      (entry.apify_run_id
        ? e.apify_run_id === entry.apify_run_id
        : e.date === entry.date),
  );

  const sorted = sameScan.slice().sort((a, b) => {
    const ai = a.story_index ?? Number.MAX_SAFE_INTEGER;
    const bi = b.story_index ?? Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return (a.id || "").localeCompare(b.id || "");
  });

  // Dedupe por story_index, preservando orden de inserción (= orden ordenado).
  const byIndex = new Map<number, PromologEntry>();
  const noIndex: PromologEntry[] = [];
  for (const e of sorted) {
    if (e.story_index == null) {
      noIndex.push(e);
      continue;
    }
    const prev = byIndex.get(e.story_index);
    if (!prev) byIndex.set(e.story_index, e);
    else if (!prev.evidence_url && e.evidence_url) byIndex.set(e.story_index, e);
  }

  return [...byIndex.values(), ...noIndex];
}

export interface StoryGallerySummary {
  total: number;
  promoted: number;
  notPromoted: number;
}

// Cuenta cuántas de las stories promocionaron vs no. Usado para el encabezado
// de la galería ("10 historias · 3 promovió · 7 no").
export function summarizeStories(stories: PromologEntry[]): StoryGallerySummary {
  let promoted = 0;
  let notPromoted = 0;
  for (const s of stories) {
    if (s.result === "Sí") promoted++;
    else if (s.result === "No") notPromoted++;
  }
  return { total: stories.length, promoted, notPromoted };
}

// ¿Debe mostrarse la galería de stories (en vez de la imagen única)?
// Sí cuando la entry es del bot y hay más de una story ese día.
export function shouldShowGallery(dayStories: PromologEntry[]): boolean {
  return dayStories.length > 1;
}
