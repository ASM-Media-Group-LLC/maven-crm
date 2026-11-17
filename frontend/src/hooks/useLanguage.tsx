import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { type Language, type TranslationKey, getTranslation, fijarIdioma, cargarIdioma, idiomaCargado } from "@/lib/i18n";
import { esIdioma as esIdiomaDeMaven, idiomaDelNavegador } from "@/lib/idiomas";
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

const esIdioma = (v: unknown): v is Language => esIdiomaDeMaven(v);

/** ¿Ya hubo una sesión de Maven en este navegador? (Supabase guarda su token
 *  como `sb-<proyecto>-auth-token`.) */
function huboSesionAqui(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) ?? "";
      if (k.startsWith("sb-") && k.endsWith("-auth-token")) return true;
    }
  } catch {
    // Bloqueado: se trata como alguien nuevo.
  }
  return false;
}

/** El idioma con que arranca la app (lo usa también main.tsx para bajar ese
 *  paquete antes de pintar):
 *   1. el que la persona eligió en este navegador;
 *   2. si ya trabajaba en Maven aquí y nunca eligió → español, como siempre
 *      (16/11/2026: «tu equipo actual sigue en el idioma que ya eligió»; sin
 *      esto, a quien tiene Chrome en inglés la app le cambiaba de un día al otro);
 *   3. alguien nuevo → el idioma de su navegador, o inglés si Maven no lo habla. */
/** El idioma de la dirección de la portada (/en, /es, /de…), si la hay. */
function idiomaDeLaRuta(): Language | null {
  const enLaRuta = typeof location !== "undefined" ? location.pathname.match(/^\/(en|es|de|fr|it|pt)(\/|$)/)?.[1] : undefined;
  return esIdioma(enLaRuta) ? enLaRuta : null;
}

export function idiomaInicial(): Language {
  // La portada en cada idioma tiene su dirección (/en, /es, /de…): manda esa.
  const enLaRuta = idiomaDeLaRuta();
  if (enLaRuta) return enLaRuta;
  try {
    const guardado = localStorage.getItem(CLAVE_LOCAL);
    if (esIdioma(guardado)) return guardado;
  } catch {
    return "es"; // localStorage bloqueado: sin él igual se puede usar la app
  }
  return huboSesionAqui() ? "es" : idiomaDelNavegador();
}

const idiomaGuardado = idiomaInicial;

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
    // Quien entra por /es (o /de…) se queda en ese idioma al tocar «Entrar»:
    // la dirección cuenta como su elección en este navegador.
    if (idiomaDeLaRuta()) guardarIdiomaLocal(inicial);
    // Se fija acá, en el inicializador, y no en un efecto: un toast puede
    // dispararse antes del primer efecto (por ejemplo si la sesión ya venció al
    // cargar) y tiene que salir en el idioma correcto desde el arranque.
    fijarIdioma(inicial);
    return inicial;
  });
  const elecciones = useRef(0);

  const aplicar = useCallback((lang: Language) => {
    const poner = () => {
      setLanguageState(lang);
      fijarIdioma(lang);
      guardarIdiomaLocal(lang);
    };
    // Si el paquete de ese idioma ya está, el cambio es inmediato; si no, se
    // baja primero (unos 100 KB) para no mostrar la pantalla a medio traducir.
    if (idiomaCargado(lang)) poner();
    else void cargarIdioma(lang).then(poner);
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
