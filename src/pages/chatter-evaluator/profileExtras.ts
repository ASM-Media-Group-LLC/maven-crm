import type { ChatterProfile } from "./types";

// Both the profile editor and the public/examiner panel need to agree on
// where "user-defined" extras live. We stash them inside the profile's
// `extra_fields` JSONB column under reserved keys (prefixed `__`) so the
// debug "Campos adicionales" view in ProfileDetailContent skips them.

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

export const getCustomSections = (profile: ChatterProfile | null | undefined): CustomSection[] => {
  const raw = profile?.extra_fields?.[KEY_SECTIONS];
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (s): s is CustomSection =>
      !!s && typeof s === "object" && typeof s.id === "string"
  );
};

/** Build the value to write back into `extra_fields` from current state.
 * Preserves any other keys already present (legacy import metadata, etc). */
export const mergeExtras = (
  base: Record<string, unknown> | null | undefined,
  labelOverrides: LabelOverrides,
  customSections: CustomSection[],
): Record<string, unknown> => {
  const next: Record<string, unknown> = { ...(base ?? {}) };
  // Drop empty entries so we don't bloat the JSON
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
