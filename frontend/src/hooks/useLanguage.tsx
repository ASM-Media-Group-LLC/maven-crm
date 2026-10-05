import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { type Language, type TranslationKey, getTranslation, fijarIdioma } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

// EL IDIOMA TE SIGUE DE UN DISPOSITIVO A OTRO. Mismo patrón que el skin
// (hooks/useSkin.ts), en dos capas:
//   - localStorage ("app-language"): manda en el primer render y mientras no
//     llega la red. Así no hay parpadeo: la pantalla arranca en el idioma de
//     la última vez en ESTE navegador.
//   - profiles.ui_prefs.language: lo último que la persona eligió en CUALQUIER
//     dispositivo. Al abrir la sesión, si difiere de lo local, gana el perfil
//     (lo lee useSkinSync, que ya trae ui_prefs; ver useIdiomaDelPerfil).
// Solo se escribe en el perfil cuando la persona ELIGE un idioma; al cargar no
// se escribe nada, aunque el perfil todavía no tenga idioma guardado.

const CLAVE_LOCAL = "app-language";

const esIdioma = (v: unknown): v is Language => v === "es" || v === "en";

function idiomaGuardado(): Language {
  try {
    const guardado = localStorage.getItem(CLAVE_LOCAL);
    return esIdioma(guardado) ? guardado : "es";
  } catch {
    return "es"; // localStorage bloqueado: sin él igual se puede usar la app
  }
}

function guardarIdiomaLocal(lang: Language): void {
  try {
    localStorage.setItem(CLAVE_LOCAL, lang);
  } catch {
    // Bloqueado (modo privado): el idioma igual aplica en vivo.
  }
}

/* ------------------------------------------------------------------ */
/* profiles.ui_prefs: leer, cambiar, escribir — sin pisar lo ajeno      */
/* ------------------------------------------------------------------ */

/** Lo que hay guardado en profiles.ui_prefs, ya como objeto. */
export type UiPrefsGuardadas = { [clave: string]: Json | undefined };

const esObjeto = (v: unknown): v is UiPrefsGuardadas =>
  !!v && typeof v === "object" && !Array.isArray(v);

// Una sola escritura a la vez. ui_prefs es UN jsonb que comparten dos dueños
// (la apariencia de useSkin y el idioma de acá) y cada escritura es leer →
// cambiar → escribir: dos a la vez leerían lo mismo y la segunda borraría lo que
// escribió la primera (tocar el modo OLED y enseguida el idioma perdería uno de
// los dos). En fila, cada una lee lo que dejó la anterior.
let filaDeEscrituras: Promise<void> = Promise.resolve();

/** Lee profiles.ui_prefs de la persona con sesión, le aplica `cambiar` y guarda
 *  el resultado. `cambiar` recibe TODO lo guardado y tiene que devolverlo
 *  entero, conservando las claves que no son suyas; si devuelve null, no hay
 *  nada que cambiar y no se escribe.
 *
 *  Nunca rechaza: es fire-and-forget y lo local ya quedó aplicado. Sin sesión, o
 *  si no se pudo leer la fila, no escribe: escribir a ciegas pisaría las
 *  preferencias del otro dueño.
 *
 *  Vive acá y no en useSkin.ts porque useSkin.ts ya importa de este archivo: al
 *  revés sería un import circular. */
export function reescribirUiPrefs(
  cambiar: (actual: UiPrefsGuardadas) => UiPrefsGuardadas | null,
): Promise<void> {
  const tarea = filaDeEscrituras.then(async () => {
    const { data: sesion } = await supabase.auth.getSession();
    const uid = sesion.session?.user?.id;
    if (!uid) return;
    const { data, error } = await supabase
      .from("profiles")
      .select("ui_prefs")
      .eq("id", uid)
      .maybeSingle();
    if (error || !data) return;
    const siguiente = cambiar(esObjeto(data.ui_prefs) ? data.ui_prefs : {});
    if (!siguiente) return;
    await supabase.from("profiles").update({ ui_prefs: siguiente }).eq("id", uid);
  });
  const sinError = tarea.catch(() => {});
  filaDeEscrituras = sinError;
  return sinError;
}

/** El idioma guardado en un ui_prefs, o null si no hay (o no es válido). */
function idiomaDeUiPrefs(uiPrefs: unknown): Language | null {
  return esObjeto(uiPrefs) && esIdioma(uiPrefs.language) ? uiPrefs.language : null;
}

const guardarIdiomaEnPerfil = (lang: Language) =>
  reescribirUiPrefs((actual) =>
    idiomaDeUiPrefs(actual) === lang ? null : { ...actual, language: lang },
  );

/* ------------------------------------------------------------------ */

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

// Lo que necesita quien trae el idioma del perfil. Va en un contexto aparte y no
// en el de useLanguage(): `adoptar` cambia el idioma SIN guardarlo en el perfil,
// y eso no lo tiene que poder hacer ninguna pantalla.
interface SincroConPerfil {
  /** Cuántas veces eligió idioma la persona en esta pestaña. */
  elecciones: () => number;
  /** Aplica un idioma que vino del perfil: sin volver a escribirlo allá. */
  adoptar: (lang: Language) => void;
}

const SincroContext = createContext<SincroConPerfil | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const inicial = idiomaGuardado();
    // Se fija acá, en el inicializador, y no en un efecto: un toast puede
    // dispararse antes del primer efecto (por ejemplo si la sesión ya venció al
    // cargar) y tiene que salir en el idioma correcto desde el arranque.
    fijarIdioma(inicial);
    return inicial;
  });
  const elecciones = useRef(0);

  const aplicar = useCallback((lang: Language) => {
    setLanguageState(lang);
    fijarIdioma(lang);
    guardarIdiomaLocal(lang);
  }, []);

  const setLanguage = useCallback(
    (lang: Language) => {
      elecciones.current += 1;
      aplicar(lang);
      void guardarIdiomaEnPerfil(lang);
    },
    [aplicar],
  );

  const sincro = useMemo<SincroConPerfil>(
    () => ({ elecciones: () => elecciones.current, adoptar: aplicar }),
    [aplicar],
  );

  // El idioma del documento tiene que seguir al de la interfaz: de eso dependen
  // el lector de pantalla (con qué voz lee), el corrector ortográfico del
  // navegador en cada <textarea> y cómo parte las palabras al final del renglón.
  // Estaba fijo en "en" en index.html mientras la app hablaba español.
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const toggleLanguage = useCallback(() => {
    setLanguage(language === "es" ? "en" : "es");
  }, [language, setLanguage]);

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) => getTranslation(key, language, params),
    [language]
  );

  return (
    <SincroContext.Provider value={sincro}>
      <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, t }}>
        {children}
      </LanguageContext.Provider>
    </SincroContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within LanguageProvider");
  return context;
}

/** Igual que `useLanguage()` pero SIN tirar si falta el proveedor: devuelve
 *  undefined. Existe para lo que se puede dibujar fuera del árbol de la app, donde
 *  tirar es una pantalla en negro. El caso real: FacturacionPage monta un
 *  `createRoot` aparte para dibujar la factura y pasarla a PDF, fuera del
 *  LanguageProvider. Para texto de pantalla normal, seguí usando `useLanguage()`. */
export function useLanguageSiHay(): LanguageContextType | undefined {
  return useContext(LanguageContext);
}

/** Para quien lee profiles.ui_prefs al abrir la sesión: useSkinSync
 *  (hooks/useSkin.ts), que ya trae la fila para el skin y así no se pide dos
 *  veces. El LanguageProvider no puede leerla solo: está por FUERA del
 *  AuthProvider y no sabe quién entró.
 *
 *  Devuelve una función estable. Llamala justo ANTES de pedir el perfil; te da
 *  con qué adoptar el idioma cuando llegue la respuesta. Si mientras tanto la
 *  persona eligió un idioma a mano, no adopta nada: gana lo que acaba de elegir
 *  y no lo que había guardado. Si el perfil no tiene idioma, queda el local. */
export function useIdiomaDelPerfil(): () => (uiPrefs: unknown) => void {
  const sincro = useContext(SincroContext);
  return useCallback(() => {
    if (!sincro) return () => {};
    const eleccionesAlPedir = sincro.elecciones();
    return (uiPrefs: unknown) => {
      if (sincro.elecciones() !== eleccionesAlPedir) return;
      const delPerfil = idiomaDeUiPrefs(uiPrefs);
      if (delPerfil) sincro.adoptar(delPerfil);
    };
  }, [sincro]);
}
