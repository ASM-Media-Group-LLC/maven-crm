import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";

// Per-tab font size for the chat messages container. Mirrors the
// chatFontSize control in the original Roleplaychatters (index.html line
// 2159 / chatZoom). Persisted to localStorage so refreshes keep the user's
// pick. Min/max/step (10/24/+2) mirror the original.
const FONT_KEY = "maven.chatter.chatFontSize";
const FONT_MIN = 10;
const FONT_MAX = 24;
const FONT_STEP = 2;

export const getChatFontSize = (): number => {
  try {
    const raw = parseInt(localStorage.getItem(FONT_KEY) || "", 10);
    if (Number.isFinite(raw)) return Math.max(FONT_MIN, Math.min(FONT_MAX, raw));
  } catch {
    /* no-op */
  }
  return 14;
};

const writeFontSize = (next: number) => {
  try {
    localStorage.setItem(FONT_KEY, String(next));
    window.dispatchEvent(new CustomEvent("maven:chatFontSize", { detail: next }));
  } catch {
    /* no-op */
  }
};

/** Subscribe to font size changes (intra-tab + cross-tab via storage). */
export const useChatFontSize = (): number => {
  const [size, setSize] = useState<number>(() => getChatFontSize());
  useEffect(() => {
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent<number>).detail;
      if (typeof detail === "number") setSize(detail);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === FONT_KEY) setSize(getChatFontSize());
    };
    window.addEventListener("maven:chatFontSize", onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("maven:chatFontSize", onCustom);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return size;
};

interface FontZoomProps {
  onDark?: boolean;
}

/** A- / A+ pair, same as the original .chat-zoom layout. */
export const FontZoom = ({ onDark }: FontZoomProps) => {
  const { t } = useLanguage();
  const apply = (dir: -1 | 1) => {
    const next = Math.max(
      FONT_MIN,
      Math.min(FONT_MAX, getChatFontSize() + dir * FONT_STEP),
    );
    writeFontSize(next);
  };
  const cls = onDark
    ? "rounded-full border border-white/30 px-2 py-0.5 text-xs text-white/80 hover:border-white hover:text-white"
    : "rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground hover:border-foreground hover:text-foreground";
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => apply(-1)} title={t("chatters.ws.smaller")} className={cls} aria-label={t("chatters.ws.decreaseFont")}>
        A−
      </button>
      <button type="button" onClick={() => apply(1)} title={t("chatters.ws.larger")} className={cls} aria-label={t("chatters.ws.increaseFont")}>
        A+
      </button>
    </div>
  );
};

interface ThemeToggleProps {
  onDark?: boolean;
}

/** 🌙 / ☀️ toggle. Wraps next-themes so it integrates with the rest of
 *  Maven's theming. Default theme stays whatever ThemeProvider was set to. */
export const ThemeToggle = ({ onDark }: ThemeToggleProps) => {
  const { t } = useLanguage();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isLight = mounted && theme === "light";
  const cls = onDark
    ? "rounded p-1 text-base hover:bg-white/10"
    : "rounded p-1 text-base hover:bg-muted";
  return (
    <button
      type="button"
      onClick={() => setTheme(isLight ? "dark" : "light")}
      className={cls}
      title={isLight ? t("chatters.ws.darkMode") : t("chatters.ws.lightMode")}
      aria-label={isLight ? t("chatters.ws.switchToDark") : t("chatters.ws.switchToLight")}
    >
      {isLight ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
};

// ---- Language (chatter-side) ----------------------------------------------
// Per-tab language pick for the ROLEPLAY CONTENT (the character's info,
// which has dedicated `*_en` columns). It is NOT the UI language: the labels
// around it follow the Maven ES/EN toggle (useLanguage). When set to "en",
// profile field reads fall back to the `_en` variant via pVal.
const LANG_KEY = "maven.chatter.lang";
export type ChatterLang = "es" | "en";

export const getChatterLang = (): ChatterLang => {
  try {
    const v = localStorage.getItem(LANG_KEY);
    return v === "en" ? "en" : "es";
  } catch {
    return "es";
  }
};

const writeChatterLang = (next: ChatterLang) => {
  try {
    localStorage.setItem(LANG_KEY, next);
    window.dispatchEvent(new CustomEvent("maven:chatterLang", { detail: next }));
  } catch {
    /* no-op */
  }
};

export const useChatterLang = (): [ChatterLang, (l: ChatterLang) => void] => {
  const [lang, setLang] = useState<ChatterLang>(() => getChatterLang());
  useEffect(() => {
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent<ChatterLang>).detail;
      if (detail === "en" || detail === "es") setLang(detail);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === LANG_KEY) setLang(getChatterLang());
    };
    window.addEventListener("maven:chatterLang", onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("maven:chatterLang", onCustom);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return [lang, (l) => { setLang(l); writeChatterLang(l); }];
};

interface LangSelectProps {
  onDark?: boolean;
}

export const LangSelect = ({ onDark }: LangSelectProps) => {
  const { t } = useLanguage();
  const [lang, setLang] = useChatterLang();
  const cls = onDark
    ? "rounded-md border border-white/30 bg-white/10 px-2 py-1 text-[11px] font-bold text-white outline-none hover:border-white"
    : "rounded-xl border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-bold text-foreground outline-none hover:border-foreground";
  return (
    <select
      value={lang}
      onChange={(e) => setLang(e.target.value === "en" ? "en" : "es")}
      className={cls}
      aria-label={t("chatters.ws.characterLanguage")}
      title={t("chatters.ws.characterLanguage")}
    >
      <option value="es">{"🇪🇸 ES"}</option>
      <option value="en">{"🇬🇧 EN"}</option>
    </select>
  );
};

// ---- Profile language helper ----------------------------------------------
// Same fallback logic as pVal in the original: prefer `<key>_en` when lang
// is "en" and the EN value is non-empty; otherwise return the base value.
export const pVal = <K extends string>(
  profile: Record<string, unknown> | null | undefined,
  key: K,
  lang: ChatterLang,
): string => {
  if (!profile) return "";
  if (lang === "en") {
    const en = profile[`${key}_en`];
    if (typeof en === "string" && en.length > 0) return en;
  }
  const v = profile[key];
  return typeof v === "string" ? v : "";
};
