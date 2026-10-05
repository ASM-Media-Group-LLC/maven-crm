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
import { SIN_PERMISO_DRIVE, useFichaDrive, useMiRolDrive, useRenombrar } from "@/hooks/useDrive";
import VisorArchivo from "@/pages/oficina/drive/VisorArchivo";
import DialogoAbrirArchivo from "@/components/oficina/DialogoAbrirArchivo";
import NombreEditable from "@/components/oficina/NombreEditable";
import { atajoDeAbrir } from "@/lib/drive/abrirEnLaOficina";
import { conLaExtension, finDelNombreSinExtension } from "@/lib/drive/nombres";
import { comoSeAbreEnLaOficina, destinoEnLaOficina, extensionDe, type DestinoDeOficina } from "@/lib/drive/tipoDeArchivo";
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
  const navigate = useNavigate();
  // Lo que no es de Oficina (una foto, un video, un PDF) se abre en el visor del
  // Drive: antes caía aquí y decía «Este archivo no se abre con la Oficina»
  // (Jhon, 06/10). Al cerrarlo se vuelve a su carpeta.
  const ficha = useFichaDrive(id ?? null);
  if (ficha.isPending && id) {
    return (
      <Page>
        <div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      </Page>
    );
  }
  if (ficha.data && ficha.data.tipo === "archivo" && !comoSeAbreEnLaOficina(ficha.data)) {
    const volver = () => navigate(ficha.data?.parent_id ? `/oficina/drive?carpeta=${ficha.data.parent_id}` : "/oficina/drive", { replace: true });
    return (
      <Page>
        <VisorArchivo items={[ficha.data]} abierto={ficha.data.id} onAbierto={(v) => { if (!v) volver(); }} />
      </Page>
    );
  }
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
  const renombrar = useRenombrar();
  const rol = useMiRolDrive(id);
  /** El nombre después de cambiarlo aquí. ⚠️ No se toca la consulta de la
   *  apertura: un objeto nuevo ahí remonta el editor (useEditorDeOffice) y
   *  cortaría lo que se está escribiendo. */
  const [nombreNuevo, setNombreNuevo] = useState<string | null>(null);

  const archivo = apertura.data?.archivo;
  const nombre = nombreNuevo ?? archivo?.nombre ?? "";
  // Cambiar el nombre: dueño o editor (lo mismo que pide la RLS). Mientras no
  // se sabe el rol, lo que dijo la edge: si se abrió para editar, se puede.
  const puedeRenombrar = rol.data !== undefined
    ? rol.data === "dueno" || rol.data === "editor"
    : apertura.data?.modo === "editar";
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
          // Como Google con un archivo de Office: clic en el nombre, se
          // escribe, Enter guarda. Se edita sin la extensión y la conserva.
          // Es la ficha del Drive (drive_items): cambia también en el Drive.
          title={archivo
            ? (
              <NombreEditable
                valor={nombre}
                editarDesde={nombre.slice(0, finDelNombreSinExtension(nombre))}
                aNombre={(texto) => conLaExtension(texto, nombre)}
                editable={puedeRenombrar}
                etiqueta={t("drive.accion.renombrar")}
                maximo={255}
                className="break-all"
                onGuardar={async (nuevo) => {
                  if (!id) return;
                  try {
                    await renombrar.mutateAsync({ id, nombre: nuevo });
                    setNombreNuevo(nuevo);
                  } catch (e) {
                    toast.error((e as Error).message === SIN_PERMISO_DRIVE
                      ? t("drive.renombrar.sinPermiso")
                      : `${t("oficina.rename.error")}: ${(e as Error).message}`);
                    throw e;
                  }
                }}
              />
            )
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
