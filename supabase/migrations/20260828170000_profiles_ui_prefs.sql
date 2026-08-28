-- Apariencia avanzada (Settings → Mi cuenta → Apariencia): preferencias de
-- UI del usuario que acompañan a ui_skin. jsonb con forma
--   { "oled": bool, "contrast": bool, "customHue": number|null,
--     "seasonalOptOut": bool }
--   · oled           = negro puro en tema oscuro (data-oled)
--   · contrast       = alto contraste (data-contrast="high")
--   · customHue      = hue 0-360 del skin Personalizado (null = no usa)
--   · seasonalOptOut = true si eligió quedarse con su skin en temporadas
-- Mismo patrón que ui_skin: localStorage manda pre-red, esto sincroniza
-- cross-device; NULL = defaults (todo apagado). jsonb libre a propósito:
-- sumar una preferencia nueva no debe requerir migración — el frontend
-- valida con sanitizeUiPrefs (hooks/useSkin.ts) y descarta lo desconocido.
-- La policy existente "Users can update own profile" (auth.uid() = id) ya
-- cubre la escritura; no hace falta RLS nueva.
alter table public.profiles
  add column if not exists ui_prefs jsonb;

comment on column public.profiles.ui_prefs is
  'Preferencias de apariencia de la UI (Settings → Apariencia): {oled, contrast, customHue, seasonalOptOut}. NULL = defaults.';
