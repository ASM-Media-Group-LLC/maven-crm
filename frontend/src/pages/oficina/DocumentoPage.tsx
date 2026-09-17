import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileText, Loader2, Share2, WifiOff } from "lucide-react";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useDocumento } from "@/hooks/useDocumentos";
import { useAbrirEnOnlyOffice, useEditorDeOffice } from "@/hooks/useOnlyOffice";
import { useHistorialDeOficina } from "@/hooks/useHistorialDeOficina";
import { useLanguage } from "@/hooks/useLanguage";
import DialogoDeCompartir from "@/components/oficina/DialogoDeCompartir";

/** El div donde ONLYOFFICE se monta. Tiene que ser un id y no una ref: la API
 *  del editor recibe el NOMBRE del contenedor, no el elemento. */
const CONTENEDOR = "editor-de-oficina";

export default function DocumentoPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [compartiendo, setCompartiendo] = useState(false);
  const doc = useDocumento(id);
  const abrir = useAbrirEnOnlyOffice();
  // Al salir del historial hay que volver a montar el editor en modo edición.
  // Pedir la configuración de nuevo alcanza: llega un objeto distinto y el
  // hook remonta solo. Es más barato que recargar la página entera, que es lo
  // que sugiere ONLYOFFICE.
  const historial = useHistorialDeOficina(id, () => { if (id) abrir.mutate(id); });
  const { estado, error } = useEditorDeOffice(CONTENEDOR, abrir.data, historial);

  // Pedir la configuración apenas se sabe qué documento es.
  useEffect(() => {
    if (!id) return;
    abrir.mutate(id);
    // Solo al cambiar de documento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const cargado = doc.data;
  const esMio = cargado?.owner_id === user?.id;

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
          <p className="text-sm font-medium">No se pudo abrir el documento</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {(doc.error as Error)?.message ||
              "Puede que lo hayan borrado o que no tengas acceso."}
          </p>
          <Button variant="outline" size="sm" className="mt-4 rounded-full"
            onClick={() => navigate("/oficina")}>
            Volver a Oficina
          </Button>
        </div>
      </Page>
    );
  }

  const fallo = error || (abrir.error as Error | undefined)?.message;

  return (
    // `scroll={false}`: el editor maneja su propio alto y su propio scroll, como
    // una llamada o el Messenger. Con el scroll de la página, ONLYOFFICE queda
    // dentro de un contenedor sin altura y se dibuja de 0 px.
    <Page scroll={false}>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <PageHeader
          icon={<FileText />}
          title={cargado.title}
          subtitle={`Versión ${cargado.version}`}
          actions={
            <>
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
              <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0 rounded-full"
                aria-label="Volver a Oficina" onClick={() => navigate("/oficina")}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </>
          }
        />

        {fallo && (
          <div className="flex items-start gap-2 rounded-panel border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
            <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-muted-foreground">
              {fallo} · El documento está a salvo: lo último guardado sigue en su lugar.
            </p>
          </div>
        )}

        <div className="relative min-h-0 flex-1 overflow-hidden rounded-panel border border-border/60">
          {estado === "cargando" && !fallo && (
            <div className="absolute inset-0 z-10 grid place-items-center bg-background">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Abriendo el documento…</p>
              </div>
            </div>
          )}
          {/* ONLYOFFICE se monta acá adentro y se queda con todo el espacio. */}
          <div id={CONTENEDOR} className="h-full w-full" />
        </div>
      </div>

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
