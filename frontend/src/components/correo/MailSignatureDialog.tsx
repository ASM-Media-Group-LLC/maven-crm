/**
 * Editor de la firma del correo. Se abre desde la pantalla de correo; la firma
 * se guarda por usuario (RLS self) y el compositor la inserta sola al final de
 * cada mensaje.
 *
 * Editor propio (TipTap con barra mínima) y NO el del compositor: la firma es
 * un bloque corto y no necesita listas, citas ni emojis. La "hoja" es blanca,
 * igual que el compositor, porque la firma se va a leer sobre blanco.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Bold, Italic, Link2, Loader2, Palette, Underline as UnderlineIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useMailSignature, useSaveMailSignature } from "@/hooks/useMailbox";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TextStyle from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Placeholder from "@tiptap/extension-placeholder";

const COLORES = [
  "#111827", "#6b7280", "#dc2626", "#ea580c", "#16a34a", "#0891b2", "#2563eb", "#7c3aed",
];

export function MailSignatureDialog({
  abierto,
  onCerrar,
}: {
  abierto: boolean;
  onCerrar: () => void;
}) {
  const firma = useMailSignature();
  const guardar = useSaveMailSignature();
  const [enabled, setEnabled] = useState(true);
  const [url, setUrl] = useState("");
  const [linkAbierto, setLinkAbierto] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false, codeBlock: false, code: false, horizontalRule: false,
        bulletList: false, orderedList: false, blockquote: false,
      }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
      TextStyle,
      Color,
      Placeholder.configure({ placeholder: "Tu firma: nombre, cargo, teléfono…" }),
    ],
    content: "",
    editorProps: {
      // `break-words` por lo mismo que el cuerpo del correo.
      attributes: { class: "focus:outline-none min-h-[120px] text-sm leading-relaxed break-words" },
    },
  });

  // Al abrir, cargar la firma guardada en el editor y el interruptor. Se hace
  // en un efecto (y no en `content`) porque el dato llega asincrónico y el
  // editor ya está montado.
  useEffect(() => {
    if (!abierto || !editor || firma.isLoading) return;
    editor.commands.setContent(firma.data?.html || "");
    setEnabled(firma.data?.enabled ?? true);
  }, [abierto, editor, firma.isLoading, firma.data]);

  const aplicarLink = () => {
    const v = url.trim();
    if (v) {
      editor?.chain().focus().extendMarkRange("link").setLink({ href: v }).run();
    } else {
      editor?.chain().focus().extendMarkRange("link").unsetLink().run();
    }
    setLinkAbierto(false);
    setUrl("");
  };

  const onGuardar = async () => {
    if (!editor) return;
    try {
      // Editor vacío devuelve "<p></p>": se guarda como "" para que cuente
      // como "sin firma" y no inserte un párrafo huérfano.
      const html = editor.isEmpty ? "" : editor.getHTML();
      await guardar.mutateAsync({ html, enabled });
      toast.success("Firma guardada");
      onCerrar();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const btn = "flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="w-[min(96vw,40rem)] max-w-xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border/60 px-5 py-3">
          <DialogTitle className="text-base">Firma del correo</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Se agrega sola al final de cada correo que redactes o respondas.
          </p>
        </DialogHeader>

        {/* Barra mínima */}
        <div className="flex items-center gap-1 border-b border-border/40 px-3 py-1.5">
          <button
            type="button" title="Negrita" aria-label="Negrita"
            aria-pressed={editor?.isActive("bold")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor?.chain().focus().toggleBold().run()}
            className={cn(btn, editor?.isActive("bold") && "bg-primary/15 text-primary")}
          >
            <Bold className="h-4 w-4" />
          </button>
          <button
            type="button" title="Cursiva" aria-label="Cursiva"
            aria-pressed={editor?.isActive("italic")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            className={cn(btn, editor?.isActive("italic") && "bg-primary/15 text-primary")}
          >
            <Italic className="h-4 w-4" />
          </button>
          <button
            type="button" title="Subrayado" aria-label="Subrayado"
            aria-pressed={editor?.isActive("underline")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
            className={cn(btn, editor?.isActive("underline") && "bg-primary/15 text-primary")}
          >
            <UnderlineIcon className="h-4 w-4" />
          </button>

          <Popover open={linkAbierto} onOpenChange={(v) => {
            if (v) setUrl((editor?.getAttributes("link").href as string) ?? "");
            setLinkAbierto(v);
          }}>
            <PopoverTrigger asChild>
              <button
                type="button" title="Insertar link" aria-label="Insertar link"
                aria-pressed={editor?.isActive("link")}
                onMouseDown={(e) => e.preventDefault()}
                className={cn(btn, editor?.isActive("link") && "bg-primary/15 text-primary")}
              >
                <Link2 className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-2" onOpenAutoFocus={(e) => e.preventDefault()}>
              <div className="flex gap-2">
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && aplicarLink()}
                  placeholder="https://…"
                  className="h-8 flex-1 rounded-md border border-border bg-transparent px-2 text-sm outline-none"
                />
                <Button size="sm" className="h-8" onClick={aplicarLink}>Aplicar</Button>
              </div>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <button type="button" title="Color de texto" aria-label="Color de texto" className={btn} onMouseDown={(e) => e.preventDefault()}>
                <Palette className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2">
              <div className="flex gap-1.5">
                {COLORES.map((c) => (
                  <button
                    key={c} type="button" title={c} aria-label={`Color ${c}`}
                    onClick={() => editor?.chain().focus().setColor(c).run()}
                    className="h-6 w-6 rounded-full border border-black/10"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Hoja blanca, como el compositor */}
        <div className="bg-white px-5 py-4">
          <div
            className={cn("text-[#1f2937]", "[&_a]:text-[#4f46e5] [&_a]:underline", "[&_p]:my-1", "[&_.is-editor-empty]:before:text-neutral-400")}
            onClick={() => editor?.chain().focus().run()}
          >
            <EditorContent editor={editor} />
          </div>
        </div>

        <label className="flex items-center gap-2 border-t border-border/40 px-5 py-3 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          Agregar la firma automáticamente a cada correo
        </label>

        <DialogFooter className="border-t border-border/60 px-5 py-3">
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={onGuardar} disabled={guardar.isPending}>
            {guardar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar firma
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
