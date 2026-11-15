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
import SinAccesoDocumento, { esSinAcceso } from "@/components/oficina/SinAccesoDocumento";
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
// `solo`: la hoja vive en su PROPIA ventana (sin el menú de Maven), como Google
// Sheets (Alvaro, 08/11). Se abre con window.open desde la lista de Oficina. En
// ese modo, «volver» cierra la ventana en vez de navegar.
export default function DocumentoPage({ solo = false }: { solo?: boolean } = {}) {
  const { id } = useParams<{ id: string }>();
  return <DocumentoAbierto key={id} id={id} solo={solo} />;
}

function DocumentoAbierto({ id, solo = false }: { id: string | undefined; solo?: boolean }) {
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
    // En su ventana propia (solo) el editor va SIEMPRE claro, como Google Sheets.
    if (id) abrir.mutate({ id, tema: solo ? "light" : (resolvedTheme === "dark" ? "dark" : "light") });
  });
  const { estado, error } = useEditorDeOffice(CONTENEDOR, abrir.data, historial);

  // Pedir la configuración apenas se sabe qué documento es.
  useEffect(() => {
    if (!id) return;
    // En su ventana propia (solo) el editor va SIEMPRE claro, como Google Sheets.
    abrir.mutate({ id, tema: solo ? "light" : (resolvedTheme === "dark" ? "dark" : "light") });
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

  // Un documento privado que no te compartieron: de quién es y «Pedir acceso».
  // Un fallo de red o del servidor NO es «sin acceso»: sigue el aviso de abajo.
  if (doc.isError && esSinAcceso(doc.error) && id) {
    return (
      <Page>
        <SinAccesoDocumento id={id} onVolver={() => navigate("/oficina")} />
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
    <Page scroll={false} padded={!solo}>
      <div className={`flex min-h-0 flex-1 flex-col ${solo ? "" : "gap-3"}`}>
        {/* El nombre editable, reutilizado por las dos cabeceras. */}
        {(() => {
          const nombre = (
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
          );
          const botonAbrir = (
            <Button size="sm" variant="outline" className="shrink-0 rounded-full"
              onClick={() => setAbriendoArchivo(true)}
              aria-label={t("oficina.abrir.titulo")} title={t("oficina.abrir.botonAyuda", { atajo: atajoDeAbrir() })}>
              <FolderOpen className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">{t("oficina.abrir.boton")}</span>
            </Button>
          );
          const botonCompartir = (
            <Button size="sm" variant="outline" className="shrink-0 rounded-full" onClick={() => setCompartiendo(true)}>
              <Share2 className="mr-1.5 h-4 w-4" />{t("doc.compartir")}
            </Button>
          );
          const botonVolver = (
            <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0 rounded-full"
              aria-label={t("oficina.backToOffice")} onClick={() => (solo ? window.close() : navigate("/oficina"))}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          );
          // SOLO (ventana propia, como Google Sheets): barra DELGADA y clara, sin
          // el bloque grande de título. El editor se come todo el alto.
          if (solo) {
            return (
              <div className="flex shrink-0 items-center gap-2 border-b border-border/70 bg-card px-3 py-1.5">
                <FileText className="h-4 w-4 shrink-0 text-primary" />
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate text-sm font-semibold">{nombre}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{t("oficina.doc.version", { n: cargado.version })}</span>
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-1.5">
                  {botonAbrir}{botonCompartir}{botonVolver}
                </div>
              </div>
            );
          }
          return (
            <PageHeader
              icon={<FileText />}
              title={nombre}
              subtitle={t("oficina.doc.version", { n: cargado.version })}
              actions={
                <>
                  <div className="flex shrink-0 items-center gap-2">{botonAbrir}{botonCompartir}</div>
                  {botonVolver}
                </>
              }
            />
          );
        })()}

        {fallo && (
          <div className="flex items-start gap-2 rounded-panel border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
            <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-muted-foreground">
              {fallo} · {t("oficina.doc.safe")}
            </p>
          </div>
        )}

        <div className={`relative min-h-0 flex-1 overflow-hidden ${solo ? "" : "rounded-panel border border-border/60"}`}>
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
