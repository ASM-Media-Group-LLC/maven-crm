import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Copy, FileSpreadsheet, FileText, FolderOpen, Info, Loader2, Presentation, WifiOff,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";
import { useEditorDeOffice } from "@/hooks/useOnlyOffice";
import { useEdicionDelDrive, useEditarEnOficina } from "@/hooks/useVisorDrive";
import DialogoAbrirArchivo from "@/components/oficina/DialogoAbrirArchivo";
import { atajoDeAbrir } from "@/lib/drive/abrirEnLaOficina";
import { destinoEnLaOficina, extensionDe, type DestinoDeOficina } from "@/lib/drive/tipoDeArchivo";
import type { TranslationKey } from "@/lib/i18n";

// UN ARCHIVO DEL DRIVE ABIERTO EN LA OFICINA (Jhon, 02/10: «que sea exactamente
// como Google»). Como el «modo de edición de Office» de Google: se edita EL
// MISMO .docx/.xlsx/.pptx del Drive y lo guardado vuelve a él (la edge lo
// escribe en el NAS como un archivo nuevo y anota la versión anterior), así
// que abrirlo dos veces nunca crea dos copias. La copia en la Oficina queda
// como opción aparte («Hacer una copia», el «Guardar como Hojas de cálculo de
// Google»).
//
// Si no se puede editar (no tiene permiso, el formato no vuelve igual de
// ONLYOFFICE o no hay espacio) se abre para ver y se dice por qué.

/** El div donde se monta ONLYOFFICE (la API recibe el NOMBRE, no el elemento). */
const CONTENEDOR = "archivo-del-drive";

const ICONO: Record<DestinoDeOficina, typeof FileText> = {
  docx: FileText, xlsx: FileSpreadsheet, pptx: Presentation,
};

const SOLO_VER: Record<"formato" | "permiso" | "espacio", TranslationKey> = {
  formato: "oficina.archivo.soloVer.formato",
  permiso: "oficina.archivo.soloVer.permiso",
  espacio: "oficina.archivo.soloVer.espacio",
};

/** Una página por archivo: «Abrir» lleva de uno a otro sin salir de esta ruta,
 *  y el editor anterior no puede quedar montado (ver DocumentoPage). */
export default function ArchivoDelDrivePage() {
  const { id } = useParams<{ id: string }>();
  return <ArchivoAbierto key={id} id={id} />;
}

function ArchivoAbierto({ id }: { id: string | undefined }) {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const { resolvedTheme } = useTheme();
  const [abriendoArchivo, setAbriendoArchivo] = useState(false);
  const apertura = useEdicionDelDrive(id, resolvedTheme === "dark" ? "dark" : "light", language === "en" ? "en" : "es");
  const { estado, error } = useEditorDeOffice(CONTENEDOR, apertura.data);
  const copiar = useEditarEnOficina();

  const archivo = apertura.data?.archivo;
  const destino = (archivo && destinoEnLaOficina(archivo)) || "docx";
  const Icono = ICONO[destino];
  const editando = apertura.data?.modo === "editar";
  const motivo = apertura.data?.motivo ?? null;
  const fallo = error || (apertura.error as Error | null)?.message;

  const hacerCopia = () => {
    if (!id || copiar.isPending) return;
    copiar.mutate(id, {
      onSuccess: ({ id: documento }) => {
        toast.success(t("drive.visor.copiaLista"));
        navigate(`/oficina/${documento}`);
      },
      onError: (e) => toast.error(`${t("drive.visor.copiaError")}: ${(e as Error).message}`),
    });
  };

  return (
    // `scroll={false}`: el editor maneja su alto y su scroll (como DocumentoPage).
    <Page scroll={false}>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <PageHeader
          icon={<Icono />}
          title={archivo
            ? <span className="break-all">{archivo.nombre}</span>
            // Mientras llega, un renglón gris: el «Abriendo…» ya está en el centro.
            : <span aria-hidden="true" className="inline-block h-7 w-56 max-w-full animate-pulse rounded-control bg-muted align-middle" />}
          subtitle={apertura.data ? t(editando ? "oficina.archivo.seGuardaEnElDrive" : "oficina.archivo.soloLectura") : undefined}
          actions={
            <>
              {/* Abrir y la copia van juntos: el encabezado pliega más de dos
                  acciones en el teléfono y escondería la flecha de volver. */}
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
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 rounded-full"
                  onClick={hacerCopia}
                  disabled={!archivo || copiar.isPending}
                  aria-label={t("oficina.archivo.hacerCopia")}
                  title={t("oficina.archivo.hacerCopiaAyuda")}
                >
                  {copiar.isPending ? <Loader2 className="h-4 w-4 animate-spin sm:mr-1.5" /> : <Copy className="h-4 w-4 sm:mr-1.5" />}
                  <span className="hidden sm:inline">{t("oficina.archivo.hacerCopia")}</span>
                </Button>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-9 w-9 shrink-0 rounded-full"
                aria-label={t("oficina.archivo.volver")}
                title={t("oficina.archivo.volver")}
                onClick={() => navigate("/oficina/drive")}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </>
          }
        />

        {apertura.data && !editando && motivo && (
          <div className="flex flex-col gap-2 rounded-panel border border-border/60 bg-muted/40 px-3 py-2 text-xs sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="min-w-0 text-muted-foreground">
                {t(SOLO_VER[motivo], { ext: archivo ? extensionDe(archivo.nombre) || "?" : "?", destino })}
              </p>
            </div>
            <Button size="sm" className="shrink-0 rounded-full" onClick={hacerCopia} disabled={copiar.isPending}>
              {copiar.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Copy className="mr-1.5 h-4 w-4" />}
              {t("oficina.archivo.editarCopia")}
            </Button>
          </div>
        )}

        {fallo && (
          <div role="alert" className="flex items-start gap-2 rounded-panel border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
            <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="min-w-0 flex-1 text-muted-foreground">
              {t("drive.visor.error")}: {fallo}
            </p>
            {apertura.isError && (
              <Button size="sm" variant="outline" className="h-7 shrink-0 rounded-full" onClick={() => void apertura.refetch()}>
                {t("common.retry")}
              </Button>
            )}
          </div>
        )}

        <div className="relative min-h-0 flex-1 overflow-hidden rounded-panel border border-border/60">
          {(apertura.isPending || (estado === "cargando" && !fallo)) && (
            <div className="absolute inset-0 z-10 grid place-items-center bg-background">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{t("drive.visor.cargando")}</p>
              </div>
            </div>
          )}
          <div id={CONTENEDOR} className="h-full w-full" />
        </div>
      </div>

      <DialogoAbrirArchivo abierto={abriendoArchivo} onCambiar={setAbriendoArchivo} formato={destino} />
    </Page>
  );
}
