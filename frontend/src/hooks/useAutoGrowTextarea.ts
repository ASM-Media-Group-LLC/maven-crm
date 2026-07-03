import { useLayoutEffect, type RefObject } from "react";

/** Alto máximo del cajón antes de scrollear (px). ~6 líneas. */
export const MAX_TEXTAREA_PX = 160;

/**
 * Auto-grow de un <textarea>: crece de alto con el contenido (al saltar renglón)
 * hasta `maxPx`, y a partir de ahí scrollea internamente. Es la MISMA lógica que
 * usa Chatter Evaluator (vía ChatComposer) — unificada acá para WhatsApp, Messenger
 * y Telegram también.
 *
 * Recibe un ref EXISTENTE (no crea uno) para no pisar refs que la superficie ya usa
 * (foco, mentions, scripts, etc.). El <textarea> debe tener `resize-none` y un
 * `max-h` acorde a `maxPx`.
 */
export function useAutoGrowTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  maxPx: number = MAX_TEXTAREA_PX,
) {
  useLayoutEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, maxPx)}px`;
  }, [ref, value, maxPx]);
}
