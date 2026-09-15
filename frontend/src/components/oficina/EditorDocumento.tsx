import { useEffect, useRef } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import { estaVacio, type Colaboracion } from "@/hooks/useColaboracionDocumento";
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
  colaboracion: Colaboracion | null,
) {
  const colabora = !!colaboracion;

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          // ⚠️ Con colaboración, el historial de TipTap SE APAGA: Yjs trae el
          // suyo, que sabe deshacer SOLO lo tuyo. Dejar los dos puestos hace que
          // Ctrl+Z le borre a la otra persona lo que acaba de escribir.
          ...(colabora ? { history: false as const } : {}),
        }),
        Underline,
        Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
        Placeholder.configure({ placeholder: "Escribe aquí…" }),
        ...(colaboracion
          ? [
              Collaboration.configure({ document: colaboracion.ydoc }),
              CollaborationCursor.configure({
                provider: colaboracion.provider,
                // El `id` viaja además del nombre y el color: es lo que permite
                // contar a una persona UNA vez aunque tenga dos pestañas.
                user: colaboracion.yo
                  ? {
                      id: colaboracion.yo.id,
                      name: colaboracion.yo.nombre,
                      color: colaboracion.yo.color,
                    }
                  : { id: "anon", name: "Alguien", color: "hsl(210 70% 55%)" },
              }),
            ]
          : []),
      ],
      // ⚠️ Con colaboración NO se pasa `content`: el contenido llega del
      // servidor. Pasarlo acá lo insertaría en el documento compartido en cada
      // apertura, y el texto se iría duplicando para todos.
      ...(colabora ? {} : { content: contenidoInicial }),
      editorProps: {
        attributes: {
          // `documento-maven` y no `prose`: ver la nota en index.css.
          class: "documento-maven focus:outline-none min-h-[60vh] px-1 py-2",
        },
      },
      // `getText()` y no una limpieza de HTML a mano: es lo que el propio editor
      // entiende por "el texto", y es lo que después se busca en Postgres.
      onUpdate: ({ editor: e }) => onCambio(e.getHTML(), e.getText()),
    },
    // El editor se reconstruye si aparece o desaparece la colaboración: las
    // extensiones no se pueden cambiar en caliente.
    [colabora, colaboracion?.ydoc],
  );

  // De a uno: al abrir OTRO documento el componente se reusa, y sin esto el
  // segundo se abriría con el cuerpo del primero.
  useEffect(() => {
    if (!editor || colabora) return;
    if (editor.getHTML() !== contenidoInicial) {
      editor.commands.setContent(contenidoInicial, false);
    }
    // Solo cuando cambia el documento de origen, no en cada tecla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contenidoInicial, editor, colabora]);

  // Colaborando: la SIEMBRA. Un documento escrito antes de la Fase 2 tiene su
  // HTML en la base pero ningún estado compartido. La primera persona que lo
  // abre lo pasa al documento de Yjs — una sola vez, y solo si de verdad está
  // vacío, porque hacerlo dos veces duplicaría el texto para todos.
  const sembrado = useRef(false);
  useEffect(() => {
    sembrado.current = false;
  }, [colaboracion?.ydoc]);
  useEffect(() => {
    if (!editor || !colaboracion?.sincronizado || sembrado.current) return;
    sembrado.current = true;
    if (estaVacio(colaboracion.ydoc) && contenidoInicial.trim()) {
      editor.commands.setContent(contenidoInicial, false);
    }
  }, [editor, colaboracion?.sincronizado, colaboracion?.ydoc, contenidoInicial]);

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
