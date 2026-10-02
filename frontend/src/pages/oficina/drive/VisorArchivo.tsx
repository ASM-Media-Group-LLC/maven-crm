import { useCallback, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  ChevronLeft, ChevronRight, Download, ExternalLink, File, FileAudio, FileImage, FileSpreadsheet, FileText,
  FileVideo, Loader2, Pencil, Presentation, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";
import { abrirArchivo, type DriveItem } from "@/hooks/useDrive";
import { useEditarEnOficina } from "@/hooks/useVisorDrive";
import { tamano } from "@/lib/drive/formato";
import { destinoEnLaOficina, vistaDeArchivo, type TipoDeVista } from "@/lib/drive/tipoDeArchivo";
import type { TranslationKey } from "@/lib/i18n";
import { ContenidoDelVisor } from "./VistasDelVisor";
import { lasFlechasSonDeOtro } from "./gestos";

// EL VISOR DE ARCHIVOS DEL DRIVE (Jhon, 02/10): como la vista previa de Google
// Drive. Un clic en un archivo lo abre AQUÍ, encima de la lista, y no en otra
// pestaña: imagen, video, audio, PDF (el visor de pdf.js del correo), Word,
// Excel y PowerPoint (ONLYOFFICE en modo lectura, el de la Oficina) y texto. Lo
// demás muestra una tarjeta con Descargar. Siempre hay Descargar, y con ← → se
// pasa por los archivos de la lista que se está viendo.

const ICONO: Record<TipoDeVista, typeof File> = {
  imagen: FileImage, video: FileVideo, audio: FileAudio, pdf: FileText, texto: FileText, office: FileText, ninguno: File,
};
const ICONO_OFFICE = { docx: FileText, xlsx: FileSpreadsheet, pptx: Presentation } as const;
const EDITAR_EN: Record<"docx" | "xlsx" | "pptx", TranslationKey> = {
  docx: "drive.visor.editar.docx", xlsx: "drive.visor.editar.xlsx", pptx: "drive.visor.editar.pptx",
};

/** Lo que el navegador muestra solo en una pestaña. Es el tipo que manda el
 *  NAS (el de la ficha); HTML, SVG, XML y JS el NAS los manda SIEMPRE como
 *  descarga, así que «abrir en otra pestaña» no tendría sentido. */
function seVeEnUnaPestana(a: DriveItem, tipo: TipoDeVista): boolean {
  const m = (a.mime ?? "").toLowerCase();
  if (!["imagen", "video", "audio", "pdf", "texto"].includes(tipo)) return false;
  if (/html|svg|xml|javascript|ecmascript/.test(m)) return false;
  return /^(image|video|audio|text)\//.test(m) || /^application\/(pdf|json)/.test(m);
}

interface Props {
  /** La lista que se está viendo, tal cual (las carpetas se omiten). */
  items: DriveItem[];
  /** El id del archivo abierto, o null. */
  abierto: string | null;
  onAbierto: (id: string | null) => void;
}

export default function VisorArchivo({ items, abierto, onAbierto }: Props) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const editar = useEditarEnOficina();

  // Se pasa solo por ARCHIVOS listos, en el orden de la lista (carpetas
  // primero y por nombre, como la ve la persona).
  const archivos = useMemo(() => items.filter((i) => i.tipo === "archivo" && i.estado === "listo"), [items]);
  const indice = abierto ? archivos.findIndex((a) => a.id === abierto) : -1;
  const actual = indice >= 0 ? archivos[indice] : null;
  const anterior = indice > 0 ? archivos[indice - 1] : null;
  const siguiente = indice >= 0 && indice < archivos.length - 1 ? archivos[indice + 1] : null;

  // Si el archivo abierto deja de estar en la lista (se cambió de carpeta, o
  // alguien lo mandó a la papelera), el visor se cierra en vez de quedar
  // abierto sobre nada.
  useEffect(() => {
    if (abierto && indice < 0) onAbierto(null);
  }, [abierto, indice, onAbierto]);

  const ir = useCallback((destino: DriveItem | null) => {
    if (destino) onAbierto(destino.id);
  }, [onAbierto]);

  // ← → pasan de archivo. Esc lo maneja el diálogo (Radix).
  useEffect(() => {
    if (!actual) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (lasFlechasSonDeOtro(e)) return;
      const destino = e.key === "ArrowLeft" ? anterior : siguiente;
      if (!destino) return;
      e.preventDefault();
      ir(destino);
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [actual, anterior, siguiente, ir]);

  const descargar = useCallback(() => {
    if (actual) abrirArchivo(actual.id, true).catch((e) => toast.error((e as Error).message));
  }, [actual]);

  if (!actual) return null;

  const vista = vistaDeArchivo(actual);
  const destino = vista.tipo === "office" ? destinoEnLaOficina(actual) : null;
  const Icono = destino ? ICONO_OFFICE[destino] : ICONO[vista.tipo];
  const enPestana = seVeEnUnaPestana(actual, vista.tipo);
  // La copia sigue aunque se pase a otro archivo: el «Creando…» va solo en el
  // archivo que se está copiando.
  const copiandoEste = editar.isPending && editar.variables === actual.id;

  const copiar = () => {
    if (!destino || editar.isPending) return;
    editar.mutate(actual.id, {
      onSuccess: ({ id }) => {
        toast.success(t("drive.visor.copiaLista"));
        onAbierto(null);
        navigate(`/oficina/${id}`);
      },
      onError: (e) => toast.error(`${t("drive.visor.copiaError")}: ${(e as Error).message}`),
    });
  };

  const claseBoton = "h-9 shrink-0 rounded-full text-white/85 hover:bg-white/10 hover:text-white";

  return (
    <DialogPrimitive.Root open onOpenChange={(v) => !v && onAbierto(null)}>
      <DialogPrimitive.Portal>
        {/* El fondo también bloquea el scroll de la página de atrás. */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-[90] bg-black/90" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          // ⚠️ Un clic «afuera» NO cierra: el visor ocupa toda la pantalla y lo
          // único afuera son los avisos (toasts). Además, el segundo clic de un
          // doble clic en la lista caería sobre el visor recién abierto.
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className="fixed inset-0 z-[91] flex flex-col text-white outline-none"
        >
          <header className="flex shrink-0 items-center gap-2 px-2 py-2 sm:gap-3 sm:px-4">
            <DialogPrimitive.Close asChild>
              <Button size="icon" variant="ghost" className={claseBoton} aria-label={t("common.close")} title={t("common.close")}>
                <X className="h-5 w-5" />
              </Button>
            </DialogPrimitive.Close>
            <Icono className="hidden h-5 w-5 shrink-0 text-white/70 sm:block" />
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="truncate text-sm font-medium" title={actual.nombre}>
                {actual.nombre}
              </DialogPrimitive.Title>
              <p className="truncate text-xs text-white/60">
                {tamano(actual.size)}
                {archivos.length > 1 && ` · ${t("drive.visor.posicion", { n: indice + 1, m: archivos.length })}`}
              </p>
            </div>
            {destino && (
              <Button
                size="sm"
                variant="ghost"
                className={cn(claseBoton, "px-2 sm:px-3")}
                onClick={copiar}
                disabled={editar.isPending}
                aria-label={t(EDITAR_EN[destino])}
                title={t(EDITAR_EN[destino])}
              >
                {copiandoEste
                  ? <Loader2 className="h-4 w-4 animate-spin sm:mr-2" />
                  : <Pencil className="h-4 w-4 sm:mr-2" />}
                <span className="hidden lg:inline">{copiandoEste ? t("drive.visor.copiando") : t(EDITAR_EN[destino])}</span>
                <span className="hidden sm:inline lg:hidden">{t("drive.visor.editarCorto")}</span>
              </Button>
            )}
            {enPestana && (
              <Button
                size="icon"
                variant="ghost"
                className={claseBoton}
                onClick={() => abrirArchivo(actual.id, false).catch((e) => toast.error((e as Error).message))}
                aria-label={t("drive.visor.otraPestana")}
                title={t("drive.visor.otraPestana")}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            )}
            <Button
              size="sm"
              onClick={descargar}
              aria-label={t("drive.accion.descargar")}
              className="h-9 shrink-0 rounded-full bg-white px-3 text-black hover:bg-white/90"
            >
              <Download className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{t("drive.accion.descargar")}</span>
            </Button>
          </header>

          {/* Las flechas van en el margen (en pantallas anchas) para no tapar
              el documento ni la barra de desplazamiento. */}
          <div className="relative min-h-0 flex-1 px-2 pb-2 sm:px-16 sm:pb-4">
            <ContenidoDelVisor key={actual.id} archivo={actual} onDescargar={descargar} />
            {anterior && (
              <Flecha lado="izq" etiqueta={t("common.previous")} onClick={() => ir(anterior)} />
            )}
            {siguiente && (
              <Flecha lado="der" etiqueta={t("common.next")} onClick={() => ir(siguiente)} />
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Flecha({ lado, etiqueta, onClick }: { lado: "izq" | "der"; etiqueta: string; onClick: () => void }) {
  const Icono = lado === "izq" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={etiqueta}
      title={etiqueta}
      className={cn(
        "absolute top-1/2 z-20 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full",
        "bg-black/50 text-white/90 ring-1 ring-white/15 backdrop-blur transition-colors hover:bg-white/20",
        lado === "izq" ? "left-3" : "right-3",
      )}
    >
      <Icono className="h-6 w-6" />
    </button>
  );
}
