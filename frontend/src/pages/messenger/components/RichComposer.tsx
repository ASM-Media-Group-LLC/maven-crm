import { forwardRef, useImperativeHandle, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TextStyle from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Baseline,
  List, ListOrdered, Quote, Link2, Code, SquareCode, RemoveFormatting,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { RichNode } from "../types";
import { richTieneFormato } from "./RichText";

export interface RichComposerHandle {
  focus: () => void;
  clear: () => void;
  /** Inserta texto en el cursor (emojis, scripts). */
  insertText: (text: string) => void;
  /** Reemplaza el token "@algo" de antes del cursor (largo en caracteres) por otro texto. */
  replaceMentionToken: (tokenLen: number, insert: string) => void;
  getPlain: () => string;
  /** Documento con formato, o null si el mensaje es texto plano (no ensuciamos la fila). */
  getRich: () => RichNode | null;
}

interface Props {
  initialContent?: string;
  placeholder?: string;
  showToolbar: boolean;
  disabled?: boolean;
  /** plain = texto completo; cursorPlain = offset del cursor EN texto plano (para @menciones). */
  onUpdate: (plain: string, cursorPlain: number) => void;
  onEnter: () => void;
  onPasteFiles: (files: File[]) => void;
}

const COLORES = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7", "#ec4899", "#64748b"];

const RichComposer = forwardRef<RichComposerHandle, Props>(({
  initialContent, placeholder, showToolbar, disabled, onUpdate, onEnter, onPasteFiles,
}, ref) => {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      Underline,
      TextStyle,
      Color,
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder: placeholder || "Escribe un mensaje..." }),
    ],
    content: initialContent || "",
    editorProps: {
      attributes: {
        class: "msg-composer focus:outline-none min-h-[24px] max-h-[160px] overflow-y-auto text-sm",
      },
      // Enter envía (Shift+Enter = salto de línea), igual que antes del editor rico.
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          onEnter();
          return true;
        }
        return false;
      },
      // Pegar imágenes sigue adjuntando archivos, no incrustando en el texto.
      handlePaste: (_view, event) => {
        const items = Array.from(event.clipboardData?.items ?? []);
        const files = items
          .filter((it) => it.type.startsWith("image/"))
          .map((it) => {
            const f = it.getAsFile();
            if (!f) return null;
            const ext = f.type.split("/")[1] || "png";
            return new File([f], `pasted-image-${Date.now()}.${ext}`, { type: f.type });
          })
          .filter((f): f is File => f !== null);
        if (files.length > 0) { event.preventDefault(); onPasteFiles(files); return true; }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      const plain = ed.getText({ blockSeparator: "\n" });
      const antes = ed.state.doc.textBetween(0, ed.state.selection.from, "\n", "\n");
      onUpdate(plain, antes.length);
    },
    onSelectionUpdate: ({ editor: ed }) => {
      const plain = ed.getText({ blockSeparator: "\n" });
      const antes = ed.state.doc.textBetween(0, ed.state.selection.from, "\n", "\n");
      onUpdate(plain, antes.length);
    },
  }, [placeholder]);

  useImperativeHandle(ref, () => ({
    focus: () => editor?.chain().focus().run(),
    clear: () => editor?.chain().clearContent(true).run(),
    insertText: (text: string) => editor?.chain().focus().insertContent(text).run(),
    replaceMentionToken: (tokenLen: number, insert: string) => {
      if (!editor) return;
      const to = editor.state.selection.from;
      const from = Math.max(0, to - tokenLen);
      editor.chain().focus().deleteRange({ from, to }).insertContent(insert).run();
    },
    getPlain: () => editor?.getText({ blockSeparator: "\n" }) ?? "",
    getRich: () => {
      if (!editor) return null;
      const doc = editor.getJSON() as RichNode;
      return richTieneFormato(doc) ? doc : null;
    },
  }), [editor]);

  const btn = (active: boolean) =>
    cn("h-7 w-7 rounded-md text-muted-foreground hover:text-foreground", active && "bg-primary/15 text-primary");

  const aplicarLink = () => {
    if (!editor) return;
    const v = linkValue.trim();
    if (!v) { editor.chain().focus().extendMarkRange("link").unsetLink().run(); }
    else {
      const conProtocolo = /^(https?:|mailto:)/i.test(v) ? v : `https://${v}`;
      editor.chain().focus().extendMarkRange("link").setLink({ href: conProtocolo }).run();
    }
    setLinkValue("");
    setLinkOpen(false);
  };

  return (
    <div>
      {showToolbar && editor && (
        <div className="flex flex-wrap items-center gap-0.5 px-1 pb-1.5 mb-1.5 border-b border-border/60">
          <Button type="button" variant="ghost" size="icon" className={btn(editor.isActive("bold"))} title="Negrita"
            onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-3.5 w-3.5" /></Button>
          <Button type="button" variant="ghost" size="icon" className={btn(editor.isActive("italic"))} title="Cursiva"
            onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-3.5 w-3.5" /></Button>
          <Button type="button" variant="ghost" size="icon" className={btn(editor.isActive("underline"))} title="Subrayado"
            onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon className="h-3.5 w-3.5" /></Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className={btn(editor.isActive("textStyle"))} title="Color de texto">
                <Baseline className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2" side="top" align="start">
              <div className="flex gap-1.5">
                {COLORES.map((c) => (
                  <button key={c} type="button" title={c} onClick={() => editor.chain().focus().setColor(c).run()}
                    className="h-5 w-5 rounded-full border border-border" style={{ backgroundColor: c }} />
                ))}
              </div>
              <button type="button" className="mt-2 w-full text-[11px] text-muted-foreground hover:text-foreground"
                onClick={() => editor.chain().focus().unsetColor().run()}>Quitar color</button>
            </PopoverContent>
          </Popover>

          <Button type="button" variant="ghost" size="icon" className={btn(editor.isActive("strike"))} title="Tachado"
            onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="h-3.5 w-3.5" /></Button>

          <span className="mx-1 h-4 w-px bg-border" />

          <Button type="button" variant="ghost" size="icon" className={btn(editor.isActive("bulletList"))} title="Lista con viñetas"
            onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-3.5 w-3.5" /></Button>
          <Button type="button" variant="ghost" size="icon" className={btn(editor.isActive("orderedList"))} title="Lista numerada"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-3.5 w-3.5" /></Button>
          <Button type="button" variant="ghost" size="icon" className={btn(editor.isActive("blockquote"))} title="Cita"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote className="h-3.5 w-3.5" /></Button>

          <Popover open={linkOpen} onOpenChange={(o) => { setLinkOpen(o); if (o) setLinkValue(editor.getAttributes("link").href || ""); }}>
            <PopoverTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className={btn(editor.isActive("link"))} title="Enlace">
                <Link2 className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[260px] p-2" side="top" align="start">
              <Input autoFocus value={linkValue} placeholder="https://…" className="h-8 text-xs"
                onChange={(e) => setLinkValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); aplicarLink(); } }} />
              <div className="flex justify-end gap-1.5 mt-2">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setLinkValue(""); aplicarLink(); }}>Quitar</Button>
                <Button size="sm" className="h-7 text-xs" onClick={aplicarLink}>Aplicar</Button>
              </div>
            </PopoverContent>
          </Popover>

          <span className="mx-1 h-4 w-px bg-border" />

          <Button type="button" variant="ghost" size="icon" className={btn(editor.isActive("code"))} title="Código"
            onClick={() => editor.chain().focus().toggleCode().run()}><Code className="h-3.5 w-3.5" /></Button>
          <Button type="button" variant="ghost" size="icon" className={btn(editor.isActive("codeBlock"))} title="Bloque de código"
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}><SquareCode className="h-3.5 w-3.5" /></Button>
          <Button type="button" variant="ghost" size="icon" className={btn(false)} title="Limpiar formato"
            onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}><RemoveFormatting className="h-3.5 w-3.5" /></Button>
        </div>
      )}
      <EditorContent editor={editor} className={cn(disabled && "opacity-60 pointer-events-none")} />
    </div>
  );
});

RichComposer.displayName = "RichComposer";
export default RichComposer;
