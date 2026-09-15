import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FileQuestion, Loader2, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { base64ABlob, base64ABytes, base64ATexto } from "@/lib/base64Blob";
import VisorPdf from "@/components/correo/VisorPdf";
import { sePuedeConvertir, useConversionAPdf } from "@/hooks/useConversionAPdf";
import {
  useAttachmentBytes,
  usePrefetchAttachment,
  type MailAttachment,
} from "@/hooks/useMailbox";
import { cn } from "@/lib/utils";

type Tipo = "pdf" | "imagen" | "texto" | "convertible" | "ninguno";

/** Qué sabe dibujar el navegador solo.
 *
 *  Se mira PRIMERO la extensión y después el `Content-Type`: por IMAP llegan
 *  muchos PDF anunciados como `application/octet-stream`, y confiar en el tipo
 *  declarado dejaría sin vista previa justo a las hojas de vida. */
export function tipoDeAdjunto(a: MailAttachment): Tipo {
  const ext = a.filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  const ct = (a.contentType || "").toLowerCase();
  if (ext === "pdf" || ct === "application/pdf") return "pdf";
  if (
    ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"].includes(ext) ||
    ct.startsWith("image/")
  ) {
    return "imagen";
  }
  if (["txt", "csv", "log", "md"].includes(ext) || ct.startsWith("text/plain")) return "texto";
  // Word, Excel y PowerPoint: el navegador no los dibuja, pero LibreOffice los
  // pasa a PDF del lado del servidor y entonces sí se leen acá.
  if (sePuedeConvertir(a.filename)) return "convertible";
  return "ninguno";
}

/** Con qué tipo se le entrega el archivo al navegador.
 *
 *  ⚠️ NO es el que declara el correo: por IMAP llegan adjuntos anunciados como
 *  `application/octet-stream`, y con ESE tipo el navegador no dibuja nada.
 *  Le mandamos el que corresponde a lo que detectamos por extensión. */
function mimeParaVer(tipo: Tipo, a: MailAttachment, declarado: string): string {
  if (tipo === "imagen") {
    if (declarado.toLowerCase().startsWith("image/")) return declarado;
    const ext = a.filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
    const porExtension: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      bmp: "image/bmp",
      svg: "image/svg+xml",
      avif: "image/avif",
    };
    return porExtension[ext] ?? "application/octet-stream";
  }
  return declarado || "application/octet-stream";
}

function pesoLegible(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

interface Props {
  /** Índice abierto dentro de `adjuntos`, o null si el visor está cerrado. */
  indice: number | null;
  onIndice: (i: number | null) => void;
  adjuntos: MailAttachment[];
  carpeta: string;
  uid: number | null;
  /** Descarga el adjunto en la posición dada (el botón sigue existiendo acá
   *  adentro: ver sin bajar es una comodidad, no un candado). */
  onDescargar: (i: number) => void;
  descargando: boolean;
}

export default function AdjuntoVisor({
  indice,
  onIndice,
  adjuntos,
  carpeta,
  uid,
  onDescargar,
  descargando,
}: Props) {
  const abierto = indice != null && indice >= 0 && indice < adjuntos.length;
  const actual = abierto ? adjuntos[indice] : null;
  const tipo = actual ? tipoDeAdjunto(actual) : "ninguno";
  const sePuedeVer = tipo !== "ninguno";

  const prefetch = usePrefetchAttachment();

  // Solo pedimos los bytes de lo que se puede mostrar — dibujándolo acá o
  // convirtiéndolo antes. Bajar un .zip de 40 MB para después decir "no se
  // puede ver" es gastar una sesión IMAP al pedo.
  const bytes = useAttachmentBytes({
    folder: carpeta,
    uid,
    index: indice,
    enabled: abierto && sePuedeVer,
  });

  const hayAnterior = abierto && indice > 0;
  const haySiguiente = abierto && indice < adjuntos.length - 1;

  // Dejamos listo el siguiente mientras se lee el actual — pero solo si también
  // se puede ver, por lo mismo de arriba.
  useEffect(() => {
    if (!abierto || uid == null || !haySiguiente) return;
    const sig = indice + 1;
    if (tipoDeAdjunto(adjuntos[sig]) === "ninguno") return;
    prefetch(carpeta, uid, sig);
  }, [abierto, indice, uid, carpeta, adjuntos, haySiguiente, prefetch]);

  // Flechas del teclado: con 30 hojas de vida, ir al mouse en cada una cansa.
  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" && haySiguiente) onIndice(indice + 1);
      if (e.key === "ArrowLeft" && hayAnterior) onIndice(indice - 1);
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [abierto, indice, hayAnterior, haySiguiente, onIndice]);

  // ⚠️ El revocado va DIFERIDO. Al pasar al archivo siguiente, el iframe sigue
  // mostrando el blob anterior durante el render en que cambia el estado:
  // revocarlo en ese instante deja al visor de PDF de Chrome en blanco, y no
  // solo para ese archivo. Es el mismo motivo por el que `dispararDescarga`
  // difiere el suyo. 10 s alcanza de sobra y el blob igual muere con la pestaña.
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const d = bytes.data;
    if (!d || !actual || tipo !== "imagen") {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(
      base64ABlob(d.contentBase64, mimeParaVer(tipo, actual, d.contentType)),
    );
    setUrl(u);
    return () => {
      setTimeout(() => URL.revokeObjectURL(u), 10_000);
    };
  }, [bytes.data, tipo, actual]);

  // El PDF lo dibuja pdf.js desde los bytes; no necesita blob ni URL.
  const bytesPdf = useMemo(
    () => (tipo === "pdf" && bytes.data ? base64ABytes(bytes.data.contentBase64) : null),
    [tipo, bytes.data],
  );

  // Word/Excel/PowerPoint: se manda a convertir y se dibuja el PDF que vuelve.
  // La espera se paga una sola vez por archivo: el resultado queda guardado.
  const conversion = useConversionAPdf({
    filename: actual?.filename ?? "",
    contentBase64: bytes.data?.contentBase64,
    enabled: abierto && tipo === "convertible",
  });

  // El PDF convertido llega como URL firmada; se baja para dibujarlo con el
  // mismo visor que el resto, y no con un <iframe> que Chrome deja en blanco.
  const pdfConvertido = useQuery({
    queryKey: ["pdf-convertido", conversion.data],
    enabled: !!conversion.data,
    staleTime: Infinity,
    queryFn: async (): Promise<Uint8Array> => {
      const r = await fetch(conversion.data!);
      if (!r.ok) throw new Error("No se pudo traer el documento convertido");
      return new Uint8Array(await r.arrayBuffer());
    },
  });

  const texto = useMemo(
    () => (tipo === "texto" && bytes.data ? base64ATexto(bytes.data.contentBase64) : null),
    [tipo, bytes.data],
  );

  if (!abierto || !actual) return null;

  return (
    <Dialog open onOpenChange={(v) => !v && onIndice(null)}>
      <DialogContent
        // Sin anillo de foco en el contenedor: el diálogo no es un control y el
        // anillo ámbar alrededor del modal entero se lee como un error. Los
        // botones de adentro conservan el suyo.
        className="flex h-[88vh] max-w-5xl flex-col gap-0 overflow-hidden p-0 focus:outline-none"
        // El título y la X propios ya nombran y cierran el diálogo.
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-border/60 px-4 py-3">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-sm font-medium" title={actual.filename}>
              {actual.filename}
            </DialogTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {pesoLegible(actual.sizeBytes)}
              {adjuntos.length > 1 && ` · ${indice + 1} de ${adjuntos.length}`}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 rounded-full"
            onClick={() => onDescargar(indice)}
            disabled={descargando}
          >
            {descargando ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Descargar
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0 rounded-full"
            onClick={() => onIndice(null)}
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="relative min-h-0 flex-1 bg-muted/30">
          {!sePuedeVer ? (
            <Mensaje
              icono={<FileQuestion className="h-8 w-8 text-muted-foreground" />}
              titulo="Este archivo no se puede ver aquí"
              detalle="Se pueden ver acá los PDF, las imágenes, el texto y los documentos de Office. Este hay que descargarlo y abrirlo con el programa que le corresponde."
              accion={
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => onDescargar(indice)}
                  disabled={descargando}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Descargar {actual.filename}
                </Button>
              }
            />
          ) : bytes.isPending ? (
            <Mensaje
              icono={<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />}
              titulo="Abriendo el archivo…"
              detalle="Se está trayendo del servidor de correo."
            />
          ) : bytes.isError ? (
            <Mensaje
              icono={<FileQuestion className="h-8 w-8 text-destructive" />}
              titulo="No se pudo abrir el archivo"
              detalle={(bytes.error as Error)?.message || "El servidor de correo no respondió."}
              accion={
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => void bytes.refetch()}
                >
                  Reintentar
                </Button>
              }
            />
          ) : tipo === "texto" ? (
            <pre className="h-full overflow-auto whitespace-pre-wrap break-words bg-background p-5 font-mono text-xs leading-relaxed">
              {texto}
            </pre>
          ) : tipo === "imagen" && url ? (
            <div className="flex h-full items-center justify-center overflow-auto p-4">
              <img src={url} alt={actual.filename} className="max-h-full max-w-full object-contain" />
            </div>
          ) : tipo === "convertible" ? (
            pdfConvertido.data ? (
              <VisorPdf key={indice} bytes={pdfConvertido.data} nombre={actual.filename} />
            ) : conversion.isError || pdfConvertido.isError ? (
              <Mensaje
                icono={<FileQuestion className="h-8 w-8 text-destructive" />}
                titulo="No se pudo preparar la vista"
                detalle={
                  ((conversion.error ?? pdfConvertido.error) as Error)?.message ||
                  "El conversor no respondió."
                }
                accion={
                  <Button size="sm" variant="outline" className="rounded-full"
                    onClick={() => onDescargar(indice)} disabled={descargando}>
                    <Download className="mr-2 h-4 w-4" />
                    Descargar {actual.filename}
                  </Button>
                }
              />
            ) : (
              <Mensaje
                icono={<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />}
                titulo="Preparando la vista…"
                detalle="Los documentos de Office se convierten para poder leerlos acá. Se hace una sola vez por archivo."
              />
            )
          ) : bytesPdf ? (
            <VisorPdf key={indice} bytes={bytesPdf} nombre={actual.filename} />
          ) : null}

          {hayAnterior && (
            <FlechaLateral lado="izq" onClick={() => onIndice(indice - 1)} />
          )}
          {haySiguiente && (
            <FlechaLateral lado="der" onClick={() => onIndice(indice + 1)} />
          )}
        </div>

        {adjuntos.length > 1 && (
          <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border/60 px-4 py-2.5">
            <Button
              size="sm"
              variant="ghost"
              className="rounded-full"
              disabled={!hayAnterior}
              onClick={() => onIndice(indice - 1)}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Anterior
            </Button>
            <span className="text-xs tabular-nums text-muted-foreground">
              {indice + 1} / {adjuntos.length}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="rounded-full"
              disabled={!haySiguiente}
              onClick={() => onIndice(indice + 1)}
            >
              Siguiente
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </footer>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FlechaLateral({ lado, onClick }: { lado: "izq" | "der"; onClick: () => void }) {
  const Icono = lado === "izq" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={lado === "izq" ? "Anterior" : "Siguiente"}
      className={cn(
        "absolute top-1/2 z-10 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full",
        "border border-border/60 bg-background/90 text-foreground shadow-sm backdrop-blur",
        "transition-opacity hover:bg-background",
        lado === "izq" ? "left-3" : "right-3",
      )}
    >
      <Icono className="h-5 w-5" />
    </button>
  );
}

function Mensaje({
  icono,
  titulo,
  detalle,
  accion,
}: {
  icono: React.ReactNode;
  titulo: string;
  detalle: string;
  accion?: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      {icono}
      <p className="text-sm font-medium">{titulo}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{detalle}</p>
      {accion}
    </div>
  );
}
