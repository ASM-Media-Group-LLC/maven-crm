import { useCallback, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { reescribirUiPrefs } from "@/hooks/useLanguage";
import { useMyProfile } from "@/hooks/useUserProfile";

// Cómo ve cada persona el Drive (Jhon, 02/10): Lista, Cuadrícula o Galería, y si
// agrupa por fecha. Se recuerda POR PERSONA: al instante en este navegador
// (localStorage) y en su perfil (profiles.ui_prefs.drive), para que la siga a
// otro dispositivo. El perfil se escribe con reescribirUiPrefs, que conserva
// lo que no es suyo (la apariencia y el idioma viven en el mismo jsonb).

export type ModoDeVista = "lista" | "cuadricula" | "galeria";
export interface PrefsDeVista { modo: ModoDeVista; agrupar: boolean }

export const VISTA_POR_DEFECTO: PrefsDeVista = { modo: "lista", agrupar: false };
const MODOS: readonly ModoDeVista[] = ["lista", "cuadricula", "galeria"];

/** Lo guardado, ya sano (lo de afuera puede venir de cualquier versión). */
export function prefsDeVista(raw: unknown): PrefsDeVista {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    modo: MODOS.includes(o.modo as ModoDeVista) ? (o.modo as ModoDeVista) : VISTA_POR_DEFECTO.modo,
    agrupar: o.agrupar === true,
  };
}

const claveLocal = (uid: string | undefined) => `maven.drive.vista.${uid ?? "sin-sesion"}`;

function leerLocal(uid: string | undefined): PrefsDeVista | null {
  try {
    const raw = localStorage.getItem(claveLocal(uid));
    return raw ? prefsDeVista(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function useVistaDrive(): [PrefsDeVista, (cambio: Partial<PrefsDeVista>) => void] {
  const { user } = useAuth();
  const perfil = useMyProfile();
  // Lo elegido en esta pestaña manda; si no, lo de este navegador; si no, lo
  // del perfil (otro dispositivo); si no, la lista.
  const [elegido, setElegido] = useState<PrefsDeVista | null>(null);
  const uiPrefs = perfil.data?.ui_prefs;
  const delPerfil = uiPrefs && typeof uiPrefs === "object" && !Array.isArray(uiPrefs) && "drive" in uiPrefs
    ? prefsDeVista((uiPrefs as Record<string, unknown>).drive)
    : null;
  const prefs = elegido ?? leerLocal(user?.id) ?? delPerfil ?? VISTA_POR_DEFECTO;

  const cambiar = useCallback((cambio: Partial<PrefsDeVista>) => {
    const nuevas = prefsDeVista({ ...prefs, ...cambio });
    setElegido(nuevas);
    try { localStorage.setItem(claveLocal(user?.id), JSON.stringify(nuevas)); } catch { /* bloqueado: vale igual en vivo */ }
    void reescribirUiPrefs((actual) =>
      JSON.stringify(prefsDeVista(actual.drive)) === JSON.stringify(nuevas) && "drive" in actual
        ? null
        : { ...actual, drive: { ...nuevas } });
  }, [prefs, user?.id]);

  return [prefs, cambiar];
}
