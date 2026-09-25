import { useState, useEffect, type Dispatch, type SetStateAction } from "react";
import { Plus, Pencil, Check } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// DEFAULT_EMOJIS del Roleplaychatters (index.html línea 2145): set PICANTE, pensado
// para chats de OnlyFans. Se usa SOLO en el Chatter Evaluator / roleplay (su dominio).
export const DEFAULT_EMOJIS = ["😏","🔥","💦","😈","❤️","🥵","😍","🙈","🍆","💋"];

// Set NEUTRAL para el resto de chats de Maven (Messenger, bandeja WhatsApp, y a
// futuro Telegram): reacciones de uso general, apropiadas para chat de equipo y de
// clientes. Es solo el arranque por defecto — cada usuario sigue personalizando su
// barra por sección (localStorage), y eso NO se toca.
export const NEUTRAL_DEFAULT_EMOJIS = ["👍","❤️","😂","🙏","🎉","🔥","👏","✅","😅","💯"];

// Estado de la barra de emojis PERSISTIDO por usuario (localStorage). Si el usuario
// agrega/quita emojis, se conserva al refrescar. `scope` separa contextos (inbox vs
// chatter) y `userId` lo aísla por usuario (en un navegador compartido cada uno tiene
// su barra). Sin nada guardado, arranca con `defaults` (neutral por defecto; el
// Chatter pasa DEFAULT_EMOJIS explícito).
export function usePersistedEmojis(
  scope: string,
  userId?: string | null,
  defaults: string[] = NEUTRAL_DEFAULT_EMOJIS,
): [string[], Dispatch<SetStateAction<string[]>>] {
  const key = `maven_emojibar_${scope}_${userId || "anon"}`;
  const [emojis, setEmojis] = useState<string[]>(() => {
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.every((x) => typeof x === "string")) return arr as string[];
      }
    } catch { /* localStorage no disponible o JSON inválido → defaults */ }
    return [...defaults];
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(emojis)); } catch { /* */ }
  }, [key, emojis]);
  return [emojis, setEmojis];
}

// EMOJI_CATALOG verbatim from index.html line 3501 — the same six categories
// with the same emojis in the same order, so admins who knew the old picker
// see exactly what they expect.
export const EMOJI_CATALOG: Record<string, string[]> = {
  Caras:   ["😏","😈","🥵","😍","🤤","😘","🥰","😜","🤪","😎","🤑","😇","🥺","😩","😤","🤫","🤭","😋","😛","🫦","😂","🤣","😅","😊","🙂","😉","😌","😔","😢","😭","🥳","🤩","😴","🤗","😚","😙","😝","🥲","🙃","😳"],
  Amor:    ["❤️","🔥","💋","💕","💖","💗","💘","💝","💞","💓","🖤","💜","🤍","🧡","💛","💚","💙","🤎","♥️","❣️","💟","💔","💌","❤️‍🔥","❤️‍🩹","😻","😽","💑","💏","👅","👄","🫶","💐","🌸"],
  Cuerpo:  ["🍆","🍑","💦","🍒","🍓","🥝","🌶️","🍌","🥒","🌽","🍯","🫧","💪","🦵","🦶","🦷","👂","👃","🧠","🫀","🙈","🙊","🙉","👀","👁️","🫣","🤲","👐","🤏","💅"],
  Gestos:  ["👍","👎","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","👇","☝️","✋","🤚","🖐️","✊","👊","🤛","🤜","👏","🙌","🙏","🤝","🤌","🫰","🫵","👋","🤳","✍️"],
  Objetos: ["🎥","📸","📱","💻","⌚","🎧","💰","💵","💳","🪙","💸","🛍️","🛒","💎","👑","💍","💄","🎁","🔒","🔑","🏆","🎯","🎲","🪩","💊","🧴","🩲","👙","🥂","🍷","🍸","🍾"],
  Otros:   ["⭐","✨","💫","🌟","⚡","☀️","🌙","🌈","🌸","🌺","🌷","🌻","🌹","🥀","🪷","🍀","🦋","🎀","🧿","🔮","🎉","🎊","💯","💢","💥","💤","🎶","🎵","♾️","❗","‼️","⁉️"],
};

// El nombre de la categoría es la LLAVE del catálogo (la usa también el
// Messenger); lo que se muestra sale de acá.
const NOMBRE_CATEGORIA: Record<string, TranslationKey> = {
  Caras: "chatters.emoji.cat.caras",
  Amor: "chatters.emoji.cat.amor",
  Cuerpo: "chatters.emoji.cat.cuerpo",
  Gestos: "chatters.emoji.cat.gestos",
  Objetos: "chatters.emoji.cat.objetos",
  Otros: "chatters.emoji.cat.otros",
};

interface EmojiBarProps {
  emojis: string[];
  onPick: (emoji: string) => void;
  onAdd: (emoji: string) => void;
  onRemove: (emoji: string) => void;
  /** When true, all the chip-mode interactions (edit on/off, X to remove,
   *  + to add) are visible. When false, the bar is read-only display. */
  editable?: boolean;
  /** Anything pushed to the right edge of the bar via `margin-left: auto`.
   *  Used to host the A−/A+ font zoom buttons in the same spot the
   *  original Roleplaychatters had them (.chat-zoom on the emoji row). */
  trailing?: React.ReactNode;
}

export const EmojiBar = ({
  emojis,
  onPick,
  onAdd,
  onRemove,
  editable = true,
  trailing,
}: EmojiBarProps) => {
  const { t } = useLanguage();
  const [editMode, setEditMode] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const handleClickEmoji = (e: string) => {
    if (editMode) {
      onRemove(e);
    } else {
      onPick(e);
    }
  };

  const handlePickFromCatalog = (e: string) => {
    if (!emojis.includes(e)) onAdd(e);
    // NO cerramos el popup: se pueden agregar varios de una. Se cierra con la X
    // o clic afuera. El emoji recién agregado queda marcado como "ya en la barra".
  };

  return (
    <>
      {/* En teléfono (hasta md) es UNA fila que se desliza de lado: partida en dos
          filas se comía medio chat, y sin scroll se salía por la derecha. */}
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide border-t bg-card/50 px-2 py-1.5 md:flex-wrap md:overflow-visible">
        {emojis.map((e) => (
          <button
            key={e}
            type="button"
            // preventDefault en mousedown: el botón NO roba el foco al hacer click,
            // así el textarea de chat conserva el foco. Sin esto, tras insertar un
            // emoji el foco quedaba en este botón y un Enter lo re-disparaba (metía
            // OTRO emoji) en vez de enviar el mensaje.
            onMouseDown={(ev) => ev.preventDefault()}
            onClick={() => handleClickEmoji(e)}
            className={`relative shrink-0 rounded p-0.5 text-xl leading-none transition-colors hover:bg-muted ${
              editMode ? "ring-1 ring-destructive/40 hover:ring-destructive" : ""
            }`}
            title={editMode ? t("chatters.emoji.clickToRemove") : t("chatters.emoji.insertN", { emoji: e })}
          >
            {e}
            {editMode && (
              <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-destructive text-[8px] font-bold text-white">
                ✕
              </span>
            )}
          </button>
        ))}
        {editable && (
          <>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="rounded border border-dashed border-muted-foreground/40 p-1 text-xs text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
              title={t("chatters.emoji.add")}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setEditMode((v) => !v)}
              className={`rounded border p-1 text-xs transition-colors ${
                editMode
                  ? "border-success text-success hover:bg-success/10"
                  : "border-dashed border-muted-foreground/40 text-muted-foreground hover:border-foreground hover:text-foreground"
              }`}
              title={editMode ? t("chatters.emoji.doneEditing") : t("chatters.emoji.edit")}
            >
              {editMode ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
            </button>
          </>
        )}
        {trailing && <div className="ml-auto flex items-center">{trailing}</div>}
      </div>

      {editable && (
        <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("chatters.emoji.add")}</DialogTitle>
            </DialogHeader>
            <div className="max-h-[60vh] space-y-4 overflow-y-auto">
              {Object.entries(EMOJI_CATALOG).map(([category, list]) => (
                <div key={category}>
                  <div className="mb-1.5 text-xs text-muted-foreground">
                    {NOMBRE_CATEGORIA[category] ? t(NOMBRE_CATEGORIA[category]) : category}
                  </div>
                  <div className="flex flex-wrap gap-0.5">
                    {list.map((e) => {
                      const already = emojis.includes(e);
                      return (
                        <button
                          key={e}
                          type="button"
                          disabled={already}
                          onClick={() => handlePickFromCatalog(e)}
                          className={`rounded p-1.5 text-2xl leading-none transition-colors ${
                            already
                              ? "opacity-30 cursor-not-allowed"
                              : "hover:bg-muted"
                          }`}
                          title={already ? t("chatters.emoji.alreadyInBar") : t("common.add")}
                        >
                          {e}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

export default EmojiBar;
