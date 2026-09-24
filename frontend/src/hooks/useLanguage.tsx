import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { type Language, type TranslationKey, getTranslation, fijarIdioma } from "@/lib/i18n";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const stored = localStorage.getItem("app-language");
    const inicial: Language = (stored === "en" || stored === "es") ? stored : "es";
    // Se fija acá, en el inicializador, y no en un efecto: un toast puede
    // dispararse antes del primer efecto (por ejemplo si la sesión ya venció al
    // cargar) y tiene que salir en el idioma correcto desde el arranque.
    fijarIdioma(inicial);
    return inicial;
  });

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    fijarIdioma(lang);
    localStorage.setItem("app-language", lang);
  }, []);

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
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
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
