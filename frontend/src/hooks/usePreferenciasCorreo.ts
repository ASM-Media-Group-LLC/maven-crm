import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { reescribirUiPrefs } from "@/hooks/useLanguage";

// CÓMO QUIERE VER EL CORREO CADA PERSONA (Keila, 02/10): «No leídos primero»
// y el panel de lectura «Dividir» / «Sin división».
//
// Dos capas, igual que el idioma y la apariencia:
//   - localStorage, POR PERSONA (la clave lleva su id): manda en el primer
//     render. Dos personas que comparten computadora no se pisan.
//   - profiles.ui_prefs.correo: lo último que eligió en CUALQUIER dispositivo.
//     Al llegar, si todavía no tocó nada en esta pestaña, gana el perfil.
//
// ⚠️ ui_prefs es UN jsonb con varios dueños (apariencia, idioma y esto): se
// escribe con `reescribirUiPrefs`, que lee lo que hay y conserva lo ajeno.

// `type` y no `interface`: así entra directo en el Json de ui_prefs.
export type PrefsCorreo = {
  /** En Recibidos: los no leídos en su propia sección, arriba. */
  noLeidosPrimero: boolean;
  /** «dividir» = la lista al lado del correo abierto; «completa» = el correo
   *  abierto ocupa todo el espacio y se vuelve a la lista con la flecha. */
  lectura: "dividir" | "completa";
};

export const PREFS_CORREO_POR_DEFECTO: PrefsCorreo = { noLeidosPrimero: false, lectura: "dividir" };

const esObjeto = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Solo las claves válidas, con su tipo: lo demás (un jsonb viejo, un
 *  localStorage tocado a mano) se descarta. */
export function sanitizarPrefsCorreo(raw: unknown): Partial<PrefsCorreo> {
  if (!esObjeto(raw)) return {};
  const p: Partial<PrefsCorreo> = {};
  if (typeof raw.noLeidosPrimero === "boolean") p.noLeidosPrimero = raw.noLeidosPrimero;
  if (raw.lectura === "dividir" || raw.lectura === "completa") p.lectura = raw.lectura;
  return p;
}

const claveLocal = (uid: string | undefined) => `maven.correo.prefs.${uid ?? "anon"}`;

function leerLocal(uid: string | undefined): PrefsCorreo {
  try {
    const crudo = localStorage.getItem(claveLocal(uid));
    return { ...PREFS_CORREO_POR_DEFECTO, ...sanitizarPrefsCorreo(crudo ? JSON.parse(crudo) : null) };
  } catch {
    return { ...PREFS_CORREO_POR_DEFECTO };
  }
}

function guardarLocal(uid: string | undefined, prefs: PrefsCorreo): void {
  try { localStorage.setItem(claveLocal(uid), JSON.stringify(prefs)); } catch { /* sin storage igual aplica */ }
}

export function usePreferenciasCorreo(): PrefsCorreo & { cambiar: (p: Partial<PrefsCorreo>) => void } {
  const { user } = useAuth();
  const uid = user?.id;
  const [prefs, setPrefs] = useState<PrefsCorreo>(() => leerLocal(uid));
  // ¿Eligió algo en esta pestaña? Entonces lo que llegue del perfil ya es viejo.
  const tocadas = useRef(false);

  useEffect(() => {
    tocadas.current = false;
    setPrefs(leerLocal(uid));
  }, [uid]);

  const remoto = useQuery({
    queryKey: ["correo-prefs", uid],
    enabled: !!uid,
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<Partial<PrefsCorreo> | null> => {
      // Sin sesión de esa persona no se pregunta nada (y nunca a ciegas).
      const { data: sesion } = await supabase.auth.getSession();
      if (sesion.session?.user?.id !== uid) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("ui_prefs")
        .eq("id", uid!)
        .maybeSingle();
      if (error || !data) return null;
      const ui = data.ui_prefs as unknown;
      return esObjeto(ui) ? sanitizarPrefsCorreo(ui.correo) : null;
    },
  });

  useEffect(() => {
    const desdePerfil = remoto.data;
    if (!desdePerfil || tocadas.current) return;
    setPrefs((antes) => {
      const juntas = { ...antes, ...desdePerfil };
      guardarLocal(uid, juntas);
      return juntas;
    });
  }, [remoto.data, uid]);

  const cambiar = useCallback((parcial: Partial<PrefsCorreo>) => {
    tocadas.current = true;
    setPrefs((antes) => {
      const juntas = { ...antes, ...parcial };
      guardarLocal(uid, juntas);
      return juntas;
    });
    void reescribirUiPrefs((actual) => {
      const previas = sanitizarPrefsCorreo(actual.correo);
      const siguientes = { ...previas, ...sanitizarPrefsCorreo(parcial) };
      if (JSON.stringify(previas) === JSON.stringify(siguientes)) return null;
      return { ...actual, correo: siguientes };
    });
  }, [uid]);

  return { ...prefs, cambiar };
}
