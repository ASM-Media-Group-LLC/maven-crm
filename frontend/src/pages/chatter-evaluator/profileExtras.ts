import type { ChatterProfile } from "./types";

// Both the profile editor and the public/examiner panel need to agree on
// where "user-defined" extras live. We stash them inside the profile's
// `extra_fields` JSONB column under reserved keys (prefixed `__`).
//
// Legacy imports from Roleplaychatters left arbitrary loose
// key/value pairs in `extra_fields` (e.g. `fetiches` + `fetiches_en`).
// We surface those automatically as custom sections so the user sees
// them as proper editable cards instead of a raw JSON dump, and on the
// next save we strip the loose keys so the storage shape converges.

const KEY_LABELS = "__labelOverrides";
const KEY_SECTIONS = "__customSections";

export interface LabelOverride {
  es: string;
  en: string;
}

export type LabelOverrides = Record<string, LabelOverride>;

export interface CustomSection {
  id: string;
  title: string;
  title_en: string;
  value: string;
  value_en: string;
}

export const getLabelOverrides = (profile: ChatterProfile | null | undefined): LabelOverrides => {
  const raw = profile?.extra_fields?.[KEY_LABELS];
  if (!raw || typeof raw !== "object") return {};
  return raw as LabelOverrides;
};

const titleCase = (s: string) =>
  s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

const englishTitleCase = (s: string) =>
  s.replace(/_en$/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();

/** Convert legacy loose key/value pairs in `extra_fields` (left over from
 * the Roleplaychatters import) into custom sections. Pairs `foo` with
 * `foo_en` when both exist; otherwise treats the lone key as ES. */
const legacyFieldsToSections = (
  extra: Record<string, unknown>,
): CustomSection[] => {
  const sections: CustomSection[] = [];
  const handled = new Set<string>();

  for (const key of Object.keys(extra)) {
    if (key.startsWith("__")) continue;          // reserved (our own keys)
    if (handled.has(key)) continue;

    const isEn = key.endsWith("_en");
    const baseKey = isEn ? key.slice(0, -3) : key;
    const enKey = `${baseKey}_en`;

    // Skip if base key exists — we'll process it (and pull this _en in)
    // when we hit the base.
    if (isEn && Object.prototype.hasOwnProperty.call(extra, baseKey)) {
      continue;
    }

    handled.add(baseKey);
    handled.add(enKey);

    const esVal = extra[baseKey];
    const enVal = extra[enKey];

    sections.push({
      id: `legacy:${baseKey}`,
      title: titleCase(baseKey),
      title_en: englishTitleCase(baseKey),
      value: typeof esVal === "string" ? esVal : esVal == null ? "" : String(esVal),
      value_en: typeof enVal === "string" ? enVal : enVal == null ? "" : String(enVal),
    });
  }

  return sections;
};

export const getCustomSections = (profile: ChatterProfile | null | undefined): CustomSection[] => {
  const extra = profile?.extra_fields ?? {};
  const raw = extra[KEY_SECTIONS];
  const explicit = Array.isArray(raw)
    ? raw.filter(
        (s): s is CustomSection =>
          !!s && typeof s === "object" && typeof s.id === "string",
      )
    : [];

  // Skip legacy migration for any title already represented in the
  // explicit list (case-insensitive) so the user can't see duplicates
  // after one save round-trip.
  const knownTitles = new Set(
    explicit.flatMap((s) => [s.title?.toLowerCase(), s.title_en?.toLowerCase()].filter(Boolean)),
  );
  const legacy = legacyFieldsToSections(extra).filter(
    (s) => !knownTitles.has(s.title.toLowerCase()) && !knownTitles.has(s.title_en.toLowerCase()),
  );

  return [...explicit, ...legacy];
};

/** Build the value to write back into `extra_fields` from current state.
 * Drops legacy loose keys so the storage shape converges to just the
 * reserved __* keys, and our custom sections become the source of truth. */
export const mergeExtras = (
  base: Record<string, unknown> | null | undefined,
  labelOverrides: LabelOverrides,
  customSections: CustomSection[],
): Record<string, unknown> => {
  const next: Record<string, unknown> = {};
  // Preserve only reserved (`__*`) keys from the base — drop the legacy
  // loose keys (fetiches, dick_rating, …) since they're now stored
  // inside __customSections instead.
  for (const [k, v] of Object.entries(base ?? {})) {
    if (k.startsWith("__")) next[k] = v;
  }

  const cleanLabels: LabelOverrides = {};
  for (const [k, v] of Object.entries(labelOverrides)) {
    if (v && (v.es?.trim() || v.en?.trim())) cleanLabels[k] = v;
  }
  if (Object.keys(cleanLabels).length > 0) next[KEY_LABELS] = cleanLabels;
  else delete next[KEY_LABELS];

  const cleanSections = customSections.filter(
    (s) => s.title?.trim() || s.title_en?.trim() || s.value?.trim() || s.value_en?.trim(),
  );
  if (cleanSections.length > 0) next[KEY_SECTIONS] = cleanSections;
  else delete next[KEY_SECTIONS];

  return next;
};

/** Resolve the label to use for a given field+language, with fallback. */
export const resolveLabel = (
  overrides: LabelOverrides,
  fieldKey: string,
  lang: "es" | "en",
  fallbackEs: string,
  fallbackEn: string,
): string => {
  const ov = overrides[fieldKey];
  if (lang === "en") return ov?.en?.trim() || fallbackEn;
  return ov?.es?.trim() || fallbackEs;
};
