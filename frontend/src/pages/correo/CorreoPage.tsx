import { useEffect, useState } from "react";
import { format, isToday, isThisYear } from "date-fns";
import { es } from "date-fns/locale";
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  Bell,
  Clock,
  FileText,
  Inbox,
  Mail,
  Newspaper,
  Paperclip,
  PenLine,
  PenSquare,
  RefreshCw,
  Reply,
  Send,
  ShieldAlert,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { avatarGradient } from "@/lib/avatarColor";
import { MailBody } from "@/components/correo/MailBody";
import { MailComposer, type BorradorInicial } from "@/components/correo/MailComposer";
import {
  useMailbox,
  useMailFolders,
  useMailMessage,
  useMailMessages,
  correoDe,
  nombreDe,
  type MailSummary,
} from "@/hooks/useMailbox";

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

/** Iniciales para el avatar. Local a propósito: la de Messenger vive en
 *  `pages/messenger/utils` y importarla acoplaría las dos pantallas. */
function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  return partes.map((p) => p[0]).join("").slice(0, 2).toUpperCase();
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

export default function CorreoPage() {
  const { data: buzon, isLoading: cargandoBuzon, error: errorBuzon } = useMailbox();
  const hayBuzon = !!buzon?.is_active;

  const [carpeta, setCarpeta] = useState("INBOX");
  const [seq, setSeq] = useState<number | null>(null);
  const [redactar, setRedactar] = useState<BorradorInicial | null>(null);

  const carpetas = useMailFolders(hayBuzon);
  const lista = useMailMessages(carpeta, hayBuzon);
  const mensaje = useMailMessage(carpeta, seq);

  // Al cambiar de carpeta el mensaje abierto ya no corresponde: los números
  // de secuencia son por carpeta, así que dejarlo abriría OTRO correo.
  useEffect(() => {
    setSeq(null);
  }, [carpeta]);

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
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-accent/15 to-primary/15">
          <Mail className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Todavía no tenés casilla
        </h1>
        <p className="mx-auto mt-3 max-w-md text-muted-foreground">
          Tu cuenta de correo se crea junto con tu usuario de Maven. Pedile a
          un administrador que la active y esta pantalla se llena sola.
        </p>
      </div>
    );
  }

  const mensajes = lista.data?.messages ?? [];
  const enLista = seq === null;

  const responder = () => {
    const m = mensaje.data;
    if (!m) return;
    // El `Message-ID` no viene con el cuerpo, sí con el resumen de la lista.
    // Sin él la respuesta le aparece suelta al otro, fuera de la conversación.
    const messageId = mensajes.find((x) => x.seq === m.seq)?.messageId;
    setRedactar({
      to: correoDe(m.from),
      subject: /^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject}`,
      inReplyTo: messageId || undefined,
      citar: {
        de: nombreDe(m.from),
        fecha: fechaLarga(m.date),
        texto: (m.text ?? "").slice(0, 4000),
      },
    });
  };

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
            onClick={() => setSeq(null)}
            aria-label="Volver a la lista"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold tracking-tight">Correo</h1>
          <p className="truncate text-xs text-muted-foreground">{buzon.email_address}</p>
        </div>
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
        <nav className="hidden w-52 shrink-0 border-r border-border/60 p-2 lg:block">
          <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Carpetas
          </p>
          {carpetas.isLoading &&
            [...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-2.5 px-3 py-2">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-3.5 w-24" />
              </div>
            ))}
          {(carpetas.data ?? []).map((f) => {
            const Icono = iconoCarpeta(f);
            const activa = f === carpeta;
            return (
              <button
                key={f}
                onClick={() => setCarpeta(f)}
                className={cn(
                  "relative flex w-full items-center gap-2.5 rounded-2xl px-3 py-2 text-left text-sm transition-colors",
                  activa
                    ? "bg-primary/12 font-medium text-foreground before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r before:bg-gradient-to-b before:from-accent before:to-primary"
                    : "text-muted-foreground hover:bg-primary/5 hover:text-foreground",
                )}
              >
                <Icono className={cn("h-4 w-4 shrink-0", activa && "text-primary")} />
                <span className="truncate">{nombreCarpeta(f)}</span>
              </button>
            );
          })}
        </nav>

        {/* Lista */}
        <div
          className={cn(
            "min-w-0 flex-col border-r border-border/60 md:flex md:w-80 md:shrink-0 lg:w-96",
            enLista ? "flex flex-1" : "hidden",
          )}
        >
          {/* Carpetas como píldoras cuando no está la columna lateral —
              mismo patrón que los filtros de Messenger. */}
          <div className="scrollbar-hide flex gap-1.5 overflow-x-auto border-b border-border/60 px-3 py-2 lg:hidden">
            {(carpetas.data ?? [carpeta]).map((f) => {
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

          <ScrollArea className="flex-1">
            <div className="space-y-0.5 p-2">
              {lista.isLoading &&
                [...Array(6)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-2.5 py-2.5">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-2/5" />
                      <Skeleton className="h-3 w-4/5" />
                    </div>
                  </div>
                ))}
              {lista.error && (
                <Aviso
                  titulo="No se pudieron traer los mensajes"
                  detalle={(lista.error as Error).message}
                />
              )}
              {!lista.isLoading && !lista.error && mensajes.length === 0 && (
                <VacioSuave
                  icono={iconoCarpeta(carpeta)}
                  texto={`No hay correos en ${nombreCarpeta(carpeta)}.`}
                />
              )}
              {/* El servidor entrega del más viejo al más nuevo; arriba va lo
                  último que llegó, que es lo que la gente busca. */}
              {[...mensajes].reverse().map((m) => (
                <FilaMensaje
                  key={m.seq}
                  m={m}
                  activo={m.seq === seq}
                  onClick={() => setSeq(m.seq)}
                />
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Lectura */}
        <div className={cn("min-w-0 flex-1", enLista ? "hidden md:block" : "block")}>
          {seq === null ? (
            <div className="hidden h-full flex-col items-center justify-center gap-3 md:flex">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-accent/10 to-primary/10">
                <Mail className="h-7 w-7 text-primary/70" />
              </div>
              <p className="text-sm text-muted-foreground">Elegí un correo para leerlo.</p>
            </div>
          ) : mensaje.isLoading ? (
            <div className="mx-auto max-w-3xl space-y-4 px-4 py-6 sm:px-6">
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
            <ScrollArea className="h-full">
              <article className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
                <h2 className="text-xl font-semibold leading-snug tracking-tight sm:text-2xl">
                  {mensaje.data.subject}
                </h2>

                <div className="mt-4 flex items-start gap-3">
                  <Avatar className="h-11 w-11 shrink-0">
                    <AvatarFallback
                      className={cn(
                        "bg-gradient-to-br text-sm font-bold text-white",
                        avatarGradient(correoDe(mensaje.data.from)),
                      )}
                    >
                      {iniciales(nombreDe(mensaje.data.from))}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium">{nombreDe(mensaje.data.from)}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {correoDe(mensaje.data.from)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      Para {mensaje.data.to || "(sin destinatario)"}
                      {mensaje.data.cc && ` · Copia ${mensaje.data.cc}`}
                    </p>
                  </div>
                  <span className="shrink-0 pt-1 text-xs text-muted-foreground">
                    {fechaCorta(mensaje.data.date)}
                  </span>
                </div>

                <div className="mt-4 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    onClick={responder}
                  >
                    <Reply className="mr-2 h-4 w-4" />
                    Responder
                  </Button>
                </div>

                {mensaje.data.attachments.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {mensaje.data.attachments.map((a, i) => (
                      <span
                        key={i}
                        className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-primary/5 px-3 py-1.5 text-xs"
                        title="Descargar adjuntos todavía no está disponible."
                      >
                        <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{a.filename}</span>
                        <span className="shrink-0 text-muted-foreground">
                          {Math.max(1, Math.round(a.sizeBytes / 1024))} KB
                        </span>
                      </span>
                    ))}
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

      {redactar && (
        <MailComposer
          abierto
          onCerrar={() => setRedactar(null)}
          inicial={redactar}
          remitente={buzon.email_address}
        />
      )}
    </div>
  );
}

function FilaMensaje({
  m,
  activo,
  onClick,
}: {
  m: MailSummary;
  activo: boolean;
  onClick: () => void;
}) {
  const nombre = nombreDe(m.from);
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex w-full items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left transition-all duration-150",
        activo
          ? "bg-primary/12 before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r before:bg-gradient-to-b before:from-accent before:to-primary"
          : "hover:bg-primary/5",
        m.unread && !activo && "bg-primary/[0.04]",
      )}
    >
      <Avatar className={cn("h-10 w-10 shrink-0", activo && "ring-2 ring-primary/20")}>
        <AvatarFallback
          className={cn(
            "bg-gradient-to-br text-xs font-bold text-white",
            avatarGradient(correoDe(m.from)),
          )}
        >
          {iniciales(nombre)}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-baseline justify-between gap-2">
          <span
            className={cn(
              "truncate text-sm",
              m.unread ? "font-bold text-foreground" : "font-medium text-foreground",
            )}
          >
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
      </div>
    </button>
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
