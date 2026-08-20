import { useEffect, useState } from "react";
import { formatDistanceToNow, format, isToday, isThisYear } from "date-fns";
import { es } from "date-fns/locale";
import {
  AlertTriangle,
  ArrowLeft,
  Inbox,
  Loader2,
  Mail,
  Paperclip,
  PenSquare,
  RefreshCw,
  Reply,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
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
 * MÓVIL PRIMERO, a propósito: Maven es una PWA y buena parte del equipo la
 * usa desde el teléfono. En pantalla chica se ve una sola columna por vez
 * (carpetas → lista → mensaje) y se vuelve con la flecha; recién en
 * escritorio aparecen las tres a la vez.
 */

/** Nombres que muestra el servidor vs. los que entiende la gente. */
const NOMBRE_CARPETA: Record<string, string> = {
  INBOX: "Recibidos",
  Enviado: "Enviados",
  Borrador: "Borradores",
  "Correo no deseado": "Spam",
  Papelera: "Papelera",
  Archive: "Archivados",
  Notification: "Notificaciones",
  Newsletter: "Boletines",
  Plantillas: "Plantillas",
  Snoozed: "Pospuestos",
};

function nombreCarpeta(f: string): string {
  return NOMBRE_CARPETA[f] ?? f;
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
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
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
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
          <Mail className="h-7 w-7 text-muted-foreground" />
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
      <div className="flex items-center gap-3 border-b px-4 py-3">
        {/* En móvil la flecha es la única forma de volver de un mensaje. */}
        {!enLista && (
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setSeq(null)}
            aria-label="Volver a la lista"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold tracking-tight">Correo</h1>
          <p className="truncate text-sm text-muted-foreground">{buzon.email_address}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => lista.refetch()}
          disabled={lista.isFetching}
          aria-label="Actualizar"
        >
          <RefreshCw className={cn("h-4 w-4", lista.isFetching && "animate-spin")} />
        </Button>
        <Button onClick={() => setRedactar({})} size="sm">
          <PenSquare className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Redactar</span>
        </Button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Carpetas: ocultas en móvil, donde la bandeja es lo que importa. */}
        <nav className="hidden w-48 shrink-0 border-r p-2 lg:block">
          {carpetas.isLoading && (
            <div className="p-2 text-sm text-muted-foreground">Cargando…</div>
          )}
          {(carpetas.data ?? []).map((f) => (
            <button
              key={f}
              onClick={() => setCarpeta(f)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                f === carpeta
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50",
              )}
            >
              {f === "INBOX" && <Inbox className="h-4 w-4 shrink-0" />}
              <span className="truncate">{nombreCarpeta(f)}</span>
            </button>
          ))}
        </nav>

        {/* Lista */}
        <div
          className={cn(
            "min-w-0 flex-col border-r md:flex md:w-80 md:shrink-0 lg:w-96",
            enLista ? "flex flex-1" : "hidden",
          )}
        >
          {/* Selector de carpeta para pantallas sin la columna lateral. */}
          <div className="border-b p-2 lg:hidden">
            <select
              value={carpeta}
              onChange={(e) => setCarpeta(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              aria-label="Carpeta"
            >
              {(carpetas.data ?? [carpeta]).map((f) => (
                <option key={f} value={f}>
                  {nombreCarpeta(f)}
                </option>
              ))}
            </select>
          </div>

          <ScrollArea className="flex-1">
            {lista.isLoading && (
              <div className="flex justify-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            )}
            {lista.error && (
              <Aviso
                titulo="No se pudieron traer los mensajes"
                detalle={(lista.error as Error).message}
              />
            )}
            {!lista.isLoading && !lista.error && mensajes.length === 0 && (
              <p className="px-4 py-12 text-center text-sm text-muted-foreground">
                No hay correos en {nombreCarpeta(carpeta)}.
              </p>
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
          </ScrollArea>
        </div>

        {/* Lectura */}
        <div className={cn("min-w-0 flex-1", enLista ? "hidden md:block" : "block")}>
          {seq === null ? (
            <div className="hidden h-full flex-col items-center justify-center gap-2 text-muted-foreground md:flex">
              <Mail className="h-8 w-8" />
              <p className="text-sm">Elegí un correo para leerlo.</p>
            </div>
          ) : mensaje.isLoading ? (
            <div className="flex justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : mensaje.error ? (
            <Aviso
              titulo="No se pudo abrir el correo"
              detalle={(mensaje.error as Error).message}
            />
          ) : mensaje.data ? (
            <ScrollArea className="h-full">
              <article className="mx-auto max-w-3xl px-4 py-5 sm:px-6">
                <h2 className="text-xl font-semibold leading-snug tracking-tight">
                  {mensaje.data.subject}
                </h2>

                <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                  <span className="font-medium">{nombreDe(mensaje.data.from)}</span>
                  <span className="text-muted-foreground">
                    {correoDe(mensaje.data.from)}
                  </span>
                  <span className="ml-auto text-muted-foreground">
                    {fechaLarga(mensaje.data.date)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Para {mensaje.data.to || "(sin destinatario)"}
                  {mensaje.data.cc && ` · Copia ${mensaje.data.cc}`}
                </p>

                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="outline" onClick={responder}>
                    <Reply className="mr-2 h-4 w-4" />
                    Responder
                  </Button>
                </div>

                {mensaje.data.attachments.length > 0 && (
                  <div className="mt-4 space-y-1.5 rounded-lg border bg-muted/30 p-3">
                    {mensaje.data.attachments.map((a, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{a.filename}</span>
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                          {Math.max(1, Math.round(a.sizeBytes / 1024))} KB
                        </span>
                      </div>
                    ))}
                    <p className="pt-1 text-xs text-muted-foreground">
                      Descargar adjuntos todavía no está disponible.
                    </p>
                  </div>
                )}

                <hr className="my-5" />

                <MailBody
                  html={mensaje.data.html}
                  text={mensaje.data.text}
                  remoteImages={mensaje.data.remote_images}
                  truncated={mensaje.data.truncated}
                />
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
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full flex-col gap-0.5 border-b px-4 py-3 text-left transition-colors",
        activo ? "bg-accent" : "hover:bg-accent/50",
      )}
    >
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm",
            m.unread ? "font-semibold" : "font-medium text-muted-foreground",
          )}
        >
          {nombreDe(m.from)}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {fechaCorta(m.date)}
        </span>
      </div>
      <span
        className={cn(
          "truncate text-sm",
          m.unread ? "font-medium" : "text-muted-foreground",
        )}
      >
        {m.subject || "(sin asunto)"}
      </span>
    </button>
  );
}

function Aviso({ titulo, detalle }: { titulo: string; detalle: string }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <div className="min-w-0 space-y-1">
          <p className="font-medium">{titulo}</p>
          <p className="break-words text-sm text-muted-foreground">{detalle}</p>
        </div>
      </div>
    </div>
  );
}
