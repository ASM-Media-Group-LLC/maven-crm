import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, ExternalLink, File as IconoArchivo, FileImage, FileVideo, Folder, Images, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { usePermissions } from "@/hooks/usePermissions";
import { type DriveItem, useDriveVista, useRutaDrive } from "@/hooks/useDrive";
import { useMiniaturasDrive } from "@/hooks/useMiniaturasDrive";
import { tamano } from "@/lib/drive/formato";
import { vistaDeArchivo } from "@/lib/drive/tipoDeArchivo";
import { Miniatura } from "@/pages/oficina/drive/VistasDeDrive";
import VisorArchivo from "@/pages/oficina/drive/VisorArchivo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// PESTAÑA CONTENIDO del perfil de la creadora (lado de la agencia): lo que ella
// sube desde su portal. Es su carpeta del Drive de la agencia (una unidad, ver
// 20261006120000_portal_contenido.sql): se lee con la RLS del Drive, y
// drive_mi_rol deja entrar como lector a quien ve a esa creadora y tiene «Ver y
// descargar su contenido». Para ver un archivo, el visor del Drive.

const iconoDe = (i: DriveItem) => {
  if (i.tipo === "carpeta") return Folder;
  const v = vistaDeArchivo({ nombre: i.nombre, mime: i.mime, size: i.size }).tipo;
  return v === "imagen" ? FileImage : v === "video" ? FileVideo : IconoArchivo;
};

export default function ContenidoTabContent({ creatorId }: { creatorId: string }) {
  const { t } = useLanguage();
  const carpeta = useQuery({
    queryKey: ["creadora-carpeta", creatorId],
    queryFn: async () => {
      const { data, error } = await supabase.from("creadora_carpetas" as never).select("item_id").eq("creator_id", creatorId).maybeSingle();
      if (error) throw error;
      return (data as { item_id: string } | null)?.item_id ?? null;
    },
  });
  const puede = useQuery({
    queryKey: ["puedo-ver-contenido", creatorId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("puedo_ver_contenido_de" as never, { p_creator: creatorId } as never);
      if (error) throw error;
      return data === true;
    },
  });

  let cuerpo: React.ReactNode;
  if (carpeta.isLoading || puede.isLoading) {
    cuerpo = <Skeleton className="h-40 w-full" />;
  } else if (carpeta.isError || puede.isError) {
    cuerpo = <p className="text-sm text-muted-foreground">{t("portal.agencia.contenido.errorCargar")}</p>;
  } else if (!puede.data) {
    cuerpo = (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
        {t("portal.agencia.contenido.sinPermiso")}
      </p>
    );
  } else if (!carpeta.data) {
    cuerpo = (
      <div className="rounded-card border border-dashed border-border px-6 py-10 text-center">
        <p className="font-medium">{t("portal.agencia.contenido.vacio")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("portal.agencia.contenido.vacioTexto")}</p>
      </div>
    );
  } else {
    cuerpo = <Navegador raiz={carpeta.data} />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Images className="h-5 w-5" aria-hidden="true" />
          {t("portal.agencia.contenido.titulo")}
        </CardTitle>
        <CardDescription>{t("portal.agencia.contenido.descripcion")}</CardDescription>
      </CardHeader>
      <CardContent>{cuerpo}</CardContent>
    </Card>
  );
}

function Navegador({ raiz }: { raiz: string }) {
  const { t } = useLanguage();
  const { canAccess } = usePermissions();
  const [carpeta, setCarpeta] = useState(raiz);
  const [abierto, setAbierto] = useState<string | null>(null);
  const lista = useDriveVista("unidades", carpeta);
  const ruta = useRutaDrive(carpeta);
  const items = lista.data ?? [];
  const miniaturas = useMiniaturasDrive(items, true);
  const carpetas = items.filter((i) => i.tipo === "carpeta");
  const archivos = items.filter((i) => i.tipo === "archivo" && i.estado === "listo");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav aria-label={t("portal.contenido.ruta")} className="flex flex-wrap items-center gap-1 text-sm">
          {(ruta.data ?? []).map((r, n, todo) => {
            const nombre = r.id === raiz ? t("portal.agencia.contenido.raiz") : r.nombre;
            return (
              <span key={r.id} className="flex items-center gap-1">
                {n > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
                {n === todo.length - 1 ? (
                  <span className="font-semibold">{nombre}</span>
                ) : (
                  <button type="button" onClick={() => setCarpeta(r.id)} className="rounded-control px-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {nombre}
                  </button>
                )}
              </span>
            );
          })}
        </nav>
        {canAccess("Oficina", "Drive") && (
          <Button asChild variant="outline" size="sm">
            <Link to={`/oficina/drive?vista=unidades&carpeta=${carpeta}`}>
              <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("portal.agencia.contenido.abrirEnDrive")}
            </Link>
          </Button>
        )}
      </div>

      {lista.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("portal.agencia.contenido.vacio")}</p>
      ) : (
        <>
          {carpetas.length > 0 && (
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {carpetas.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => setCarpeta(c.id)} className="flex min-h-12 w-full items-center gap-3 rounded-panel border border-border px-3 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Folder className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                    <span className="truncate font-medium">{c.nombre}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {archivos.length > 0 && (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-8">
              {archivos.map((a) => (
                <li key={a.id} className="overflow-hidden rounded-card border border-border bg-card">
                  <button
                    type="button"
                    onClick={() => setAbierto(a.id)}
                    aria-label={t("portal.contenido.ver", { nombre: a.nombre })}
                    className="block aspect-square w-full bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <Miniatura url={miniaturas.get(a.id)} icono={iconoDe(a)} cubrir />
                  </button>
                  <div className="p-2">
                    <p className="truncate text-sm font-medium">{a.nombre}</p>
                    <p className="text-xs text-muted-foreground">{tamano(a.size)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <VisorArchivo items={items} abierto={abierto} onAbierto={setAbierto} />
    </div>
  );
}
