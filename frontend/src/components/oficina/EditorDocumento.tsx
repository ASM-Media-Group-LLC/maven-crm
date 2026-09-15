import { useEffect } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  List, ListOrdered, Quote, Code2, Undo2, Redo2, Heading1, Heading2, Heading3, Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** El editor del documento. Mismas extensiones que el compositor del Correo, más
 *  las que allá no tienen sentido y acá sí: títulos, cita, línea y bloque de
 *  código. Un procedimiento sin títulos es una pared de texto. */
export function useEditorDocumento(
  contenidoInicial: string,
  onCambio: (html: string, texto: string) => void,
) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
      Placeholder.configure({ placeholder: "Escribe aquí…" }),
    ],
    content: contenidoInicial,
    editorProps: {
      attributes: {
        // `documento-maven` y no `prose`: ver la nota en index.css.
        class: "documento-maven focus:outline-none min-h-[60vh] px-1 py-2",
      },
    },
    // `getText()` y no una limpieza de HTML a mano: es lo que el propio editor
    // entiende por "el texto", y es lo que después se busca en Postgres.
    onUpdate: ({ editor: e }) => onCambio(e.getHTML(), e.getText()),
  });

  // Al abrir OTRO documento el componente se reusa; sin esto el segundo se
  // abriría con el cuerpo del primero.
  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== contenidoInicial) {
      editor.commands.setContent(contenidoInicial, false);
    }
    // Solo cuando cambia el documento de origen, no en cada tecla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contenidoInicial, editor]);

  return editor;
}

function Boton({
  activo, onClick, titulo, children, deshabilitado,
}: {
  activo?: boolean;
  onClick: () => void;
  titulo: string;
  children: React.ReactNode;
  deshabilitado?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      aria-label={titulo}
      aria-pressed={activo}
      disabled={deshabilitado}
      className={cn(
        "grid h-8 w-8 place-items-center rounded-control transition-colors",
        "hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40",
        activo && "bg-primary/15 text-primary",
      )}
    >
      {children}
    </button>
  );
}

function Separador() {
  return <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden="true" />;
}

export function BarraDeFormato({ editor }: { editor: Editor | null }) {
  if (!editor) return null;
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border/60 px-2 py-1.5">
      <Boton
        titulo="Deshacer"
        deshabilitado={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <Undo2 className="h-4 w-4" />
      </Boton>
      <Boton
        titulo="Rehacer"
        deshabilitado={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      >
        <Redo2 className="h-4 w-4" />
      </Boton>

      <Separador />

      <Boton titulo="Título 1" activo={editor.isActive("heading", { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
        <Heading1 className="h-4 w-4" />
      </Boton>
      <Boton titulo="Título 2" activo={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 className="h-4 w-4" />
      </Boton>
      <Boton titulo="Título 3" activo={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        <Heading3 className="h-4 w-4" />
      </Boton>

      <Separador />

      <Boton titulo="Negrita" activo={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="h-4 w-4" />
      </Boton>
      <Boton titulo="Cursiva" activo={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="h-4 w-4" />
      </Boton>
      <Boton titulo="Subrayado" activo={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <UnderlineIcon className="h-4 w-4" />
      </Boton>
      <Boton titulo="Tachado" activo={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}>
        <Strikethrough className="h-4 w-4" />
      </Boton>

      <Separador />

      <Boton titulo="Lista" activo={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List className="h-4 w-4" />
      </Boton>
      <Boton titulo="Lista numerada" activo={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered className="h-4 w-4" />
      </Boton>
      <Boton titulo="Cita" activo={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote className="h-4 w-4" />
      </Boton>
      <Boton titulo="Bloque de código" activo={editor.isActive("codeBlock")}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
        <Code2 className="h-4 w-4" />
      </Boton>
      <Boton titulo="Línea divisoria"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}>
        <Minus className="h-4 w-4" />
      </Boton>
    </div>
  );
}

export function CuerpoDelEditor({ editor }: { editor: Editor | null }) {
  return <EditorContent editor={editor} />;
}
