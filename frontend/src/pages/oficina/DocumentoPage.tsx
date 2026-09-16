import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileText, Loader2, Lock, Users, WifiOff } from "lucide-react";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  useDocumento, useGuardarDocumento, type VisibilidadDocumento,
} from "@/hooks/useDocumentos";
import { useAbrirEnOnlyOffice, useEditorDeOffice } from "@/hooks/useOnlyOffice";

/** El div donde ONLYOFFICE se monta. Tiene que ser un id y no una ref: la API
 *  del editor recibe el NOMBRE del contenedor, no el elemento. */
const CONTENEDOR = "editor-de-oficina";

export default function DocumentoPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const doc = useDocumento(id);
  const guardar = useGuardarDocumento();
  const abrir = useAbrirEnOnlyOffice();
  const { estado, error } = useEditorDeOffice(CONTENEDOR, abrir.data);

  // Pedir la configuración apenas se sabe qué documento es.
  useEffect(() => {
    if (!id) return;
    abrir.mutate(id);
    // Solo al cambiar de documento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const cargado = doc.data;
  const esMio = cargado?.owner_id === user?.id;

  const cambiarVisibilidad = (v: VisibilidadDocumento) => {
    if (!id) return;
    guardar.mutate(
      { id, visibility: v },
      {
        onSuccess: () => {
          void doc.refetch();
          toast.success(v === "equipo" ? "Ahora lo ve todo el equipo" : "Ahora es privado");
        },
        onError: (e) => toast.error((e as Error).message || "No se pudo cambiar"),
      },
    );
  };

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
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 rounded-full"
                disabled={!esMio || guardar.isPending}
                title={esMio ? undefined : "Solo quien lo creó puede cambiar quién lo ve"}
                onClick={() =>
                  cambiarVisibilidad(cargado.visibility === "equipo" ? "privado" : "equipo")
                }
              >
                {cargado.visibility === "equipo" ? (
                  <><Users className="mr-1.5 h-4 w-4" /> Equipo</>
                ) : (
                  <><Lock className="mr-1.5 h-4 w-4" /> Privado</>
                )}
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
    </Page>
  );
}
