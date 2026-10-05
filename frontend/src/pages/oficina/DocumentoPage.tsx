import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileText, FolderOpen, Loader2, Share2, WifiOff } from "lucide-react";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  puedoEditarDocumento, SIN_PERMISO_DOCUMENTO, useDocumento, useDocumentosQuePuedoEditar, useRenombrarDocumento,
} from "@/hooks/useDocumentos";
import { useAbrirEnOnlyOffice, useEditorDeOffice } from "@/hooks/useOnlyOffice";
import { useHistorialDeOficina } from "@/hooks/useHistorialDeOficina";
import { useLanguage } from "@/hooks/useLanguage";
import DialogoDeCompartir from "@/components/oficina/DialogoDeCompartir";
import DialogoAbrirArchivo from "@/components/oficina/DialogoAbrirArchivo";
import NombreEditable from "@/components/oficina/NombreEditable";
import { atajoDeAbrir } from "@/lib/drive/abrirEnLaOficina";
import type { DestinoDeOficina } from "@/lib/drive/tipoDeArchivo";

/** El div donde ONLYOFFICE se monta. Tiene que ser un id y no una ref: la API
 *  del editor recibe el NOMBRE del contenedor, no el elemento. */
const CONTENEDOR = "editor-de-oficina";

const SECCIONES: readonly string[] = ["docx", "xlsx", "pptx"];

/** Una página por documento. «Abrir» (⌘O) lleva de un documento a otro sin
 *  salir de esta ruta, y sin la `key` el editor del anterior quedaba montado
 *  sobre un contenedor que el esqueleto de carga acababa de sacar: el nuevo
 *  podía buscar el div antes de que volviera a existir. Remontar todo deja el
 *  mismo camino que abrirlo desde la lista. */
export default function DocumentoPage() {
  const { id } = useParams<{ id: string }>();
  return <DocumentoAbierto key={id} id={id} />;
}

function DocumentoAbierto({ id }: { id: string | undefined }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLanguage();
  // `resolvedTheme` y no `theme`: con "system" puesto, `theme` vale "system" y
  // el editor abriría con su color por defecto en vez del que se está viendo.
  const { resolvedTheme } = useTheme();
  const [compartiendo, setCompartiendo] = useState(false);
  const [abriendoArchivo, setAbriendoArchivo] = useState(false);
  const doc = useDocumento(id);
  const abrir = useAbrirEnOnlyOffice();
  // Al salir del historial hay que volver a montar el editor en modo edición.
  // Pedir la configuración de nuevo alcanza: llega un objeto distinto y el
  // hook remonta solo. Es más barato que recargar la página entera, que es lo
  // que sugiere ONLYOFFICE.
  const historial = useHistorialDeOficina(id, () => {
    if (id) abrir.mutate({ id, tema: resolvedTheme === "dark" ? "dark" : "light" });
  });
  const { estado, error } = useEditorDeOffice(CONTENEDOR, abrir.data, historial);

  // Pedir la configuración apenas se sabe qué documento es.
  useEffect(() => {
    if (!id) return;
    abrir.mutate({ id, tema: resolvedTheme === "dark" ? "dark" : "light" });
    // Solo al cambiar de documento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const renombrar = useRenombrarDocumento();
  const paraEditar = useDocumentosQuePuedoEditar();

  const cargado = doc.data;
  const esMio = cargado?.owner_id === user?.id;
  // ¿Puede cambiar el título? Lo que diga el editor (la edge decide «edit» o
  // «view» con las mismas reglas que la RLS); mientras no llega, las reglas.
  const modoDelEditor = (abrir.data?.config as { editorConfig?: { mode?: string } } | undefined)?.editorConfig?.mode;
  const puedeRenombrar = !!cargado && (modoDelEditor
    ? modoDelEditor === "edit"
    : puedoEditarDocumento(cargado, user?.id, paraEditar.data));

  if (doc.isPending) {
    return (
      <Page>
        <div className="flex w-full flex-col gap-4">
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-[70vh] w-full" />
        </div>
      </Page>
    );
  }

  if (doc.isError || !cargado) {
    return (
      <Page>
        <div className="mx-auto max-w-lg py-10 text-center">
          <p className="text-sm font-medium">{t("oficina.doc.openError")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {(doc.error as Error)?.message ||
              t("oficina.doc.openErrorHint")}
          </p>
          <Button variant="outline" size="sm" className="mt-4 rounded-full"
            onClick={() => navigate("/oficina")}>
            {t("oficina.backToOffice")}
          </Button>
        </div>
      </Page>
    );
  }

  const fallo = error || (abrir.error as Error | undefined)?.message;
  // «Abrir» filtra por el tipo de este documento, como en Google.
  const seccion = (SECCIONES.includes(cargado.extension) ? cargado.extension : "docx") as DestinoDeOficina;

  return (
    // `scroll={false}`: el editor maneja su propio alto y su propio scroll, como
    // una llamada o el Messenger. Con el scroll de la página, ONLYOFFICE queda
    // dentro de un contenedor sin altura y se dibuja de 0 px.
    <Page scroll={false}>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <PageHeader
          icon={<FileText />}
          // Como Google Docs: clic en el nombre, se escribe, Enter guarda.
          title={(
            <NombreEditable
              valor={cargado.title}
              vacio={t("oficina.untitled")}
              editable={puedeRenombrar}
              etiqueta={t("oficina.rename.ayuda")}
              onGuardar={(title) => renombrar.mutateAsync({ id: cargado.id, title }).catch((e: Error) => {
                toast.error(e.message === SIN_PERMISO_DOCUMENTO
                  ? t("oficina.rename.sinPermiso")
                  : `${t("oficina.rename.error")}: ${e.message}`);
                throw e;
              })}
            />
          )}
          subtitle={t("oficina.doc.version", { n: cargado.version })}
          actions={
            <>
              {/* Abrir y Compartir van JUNTOS en un div: el encabezado pliega
                  detrás de «⋯» más de dos acciones en el teléfono, y la flecha
                  de volver quedaba escondida en esa hoja. */}
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 rounded-full"
                  onClick={() => setAbriendoArchivo(true)}
                  aria-label={t("oficina.abrir.titulo")}
                  title={t("oficina.abrir.botonAyuda", { atajo: atajoDeAbrir() })}
                >
                  <FolderOpen className="h-4 w-4 sm:mr-1.5" />
                  <span className="hidden sm:inline">{t("oficina.abrir.boton")}</span>
                </Button>
                {/* Un solo botón: adentro del diálogo están las personas
                    concretas Y el acceso general. Antes eran dos controles
                    separados para contestar la misma pregunta. */}
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 rounded-full"
                  onClick={() => setCompartiendo(true)}
                >
                  <Share2 className="mr-1.5 h-4 w-4" />
                  {t("doc.compartir")}
                </Button>
              </div>
              <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0 rounded-full"
                aria-label={t("oficina.backToOffice")} onClick={() => navigate("/oficina")}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </>
          }
        />

        {fallo && (
          <div className="flex items-start gap-2 rounded-panel border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
            <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-muted-foreground">
              {fallo} · {t("oficina.doc.safe")}
            </p>
          </div>
        )}

        <div className="relative min-h-0 flex-1 overflow-hidden rounded-panel border border-border/60">
          {estado === "cargando" && !fallo && (
            <div className="absolute inset-0 z-10 grid place-items-center bg-background">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{t("oficina.doc.opening")}</p>

              </div>
            </div>
          )}
          {/* ONLYOFFICE se monta acá adentro y se queda con todo el espacio. */}
          <div id={CONTENEDOR} className="h-full w-full" />
        </div>
      </div>

      <DialogoAbrirArchivo abierto={abriendoArchivo} onCambiar={setAbriendoArchivo} formato={seccion} />

      {id && (
        <DialogoDeCompartir
          abierto={compartiendo}
          onCerrar={() => setCompartiendo(false)}
          documentoId={id}
          titulo={cargado.title}
          ownerId={cargado.owner_id}
          visibilidad={cargado.visibility}
          // El acceso general se cambia desde adentro del diálogo, y esta
          // consulta tiene `staleTime: Infinity` para no pisarle el texto a
          // quien escribe: sin este refetch el diálogo seguiría mostrando el
          // valor viejo.
          onVisibilidadCambiada={() => void doc.refetch()}
          soyDueno={!!esMio}
        />
      )}
    </Page>
  );
}
