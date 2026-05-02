import { useState } from "react";
import { Plus, Pencil, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// DEFAULT_EMOJIS from the original Roleplaychatters index.html line 2145.
export const DEFAULT_EMOJIS = ["😏","🔥","💦","😈","❤️","🥵","😍","🙈","🍆","💋"];

// EMOJI_CATALOG verbatim from index.html line 3501 — the same six categories
// with the same emojis in the same order, so admins who knew the old picker
// see exactly what they expect.
export const EMOJI_CATALOG: Record<string, string[]> = {
  Caras:   ["😏","😈","🥵","😍","🤤","😘","🥰","😜","🤪","😎","🤑","😇","🥺","😩","😤","🤫","🤭","😋","😛","🫦"],
  Amor:    ["❤️","🔥","💋","💕","💖","💗","💘","💝","💞","💓","🖤","💜","🤍","♥️","😻","💑","💏","👅","👄","🫶"],
  Cuerpo:  ["🍆","🍑","💦","🍒","🍓","🥝","🌶️","🍌","🫧","💪","🦵","🙈","🙊","🙉","👀","👁️","🫣","🤲","👐","🤏"],
  Gestos:  ["👍","👎","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","👇","☝️","✋","🤚","🖐️","✊","👊","🤛","👏","🙌"],
  Objetos: ["🎥","📸","💰","💵","💳","🎁","🔒","🔑","💎","👑","🏆","🎯","🎲","🪩","💊","🧴","🩲","👙","🥂","🍾"],
  Otros:   ["⭐","✨","💫","🌟","⚡","☀️","🌙","🌈","🦋","🌹","🥀","🪷","🫐","🎀","🧿","🔮","♾️","❗","‼️","⁉️"],
};

interface EmojiBarProps {
  emojis: string[];
  onPick: (emoji: string) => void;
  onAdd: (emoji: string) => void;
  onRemove: (emoji: string) => void;
  /** When true, all the chip-mode interactions (edit on/off, X to remove,
   *  + to add) are visible. When false, the bar is read-only display. */
  editable?: boolean;
}

export const EmojiBar = ({
  emojis,
  onPick,
  onAdd,
  onRemove,
  editable = true,
}: EmojiBarProps) => {
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
    setPickerOpen(false);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-1 border-t bg-card/50 px-2 py-1.5">
        {emojis.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => handleClickEmoji(e)}
            className={`relative rounded p-0.5 text-xl leading-none transition-colors hover:bg-muted ${
              editMode ? "ring-1 ring-rose-500/40 hover:ring-rose-500" : ""
            }`}
            title={editMode ? "Click para eliminar" : `Insertar ${e}`}
          >
            {e}
            {editMode && (
              <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-rose-500 text-[8px] font-bold text-white">
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
              title="Agregar emoji"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setEditMode((v) => !v)}
              className={`rounded border p-1 text-xs transition-colors ${
                editMode
                  ? "border-emerald-500 text-emerald-400 hover:bg-emerald-500/10"
                  : "border-dashed border-muted-foreground/40 text-muted-foreground hover:border-foreground hover:text-foreground"
              }`}
              title={editMode ? "Terminar edición" : "Editar emojis"}
            >
              {editMode ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
            </button>
          </>
        )}
      </div>

      {editable && (
        <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Agregar emoji</DialogTitle>
            </DialogHeader>
            <div className="max-h-[60vh] space-y-4 overflow-y-auto">
              {Object.entries(EMOJI_CATALOG).map(([category, list]) => (
                <div key={category}>
                  <div className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {category}
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
                          title={already ? "Ya en la barra" : "Agregar"}
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
