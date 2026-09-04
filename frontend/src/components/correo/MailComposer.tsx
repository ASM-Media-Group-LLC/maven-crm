import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Palette,
  Paperclip,
  Redo2,
  RemoveFormatting,
  Send,
  Smile,
  Strikethrough,
  TextQuote,
  Trash2,
  Type,
  Underline as UnderlineIcon,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useSendMail, useSaveServerDraft, useDeleteServerDraft } from "@/hooks/useMailbox";
import { cn } from "@/lib/utils";
import { escapar, escaparAtributo, htmlParaCorreo, textoParaCorreo } from "./mailHtml";
import RecipientsField from "./RecipientsField";
import { useSugerenciasDestinatarios } from "@/hooks/useSugerenciasDestinatarios";
import {
  borrarBorrador,
  firmaContexto,
  guardarBorrador,
  leerBorrador,
} from "@/lib/mailDraft";

import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TextStyle from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Placeholder from "@tiptap/extension-placeholder";
import { Extension } from "@tiptap/core";

/**
 * Redactar y responder, con editor rico (negrita, listas, links, color,
 * emojis...) al estilo Gmail pero en la piel de Maven.
 *
 * El remitente NO se elige ni se manda: la edge function lo toma siempre de
 * la credencial del usuario. Por eso acá no hay campo "De" — no es una
 * simplificación de la interfaz, es que dejarlo elegir permitiría mandar
 * correo haciéndose pasar por otra persona de la empresa.
 */

export interface BorradorInicial {
  to?: string;
  cc?: string;
  subject?: string;
  /** Cuerpo del correo al que se responde, para citarlo abajo. */
  citar?: { de: string; fecha: string; texto: string };
  inReplyTo?: string;
  references?: string;
  /** Cuerpo HTML ya armado, para RETOMAR un borrador del servidor (en vez de
   *  construirlo desde cita/firma). */
  cuerpoHtml?: string;
  /** UID del borrador en el servidor que se está retomando: al re-guardar se
   *  reemplaza y al enviar se borra. */
  serverDraftUid?: number;
}

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  inicial?: BorradorInicial;
  /** Casilla desde la que sale, solo para mostrarla. */
  remitente: string;
  /** HTML de la firma a insertar sola al final del cuerpo. Vacío/undefined =
   *  sin firma (no configurada o desactivada). */
  firma?: string;
}

/* ── Tamaño de letra: extensión mínima sobre textStyle ─────────────────── */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (size: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
  }
}

const FontSize = Extension.create({
  name: "fontSize",
  addOptions() {
    return { types: ["textStyle"] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (el) => (el as HTMLElement).style.fontSize || null,
            renderHTML: (attrs) =>
              attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {},
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize:
        (size) =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize: size }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});

/* ── Utilidades ─────────────────────────────────────────────────────────── */

/** Separa direcciones escritas con coma, punto y coma o espacios. */
function partirDirecciones(v: string): string[] {
  return v
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const ES_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Tope total de adjuntos por correo. Coincide con el que valida la edge; el
 *  base64 pesa ~4/3, así que 15 MB de archivo son ~20 MB en el request. */
const TOPE_ADJUNTOS = 15 * 1024 * 1024;

/** Lee un archivo a base64 SIN el prefijo `data:<tipo>;base64,`. */
function leerBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const res = String(fr.result);
      const coma = res.indexOf(",");
      resolve(coma >= 0 ? res.slice(coma + 1) : res);
    };
    fr.onerror = () => reject(new Error("no se pudo leer el archivo"));
    fr.readAsDataURL(file);
  });
}

/* ── Paleta y emojis (sin dependencias) ─────────────────────────────────── */

// La paleta son tintas para FONDO BLANCO, porque así se va a ver el correo en
// Gmail/Outlook. Por eso el área de escritura se pinta blanca aunque Maven
// esté en oscuro (que es su tema por defecto): si el editor fuera oscuro,
// elegir "negro" dejaría el texto invisible mientras se escribe y perfecto
// para quien lo recibe. Escribir sobre papel blanco es lo honesto: se ve
// exactamente lo que va a llegar.
const COLORES = [
  ["#111827", "#6b7280", "#dc2626", "#ea580c", "#d97706", "#16a34a", "#0891b2", "#2563eb"],
  ["#7c3aed", "#c026d3", "#db2777", "#9ca3af", "#f87171", "#fbbf24", "#4ade80", "#60a5fa"],
];

const EMOJIS: Array<{ grupo: string; lista: string[] }> = [
  {
    grupo: "Caritas",
    lista: ["😀", "😁", "😂", "🤣", "😊", "😍", "🥰", "😘", "😎", "🤩", "🥳", "😅", "😉", "🙃", "🤔", "🤯", "😳", "🥺", "😢", "😭", "😤", "😡", "😴", "🤒", "🥴", "😇", "🤗", "🤫", "🙄", "😬", "🫠", "💀"],
  },
  {
    grupo: "Gestos",
    lista: ["👍", "👎", "👌", "🤌", "✌️", "🤞", "🤟", "🤙", "👏", "🙌", "🤝", "🙏", "💪", "👀", "🫡", "👋", "☝️", "👉", "👈", "🫶", "✍️", "🤲", "🖖", "🤘"],
  },
  {
    grupo: "Corazones",
    lista: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💖", "💘", "💝", "💕", "💞", "💗", "💔", "❣️"],
  },
  {
    grupo: "Trabajo",
    lista: ["✅", "❌", "⚠️", "📌", "📎", "📈", "📉", "📊", "💼", "🗂️", "📁", "📄", "📝", "💰", "💵", "🧾", "📅", "⏰", "🚀", "🎯", "🏆", "🔥", "⭐", "✨", "💡", "🔔", "📣", "🔒", "🔑", "⚙️", "🛠️", "💻"],
  },
  {
    grupo: "Festejo y varios",
    lista: ["🎉", "🎁", "🥂", "🍾", "🎂", "☕", "🍕", "🌮", "🍔", "💯", "❓", "❗", "➕", "➖", "🔁", "🆗", "🆕", "🌎"],
  },
];

const TAMANOS: Array<{ etiqueta: string; valor: string | null }> = [
  { etiqueta: "Pequeño", valor: "12px" },
  { etiqueta: "Normal", valor: null },
  { etiqueta: "Grande", valor: "18px" },
  { etiqueta: "Enorme", valor: "24px" },
];

/* ── Piezas de la barra ─────────────────────────────────────────────────── */

function BotonBarra({
  activo,
  onClick,
  titulo,
  disabled,
  children,
}: {
  activo?: boolean;
  onClick: () => void;
  titulo: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      // El estado activo se comunicaba SOLO con un tinte del 15%: un lector
      // de pantalla no podía decir si negrita estaba puesta.
      aria-pressed={activo}
      disabled={disabled}
      // onMouseDown con preventDefault: si no, el click roba el foco del
      // editor y se pierde la selección sobre la que se aplica el formato.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors",
        "hover:bg-muted hover:text-foreground disabled:opacity-40",
        activo && "bg-primary/15 text-primary",
      )}
    >
      {children}
    </button>
  );
}

function Separador() {
  return <div className="mx-0.5 h-5 w-px shrink-0 bg-border" />;
}

function BarraFormato({ editor }: { editor: Editor }) {
  const [url, setUrl] = useState("");
  const [linkAbierto, setLinkAbierto] = useState(false);

  // Al abrir con el cursor sobre un link, se precarga su href: antes el
  // campo salía vacío y "Aplicar" no hacía nada, así que un link mal escrito
  // solo se podía quitar y volver a tipear entero.
  const abrirLink = (abierto: boolean) => {
    if (abierto) setUrl((editor.getAttributes("link").href as string) ?? "");
    setLinkAbierto(abierto);
  };

  const aplicarLink = () => {
    const limpia = url.trim();
    if (!limpia) return;
    const conProtocolo = /^https?:\/\//i.test(limpia) ? limpia : `https://${limpia}`;
    if (editor.state.selection.empty) {
      // Sin selección: se inserta el link como texto clickeable.
      editor
        .chain()
        .focus()
        .insertContent(
          `<a href="${escaparAtributo(conProtocolo)}">${escapar(limpia)}</a> `,
        )
        .run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: conProtocolo }).run();
    }
    setUrl("");
    setLinkAbierto(false);
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
      <BotonBarra
        titulo="Deshacer"
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
      >
        <Undo2 className="h-4 w-4" />
      </BotonBarra>
      <BotonBarra
        titulo="Rehacer"
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
      >
        <Redo2 className="h-4 w-4" />
      </BotonBarra>

      <Separador />

      {/* Tamaño de letra */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            title="Tamaño de letra"
            onMouseDown={(e) => e.preventDefault()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Type className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-36 p-1" align="start">
          {TAMANOS.map((t) => (
            <button
              key={t.etiqueta}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (t.valor) editor.chain().focus().setFontSize(t.valor).run();
                else editor.chain().focus().unsetFontSize().run();
              }}
              className="block w-full rounded-md px-3 py-1.5 text-left hover:bg-muted"
              style={{ fontSize: t.valor ?? "14px" }}
            >
              {t.etiqueta}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      <Separador />

      <BotonBarra
        titulo="Negrita"
        activo={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="h-4 w-4" />
      </BotonBarra>
      <BotonBarra
        titulo="Cursiva"
        activo={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="h-4 w-4" />
      </BotonBarra>
      <BotonBarra
        titulo="Subrayado"
        activo={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon className="h-4 w-4" />
      </BotonBarra>
      <BotonBarra
        titulo="Tachado"
        activo={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough className="h-4 w-4" />
      </BotonBarra>

      {/* Color de texto */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            title="Color de texto"
            onMouseDown={(e) => e.preventDefault()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Palette className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start">
          <div className="flex flex-col gap-1.5">
            {COLORES.map((fila, i) => (
              <div key={i} className="flex gap-1.5">
                {fila.map((c) => (
                  <button
                    key={c}
                    type="button"
                    title={c}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => editor.chain().focus().setColor(c).run()}
                    className="h-6 w-6 rounded-full border border-border/60 transition-transform hover:scale-110"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            ))}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().unsetColor().run()}
              className="mt-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              Color automático
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <Separador />

      <BotonBarra
        titulo="Lista con viñetas"
        activo={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="h-4 w-4" />
      </BotonBarra>
      <BotonBarra
        titulo="Lista numerada"
        activo={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="h-4 w-4" />
      </BotonBarra>
      <BotonBarra
        titulo="Cita"
        activo={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <TextQuote className="h-4 w-4" />
      </BotonBarra>

      <Separador />

      {/* Link */}
      <Popover open={linkAbierto} onOpenChange={abrirLink}>
        <PopoverTrigger asChild>
          <button
            type="button"
            title="Insertar link"
            onMouseDown={(e) => e.preventDefault()}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              editor.isActive("link") && "bg-primary/15 text-primary",
            )}
          >
            <Link2 className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-2" align="start">
          <div className="flex gap-2">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && aplicarLink()}
              placeholder="https://…"
              className="h-8"
              autoFocus
            />
            <Button size="sm" className="h-8" onClick={aplicarLink}>
              Aplicar
            </Button>
          </div>
          {editor.isActive("link") && (
            <button
              type="button"
              onClick={() => {
                editor.chain().focus().extendMarkRange("link").unsetLink().run();
                setLinkAbierto(false);
              }}
              className="mt-2 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              Quitar link de la selección
            </button>
          )}
        </PopoverContent>
      </Popover>

      {/* Emojis */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            title="Emoji"
            onMouseDown={(e) => e.preventDefault()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Smile className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        {/* onFocusOutside: al insertar, TipTap manda el foco al editor por
            requestAnimationFrame; el Popover de Radix (no-modal) lo lee como
            "foco afuera" y se cerraba tras CADA emoji, obligando a reabrir y
            volver a scrollear. Escape y click afuera lo siguen cerrando. */}
        <PopoverContent
          className="w-80 p-0"
          align="start"
          onFocusOutside={(e) => e.preventDefault()}
        >
          <div className="max-h-64 overflow-y-auto p-2">
            {EMOJIS.map((seccion) => (
              <div key={seccion.grupo}>
                <p className="px-1 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground first:pt-0">
                  {seccion.grupo}
                </p>
                <div className="grid grid-cols-8">
                  {seccion.lista.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onMouseDown={(ev) => ev.preventDefault()}
                      onClick={() => editor.chain().focus().insertContent(e).run()}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-xl hover:bg-muted"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <Separador />

      <BotonBarra
        titulo="Limpiar formato"
        onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
      >
        <RemoveFormatting className="h-4 w-4" />
      </BotonBarra>
    </div>
  );
}

/* ── El compositor ──────────────────────────────────────────────────────── */

export function MailComposer({ abierto, onCerrar, inicial, remitente, firma: firmaHtml }: Props) {
  // Firma del contexto (nuevo vs. responder a tal hilo) y borrador guardado
  // para ese contexto. Se lee UNA vez al montar: el compositor se monta de
  // cero en cada apertura, así que no hace falta re-leer.
  const firma = firmaContexto(inicial?.inReplyTo);
  // Al RETOMAR un borrador del servidor (`cuerpoHtml`), no se recupera el
  // local: el contenido bueno es el que vino del servidor.
  const recuperado = useMemo(
    () => (inicial?.cuerpoHtml ? null : leerBorrador(remitente, firma)),
    [remitente, firma, inicial?.cuerpoHtml],
  );
  // UID del borrador del servidor que se está editando (si se retomó uno): al
  // re-guardar se reemplaza, al enviar se borra.
  const serverUid = inicial?.serverDraftUid;
  const guardarServidor = useSaveServerDraft();
  const borrarServidor = useDeleteServerDraft();

  // Arranca del borrador guardado si lo hay; si no, de lo que traiga `inicial`
  // (una respuesta prellena Para/Asunto/cita).
  // Compañeros + listas por rol + a quién ya le escribiste. Se comparte entre
  // Para/Cc/Cco: una sola consulta para los tres campos.
  const sugerencias = useSugerenciasDestinatarios();
  const [to, setTo] = useState(recuperado?.to ?? inicial?.to ?? "");
  const [cc, setCc] = useState(recuperado?.cc ?? inicial?.cc ?? "");
  const [bcc, setBcc] = useState(recuperado?.bcc ?? "");
  const [verCc, setVerCc] = useState(!!(recuperado?.cc ?? inicial?.cc));
  const [verBcc, setVerBcc] = useState(!!recuperado?.bcc);
  const [subject, setSubject] = useState(recuperado?.subject ?? inicial?.subject ?? "");
  const [avisoRecuperado, setAvisoRecuperado] = useState(!!recuperado);
  // Los adjuntos NO se guardan en el borrador (el base64 es pesado para
  // localStorage): recuperar un borrador no los trae de vuelta.
  const [adjuntos, setAdjuntos] = useState<
    Array<{ filename: string; contentType: string; sizeBytes: number; contentBase64: string }>
  >([]);
  const inputArchivo = useRef<HTMLInputElement>(null);
  const enviar = useSendMail();

  // Suma los archivos elegidos, leídos a base64. Se valida el tamaño ANTES de
  // leer: un archivo gigante colgaría el navegador cargándolo a memoria solo
  // para rechazarlo después.
  const agregarArchivos = async (files: FileList | null) => {
    if (!files?.length) return;
    const elegidos = Array.from(files);
    const yaHay = adjuntos.reduce((n, a) => n + a.sizeBytes, 0);
    const total = yaHay + elegidos.reduce((n, f) => n + f.size, 0);
    if (total > TOPE_ADJUNTOS) {
      toast.error("Los adjuntos superan el límite de 15 MB.");
      return;
    }
    try {
      const nuevos = await Promise.all(
        elegidos.map(async (f) => ({
          filename: f.name,
          contentType: f.type || "application/octet-stream",
          sizeBytes: f.size,
          contentBase64: await leerBase64(f),
        })),
      );
      setAdjuntos((prev) => [...prev, ...nuevos]);
    } catch {
      toast.error("No se pudo leer alguno de los archivos.");
    }
  };

  // La cita del correo original entra AL editor como blockquote editable:
  // igual que Gmail, se puede recortar o borrar antes de mandar.
  const contenidoInicial = useMemo(() => {
    const f = firmaHtml ?? "";
    if (!inicial?.citar) {
      // Correo nuevo: una línea para escribir arriba y la firma abajo (si hay).
      return f ? `<p></p>${f}` : "";
    }
    const c = inicial.citar;
    const texto = escapar(c.texto).replace(/\n/g, "<br>");
    // Respuesta: espacio para escribir, la firma, y después la cita — el orden
    // de Gmail (la firma cierra lo tuyo, antes del hilo citado).
    return (
      `<p></p><p></p>${f}` +
      `<blockquote><p>El ${escapar(c.fecha)}, ${escapar(c.de)} escribió:</p>` +
      `<p>${texto}</p></blockquote>`
    );
  }, [inicial, firmaHtml]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false, code: false, horizontalRule: false }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
      TextStyle,
      Color,
      FontSize,
      Placeholder.configure({ placeholder: "Escribe tu mensaje…" }),
    ],
    content: recuperado?.html ?? inicial?.cuerpoHtml ?? contenidoInicial,
    autofocus: inicial?.citar ? "start" : false,
    editorProps: {
      attributes: {
        // `break-words`: sin esto un texto largo sin espacios (una URL, un id) no
        // tiene dónde partirse y el editor se sale de la hoja. Mismo bug que tenía
        // el cajón del Messenger.
        class: "focus:outline-none min-h-[220px] text-sm leading-relaxed break-words",
      },
    },
  });

  // `tocado` marca qué campos ya perdieron el foco: el aviso de direcciones
  // inválidas aparece al SALIR del campo, no en la primera tecla. Antes,
  // tipear la "j" de juan@… ya mostraba el error en rojo — o sea el estado
  // de error era el estado normal mientras se escribía.
  const [tocado, setTocado] = useState<{ to?: boolean; cc?: boolean; bcc?: boolean }>({});
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);

  const destinatarios = partirDirecciones(to);
  const copias = partirDirecciones(cc);
  const ocultas = partirDirecciones(bcc);
  const malos = (lista: string[]) => lista.filter((d) => !ES_CORREO.test(d));
  const avisos = [
    tocado.to && malos(destinatarios).length ? `Para: ${malos(destinatarios).join(", ")}` : null,
    tocado.cc && malos(copias).length ? `Cc: ${malos(copias).join(", ")}` : null,
    tocado.bcc && malos(ocultas).length ? `Cco: ${malos(ocultas).join(", ")}` : null,
  ].filter(Boolean) as string[];
  // `puedeEnviar` SÍ mira todo en vivo: el botón no se habilita con basura
  // aunque el aviso todavía no se muestre.
  const invalidos = [...malos(destinatarios), ...malos(copias), ...malos(ocultas)];
  const cuerpoVacio = editor?.isEmpty ?? true;
  const puedeEnviar =
    destinatarios.length > 0 &&
    invalidos.length === 0 &&
    // Un correo con solo un adjunto (sin cuerpo ni asunto) es válido.
    (!cuerpoVacio || subject.trim().length > 0 || adjuntos.length > 0) &&
    !enviar.isPending;

  // ── Autoguardado del borrador ──────────────────────────────────────────
  // Baseline para saber si el usuario escribió algo encima. Mientras se está
  // sobre el borrador recuperado, el baseline ES ese borrador; tras "empezar
  // de cero" (avisoRecuperado=false) vuelve a `inicial`, si no el autosave
  // regeneraría el borrador que se acaba de borrar.
  const fuente = avisoRecuperado ? recuperado : null;
  const base = {
    to: fuente?.to ?? inicial?.to ?? "",
    cc: fuente?.cc ?? inicial?.cc ?? "",
    bcc: fuente?.bcc ?? "",
    subject: fuente?.subject ?? inicial?.subject ?? "",
    html: fuente?.html ?? inicial?.cuerpoHtml ?? contenidoInicial,
  };
  const huboCambios =
    to !== base.to ||
    cc !== base.cc ||
    bcc !== base.bcc ||
    subject !== base.subject ||
    // Adjuntar un archivo es trabajo que no se puede tirar sin avisar (no se
    // guarda en el borrador, así que cerrar y perderlo dolería más todavía).
    adjuntos.length > 0 ||
    // Editor vacío = "<p></p>", que no es el "" de un correo nuevo sin cita.
    (base.html === "" ? !cuerpoVacio : (editor?.getHTML() ?? "") !== base.html);

  // Guardado con el contenido actual. En un ref para que el autosave y el
  // `beforeunload` siempre vean el estado más nuevo sin re-registrarse.
  const guardarRef = useRef(() => {});
  guardarRef.current = () => {
    if (!editor || !huboCambios) return;
    guardarBorrador(remitente, {
      firma,
      to,
      cc,
      bcc,
      subject,
      html: editor.getHTML(),
      inReplyTo: inicial?.inReplyTo,
      references: inicial?.references,
      ts: Date.now(),
    });
  };

  // Autosave con debounce ~1s. Dos fuentes de cambio: el cuerpo (suscripción
  // a `update` del editor) y los campos de dirección/asunto (deps del efecto).
  // Suscribirse al editor en vez de confiar en el re-render evita perder
  // cambios del cuerpo si TipTap deja de re-renderizar en cada tecla.
  useEffect(() => {
    if (!editor) return;
    let t: number | undefined;
    const programar = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => guardarRef.current(), 900);
    };
    editor.on("update", programar);
    programar(); // cambió un campo (to/cc/bcc/subject)
    return () => {
      window.clearTimeout(t);
      editor.off("update", programar);
    };
  }, [editor, to, cc, bcc, subject]);

  // Refrescar o cerrar la pestaña no pasa por el diálogo: un guardado
  // sincrónico en `beforeunload` cierra ese hueco.
  useEffect(() => {
    const alSalir = () => guardarRef.current();
    window.addEventListener("beforeunload", alSalir);
    return () => window.removeEventListener("beforeunload", alSalir);
  }, []);

  const handleEnviar = async () => {
    if (!editor) return;
    try {
      await enviar.mutateAsync({
        to: destinatarios,
        cc: copias,
        bcc: ocultas,
        subject: subject.trim() || "(sin asunto)",
        html: htmlParaCorreo(editor.getHTML()),
        text: textoParaCorreo(editor.getHTML()),
        in_reply_to: inicial?.inReplyTo,
        references: inicial?.references,
        attachments: adjuntos.map(({ filename, contentType, contentBase64 }) => ({
          filename,
          contentType,
          contentBase64,
        })),
      });
      // Enviado: el borrador ya cumplió, se borra para que no reaparezca.
      borrarBorrador(remitente, firma);
      // Si venía de un borrador del servidor, se saca también de la carpeta.
      if (serverUid) borrarServidor.mutate({ uid: serverUid });
      toast.success("Correo enviado");
      onCerrar();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // Cerrar con algo escrito pregunta si guardar el borrador o descartarlo. Un
  // ESC o un click afuera no pueden costar diez minutos de redacción. Si no se
  // tocó nada respecto a lo que se abrió (`huboCambios` compara contra el
  // borrador recuperado o `inicial`, no contra vacío: una respuesta ya viene
  // con Para/Asunto/cita), cierra directo.
  const cerrarConCuidado = () => {
    // Mientras el envío está en vuelo, cerrar desmonta el composer y el
    // toast de error caería sobre un borrador que ya no existe.
    if (enviar.isPending) return;
    // Diálogo propio y no window.confirm: el nativo congela la pestaña
    // entera mientras está abierto y desentona con el resto de Maven.
    if (huboCambios) {
      setConfirmarDescarte(true);
      return;
    }
    onCerrar();
  };

  // Guardar el borrador y cerrar (botón primario del diálogo). Guarda LOCAL al
  // instante (no perder) y sube al SERVIDOR en segundo plano (carpeta
  // Borradores, visible desde otros equipos). Si el servidor falla, el local
  // ya guardó, así que no se pierde nada.
  const guardarYCerrar = () => {
    guardarRef.current();
    setConfirmarDescarte(false);
    if (editor) {
      guardarServidor.mutate(
        {
          to: destinatarios,
          cc: copias,
          subject: subject.trim() || "(sin asunto)",
          html: htmlParaCorreo(editor.getHTML()),
          text: textoParaCorreo(editor.getHTML()),
          in_reply_to: inicial?.inReplyTo,
          references: inicial?.references,
          uid: serverUid,
        },
        {
          onSuccess: () => toast.success("Borrador guardado"),
          onError: (e) =>
            toast.error(`Guardado en este equipo (no en el servidor): ${(e as Error).message}`),
        },
      );
    } else {
      toast.success("Borrador guardado");
    }
    onCerrar();
  };

  // Tirar el borrador de este contexto y cerrar.
  const descartar = () => {
    borrarBorrador(remitente, firma);
    setConfirmarDescarte(false);
    onCerrar();
  };

  // Para quien reabrió y NO quería seguir el borrador viejo: vuelve al estado
  // de un correo nuevo / una respuesta limpia y borra lo guardado.
  const empezarDeCero = () => {
    setTo(inicial?.to ?? "");
    setCc(inicial?.cc ?? "");
    setBcc("");
    setVerCc(!!inicial?.cc);
    setVerBcc(false);
    setSubject(inicial?.subject ?? "");
    editor?.commands.setContent(contenidoInicial || "<p></p>");
    borrarBorrador(remitente, firma);
    setAvisoRecuperado(false);
  };

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && cerrarConCuidado()}>
      <DialogContent className="flex max-h-[92dvh] w-[min(96vw,52rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border/60 px-5 py-3">
          <DialogTitle className="text-base">
            {inicial?.inReplyTo ? "Responder" : "Nuevo correo"}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">Desde {remitente}</p>
        </DialogHeader>

        {avisoRecuperado && (
          <div className="flex items-center justify-between gap-2 border-b border-border/40 bg-primary/5 px-5 py-2 text-xs">
            <span className="text-muted-foreground">
              Retomaste un borrador que habías empezado.
            </span>
            <button
              type="button"
              onClick={empezarDeCero}
              className="shrink-0 font-medium text-primary hover:underline"
            >
              Empezar de cero
            </button>
          </div>
        )}

        <div className="mail-composer flex min-h-0 flex-1 flex-col overflow-y-auto">
          {/* Destinatarios estilo Gmail: filas finas, Cc/Cco plegados.
              `focus-within` marca la fila activa: los inputs son pelados
              (sin el ring del componente Input) para que la fila se vea como
              una línea de Gmail, así que el foco tiene que verse en la fila. */}
          <div className="mail-composer-row flex items-start gap-2 border-b border-border/40 px-5 focus-within:bg-muted/30">
            <label htmlFor="mail-to" className="w-12 shrink-0 pt-2.5 text-sm text-muted-foreground">
              Para
            </label>
            <RecipientsField
              id="mail-to"
              value={to}
              onChange={setTo}
              onBlur={() => setTocado((t) => ({ ...t, to: true }))}
              placeholder="nombre@empresa.com"
              sugerencias={sugerencias}
            />
            <div className="flex shrink-0 gap-2 pt-2.5 text-sm text-muted-foreground">
              {!verCc && (
                <button type="button" className="hover:text-foreground hover:underline" onClick={() => setVerCc(true)}>
                  Cc
                </button>
              )}
              {!verBcc && (
                <button type="button" className="hover:text-foreground hover:underline" onClick={() => setVerBcc(true)}>
                  Cco
                </button>
              )}
            </div>
          </div>

          {verCc && (
            <div className="mail-composer-row flex items-start gap-2 border-b border-border/40 px-5 focus-within:bg-muted/30">
              <label htmlFor="mail-cc" className="w-12 shrink-0 pt-2.5 text-sm text-muted-foreground">
                Cc
              </label>
              <RecipientsField
                id="mail-cc"
                value={cc}
                onChange={setCc}
                onBlur={() => setTocado((t) => ({ ...t, cc: true }))}
                sugerencias={sugerencias}
              />
              <button
                type="button"
                title="Quitar Cc"
                aria-label="Quitar Cc"
                onClick={() => { setCc(""); setVerCc(false); }}
                className="shrink-0 pt-2.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {verBcc && (
            <div className="mail-composer-row flex items-start gap-2 border-b border-border/40 px-5 focus-within:bg-muted/30">
              <label htmlFor="mail-bcc" className="w-12 shrink-0 pt-2.5 text-sm text-muted-foreground">
                Cco
              </label>
              <RecipientsField
                id="mail-bcc"
                value={bcc}
                onChange={setBcc}
                onBlur={() => setTocado((t) => ({ ...t, bcc: true }))}
                sugerencias={sugerencias}
              />
              {/* Plegar limpia el valor: una copia oculta olvidada en una fila
                  que ya no se ve es justo el accidente a evitar. */}
              <button
                type="button"
                title="Quitar Cco"
                aria-label="Quitar Cco"
                onClick={() => { setBcc(""); setVerBcc(false); }}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div className="mail-composer-row flex items-center gap-2 border-b border-border/40 px-5 focus-within:bg-muted/30">
            <label htmlFor="mail-subject" className="sr-only">
              Asunto
            </label>
            <input
              id="mail-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Asunto"
              className="h-10 min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground/60"
            />
          </div>

          {avisos.length > 0 && (
            <p
              role="alert"
              className="border-b border-border/40 bg-destructive/5 px-5 py-1.5 text-xs text-destructive"
            >
              No parecen direcciones válidas — {avisos.join(" · ")}
            </p>
          )}

          {/* Editor: "hoja" blanca SIEMPRE, también con Maven en oscuro.
              Es lo que hace el preview honesto — el correo se va a leer sobre
              blanco en Gmail/Outlook, y las tintas de la paleta (incluido el
              negro) están pensadas para ese fondo. Con editor oscuro, elegir
              negro dejaba el texto invisible al escribir. */}
          <div className="mail-composer-row flex-1 bg-white px-5 py-4">
            <div
              className={cn(
                "text-[#1f2937]",
                // Tailwind resetea listas y citas: se restauran SOLO adentro
                // del editor, con los mismos valores que htmlParaCorreo.
                "[&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6",
                "[&_blockquote]:border-l-[3px] [&_blockquote]:border-[#d4d4d8] [&_blockquote]:pl-3 [&_blockquote]:text-[#52525b]",
                "[&_a]:text-[#4f46e5] [&_a]:underline",
                "[&_p]:my-1",
                "[&_.is-editor-empty]:before:text-neutral-400",
              )}
              onClick={() => editor?.chain().focus().run()}
            >
              <EditorContent editor={editor} />
            </div>
          </div>
        </div>

        {adjuntos.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-border/60 px-5 py-2">
            {adjuntos.map((a, i) => (
              <span
                key={i}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-primary/5 px-3 py-1.5 text-xs"
              >
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{a.filename}</span>
                <span className="shrink-0 text-muted-foreground">
                  {Math.max(1, Math.round(a.sizeBytes / 1024))} KB
                </span>
                <button
                  type="button"
                  title="Quitar adjunto"
                  aria-label={`Quitar ${a.filename}`}
                  onClick={() => setAdjuntos((prev) => prev.filter((_, j) => j !== i))}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Pie estilo Gmail. En pantalla chica la barra de formato baja a su
            propia fila: compitiendo con Enviar (~110px) y la papelera dejaba
            ~130px para 16 herramientas, o sea 4 visibles y el resto detrás de
            un scroll sin ninguna señal de que estaba ahí. */}
        <div className="flex flex-col gap-1.5 border-t border-border/60 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-2">
          <div className="flex items-center gap-2 sm:contents">
            <Button
              onClick={handleEnviar}
              disabled={!puedeEnviar}
              title={
                destinatarios.length === 0
                  ? "Falta el destinatario"
                  : invalidos.length > 0
                    ? "Hay direcciones inválidas"
                    : "Enviar"
              }
              className="shrink-0 rounded-full bg-gradient-to-r from-accent to-primary px-5 text-white transition-opacity hover:opacity-90"
            >
              {enviar.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Enviar
            </Button>

            <input
              ref={inputArchivo}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                agregarArchivos(e.target.files);
                // Permite volver a elegir el mismo archivo.
                e.target.value = "";
              }}
            />
            <button
              type="button"
              title="Adjuntar archivo"
              aria-label="Adjuntar archivo"
              onClick={() => inputArchivo.current?.click()}
              disabled={enviar.isPending}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Paperclip className="h-4 w-4" />
            </button>

            <button
              type="button"
              title="Descartar"
              onClick={cerrarConCuidado}
              disabled={enviar.isPending}
              className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-destructive sm:order-last"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          {editor && <BarraFormato editor={editor} />}
        </div>
      </DialogContent>

      <AlertDialog open={confirmarDescarte} onOpenChange={setConfirmarDescarte}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Guardar este borrador?</AlertDialogTitle>
            <AlertDialogDescription>
              Puedes guardarlo y seguir después, o descartarlo. El borrador
              queda guardado en este navegador.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir editando</AlertDialogCancel>
            {/* No es AlertDialogAction/Cancel: `descartar` ya cierra el
                diálogo y desmonta el compositor. */}
            <Button
              variant="ghost"
              onClick={descartar}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              Descartar
            </Button>
            <AlertDialogAction onClick={guardarYCerrar}>
              Guardar borrador
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
