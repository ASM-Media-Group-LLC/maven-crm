// Types for the Chatter Evaluator module.
// These mirror the public.chatter_* tables (see migration
// 20260502011215_chatter_evaluator_schema.sql). When the Supabase types are
// regenerated post-merge they should supersede these, but until then we
// hand-roll them to unblock UI work.

export interface ChatterProfile {
  id: string;
  key: string;
  name: string;
  name_en: string | null;
  nationality: string | null;
  nationality_en: string | null;
  location: string | null;
  location_en: string | null;
  age: string | null;
  age_en: string | null;
  greeting: string | null;
  greeting_en: string | null;
  users_term: string | null;
  users_term_en: string | null;
  body: string | null;
  body_en: string | null;
  nudity: string | null;
  nudity_en: string | null;
  anal: string | null;
  anal_en: string | null;
  collabs: string | null;
  collabs_en: string | null;
  videocall: string | null;
  videocall_en: string | null;
  custom: string | null;
  custom_en: string | null;
  extra: string | null;
  extra_en: string | null;
  prices: Record<string, string>;
  extra_fields: Record<string, unknown>;
  avatar_url: string | null;
  avatar_x: number | null;
  avatar_y: number | null;
  avatar_zoom: number | null;
  created_at: string;
  updated_at: string;
}

export interface ChatterVaultItem {
  id: string;
  profile_id: string;
  name: string;
  url: string;
  media_type: "image" | "video" | "other";
  position: number;
  created_at: string;
}

export interface ChatterCriterion {
  id: string;
  label: string;
  label_en: string | null;
  weight: number;
  position: number;
  is_active: boolean;
  created_at: string;
}

export interface ChatterConfig {
  id: number;
  apps_script_url: string | null;
  notification_emails: string[];
  fan_name: string;
  fan_avatar_url: string;
  fan_avatar_url_light: string | null;
  updated_at: string;
}
