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

// Devuelve TODAS las fotos/stories del día que pertenecen al mismo `entry`,
// ordenadas por story_index (slide 0,1,2…), tanto del BOT como MANUALES — así el
// popup de detalle muestra la MISMA galería para los dos (antes las manuales caían
// a una "foto única" suelta y se veían distinto que las del bot).
//
// Agrupación (sin mezclar fuentes, para no colisionar story_index):
//  · BOT (tiene apify_run_id): por SCAN (apify_run_id), NO por fecha. Cada story
//    trae su propia fecha de posteo (un highlight puede ser de hace meses), así
//    que agrupar por `date` partía la galería en grupos de 1. Dedupe por
//    story_index (un re-run del webhook puede duplicar una story): se conserva la
//    que tiene evidencia. Entries sin story_index → al final.
//  · MANUAL (sin apify_run_id): misma creadora + mismo día, solo filas CON foto.
//    Cada foto es una fila propia (no hay re-runs que dupliquen índice) → se
//    devuelven todas, sin dedup. Sin foto → [] (no hay galería que mostrar).
export function collectDayStories(
  allEntries: PromologEntry[],
  entry: PromologEntry | null | undefined,
): PromologEntry[] {
  if (!entry || entry.creator_id == null) return [];

  const isManual = !entry.apify_run_id;
  const sameScan = allEntries.filter((e) =>
    e.creator_id != null &&
    e.creator_id === entry.creator_id &&
    (isManual
      ? !e.apify_run_id && e.date === entry.date && !!e.evidence_url
      : e.apify_run_id === entry.apify_run_id),
  );

  const sorted = sameScan.slice().sort((a, b) => {
    const ai = a.story_index ?? Number.MAX_SAFE_INTEGER;
    const bi = b.story_index ?? Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return (a.id || "").localeCompare(b.id || "");
  });

  // Manual: cada foto es una fila propia → todas. Bot: dedupe por story_index.
  if (isManual) return sorted;

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
