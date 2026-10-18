import { useCallback, useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage, useIdiomaDelPerfil, reescribirUiPrefs, type UiPrefsGuardadas } from "@/hooks/useLanguage";
import { useSaveSkin } from "@/hooks/useUserProfile";
import { aaLightnessForHue, CUSTOM_SKIN_SATURATION } from "@/lib/wcag";
import type { TranslationKey } from "@/lib/i18n";
import { conEtiqueta } from "@/lib/etiquetaTraducida";

// Skins de Maven — presets de ACENTO por usuario (Settings → Mi cuenta →
// Apariencia). Un skin solo cambia primary/accent/ring/sidebar-primary/
// sidebar-ring vía data-skin en <html> (los bloques viven en index.css);
// fondos, cards y charts no se tocan. La elección se persiste en dos capas:
//   - localStorage (aplicación instantánea al cargar, manda mientras no
//     llega la red),
//   - profiles.ui_skin (el skin te sigue en cualquier dispositivo; al
//     resolver la sesión, el perfil gana si difiere — ver useSkinSync).

export type SkinId =
  | "maven"
  | "atardecer"
  | "esmeralda"
  | "orquidea"
  | "medianoche"
  | "dorado"
  | "kash"
  | "diva"
  | "unlimited"
  | "unlok";

export interface SkinDef {
  id: SkinId;
  /** Clave del nombre del skin: la pantalla hace t(s.labelKey). */
  labelKey: TranslationKey;
  /** El nombre, traducido al leerlo (ver lib/etiquetaTraducida.ts). */
  readonly label: string;
  /** Colores LITERALES del preset para pintar su swatch en el picker (no
      pueden ser var(--primary): esas vars reflejan el skin ACTIVO). Deben
      quedar sincronizados con los bloques [data-skin] de index.css. */
  primary: string;
  accent: string;
  /** "linea" = skin de línea de negocio (Unlimited/Unlok): en el picker van
      después del separador "Líneas". Sin group = preset base. */
  group?: "linea";
}

const definirSkin = (def: Omit<SkinDef, "labelKey" | "label">, labelKey: TranslationKey): SkinDef =>
  conEtiqueta(def, labelKey);

export const SKINS: SkinDef[] = [
  definirSkin({ id: "maven", primary: "hsl(262 78% 56%)", accent: "hsl(268 74% 54%)" }, "int.skin.maven"),
  definirSkin({ id: "atardecer", primary: "hsl(25 95% 39%)", accent: "hsl(340 82% 59%)" }, "int.skin.atardecer"),
  definirSkin({ id: "esmeralda", primary: "hsl(160 84% 28%)", accent: "hsl(190 90% 45%)" }, "int.skin.esmeralda"),
  definirSkin({ id: "orquidea", primary: "hsl(290 84% 49%)", accent: "hsl(320 85% 55%)" }, "int.skin.orquidea"),
  definirSkin({ id: "medianoche", primary: "hsl(217 91% 53%)", accent: "hsl(217 91% 53%)" }, "int.skin.medianoche"),
  definirSkin({ id: "dorado", primary: "hsl(43 80% 30%)", accent: "hsl(30 85% 45%)" }, "int.skin.dorado"),
  definirSkin({ id: "kash", primary: "hsl(350 80% 42%)", accent: "hsl(15 90% 50%)" }, "int.skin.kash"),
  definirSkin({ id: "diva", primary: "hsl(330 85% 48%)", accent: "hsl(350 90% 60%)" }, "int.skin.diva"),
  // Líneas de negocio — van después del separador "Líneas" del picker
  // (Kash ya tiene su preset propio arriba, "Rojo Kash").
  definirSkin({ id: "unlimited", primary: "hsl(150 56% 33%)", accent: "hsl(190 90% 45%)", group: "linea" }, "int.skin.unlimited"),
  definirSkin({ id: "unlok", primary: "hsl(211 100% 45%)", accent: "hsl(199 90% 48%)", group: "linea" }, "int.skin.unlok"),
];

const STORAGE_KEY = "maven-skin";

export const isSkinId = (value: unknown): value is SkinId =>
  SKINS.some((s) => s.id === value);

// Setea/limpia data-skin en <html>. maven = sin atributo (los tokens base de
// index.css ya son maven), cualquier otro id matchea su bloque [data-skin].
export const applySkin = (skin: SkinId) => {
  if (skin === "maven") delete document.documentElement.dataset.skin;
  else document.documentElement.dataset.skin = skin;
};

export const getStoredSkin = (): SkinId => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isSkinId(stored) ? stored : "maven";
  } catch {
    return "maven";
  }
};

const storeSkin = (skin: SkinId) => {
  try {
    localStorage.setItem(STORAGE_KEY, skin);
  } catch {
    // localStorage bloqueado (modo privado): el skin igual aplica en vivo.
  }
};

// Llamado desde main.tsx ANTES del primer render para que la app no
// parpadee con el acento default mientras React monta.
export const applyStoredSkin = () => applySkin(getStoredSkin());

/* ------------------------------------------------------------------ */
/* Preferencias de apariencia (ui_prefs) — OLED, alto contraste, tono  */
/* personalizado y opt-out de temporadas. Mismo patrón de persistencia */
/* que el skin: localStorage manda pre-red, profiles.ui_prefs (jsonb)  */
/* sincroniza cross-device (useSkinSync reconcilia al resolver sesión).*/
/* ------------------------------------------------------------------ */

// type (no interface) a propósito: los alias reciben index signature implícita
// y entran directo en el Json de profiles.ui_prefs sin doble cast.
export type UiPrefs = {
  /** Negro puro en tema oscuro (data-oled). */
  oled?: boolean;
  /** Alto contraste (data-contrast="high"). */
  contrast?: boolean;
  /** Hue 0-360 del skin Personalizado; null/ausente = sin skin custom. */
  customHue?: number | null;
  /** true = el usuario eligió quedarse con su skin durante las temporadas. */
  seasonalOptOut?: boolean;
  /** Densidad compacta: menos padding en tablas y listas (data-density). */
  density?: "compact";
};

const PREFS_KEY = "maven-ui-prefs";
// storePrefs lo dispara para que TODOS los useUiPrefs montados (card de
// Settings, toast de temporada) vean el cambio sin prop-drilling.
const PREFS_EVENT = "maven-ui-prefs-changed";
// Marker "ya mostré el toast de esta temporada" (ej: "halloween-2026").
const SEASON_TOAST_KEY = "maven-season-toast";

// Acepta cualquier cosa (jsonb remoto, localStorage viejo) y devuelve solo
// las claves válidas con el tipo correcto — lo demás se descarta.
export const sanitizeUiPrefs = (raw: unknown): UiPrefs => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const prefs: UiPrefs = {};
  if (typeof o.oled === "boolean") prefs.oled = o.oled;
  if (typeof o.contrast === "boolean") prefs.contrast = o.contrast;
  if (typeof o.customHue === "number" && Number.isFinite(o.customHue)) {
    prefs.customHue = Math.min(360, Math.max(0, Math.round(o.customHue)));
  }
  if (typeof o.seasonalOptOut === "boolean") prefs.seasonalOptOut = o.seasonalOptOut;
  if (o.density === "compact") prefs.density = "compact";
  return prefs;
};

export const getStoredPrefs = (): UiPrefs => {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? sanitizeUiPrefs(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
};

const storePrefs = (prefs: UiPrefs) => {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage bloqueado: las prefs igual aplican en vivo.
  }
  window.dispatchEvent(new Event(PREFS_EVENT));
};

// Las claves de ui_prefs que son de la apariencia. Record con TODAS las de
// UiPrefs a propósito: si sumás una preferencia y no la anotás acá, no compila.
// Sin eso, apagarla no la borraría del perfil (ver guardarAparienciaEnPerfil).
const CLAVES_DE_APARIENCIA: Record<keyof UiPrefs, true> = {
  oled: true,
  contrast: true,
  customHue: true,
  seasonalOptOut: true,
  density: true,
};

// Persiste la apariencia en profiles.ui_prefs SIN pisar lo que no es suyo: el
// mismo jsonb guarda el idioma (hooks/useLanguage.tsx). Hasta acá se escribía
// la columna entera con las prefs de apariencia (saveUiPrefsRemote, en
// useUserProfile.ts): con el idioma adentro, tocar el modo OLED lo borraba.
//
// Reemplaza las claves de apariencia en bloque (no las mezcla una por una):
// apagar la densidad compacta la saca del objeto local, y con un simple
// {...guardado, ...prefs} el "compact" del perfil sobreviviría y volvería en
// el próximo login.
export const guardarAparienciaEnPerfil = (prefs: UiPrefs): Promise<void> => {
  const nuevas = sanitizeUiPrefs(prefs);
  return reescribirUiPrefs((actual) => {
    if (JSON.stringify(sanitizeUiPrefs(actual)) === JSON.stringify(nuevas)) return null;
    const ajenas: UiPrefsGuardadas = {};
    for (const [clave, valor] of Object.entries(actual)) {
      // hasOwnProperty y no `in`: con `in`, una clave "toString" contaría
      // como de apariencia (viene del prototipo) y se perdería.
      if (!Object.prototype.hasOwnProperty.call(CLAVES_DE_APARIENCIA, clave)) ajenas[clave] = valor;
    }
    return { ...ajenas, ...nuevas };
  });
};

/* ---- Skins de temporada ---- */

export type SeasonId = "halloween" | "navidad";

export interface SeasonDef {
  id: SeasonId;
  /** Clave i18n del nombre (para el toast y el switch de Settings). */
  labelKey: TranslationKey;
  /** Rango inclusivo, siempre dentro del MISMO mes (si alguna temporada
      futura cruza de mes, extender activeSeason). */
  from: { month: number; day: number };
  to: { month: number; day: number };
  /** Colores literales (para previews); los tokens reales viven en los
      bloques [data-season] de index.css. */
  primary: string;
  accent: string;
}

export const SEASONS: SeasonDef[] = [
  {
    id: "halloween",
    labelKey: "settings.seasonHalloween",
    from: { month: 10, day: 25 },
    to: { month: 10, day: 31 },
    primary: "hsl(25 95% 39%)",
    accent: "hsl(271 91% 50%)",
  },
  {
    id: "navidad",
    labelKey: "settings.seasonNavidad",
    from: { month: 12, day: 15 },
    to: { month: 12, day: 26 },
    primary: "hsl(350 80% 42%)",
    accent: "hsl(43 80% 34%)",
  },
];

export const activeSeason = (now: Date = new Date()): SeasonDef | null => {
  const month = now.getMonth() + 1;
  const day = now.getDate();
  return (
    SEASONS.find((s) => month === s.from.month && day >= s.from.day && day <= s.to.day) ?? null
  );
};

/* ---- Aplicación al DOM ---- */

// Las 5 vars que redefine tanto un [data-skin] como el skin Personalizado.
const CUSTOM_VARS = ["--primary", "--accent", "--ring", "--sidebar-primary", "--sidebar-ring"] as const;

// Skin Personalizado: genera primary/accent al vuelo desde un hue libre.
// accent = hue+30°; la L de CADA hue sale de la bisección AA (lib/wcag.ts)
// para que el texto blanco siga legible (≥ 4.5:1) sobre ambos colores.
// Vars inline en <html> ⇒ le ganan a cualquier bloque [data-skin]/[data-season]
// del stylesheet — por eso el applier las suprime mientras hay temporada.
export const applyCustomHue = (hue: number | null) => {
  const style = document.documentElement.style;
  if (hue == null) {
    for (const v of CUSTOM_VARS) style.removeProperty(v);
    return;
  }
  const h = Math.min(360, Math.max(0, Math.round(hue))) % 360;
  const accentH = (h + 30) % 360;
  const primary = `${h} ${CUSTOM_SKIN_SATURATION}% ${aaLightnessForHue(h)}%`;
  const accent = `${accentH} ${CUSTOM_SKIN_SATURATION}% ${aaLightnessForHue(accentH)}%`;
  style.setProperty("--primary", primary);
  style.setProperty("--accent", accent);
  style.setProperty("--ring", primary);
  style.setProperty("--sidebar-primary", primary);
  style.setProperty("--sidebar-ring", primary);
};

// Estado DERIVADO completo de apariencia → atributos/vars en <html>. Es
// idempotente y siempre parte de lo guardado, así cualquier camino (boot,
// toggle en Settings, sync remoto, toast de temporada) converge igual.
export const applyAppearancePrefs = () => {
  const prefs = getStoredPrefs();
  const root = document.documentElement;
  if (prefs.oled) root.dataset.oled = "";
  else delete root.dataset.oled;
  if (prefs.contrast) root.dataset.contrast = "high";
  else delete root.dataset.contrast;
  if (prefs.density === "compact") root.dataset.density = "compact";
  else delete root.dataset.density;
  const season = activeSeason();
  const seasonOn = !!season && prefs.seasonalOptOut !== true;
  if (seasonOn && season) root.dataset.season = season.id;
  else delete root.dataset.season;
  // El overlay de temporada debe VERSE: si dejáramos las vars inline del
  // skin Personalizado, taparían el bloque [data-season].
  applyCustomHue(seasonOn ? null : (prefs.customHue ?? null));
};

// Boot (main.tsx): prefs + temporada aplicadas antes del primer render,
// como applyStoredSkin. El toast de temporada NO va acá (necesita React
// montado) — vive en useSkinSync.
export const applyStoredAppearance = () => applyAppearancePrefs();

// Hook de la card Apariencia: prefs actuales + patcher que aplica al
// instante, guarda en localStorage y persiste en profiles.ui_prefs.
export const useUiPrefs = () => {
  const [prefs, setPrefsState] = useState<UiPrefs>(getStoredPrefs);
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: guardarAparienciaEnPerfil,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["my-profile"] });
    },
  });

  // Cambios hechos desde OTRO consumidor (ej: "Mantener el mío" del toast
  // con la card abierta) llegan por el evento y refrescan el estado local.
  useEffect(() => {
    const onChange = () => setPrefsState(getStoredPrefs());
    window.addEventListener(PREFS_EVENT, onChange);
    return () => window.removeEventListener(PREFS_EVENT, onChange);
  }, []);

  const setPrefs = useCallback(
    (patch: Partial<UiPrefs>) => {
      const next = sanitizeUiPrefs({ ...getStoredPrefs(), ...patch });
      storePrefs(next);
      setPrefsState(next);
      applyAppearancePrefs();
      // Fire-and-forget, igual que useSaveSkin: si falla, lo local ya quedó.
      save.mutate(next);
    },
    [save],
  );

  return { prefs, setPrefs, saving: save.isPending };
};

// Hook del picker (Settings): skin activo + setter que aplica al instante,
// persiste en localStorage y guarda en profiles.ui_skin.
export const useSkin = () => {
  const [skin, setSkinState] = useState<SkinId>(getStoredSkin);
  const save = useSaveSkin();

  const setSkin = useCallback(
    (next: SkinId) => {
      setSkinState(next);
      storeSkin(next);
      applySkin(next);
      // Elegir un preset LIMPIA el skin Personalizado (sus vars inline
      // taparían el preset). Solo si estaba activo, para no escribir de más.
      if (getStoredPrefs().customHue != null) {
        const prefs = { ...getStoredPrefs(), customHue: null };
        storePrefs(prefs);
        applyAppearancePrefs();
        void guardarAparienciaEnPerfil(prefs);
      }
      // Persistencia remota fire-and-forget: si falla, el skin local igual
      // quedó aplicado y guardado; al próximo login el perfil (viejo) manda.
      save.mutate(next);
    },
    [save],
  );

  return { skin, setSkin, saving: save.isPending };
};

// Hook de ARRANQUE (montado una vez en App): aplica lo guardado localmente y,
// al resolver la sesión, lee profiles.ui_skin — si difiere de localStorage el
// perfil gana (es lo que el usuario eligió por última vez en ALGÚN
// dispositivo; NULL o valor desconocido = default maven). localStorage manda
// mientras la red no llega. La misma lectura trae el idioma guardado en
// ui_prefs y se lo pasa al LanguageProvider (useIdiomaDelPerfil).
export const useSkinSync = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const empezarLecturaDeIdioma = useIdiomaDelPerfil();

  useEffect(() => {
    applyStoredSkin();
    applyAppearancePrefs();
  }, []);

  // Toast de temporada — UNA vez por temporada (marker con año en
  // localStorage) y solo si el overlay realmente quedó aplicado. Con delay
  // corto: SkinBoot monta ANTES que <Sonner/> y un toast disparado en el
  // primer flush de efectos podría perderse.
  useEffect(() => {
    const season = activeSeason();
    if (!season) return;
    if (getStoredPrefs().seasonalOptOut === true) return;
    const marker = `${season.id}-${new Date().getFullYear()}`;
    try {
      if (localStorage.getItem(SEASON_TOAST_KEY) === marker) return;
    } catch {
      return; // sin localStorage no hay cómo garantizar "una vez": no mostramos
    }
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(SEASON_TOAST_KEY, marker);
      } catch {
        /* igual mostramos el toast */
      }
      toast(t("settings.seasonToast"), {
        description: t(season.labelKey),
        action: {
          label: t("settings.seasonKeepMine"),
          onClick: () => {
            // Revierte el overlay y recuerda la elección (local + perfil).
            const prefs = { ...getStoredPrefs(), seasonalOptOut: true };
            storePrefs(prefs);
            applyAppearancePrefs();
            void guardarAparienciaEnPerfil(prefs);
          },
        },
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [t]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const adoptarIdioma = empezarLecturaDeIdioma();
    void supabase
      .from("profiles")
      .select("ui_skin, ui_prefs")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error) return;
        const raw = data?.ui_skin;
        const remote: SkinId = isSkinId(raw) ? raw : "maven";
        if (remote !== getStoredSkin()) {
          storeSkin(remote);
          applySkin(remote);
        }
        // ui_prefs: mismo criterio que ui_skin — lo del perfil es lo último
        // elegido en ALGÚN dispositivo, gana si difiere de lo local.
        const remotePrefs = sanitizeUiPrefs(data?.ui_prefs);
        if (JSON.stringify(remotePrefs) !== JSON.stringify(getStoredPrefs())) {
          storePrefs(remotePrefs);
          applyAppearancePrefs();
        }
        adoptarIdioma(data?.ui_prefs);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, empezarLecturaDeIdioma]);
};
