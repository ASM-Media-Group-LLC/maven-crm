import { formatUI } from "@/lib/formatoHora";
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { format, isToday, isThisYear } from "date-fns";
import { es } from "date-fns/locale";
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  Bell,
  CalendarClock,
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
import { repartirBorradorRetomado } from "@/lib/correo/borradorRetomado";
import { CARPETA_PROGRAMADOS, conProgramados } from "@/lib/correo/programados";
import { VistaProgramados } from "@/components/correo/VistaProgramados";
import { BotonReaccionar, ChipsDeReacciones } from "@/components/correo/ReaccionesDelCorreo";
import { chipsDeReacciones, puedeReaccionar } from "@/lib/correo/reacciones";
import EtiquetasDialog from "@/components/correo/EtiquetasDialog";
import EtiquetasColumna from "@/components/correo/etiquetas/EtiquetasColumna";
import EtiquetaFormDialog from "@/components/correo/etiquetas/EtiquetaFormDialog";
import PastillaEtiqueta from "@/components/correo/etiquetas/PastillaEtiqueta";
import { MenuEtiquetarComo, MenuMoverA } from "@/components/correo/etiquetas/MenusDeEtiqueta";
import { MailSignatureDialog } from "@/components/correo/MailSignatureDialog";
import {
  useMailbox,
  useMailFolders,
  useCorreosProgramados,
  useReaccionarCorreo,
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
  type MailMessage,
  type MailSummary,
 useMailBulk, type OperacionMasiva,
  useListasDelCorreo,
  useAdjuntosParaReenviar,
  useMailNoLeidos,
  TOPE_NO_LEIDOS,
  useTraerMensaje,
  buscarCorreoPorMessageId,
} from "@/hooks/useMailbox";
import { agruparEnHilos, sinPrefijos, type Hilo } from "@/lib/mailHilos";
import MenuDelMensaje, { type AccionesDelMensaje } from "@/components/correo/MenuDelMensaje";
import TraduccionDelCorreo from "@/components/correo/TraduccionDelCorreo";
import CompartirEnChatDialog from "@/components/correo/CompartirEnChatDialog";
import { BotonNoLeidosPrimero, BotonPanelDeLectura, RotuloDeSeccion } from "@/components/correo/OpcionesDeVista";
import { usePreferenciasCorreo } from "@/hooks/usePreferenciasCorreo";
import {
  agruparPorCarpeta, borradorDeReenvio, borradorDeRespuesta, desdeAqui, NO_SE_SUELTA, paraSoltarEnCarpeta,
} from "@/lib/correo/accionesDelMensaje";
import {
  etiquetaDeVuelta, sePuedeDeshacer, uidDe, type CambioDeEtiqueta,
} from "@/lib/correo/deshacer";
import { useDeshacerCorreo } from "@/hooks/useDeshacerCorreo";
import { juntarSinRepetir, partirNoLeidosPrimero } from "@/lib/correo/noLeidosPrimero";
import { PARAM_MENSAJE, type CorreoACompartir } from "@/lib/correo/compartirEnChat";
import { esAtajoDeVolver } from "@/lib/correo/atajos";
import { resumenSinCita } from "@/lib/mailCita";
import { useHiloCompleto } from "@/hooks/useHiloCompleto";
import { opcionesDePosponer } from "@/lib/posponer";
import {
  arbolDeEtiquetas, useCorreosDeEtiqueta, useEtiquetarCorreos, useEtiquetas, useEtiquetasPorCorreo,
  useNoLeidosPorEtiqueta,
} from "@/hooks/useEtiquetasCorreo";
import type { ParDeColores } from "@/lib/correo/coloresEtiqueta";
import { direccionesDe, participantesDe, tieneVariosInvolucrados } from "@/lib/mailAddr";
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

/** De dónde SALE un correo al «Mover a» una etiqueta: las bandejas. De
 *  Enviados, Borradores, Archivados o una carpeta propia no hay de dónde
 *  sacarlo, así que ahí solo se etiqueta (como en Gmail). Pospuestos tampoco:
 *  sacarlo de ahí sería cancelar el posponer sin que nadie lo pidió. */
const SE_VACIAN_AL_MOVER = new Set(["INBOX", "Notification", "Newsletter", "Correo no deseado", "Papelera"]);

/** Nombre e ícono por carpeta. Los nombres crudos vienen del servidor (son la
 *  LLAVE: "Papelera", "Correo no deseado"… se comparan y viajan a la edge tal
 *  cual); aquí solo se elige cómo se muestran. Una carpeta que no está en el mapa
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
  // No es del servidor: los programados viven en Maven (lib/correo/programados.ts).
  [CARPETA_PROGRAMADOS]: { nombre: "mail.folder.scheduled", icono: CalendarClock },
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
  if (isToday(d)) return formatUI(d, "HH:mm");
  if (isThisYear(d)) return format(d, "d MMM", { locale: formatoUi.fechas });
  return format(d, "d MMM yy", { locale: formatoUi.fechas });
}

function fechaLarga(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Idioma fijo a propósito: va en la cita del correo que se le manda a otra persona.
  return formatUI(d, "d 'de' MMMM 'de' yyyy, HH:mm", { locale: es });
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
  // «Programados» (Keila, 08/10): aparece en la columna solo si hay alguno, como
  // en Gmail. No es una carpeta del servidor: nada de IMAP para ella.
  const enProgramados = carpeta === CARPETA_PROGRAMADOS;
  const programadosQ = useCorreosProgramados(hayBuzon);
  const listaCarpetas = conProgramados(carpetas.data ?? [], programadosQ.data?.length ?? 0, enProgramados);
  // La página de la carpeta, como Gmail: «1–50 de 186» con ‹ ›. Grace no
  // podía llegar a sus correos 51 al 126 (28/09).
  const [pagina, setPagina] = useState(0);
  // Cómo quiere ver el correo esta persona (Keila, 02/10): se guarda por persona.
  const prefs = usePreferenciasCorreo();
  // «Sin división»: el correo abierto ocupa todo; se vuelve con la flecha, «u» o Escape.
  const sinDivision = prefs.lectura === "completa";
  // «No leídos primero», solo en Recibidos (como Gmail). Mirando una etiqueta o
  // buscando, la lista se arma de otra forma y no se parte.
  const modoNoLeidos = prefs.noLeidosPrimero && carpeta === "INBOX" && !etiquetaVista && !enBusqueda;
  // En ese modo la página trae solo los LEÍDOS («Todo lo demás») y los no
  // leídos vienen de TODA la carpeta: uno sin leer de la página 3 va arriba.
  const lista = useMailMessages(carpeta, hayBuzon && !enProgramados, pagina, modoNoLeidos);
  const noLeidosQ = useMailNoLeidos(carpeta, hayBuzon && modoNoLeidos);
  const totalCarpeta = lista.data?.total;
  const resultados = useMailSearch(carpeta, queryActiva, hayBuzon && !enProgramados);
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
  // El cuerpo de OTRO mensaje de la conversación (no el abierto), para
  // responderlo o reenviarlo desde su ⋮.
  const traerMensaje = useTraerMensaje();
  const [trayendoMensaje, setTrayendoMensaje] = useState(false);
  // «Traducir» del ⋮: la clave del mensaje traducido. Si se abre otro, deja
  // de coincidir y se ve el original, sin tener que limpiarlo.
  const [traducido, setTraducido] = useState<string | null>(null);
  // «Compartir en el chat» del ⋮.
  const [compartiendo, setCompartiendo] = useState<CorreoACompartir | null>(null);
  // Los correos que se están arrastrando (una fila o la selección) y la
  // carpeta sobre la que están, para resaltarla.
  const [arrastre, setArrastre] = useState<{ correos: MailSummary[]; hilos: number } | null>(null);
  const [carpetaBajoArrastre, setCarpetaBajoArrastre] = useState<string | null>(null);
  // Un correo que hay que abrir DESPUÉS de cambiar de carpeta (el enlace del
  // chat): el efecto de `carpeta` suelta el abierto, y esto le dice cuál abrir.
  const abrirAlCambiarDeCarpeta = useRef<MailSummary | null>(null);
  // La bandeja se actualiza sola cuando el sincronizador escribe (push).
  useMailRealtime(hayBuzon);

  // `?mensaje=<Message-ID>`: el enlace de «Compartir en el chat». Se abre MI
  // copia de ese correo (puede estar en otra carpeta, o no estar). La URL se
  // limpia para que un refresh no lo vuelva a abrir.
  useEffect(() => {
    const id = params.get(PARAM_MENSAJE);
    if (!id || !hayBuzon) return;
    const limpio = new URLSearchParams(params);
    limpio.delete(PARAM_MENSAJE);
    setParams(limpio, { replace: true });
    buscarCorreoPorMessageId(id)
      .then((m) => {
        if (!m) { toast.error(t("mail.link.notFound")); return; }
        setEtiquetaVista(null);
        setQueryActiva("");
        setBusqueda("");
        if (m.unread) marcarLeido.mutate({ folder: m.folder ?? "INBOX", m });
        if (m.folder && m.folder !== carpeta) {
          abrirAlCambiarDeCarpeta.current = m;
          setCarpeta(m.folder);
        } else {
          setSel(m);
        }
      })
      .catch(() => toast.error(t("mail.link.error")));
    // Solo cuando cambia la URL: la carpeta de ese momento alcanza.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, hayBuzon, setParams]);

  // «u» o Escape: volver a la lista, como en Gmail, cuando el correo abierto
  // ocupa todo el espacio («Sin división»).
  useEffect(() => {
    if (!sinDivision || !sel) return;
    const alPulsar = (e: KeyboardEvent) => {
      if (!esAtajoDeVolver(e, document)) return;
      e.preventDefault();
      setSel(null);
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [sinDivision, sel]);

  // `?carpeta=programados`: el aviso de «No se pudo enviar tu correo
  // programado» lleva directo a la carpeta, donde se ve el motivo.
  useEffect(() => {
    if (params.get("carpeta") !== "programados") return;
    irACarpeta(CARPETA_PROGRAMADOS);
    const limpio = new URLSearchParams(params);
    limpio.delete("carpeta");
    setParams(limpio, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, setParams]);

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
    // Salvo que se haya cambiado de carpeta PARA abrir uno (el enlace del chat).
    setSel(abrirAlCambiarDeCarpeta.current);
    abrirAlCambiarDeCarpeta.current = null;
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
  // «Deshacer» de Gmail: el aviso de cada acción lleva el botón, y la z
  // deshace la última. Ver hooks/useDeshacerCorreo y lib/correo/deshacer.
  const listas = useListasDelCorreo();
  const { avisar, avisarError } = useDeshacerCorreo();
  /** Las etiquetas que tenía cada correo ANTES de tocarlo: con eso se sabe qué
   *  devolver al deshacer (solo lo que cambió). */
  const etiquetasQueTenia = (messageId: string): string[] => etiquetasPorCorreo.data?.get(messageId) ?? [];
  const [confirmarBorrado, setConfirmarBorrado] = useState<MailSummary[] | null>(null);
  // El borrado lo pidió el ⋮ de UN mensaje de la conversación (y no la barra
  // de selección, que borra conversaciones enteras).
  const [borrandoDelHilo, setBorrandoDelHilo] = useState(false);
  /** El aviso de cada operación. Eliminar depende de la carpeta DEL GRUPO, no
   *  de la que se mira: un mensaje del hilo puede vivir en otra. */
  const NOMBRE_OP = (f: string): Record<OperacionMasiva, (n: number) => string> => ({
    seen: (n) => t(n === 1 ? "mail.bulk.seenOne" : "mail.bulk.seenMany", { n }),
    unseen: (n) => t(n === 1 ? "mail.bulk.unseenOne" : "mail.bulk.unseenMany", { n }),
    archive: (n) => t(n === 1 ? "mail.bulk.archivedOne" : "mail.bulk.archivedMany", { n }),
    spam: (n) => t(n === 1 ? "mail.bulk.spamOne" : "mail.bulk.spamMany", { n }),
    move: (n) => t(n === 1 ? "mail.bulk.movedOne" : "mail.bulk.movedMany", { n }),
    snooze: (n) => t(n === 1 ? "mail.bulk.snoozedOne" : "mail.bulk.snoozedMany", { n }),
    delete: (n) => f === "Papelera"
      ? t(n === 1 ? "mail.bulk.deletedOne" : "mail.bulk.deletedMany", { n })
      : t(n === 1 ? "mail.bulk.trashedOne" : "mail.bulk.trashedMany", { n }),
  });
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
      // «Estos correos no tienen identificador…»
      toast.error(t("mail.noIdentifier"));
      return;
    }
    const sinId = elegidos.length - ids.length;
    // Lo contrario, calculado ANTES de cambiar nada: solo a los que cambian.
    const deVuelta = etiquetaDeVuelta({ messageIds: ids, labelId, poner }, etiquetasQueTenia);
    etiquetar.mutate({ messageIds: ids, labelId, poner }, {
      onSuccess: () => {
        avisar(poner ? t("mail.labels.applied") : t("mail.labels.removed"), {
          descripcion: sinId ? t("mail.labels.skippedNoId", { n: sinId }) : undefined,
          accion: deVuelta ? { etiquetas: [deVuelta] } : null,
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
   *  etiquetar), saldría de Recibidos sin quedar en ningún lado.
   *
   *  «Deshacer» revierte TODO: le saca la etiqueta (a los que no la tenían),
   *  le devuelve la que se le quitó y lo devuelve a la bandeja. */
  const moverAEtiqueta = (labelId: string, ruta: string, correos?: MailSummary[]) => {
    const elegidos = correos ?? items.filter((m) => seleccion.has(claveDe(m)));
    const conId = elegidos.filter((m) => m.messageId);
    const ids = conId.map((m) => m.messageId!) as string[];
    if (!ids.length) {
      toast.error(t("mail.noIdentifier"));
      return;
    }
    const sinId = elegidos.length - conId.length;
    const desde = etiquetaVista;
    // Lo contrario de cada cambio de etiqueta, ANTES de hacerlo.
    const deVuelta = [
      etiquetaDeVuelta({ messageIds: ids, labelId, poner: true }, etiquetasQueTenia),
      desde && desde !== labelId
        ? etiquetaDeVuelta({ messageIds: ids, labelId: desde, poner: false }, etiquetasQueTenia)
        : null,
    ].filter((c): c is CambioDeEtiqueta => !!c);
    const soloEtiquetas = deVuelta.length ? { etiquetas: deVuelta } : null;
    etiquetar.mutate({ messageIds: ids, labelId, poner: true }, {
      onSuccess: () => {
        const aviso = (n: number) =>
          n === 1 ? t("mail.moved.one", { name: ruta }) : t("mail.moved.many", { n, name: ruta });
        const detalle = sinId ? t("mail.moved.skippedNoId", { n: sinId }) : undefined;
        const listo = () => {
          avisar(aviso(conId.length), { descripcion: detalle, accion: soloEtiquetas });
          if (!correos) setSeleccion(new Set());
        };
        if (desde) {
          // El aviso (con su «Deshacer») solo cuando la de antes ya salió:
          // deshacer antes de tiempo la devolvería y enseguida se la sacaría.
          if (desde !== labelId) {
            etiquetar.mutate({ messageIds: ids, labelId: desde, poner: false }, {
              onSuccess: listo,
              onError: (e) => toast.error((e as Error).message),
            });
          } else {
            listo();
          }
          return;
        }
        const salen = conId.filter((m) => SE_VACIAN_AL_MOVER.has(m.folder ?? carpeta));
        if (salen.length) {
          lanzarMasiva("archive", salen, undefined, undefined, { aviso, descripcion: detalle, etiquetas: deVuelta });
        } else {
          listo();
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
    extra?: {
      /** Otro texto para el aviso (p. ej. «Movido a Pagos» en vez de «archivado»). */
      aviso?: (n: number) => string;
      /** Una línea más debajo del aviso. */
      descripcion?: string;
      /** Cambios de etiqueta que «Deshacer» también tiene que revertir
       *  («Mover a» una etiqueta = ponerla + archivar). */
      etiquetas?: CambioDeEtiqueta[];
    },
  ) => {
    const cierraElAbierto = !!sel && op !== "seen" && op !== "unseen" &&
      elegidos.some((m) => claveDe(m) === claveDe(sel));
    // La conversación que la acción cierra, con SU carpeta: «Deshacer» la
    // vuelve a abrir, y en otra vista la carpeta que se mira puede ser otra.
    const abierto = cierraElAbierto && sel ? { ...sel, folder: sel.folder ?? carpeta } : null;
    if (cierraElAbierto) setSel(null);
    setSeleccion(new Set());
    // ⚠️ UNA LLAMADA POR CARPETA, y no una sola con la carpeta seleccionada.
    //
    // Los UID son POR CARPETA: el uid 5 de Recibidos y el uid 5 de Archivados
    // son correos DISTINTOS. En la vista por etiqueta conviven correos de
    // varias, así que mandarlos todos como si fueran de una sola no fallaría —
    // movería OTROS mensajes, los que tengan esos uid en la carpeta que se
    // mandó. Es la clase de error que no se nota hasta que falta un correo.
    const porCarpeta = [...agruparPorCarpeta(elegidos, carpeta)];
    // ⚠️ La foto de las listas ANTES de lanzar: cada llamada saca sus correos
    // de la lista al instante (optimista), y «Deshacer» los repone desde aquí.
    const foto = listas.foto(porCarpeta.map(([f]) => f));
    // ⚠️ `mutateAsync` y no `mutate` con callbacks: con varias llamadas
    // seguidas, react-query solo dispara los callbacks de `mutate` de la
    // ÚLTIMA. La respuesta de cada grupo hace falta (el uid nuevo, para
    // deshacer), y el error de cualquiera también.
    // El turno del aviso de ESTA acción: un error que llega cuando ya hubo otra
    // no puede tapar el aviso de la otra. Se asigna abajo, antes de que llegue
    // cualquier respuesta.
    let turno = -1;
    const grupos = porCarpeta.map(([f, delGrupo]) => {
      const respuesta = masiva.mutateAsync({ folder: f, op, items: delGrupo, dest, volverAt });
      respuesta.catch((e) => avisarError((e as Error).message || t("mail.bulk.error"), turno));
      return { origen: f, correos: delGrupo, respuesta };
    });

    // ── El aviso: UNO para toda la acción, como Gmail ──────────────────────
    // Sale ya, junto con el cambio de la lista, y no cuando contesta el
    // servidor: si no, durante esos segundos la z deshacía la acción anterior.
    const enviados = (g: { correos: MailSummary[] }) => g.correos.filter((m) => uidDe(m) != null).length;
    const sumar = (gs: { correos: MailSummary[] }[]) => gs.reduce((n, g) => n + enviados(g), 0);
    const deshacibles = grupos.filter((g) => sePuedeDeshacer(op, g.origen));
    const definitivos = grupos.filter((g) => !sePuedeDeshacer(op, g.origen));
    const omitidos = elegidos.length - sumar(grupos);
    // Ninguno con uid: la llamada falla y su error es el aviso.
    if (omitidos === elegidos.length) return;
    // «Mover a» una carpeta dice cuál, como el arrastre.
    const avisoMover = op === "move" && dest
      ? (n: number) => n === 1
        ? t("mail.moved.one", { name: nombreCarpeta(dest) })
        : t("mail.moved.many", { n, name: nombreCarpeta(dest) })
      : undefined;
    const notas = [
      // Eliminar desde una etiqueta: lo que ya estaba en la Papelera se borró
      // de verdad (eso no tiene vuelta) y el resto fue a la Papelera.
      deshacibles.length && definitivos.length ? NOMBRE_OP("Papelera").delete(sumar(definitivos)) : null,
      omitidos ? t("mail.bulk.skippedNoId", { n: omitidos }) : null,
      extra?.descripcion ?? null,
    ].filter(Boolean).join(" ") || undefined;

    if (!deshacibles.length) {
      // Borrado definitivo: no hay «Deshacer» (por eso se confirma antes).
      turno = avisar(NOMBRE_OP("Papelera").delete(sumar(definitivos)), { descripcion: notas });
      return;
    }
    const texto = (extra?.aviso ?? avisoMover ?? NOMBRE_OP(deshacibles[0].origen)[op])(sumar(deshacibles));
    turno = avisar(texto, {
      descripcion: notas,
      accion: {
        masiva: { op, dest, grupos, foto },
        etiquetas: extra?.etiquetas,
        // Gmail vuelve a la conversación que se archivó desde adentro.
        alDeshacer: abierto ? () => setSel((s) => s ?? abierto) : undefined,
        // Y le pone el uid que tiene AHORA (el de antes ya no existe): sin
        // esto, ver o bajar un adjunto lo buscaría con el viejo.
        alVolver: abierto
          ? (vueltos) => setSel((s) => {
              if (!s || claveDe(s) !== claveDe(abierto)) return s;
              const v = vueltos.find((x) => claveDe(x) === claveDe(abierto));
              return v ? { ...s, uid: v.uid, folder: v.folder } : s;
            })
          : undefined,
      },
    });
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
    : enBusqueda
      ? (resultados.data?.messages ?? [])
      // «No leídos primero»: los no leídos de TODA la carpeta + los leídos de
      // esta página. Así «seleccionar todos» y los hilos ven las dos secciones.
      : modoNoLeidos ? juntarSinRepetir(noLeidosQ.data?.messages ?? [], mensajes) : mensajes;

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

  // Lo que estuvo en «No leídos» y se acaba de leer SIGUE arriba hasta cambiar
  // de carpeta (Gmail hace lo mismo): si no, abrir un correo lo haría saltar de
  // sección mientras lo lees.
  const quedanArriba = useRef<Set<string>>(new Set());
  useEffect(() => { quedanArriba.current = new Set(); }, [carpeta, modoNoLeidos]);
  for (const m of noLeidosQ.data?.messages ?? []) quedanArriba.current.add(claveDe(m));
  const secciones = useMemo(
    () => (modoNoLeidos ? partirNoLeidosPrimero(hilos, (m) => quedanArriba.current.has(claveDe(m))) : null),
    [modoNoLeidos, hilos],
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
    // Las reacciones (como Gmail) no son mensajes de la charla: van como chips.
    const otros = hiloCompleto.filter((m) =>
      !m.reaccion && (m.messageId ? m.messageId !== sel.messageId : claveDe(m) !== claveDe(sel))
    );
    return {
      antes: otros.filter((m) => (Date.parse(m.date) || 0) <= cuando),
      despues: otros.filter((m) => (Date.parse(m.date) || 0) > cuando),
    };
  }, [hiloCompleto, sel]);
  // ── Reacciones con emoji (Keila, 08/10: como Gmail) ─────────────────────
  const reaccionar = useReaccionarCorreo();
  // Las que acabo de mandar, por mensaje: se ven al instante y se juntan con
  // las de la base cuando vuelven (una persona cuenta una vez por emoji).
  const [reaccionesMias, setReaccionesMias] = useState<Record<string, string[]>>({});
  const reaccionesDelHilo = useMemo(() => hiloCompleto.filter((m) => m.reaccion), [hiloCompleto]);
  const miCorreo = buzon?.email_address ?? "";
  const reaccionarA = (m: MailSummary, emoji: string) => {
    const id = m.messageId;
    if (!id) return;
    const quitar = () => setReaccionesMias((r) => ({ ...r, [id]: (r[id] ?? []).filter((e) => e !== emoji) }));
    setReaccionesMias((r) => ({ ...r, [id]: [...new Set([...(r[id] ?? []), emoji])] }));
    reaccionar.mutate({ messageId: id, emoji }, {
      onError: (e) => {
        quitar();
        toast.error(t("mail.react.error", { error: (e as Error).message }));
      },
    });
  };

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
    : enBusqueda ? resultados.isFetching : lista.isLoading || (modoNoLeidos && noLeidosQ.isLoading);
  const errorItems = etiquetaVista
    ? correosDeEtiqueta.error
    : enBusqueda ? resultados.error : lista.error ?? (modoNoLeidos ? noLeidosQ.error : null);

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

  /** Abrir una conversación la deja leída ENTERA, como Gmail. Antes se marcaba
   *  solo el último mensaje y los anteriores sin leer seguían contando en la
   *  carpeta y en sus etiquetas (Keila, 08/10). */
  const abrirHilo = (h: Hilo<MailSummary>) => {
    abrir(h.ultimo);
    for (const m of h.mensajes) {
      if (m.unread && claveDe(m) !== claveDe(h.ultimo)) marcarLeido.mutate({ folder: m.folder ?? carpeta, m });
    }
  };

  /** El cuerpo completo de un mensaje de la conversación. El abierto ya está
   *  cargado; cualquier otro se trae (de la caché, casi siempre al instante). */
  const completoDe = (m: MailSummary): Promise<MailMessage> =>
    sel && mensaje.data && claveDe(m) === claveDe(sel)
      ? Promise.resolve(mensaje.data)
      : traerMensaje(m.folder ?? carpeta, m);

  /** Trae el mensaje para una acción del ⋮; si no se puede, avisa y da null. */
  const traerParaAccion = async (m: MailSummary): Promise<MailMessage | null> => {
    setTrayendoMensaje(true);
    try {
      return await completoDe(m);
    } catch (e) {
      toast.error(t("mail.msg.loadError"), { description: (e as Error).message });
      return null;
    } finally {
      setTrayendoMensaje(false);
    }
  };

  // Responder a UN mensaje de la conversación: el abierto (botones de abajo) o
  // cualquier otro desde su ⋮. `aTodos`: además del remitente, arrastra el
  // resto del Para y el Copia del original (menos yo mismo), como Gmail.
  //
  // ⚠️ Encadena con ESE mensaje (su Message-ID y su cadena de References), no
  // con el abierto: eso y a QUIÉN va viven en `borradorDeRespuesta` y
  // `destinatariosRespuesta`, puros y probados.
  const responderA = async (m: MailSummary, aTodos: boolean) => {
    const completo = await traerParaAccion(m);
    if (!completo) return;
    setRedactar(borradorDeRespuesta({
      resumen: m, mensaje: completo, yo: buzon?.email_address ?? "", aTodos, fecha: fechaLarga(completo.date),
    }));
  };

  // ── Reenviar ───────────────────────────────────────────────────────────
  // Lo pidió Carolina: no existía. Reenviar SIN los adjuntos no sería
  // reenviar —casi siempre el archivo ES el correo—, así que se bajan primero
  // y recién después se abre el compositor con todo puesto.
  //
  // ⚠️ Los adjuntos se bajan de la carpeta DEL MENSAJE: en una etiqueta o en
  // el hilo cruzado puede no ser la que se mira, y los uid son por carpeta.
  const reenviarA = async (m: MailSummary) => {
    const completo = await traerParaAccion(m);
    if (!completo) return;
    const carpetaDelMensaje = m.folder ?? carpeta;
    const uid = m.uid != null ? Number(m.uid) : null;
    const metas = completo.attachments ?? [];

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
            folder: carpetaDelMensaje, uid, adjuntos: metas,
          });
        } catch (e) {
          // Que falle un adjunto no puede impedir reenviar el mensaje.
          toast.error(t("mail.fwd.fetchError", { error: (e as Error).message }));
        }
      }
    }

    setRedactar(borradorDeReenvio({
      resumen: m, mensaje: completo, fecha: fechaLarga(completo.date),
      carpeta: carpetaDelMensaje, adjuntosIniciales,
    }));
  };

  const responder = () => { if (sel) void responderA(sel, false); };
  const responderATodos = () => { if (sel) void responderA(sel, true); };
  const reenviar = () => { if (sel) void reenviarA(sel); };

  /** «Compartir en el chat»: quién, asunto, fecha, un resumen y el enlace. */
  const compartirEnChat = async (m: MailSummary) => {
    let resumen = m.snippet ?? "";
    if (!resumen) resumen = (await traerParaAccion(m))?.text ?? "";
    setCompartiendo({ de: m.from, asunto: m.subject, fecha: m.date, resumen, messageId: m.messageId });
  };

  /** «Marcar como no leído a partir de aquí»: este y los que vinieron
   *  después, cada uno en SU carpeta (el hilo cruza carpetas). Y de vuelta a la
   *  lista, como Gmail: quedarse leyendo lo marcaría leído otra vez. */
  const noLeidoDesdeAqui = (m: MailSummary) => {
    lanzarMasiva("unseen", desdeAqui(delAbierto, m));
    setSel(null);
  };

  /** «Traducir»: se abre ese mensaje (si no era el abierto) y se traduce. */
  const traducirMensaje = (m: MailSummary) => {
    if (!sel || claveDe(m) !== claveDe(sel)) abrir(m);
    setTraducido(claveDe(m));
  };

  const accionesPara = (m: MailSummary): AccionesDelMensaje => ({
    onResponder: () => void responderA(m, false),
    onReenviar: () => void reenviarA(m),
    onCompartir: () => void compartirEnChat(m),
    // Con la confirmación de siempre: «Confirmar SIEMPRE que se borra».
    onEliminar: () => { setBorrandoDelHilo(true); setConfirmarBorrado([m]); },
    onNoLeidoDesdeAqui: () => noLeidoDesdeAqui(m),
    onTraducir: () => traducirMensaje(m),
  });

  /** El ⋮ de un mensaje de la conversación (en Borradores no hay: ahí se edita). */
  const menuDe = (m: MailSummary, className?: string): ReactNode =>
    carpeta === "Borrador" && !etiquetaVista ? null : (
      <MenuDelMensaje acciones={accionesPara(m)} ocupado={trayendoMensaje} className={className} />
    );
  /** En los plegados, más tenue hasta pasar el mouse: una columna de ⋮ fuertes
   *  compite con los nombres. En pantallas táctiles (sin hover), siempre. */
  const menuDePlegado = (m: MailSummary) => menuDe(
    m,
    "opacity-50 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100",
  );

  // ── Arrastrar correos a una carpeta o a una etiqueta (Keila, 02/10) ──────
  // Se arrastra una fila (la conversación entera) o, si esa fila está en la
  // selección, TODA la selección. Soltar es lo mismo que «Mover a».
  const empezarArrastre = (h: Hilo<MailSummary>, e: DragEvent) => {
    const enSeleccion = h.mensajes.every((m) => seleccion.has(claveDe(m)));
    const correos = enSeleccion ? items.filter((m) => seleccion.has(claveDe(m))) : h.mensajes;
    const nHilos = enSeleccion
      ? hilos.filter((x) => x.mensajes.every((m) => seleccion.has(claveDe(m)))).length
      : 1;
    setArrastre({ correos, hilos: Math.max(1, nHilos) });
    const dt = e.dataTransfer;
    if (!dt) return;
    dt.effectAllowed = "move";
    // Firefox no arranca un arrastre sin datos.
    try { dt.setData("application/x-maven-correos", String(correos.length)); } catch { /* noop */ }
    // La «etiqueta» que acompaña al puntero, con cuántas conversaciones van.
    if (typeof dt.setDragImage === "function") {
      const fantasma = document.createElement("div");
      fantasma.textContent = t(nHilos > 1 ? "mail.drag.many" : "mail.drag.one", { n: nHilos });
      fantasma.className = "fixed -left-[999px] top-0 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-lg";
      document.body.appendChild(fantasma);
      dt.setDragImage(fantasma, 14, 14);
      setTimeout(() => fantasma.remove(), 0);
    }
  };
  const terminarArrastre = () => {
    setArrastre(null);
    setCarpetaBajoArrastre(null);
  };
  /** ¿Esta carpeta recibe lo que se arrastra? No las que no son de correo
   *  recibido (Enviados, Borradores, Pospuestos) ni donde ya están todos. */
  const recibeArrastre = (f: string) =>
    !!arrastre && !NO_SE_SUELTA.has(f) && paraSoltarEnCarpeta(arrastre.correos, f, carpeta).mover.length > 0;
  const soltarEnCarpeta = (f: string) => {
    const a = arrastre;
    terminarArrastre();
    if (!a) return;
    const { mover } = paraSoltarEnCarpeta(a.correos, f, carpeta);
    if (!mover.length) {
      toast.info(t("mail.drag.alreadyThere", { name: nombreCarpeta(f) }));
      return;
    }
    // Igual que «Mover a» esa carpeta (mismo aviso, mismo «Deshacer»):
    // agrupado POR CARPETA dentro de lanzarMasiva.
    lanzarMasiva("move", mover, f);
  };
  const soltarEnEtiqueta = (id: string, ruta: string) => {
    const a = arrastre;
    terminarArrastre();
    // Igual que «Mover a» esa etiqueta: se le pone y sale de la bandeja.
    if (a) moverAEtiqueta(id, ruta, a.correos);
  };

  /** ¿Lo que se va a eliminar YA está en la Papelera? Entonces se borra de
   *  verdad. Se mira la carpeta de cada correo, no la que se mira: el ⋮ de un
   *  mensaje del hilo puede apuntar a uno de otra carpeta. */
  const borraDefinitivo = !!confirmarBorrado?.some((m) => (m.folder ?? carpeta) === "Papelera");
  const confirmarElBorrado = () => {
    const e = confirmarBorrado;
    const delHilo = borrandoDelHilo;
    setConfirmarBorrado(null);
    setBorrandoDelHilo(false);
    if (!e) return;
    // Eliminar desde el ⋮ el mensaje ABIERTO de una conversación con más
    // mensajes: la conversación sigue abierta en el más nuevo que queda, como
    // en Gmail, en vez de cerrarse entera.
    const otro = delHilo && e.length === 1 && sel && claveDe(e[0]) === claveDe(sel)
      ? [...hiloAntes, ...hiloDespues].sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0))[0]
      : undefined;
    lanzarMasiva("delete", e);
    if (otro) abrir(otro);
  };

  /** Una fila de la lista (una conversación). */
  const filaDeHilo = (h: Hilo<MailSummary>) => (
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
      onClick={() => abrirHilo(h)}
      onPrecargar={() => precargar(carpeta, h.ultimo)}
      onArrastrar={(e) => empezarArrastre(h, e)}
      onFinArrastre={terminarArrastre}
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
          ? [{ id: "__recibidos", ruta: t("mail.folder.inbox"), color: null }, ...suyas]
          : suyas;
      })()}
      // Sin leer si CUALQUIERA del hilo lo está: si no, una
      // conversación con una respuesta nueva se vería leída.
      hiloSinLeer={h.mensajes.some((m) => m.unread)}
    />
  );

  // Retomar un borrador del servidor en el compositor: se cargan sus campos,
  // su UID (para reemplazarlo al re-guardar o borrarlo al enviar) y LO QUE
  // TENÍA ADJUNTO, que antes se perdía (Keila, 08/10): las imágenes pegadas
  // vuelven al cuerpo y los archivos a la lista (ver borradorRetomado.ts).
  //
  // ⚠️ Si los adjuntos no se pueden traer, el borrador NO se abre. Abrirlo sin
  // ellos y re-guardarlo los borraría del servidor para siempre.
  const editarBorrador = async () => {
    const m = mensaje.data;
    if (!m || !sel) return;
    const uid = sel.uid != null ? Number(sel.uid) : undefined;
    const metas = m.attachments ?? [];
    let cuerpoHtml = m.html;
    let adjuntosIniciales: BorradorInicial["adjuntosIniciales"];
    if (metas.length > 0 && uid != null) {
      const pesa = metas.reduce((n, a) => n + (a.sizeBytes ?? 0), 0);
      if (pesa > TOPE_ADJUNTOS) {
        toast.error(t("mail.draft.tooBig", { mb: (pesa / 1024 / 1024).toFixed(1) }));
        return;
      }
      try {
        const bajados = await bajarParaReenviar.mutateAsync({ folder: carpetaDelAbierto, uid, adjuntos: metas });
        ({ html: cuerpoHtml, adjuntos: adjuntosIniciales } = repartirBorradorRetomado(m.html, metas, bajados));
      } catch (e) {
        toast.error(t("mail.draft.fetchError", { error: (e as Error).message }));
        return;
      }
    }
    setRedactar({
      to: direccionesDe(m.to).join(", "),
      cc: m.cc ? direccionesDe(m.cc).join(", ") || undefined : undefined,
      subject: m.subject === SIN_ASUNTO ? "" : m.subject,
      cuerpoHtml: cuerpoHtml ?? undefined,
      serverDraftUid: uid,
      // Un borrador de RESPUESTA sigue colgado de su conversación: sin esto,
      // re-guardarlo o mandarlo cortaba el hilo.
      inReplyTo: sel.inReplyTo,
      references: sel.refs?.join(" "),
      adjuntosIniciales,
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
    <div className="flex h-full flex-col">
      {/* Encabezado */}
      <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
        {/* En móvil la flecha es la única forma de volver de un mensaje. Y en
            «Sin división» también en escritorio: la lista no está al lado. */}
        {!enLista && (
          <Button
            variant="ghost"
            size="icon"
            className={cn("rounded-full", !sinDivision && "md:hidden")}
            onClick={() => setSel(null)}
            aria-label={t("mail.backToList")}
            title={sinDivision ? t("mail.view.backHint") : undefined}
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
        {/* «Dividir» / «Sin división», como el panel de lectura de Gmail. En el
            teléfono no hay qué dividir: siempre se ve una cosa por vez. */}
        <BotonPanelDeLectura
          lectura={prefs.lectura}
          onCambiar={(lectura) => prefs.cambiar({ lectura })}
          className="hidden md:inline-flex"
        />
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
          {listaCarpetas.map(({ folder: f, unread }) => {
            const Icono = iconoCarpeta(f);
            // Mirando una etiqueta, ninguna carpeta se marca: la vista es UNA sola.
            const activa = !etiquetaVista && f === carpeta;
            // Arrastrando correos: soltarlos acá es «Mover a» esta carpeta.
            const recibe = recibeArrastre(f);
            return (
              <button
                key={f}
                onClick={() => irACarpeta(f)}
                onDragOver={recibe ? (e) => {
                  e.preventDefault();
                  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
                  if (carpetaBajoArrastre !== f) setCarpetaBajoArrastre(f);
                } : undefined}
                onDragLeave={recibe ? (e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                    setCarpetaBajoArrastre((d) => (d === f ? null : d));
                  }
                } : undefined}
                onDrop={recibe ? (e) => { e.preventDefault(); soltarEnCarpeta(f); } : undefined}
                data-soltable={recibe ? "" : undefined}
                title={carpetasAbiertas ? undefined : `${nombreCarpeta(f)}${unread > 0 && f !== CARPETA_PROGRAMADOS ? ` · ${t("mail.nUnread", { n: unread })}` : ""}`}
                aria-label={nombreCarpeta(f)}
                aria-current={activa ? "page" : undefined}
                className={cn(
                  "relative flex w-full items-center gap-2.5 rounded-2xl py-2 text-left text-sm transition-colors",
                  carpetasAbiertas ? "px-3" : "justify-center px-0",
                  activa
                    ? "bg-primary/12 font-medium text-foreground before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r before:bg-gradient-to-b before:from-accent before:to-primary"
                    : "text-muted-foreground hover:bg-primary/5 hover:text-foreground",
                  recibe && carpetaBajoArrastre === f && "bg-primary/15 text-foreground ring-2 ring-primary/60",
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
              archivado sigue apareciendo aquí. El árbol y el ⋮ de cada una
              viven en EtiquetasColumna. */}
          <EtiquetasColumna
            abierta={carpetasAbiertas}
            etiquetaVista={etiquetaVista}
            onAbrir={(id) => { setEtiquetaVista(id); setSel(null); }}
            noLeidos={noLeidosPorEtiqueta.data}
            soltar={{ activo: !!arrastre, onSoltar: soltarEnEtiqueta }}
          />
        </nav>

        {enProgramados && (
          <VistaProgramados
            onEditar={(inicial) => setRedactar(inicial)}
            onVolver={() => irACarpeta("INBOX")}
          />
        )}

        {/* Lista */}
        <div
          data-testid="columna-lista"
          className={cn(
            "min-w-0 flex-col border-border/60",
            enProgramados && "!hidden",
            sinDivision
              // «Sin división»: la lista ocupa todo el ancho, y con un correo
              // abierto se esconde (el correo ocupa su lugar), como en Gmail.
              ? (enLista ? "flex flex-1" : "hidden")
              : cn("border-r md:flex md:w-80 md:shrink-0 lg:w-96 2xl:w-[28rem]", enLista ? "flex flex-1" : "hidden"),
          )}
        >
          {/* Carpetas como píldoras cuando no está la columna lateral —
              mismo patrón que los filtros de Messenger. */}
          {/* SIN scrollbar-hide a propósito: con la barra oculta, quien usa
              mouse no tiene forma de desplazarse entre las carpetas (el
              gesto táctil no existe y la rueda scrollea vertical). La
              barra finita es el asa. */}
          <div className="flex gap-1.5 overflow-x-auto border-b border-border/60 px-3 py-2 pb-1.5 lg:hidden">
            {(carpetas.data ? listaCarpetas : [{ folder: carpeta, unread: 0 }]).map(({ folder: f }) => {
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
              que el viewport y SE COME EL BORDE DERECHO (aquí, las horas de
              la lista — mismo bug que ya mordió a Messenger). Forzarlo a
              block lo clampa y deja funcionar a truncate/min-w-0. */}
          <AlertDialog open={!!confirmarBorrado} onOpenChange={(o) => { if (!o) { setConfirmarBorrado(null); setBorrandoDelHilo(false); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {borraDefinitivo ? t("mail.del.foreverTitle") : t("mail.del.trashTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {borraDefinitivo
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
              onClick={confirmarElBorrado}
            >
              {borraDefinitivo ? t("mail.deleteForever") : t("mail.moveToTrash")}
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
                      <AccionBarra icono={MailOpen} etiqueta={t("mail.act.markRead")} onClick={() => ejecutarMasiva("seen", items)} disabled={!hayNoLeidos} />
                      <AccionBarra icono={Mail} etiqueta={t("mail.act.markUnread")} onClick={() => ejecutarMasiva("unseen", items)} />
                      <span className="mx-1 h-4 w-px bg-border/70" />
                      <AccionBarra icono={Archive} etiqueta={t("mail.act.archive")} onClick={() => ejecutarMasiva("archive", items)} disabled={carpeta === "Archive"} />
                      <AccionBarra icono={ShieldAlert} etiqueta={t("mail.act.markSpam")} onClick={() => ejecutarMasiva("spam", items)} disabled={carpeta === "Correo no deseado"} />
                      <AccionBarra icono={Trash2} etiqueta={carpeta === "Papelera" ? t("mail.deleteForever") : t("common.delete")} onClick={() => ejecutarMasiva("delete", items)} />
                      <span className="mx-1 h-4 w-px bg-border/70" />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            title={t("mail.act.snooze")}
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
                                  {formatUI(o.cuando, "d MMM HH:mm", { locale: formatoUi.fechas })}
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
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                          >
                            <FolderInput className="h-4 w-4" />
                            <span className="sr-only">{t("mail.act.moveTo")}</span>
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
                            title={t("mail.act.label")}
                            disabled={etiquetar.isPending}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                          >
                            <Tag className="h-4 w-4" />
                            <span className="sr-only">{t("mail.act.label")}</span>
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
                      {t("mail.sel.clearShort")}
                    </button>
                  </>
                ) : (
                  <>
                    {/* «No leídos primero», solo en Recibidos (como Gmail). */}
                    {carpeta === "INBOX" && !etiquetaVista && !enBusqueda && (
                      <BotonNoLeidosPrimero
                        activo={prefs.noLeidosPrimero}
                        onCambiar={(v) => { setPagina(0); prefs.cambiar({ noLeidosPrimero: v }); }}
                      />
                    )}
                    {!etiquetaVista && !enBusqueda && totalCarpeta !== undefined ? (
                      // «1–50 de 186» y ‹ ›, como Gmail. Solo en una carpeta: la
                      // vista de una etiqueta y la búsqueda arman su propia lista.
                      // Con «No leídos primero» cuenta la sección de abajo.
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
                        {t(items.length === 1 ? "mail.countOne" : "mail.countMany", { n: items.length })}
                      </span>
                    )}
                  </>
                )}
              </div>
            );
          })()}

          <ScrollArea className="flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block">
            <div className="space-y-1.5 p-2">
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
              {secciones && items.length > 0 ? (
                // «No leídos primero»: dos secciones, como Gmail. Arriba los
                // no leídos de TODA la bandeja; abajo, la página de leídos.
                <>
                  <RotuloDeSeccion texto={t("mail.section.unread")} cantidad={noLeidosQ.data?.total} />
                  {secciones.noLeidos.length === 0 ? (
                    <p className="px-2.5 py-2 text-xs text-muted-foreground">{t("mail.section.unreadEmpty")}</p>
                  ) : (
                    secciones.noLeidos.map(filaDeHilo)
                  )}
                  {(noLeidosQ.data?.total ?? 0) > TOPE_NO_LEIDOS && (
                    <p className="px-2.5 py-1 text-[11px] text-muted-foreground">
                      {t("mail.section.unreadCapped", { n: TOPE_NO_LEIDOS, total: noLeidosQ.data?.total ?? 0 })}
                    </p>
                  )}
                  <RotuloDeSeccion texto={t("mail.section.rest")} />
                  {secciones.resto.length === 0 ? (
                    <p className="px-2.5 py-2 text-xs text-muted-foreground">{t("mail.section.restEmpty")}</p>
                  ) : (
                    secciones.resto.map(filaDeHilo)
                  )}
                </>
              ) : (
                hilos.map(filaDeHilo)
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Lectura */}
        <div className={cn("min-w-0 flex-1", enLista ? (sinDivision ? "hidden" : "hidden md:block") : "block", enProgramados && "!hidden")}>
          {sel === null ? (
            <div className="hidden h-full flex-col items-center justify-center gap-3 md:flex">
              <div className="relative">
                <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 rounded-full bg-primary/25 blur-2xl" />
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-white/50 bg-white/55 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] dark:border-white/10 dark:bg-white/[0.06]">
                  <Mail className="h-7 w-7 text-primary/70" />
                </div>
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
                {/* La barra del correo abierto: «Mover a» y «Etiquetar como»,
                    los mismos menús de la selección, aplicados a TODA la
                    conversación. Keila etiqueta y mueve desde aquí, con el
                    correo abierto — como en Gmail. */}
                <div className="mb-3 flex items-center gap-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        title={t("mail.act.moveTo")}
                        disabled={etiquetar.isPending}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                      >
                        <FolderInput className="h-4 w-4" />
                        <span className="sr-only">{t("mail.act.moveTo")}</span>
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
                        title={t("mail.act.label")}
                        disabled={etiquetar.isPending}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                      >
                        <Tag className="h-4 w-4" />
                        <span className="sr-only">{t("mail.act.label")}</span>
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
                    {marcadorSinAsunto(sinPrefijos(mensaje.data.subject) || mensaje.data.subject, t)}
                  </h2>
                  {/* Las pastillas con × junto al asunto, como Gmail: TODAS
                      las etiquetas de la conversación (aquí no se esconde
                      ninguna) y «Recibidos» si sigue en la bandeja. */}
                  {abiertoEnRecibidos.length > 0 && (
                    <PastillaEtiqueta
                      nombre={t("mail.folder.inbox")}
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
                <TiraDeHilo mensajes={hiloAntes} abrir={abrir} menu={menuDePlegado} className="mt-4" />

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
                  {/* El ⋮ del mensaje abierto, como en Gmail: el mismo de cada
                      mensaje de la conversación. */}
                  {/* La carita de Gmail, al lado del ⋮: reaccionar con un emoji. */}
                  {!(carpeta === "Borrador" && !etiquetaVista) && (
                    <BotonReaccionar
                      variante="icono"
                      puede={puedeReaccionar(sel, miCorreo)}
                      enviando={reaccionar.isPending}
                      onElegir={(emoji) => reaccionarA(sel, emoji)}
                    />
                  )}
                  {menuDe(sel, "-mt-1")}
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
                  {traducido === claveDe(sel) ? (
                    // «Traducir» del ⋮: la traducción arriba y el original
                    // plegado debajo, con «Ver original».
                    <TraduccionDelCorreo correo={sel} mensaje={mensaje.data} onQuitar={() => setTraducido(null)}>
                      <MailBody
                        html={cuerpoConImagenes}
                        text={mensaje.data.text}
                        remoteImages={mensaje.data.remote_images}
                        truncated={mensaje.data.truncated}
                      />
                    </TraduccionDelCorreo>
                  ) : (
                    <MailBody
                      html={cuerpoConImagenes}
                      text={mensaje.data.text}
                      remoteImages={mensaje.data.remote_images}
                      truncated={mensaje.data.truncated}
                    />
                  )}
                </div>

                {/* Las reacciones a este mensaje, como chips (Gmail). */}
                <ChipsDeReacciones
                  chips={chipsDeReacciones(reaccionesDelHilo, sel.messageId, miCorreo, reaccionesMias[sel.messageId ?? ""])}
                  puede={puedeReaccionar(sel, miCorreo)}
                  onSumar={(emoji) => reaccionarA(sel, emoji)}
                />

                {/* ── Lo POSTERIOR ────────────────────────────────────────
                    Casi siempre son las respuestas propias, que viven en
                    Enviados: el motivo por el que el hilo se veía a medias. */}
                <TiraDeHilo mensajes={hiloDespues} abrir={abrir} menu={menuDePlegado} className="mt-5" />

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
                      onClick={() => void editarBorrador()}
                      disabled={bajarParaReenviar.isPending}
                    >
                      {bajarParaReenviar.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <PenLine className="mr-2 h-4 w-4" />
                      )}
                      {bajarParaReenviar.isPending ? t("mail.fwd.fetching") : t("mail.editDraft")}
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
                      {/* La carita de la barra, como Gmail: después de Reenviar. */}
                      <BotonReaccionar
                        variante="pildora"
                        puede={puedeReaccionar(sel, miCorreo)}
                        enviando={reaccionar.isPending}
                        onElegir={(emoji) => reaccionarA(sel, emoji)}
                      />
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
          onVerProgramados={() => irACarpeta(CARPETA_PROGRAMADOS)}
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
      {/* Montado SOLO abierto: lee la lista de conversaciones del Messenger. */}
      {compartiendo && (
        <CompartirEnChatDialog correo={compartiendo} onCerrar={() => setCompartiendo(null)} />
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
function FilaPlegada({
  m, abrir, menu,
}: {
  m: MailSummary;
  abrir: (m: MailSummary) => void;
  /** El ⋮ del mensaje. Va AL LADO del botón que lo abre, no adentro: un botón
   *  dentro de otro es HTML inválido que el navegador desarma. */
  menu?: ReactNode;
}) {
  const formatoUi = useFormato();
  return (
    <div className="group flex min-w-0 items-center gap-1">
    <button
      type="button"
      onClick={() => abrir(m)}
      className="flex w-full min-w-0 flex-1 items-center gap-3 rounded-control px-2 py-2.5 text-left transition-colors hover:bg-muted/50"
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
    {menu}
    </div>
  );
}

/** Los otros mensajes de la conversación, apilados como en Gmail: el primero,
 *  el medio resumido en una pastilla que se despliega, y los últimos. */
function TiraDeHilo({
  mensajes, abrir, menu, className,
}: {
  mensajes: MailSummary[];
  abrir: (m: MailSummary) => void;
  /** El ⋮ de cada mensaje plegado: se usa sin tener que abrirlo antes. */
  menu?: (m: MailSummary) => ReactNode;
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
          <FilaPlegada m={m} abrir={abrir} menu={menu?.(m)} />
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
  onArrastrar,
  onFinArrastre,
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
  /** Arrastrar la fila (o la selección, si la fila está en ella) hasta una
   *  carpeta o etiqueta de la columna = «Mover a». */
  onArrastrar?: (e: DragEvent) => void;
  onFinArrastre?: () => void;
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
  const { t } = useLanguage();
  // Con varios destinatarios ("a@x, b@y") se muestra el primero.
  const quien = mostrarDestinatario ? (m.to || m.from).split(",")[0] : m.from;
  const nombre = nombreDe(quien);
  const enConversacion = (enHilo ?? 1) > 1;
  const sinLeer = hiloSinLeer ?? m.unread;
  return (
    <div
      draggable={!!onArrastrar}
      onDragStart={onArrastrar}
      onDragEnd={onFinArrastre}
      data-testid="fila-correo"
      className={cn(
        // Cada conversación como TARJETA LIMPIA (look final aprobado): superficie
        // frost pareja, SIN barra lateral. El no-leído se marca con punto morado
        // + negrita; el seleccionado con aro morado. El círculo de selección
        // aparece solo al pasar el mouse.
        // UN SOLO TONO (Alvaro, 18/11/2026: «ese diseño de 2 tonos se ve mal»):
        // el color va en la tarjeta entera; el botón de adentro no pinta nada.
        "group relative flex items-center gap-1 rounded-2xl border border-border/40 pl-2 transition-colors",
        seleccionado ? "border-primary/30 bg-primary/10 ring-1 ring-primary/30"
          : activo ? "bg-primary/10"
          : sinLeer ? "bg-primary/[0.07] hover:bg-primary/[0.1]"
          : "bg-card/50 hover:bg-primary/5",
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
          // El círculo aparece solo al pasar el mouse (look final): la lista se
          // ve limpia. En táctil queda tenue para poder seleccionar.
          seleccionado ? "opacity-100" : "opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-60",
        )}
      />
    <button
      onClick={onClick}
      onMouseEnter={onPrecargar}
      onFocus={onPrecargar}
      onTouchStart={onPrecargar}
      className={cn(
        "relative flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left transition-all duration-150",
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
            {asuntoVisible(asuntoDelHilo || m.subject, t)}
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

/** El asunto como se muestra: sin asunto (vacío o el marcador que guarda el
 *  servidor) se dice en el idioma de quien mira. */
function asuntoVisible(asunto: string | undefined, t: ReturnType<typeof useLanguage>["t"]): string {
  return !asunto || asunto === SIN_ASUNTO ? t("mail.noSubject") : asunto;
}

/** Solo traduce el marcador del servidor: un asunto vacío se queda vacío
 *  (el título del correo abierto nunca dijo «sin asunto» por un ''). */
function marcadorSinAsunto(asunto: string, t: ReturnType<typeof useLanguage>["t"]): string {
  return asunto === SIN_ASUNTO ? t("mail.noSubject") : asunto;
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
  const { t } = useLanguage();
  const formatoUi = useFormato();
  const boton = "inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30";
  return (
    <div className="ml-auto flex items-center gap-0.5">
      <span className={cn("mr-1 text-xs tabular-nums text-muted-foreground", cargando && "opacity-60")}>
        {t("mail.page.of", {
          range: total === 0 ? "0" : `${desde}–${Math.max(desde, hasta)}`,
          total: total.toLocaleString(formatoUi.intl("es-ES")),
        })}
      </span>
      <button type="button" className={boton} onClick={onAnterior} disabled={!onAnterior} aria-label={t("mail.page.newer")} title={t("mail.page.newer")}>
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button type="button" className={boton} onClick={onSiguiente} disabled={!onSiguiente} aria-label={t("mail.page.older")} title={t("mail.page.older")}>
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

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
