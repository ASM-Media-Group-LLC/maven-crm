import { forwardRef, useImperativeHandle, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useEditor, EditorContent, type JSONContent } from "@tiptap/react";
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
import { ListaConVinetasPorLinea, ListaNumeradaPorLinea } from "./listasPorLinea";
import { useLanguage } from "@/hooks/useLanguage";

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
  /** Documento completo tal cual (con o sin formato), para guardar el borrador. */
  getDoc: () => JSONContent | null;
  /** Reemplaza todo por este documento (un mensaje programado que se vuelve a
   *  editar). Avisa el cambio como si se hubiera escrito: el borrador se guarda. */
  ponerDoc: (doc: JSONContent) => void;
}

interface Props {
  /** Borrador a restaurar. Es un DOCUMENTO, no texto: TipTap lee un string como
   *  HTML y los "\n" se vuelven espacios (el borrador volvía en un solo párrafo). */
  initialContent?: JSONContent | null;
  placeholder?: string;
  showToolbar: boolean;
  disabled?: boolean;
  /** plain = texto completo; cursorPlain = offset del cursor EN texto plano (para @menciones). */
  /** `cambioDeTexto` distingue escribir de solo mover el cursor. */
  onUpdate: (plain: string, cursorPlain: number, cambioDeTexto: boolean, doc: JSONContent) => void;
  onEnter: () => void;
  onPasteFiles: (files: File[]) => void;
}

const COLORES = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7", "#ec4899", "#64748b"];

const RichComposer = forwardRef<RichComposerHandle, Props>(({
  initialContent, placeholder, showToolbar, disabled, onUpdate, onEnter, onPasteFiles,
}, ref) => {
  const { t } = useLanguage();
  const [linkOpen, setLinkOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  // Posición del cursor ANTES de abrir el panel del enlace: ahí el foco se va sí
  // o sí (hay que poder escribir la URL), así que la guardamos para volver a ella
  // al aplicar. El panel de color no la necesita: nunca se lleva el foco.
  const selGuardadaRef = useRef<{ from: number; to: number } | null>(null);
  const [linkValue, setLinkValue] = useState("");

  // El editor de TipTap se crea UNA vez, así que sus editorProps capturan los
  // callbacks del PRIMER render. Sin estas refs, Enter llamaba a un handleSend
  // viejo que creía que el texto estaba vacío y no enviaba nada.
  const onEnterRef = useRef(onEnter);
  onEnterRef.current = onEnter;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const onPasteFilesRef = useRef(onPasteFiles);
  onPasteFilesRef.current = onPasteFiles;
  // El editor se usa dentro de editorProps (que se captura al crearlo) → ref viva.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null);

  const editor = useEditor({
    extensions: [
      // Las listas del StarterKit envuelven el PÁRRAFO entero, y aquí los
      // renglones se hacen con Shift+Enter (Enter envía), que no crea párrafos:
      // numerar una línea numeraba también la introducción de arriba. Las de
      // `listasPorLinea` toman solo la línea (o las líneas seleccionadas).
      StarterKit.configure({ heading: false, bulletList: false, orderedList: false }),
      ListaConVinetasPorLinea,
      ListaNumeradaPorLinea,
      Underline,
      TextStyle,
      Color,
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder: placeholder || t("messenger.input.placeholder") }),
    ],
    content: initialContent ?? "",
    editorProps: {
      attributes: {
        class: "msg-composer focus:outline-none min-h-[24px] max-h-[160px] overflow-y-auto text-sm",
      },
      // Enter envía (Shift+Enter = salto de línea), igual que antes del editor rico.
      handleKeyDown: (view, event) => {
        // Cmd/Ctrl+Enter SIEMPRE envía: salida garantizada desde cualquier bloque.
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          onEnterRef.current();
          return true;
        }
        if (event.key === "Enter" && !event.shiftKey) {
          // Dentro de una LISTA, CITA o BLOQUE DE CÓDIGO, Enter tiene que hacer lo
          // suyo (siguiente viñeta / salto de línea), no enviar: si no, nunca se
          // puede escribir el segundo punto de una lista. TipTap ya sabe hacerlo,
          // y en una viñeta vacía Enter sale de la lista. Fuera de esos bloques,
          // Enter envía como siempre.
          const { $from } = view.state.selection;
          let dentroDeCita = false;
          for (let d = $from.depth; d > 0; d--) {
            const nombre = $from.node(d).type.name;
            if (nombre === "blockquote") dentroDeCita = true;
            if (nombre === "listItem" || nombre === "codeBlock" || nombre === "blockquote") {
              // En una CITA, TipTap no sale solo con un párrafo vacío (a diferencia de las
              // listas): se quedaba encerrado para siempre y encima no se podía enviar.
              // Con el párrafo vacío, Enter levanta el bloque y sale de la cita.
              if (dentroDeCita && $from.parent.content.size === 0) {
                event.preventDefault();
                const ed = editorRef.current;
                if (ed) ed.chain().focus().lift("blockquote").run();
                return true;
              }
              return false;
            }
          }
          event.preventDefault();
          onEnterRef.current();
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
        if (files.length > 0) { event.preventDefault(); onPasteFilesRef.current(files); return true; }
        return false;
      },
    },
    // El tercer argumento dice si CAMBIÓ EL TEXTO o solo se movió el cursor.
    // Las dos cosas hacen falta (las @menciones necesitan la posición del cursor
    // aunque no se escriba), pero solo la primera es "estar escribiendo": sin
    // distinguirlas, hacer clic en el cajón ya te anunciaba como escribiendo.
    onUpdate: ({ editor: ed }) => {
      const plain = ed.getText({ blockSeparator: "\n" });
      const antes = ed.state.doc.textBetween(0, ed.state.selection.from, "\n", "\n");
      onUpdateRef.current(plain, antes.length, true, ed.getJSON());
    },
    onSelectionUpdate: ({ editor: ed }) => {
      const plain = ed.getText({ blockSeparator: "\n" });
      const antes = ed.state.doc.textBetween(0, ed.state.selection.from, "\n", "\n");
      onUpdateRef.current(plain, antes.length, false, ed.getJSON());
    },
  }, [placeholder]);

  editorRef.current = editor;

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
    getDoc: () => editor?.getJSON() ?? null,
    ponerDoc: (doc: JSONContent) => editor?.chain().setContent(doc, true).focus("end").run(),
  }), [editor]);

  const btn = (active: boolean) =>
    cn("h-7 w-7 rounded-md text-muted-foreground hover:text-foreground", active && "bg-primary/15 text-primary");

  // Al hacer clic, el botón se llevaba el foco del editor. Con una SELECCIÓN el
  // navegador la conserva (por eso negrita/cursiva/subrayado sí funcionaban),
  // pero un CURSOR VACÍO se pierde al desenfocar y ProseMirror lo recupera al
  // PRINCIPIO del documento: la viñeta, la cita o el bloque de código se
  // aplicaban arriba de todo en vez de donde estaba el cursor. Mismo arreglo que
  // el chip de emoji del Chatter Evaluator: no dejar que el botón tome el foco.
  const sinRobarFoco = (e: ReactMouseEvent) => e.preventDefault();

  const guardarSeleccion = () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    selGuardadaRef.current = { from, to };
  };

  // OJO al devolver el foco tras cerrar un popover: `editor.chain().focus()`
  // dispara una transacción que REPONE la selección, y reponer la selección
  // BORRA las marcas pendientes de ProseMirror (el formato elegido para el texto
  // que todavía no se escribió). Por eso elegir un color no pintaba nada: se
  // aplicaba y acto seguido se descartaba. `editor.view.focus()` enfoca sin
  // transacción y las conserva.

  /** Cadena que arranca donde estaba el cursor antes de abrir el popover. */
  const cadenaEnSeleccion = () => {
    const c = editor!.chain().focus();
    const s = selGuardadaRef.current;
    return s ? c.setTextSelection(s) : c;
  };

  const aplicarLink = () => {
    if (!editor) return;
    const v = linkValue.trim();
    // El campo de la URL necesita el foco para poder escribir, así que la posición
    // del cursor ya no sirve: usamos la que guardamos al abrir el popover.
    const sel = selGuardadaRef.current;
    if (!v) { cadenaEnSeleccion().extendMarkRange("link").unsetLink().run(); }
    else {
      const conProtocolo = /^(https?:|mailto:)/i.test(v) ? v : `https://${v}`;
      if (!sel || sel.from === sel.to) {
        // Sin texto seleccionado, setLink no tenía a qué aplicarse y el botón "no hacía
        // nada". Ahora se inserta la propia URL ya enlazada.
        cadenaEnSeleccion().insertContent({
          type: "text", text: conProtocolo,
          marks: [{ type: "link", attrs: { href: conProtocolo } }],
        }).run();
      } else {
        cadenaEnSeleccion().extendMarkRange("link").setLink({ href: conProtocolo }).run();
      }
    }
    setLinkValue("");
    setLinkOpen(false);
  };

  return (
    <div>
      {showToolbar && editor && (
        <div className="flex flex-wrap items-center gap-0.5 px-1 pb-1.5 mb-1.5 border-b border-border/60">
          <Button type="button" onMouseDown={sinRobarFoco} variant="ghost" size="icon" className={btn(editor.isActive("bold"))} title={t("messenger.rich.negrita")}
            onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-3.5 w-3.5" /></Button>
          <Button type="button" onMouseDown={sinRobarFoco} variant="ghost" size="icon" className={btn(editor.isActive("italic"))} title={t("messenger.rich.cursiva")}
            onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-3.5 w-3.5" /></Button>
          <Button type="button" onMouseDown={sinRobarFoco} variant="ghost" size="icon" className={btn(editor.isActive("underline"))} title={t("messenger.rich.subrayado")}
            onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon className="h-3.5 w-3.5" /></Button>

          <Popover open={colorOpen} onOpenChange={setColorOpen}>
            <PopoverTrigger asChild>
              <Button type="button" onMouseDown={sinRobarFoco} variant="ghost" size="icon" className={btn(editor.isActive("textStyle"))} title={t("messenger.rich.colorDeTexto")}>
                <Baseline className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            {/* El panel NO se lleva el foco (ni al abrir, ni al cerrar, ni al tocar
                un color): el editor lo conserva todo el tiempo, así que elegir un
                color se comporta igual que el botón de negrita. Si el foco se va y
                vuelve, ProseMirror descarta el formato pendiente —el que se aplica
                al texto que todavía no se escribió— y el color no pintaba nada. */}
            <PopoverContent className="w-auto p-2" side="top" align="start"
              onOpenAutoFocus={(e) => e.preventDefault()}
              onCloseAutoFocus={(e) => e.preventDefault()}>
              <div className="flex gap-1.5">
                {COLORES.map((c) => (
                  <button key={c} type="button" title={c} onMouseDown={sinRobarFoco}
                    onClick={() => { editor.chain().focus().setColor(c).run(); setColorOpen(false); }}
                    className="h-5 w-5 rounded-full border border-border" style={{ backgroundColor: c }} />
                ))}
              </div>
              <button type="button" className="mt-2 w-full text-[11px] text-muted-foreground hover:text-foreground"
                onMouseDown={sinRobarFoco}
                onClick={() => { editor.chain().focus().unsetColor().run(); setColorOpen(false); }}>{t("messenger.rich.quitarColor")}</button>
            </PopoverContent>
          </Popover>

          <Button type="button" onMouseDown={sinRobarFoco} variant="ghost" size="icon" className={btn(editor.isActive("strike"))} title={t("messenger.rich.tachado")}
            onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="h-3.5 w-3.5" /></Button>

          <span className="mx-1 h-4 w-px bg-border" />

          <Button type="button" onMouseDown={sinRobarFoco} variant="ghost" size="icon" className={btn(editor.isActive("bulletList"))} title={t("messenger.rich.listaVinetas")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-3.5 w-3.5" /></Button>
          <Button type="button" onMouseDown={sinRobarFoco} variant="ghost" size="icon" className={btn(editor.isActive("orderedList"))} title={t("messenger.rich.listaNumerada")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-3.5 w-3.5" /></Button>
          <Button type="button" onMouseDown={sinRobarFoco} variant="ghost" size="icon" className={btn(editor.isActive("blockquote"))} title={t("messenger.rich.cita")}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote className="h-3.5 w-3.5" /></Button>

          <Popover open={linkOpen} onOpenChange={(o) => { setLinkOpen(o); if (o) setLinkValue(editor.getAttributes("link").href || ""); }}>
            <PopoverTrigger asChild>
              <Button type="button" onMouseDown={(e) => { sinRobarFoco(e); guardarSeleccion(); }} variant="ghost" size="icon" className={btn(editor.isActive("link"))} title={t("messenger.rich.enlace")}>
                <Link2 className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[260px] p-2" side="top" align="start"
              onCloseAutoFocus={(e) => { e.preventDefault(); editor.view.focus(); }}>
              <Input autoFocus value={linkValue} placeholder="https://…" className="h-8 text-xs"
                onChange={(e) => setLinkValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); aplicarLink(); } }} />
              <div className="flex justify-end gap-1.5 mt-2">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setLinkValue(""); aplicarLink(); }}>{t("messenger.thread.quitar")}</Button>
                <Button size="sm" className="h-7 text-xs" onClick={aplicarLink}>{t("messenger.rich.aplicar")}</Button>
              </div>
            </PopoverContent>
          </Popover>

          <span className="mx-1 h-4 w-px bg-border" />

          <Button type="button" onMouseDown={sinRobarFoco} variant="ghost" size="icon" className={btn(editor.isActive("code"))} title={t("common.code")}
            onClick={() => editor.chain().focus().toggleCode().run()}><Code className="h-3.5 w-3.5" /></Button>
          <Button type="button" onMouseDown={sinRobarFoco} variant="ghost" size="icon" className={btn(editor.isActive("codeBlock"))} title={t("messenger.rich.bloqueDeCodigo")}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}><SquareCode className="h-3.5 w-3.5" /></Button>
          <Button type="button" onMouseDown={sinRobarFoco} variant="ghost" size="icon" className={btn(false)} title={t("messenger.rich.limpiarFormato")}
            onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}><RemoveFormatting className="h-3.5 w-3.5" /></Button>
        </div>
      )}
      <EditorContent editor={editor} className={cn(disabled && "opacity-60 pointer-events-none")} />
    </div>
  );
});

RichComposer.displayName = "RichComposer";
export default RichComposer;
