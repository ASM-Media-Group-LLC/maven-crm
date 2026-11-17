import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Download, FileAudio, FileQuestion, Loader2 } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import VisorPdf from "@/components/correo/VisorPdf";
import { useEditorDeOffice } from "@/hooks/useOnlyOffice";
import { useLanguage } from "@/hooks/useLanguage";
import {
  useFirmaDelArchivo, useSvgComoImagen, useTextoDelArchivo, useUrlDelArchivo, useVistaEnOffice,
} from "@/hooks/useVisorDrive";
import { cn } from "@/lib/utils";
import { tamano } from "@/lib/drive/formato";
import { hayQueMirarAdentro, TOPE_OFFICE, TOPE_TEXTO, vistaConFirma, vistaDeArchivo } from "@/lib/drive/tipoDeArchivo";
import type { DriveItem } from "@/hooks/useDrive";
import { idiomaFuente } from "@/lib/idiomas";

// Lo que se ve en el medio del visor, según el tipo de archivo. Cada vista se
// monta con `key` = id del archivo (ver VisorArchivo): pasar al siguiente
// desmonta la anterior entera —el <video> deja de sonar, el editor de
// ONLYOFFICE se baja— en vez de reciclar el mismo elemento con otro archivo.

/** Las que necesitan la URL firmada del NAS (las otras no la piden: pedirla
 *  anota «abierto por última vez»). */
const CON_URL = new Set(["imagen", "video", "audio", "pdf", "texto"]);

export function ContenidoDelVisor({ archivo, onDescargar }: { archivo: DriveItem; onDescargar: () => void }) {
  const { t } = useLanguage();
  // Sin extensión y con un tipo genérico (lo importado de Google): se mira la
  // firma de los primeros bytes antes de decidir cómo se ve (Jhon, 06/10).
  const mirar = hayQueMirarAdentro(archivo);
  const url = useUrlDelArchivo(archivo.id, mirar || CON_URL.has(vistaDeArchivo(archivo).tipo));
  const firma = useFirmaDelArchivo(mirar ? url.data : undefined);
  const vista = mirar && firma.data ? vistaConFirma(archivo, firma.data) : vistaDeArchivo(archivo);
  const mirando = mirar && !firma.isError && (url.isPending || firma.isPending);
  // El navegador no supo dibujarlo (un HEIC en Chrome, un video con un códec
  // raro): se ofrece bajarlo en vez de dejar un recuadro negro.
  const [noPudo, setNoPudo] = useState(false);
  const noSePudo = useCallback(() => setNoPudo(true), []);

  const descargar = (
    <BotonDescargar onClick={onDescargar} etiqueta={t("drive.accion.descargar")} />
  );

  if (mirando) return <Cargando texto={t("drive.visor.cargando")} />;

  if (vista.tipo === "ninguno") {
    return vista.motivo === "grande" ? (
      <Aviso
        icono={<FileQuestion className="h-10 w-10 text-white/60" />}
        titulo={t("drive.visor.muyGrande")}
        detalle={t("drive.visor.muyGrandeAyuda", { tope: tamano(TOPE_OFFICE) })}
        acciones={descargar}
      />
    ) : (
      <Aviso
        icono={<FileQuestion className="h-10 w-10 text-white/60" />}
        titulo={t("drive.visor.sinVista")}
        detalle={`${archivo.nombre} · ${tamano(archivo.size)}`}
        ayuda={t("drive.visor.sinVistaAyuda")}
        acciones={descargar}
      />
    );
  }

  if (vista.tipo === "office") return <VistaOffice archivo={archivo} onDescargar={onDescargar} />;

  if (url.isPending) return <Cargando texto={t("drive.visor.cargando")} />;
  if (url.isError || !url.data) {
    return (
      <Aviso
        icono={<AlertTriangle className="h-10 w-10 text-white/60" />}
        titulo={t("drive.visor.error")}
        detalle={(url.error as Error | null)?.message || t("drive.visor.errorAyuda")}
        acciones={
          <>
            <Button size="sm" variant="ghost" className="rounded-full text-white hover:bg-white/10 hover:text-white"
              onClick={() => void url.refetch()}>
              {t("common.retry")}
            </Button>
            {descargar}
          </>
        }
      />
    );
  }

  if (noPudo) {
    return (
      <Aviso
        icono={<FileQuestion className="h-10 w-10 text-white/60" />}
        titulo={t("drive.visor.navegadorNoPuede")}
        detalle={t("drive.visor.navegadorNoPuedeAyuda")}
        acciones={descargar}
      />
    );
  }

  switch (vista.tipo) {
    case "imagen":
      return vista.esSvg
        ? <ImagenSvg url={url.data} archivo={archivo} onFallo={noSePudo} />
        : (
          <div className="flex h-full w-full items-center justify-center">
            <img
              src={url.data}
              alt={archivo.nombre}
              decoding="async"
              onError={noSePudo}
              className="max-h-full max-w-full select-none object-contain"
            />
          </div>
        );
    case "video":
      return (
        <div className="flex h-full w-full items-center justify-center">
          {/* `controls` y nada más: los del navegador ya traen volumen,
              velocidad y pantalla completa. Adelantar funciona porque el NAS
              contesta 206 a los pedidos por Range. */}
          <video
            src={url.data}
            controls
            playsInline
            preload="metadata"
            onError={noSePudo}
            className="max-h-full max-w-full rounded-panel bg-black"
          />
        </div>
      );
    case "audio":
      return (
        <div className="flex h-full w-full items-center justify-center p-4">
          <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-card bg-white/5 p-8 text-center">
            <FileAudio className="h-12 w-12 text-white/70" />
            <p className="max-w-full truncate text-sm font-medium text-white">{archivo.nombre}</p>
            <audio src={url.data} controls preload="metadata" onError={noSePudo} className="w-full" />
          </div>
        </div>
      );
    case "pdf":
      return (
        <Hoja>
          <VisorPdf url={url.data} nombre={archivo.nombre} />
        </Hoja>
      );
    case "texto":
      return <VistaTexto url={url.data} archivo={archivo} onDescargar={onDescargar} />;
  }
}

/** Un panel claro/oscuro (el del tema de Maven) sobre el fondo negro del
 *  visor, para lo que se lee: PDF, texto y documentos. Un documento de Office
 *  usa todo el ancho (una hoja de cálculo lo aprovecha); un PDF o un texto, un
 *  ancho de lectura. */
function Hoja({ children, completa = false }: { children: ReactNode; completa?: boolean }) {
  return (
    <div className={cn(
      "mx-auto flex h-full w-full flex-col overflow-hidden rounded-panel bg-background text-foreground shadow-2xl",
      !completa && "max-w-6xl",
    )}>
      {children}
    </div>
  );
}

function ImagenSvg({ url, archivo, onFallo }: { url: string; archivo: DriveItem; onFallo: () => void }) {
  const { t } = useLanguage();
  const { src, error } = useSvgComoImagen(url, archivo.size);
  // Avisar al padre en un efecto y no durante el render (React lo prohíbe).
  useEffect(() => {
    if (error) onFallo();
  }, [error, onFallo]);
  if (error) return null;
  if (!src) return <Cargando texto={t("drive.visor.cargando")} />;
  return (
    <div className="flex h-full w-full items-center justify-center">
      {/* ⚠️ SOLO como imagen (etiqueta img) y desde una data: URL: un SVG
          puede traer scripts, y como imagen no corren. Nunca innerHTML, ni la
          etiqueta object, ni un blob (ver useSvgComoImagen). */}
      <img src={src} alt={archivo.nombre} onError={onFallo} className="max-h-full max-w-full rounded-control bg-white object-contain" />
    </div>
  );
}

function VistaTexto({ url, archivo, onDescargar }: { url: string; archivo: DriveItem; onDescargar: () => void }) {
  const { t } = useLanguage();
  const q = useTextoDelArchivo(url, archivo.size);
  if (q.isPending) return <Cargando texto={t("drive.visor.cargando")} />;
  if (q.isError || !q.data) {
    return (
      <Aviso
        icono={<AlertTriangle className="h-10 w-10 text-white/60" />}
        titulo={t("drive.visor.error")}
        detalle={(q.error as Error | null)?.message || t("drive.visor.errorAyuda")}
        acciones={<BotonDescargar onClick={onDescargar} etiqueta={t("drive.accion.descargar")} />}
      />
    );
  }
  if (q.data.binario) {
    return (
      <Aviso
        icono={<FileQuestion className="h-10 w-10 text-white/60" />}
        titulo={t("drive.visor.navegadorNoPuede")}
        detalle={t("drive.visor.navegadorNoPuedeAyuda")}
        acciones={<BotonDescargar onClick={onDescargar} etiqueta={t("drive.accion.descargar")} />}
      />
    );
  }
  return (
    <Hoja>
      {q.data.cortado && (
        <p className="shrink-0 border-b border-border/60 bg-muted/60 px-4 py-2 text-xs text-muted-foreground">
          {t("drive.visor.textoCortado", { tope: tamano(TOPE_TEXTO) })}
        </p>
      )}
      {/* ⚠️ Como TEXTO: React escapa todo lo que va de hijo. Un .html o un .xml
          se ven como su código, nunca como página. */}
      <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-5 font-mono text-xs leading-relaxed">
        {q.data.texto || t("drive.visor.textoVacio")}
      </pre>
    </Hoja>
  );
}

/** Word, Excel y PowerPoint (y los de OpenDocument): ONLYOFFICE en modo
 *  lectura, con la misma integración de la Oficina (useEditorDeOffice). */
function VistaOffice({ archivo, onDescargar }: { archivo: DriveItem; onDescargar: () => void }) {
  const { t, language } = useLanguage();
  // `resolvedTheme` y no `theme`: con "system", `theme` vale "system".
  const { resolvedTheme } = useTheme();
  const apertura = useVistaEnOffice(archivo.id, resolvedTheme === "dark" ? "dark" : "light", idiomaFuente(language), true);
  // El id lleva el archivo: ONLYOFFICE se monta en un contenedor LIMPIO por
  // documento (reusar el mismo dejaba el anterior dibujado debajo, visto en
  // el visor del correo).
  const contenedor = `visor-drive-office-${archivo.id}`;
  const editor = useEditorDeOffice(contenedor, apertura.data);

  if (apertura.isError || editor.error) {
    return (
      <Aviso
        icono={<AlertTriangle className="h-10 w-10 text-white/60" />}
        titulo={t("oficina.doc.openError")}
        detalle={(apertura.error as Error | null)?.message || editor.error || t("drive.visor.errorAyuda")}
        acciones={
          <>
            {apertura.isError && (
              <Button size="sm" variant="ghost" className="rounded-full text-white hover:bg-white/10 hover:text-white"
                onClick={() => void apertura.refetch()}>
                {t("common.retry")}
              </Button>
            )}
            <BotonDescargar onClick={onDescargar} etiqueta={t("drive.accion.descargar")} />
          </>
        }
      />
    );
  }
  return (
    <Hoja completa>
      <div className="relative min-h-0 flex-1">
        {(apertura.isPending || editor.estado === "cargando") && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-background">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t("oficina.doc.opening")}</p>
            </div>
          </div>
        )}
        <div id={contenedor} className="h-full w-full" />
      </div>
    </Hoja>
  );
}

function Cargando({ texto }: { texto: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-white/70" role="status">
      <Loader2 className="h-8 w-8 animate-spin" />
      <p className="text-sm">{texto}</p>
    </div>
  );
}

function BotonDescargar({ onClick, etiqueta }: { onClick: () => void; etiqueta: string }) {
  return (
    <Button size="sm" onClick={onClick} className="rounded-full bg-white text-black hover:bg-white/90">
      <Download className="mr-2 h-4 w-4" />
      {etiqueta}
    </Button>
  );
}

/** La tarjeta del medio cuando no hay vista: qué pasó y qué se puede hacer. */
function Aviso({ icono, titulo, detalle, ayuda, acciones }: {
  icono: ReactNode; titulo: string; detalle: string; ayuda?: string; acciones?: ReactNode;
}) {
  return (
    <div className="flex h-full w-full items-center justify-center p-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-card bg-white/5 px-6 py-8 text-center">
        {icono}
        <p className="text-sm font-medium text-white">{titulo}</p>
        <p className="max-w-full break-words text-xs text-white/60">{detalle}</p>
        {ayuda && <p className="text-xs text-white/60">{ayuda}</p>}
        {acciones && <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{acciones}</div>}
      </div>
    </div>
  );
}
