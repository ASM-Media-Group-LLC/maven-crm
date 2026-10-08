import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  AtSign,
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
import { correoDe } from "@/lib/mailAddr";
import RecipientsField from "./RecipientsField";
import MencionesEnElCuerpo from "./MencionesEnElCuerpo";
import { useAuth } from "@/hooks/useAuth";
import { extraerImagenesEmbebidas, pesoDeBase64 } from "@/lib/mailInline";
import type { PersonaDelDirectorio } from "@/hooks/useDirectorioCorreo";
import { useSugerenciasDestinatarios } from "@/hooks/useSugerenciasDestinatarios";
import {
  borrarBorrador,
  firmaContexto,
  guardarBorrador,
  leerBorrador,
} from "@/lib/mailDraft";
import {
  cargarPesado,
  devolverImagenes,
  guardarPesado,
  olvidarPesado,
  pesadoEnMemoria,
  separarImagenes,
} from "@/lib/correo/pesadoDelBorrador";

import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { ImagenConTamano } from "./ImagenConTamano";
import { prepararImagen, TAMANOS as TAMANOS_DE_IMAGEN } from "@/lib/correo/imagenesDelCorreo";
import Link from "@tiptap/extension-link";
import TextStyle from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Placeholder from "@tiptap/extension-placeholder";
import { Extension } from "@tiptap/core";
import { ColorDeFondo, FONDOS } from "./colorDeFondo";
import { useLanguage } from "@/hooks/useLanguage";
import { traducir, type TranslationKey } from "@/lib/i18n";

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
  /** Cuerpo del correo al que se responde (o que se reenvía), para citarlo
   *  abajo. Con `reenvio`, la cita lleva encabezado completo —De, Para,
   *  Fecha, Asunto— porque quien lo recibe no vio el original y necesita
   *  saber de dónde salió. */
  citar?: {
    de: string; fecha: string; texto: string;
    reenvio?: boolean; para?: string; asunto?: string;
  };
  inReplyTo?: string;
  references?: string;
  /** Cuerpo HTML ya armado, para RETOMAR un borrador del servidor (en vez de
   *  construirlo desde cita/firma). */
  cuerpoHtml?: string;
  /** UID del borrador en el servidor que se está retomando: al re-guardar se
   *  reemplaza y al enviar se borra. */
  serverDraftUid?: number;
  /** `Message-ID` del correo que se reenvía. NO se manda: sirve para que el
   *  borrador del reenvío tenga su propio cajón y no se mezcle con el de un
   *  correo nuevo. */
  reenvioDe?: string;
  /** Adjuntos con los que el compositor ARRANCA: los del correo que se
   *  reenvía, ya bajados. Se pueden quitar antes de mandar, como los propios. */
  adjuntosIniciales?: Array<
    { filename: string; contentType: string; sizeBytes: number; contentBase64: string }
  >;
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
 *  base64 pesa ~4/3, así que 20 MB de archivo son ~27 MB en el request.
 *
 *  Por qué 20 y no los 25 de Gmail: Zoho acepta 31 MB en el cable (lo anuncia
 *  en el saludo SMTP: SIZE 32505856) ≈ 23 MB de archivo, y la edge tiene un
 *  techo duro de 256 MB de memoria para armar el mensaje. 25 MB no entra por
 *  ninguno de los dos lados sin subir el adjunto a Storage y leerlo de a
 *  pedazos, que es otro trabajo. */
export const TOPE_ADJUNTOS = 20 * 1024 * 1024;

/** Los tipos de imagen que se pueden pegar. Corta a propósito: la misma lista
 *  que reconoce `extraerImagenesEmbebidas` al enviar. Si acá entrara un tipo
 *  que allá no se traduce a `cid:`, la imagen viajaría como `data:` y llegaría
 *  rota en Outlook y en varios filtros. */
const TIPOS_PEGABLES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

/** Lo que queda en el borrador donde estaba una imagen pegada. Va DENTRO del
 *  cuerpo del correo (si no se borra, sale con él): no se traduce. */
const MARCA_IMAGEN_PERDIDA = "[imagen pegada — se perdió al recuperar el borrador]";

/** Lee un archivo a `data:<tipo>;base64,…`, que es lo que come el editor. */
function leerDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error(traducir("mail.comp.readFileError")));
    fr.readAsDataURL(file);
  });
}

/** Lee un archivo a base64 SIN el prefijo `data:<tipo>;base64,`. */
function leerBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const res = String(fr.result);
      const coma = res.indexOf(",");
      resolve(coma >= 0 ? res.slice(coma + 1) : res);
    };
    fr.onerror = () => reject(new Error(traducir("mail.comp.readFileError")));
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

const EMOJIS: Array<{ grupo: TranslationKey; lista: string[] }> = [
  {
    grupo: "mail.emoji.faces",
    lista: ["😀", "😁", "😂", "🤣", "😊", "😍", "🥰", "😘", "😎", "🤩", "🥳", "😅", "😉", "🙃", "🤔", "🤯", "😳", "🥺", "😢", "😭", "😤", "😡", "😴", "🤒", "🥴", "😇", "🤗", "🤫", "🙄", "😬", "🫠", "💀"],
  },
  {
    grupo: "mail.emoji.gestures",
    lista: ["👍", "👎", "👌", "🤌", "✌️", "🤞", "🤟", "🤙", "👏", "🙌", "🤝", "🙏", "💪", "👀", "🫡", "👋", "☝️", "👉", "👈", "🫶", "✍️", "🤲", "🖖", "🤘"],
  },
  {
    grupo: "mail.emoji.hearts",
    lista: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💖", "💘", "💝", "💕", "💞", "💗", "💔", "❣️"],
  },
  {
    grupo: "mail.emoji.work",
    lista: ["✅", "❌", "⚠️", "📌", "📎", "📈", "📉", "📊", "💼", "🗂️", "📁", "📄", "📝", "💰", "💵", "🧾", "📅", "⏰", "🚀", "🎯", "🏆", "🔥", "⭐", "✨", "💡", "🔔", "📣", "🔒", "🔑", "⚙️", "🛠️", "💻"],
  },
  {
    grupo: "mail.emoji.party",
    lista: ["🎉", "🎁", "🥂", "🍾", "🎂", "☕", "🍕", "🌮", "🍔", "💯", "❓", "❗", "➕", "➖", "🔁", "🆗", "🆕", "🌎"],
  },
];

const TAMANOS: Array<{ etiqueta: TranslationKey; valor: string | null }> = [
  { etiqueta: "mail.size.small", valor: "12px" },
  { etiqueta: "mail.size.normal", valor: null },
  { etiqueta: "mail.size.large", valor: "18px" },
  { etiqueta: "mail.size.huge", valor: "24px" },
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

/** Una columna del menú de color: título, la grilla y el botón para quitar. */
function PaletaDeColor({
  titulo,
  colores,
  onElegir,
  textoQuitar,
  onQuitar,
}: {
  titulo: string;
  colores: string[][];
  onElegir: (color: string) => void;
  textoQuitar: string;
  onQuitar: () => void;
}) {
  return (
    <div role="group" aria-label={titulo} className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
      {colores.map((fila, i) => (
        <div key={i} className="flex gap-1.5">
          {fila.map((c) => (
            <button
              key={c}
              type="button"
              title={c}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onElegir(c)}
              className="h-6 w-6 rounded-full border border-border/60 transition-transform hover:scale-110"
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      ))}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onQuitar}
        className="mt-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
      >
        {textoQuitar}
      </button>
    </div>
  );
}

function BarraFormato({ editor }: { editor: Editor }) {
  const { t } = useLanguage();
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
        titulo={t("mail.ed.undo")}
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
      >
        <Undo2 className="h-4 w-4" />
      </BotonBarra>
      <BotonBarra
        titulo={t("mail.ed.redo")}
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
            title={t("mail.ed.fontSize")}
            aria-label={t("mail.ed.fontSize")}
            onMouseDown={(e) => e.preventDefault()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Type className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-36 p-1" align="start">
          {TAMANOS.map((tam) => (
            <button
              key={tam.etiqueta}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (tam.valor) editor.chain().focus().setFontSize(tam.valor).run();
                else editor.chain().focus().unsetFontSize().run();
              }}
              className="block w-full rounded-md px-3 py-1.5 text-left hover:bg-muted"
              style={{ fontSize: tam.valor ?? "14px" }}
            >
              {t(tam.etiqueta)}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      <Separador />

      <BotonBarra
        titulo={t("mail.ed.bold")}
        activo={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="h-4 w-4" />
      </BotonBarra>
      <BotonBarra
        titulo={t("mail.ed.italic")}
        activo={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="h-4 w-4" />
      </BotonBarra>
      <BotonBarra
        titulo={t("mail.ed.underline")}
        activo={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon className="h-4 w-4" />
      </BotonBarra>
      <BotonBarra
        titulo={t("mail.ed.strike")}
        activo={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough className="h-4 w-4" />
      </BotonBarra>

      {/* Color: de fondo (resaltar) y de la letra, en el mismo menú, como en
          Gmail. El fondo va primero porque es lo que se busca para marcar algo. */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            title={t("mail.ed.colors")}
            aria-label={t("mail.ed.colors")}
            onMouseDown={(e) => e.preventDefault()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Palette className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" align="start">
          <div className="flex flex-col gap-4 sm:flex-row">
            <PaletaDeColor
              titulo={t("mail.ed.bgColor")}
              colores={FONDOS}
              onElegir={(c) => editor.chain().focus().setBackgroundColor(c).run()}
              textoQuitar={t("mail.ed.noHighlight")}
              onQuitar={() => editor.chain().focus().unsetBackgroundColor().run()}
            />
            <PaletaDeColor
              titulo={t("mail.ed.textColor")}
              colores={COLORES}
              onElegir={(c) => editor.chain().focus().setColor(c).run()}
              textoQuitar={t("mail.ed.autoColor")}
              onQuitar={() => editor.chain().focus().unsetColor().run()}
            />
          </div>
        </PopoverContent>
      </Popover>

      <Separador />

      <BotonBarra
        titulo={t("mail.ed.bulletList")}
        activo={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="h-4 w-4" />
      </BotonBarra>
      <BotonBarra
        titulo={t("mail.ed.numberedList")}
        activo={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="h-4 w-4" />
      </BotonBarra>
      <BotonBarra
        titulo={t("mail.ed.quote")}
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
            title={t("mail.ed.insertLink")}
            aria-label={t("mail.ed.insertLink")}
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
              {t("mail.ed.apply")}
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
              {t("mail.ed.removeLink")}
            </button>
          )}
        </PopoverContent>
      </Popover>

      {/* Emojis */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            title={t("mail.ed.emoji")}
            aria-label={t("mail.ed.emoji")}
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
                <p className="px-1 pb-1 pt-2 text-xs font-semibold text-muted-foreground first:pt-0">
                  {t(seccion.grupo)}
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
        titulo={t("mail.ed.clearFormat")}
        onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
      >
        <RemoveFormatting className="h-4 w-4" />
      </BotonBarra>
    </div>
  );
}

/* ── El compositor ──────────────────────────────────────────────────────── */

export function MailComposer({ abierto, onCerrar, inicial, remitente, firma: firmaHtml }: Props) {
  const { t } = useLanguage();
  // Firma del contexto (nuevo vs. responder a tal hilo) y borrador guardado
  // para ese contexto. Se lee UNA vez al montar: el compositor se monta de
  // cero en cada apertura, así que no hace falta re-leer.
  const firma = firmaContexto(inicial?.inReplyTo, inicial?.reenvioDe);
  // Al RETOMAR un borrador del servidor (`cuerpoHtml`), no se recupera el
  // local: el contenido bueno es el que vino del servidor.
  const recuperado = useMemo(
    () => (inicial?.cuerpoHtml ? null : leerBorrador(remitente, firma)),
    [remitente, firma, inicial?.cuerpoHtml],
  );
  // Lo PESADO del borrador recuperado —adjuntos e imágenes pegadas—, que no
  // entra en localStorage (ver pesadoDelBorrador.ts). De esta pestaña llega al
  // instante; después de recargar, del disco un momento más tarde (efecto de
  // más abajo). null = todavía no se sabe.
  const pesadoInicial = useMemo(
    () => (recuperado ? pesadoEnMemoria(remitente, firma) : null),
    [recuperado, remitente, firma],
  );
  // El cuerpo recuperado con sus imágenes en su lugar. En estado porque es el
  // punto de partida de `huboCambios`, y cambia si las imágenes llegan del disco.
  const [htmlRecuperado, setHtmlRecuperado] = useState<string | null>(() =>
    recuperado
      ? devolverImagenes(recuperado.html, pesadoInicial?.imagenes ?? {}, MARCA_IMAGEN_PERDIDA)
      : null,
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
  // Los adjuntos vuelven con el borrador recuperado (de la memoria o, después
  // de recargar, del disco: ver el efecto de lo pesado). Antes se perdían.
  const [adjuntos, setAdjuntos] = useState<
    Array<{ filename: string; contentType: string; sizeBytes: number; contentBase64: string }>
  >(() => pesadoInicial?.adjuntos ?? inicial?.adjuntosIniciales ?? []);
  // Con qué arrancó: si lo pesado llega del disco y la persona ya adjuntó o
  // quitó algo, manda lo suyo.
  const adjuntosAlAbrir = useRef(adjuntos);
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
      toast.error(t("mail.comp.tooBig"));
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
      toast.error(t("mail.comp.readSomeError"));
    }
  };

  // El editor todavía no existe cuando se arman los manejadores de pegado, así
  // que lo leen de una ref. Se llena justo después de `useEditor`.
  const editorRef = useRef<Editor | null>(null);

  /** Cuánto pesan las imágenes YA pegadas en el cuerpo. Cuentan contra el
   *  mismo tope que los adjuntos: en el correo ocupan lo mismo. */
  const pesoDelCuerpo = (): number => {
    const html = editorRef.current?.getHTML() ?? "";
    return extraerImagenesEmbebidas(html).imagenes
      .reduce((n, i) => n + pesoDeBase64(i.contentBase64), 0);
  };

  /** Mete en el cuerpo las imágenes que vengan en un pegado o un arrastre.
   *
   *  Devuelve `true` si se ocupó de ellas —así ProseMirror no pega ADEMÁS el
   *  texto o la ruta del archivo— y `false` si no había ninguna, para que el
   *  pegado normal siga funcionando.
   *
   *  ⚠️ Se inserta de a una y en orden con `await`: `insertContent` en paralelo
   *  las mete donde esté el cursor en ese instante, que con varias imágenes
   *  las deja mezcladas al azar. */
  const pegarImagenes = (datos: DataTransfer | null): boolean => {
    const imagenes = Array.from(datos?.files ?? []).filter((f) => TIPOS_PEGABLES.has(f.type));
    if (!imagenes.length) return false;

    void (async () => {
      const yaHay = adjuntos.reduce((n, a) => n + a.sizeBytes, 0) + pesoDelCuerpo();
      let acumulado = yaHay;
      for (const f of imagenes) {
        // El mismo tope que los adjuntos: una captura pegada ocupa en el
        // correo lo mismo que una adjuntada, y dejarla fuera del conteo sería
        // una puerta para pasarse del límite sin darse cuenta.
        if (acumulado + f.size > TOPE_ADJUNTOS) {
          toast.error(t("mail.comp.imageTooBig"));
          break;
        }
        acumulado += f.size;
        try {
          const dataUrl = await leerDataUrl(f);
          // Entra ajustada al ancho de un correo (y achicada si era enorme):
          // en tamaño real desarmaba el mensaje en Gmail y Outlook (Keila, 06/10).
          const { src, ancho } = await prepararImagen(dataUrl, f.type);
          editorRef.current?.chain().focus().insertContent({ type: "image", attrs: { src, width: ancho } }).run();
        } catch {
          toast.error(t("mail.comp.readImageError", { name: f.name || t("mail.comp.theImage") }));
        }
      }
    })();
    return true;
  };

  // La cita del correo original entra AL editor como blockquote editable:
  // igual que Gmail, se puede recortar o borrar antes de mandar.
  // ⚠️ Su encabezado («El … escribió:», «Mensaje reenviado», De/Fecha/Asunto)
  // queda en español a propósito: viaja DENTRO del correo que lee otra persona.
  const contenidoInicial = useMemo(() => {
    const f = firmaHtml ?? "";
    if (!inicial?.citar) {
      // Correo nuevo: una línea para escribir arriba y la firma abajo (si hay).
      return f ? `<p></p>${f}` : "";
    }
    const c = inicial.citar;
    const texto = escapar(c.texto).replace(/\n/g, "<br>");
    if (c.reenvio) {
      // Un reenvío NO es una respuesta: no hay a quién contestarle, hay algo
      // que mostrar. Por eso el encabezado completo y no "Fulano escribió:".
      const filas = [
        `De: ${escapar(c.de)}`,
        c.fecha && `Fecha: ${escapar(c.fecha)}`,
        c.asunto && `Asunto: ${escapar(c.asunto)}`,
        c.para && `Para: ${escapar(c.para)}`,
      ].filter(Boolean).join("<br>");
      return (
        `<p></p><p></p>${f}` +
        `<blockquote><p>---------- Mensaje reenviado ----------<br>${filas}</p>` +
        `<p>${texto}</p></blockquote>`
      );
    }
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
      // Resaltar: el fondo viaja en línea en el mismo <span> que el color.
      ColorDeFondo,
      FontSize,
      Placeholder.configure({ placeholder: t("mail.comp.bodyPlaceholder") }),
      // `allowBase64`: al pegar, la imagen entra como `data:` y recién al
      // ENVIAR se convierte en una parte MIME con `cid:`. Sin esto el editor
      // descarta el src y la imagen pegada desaparece sin decir nada.
      // Con su ANCHO (ImagenConTamano): el menú de tamaño lo cambia.
      ImagenConTamano.configure({ allowBase64: true, inline: false }),
    ],
    content: htmlRecuperado ?? inicial?.cuerpoHtml ?? contenidoInicial,
    autofocus: inicial?.citar ? "start" : false,
    editorProps: {
      // ── Pegar y soltar imágenes ──────────────────────────────────────────
      // Lo pidió Jhon: «si copio una imagen, no puedo pegarla directamente».
      // Una captura pegada es lo más rápido que hay para mostrar algo, y hasta
      // ahora había que guardarla en el disco y adjuntarla.
      handlePaste: (_vista, evento) => pegarImagenes(evento.clipboardData),
      handleDrop: (_vista, evento) => {
        const dt = (evento as DragEvent).dataTransfer;
        // Solo se intercepta si trae ARCHIVOS: arrastrar texto dentro del
        // editor tiene que seguir funcionando como siempre.
        if (!dt?.files?.length) return false;
        return pegarImagenes(dt);
      },
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
  // A quién se mencionó con @ en este borrador. Sirve para dos cosas: mostrar
  // el aviso de "se sumó a X" y decirle a la edge a quién notificar al enviar.
  const [mencionados, setMencionados] = useState<PersonaDelDirectorio[]>([]);
  const { user: usuarioActual } = useAuth();

  const [tocado, setTocado] = useState<{ to?: boolean; cc?: boolean; bcc?: boolean }>({});
  const [confirmarDescarte, setConfirmarDescarte] = useState(false);

  /** Mencionar a alguien lo SUMA al correo, como en Gmail: por eso la persona
   *  recibe el hilo y no solo un aviso. Si ya estaba en Para, Cc o Cco no se
   *  duplica — mencionar a quien ya está es perfectamente válido (es llamarle la
   *  atención sobre algo), solo que no hay nadie nuevo a quien agregar. */
  const alMencionar = useCallback((p: PersonaDelDirectorio) => {
    setMencionados((prev) => (prev.some((x) => x.user_id === p.user_id) ? prev : [...prev, p]));
    const yaEsta = [to, cc, bcc]
      .flatMap(partirDirecciones)
      .some((d) => correoDe(d).toLowerCase() === p.email_address.toLowerCase());
    if (yaEsta) return;
    setTo((actual) => (actual.trim() ? `${actual.replace(/[;,\s]*$/, "")}, ${p.email_address}` : p.email_address));
  }, [to, cc, bcc]);

  const destinatarios = partirDirecciones(to);
  const copias = partirDirecciones(cc);
  const ocultas = partirDirecciones(bcc);
  const malos = (lista: string[]) => lista.filter((d) => !ES_CORREO.test(d));
  const avisos = [
    tocado.to && malos(destinatarios).length ? `${t("mail.to")}: ${malos(destinatarios).join(", ")}` : null,
    tocado.cc && malos(copias).length ? `${t("mail.comp.cc")}: ${malos(copias).join(", ")}` : null,
    tocado.bcc && malos(ocultas).length ? `${t("mail.bcc")}: ${malos(ocultas).join(", ")}` : null,
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
    html: fuente && htmlRecuperado !== null ? htmlRecuperado : (inicial?.cuerpoHtml ?? contenidoInicial),
  };
  const huboCambios =
    to !== base.to ||
    cc !== base.cc ||
    bcc !== base.bcc ||
    subject !== base.subject ||
    // Adjuntar un archivo es trabajo que no se puede tirar sin avisar.
    adjuntos.length > 0 ||
    // Editor vacío = "<p></p>", que no es el "" de un correo nuevo sin cita.
    (base.html === "" ? !cuerpoVacio : (editor?.getHTML() ?? "") !== base.html);

  // Los manejadores de pegado leen el editor de acá (se arman antes que él).
  editorRef.current = editor;

  // Guardado con el contenido actual. En un ref para que el autosave y el
  // `beforeunload` siempre vean el estado más nuevo sin re-registrarse.
  const guardarRef = useRef(() => {});
  // Mientras lo pesado del borrador recuperado viene del disco, NO se guarda:
  // el cuerpo todavía tiene la marca donde van las imágenes y los adjuntos no
  // llegaron, y guardar eso pisaría lo bueno que está por llegar.
  const pesadoListo = useRef(!recuperado || pesadoInicial !== null);
  guardarRef.current = () => {
    if (!editor || !huboCambios || !pesadoListo.current) return;
    // Lo liviano a localStorage (las imágenes, nombradas por su huella) y lo
    // pesado a IndexedDB. Una captura son megas de base64 y localStorage ronda
    // los 5 MB: guardarla ahí reventaba la cuota y el autoguardado dejaba de
    // funcionar EN SILENCIO, perdiendo hasta el texto.
    const { html: liviano, imagenes } = separarImagenes(editor.getHTML());
    void guardarPesado(remitente, firma, { adjuntos, imagenes });
    guardarBorrador(remitente, {
      firma,
      to,
      cc,
      bcc,
      subject,
      html: liviano,
      inReplyTo: inicial?.inReplyTo,
      references: inicial?.references,
      ts: Date.now(),
    });
  };

  // Autosave con debounce ~1s. Dos fuentes de cambio: el cuerpo (suscripción
  // a `update` del editor) y los campos de dirección/asunto/adjuntos (deps).
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
    programar(); // cambió un campo (to/cc/bcc/subject/adjuntos)
    return () => {
      window.clearTimeout(t);
      editor.off("update", programar);
    };
  }, [editor, to, cc, bcc, subject, adjuntos]);

  // Lo pesado del borrador recuperado que viene del DISCO (se recargó la
  // página). Las imágenes se ponen solo si el cuerpo sigue como se abrió, y los
  // adjuntos solo si no se tocaron: si la persona ya empezó, manda lo suyo.
  useEffect(() => {
    if (!editor || pesadoListo.current || !recuperado) return;
    const htmlAlAbrir = editor.getHTML();
    let vivo = true;
    void cargarPesado(remitente, firma).then((p) => {
      if (!vivo || editor.isDestroyed) return;
      if (p && Object.keys(p.imagenes).length > 0 && editor.getHTML() === htmlAlAbrir) {
        editor.commands.setContent(devolverImagenes(recuperado.html, p.imagenes, MARCA_IMAGEN_PERDIDA));
        setHtmlRecuperado(editor.getHTML());
      }
      if (p) setAdjuntos((actual) => (actual === adjuntosAlAbrir.current ? p.adjuntos : actual));
      pesadoListo.current = true;
      // Lo que se escribió mientras se esperaba no se guardó: ahora sí.
      window.setTimeout(() => guardarRef.current(), 0);
    });
    return () => { vivo = false; };
    // Una vez, cuando hay editor: `recuperado` y la firma no cambian en la vida
    // del compositor (se monta de cero en cada apertura).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // Refrescar o cerrar la pestaña no pasa por el diálogo: un guardado
  // sincrónico en `beforeunload` cierra ese hueco.
  useEffect(() => {
    const alSalir = () => guardarRef.current();
    window.addEventListener("beforeunload", alSalir);
    return () => window.removeEventListener("beforeunload", alSalir);
  }, []);

  // El borrador local entero: el texto (localStorage) y lo pesado (IndexedDB).
  const tirarBorradorLocal = () => {
    borrarBorrador(remitente, firma);
    void olvidarPesado(remitente, firma);
  };

  const handleEnviar = async () => {
    if (!editor) return;
    try {
      // ⚠️ Las imágenes PEGADAS salen del cuerpo y se vuelven partes MIME con
      // `cid:`. Mandarlas como `data:` adentro del HTML funciona en Gmail y en
      // poco más: Outlook, varios clientes de escritorio y algunos filtros
      // antispam las descartan, y el correo llega con un hueco.
      const conCid = extraerImagenesEmbebidas(htmlParaCorreo(editor.getHTML()));

      await enviar.mutateAsync({
        to: destinatarios,
        cc: copias,
        bcc: ocultas,
        subject: subject.trim() || "(sin asunto)",
        html: conCid.html,
        // El texto alternativo sale del HTML ORIGINAL: da igual, las imágenes
        // no aportan texto, pero así no depende del orden de los reemplazos.
        text: textoParaCorreo(editor.getHTML()),
        in_reply_to: inicial?.inReplyTo,
        references: inicial?.references,
        attachments: [
          ...adjuntos.map(({ filename, contentType, contentBase64 }) => ({
            filename,
            contentType,
            contentBase64,
          })),
          ...conCid.imagenes,
        ],
        // Solo los que SIGUEN en el correo: si alguien se mencionó y después se
        // borró su dirección a mano del campo Para, no corresponde avisarle.
        menciones: mencionados
          .filter((m) =>
            [destinatarios, copias, ocultas]
              .flat()
              .some((d) => correoDe(d).toLowerCase() === m.email_address.toLowerCase()),
          )
          .map((m) => m.user_id),
      });
      // Enviado: el borrador ya cumplió, se borra para que no reaparezca.
      tirarBorradorLocal();
      // Si venía de un borrador del servidor, se saca también de la carpeta:
      // de la lista al instante; si el servidor no puede, vuelve y se avisa
      // (ver useDeleteServerDraft).
      if (serverUid) borrarServidor.mutate({ uid: serverUid });
      toast.success(t("mail.comp.sent"));
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
      // Igual que al enviar: las imágenes pegadas salen del cuerpo como partes
      // con `cid:` y los archivos viajan con él. Antes el borrador subía solo el
      // texto y retomarlo perdía los adjuntos (Keila, 08/10); y una captura
      // en `data:` dentro del HTML lo inflaba hasta que el servidor lo recortaba.
      const conCid = extraerImagenesEmbebidas(htmlParaCorreo(editor.getHTML()));
      guardarServidor.mutate(
        {
          to: destinatarios,
          cc: copias,
          subject: subject.trim() || "(sin asunto)",
          html: conCid.html,
          text: textoParaCorreo(editor.getHTML()),
          in_reply_to: inicial?.inReplyTo,
          references: inicial?.references,
          uid: serverUid,
          attachments: [
            ...adjuntos.map(({ filename, contentType, contentBase64 }) => ({
              filename,
              contentType,
              contentBase64,
            })),
            ...conCid.imagenes,
          ],
        },
        {
          onSuccess: () => toast.success(t("mail.comp.draftSaved")),
          onError: (e) =>
            toast.error(t("mail.comp.draftLocalOnly", { error: (e as Error).message })),
        },
      );
    } else {
      toast.success(t("mail.comp.draftSaved"));
    }
    onCerrar();
  };

  // Tirar el borrador de este contexto y cerrar.
  const descartar = () => {
    tirarBorradorLocal();
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
    // Copia nueva: si fuera el mismo arreglo, lo pesado que llegue del disco
    // creería que nadie tocó los adjuntos y los volvería a poner.
    setAdjuntos([...(inicial?.adjuntosIniciales ?? [])]);
    tirarBorradorLocal();
    setAvisoRecuperado(false);
  };

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && cerrarConCuidado()}>
      <DialogContent className="flex max-h-[92dvh] w-[min(96vw,52rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border/60 px-5 py-3">
          <DialogTitle className="text-base">
            {inicial?.inReplyTo ? t("common.reply") : t("mail.comp.newEmail")}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">{t("mail.comp.fromAddress", { email: remitente })}</p>
        </DialogHeader>

        {avisoRecuperado && (
          <div className="flex items-center justify-between gap-2 border-b border-border/40 bg-primary/5 px-5 py-2 text-xs">
            <span className="text-muted-foreground">
              {t("mail.comp.resumedDraft")}
            </span>
            <button
              type="button"
              onClick={empezarDeCero}
              className="shrink-0 font-medium text-primary hover:underline"
            >
              {t("mail.comp.startOver")}
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
              {t("mail.to")}
            </label>
            <RecipientsField
              id="mail-to"
              value={to}
              onChange={setTo}
              onBlur={() => setTocado((prev) => ({ ...prev, to: true }))}
              placeholder={t("mail.comp.toPlaceholder")}
              sugerencias={sugerencias}
            />
            <div className="flex shrink-0 gap-2 pt-2.5 text-sm text-muted-foreground">
              {!verCc && (
                <button type="button" className="hover:text-foreground hover:underline" onClick={() => setVerCc(true)}>
                  {t("mail.comp.cc")}
                </button>
              )}
              {!verBcc && (
                <button type="button" className="hover:text-foreground hover:underline" onClick={() => setVerBcc(true)}>
                  {t("mail.bcc")}
                </button>
              )}
            </div>
          </div>

          {verCc && (
            <div className="mail-composer-row flex items-start gap-2 border-b border-border/40 px-5 focus-within:bg-muted/30">
              <label htmlFor="mail-cc" className="w-12 shrink-0 pt-2.5 text-sm text-muted-foreground">
                {t("mail.comp.cc")}
              </label>
              <RecipientsField
                id="mail-cc"
                value={cc}
                onChange={setCc}
                onBlur={() => setTocado((prev) => ({ ...prev, cc: true }))}
                sugerencias={sugerencias}
              />
              <button
                type="button"
                title={t("mail.comp.removeCc")}
                aria-label={t("mail.comp.removeCc")}
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
                {t("mail.bcc")}
              </label>
              <RecipientsField
                id="mail-bcc"
                value={bcc}
                onChange={setBcc}
                onBlur={() => setTocado((prev) => ({ ...prev, bcc: true }))}
                sugerencias={sugerencias}
              />
              {/* Plegar limpia el valor: una copia oculta olvidada en una fila
                  que ya no se ve es justo el accidente a evitar. */}
              <button
                type="button"
                title={t("mail.comp.removeBcc")}
                aria-label={t("mail.comp.removeBcc")}
                onClick={() => { setBcc(""); setVerBcc(false); }}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div className="mail-composer-row flex items-center gap-2 border-b border-border/40 px-5 focus-within:bg-muted/30">
            <label htmlFor="mail-subject" className="sr-only">
              {t("mail.comp.subject")}
            </label>
            <input
              id="mail-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t("mail.comp.subject")}
              className="h-10 min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground/60"
            />
          </div>

          {avisos.length > 0 && (
            <p
              role="alert"
              className="border-b border-border/40 bg-destructive/5 px-5 py-1.5 text-xs text-destructive"
            >
              {t("mail.comp.invalidAddresses", { list: avisos.join(" · ") })}
            </p>
          )}

          {/* Editor: "hoja" blanca SIEMPRE, también con Maven en oscuro.
              Es lo que hace el preview honesto — el correo se va a leer sobre
              blanco en Gmail/Outlook, y las tintas de la paleta (incluido el
              negro) están pensadas para ese fondo. Con editor oscuro, elegir
              negro dejaba el texto invisible al escribir. */}
          <div className="mail-composer-row flex-1 bg-white px-5 py-4">
            <div
              data-ancla-del-cuerpo
              className={cn(
                // `relative`: es el ancla de la lista de menciones, que se abre
                // hacia arriba desde el cuerpo.
                "relative text-[#1f2937]",
                // Tailwind resetea listas y citas: se restauran SOLO adentro
                // del editor, con los mismos valores que htmlParaCorreo.
                "[&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6",
                "[&_blockquote]:border-l-[3px] [&_blockquote]:border-[#d4d4d8] [&_blockquote]:pl-3 [&_blockquote]:text-[#52525b]",
                "[&_a]:text-[#4f46e5] [&_a]:underline",
                "[&_p]:my-1",
                "[&_.is-editor-empty]:before:text-neutral-400",
                // La imagen elegida (la del menú de tamaño), marcada.
                "[&_img]:max-w-full [&_img.ProseMirror-selectednode]:outline [&_img.ProseMirror-selectednode]:outline-2 [&_img.ProseMirror-selectednode]:outline-offset-2 [&_img.ProseMirror-selectednode]:outline-primary",
              )}
              onClick={() => editor?.chain().focus().run()}
            >
              <EditorContent editor={editor} />
              {/* El tamaño de la imagen elegida, como Gmail: aparece al tocarla. */}
              {editor && <MenuDeTamanoDeImagen editor={editor} />}
              {/* `relative` en el contenedor de arriba: la lista se ancla al
                  cuerpo y se abre HACIA ARRIBA, para no quedar tapada por la
                  barra de envío ni empujar el editor. */}
              <MencionesEnElCuerpo
                editor={editor}
                miUserId={usuarioActual?.id}
                onMencionar={alMencionar}
              />
            </div>
          </div>
        </div>

        {mencionados.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border/60 px-5 py-2 text-xs text-muted-foreground">
            <AtSign className="h-3.5 w-3.5 shrink-0" />
            {/* La frase entera cambia con el número: partirla en "se sumó X" +
                un final fijo dejaba "Se sumó Fabiana… VAN a recibirlo y LES
                llega", que es justo el error que uno no ve al escribirlo. */}
            <span>
              {mencionados.length === 1
                ? t("mail.comp.mentionOne", { name: mencionados[0].nombre })
                : t("mail.comp.mentionMany", { n: mencionados.length })}
            </span>
          </div>
        )}

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
                  title={t("mail.comp.removeAttachment")}
                  aria-label={t("mail.comp.removeNamed", { name: a.filename })}
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
                  ? t("mail.comp.missingRecipient")
                  : invalidos.length > 0
                    ? t("mail.comp.hasInvalid")
                    : t("common.send")
              }
              className="shrink-0 rounded-full bg-gradient-to-r from-accent to-primary px-5 text-white transition-opacity hover:opacity-90"
            >
              {enviar.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              {t("common.send")}
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
              title={t("mail.comp.attach")}
              aria-label={t("mail.comp.attach")}
              onClick={() => inputArchivo.current?.click()}
              disabled={enviar.isPending}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Paperclip className="h-4 w-4" />
            </button>

            <button
              type="button"
              title={t("mail.comp.discard")}
              aria-label={t("mail.comp.discard")}
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
            <AlertDialogTitle>{t("mail.comp.saveDraftTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("mail.comp.saveDraftDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("mail.comp.keepEditing")}</AlertDialogCancel>
            {/* No es AlertDialogAction/Cancel: `descartar` ya cierra el
                diálogo y desmonta el compositor. */}
            <Button
              variant="ghost"
              onClick={descartar}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              {t("mail.comp.discard")}
            </Button>
            <AlertDialogAction onClick={guardarYCerrar}>
              {t("mail.comp.saveDraft")}

            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

/** El menú de tamaño de la imagen elegida (Keila, 06/10), arriba de la imagen.
 *  Propio y no el BubbleMenu de TipTap: aquel trae tippy.js, una librería entera
 *  para cuatro botones. Se ancla al contenedor del cuerpo (que es `relative`) y
 *  se recalcula con cada cambio del editor. */
function MenuDeTamanoDeImagen({ editor }: { editor: Editor }) {
  const { t } = useLanguage();
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [ancho, setAncho] = useState<number | null>(null);

  useEffect(() => {
    const actualizar = () => {
      if (!editor.isActive("image")) return setPos(null);
      const img = editor.view.nodeDOM(editor.state.selection.from) as HTMLElement | null;
      const ancla = editor.view.dom.closest("[data-ancla-del-cuerpo]") as HTMLElement | null;
      if (!img?.getBoundingClientRect || !ancla) return setPos(null);
      const r = img.getBoundingClientRect();
      const c = ancla.getBoundingClientRect();
      setPos({ top: Math.max(0, r.top - c.top - 40), left: Math.max(0, r.left - c.left) });
      setAncho((editor.getAttributes("image").width as number | null | undefined) ?? null);
    };
    actualizar();
    editor.on("selectionUpdate", actualizar);
    editor.on("transaction", actualizar);
    return () => {
      editor.off("selectionUpdate", actualizar);
      editor.off("transaction", actualizar);
    };
  }, [editor]);

  if (!pos) return null;
  return (
    <div
      role="group"
      aria-label={t("mail.comp.imgSize.label")}
      className="absolute z-20 flex items-center gap-0.5 rounded-control border border-border bg-popover p-1 text-popover-foreground shadow-md"
      style={{ top: pos.top, left: pos.left }}
    >
      {TAMANOS_DE_IMAGEN.map(({ clave, ancho: valor }) => (
        <button
          key={clave}
          type="button"
          aria-pressed={ancho === valor}
          // Sin robarle el foco al editor: si no, la imagen deja de estar elegida.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().updateAttributes("image", { width: valor }).run()}
          className={cn(
            "min-h-8 rounded-control px-2.5 text-xs font-medium transition-colors hover:bg-muted",
            ancho === valor && "bg-primary/10 text-primary hover:bg-primary/15",
          )}
        >
          {t(`mail.comp.imgSize.${clave}` as const)}
        </button>
      ))}
    </div>
  );
}
