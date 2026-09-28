import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { format, isToday, isThisYear } from "date-fns";
import { es } from "date-fns/locale";
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  Bell,
  Clock,
  Download,
  FileText,
  Inbox,
  Loader2,
  Mail,
  Newspaper,
  PanelLeft,
  Paperclip,
  PenLine,
  PenSquare,
  RefreshCw,
  Reply,
  ReplyAll,
  Forward,
  Check,
  Plus,
  Search,
  Send,
  Signature,
  ShieldAlert,
  Trash2,
  X,
  FolderInput,
  MailOpen,
  Tag,
  type LucideIcon,
  ChevronDown,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import AdjuntoVisor, { tipoDeAdjunto } from "@/components/correo/AdjuntoVisor";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useFormato } from "@/hooks/useFormato";
import type { Formato } from "@/lib/formato";
import { EmptyState } from "@/components/EmptyState";
import { MailBody } from "@/components/correo/MailBody";
import {
  MailComposer, TOPE_ADJUNTOS, type BorradorInicial,
} from "@/components/correo/MailComposer";
import EtiquetasDialog from "@/components/correo/EtiquetasDialog";
import { MailSignatureDialog } from "@/components/correo/MailSignatureDialog";
import {
  useMailbox,
  useMailFolders,
  useMailMessage,
  useImagenesIncrustadas,
  useMailMessages,
  useMailRealtime,
  useMarkSeen,
  usePrefetchMailMessage,
  useDownloadAttachment,
  useMailSignature,
  useMailSearch,
  claveDe,
  correoDe,
  nombreDe,
  type MailSummary,
 useMailBulk, type OperacionMasiva,
  useAdjuntosParaReenviar,
} from "@/hooks/useMailbox";
import { agruparEnHilos, sinPrefijos, type Hilo } from "@/lib/mailHilos";
import { resumenSinCita } from "@/lib/mailCita";
import { useHiloCompleto } from "@/hooks/useHiloCompleto";
import { opcionesDePosponer } from "@/lib/posponer";
import {
  useCorreosDeEtiqueta, useEtiquetarCorreos, useEtiquetas, useEtiquetasPorCorreo,
  useNoLeidosPorEtiqueta,
  type EtiquetaDeCorreo,
} from "@/hooks/useEtiquetasCorreo";
import { asuntoDeReenvio, destinatariosRespuesta, direccionesDe, participantesDe, tieneVariosInvolucrados } from "@/lib/mailAddr";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";

/**
 * Correo dentro de Maven.
 *
 * La casilla se provisiona sola al crear el usuario: nadie conecta nada ni
 * autoriza nada. Si esta pantalla llegara a mostrar el nombre del proveedor
 * de correo que hay detrás, está mal — el empleado solo conoce Maven.
 *
 * VISUAL: mismo lenguaje que Messenger (el vecino de al lado) — filas
 * rounded-2xl, activo con barra de gradiente a la izquierda, avatares con
 * iniciales sobre `avatarGradient`. Que pasar de una pestaña a la otra no
 * se sienta como cambiar de aplicación.
 *
 * MÓVIL PRIMERO, a propósito: Maven es una PWA y buena parte del equipo la
 * usa desde el teléfono. En pantalla chica se ve una sola columna por vez
 * (lista → mensaje) con las carpetas como píldoras arriba; recién en
 * escritorio aparece la columna de carpetas.
 */

/** Nombre e ícono por carpeta. Los nombres crudos vienen del servidor (son la
 *  LLAVE: "Papelera", "Correo no deseado"… se comparan y viajan a la edge tal
 *  cual); acá solo se elige cómo se muestran. Una carpeta que no está en el mapa
 *  (una que alguien creó a mano) se muestra con su nombre. */
const CARPETAS: Record<string, { nombre: TranslationKey; icono: LucideIcon }> = {
  INBOX: { nombre: "mail.folder.inbox", icono: Inbox },
  Enviado: { nombre: "mail.folder.sent", icono: Send },
  Borrador: { nombre: "mail.folder.drafts", icono: PenLine },
  "Correo no deseado": { nombre: "mail.folder.spam", icono: ShieldAlert },
  Papelera: { nombre: "mail.folder.trash", icono: Trash2 },
  Archive: { nombre: "mail.folder.archive", icono: Archive },
  Notification: { nombre: "mail.folder.notifications", icono: Bell },
  Newsletter: { nombre: "mail.folder.newsletters", icono: Newspaper },
  Plantillas: { nombre: "mail.folder.templates", icono: FileText },
  Snoozed: { nombre: "mail.folder.snoozed", icono: Clock },
};

/** El asunto que se guarda cuando un correo no trae ninguno (lo pone el
 *  servidor y lo compara lib/mailHilos): es DATO, no se traduce. Lo que se
 *  muestra en su lugar sí. */
const SIN_ASUNTO = "(sin asunto)";

/** Cómo se dice cada opción de posponer. `clave` es de lib/posponer. */
const ROTULO_POSPONER: Record<string, TranslationKey> = {
  tarde: "mail.snooze.afternoon",
  manana: "mail.snooze.tomorrow",
  semana: "mail.snooze.nextWeek",
  mes: "mail.snooze.inAMonth",
};

function iconoCarpeta(f: string): LucideIcon {
  return CARPETAS[f]?.icono ?? Mail;
}

/** Fecha corta para la lista: hora si es hoy, día y mes si es de este año. */
function fechaCorta(iso: string, formatoUi: Formato): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  if (isToday(d)) return format(d, "HH:mm");
  if (isThisYear(d)) return format(d, "d MMM", { locale: formatoUi.fechas });
  return format(d, "d MMM yy", { locale: formatoUi.fechas });
}

function fechaLarga(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Idioma fijo a propósito: va en la cita del correo que se le manda a otra persona.
  return format(d, "d 'de' MMMM 'de' yyyy, HH:mm", { locale: es });
}

/** El fondo de cada etiqueta. Tokens del tema: se ven bien en claro y en
 *  oscuro, y nadie puede elegir un color ilegible. */
const FONDO_ETIQUETA: Record<string, string> = {
  primary: "bg-primary", accent: "bg-accent", success: "bg-success",
  warning: "bg-warning", destructive: "bg-destructive", muted: "bg-muted-foreground",
};

/** El color del icono de cada etiqueta en la columna. Mismos tokens que el
 *  fondo del punto de la lista, pero como TEXTO: un icono relleno del color
 *  entero le gana visualmente al icono de la carpeta de al lado. */
const TEXTO_ETIQUETA: Record<string, string> = {
  primary: "text-primary", accent: "text-accent", success: "text-success",
  warning: "text-warning", destructive: "text-destructive", muted: "text-muted-foreground",
};

const CARPETAS_KEY = "maven.correo.carpetas";

/** ¿La columna de carpetas arranca abierta? Se recuerda, como el panel de Maven. */
const leerCarpetasAbiertas = (): boolean => {
  try { return localStorage.getItem(CARPETAS_KEY) !== "0"; } catch { return true; }
};

/** Una fila del detalle de destinatarios: la etiqueta y la gente debajo.
 *
 *  Cada persona en su propio renglón y con el correo completo a la vista: el
 *  punto de desplegar esto es responder "¿a quién más le llegó?", y una lista
 *  separada por comas que se corta no responde nada. Los correos se pueden
 *  seleccionar con el mouse para copiarlos. */
function FilaDetalle({ etiqueta, gente }: { etiqueta: string; gente: { nombre: string; email: string }[] }) {
  if (gente.length === 0) return null;
  return (
    <div className="flex gap-2">
      <span className="w-12 shrink-0 pt-0.5 text-muted-foreground">{etiqueta}</span>
      <div className="min-w-0 flex-1 space-y-1">
        {gente.map((p) => (
          <div key={p.email} className="min-w-0">
            {p.nombre && p.nombre !== p.email && (
              <span className="mr-1.5 font-medium text-foreground">{p.nombre}</span>
            )}
            <span className="break-all text-muted-foreground select-text">{p.email}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CorreoPage() {
  const formatoUi = useFormato();
  const { t } = useLanguage();
  const nombreCarpeta = (f: string): string => (CARPETAS[f] ? t(CARPETAS[f].nombre) : f);
  const { data: buzon, isLoading: cargandoBuzon, error: errorBuzon } = useMailbox();
  const [params, setParams] = useSearchParams();
  const hayBuzon = !!buzon?.is_active;

  const [carpeta, setCarpeta] = useState("INBOX");
  // Columna de carpetas plegable: igual que el panel lateral de Maven, al
  // plegarla quedan solo los iconos (con el nombre en el tooltip).
  const [carpetasAbiertas, setCarpetasAbiertas] = useState(leerCarpetasAbiertas);
  const alternarCarpetas = () => {
    setCarpetasAbiertas((v) => {
      try { localStorage.setItem(CARPETAS_KEY, v ? "0" : "1"); } catch { /* noop */ }
      return !v;
    });
  };
  const [sel, setSel] = useState<MailSummary | null>(null);
  // Detalle de destinatarios desplegado. Se cierra al cambiar de correo: si
  // no, abrir uno con veinte personas dejaba el siguiente con el panel puesto.
  const [verDestinatarios, setVerDestinatarios] = useState(false);
  // Adjunto abierto en el visor (índice dentro de `attachments`).
  const [adjuntoAbierto, setAdjuntoAbierto] = useState<number | null>(null);
  const [redactar, setRedactar] = useState<BorradorInicial | null>(null);
  const bajarParaReenviar = useAdjuntosParaReenviar();
  const etiquetas = useEtiquetas();
  const etiquetasPorCorreo = useEtiquetasPorCorreo();
  const noLeidosPorEtiqueta = useNoLeidosPorEtiqueta();
  const etiquetar = useEtiquetarCorreos();
  const [gestionandoEtiquetas, setGestionandoEtiquetas] = useState(false);
  // Qué etiqueta se está mirando. Null = una carpeta normal.
  const [etiquetaVista, setEtiquetaVista] = useState<string | null>(null);
  const correosDeEtiqueta = useCorreosDeEtiqueta(etiquetaVista);
  // Tocar una carpeta SALE de la etiqueta. Antes el botón solo cambiaba
  // `carpeta`, y como la lista le da prioridad a la etiqueta, seguías viendo la
  // etiqueta con Enviados marcado al lado: había que desmarcarla a mano (Jhon,
  // 28/09). Y si la carpeta ya era la actual, el efecto de `carpeta` no corre:
  // por eso el mensaje abierto se suelta acá también.
  const irACarpeta = (f: string) => {
    setEtiquetaVista(null);
    setSel(null);
    setCarpeta(f);
  };
  const [firmaAbierta, setFirmaAbierta] = useState(false);
  const firma = useMailSignature();
  // La firma que recibe el compositor: solo si está activada y no vacía.
  const firmaHtml = firma.data?.enabled ? firma.data.html || undefined : undefined;

  // Búsqueda: `busqueda` es lo que se escribe; `queryActiva` es lo que se
  // ejecuta (al Enter). Separadas para no pegarle al IMAP en cada tecla.
  const [busqueda, setBusqueda] = useState("");
  const [queryActiva, setQueryActiva] = useState("");
  const enBusqueda = queryActiva.trim().length > 0;

  const carpetas = useMailFolders(hayBuzon);
  const lista = useMailMessages(carpeta, hayBuzon);
  const resultados = useMailSearch(carpeta, queryActiva, hayBuzon);
  // ⚠️ La carpeta del correo ABIERTO, que no siempre es la seleccionada: en la
  // vista por etiqueta conviven correos de Recibidos, Archivados y Enviados.
  // Pedirlos todos a `carpeta` sería buscarlos donde no están.
  const carpetaDelAbierto = sel?.folder ?? carpeta;
  const mensaje = useMailMessage(carpetaDelAbierto, sel);
  // Las imágenes PEGADAS en el cuerpo viajan como partes del mensaje y el HTML
  // las nombra con `src="cid:…"`, que ningún navegador sabe pedir. Sin esto se
  // ven como un ícono roto, sin un solo error que lo explique.
  const cuerpoConImagenes = useImagenesIncrustadas({
    folder: carpetaDelAbierto,
    uid: sel?.uid != null ? Number(sel.uid) : null,
    html: mensaje.data?.html ?? null,
    attachments: mensaje.data?.attachments,
  });
  const precargar = usePrefetchMailMessage();
  const marcarLeido = useMarkSeen();
  const descargar = useDownloadAttachment();
  // La bandeja se actualiza sola cuando el sincronizador escribe (push).
  useMailRealtime(hayBuzon);

  // `?to=` (y opcional `?asunto=`): abrir el compositor con el destinatario
  // puesto. Lo usa la ficha de perfil del Messenger ("escribirle"). La URL se
  // limpia después para que un refresh no reabra el compositor.
  useEffect(() => {
    const to = params.get("to");
    if (!to || !hayBuzon) return;
    setRedactar({ to, subject: params.get("asunto") ?? undefined });
    const limpio = new URLSearchParams(params);
    limpio.delete("to");
    limpio.delete("asunto");
    setParams(limpio, { replace: true });
  }, [params, hayBuzon, setParams]);

  // Al cambiar de carpeta el mensaje abierto ya no corresponde: los números
  // de secuencia son por carpeta, así que dejarlo abriría OTRO correo. Y la
  // búsqueda se limpia: buscaba en la carpeta anterior.
  useEffect(() => {
    setSel(null);
    setBusqueda("");
    setQueryActiva("");
    setSeleccion(new Set());
  }, [carpeta]);

  // Selección múltiple, como en Gmail (Jhon, 09/09/2026): casillas en cada
  // fila, "seleccionar todos" y una barra de acciones arriba de la lista.
  // Funcionan: leído, no leído, archivar, spam y eliminar (acción "bulk" de la
  // edge, una sesión IMAP por lote). Posponer, mover y etiquetar siguen
  // deshabilitados: no tienen equivalente IMAP directo.
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  useEffect(() => { setSeleccion(new Set()); }, [queryActiva]);
  useEffect(() => { setVerDestinatarios(false); setAdjuntoAbierto(null); }, [sel]);
  const toggleSeleccion = (m: MailSummary) =>
    setSeleccion((prev) => {
      const next = new Set(prev);
      const k = claveDe(m);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });

  /** Marcar una conversación marca TODOS sus mensajes.
   *
   *  ⚠️ Es lo que hace que las acciones masivas sigan siendo honestas: si
   *  marcar el renglón seleccionara solo el último, tocar "Archivar" dejaría
   *  media conversación en la bandeja y la persona creería que la archivó
   *  entera. */
  const toggleSeleccionHilo = (h: Hilo<MailSummary>) =>
    setSeleccion((prev) => {
      const next = new Set(prev);
      const claves = h.mensajes.map(claveDe);
      const todosMarcados = claves.every((k) => next.has(k));
      for (const k of claves) {
        if (todosMarcados) next.delete(k);
        else next.add(k);
      }
      return next;
    });

  // El hook entrega los mensajes ya ordenados (más nuevo primero) venga de
  // la caché o del camino en vivo. En búsqueda, la lista son los resultados.
  const mensajes = useMemo(() => lista.data?.messages ?? [], [lista.data]);

  // Acciones de la barra de selección: una sola llamada por lote (IMAP + caché).
  const masiva = useMailBulk();
  const [confirmarBorrado, setConfirmarBorrado] = useState<MailSummary[] | null>(null);
  const NOMBRE_OP: Record<OperacionMasiva, (n: number) => string> = {
    seen: (n) => t(n === 1 ? "mail.bulk.seenOne" : "mail.bulk.seenMany", { n }),
    unseen: (n) => t(n === 1 ? "mail.bulk.unseenOne" : "mail.bulk.unseenMany", { n }),
    archive: (n) => t(n === 1 ? "mail.bulk.archivedOne" : "mail.bulk.archivedMany", { n }),
    spam: (n) => t(n === 1 ? "mail.bulk.spamOne" : "mail.bulk.spamMany", { n }),
    move: (n) => t(n === 1 ? "mail.bulk.movedOne" : "mail.bulk.movedMany", { n }),
    snooze: (n) => t(n === 1 ? "mail.bulk.snoozedOne" : "mail.bulk.snoozedMany", { n }),
    delete: (n) => carpeta === "Papelera"
      ? t(n === 1 ? "mail.bulk.deletedOne" : "mail.bulk.deletedMany", { n })
      : t(n === 1 ? "mail.bulk.trashedOne" : "mail.bulk.trashedMany", { n }),
  };
  /** Pone o saca una etiqueta de lo seleccionado.
   *
   *  ⚠️ Los correos SIN `message_id` se quedan afuera y se avisa: la etiqueta
   *  se guarda por ese id, no por (carpeta, uid). Un uid cambia al mover el
   *  correo de carpeta, así que la etiqueta se perdería —o se la quedaría otro
   *  mensaje distinto que reciba ese uid después. */
  const aplicarEtiqueta = (labelId: string, poner: boolean) => {
    const elegidos = items.filter((m) => seleccion.has(claveDe(m)));
    const ids = elegidos.map((m) => m.messageId).filter(Boolean) as string[];
    if (!ids.length) {
      // «Estos correos no tienen identificador…»
      toast.error(t("mail.noIdentifier"));
      return;
    }
    const sinId = elegidos.length - ids.length;
    etiquetar.mutate({ messageIds: ids, labelId, poner }, {
      onSuccess: () => {
        toast.success(poner ? t("mail.labels.applied") : t("mail.labels.removed"), {
          description: sinId ? t("mail.labels.skippedNoId", { n: sinId }) : undefined,
        });
        setSeleccion(new Set());
      },
      onError: (e) => toast.error((e as Error).message),
    });
  };

  const ejecutarMasiva = (
    op: OperacionMasiva, items: MailSummary[], dest?: string, volverAt?: string,
  ) => {
    const elegidos = items.filter((m) => seleccion.has(claveDe(m)));
    if (!elegidos.length) return;
    // Confirmar SIEMPRE que se borra, no solo en Papelera: mover a la
    // Papelera es recuperable, pero un clic accidental en una lista con
    // veinte correos seleccionados no lo parece cuando pasa (pedido de Jhon).
    if (op === "delete") { setConfirmarBorrado(elegidos); return; }
    lanzarMasiva(op, elegidos, dest, volverAt);
  };
  const lanzarMasiva = (
    op: OperacionMasiva, elegidos: MailSummary[], dest?: string, volverAt?: string,
  ) => {
    const n = elegidos.length;
    if (sel && elegidos.some((m) => claveDe(m) === claveDe(sel)) && op !== "seen" && op !== "unseen") setSel(null);
    setSeleccion(new Set());
    // ⚠️ UNA LLAMADA POR CARPETA, y no una sola con la carpeta seleccionada.
    //
    // Los UID son POR CARPETA: el uid 5 de Recibidos y el uid 5 de Archivados
    // son correos DISTINTOS. En la vista por etiqueta conviven correos de
    // varias, así que mandarlos todos como si fueran de una sola no fallaría —
    // movería OTROS mensajes, los que tengan esos uid en la carpeta que se
    // mandó. Es la clase de error que no se nota hasta que falta un correo.
    const porCarpeta = new Map<string, MailSummary[]>();
    for (const m of elegidos) {
      const f = m.folder ?? carpeta;
      const ya = porCarpeta.get(f);
      if (ya) ya.push(m); else porCarpeta.set(f, [m]);
    }
    for (const [f, delGrupo] of porCarpeta) {
      masiva.mutate(
        { folder: f, op, items: delGrupo, dest, volverAt },
        {
          // El aviso cuenta LO DE ESTE GRUPO, no el total: con correos de dos
          // carpetas saldrían dos avisos diciendo el mismo número grande.
          onSuccess: (r) => {
            toast.success(NOMBRE_OP[op](delGrupo.length - (r.omitidos ?? 0)), {
              description: r.omitidos
                ? t("mail.bulk.skippedNoId", { n: r.omitidos })
                : undefined,
            });
          },
          onError: (e) => toast.error((e as Error).message || t("mail.bulk.error")),
        },
      );
    }
  };
  // Mirando una etiqueta, la lista son SUS correos —de cualquier carpeta— y no
  // los de la carpeta seleccionada.
  const items: MailSummary[] = etiquetaVista
    ? ((correosDeEtiqueta.data ?? []) as Record<string, unknown>[]).map((m) => ({
        id: m.id as string,
        uid: m.uid as number,
        // ⚠️ La carpeta viaja con CADA correo: en una etiqueta conviven correos
        // de Recibidos, Archivados y Enviados, y abrir uno o archivarlo necesita
        // saber en cuál está. Usar `carpeta` acá iría a buscarlo donde no está.
        folder: m.folder as string,
        from: (m.from_addr as string) ?? "",
        to: (m.to_addr as string) ?? "",
        cc: (m.cc_addr as string) ?? undefined,
        subject: (m.subject as string) ?? SIN_ASUNTO,
        date: (m.date as string) ?? "",
        snippet: (m.snippet as string) ?? "",
        messageId: (m.message_id as string) ?? undefined,
        // Las cabeceras del hilo viajan también acá: una etiqueta junta
        // correos de varias carpetas, que es justo donde más se nota si la
        // conversación no se arma.
        inReplyTo: (m.in_reply_to as string) ?? undefined,
        refs: (m.refs as string[]) ?? undefined,
        unread: !!m.unread,
        origen: "cache" as const,
      }))
    : enBusqueda ? (resultados.data?.messages ?? []) : mensajes;

  // ── Conversaciones ─────────────────────────────────────────────────────
  // La lista muestra un renglón por HILO, no por mensaje. Lo pidió Keila: con
  // veinte respuestas a un comunicado, veinte renglones sueltos no se leen.
  //
  // En BÚSQUEDA no se agrupa: quien busca quiere ver los mensajes que
  // coinciden, no las conversaciones que los contienen. Esconder el mensaje
  // encontrado adentro de un hilo sería justo lo contrario de buscar.
  const hilos = useMemo<Hilo<MailSummary>[]>(
    () => (enBusqueda
      ? items.map((m) => ({ asunto: m.subject, mensajes: [m], ultimo: m, cantidad: 1 }))
      : agruparEnHilos(items)),
    [items, enBusqueda],
  );

  /** El hilo al que pertenece el correo abierto, para mostrarlo entero. */
  const hiloAbierto = useMemo(
    () => (sel ? hilos.find((h) => h.mensajes.some((m) => claveDe(m) === claveDe(sel))) : undefined),
    [hilos, sel],
  );

  // ⚠️ UNA CONVERSACIÓN NO VIVE EN UNA CARPETA. Lo que te llegó está en
  // Recibidos y lo que contestaste en Enviados: agrupando dentro de la carpeta
  // a la vista, el hilo muestra la mitad de la charla — y encima la mitad en
  // la que uno no habla. Esto trae el resto.
  const { hilo: hiloCompleto, cargando: cargandoHilo } = useHiloCompleto({
    conocidos: useMemo(
      () => hiloAbierto?.mensajes ?? (sel ? [sel] : []),
      [hiloAbierto, sel],
    ),
    asunto: hiloAbierto?.asunto ?? sel?.subject ?? "",
    habilitado: !!sel && !enBusqueda,
  });

  /** Los otros mensajes de la conversación, partidos por dónde van respecto
   *  del abierto. Gmail apila la charla completa y deja expandido el último;
   *  poner todo arriba haría que una respuesta nueva se lea como si fuera
   *  anterior a lo que estás leyendo. */
  const { antes: hiloAntes, despues: hiloDespues } = useMemo(() => {
    if (!sel) return { antes: [], despues: [] as MailSummary[] };
    const cuando = Date.parse(sel.date) || 0;
    const otros = hiloCompleto.filter((m) =>
      m.messageId ? m.messageId !== sel.messageId : claveDe(m) !== claveDe(sel)
    );
    return {
      antes: otros.filter((m) => (Date.parse(m.date) || 0) <= cuando),
      despues: otros.filter((m) => (Date.parse(m.date) || 0) > cuando),
    };
  }, [hiloCompleto, sel]);
  const cargandoItems = etiquetaVista
    ? correosDeEtiqueta.isLoading
    : enBusqueda ? resultados.isFetching : lista.isLoading;
  const errorItems = etiquetaVista
    ? correosDeEtiqueta.error
    : enBusqueda ? resultados.error : lista.error;

  // La precarga de los 2 más nuevos ya NO se hace desde acá: viene con la
  // lista (`with_bodies`), en la misma sesión IMAP. Disparar conexiones
  // extra desde el cliente era parte de lo que colgaba la cuenta.

  if (cargandoBuzon) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-4 w-64" />
      </div>
    );
  }

  if (errorBuzon) {
    return (
      <Aviso
        titulo={t("mail.statusError")}
        detalle={(errorBuzon as Error).message}
      />
    );
  }

  if (!hayBuzon) {
    return (
      <EmptyState
        className="mx-auto max-w-xl py-20"
        seed="empty-correo"
        title={t("mail.noMailbox")}
        description={t("mail.noMailboxDesc")}
      />
    );
  }

  const enLista = sel === null;

  const abrir = (m: MailSummary) => {
    setSel(m);
    // "Leído" se marca al ABRIR, no al descargar: la precarga baja el
    // cuerpo sin tocar la bandera.
    if (m.unread) marcarLeido.mutate({ folder: m.folder ?? carpeta, m });
  };

  // Arma el borrador de respuesta. `aTodos`: además del remitente, arrastra
  // el resto del Para y el Copia del original (menos yo mismo), como Gmail.
  // La decisión de a QUIÉN va (lo delicado) vive en `destinatariosRespuesta`,
  // que es pura y está testeada.
  const abrirRespuesta = (aTodos: boolean) => {
    const m = mensaje.data;
    if (!m) return;
    // El `Message-ID` viaja en el resumen seleccionado (caché o vivo). Sin
    // él la respuesta le aparece suelta al otro, fuera de la conversación.
    const messageId = sel?.messageId;
    const { to, cc } = destinatariosRespuesta(
      { from: m.from, to: m.to, cc: m.cc, yo: buzon?.email_address ?? "" },
      aTodos,
    );
    setRedactar({
      to,
      cc: cc || undefined,
      subject: /^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject}`,
      inReplyTo: messageId || undefined,
      // ⚠️ `References` es la CADENA entera, no solo el padre: el del padre
      // más el padre. Mandando solo el padre, el que recibe puede encadenar
      // esta respuesta pero pierde el resto del hilo si le falta algún
      // eslabón del medio — y una conversación larga se le parte en trozos.
      // Es lo que arman Gmail y Outlook, y lo que pide RFC 5322 §3.6.4.
      references: [...(sel?.refs ?? []), messageId]
        .filter(Boolean).join(" ") || undefined,
      citar: {
        de: nombreDe(m.from),
        fecha: fechaLarga(m.date),
        texto: (m.text ?? "").slice(0, 4000),
      },
    });
  };

  // ── Reenviar ───────────────────────────────────────────────────────────
  // Lo pidió Carolina: no existía. Reenviar SIN los adjuntos no sería
  // reenviar —casi siempre el archivo ES el correo—, así que se bajan primero
  // y recién después se abre el compositor con todo puesto.
  const reenviar = async () => {
    const m = mensaje.data;
    if (!m) return;
    const uid = sel?.uid != null ? Number(sel.uid) : null;
    const metas = m.attachments ?? [];

    let adjuntosIniciales: BorradorInicial["adjuntosIniciales"];
    if (metas.length > 0 && uid != null) {
      const pesa = metas.reduce((n, a) => n + (a.sizeBytes ?? 0), 0);
      if (pesa > TOPE_ADJUNTOS) {
        // Se avisa ANTES de bajar nada: traer 40 MB a memoria para después
        // decir que no entran es castigar al navegador por un límite que ya
        // se conocía. El correo se reenvía igual, sin los archivos.
        toast.warning(
          t("mail.fwd.tooBig", { mb: (pesa / 1024 / 1024).toFixed(1) }),
        );
      } else {
        try {
          adjuntosIniciales = await bajarParaReenviar.mutateAsync({
            folder: carpeta, uid, adjuntos: metas,
          });
        } catch (e) {
          // Que falle un adjunto no puede impedir reenviar el mensaje.
          toast.error(t("mail.fwd.fetchError", { error: (e as Error).message }));
        }
      }
    }

    setRedactar({
      // A quién va lo elige quien reenvía: ese es el punto del reenvío.
      to: "",
      subject: asuntoDeReenvio(m.subject),
      // Su propio cajón de borrador: ver `firmaContexto`.
      reenvioDe: sel?.messageId || `uid:${carpeta}:${uid ?? "?"}`,
      // ⚠️ SIN `inReplyTo`: un reenvío no cuelga del hilo original. Ponerlo
      // metería el correo en una conversación que su destinatario no tuvo.
      citar: {
        reenvio: true,
        de: m.from,
        para: m.to,
        asunto: m.subject,
        fecha: fechaLarga(m.date),
        texto: (m.text ?? "").slice(0, 4000),
      },
      adjuntosIniciales,
    });
  };

  const responder = () => abrirRespuesta(false);
  const responderATodos = () => abrirRespuesta(true);

  // Retomar un borrador del servidor en el compositor: se cargan sus campos y
  // su UID, para reemplazarlo al re-guardar o borrarlo al enviar.
  const editarBorrador = () => {
    const m = mensaje.data;
    if (!m || !sel) return;
    setRedactar({
      to: direccionesDe(m.to).join(", "),
      cc: m.cc ? direccionesDe(m.cc).join(", ") || undefined : undefined,
      subject: m.subject === SIN_ASUNTO ? "" : m.subject,
      cuerpoHtml: m.html ?? undefined,
      serverDraftUid: sel.uid != null ? Number(sel.uid) : undefined,
    });
  };

  // "Responder a todos" solo aparece cuando hay más de una persona en juego
  // además de mí: si el correo venía de una sola, es idéntico a "Responder".
  const hayVariosDestinatarios = mensaje.data
    ? tieneVariosInvolucrados({
        from: mensaje.data.from,
        to: mensaje.data.to,
        cc: mensaje.data.cc,
        yo: buzon?.email_address ?? "",
      })
    : false;

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col">
      {/* Encabezado */}
      <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
        {/* En móvil la flecha es la única forma de volver de un mensaje. */}
        {!enLista && (
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full md:hidden"
            onClick={() => setSel(null)}
            aria-label={t("mail.backToList")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        {/* Plegar/desplegar la columna de carpetas — solo donde esa columna existe. */}
        <Button
          variant="ghost"
          size="icon"
          className="hidden rounded-full hover:bg-primary/8 lg:inline-flex"
          onClick={alternarCarpetas}
          aria-label={carpetasAbiertas ? t("mail.hideFolders") : t("mail.showFolders")}
          aria-expanded={carpetasAbiertas}
          title={carpetasAbiertas ? t("mail.hideFolders") : t("mail.showFolders")}
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold tracking-tight">{t("nav.mail")}</h1>
          <p className="truncate text-xs text-muted-foreground">{buzon.email_address}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full hover:bg-primary/8"
          onClick={() => setFirmaAbierta(true)}
          aria-label={t("mail.editSignature")}
          title={t("mail.sig.title")}
        >
          <Signature className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full hover:bg-primary/8"
          onClick={() => lista.refetch()}
          disabled={lista.isFetching}
          aria-label={t("dashboard.refresh")}
        >
          <RefreshCw className={cn("h-4 w-4", lista.isFetching && "animate-spin")} />
        </Button>
        <Button
          onClick={() => setRedactar({})}
          size="sm"
          className="rounded-full bg-gradient-to-r from-accent to-primary text-white shadow-sm transition-opacity hover:opacity-90"
        >
          <PenSquare className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">{t("mail.compose")}</span>
        </Button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Carpetas: columna en escritorio grande. */}
        <nav className={cn(
          "hidden shrink-0 border-r border-border/60 p-2 transition-[width] duration-200 lg:block",
          carpetasAbiertas ? "w-52" : "w-[60px]",
        )}>
          {carpetasAbiertas ? (
            <p className="px-3 pb-1 pt-2 text-xs font-semibold text-muted-foreground">
              {t("mail.folders")}
            </p>
          ) : (
            <div className="pb-1 pt-2" aria-hidden />
          )}
          {carpetas.isLoading &&
            [...Array(5)].map((_, i) => (
              <div key={i} className={cn("flex items-center gap-2.5 py-2", carpetasAbiertas ? "px-3" : "justify-center px-0")}>
                <Skeleton className="h-4 w-4 rounded" />
                {carpetasAbiertas && <Skeleton className="h-3.5 w-24" />}
              </div>
            ))}
          {(carpetas.data ?? []).map(({ folder: f, unread }) => {
            const Icono = iconoCarpeta(f);
            // Mirando una etiqueta, ninguna carpeta se marca: la vista es UNA sola.
            const activa = !etiquetaVista && f === carpeta;
            return (
              <button
                key={f}
                onClick={() => irACarpeta(f)}
                title={carpetasAbiertas ? undefined : `${nombreCarpeta(f)}${unread > 0 ? ` · ${t("mail.nUnread", { n: unread })}` : ""}`}
                aria-label={nombreCarpeta(f)}
                aria-current={activa ? "page" : undefined}
                className={cn(
                  "relative flex w-full items-center gap-2.5 rounded-2xl py-2 text-left text-sm transition-colors",
                  carpetasAbiertas ? "px-3" : "justify-center px-0",
                  activa
                    ? "bg-primary/12 font-medium text-foreground before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r before:bg-gradient-to-b before:from-accent before:to-primary"
                    : "text-muted-foreground hover:bg-primary/5 hover:text-foreground",
                )}
              >
                <span className="relative shrink-0">
                  <Icono className={cn("h-4 w-4", activa && "text-primary")} />
                  {/* Plegada no cabe el número al lado: va como globito sobre el icono. */}
                  {!carpetasAbiertas && unread > 0 && (
                    <span className="absolute -right-2 -top-1.5 min-w-[15px] rounded-full bg-primary px-1 text-[9px] font-bold leading-[15px] text-primary-foreground">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                </span>
                {carpetasAbiertas && (
                  <>
                    <span className="truncate">{nombreCarpeta(f)}</span>
                    {unread > 0 && (
                      <span className="ml-auto rounded-full bg-primary px-1.5 text-[10px] font-bold leading-4 text-primary-foreground">
                        {unread > 99 ? "99+" : unread}
                      </span>
                    )}
                  </>
                )}
              </button>
            );
          })}

          {/* ── Etiquetas ─────────────────────────────────────────────────
              Debajo de las carpetas, como en Gmail. Una etiqueta NO es una
              carpeta: cruza todas, así que un correo etiquetado y después
              archivado sigue apareciendo acá. */}
          {(etiquetas.data ?? []).length > 0 && carpetasAbiertas && (
            <p className="flex items-center justify-between px-3 pb-1 pt-4 text-xs font-semibold text-muted-foreground">
              {t("mail.labels")}
              <button
                type="button"
                aria-label={t("mail.labels.manage")}
                title={t("mail.labels.manage")}
                onClick={() => setGestionandoEtiquetas(true)}
                className="rounded-full p-0.5 transition-colors hover:bg-muted hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </p>
          )}
          {(etiquetas.data ?? []).map((e) => {
            const activa = etiquetaVista === e.id;
            const sinLeerEtiqueta = noLeidosPorEtiqueta.data?.get(e.id) ?? 0;
            return (
              <button
                key={e.id}
                onClick={() => { setEtiquetaVista(activa ? null : e.id); setSel(null); }}
                title={carpetasAbiertas ? undefined : e.nombre}
                aria-label={e.nombre}
                aria-current={activa ? "page" : undefined}
                className={cn(
                  "relative flex w-full items-center gap-2.5 rounded-2xl py-2 text-left text-sm transition-colors",
                  carpetasAbiertas ? "px-3" : "justify-center px-0",
                  activa
                    ? "bg-primary/12 font-medium text-foreground before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r before:bg-gradient-to-b before:from-accent before:to-primary"
                    : sinLeerEtiqueta > 0
                      ? "font-semibold text-foreground hover:bg-primary/5"
                      : "text-muted-foreground hover:bg-primary/5 hover:text-foreground",
                )}
              >
                {/* Icono de ETIQUETA, del color de la etiqueta: ocupa la misma
                    columna que los iconos de las carpetas, así los dos bloques
                    se leen como una sola lista y no como dos cosas pegadas. */}
                <span className="relative shrink-0">
                  <Tag className={cn("h-4 w-4", TEXTO_ETIQUETA[e.color])} />
                  {!carpetasAbiertas && sinLeerEtiqueta > 0 && (
                    <span className="absolute -right-2 -top-1.5 min-w-[15px] rounded-full bg-primary px-1 text-[9px] font-bold leading-[15px] text-primary-foreground">
                      {sinLeerEtiqueta > 9 ? "9+" : sinLeerEtiqueta}
                    </span>
                  )}
                </span>
                {carpetasAbiertas && (
                  <>
                    <span className="truncate">{e.nombre}</span>
                    {sinLeerEtiqueta > 0 && (
                      <span className="ml-auto rounded-full bg-primary px-1.5 text-[10px] font-bold leading-4 text-primary-foreground">
                        {sinLeerEtiqueta > 99 ? "99+" : sinLeerEtiqueta}
                      </span>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </nav>

        {/* Lista */}
        <div
          className={cn(
            "min-w-0 flex-col border-r border-border/60 md:flex md:w-80 md:shrink-0 lg:w-96 2xl:w-[28rem]",
            enLista ? "flex flex-1" : "hidden",
          )}
        >
          {/* Carpetas como píldoras cuando no está la columna lateral —
              mismo patrón que los filtros de Messenger. */}
          {/* SIN scrollbar-hide a propósito: con la barra oculta, quien usa
              mouse no tiene forma de desplazarse entre las carpetas (el
              gesto táctil no existe y la rueda scrollea vertical). La
              barra finita es el asa. */}
          <div className="flex gap-1.5 overflow-x-auto border-b border-border/60 px-3 py-2 pb-1.5 lg:hidden">
            {(carpetas.data ?? [{ folder: carpeta, unread: 0 }]).map(({ folder: f }) => {
              const Icono = iconoCarpeta(f);
              const activa = !etiquetaVista && f === carpeta;
              return (
                <button
                  key={f}
                  onClick={() => irACarpeta(f)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    activa
                      ? "bg-primary text-primary-foreground"
                      : "bg-primary/5 text-muted-foreground hover:bg-primary/10",
                  )}
                >
                  <Icono className="h-3.5 w-3.5" />
                  {nombreCarpeta(f)}
                </button>
              );
            })}
          </div>

          {/* Buscador de la carpeta actual (IMAP SEARCH del lado del
              servidor: busca en TODO el histórico, no solo en la caché). */}
          <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setQueryActiva(busqueda.trim());
                  setSel(null);
                }
                if (e.key === "Escape") {
                  setBusqueda("");
                  setQueryActiva("");
                }
              }}
              placeholder={t("mail.searchIn", { folder: nombreCarpeta(carpeta) })}
              autoComplete="off"
              className="h-7 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
            />
            {(busqueda || enBusqueda) && (
              <button
                type="button"
                onClick={() => {
                  setBusqueda("");
                  setQueryActiva("");
                }}
                title={t("common.clearSearch")}
                aria-label={t("common.clearSearch")}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* [&_[data-radix-scroll-area-viewport]>div]: Radix envuelve el
              contenido en un div display:table; min-width:100% que crece más
              que el viewport y SE COME EL BORDE DERECHO (acá, las horas de
              la lista — mismo bug que ya mordió a Messenger). Forzarlo a
              block lo clampa y deja funcionar a truncate/min-w-0. */}
          <AlertDialog open={!!confirmarBorrado} onOpenChange={(o) => { if (!o) setConfirmarBorrado(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {carpeta === "Papelera" ? t("mail.del.foreverTitle") : t("mail.del.trashTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {carpeta === "Papelera"
                ? (confirmarBorrado?.length === 1
                    ? t("mail.del.foreverOne")
                    : t("mail.del.foreverMany", { n: confirmarBorrado?.length ?? 0 }))
                : (confirmarBorrado?.length === 1
                    ? t("mail.del.trashOne")
                    : t("mail.del.trashMany", { n: confirmarBorrado?.length ?? 0 }))}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { const e = confirmarBorrado; setConfirmarBorrado(null); if (e) lanzarMasiva("delete", e); }}
            >
              {carpeta === "Papelera" ? t("mail.deleteForever") : t("mail.moveToTrash")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Barra de selección (Gmail): casilla de todos + acciones. */}
          {!cargandoItems && items.length > 0 && (() => {
            const todos = items.length > 0 && items.every((m) => seleccion.has(claveDe(m)));
            const algunos = items.some((m) => seleccion.has(claveDe(m)));
            const n = items.filter((m) => seleccion.has(claveDe(m))).length;
            const hayNoLeidos = items.some((m) => seleccion.has(claveDe(m)) && m.unread);
            return (
              <div className="flex flex-wrap items-center gap-1 border-b border-border/60 px-3 py-1.5" data-testid="barra-seleccion">
                <Checkbox
                  checked={todos ? true : algunos ? "indeterminate" : false}
                  onCheckedChange={() => setSeleccion(todos ? new Set() : new Set(items.map(claveDe)))}
                  aria-label={todos ? t("mail.sel.clear") : t("mail.sel.all")}
                  title={todos ? t("mail.sel.clear") : t("mail.sel.all")}
                />
                {n > 0 ? (
                  <>
                    <span className="ml-1 text-xs font-medium text-foreground">{t(n === 1 ? "mail.sel.selectedOne" : "mail.sel.selectedMany", { n })}</span>
                    <div className="ml-1 flex items-center gap-0.5">
                      <AccionBarra icono={MailOpen} etiqueta={t("mail.act.markRead")} onClick={() => ejecutarMasiva("seen", items)} disabled={!hayNoLeidos || masiva.isPending} />
                      <AccionBarra icono={Mail} etiqueta={t("mail.act.markUnread")} onClick={() => ejecutarMasiva("unseen", items)} disabled={masiva.isPending} />
                      <span className="mx-1 h-4 w-px bg-border/70" />
                      <AccionBarra icono={Archive} etiqueta={t("mail.act.archive")} onClick={() => ejecutarMasiva("archive", items)} disabled={masiva.isPending || carpeta === "Archive"} />
                      <AccionBarra icono={ShieldAlert} etiqueta={t("mail.act.markSpam")} onClick={() => ejecutarMasiva("spam", items)} disabled={masiva.isPending || carpeta === "Correo no deseado"} />
                      <AccionBarra icono={Trash2} etiqueta={carpeta === "Papelera" ? t("mail.deleteForever") : t("common.delete")} onClick={() => ejecutarMasiva("delete", items)} disabled={masiva.isPending} />
                      <span className="mx-1 h-4 w-px bg-border/70" />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            title={t("mail.act.snooze")}
                            disabled={masiva.isPending}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                          >
                            <Clock className="h-4 w-4" />
                            <span className="sr-only">{t("mail.act.snooze")}</span>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-56">
                          {/* Las opciones se calculan al ABRIR el menú, no al
                              montar la página: con la pestaña abierta desde la
                              mañana, "esta tarde" ya podría haber pasado. */}
                          {opcionesDePosponer().map((o) => (
                            o.cuando && (
                              <DropdownMenuItem
                                key={o.clave}
                                onSelect={() =>
                                  ejecutarMasiva("snooze", items, undefined, o.cuando!.toISOString())
                                }
                              >
                                <span className="flex-1">{ROTULO_POSPONER[o.clave] ? t(ROTULO_POSPONER[o.clave]) : o.rotulo}</span>
                                <span className="ml-3 text-[10px] tabular-nums text-muted-foreground">
                                  {format(o.cuando, "d MMM HH:mm", { locale: formatoUi.fechas })}
                                </span>
                              </DropdownMenuItem>
                            )
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            title={t("mail.act.moveTo")}
                            disabled={masiva.isPending}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                          >
                            <FolderInput className="h-4 w-4" />
                            <span className="sr-only">{t("mail.act.moveTo")}</span>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="max-h-72 overflow-auto">
                          {/* Las carpetas REALES de la cuenta, no una lista
                              escrita a mano: si alguien crea una en Zoho
                              aparece acá sola, y la edge valida el nombre
                              contra la misma fuente antes de mover nada. */}
                          {(carpetas.data ?? [])
                            .map((c) => c.folder)
                            .filter((f) => f !== carpeta)
                            .map((f) => (
                              <DropdownMenuItem
                                key={f}
                                onSelect={() => ejecutarMasiva("move", items, f)}
                              >
                                {nombreCarpeta(f)}
                              </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            title={t("mail.act.label")}
                            disabled={etiquetar.isPending}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                          >
                            <Tag className="h-4 w-4" />
                            <span className="sr-only">{t("mail.act.label")}</span>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-auto">
                          {(etiquetas.data ?? []).length === 0 && (
                            <p className="px-2 py-1.5 text-xs text-muted-foreground">
                              {t("mail.labels.noneYet")}
                            </p>
                          )}
                          {(etiquetas.data ?? []).map((e) => {
                            // La casilla muestra si TODOS los seleccionados ya
                            // la tienen: con algunos sí y otros no, tocar
                            // agrega (que es lo que se espera al etiquetar).
                            const elegidos = items.filter((m) => seleccion.has(claveDe(m)));
                            const idsMsg = elegidos.map((m) => m.messageId).filter(Boolean) as string[];
                            const todos = idsMsg.length > 0 &&
                              idsMsg.every((id) => (etiquetasPorCorreo.data?.get(id) ?? []).includes(e.id));
                            return (
                              <DropdownMenuItem
                                key={e.id}
                                onSelect={() => aplicarEtiqueta(e.id, !todos)}
                              >
                                <Check className={cn("mr-2 h-4 w-4", todos ? "opacity-100" : "opacity-0")} />
                                <span className={cn("mr-2 h-2 w-2 shrink-0 rounded-full", FONDO_ETIQUETA[e.color])} />
                                <span className="truncate">{e.nombre}</span>
                              </DropdownMenuItem>
                            );
                          })}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onSelect={() => setGestionandoEtiquetas(true)}>
                            <span className="mr-2 h-4 w-4" />
                            {t("mail.labels.manageEllipsis")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSeleccion(new Set())}
                      className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                    >
                      {t("mail.sel.clearShort")}
                    </button>
                  </>
                ) : (
                  <span className="ml-1 text-xs text-muted-foreground">
                    {t(items.length === 1 ? "mail.countOne" : "mail.countMany", { n: items.length })}
                  </span>
                )}
              </div>
            );
          })()}

          <ScrollArea className="flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block">
            <div className="space-y-0.5 p-2">
              {cargandoItems &&
                [...Array(6)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-2.5 py-2.5">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-2/5" />
                      <Skeleton className="h-3 w-4/5" />
                    </div>
                  </div>
                ))}
              {errorItems && (
                <Aviso
                  titulo={enBusqueda ? t("mail.searchError") : t("mail.listError")}
                  detalle={(errorItems as Error).message}
                />
              )}
              {!cargandoItems && !errorItems && items.length === 0 && (
                enBusqueda ? (
                  <VacioSuave
                    icono={Search}
                    texto={t("mail.searchEmpty", { q: queryActiva, folder: nombreCarpeta(carpeta) })}
                  />
                ) : (
                  <VacioSuave
                    icono={iconoCarpeta(carpeta)}
                    texto={t("mail.folderEmpty", { folder: nombreCarpeta(carpeta) })}
                  />
                )
              )}
              {hilos.map((h) => (
                <FilaMensaje
                  key={claveDe(h.ultimo)}
                  m={h.ultimo}
                  // El hilo entero cuenta como activo: da igual cuál de sus
                  // mensajes esté abierto, el renglón es el mismo.
                  activo={!!sel && h.mensajes.some((m) => claveDe(m) === claveDe(sel))}
                  // Y como seleccionado: marcar la conversación y que la acción
                  // masiva se lleve solo el último sería una trampa.
                  seleccionado={h.mensajes.every((m) => seleccion.has(claveDe(m)))}
                  onToggleSeleccion={() => toggleSeleccionHilo(h)}
                  onClick={() => abrir(h.ultimo)}
                  onPrecargar={() => precargar(carpeta, h.ultimo)}
                  mostrarDestinatario={carpeta === "Enviado" || carpeta === "Borrador"}
                  enHilo={h.cantidad}
                  // El hilo se llama como empezó, sin los "Re: RE: RV:" que
                  // van apilando los clientes. Lo calcula `agruparEnHilos`
                  // porque el más viejo CARGADO no siempre es la raíz.
                  asuntoDelHilo={h.asunto}
                  // Las de CUALQUIER mensaje del hilo: etiquetás una
                  // conversación, no un mensaje suelto adentro de ella.
                  etiquetas={(() => {
                    const ids = new Set<string>();
                    for (const m of h.mensajes) {
                      for (const id of etiquetasPorCorreo.data?.get(m.messageId ?? "") ?? []) ids.add(id);
                    }
                    return (etiquetas.data ?? []).filter((e) => ids.has(e.id));
                  })()}
                  // Sin leer si CUALQUIERA del hilo lo está: si no, una
                  // conversación con una respuesta nueva se vería leída.
                  hiloSinLeer={h.mensajes.some((m) => m.unread)}
                />
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Lectura */}
        <div className={cn("min-w-0 flex-1", enLista ? "hidden md:block" : "block")}>
          {sel === null ? (
            <div className="hidden h-full flex-col items-center justify-center gap-3 md:flex">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-accent/10 to-primary/10">
                <Mail className="h-7 w-7 text-primary/70" />
              </div>
              <p className="text-sm text-muted-foreground">{t("mail.pickOne")}</p>
            </div>
          ) : mensaje.isLoading ? (
            <div className="w-full space-y-4 px-4 py-6 sm:px-6">
              <Skeleton className="h-7 w-3/4" />
              <div className="flex items-center gap-3">
                <Skeleton className="h-11 w-11 rounded-full" />
                <div className="space-y-1.5">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-3 w-56" />
                </div>
              </div>
              <Skeleton className="h-40 w-full rounded-2xl" />
            </div>
          ) : mensaje.error ? (
            <Aviso
              titulo={t("mail.openError")}
              detalle={(mensaje.error as Error).message}
            />
          ) : mensaje.data ? (
            <ScrollArea className="h-full [&_[data-radix-scroll-area-viewport]>div]:!block">
              {/* Alineado a la IZQUIERDA, no centrado: en un monitor ancho el
                  correo quedaba flotando en el medio con dos gutters enormes.
                  Se le da un poco más de ancho recién en pantallas 2xl. */}
              <article className="w-full px-4 py-6 sm:px-6">
                {/* El asunto de la CONVERSACIÓN, sin los «Re:» que apilan
                    los clientes: Gmail titula el hilo «Test», no «Re: Test».
                    Si al sacarlos no queda nada, se deja el original. */}
                <h2 className="text-xl font-semibold leading-snug tracking-tight sm:text-2xl">
                  {asuntoVisible(sinPrefijos(mensaje.data.subject) || mensaje.data.subject, t)}
                </h2>

                {/* ── Lo ANTERIOR de la conversación ──────────────────────
                    Plegados: quién, cuándo y su resumen. Se abren con un clic
                    y recién ahí se baja el cuerpo — abrir un hilo de veinte no
                    puede costar veinte descargas. */}
                <TiraDeHilo mensajes={hiloAntes} abrir={abrir} className="mt-4" />

                <div className="mt-4 flex items-start gap-3">
                  <UserAvatar name={nombreDe(mensaje.data.from)} size="lg" className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium">{nombreDe(mensaje.data.from)}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {correoDe(mensaje.data.from)}
                      </span>
                    </div>
                    {/* Los destinatarios iban en UNA línea con `truncate`: con
                        más de dos, el resto quedaba invisible y no había forma
                        de saber a quién más le había llegado el correo. Ahora
                        el resumen se despliega y muestra la lista completa. */}
                    {(() => {
                      const para = participantesDe(mensaje.data.to ?? "");
                      const copia = participantesDe(mensaje.data.cc ?? "");
                      const total = para.length + copia.length;
                      const resumen = para.length === 0
                        ? t("mail.noRecipient")
                        : total === 1
                          ? (para[0].nombre || para[0].email)
                          : t("mail.andNMore", { name: para[0].nombre || para[0].email, n: total - 1 });
                      return (
                        <>
                          <button
                            type="button"
                            onClick={() => setVerDestinatarios((v) => !v)}
                            aria-expanded={verDestinatarios}
                            className="mt-0.5 flex max-w-full items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                          >
                            <span className="truncate">{t("mail.to")} {resumen}</span>
                            <ChevronDown
                              className={cn(
                                "h-3 w-3 shrink-0 transition-transform",
                                verDestinatarios && "rotate-180",
                              )}
                            />
                          </button>

                          {verDestinatarios && (
                            <div className="mt-2 space-y-2 rounded-xl border border-border/60 bg-muted/30 p-3 text-xs">
                              <FilaDetalle etiqueta={t("mail.from")} gente={participantesDe(mensaje.data.from ?? "")} />
                              <FilaDetalle etiqueta={t("mail.to")} gente={para} />
                              {copia.length > 0 && <FilaDetalle etiqueta={t("mail.cc")} gente={copia} />}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                  <span className="shrink-0 pt-1 text-xs text-muted-foreground">
                    {fechaCorta(mensaje.data.date, formatoUi)}
                  </span>
                </div>


                {mensaje.data.attachments.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {mensaje.data.attachments.map((a, i) => {
                      // Bajar el adjunto re-baja el mensaje por UID; sin UID (un
                      // correo traído por el camino en vivo) no se puede — ni
                      // verlo ni descargarlo.
                      const uid = sel?.uid != null ? Number(sel.uid) : null;
                      const bajando =
                        descargar.isPending && descargar.variables?.index === i;
                      const sePuedeVer = tipoDeAdjunto(a) !== "ninguno";
                      return (
                        <div
                          key={i}
                          className={cn(
                            "inline-flex max-w-full items-center rounded-full bg-primary/5 text-xs transition-colors",
                            uid != null && "hover:bg-primary/10",
                            uid == null && "opacity-60",
                          )}
                        >
                          {/* El nombre ABRE el archivo dentro de Maven. La
                              descarga se queda al lado: ver sin bajar es una
                              comodidad, no un candado. */}
                          <button
                            type="button"
                            disabled={uid == null}
                            onClick={() => setAdjuntoAbierto(i)}
                            title={
                              uid == null
                                ? t("mail.att.cantOpen")
                                : sePuedeVer
                                  ? t("mail.att.view", { name: a.filename })
                                  : t("mail.att.mustDownload", { name: a.filename })
                            }
                            className="inline-flex min-w-0 items-center gap-1.5 rounded-l-full py-1.5 pl-3 pr-2 disabled:cursor-not-allowed"
                          >
                            <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate">{a.filename}</span>
                            <span className="shrink-0 text-muted-foreground">
                              {Math.max(1, Math.round(a.sizeBytes / 1024))} KB
                            </span>
                          </button>
                          <button
                            type="button"
                            disabled={uid == null || descargar.isPending}
                            onClick={() =>
                              uid != null &&
                              descargar.mutate(
                                { folder: carpetaDelAbierto, uid, index: i, filename: a.filename },
                                { onError: (e) => toast.error((e as Error).message) },
                              )
                            }
                            aria-label={t("mail.viewer.downloadFile", { name: a.filename })}
                            title={
                              uid == null
                                ? t("mail.att.cantDownload")
                                : t("mail.viewer.downloadFile", { name: a.filename })
                            }
                            className="shrink-0 rounded-r-full border-l border-border/40 py-1.5 pl-2 pr-3 disabled:cursor-not-allowed"
                          >
                            {bajando ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                            ) : (
                              <Download className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="mt-5 border-t border-border/60 pt-5">
                  <MailBody
                    html={cuerpoConImagenes}
                    text={mensaje.data.text}
                    remoteImages={mensaje.data.remote_images}
                    truncated={mensaje.data.truncated}
                  />
                </div>

                {/* ── Lo POSTERIOR ────────────────────────────────────────
                    Casi siempre son las respuestas propias, que viven en
                    Enviados: el motivo por el que el hilo se veía a medias. */}
                <TiraDeHilo mensajes={hiloDespues} abrir={abrir} className="mt-5" />

                {cargandoHilo && hiloAntes.length + hiloDespues.length === 0 && (
                  <p className="mt-4 text-xs text-muted-foreground">
                    {t("mail.loadingThread")}
                  </p>
                )}

                {/* ── Responder / Reenviar, ABAJO ─────────────────────────
                    Es donde los pone Gmail, y con la conversación apilada es
                    donde tiene sentido: los botones cierran la charla, en vez
                    de partir en dos el mensaje que estás leyendo. */}
                <div className="mt-5 flex flex-wrap gap-2 border-t border-border/60 pt-5">
                  {carpeta === "Borrador" ? (
                    // En Borradores no se responde: se retoma para seguir
                    // editándolo y mandarlo.
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full"
                      onClick={editarBorrador}
                    >
                      <PenLine className="mr-2 h-4 w-4" />
                      {t("mail.editDraft")}
                    </Button>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        onClick={responder}
                      >
                        <Reply className="mr-2 h-4 w-4" />
                        {t("common.reply")}
                      </Button>
                      {hayVariosDestinatarios && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full"
                          onClick={responderATodos}
                        >
                          <ReplyAll className="mr-2 h-4 w-4" />
                          {t("mail.replyAll")}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                        onClick={reenviar}
                        disabled={bajarParaReenviar.isPending}
                      >
                        {bajarParaReenviar.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Forward className="mr-2 h-4 w-4" />
                        )}
                        {bajarParaReenviar.isPending ? t("mail.fwd.fetching") : t("mail.forward")}
                      </Button>
                    </>
                  )}
                </div>
              </article>
            </ScrollArea>
          ) : null}
        </div>
      </div>

      <AdjuntoVisor
        indice={adjuntoAbierto}
        onIndice={setAdjuntoAbierto}
        adjuntos={mensaje.data?.attachments ?? []}
        carpeta={carpeta}
        uid={sel?.uid != null ? Number(sel.uid) : null}
        descargando={descargar.isPending}
        onDescargar={(i) => {
          const uid = sel?.uid != null ? Number(sel.uid) : null;
          const a = mensaje.data?.attachments[i];
          if (uid == null || !a) return;
          descargar.mutate(
            { folder: carpetaDelAbierto, uid, index: i, filename: a.filename },
            { onError: (e) => toast.error((e as Error).message) },
          );
        }}
      />

      {redactar && (
        <MailComposer
          abierto
          onCerrar={() => setRedactar(null)}
          inicial={redactar}
          remitente={buzon.email_address}
          firma={firmaHtml}
        />
      )}

      <MailSignatureDialog abierto={firmaAbierta} onCerrar={() => setFirmaAbierta(false)} />

      {/* Montado SOLO cuando está abierto: cerrado igual correría sus
          consultas y sus hooks para no mostrar nada. */}
      {gestionandoEtiquetas && (
        <EtiquetasDialog abierto onCerrar={() => setGestionandoEtiquetas(false)} />
      )}
    </div>
  );
}

/** Cuántos mensajes plegados se muestran de corrido antes de resumir el medio.
 *
 *  Gmail muestra el primero, pliega el medio en una pastilla con el número, y
 *  deja los últimos. En un hilo de veinte es la diferencia entre ver la charla
 *  y ver una lista. */
const PLEGADOS_A_LA_VISTA = 4;

/** Un mensaje de la conversación, plegado: avatar, quién, su resumen y cuándo.
 *
 *  Se abre con un clic y recién ahí se baja el cuerpo — abrir un hilo de
 *  veinte no puede costar veinte descargas por IMAP.
 *
 *  ⚠️ Vienen de VARIAS carpetas (tus respuestas están en Enviados), y cada uno
 *  se abre en la suya: `abrir` usa el `folder` que trae el mensaje. */
function FilaPlegada({ m, abrir }: { m: MailSummary; abrir: (m: MailSummary) => void }) {
  const formatoUi = useFormato();
  return (
    <button
      type="button"
      onClick={() => abrir(m)}
      className="flex w-full min-w-0 items-center gap-3 rounded-control px-2 py-2.5 text-left transition-colors hover:bg-muted/50"
    >
      <UserAvatar name={nombreDe(m.from)} size="sm" className="shrink-0" />
      {/* ⚠️ `min-w-0` o el resumen largo se dibuja ENCIMA del vecino en vez de
          recortarse: el flex hijo no baja de su ancho de contenido sin esto. */}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium leading-tight">
          {nombreDe(m.from)}
        </span>
        {/* ⚠️ SIN la cita. Sin esto todos los renglones de una conversación
            empiezan igual —con la cita del anterior— y la tira deja de decir
            quién dijo qué. */}
        <span className="block truncate text-xs leading-tight text-muted-foreground">
          {resumenSinCita(m.snippet)}
        </span>
      </span>
      <span className="shrink-0 self-start pt-0.5 text-xs text-muted-foreground">
        {fechaCorta(m.date, formatoUi)}
      </span>
    </button>
  );
}

/** Los otros mensajes de la conversación, apilados como en Gmail: el primero,
 *  el medio resumido en una pastilla que se despliega, y los últimos. */
function TiraDeHilo({
  mensajes, abrir, className,
}: {
  mensajes: MailSummary[];
  abrir: (m: MailSummary) => void;
  className?: string;
}) {
  const [verTodos, setVerTodos] = useState(false);
  if (!mensajes.length) return null;

  const resume = !verTodos && mensajes.length > PLEGADOS_A_LA_VISTA + 1;
  const ocultos = resume ? mensajes.length - PLEGADOS_A_LA_VISTA : 0;
  const visibles = resume
    ? [mensajes[0], ...mensajes.slice(mensajes.length - (PLEGADOS_A_LA_VISTA - 1))]
    : mensajes;

  return (
    <ol className={cn("flex flex-col divide-y divide-border/50", className)}>
      {visibles.map((m, i) => (
        <li key={`${m.folder ?? ""}:${claveDe(m)}`}>
          {/* La pastilla del medio va DESPUÉS del primero, que es donde Gmail
              la pone: el arranque del hilo siempre se ve. */}
          {resume && i === 1 && (
            <div className="flex items-center gap-3 py-1.5">
              <button
                type="button"
                onClick={() => setVerTodos(true)}
                className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted-foreground/25"
              >
                {ocultos}
              </button>
              <span className="h-px flex-1 bg-border/50" />
            </div>
          )}
          <FilaPlegada m={m} abrir={abrir} />
        </li>
      ))}
    </ol>
  );
}

function FilaMensaje({
  m,
  activo,
  seleccionado,
  onToggleSeleccion,
  onClick,
  onPrecargar,
  mostrarDestinatario,
  enHilo,
  hiloSinLeer,
  asuntoDelHilo,
  etiquetas,
}: {
  m: MailSummary;
  activo: boolean;
  seleccionado: boolean;
  onToggleSeleccion: () => void;
  onClick: () => void;
  /** Pasar el mouse (o apoyar el dedo) ya dispara la descarga: para
   *  cuando llega el clic, el mensaje suele estar listo. */
  onPrecargar: () => void;
  /** En Enviados y Borradores el remitente eres tú: verte a ti mismo en
   *  cada fila no informa nada. Lo util es A QUIEN fue. */
  mostrarDestinatario?: boolean;
  /** Cuántos mensajes tiene la conversación. 1 = correo suelto, sin globo. */
  enHilo?: number;
  /** Si CUALQUIERA del hilo está sin leer. Una conversación con una respuesta
   *  nueva tiene que verse sin leer aunque los viejos ya se hayan abierto. */
  hiloSinLeer?: boolean;
  /** El asunto con el que EMPEZÓ la conversación. */
  asuntoDelHilo?: string;
  /** Las que tiene puestas la conversación. */
  etiquetas?: EtiquetaDeCorreo[];
}) {
  const formatoUi = useFormato();
  const { t } = useLanguage();
  // Con varios destinatarios ("a@x, b@y") se muestra el primero.
  const quien = mostrarDestinatario ? (m.to || m.from).split(",")[0] : m.from;
  const nombre = nombreDe(quien);
  const enConversacion = (enHilo ?? 1) > 1;
  const sinLeer = hiloSinLeer ?? m.unread;
  return (
    <div
      className={cn(
        "group relative flex items-center gap-1 rounded-2xl pl-2 transition-colors",
        seleccionado && "bg-primary/10 ring-1 ring-primary/25",
      )}
    >
      {/* La casilla es un botón aparte (Radix): no puede ir DENTRO del botón
          de la fila. Seleccionar no abre el correo; abrir no selecciona. */}
      <Checkbox
        checked={seleccionado}
        onCheckedChange={onToggleSeleccion}
        aria-label={seleccionado ? t("mail.sel.remove") : t("mail.sel.this")}
        className={cn(
          "shrink-0 transition-opacity",
          seleccionado ? "opacity-100" : "opacity-40 group-hover:opacity-100 [@media(hover:none)]:opacity-70",
        )}
      />
    <button
      onClick={onClick}
      onMouseEnter={onPrecargar}
      onFocus={onPrecargar}
      onTouchStart={onPrecargar}
      className={cn(
        "relative flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left transition-all duration-150",
        activo
          ? "bg-primary/12 before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r before:bg-gradient-to-b before:from-accent before:to-primary"
          : sinLeer && !seleccionado
            // ⚠️ El sombreado del NO LEÍDO es el mismo de Messenger, y por la
            // misma razón. Estaba en 0.04: sobre el fondo oscuro no se veía, y
            // Messenger ya había pasado por eso — «0.04 y después 0.09 seguían
            // siendo casi invisibles, sobre todo en modo claro» (ChatSidebar).
            // Tinte a 0.16 más una barra de acento de 3px (sombra interna, no
            // empuja el layout), que se nota aunque el primario sea claro.
            //
            // El hover sube a 0.22 y no baja: con el `hover:bg-primary/5` de
            // las leídas, pasar el mouse por una fila sin leer la ACLARABA.
            ? "bg-primary/[0.16] shadow-[inset_3px_0_0_0_hsl(var(--primary))] hover:bg-primary/[0.22]"
            : !seleccionado && "hover:bg-primary/5",
      )}
    >
      <UserAvatar name={nombre} size="md" className={cn("shrink-0", activo && "ring-2 ring-primary/20")} />

      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-baseline justify-between gap-2">
          <span
            className={cn(
              "truncate text-sm",
              sinLeer ? "font-bold text-foreground" : "font-medium text-foreground",
            )}
          >
            {mostrarDestinatario && (
              <span className="font-normal text-muted-foreground">{t("mail.to")} </span>
            )}
            {nombre}
            {/* El globo con la cantidad, como en Gmail: es lo que convierte un
                renglón en "esto es una conversación" de un vistazo. */}
            {enConversacion && (
              <span className="ml-1.5 inline-flex items-center rounded-full bg-muted px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                {enHilo}
              </span>
            )}
          </span>
          <span
            className={cn(
              "shrink-0 text-[10px]",
              sinLeer ? "font-semibold text-primary" : "text-muted-foreground",
            )}
          >
            {fechaCorta(m.date, formatoUi)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {sinLeer && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
          <span
            className={cn(
              "truncate text-[13px]",
              sinLeer ? "font-medium text-foreground/90" : "text-muted-foreground",
            )}
          >
            {asuntoVisible(asuntoDelHilo || m.subject, t)}
          </span>
          {/* Puntos de color y no píldoras con texto: en un renglón que ya
              lleva nombre, asunto y resumen, tres píldoras se comen el asunto.
              El nombre está en el `title` y en el menú de Etiquetar. */}
          {etiquetas?.slice(0, 3).map((e) => (
            <span
              key={e.id}
              title={e.nombre}
              className={cn("h-2 w-2 shrink-0 rounded-full", FONDO_ETIQUETA[e.color])}
            />
          ))}
        </div>
        {m.snippet ? (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground/70">
            {m.snippet}
          </span>
        ) : null}
      </div>
    </button>
    </div>
  );
}

/** El asunto como se muestra: sin asunto (vacío o el marcador que guarda el
 *  servidor) se dice en el idioma de quien mira. */
function asuntoVisible(asunto: string | undefined, t: ReturnType<typeof useLanguage>["t"]): string {
  return !asunto || asunto === SIN_ASUNTO ? t("mail.noSubject") : asunto;
}

function VacioSuave({ icono: Icono, texto }: { icono: LucideIcon; texto: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-accent/10 to-primary/10">
        <Icono className="h-6 w-6 text-primary/70" />
      </div>
      <p className="text-sm text-muted-foreground">{texto}</p>
    </div>
  );
}

function Aviso({ titulo, detalle }: { titulo: string; detalle: string }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <div className="min-w-0 space-y-1">
          <p className="font-medium">{titulo}</p>
          <p className="break-words text-sm text-muted-foreground">{detalle}</p>
        </div>
      </div>
    </div>
  );
}

/** Botón de la barra de selección. `pronto`: está en la UI para que se vea el
 *  conjunto (como en Gmail) pero todavía no hace nada — falta la acción IMAP
 *  del lado del servidor. Deshabilitado y con aviso en el title. */
function AccionBarra({
  icono: Icono, etiqueta, onClick, disabled, pronto,
}: { icono: LucideIcon; etiqueta: string; onClick?: () => void; disabled?: boolean; pronto?: boolean }) {
  const { t } = useLanguage();
  const inactivo = pronto || disabled;
  return (
    <button
      type="button"
      onClick={inactivo ? undefined : onClick}
      disabled={inactivo}
      aria-label={etiqueta}
      title={pronto ? `${etiqueta} · ${t("mail.act.soon")}` : etiqueta}

      className={cn(
        "grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition",
        inactivo ? "cursor-not-allowed opacity-35" : "hover:bg-muted hover:text-foreground",
      )}
    >
      <Icono className="h-4 w-4" />
    </button>
  );
}
