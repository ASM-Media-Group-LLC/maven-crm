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
  ChevronLeft,
  ChevronRight,
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
import EtiquetasColumna from "@/components/correo/etiquetas/EtiquetasColumna";
import EtiquetaFormDialog from "@/components/correo/etiquetas/EtiquetaFormDialog";
import PastillaEtiqueta from "@/components/correo/etiquetas/PastillaEtiqueta";
import { MenuEtiquetarComo, MenuMoverA } from "@/components/correo/etiquetas/MenusDeEtiqueta";
import { MailSignatureDialog } from "@/components/correo/MailSignatureDialog";
import {
  useMailbox,
  useMailFolders,
  useMailMessage,
  useImagenesIncrustadas,
  useMailMessages,
  CORREOS_POR_PAGINA,
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
  arbolDeEtiquetas, useCorreosDeEtiqueta, useEtiquetarCorreos, useEtiquetas, useEtiquetasPorCorreo,
  useNoLeidosPorEtiqueta,
} from "@/hooks/useEtiquetasCorreo";
import type { ParDeColores } from "@/lib/correo/coloresEtiqueta";
import { asuntoDeReenvio, destinatariosRespuesta, direccionesDe, participantesDe, tieneVariosInvolucrados } from "@/lib/mailAddr";
import { toast } from "sonner";

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

/** De dónde SALE un correo al «Mover a» una etiqueta: las bandejas. De
 *  Enviados, Borradores, Archivados o una carpeta propia no hay de dónde
 *  sacarlo, así que ahí solo se etiqueta (como en Gmail). Pospuestos tampoco:
 *  sacarlo de ahí sería cancelar el posponer sin que nadie lo pidió. */
const SE_VACIAN_AL_MOVER = new Set(["INBOX", "Notification", "Newsletter", "Correo no deseado", "Papelera"]);

/** Nombre e ícono por carpeta. Los nombres crudos vienen del servidor. */
const CARPETAS: Record<string, { nombre: string; icono: LucideIcon }> = {
  INBOX: { nombre: "Recibidos", icono: Inbox },
  Enviado: { nombre: "Enviados", icono: Send },
  Borrador: { nombre: "Borradores", icono: PenLine },
  "Correo no deseado": { nombre: "Spam", icono: ShieldAlert },
  Papelera: { nombre: "Papelera", icono: Trash2 },
  Archive: { nombre: "Archivados", icono: Archive },
  Notification: { nombre: "Notificaciones", icono: Bell },
  Newsletter: { nombre: "Boletines", icono: Newspaper },
  Plantillas: { nombre: "Plantillas", icono: FileText },
  Snoozed: { nombre: "Pospuestos", icono: Clock },
};

function nombreCarpeta(f: string): string {
  return CARPETAS[f]?.nombre ?? f;
}

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
  // Las etiquetas en el orden de la columna, con su ruta «Padre/Hija»: así
  // se muestran en el menú Etiquetar y en las pastillas, como en Gmail.
  const nodosEtiqueta = useMemo(() => arbolDeEtiquetas(etiquetas.data ?? []), [etiquetas.data]);
  // «Crear nueva» desde Etiquetar como / Mover a: se crea y se aplica a esos
  // correos (la selección o la conversación abierta), como en Gmail.
  const [creandoPara, setCreandoPara] = useState<
    { modo: "etiquetar" | "mover"; correos: MailSummary[]; nombre?: string } | null
  >(null);
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
  // La página de la carpeta, como Gmail: «1–50 de 186» con ‹ ›. Grace no
  // podía llegar a sus correos 51 al 126 (28/09).
  const [pagina, setPagina] = useState(0);
  const lista = useMailMessages(carpeta, hayBuzon, pagina);
  const totalCarpeta = lista.data?.total;
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
    setPagina(0);
  }, [carpeta]);

  // La selección es de la página que se ve: al pasar a otra, marcar «todos»
  // y archivar no puede llevarse correos que ya no están a la vista.
  useEffect(() => { setSeleccion(new Set()); }, [pagina]);

  // Si la lista se achicó (se archivó la última página entera), volver a la
  // última que tiene algo en vez de quedarse mirando una página vacía.
  useEffect(() => {
    if (totalCarpeta === undefined || pagina === 0) return;
    const ultima = Math.max(0, Math.ceil(totalCarpeta / CORREOS_POR_PAGINA) - 1);
    if (pagina > ultima) setPagina(ultima);
  }, [totalCarpeta, pagina]);

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
    seen: (n) => `${n} ${n === 1 ? "correo marcado" : "correos marcados"} como leído${n === 1 ? "" : "s"}`,
    unseen: (n) => `${n} ${n === 1 ? "correo marcado" : "correos marcados"} como no leído${n === 1 ? "" : "s"}`,
    archive: (n) => `${n} ${n === 1 ? "correo archivado" : "correos archivados"}`,
    spam: (n) => `${n} ${n === 1 ? "correo movido" : "correos movidos"} a Spam`,
    move: (n) => `${n} ${n === 1 ? "correo movido" : "correos movidos"}`,
    snooze: (n) => `${n} ${n === 1 ? "correo pospuesto" : "correos pospuestos"}`,
    delete: (n) => carpeta === "Papelera"
      ? `${n} ${n === 1 ? "correo eliminado" : "correos eliminados"} definitivamente`
      : `${n} ${n === 1 ? "correo movido" : "correos movidos"} a la Papelera`,
  };
  /** Pone o saca una etiqueta de lo seleccionado.
   *
   *  ⚠️ Los correos SIN `message_id` se quedan afuera y se avisa: la etiqueta
   *  se guarda por ese id, no por (carpeta, uid). Un uid cambia al mover el
   *  correo de carpeta, así que la etiqueta se perdería —o se la quedaría otro
   *  mensaje distinto que reciba ese uid después. */
  const aplicarEtiqueta = (
    labelId: string, poner: boolean,
    /** Sin esto, la selección. Con esto (el correo abierto), la selección de
     *  la lista NO se toca: no es la que se etiquetó. */
    correos?: MailSummary[],
  ) => {
    const elegidos = correos ?? items.filter((m) => seleccion.has(claveDe(m)));
    const ids = elegidos.map((m) => m.messageId).filter(Boolean) as string[];
    if (!ids.length) {
      toast.error("Estos correos no tienen identificador: vuelve a abrir la carpeta e inténtalo.");
      return;
    }
    const sinId = elegidos.length - ids.length;
    etiquetar.mutate({ messageIds: ids, labelId, poner }, {
      onSuccess: () => {
        toast.success(poner ? "Etiqueta puesta" : "Etiqueta quitada", {
          description: sinId ? `${sinId} sin identificador quedaron sin etiquetar.` : undefined,
        });
        if (!correos) setSeleccion(new Set());
      },
      onError: (e) => toast.error((e as Error).message),
    });
  };

  /** «Mover a» una ETIQUETA, como Gmail: le pone la etiqueta y lo saca de
   *  donde estaba. Así funcionan las «carpetas propias» en Gmail (Keila,
   *  28/09: «para sacar los correos de la bandeja de entrada a su respectiva
   *  carpeta»).
   *
   *  - Desde Recibidos (y Notificaciones, Boletines, Spam, Papelera): se
   *    ARCHIVA. Sale de la bandeja y queda dentro de la etiqueta, que cruza
   *    carpetas.
   *  - Desde Enviados, Borradores, Archivados o una carpeta propia de Zoho: no
   *    hay de dónde sacarlo; solo se etiqueta (Gmail hace lo mismo).
   *  - Mirando una etiqueta: se le quita ESA y se le pone la nueva. No se
   *    toca la carpeta.
   *
   *  ⚠️ Primero la etiqueta y DESPUÉS el archivado, y solo de los que la
   *  recibieron: si se archivara uno sin `message_id` (que no se puede
   *  etiquetar), saldría de Recibidos sin quedar en ningún lado. */
  const moverAEtiqueta = (labelId: string, ruta: string, correos?: MailSummary[]) => {
    const elegidos = correos ?? items.filter((m) => seleccion.has(claveDe(m)));
    const conId = elegidos.filter((m) => m.messageId);
    const ids = conId.map((m) => m.messageId!) as string[];
    if (!ids.length) {
      toast.error("Estos correos no tienen identificador: vuelve a abrir la carpeta e inténtalo.");
      return;
    }
    const sinId = elegidos.length - conId.length;
    const desde = etiquetaVista;
    etiquetar.mutate({ messageIds: ids, labelId, poner: true }, {
      onSuccess: () => {
        const aviso = (n: number) => `${n === 1 ? "Movido" : `${n} movidos`} a «${ruta}»`;
        const detalle = sinId ? `${sinId} sin identificador se quedaron donde estaban.` : undefined;
        if (desde) {
          if (desde !== labelId) etiquetar.mutate({ messageIds: ids, labelId: desde, poner: false });
          toast.success(aviso(conId.length), { description: detalle });
          if (!correos) setSeleccion(new Set());
          return;
        }
        const salen = conId.filter((m) => SE_VACIAN_AL_MOVER.has(m.folder ?? carpeta));
        if (salen.length) {
          lanzarMasiva("archive", salen, undefined, undefined, aviso);
          if (detalle) toast.info(detalle);
        } else {
          toast.success(aviso(conId.length), { description: detalle });
          if (!correos) setSeleccion(new Set());
        }
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
  /** ¿TODOS estos correos ya tienen la etiqueta? Es la casilla marcada de
   *  «Etiquetar como». */
  const tienenTodos = (correos: MailSummary[]) => (labelId: string) => {
    const ids = correos.map((m) => m.messageId).filter(Boolean) as string[];
    return ids.length > 0 && ids.every((id) => (etiquetasPorCorreo.data?.get(id) ?? []).includes(labelId));
  };
  /** Las carpetas REALES de la cuenta, no una lista escrita a mano: si alguien
   *  crea una en Zoho aparece sola, y la edge valida el nombre contra la misma
   *  fuente antes de mover nada. */
  const carpetasParaMover = (actual: string) =>
    (carpetas.data ?? [])
      .map((c) => c.folder)
      .filter((f) => f !== actual)
      .map((f) => ({ folder: f, nombre: nombreCarpeta(f) }));
  // Mirando una etiqueta, «Mover a» no ofrece esa misma.
  const nodosParaMover = nodosEtiqueta.filter(({ etiqueta: e }) => e.id !== etiquetaVista);

  const lanzarMasiva = (
    op: OperacionMasiva, elegidos: MailSummary[], dest?: string, volverAt?: string,
    /** Otro texto para el aviso (p. ej. «Movido a Pagos» en vez de «archivado»). */
    aviso?: (n: number) => string,
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
            toast.success((aviso ?? NOMBRE_OP[op])(delGrupo.length - (r.omitidos ?? 0)), {
              description: r.omitidos
                ? `${r.omitidos} sin identificador: vuelve a abrir la carpeta e inténtalo.`
                : undefined,
            });
          },
          onError: (e) => toast.error((e as Error).message || "No se pudo aplicar la acción"),
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
        subject: (m.subject as string) ?? "(sin asunto)",
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
  /** La conversación ABIERTA entera: a eso se le pone o saca la etiqueta desde
   *  la barra del correo, como en Gmail (se etiqueta la charla, no un
   *  mensaje suelto). */
  const delAbierto: MailSummary[] = sel
    ? (hiloCompleto.length ? hiloCompleto : hiloAbierto?.mensajes ?? [sel])
    : [];
  const etiquetasDelAbierto = nodosEtiqueta.filter(({ etiqueta: e }) =>
    delAbierto.some((m) => (etiquetasPorCorreo.data?.get(m.messageId ?? "") ?? []).includes(e.id)));
  // Los de la conversación que siguen en la bandeja: la pastilla «Recibidos ×»
  // de Gmail, que al quitarla archiva.
  const abiertoEnRecibidos = delAbierto.filter((m) => (m.folder ?? carpeta) === "INBOX");
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
        titulo="No se pudo leer el estado de tu correo"
        detalle={(errorBuzon as Error).message}
      />
    );
  }

  if (!hayBuzon) {
    return (
      <EmptyState
        className="mx-auto max-w-xl py-20"
        seed="empty-correo"
        title="Todavía no tienes casilla"
        description="Tu cuenta de correo se crea junto con tu usuario de Maven. Pídele a un administrador que la active y esta pantalla se llena sola."
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
          `Los adjuntos pesan ${(pesa / 1024 / 1024).toFixed(1)} MB y el tope es 20 MB: se reenvía el texto sin ellos.`,
        );
      } else {
        try {
          adjuntosIniciales = await bajarParaReenviar.mutateAsync({
            folder: carpeta, uid, adjuntos: metas,
          });
        } catch (e) {
          // Que falle un adjunto no puede impedir reenviar el mensaje.
          toast.error(`No se pudieron traer los adjuntos: ${(e as Error).message}`);
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
      subject: m.subject === "(sin asunto)" ? "" : m.subject,
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
            aria-label="Volver a la lista"
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
          aria-label={carpetasAbiertas ? "Ocultar las carpetas" : "Mostrar las carpetas"}
          aria-expanded={carpetasAbiertas}
          title={carpetasAbiertas ? "Ocultar las carpetas" : "Mostrar las carpetas"}
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold tracking-tight">Correo</h1>
          <p className="truncate text-xs text-muted-foreground">{buzon.email_address}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full hover:bg-primary/8"
          onClick={() => setFirmaAbierta(true)}
          aria-label="Editar firma"
          title="Firma del correo"
        >
          <Signature className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full hover:bg-primary/8"
          onClick={() => lista.refetch()}
          disabled={lista.isFetching}
          aria-label="Actualizar"
        >
          <RefreshCw className={cn("h-4 w-4", lista.isFetching && "animate-spin")} />
        </Button>
        <Button
          onClick={() => setRedactar({})}
          size="sm"
          className="rounded-full bg-gradient-to-r from-accent to-primary text-white shadow-sm transition-opacity hover:opacity-90"
        >
          <PenSquare className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Redactar</span>
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
              Carpetas
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
                title={carpetasAbiertas ? undefined : `${nombreCarpeta(f)}${unread > 0 ? ` · ${unread} sin leer` : ""}`}
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
              archivado sigue apareciendo acá. El árbol y el ⋮ de cada una
              viven en EtiquetasColumna. */}
          <EtiquetasColumna
            abierta={carpetasAbiertas}
            etiquetaVista={etiquetaVista}
            onAbrir={(id) => { setEtiquetaVista(id); setSel(null); }}
            noLeidos={noLeidosPorEtiqueta.data}
          />
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
              placeholder={`Buscar en ${nombreCarpeta(carpeta)}…`}
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
                title="Limpiar búsqueda"
                aria-label="Limpiar búsqueda"
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
              {carpeta === "Papelera" ? "¿Eliminar definitivamente?" : "¿Mover a la Papelera?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {carpeta === "Papelera" ? (
                <>
                  {confirmarBorrado?.length === 1 ? "Este correo" : `Estos ${confirmarBorrado?.length ?? 0} correos`} ya
                  {confirmarBorrado?.length === 1 ? " está" : " están"} en la Papelera: se borran del servidor y no se pueden recuperar.
                </>
              ) : (
                <>
                  {confirmarBorrado?.length === 1 ? (
                    <>El correo se mueve a la Papelera. Desde ahí se puede recuperar hasta que lo elimines definitivamente.</>
                  ) : (
                    <>Los {confirmarBorrado?.length ?? 0} correos se mueven a la Papelera. Desde ahí se pueden recuperar hasta que los elimines definitivamente.</>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { const e = confirmarBorrado; setConfirmarBorrado(null); if (e) lanzarMasiva("delete", e); }}
            >
              {carpeta === "Papelera" ? "Eliminar definitivamente" : "Mover a la Papelera"}
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
                  aria-label={todos ? "Quitar la selección" : "Seleccionar todos"}
                  title={todos ? "Quitar la selección" : "Seleccionar todos"}
                />
                {n > 0 ? (
                  <>
                    <span className="ml-1 text-xs font-medium text-foreground">{n} {n === 1 ? "seleccionado" : "seleccionados"}</span>
                    <div className="ml-1 flex items-center gap-0.5">
                      <AccionBarra icono={MailOpen} etiqueta="Marcar como leído" onClick={() => ejecutarMasiva("seen", items)} disabled={!hayNoLeidos || masiva.isPending} />
                      <AccionBarra icono={Mail} etiqueta="Marcar como no leído" onClick={() => ejecutarMasiva("unseen", items)} disabled={masiva.isPending} />
                      <span className="mx-1 h-4 w-px bg-border/70" />
                      <AccionBarra icono={Archive} etiqueta="Archivar" onClick={() => ejecutarMasiva("archive", items)} disabled={masiva.isPending || carpeta === "Archive"} />
                      <AccionBarra icono={ShieldAlert} etiqueta="Marcar como spam" onClick={() => ejecutarMasiva("spam", items)} disabled={masiva.isPending || carpeta === "Correo no deseado"} />
                      <AccionBarra icono={Trash2} etiqueta={carpeta === "Papelera" ? "Eliminar definitivamente" : "Eliminar"} onClick={() => ejecutarMasiva("delete", items)} disabled={masiva.isPending} />
                      <span className="mx-1 h-4 w-px bg-border/70" />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            title="Posponer"
                            disabled={masiva.isPending}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                          >
                            <Clock className="h-4 w-4" />
                            <span className="sr-only">Posponer</span>
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
                                <span className="flex-1">{o.rotulo}</span>
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
                            title="Mover a"
                            disabled={masiva.isPending}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                          >
                            <FolderInput className="h-4 w-4" />
                            <span className="sr-only">Mover a</span>
                          </button>
                        </DropdownMenuTrigger>
                        <MenuMoverA
                          nodos={nodosParaMover}
                          carpetas={carpetasParaMover(carpeta)}
                          onEtiqueta={(id, ruta) => moverAEtiqueta(id, ruta)}
                          onCarpeta={(f) => ejecutarMasiva("move", items, f)}
                          onCrear={(nombre) => setCreandoPara({ modo: "mover", correos: items.filter((m) => seleccion.has(claveDe(m))), nombre })}
                          onAdministrar={() => setGestionandoEtiquetas(true)}
                        />
                      </DropdownMenu>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            title="Etiquetar"
                            disabled={etiquetar.isPending}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                          >
                            <Tag className="h-4 w-4" />
                            <span className="sr-only">Etiquetar</span>
                          </button>
                        </DropdownMenuTrigger>
                        <MenuEtiquetarComo
                          nodos={nodosEtiqueta}
                          tienenTodos={tienenTodos(items.filter((m) => seleccion.has(claveDe(m))))}
                          onCambiar={(id, poner) => aplicarEtiqueta(id, poner)}
                          onCrear={(nombre) => setCreandoPara({ modo: "etiquetar", correos: items.filter((m) => seleccion.has(claveDe(m))), nombre })}
                          onAdministrar={() => setGestionandoEtiquetas(true)}
                        />
                      </DropdownMenu>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSeleccion(new Set())}
                      className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                    >
                      Quitar selección
                    </button>
                  </>
                ) : !etiquetaVista && !enBusqueda && totalCarpeta !== undefined ? (
                  // «1–50 de 186» y ‹ ›, como Gmail. Solo en una carpeta: la
                  // vista de una etiqueta y la búsqueda arman su propia lista.
                  <Paginador
                    desde={pagina * CORREOS_POR_PAGINA + 1}
                    hasta={pagina * CORREOS_POR_PAGINA + mensajes.length}
                    total={totalCarpeta}
                    cargando={lista.isPlaceholderData}
                    onAnterior={pagina > 0 ? () => setPagina((p) => p - 1) : undefined}
                    onSiguiente={(pagina + 1) * CORREOS_POR_PAGINA < totalCarpeta ? () => setPagina((p) => p + 1) : undefined}
                  />
                ) : (
                  <span className="ml-1 text-xs text-muted-foreground">
                    {items.length} {items.length === 1 ? "correo" : "correos"}
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
                  titulo={enBusqueda ? "No se pudo buscar" : "No se pudieron traer los mensajes"}
                  detalle={(errorItems as Error).message}
                />
              )}
              {!cargandoItems && !errorItems && items.length === 0 && (
                enBusqueda ? (
                  <VacioSuave
                    icono={Search}
                    texto={`No se encontró "${queryActiva}" en ${nombreCarpeta(carpeta)}.`}
                  />
                ) : (
                  <VacioSuave
                    icono={iconoCarpeta(carpeta)}
                    texto={`No hay correos en ${nombreCarpeta(carpeta)}.`}
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
                    // «En la lista de mensajes: Ocultar» saca la pastilla; y la
                    // de la etiqueta que estás mirando no se repite en cada
                    // renglón (Gmail hace lo mismo).
                    const suyas = nodosEtiqueta
                      .filter(({ etiqueta: e }) => ids.has(e.id) && e.enListaMensajes && e.id !== etiquetaVista)
                      .map(({ etiqueta: e, ruta }) => ({ id: e.id, ruta, color: e.color }));
                    // Mirando una etiqueta, Gmail marca con «Recibidos» lo que
                    // SIGUE en la bandeja: así se ve qué falta mover.
                    return etiquetaVista && h.mensajes.some((m) => m.folder === "INBOX")
                      ? [{ id: "__recibidos", ruta: "Recibidos", color: null }, ...suyas]
                      : suyas;
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
              <p className="text-sm text-muted-foreground">Elige un correo para leerlo.</p>
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
              titulo="No se pudo abrir el correo"
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
                {/* La barra del correo abierto: «Mover a» y «Etiquetar como»,
                    los mismos menús de la selección, aplicados a TODA la
                    conversación. Keila etiqueta y mueve desde acá, con el
                    correo abierto — como en Gmail. */}
                <div className="mb-3 flex items-center gap-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        title="Mover a"
                        disabled={masiva.isPending || etiquetar.isPending}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                      >
                        <FolderInput className="h-4 w-4" />
                        <span className="sr-only">Mover a</span>
                      </button>
                    </DropdownMenuTrigger>
                    <MenuMoverA
                      nodos={nodosParaMover}
                      carpetas={carpetasParaMover(sel.folder ?? carpeta)}
                      onEtiqueta={(id, ruta) => moverAEtiqueta(id, ruta, delAbierto)}
                      // A una CARPETA se mueven solo los de la carpeta del
                      // abierto: lo que contestaste vive en Enviados y ahí se
                      // queda (moverlo sería sacarlo de Enviados).
                      onCarpeta={(f) => lanzarMasiva(
                        "move", delAbierto.filter((m) => (m.folder ?? carpeta) === (sel.folder ?? carpeta)), f,
                      )}
                      onCrear={(nombre) => setCreandoPara({ modo: "mover", correos: delAbierto, nombre })}
                      onAdministrar={() => setGestionandoEtiquetas(true)}
                    />
                  </DropdownMenu>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        title="Etiquetar"
                        disabled={etiquetar.isPending}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                      >
                        <Tag className="h-4 w-4" />
                        <span className="sr-only">Etiquetar</span>
                      </button>
                    </DropdownMenuTrigger>
                    <MenuEtiquetarComo
                      nodos={nodosEtiqueta}
                      tienenTodos={tienenTodos(delAbierto)}
                      onCambiar={(id, poner) => aplicarEtiqueta(id, poner, delAbierto)}
                      onCrear={(nombre) => setCreandoPara({ modo: "etiquetar", correos: delAbierto, nombre })}
                      onAdministrar={() => setGestionandoEtiquetas(true)}
                    />
                  </DropdownMenu>
                </div>

                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                  <h2 className="text-xl font-semibold leading-snug tracking-tight sm:text-2xl">
                    {sinPrefijos(mensaje.data.subject) || mensaje.data.subject}
                  </h2>
                  {/* Las pastillas con × junto al asunto, como Gmail: TODAS
                      las etiquetas de la conversación (acá no se esconde
                      ninguna) y «Recibidos» si sigue en la bandeja. */}
                  {abiertoEnRecibidos.length > 0 && (
                    <PastillaEtiqueta
                      nombre="Recibidos"
                      color={null}
                      onQuitar={() => lanzarMasiva("archive", abiertoEnRecibidos)}
                    />
                  )}
                  {etiquetasDelAbierto.map(({ etiqueta: e, ruta }) => (
                    <PastillaEtiqueta
                      key={e.id}
                      nombre={ruta}
                      color={e.color}
                      onQuitar={() => aplicarEtiqueta(e.id, false, delAbierto)}
                    />
                  ))}
                </div>

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
                        ? "(sin destinatario)"
                        : total === 1
                          ? (para[0].nombre || para[0].email)
                          : `${para[0].nombre || para[0].email} y ${total - 1} más`;
                      return (
                        <>
                          <button
                            type="button"
                            onClick={() => setVerDestinatarios((v) => !v)}
                            aria-expanded={verDestinatarios}
                            className="mt-0.5 flex max-w-full items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                          >
                            <span className="truncate">Para {resumen}</span>
                            <ChevronDown
                              className={cn(
                                "h-3 w-3 shrink-0 transition-transform",
                                verDestinatarios && "rotate-180",
                              )}
                            />
                          </button>

                          {verDestinatarios && (
                            <div className="mt-2 space-y-2 rounded-xl border border-border/60 bg-muted/30 p-3 text-xs">
                              <FilaDetalle etiqueta="De" gente={participantesDe(mensaje.data.from ?? "")} />
                              <FilaDetalle etiqueta="Para" gente={para} />
                              {copia.length > 0 && <FilaDetalle etiqueta="Copia" gente={copia} />}
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
                                ? "Este adjunto no se puede abrir"
                                : sePuedeVer
                                  ? `Ver ${a.filename}`
                                  : `${a.filename} — este tipo de archivo hay que descargarlo`
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
                            aria-label={`Descargar ${a.filename}`}
                            title={
                              uid == null
                                ? "No se puede descargar este adjunto"
                                : `Descargar ${a.filename}`
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
                    Buscando el resto de la conversación…
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
                      Editar borrador
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
                        Responder
                      </Button>
                      {hayVariosDestinatarios && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full"
                          onClick={responderATodos}
                        >
                          <ReplyAll className="mr-2 h-4 w-4" />
                          Responder a todos
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
                        {bajarParaReenviar.isPending ? "Trayendo adjuntos…" : "Reenviar"}
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
      {creandoPara && (
        <EtiquetaFormDialog
          nombreInicial={creandoPara.nombre}
          onCerrar={() => setCreandoPara(null)}
          onCreada={(id, nombre) => (creandoPara.modo === "mover"
            ? moverAEtiqueta(id, nombre, creandoPara.correos)
            : aplicarEtiqueta(id, true, creandoPara.correos))}
        />
      )}
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
  etiquetas?: { id: string; ruta: string; color: ParDeColores | null }[];
}) {
  const formatoUi = useFormato();
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
        aria-label={seleccionado ? "Quitar de la selección" : "Seleccionar este correo"}
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
              <span className="font-normal text-muted-foreground">Para </span>
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
          {/* Las pastillas van ANTES del asunto, como en Gmail. Máximo tres y
              cada una con tope de ancho: con más, el asunto desaparecería. La
              lista completa está en el menú Etiquetar. */}
          {etiquetas?.slice(0, 3).map((e) => (
            <PastillaEtiqueta key={e.id} nombre={e.ruta} color={e.color} className="max-w-[7.5rem]" />
          ))}
          <span
            className={cn(
              "min-w-0 truncate text-[13px]",
              sinLeer ? "font-medium text-foreground/90" : "text-muted-foreground",
            )}
          >
            {asuntoDelHilo || m.subject || "(sin asunto)"}
          </span>
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
/** «1–50 de 186 ‹ ›» de Gmail, a la derecha de la barra de la lista. */
function Paginador({
  desde, hasta, total, cargando, onAnterior, onSiguiente,
}: {
  desde: number;
  hasta: number;
  total: number;
  cargando: boolean;
  /** Undefined = no hay página anterior (la flecha se ve apagada). */
  onAnterior?: () => void;
  onSiguiente?: () => void;
}) {
  const boton = "inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30";
  return (
    <div className="ml-auto flex items-center gap-0.5">
      <span className={cn("mr-1 text-xs tabular-nums text-muted-foreground", cargando && "opacity-60")}>
        {total === 0 ? "0" : `${desde}–${Math.max(desde, hasta)}`} de {total.toLocaleString("es")}
      </span>
      <button type="button" className={boton} onClick={onAnterior} disabled={!onAnterior} aria-label="Más recientes" title="Más recientes">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button type="button" className={boton} onClick={onSiguiente} disabled={!onSiguiente} aria-label="Más antiguos" title="Más antiguos">
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function AccionBarra({
  icono: Icono, etiqueta, onClick, disabled, pronto,
}: { icono: LucideIcon; etiqueta: string; onClick?: () => void; disabled?: boolean; pronto?: boolean }) {
  const inactivo = pronto || disabled;
  return (
    <button
      type="button"
      onClick={inactivo ? undefined : onClick}
      disabled={inactivo}
      aria-label={etiqueta}
      title={pronto ? `${etiqueta} · pronto` : etiqueta}
      className={cn(
        "grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition",
        inactivo ? "cursor-not-allowed opacity-35" : "hover:bg-muted hover:text-foreground",
      )}
    >
      <Icono className="h-4 w-4" />
    </button>
  );
}
