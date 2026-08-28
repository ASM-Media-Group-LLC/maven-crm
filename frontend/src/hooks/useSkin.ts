import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSaveSkin } from "@/hooks/useUserProfile";

// Skins de Maven — presets de ACENTO por usuario (Settings → Mi cuenta →
// Apariencia). Un skin solo cambia primary/accent/ring/sidebar-primary/
// sidebar-ring vía data-skin en <html> (los bloques viven en index.css);
// fondos, cards y charts no se tocan. La elección se persiste en dos capas:
//   - localStorage (aplicación instantánea al cargar, manda mientras no
//     llega la red),
//   - profiles.ui_skin (el skin te sigue en cualquier dispositivo; al
//     resolver la sesión, el perfil gana si difiere — ver useSkinSync).

export type SkinId = "maven" | "atardecer" | "esmeralda" | "orquidea" | "medianoche" | "dorado" | "kash";

export interface SkinDef {
  id: SkinId;
  label: string;
  /** Colores LITERALES del preset para pintar su swatch en el picker (no
      pueden ser var(--primary): esas vars reflejan el skin ACTIVO). Deben
      quedar sincronizados con los bloques [data-skin] de index.css. */
  primary: string;
  accent: string;
}

export const SKINS: SkinDef[] = [
  { id: "maven", label: "Maven", primary: "hsl(211 100% 50%)", accent: "hsl(271 91% 50%)" },
  { id: "atardecer", label: "Atardecer", primary: "hsl(25 95% 39%)", accent: "hsl(340 82% 59%)" },
  { id: "esmeralda", label: "Esmeralda", primary: "hsl(160 84% 28%)", accent: "hsl(190 90% 45%)" },
  { id: "orquidea", label: "Orquídea", primary: "hsl(290 84% 49%)", accent: "hsl(320 85% 55%)" },
  { id: "medianoche", label: "Medianoche", primary: "hsl(217 91% 53%)", accent: "hsl(217 91% 53%)" },
  { id: "dorado", label: "Dorado", primary: "hsl(43 80% 30%)", accent: "hsl(30 85% 45%)" },
  { id: "kash", label: "Rojo Kash", primary: "hsl(350 80% 42%)", accent: "hsl(15 90% 50%)" },
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
// mientras la red no llega.
export const useSkinSync = () => {
  const { user } = useAuth();

  useEffect(() => {
    applyStoredSkin();
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void supabase
      .from("profiles")
      .select("ui_skin")
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
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);
};
