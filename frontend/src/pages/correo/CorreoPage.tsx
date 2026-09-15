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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import AdjuntoVisor, { tipoDeAdjunto } from "@/components/correo/AdjuntoVisor";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/EmptyState";
import { MailBody } from "@/components/correo/MailBody";
import { MailComposer, type BorradorInicial } from "@/components/correo/MailComposer";
import { MailSignatureDialog } from "@/components/correo/MailSignatureDialog";
import {
  useMailbox,
  useMailFolders,
  useMailMessage,
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
} from "@/hooks/useMailbox";
import { destinatariosRespuesta, direccionesDe, participantesDe, tieneVariosInvolucrados } from "@/lib/mailAddr";
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
function fechaCorta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  if (isToday(d)) return format(d, "HH:mm");
  if (isThisYear(d)) return format(d, "d MMM", { locale: es });
  return format(d, "d MMM yy", { locale: es });
}

function fechaLarga(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
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
  const mensaje = useMailMessage(carpeta, sel);
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
    delete: (n) => carpeta === "Papelera"
      ? `${n} ${n === 1 ? "correo eliminado" : "correos eliminados"} definitivamente`
      : `${n} ${n === 1 ? "correo movido" : "correos movidos"} a la Papelera`,
  };
  const ejecutarMasiva = (op: OperacionMasiva, items: MailSummary[]) => {
    const elegidos = items.filter((m) => seleccion.has(claveDe(m)));
    if (!elegidos.length) return;
    // Confirmar SIEMPRE que se borra, no solo en Papelera: mover a la
    // Papelera es recuperable, pero un clic accidental en una lista con
    // veinte correos seleccionados no lo parece cuando pasa (pedido de Jhon).
    if (op === "delete") { setConfirmarBorrado(elegidos); return; }
    lanzarMasiva(op, elegidos);
  };
  const lanzarMasiva = (op: OperacionMasiva, elegidos: MailSummary[]) => {
    const n = elegidos.length;
    if (sel && elegidos.some((m) => claveDe(m) === claveDe(sel)) && op !== "seen" && op !== "unseen") setSel(null);
    setSeleccion(new Set());
    masiva.mutate(
      { folder: carpeta, op, items: elegidos },
      {
        onSuccess: (r) => {
          toast.success(NOMBRE_OP[op](n - (r.omitidos ?? 0)), {
            description: r.omitidos ? `${r.omitidos} sin identificador: vuelve a abrir la carpeta e inténtalo.` : undefined,
          });
        },
        onError: (e) => toast.error((e as Error).message || "No se pudo aplicar la acción"),
      },
    );
  };
  const items = enBusqueda ? (resultados.data?.messages ?? []) : mensajes;
  const cargandoItems = enBusqueda ? resultados.isFetching : lista.isLoading;
  const errorItems = enBusqueda ? resultados.error : lista.error;

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
    if (m.unread) marcarLeido.mutate({ folder: carpeta, m });
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
      citar: {
        de: nombreDe(m.from),
        fecha: fechaLarga(m.date),
        texto: (m.text ?? "").slice(0, 4000),
      },
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
            const activa = f === carpeta;
            return (
              <button
                key={f}
                onClick={() => setCarpeta(f)}
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
              const activa = f === carpeta;
              return (
                <button
                  key={f}
                  onClick={() => setCarpeta(f)}
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
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
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
                      <AccionBarra icono={Clock} etiqueta="Posponer" pronto />
                      <AccionBarra icono={FolderInput} etiqueta="Mover a" pronto />
                      <AccionBarra icono={Tag} etiqueta="Etiquetar" pronto />
                    </div>
                    <button
                      type="button"
                      onClick={() => setSeleccion(new Set())}
                      className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                    >
                      Quitar selección
                    </button>
                  </>
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
              {items.map((m) => (
                <FilaMensaje
                  key={claveDe(m)}
                  m={m}
                  activo={sel ? claveDe(m) === claveDe(sel) : false}
                  seleccionado={seleccion.has(claveDe(m))}
                  onToggleSeleccion={() => toggleSeleccion(m)}
                  onClick={() => abrir(m)}
                  onPrecargar={() => precargar(carpeta, m)}
                  mostrarDestinatario={carpeta === "Enviado" || carpeta === "Borrador"}
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
                <h2 className="text-xl font-semibold leading-snug tracking-tight sm:text-2xl">
                  {mensaje.data.subject}
                </h2>

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
                    {fechaCorta(mensaje.data.date)}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
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
                    </>
                  )}
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
                                { folder: carpeta, uid, index: i, filename: a.filename },
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
                    html={mensaje.data.html}
                    text={mensaje.data.text}
                    remoteImages={mensaje.data.remote_images}
                    truncated={mensaje.data.truncated}
                  />
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
            { folder: carpeta, uid, index: i, filename: a.filename },
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
    </div>
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
}) {
  // Con varios destinatarios ("a@x, b@y") se muestra el primero.
  const quien = mostrarDestinatario ? (m.to || m.from).split(",")[0] : m.from;
  const nombre = nombreDe(quien);
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
          : !seleccionado && "hover:bg-primary/5",
        m.unread && !activo && !seleccionado && "bg-primary/[0.04]",
      )}
    >
      <UserAvatar name={nombre} size="md" className={cn("shrink-0", activo && "ring-2 ring-primary/20")} />

      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-baseline justify-between gap-2">
          <span
            className={cn(
              "truncate text-sm",
              m.unread ? "font-bold text-foreground" : "font-medium text-foreground",
            )}
          >
            {mostrarDestinatario && (
              <span className="font-normal text-muted-foreground">Para </span>
            )}
            {nombre}
          </span>
          <span
            className={cn(
              "shrink-0 text-[10px]",
              m.unread ? "font-semibold text-primary" : "text-muted-foreground",
            )}
          >
            {fechaCorta(m.date)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {m.unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
          <span
            className={cn(
              "truncate text-[13px]",
              m.unread ? "font-medium text-foreground/90" : "text-muted-foreground",
            )}
          >
            {m.subject || "(sin asunto)"}
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
