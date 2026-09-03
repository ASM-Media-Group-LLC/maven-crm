import { useEffect, useRef, useCallback } from "react";

/**
 * Parpadeo del TÍTULO de la pestaña cuando llega un mensaje y la pestaña NO está
 * al frente — como Google Chat ("X messaged you"). Alterna el título real con el
 * aviso hasta que la persona vuelve a la pestaña, y ahí restaura el original.
 *
 * Se dispara solo si la pestaña está oculta o sin foco: si ya la estás mirando,
 * parpadear sería ruido.
 */
export function useTabTitleAlert() {
  const baseTitleRef = useRef<string>("");
  const timerRef = useRef<number | null>(null);
  const flashingRef = useRef(false);

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (flashingRef.current && baseTitleRef.current) {
      document.title = baseTitleRef.current;
    }
    flashingRef.current = false;
  }, []);

  const alertTitle = useCallback((text: string) => {
    // Ya está mirando la pestaña → no molestar.
    if (!document.hidden && document.hasFocus()) return;
    // Guardar el título real solo la primera vez (si ya parpadea, el actual es el aviso).
    if (!flashingRef.current) baseTitleRef.current = document.title;
    flashingRef.current = true;
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    let showingAlert = true;
    document.title = text;
    timerRef.current = window.setInterval(() => {
      showingAlert = !showingAlert;
      document.title = showingAlert ? text : baseTitleRef.current;
    }, 1200);
  }, []);

  useEffect(() => {
    const onFocus = () => stop();
    const onVisibility = () => { if (!document.hidden) stop(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [stop]);

  return alertTitle;
}
