import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronRight, Download, ExternalLink, File as IconoArchivo, FileImage, FileVideo, Folder, Images, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { usePermissions } from "@/hooks/usePermissions";
import { abrirArchivo, type DriveItem, useDriveVista, useRutaDrive } from "@/hooks/useDrive";
import { useMiniaturasDrive } from "@/hooks/useMiniaturasDrive";
import { useDescargasZip } from "@/hooks/useDescargasZip";
import { useFechasDeArchivos } from "@/hooks/useFechasDeArchivos";
import { tamano } from "@/lib/drive/formato";
import { vistaDeArchivo } from "@/lib/drive/tipoDeArchivo";
import { alternarTodas, clicDeSeleccion, type EstadoSeleccion, SIN_SELECCION } from "@/lib/drive/seleccion";
import { CuadriculaDrive, type ManejoDeElemento, SelectorDeVista } from "@/pages/oficina/drive/VistasDeDrive";
import BarraDeSeleccion from "@/pages/oficina/drive/BarraDeSeleccion";
import PanelDeDescargas from "@/pages/oficina/drive/PanelDeDescargas";
import VisorArchivo from "@/pages/oficina/drive/VisorArchivo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";

// PESTAÑA CONTENIDO del perfil de la creadora (lado de la agencia): lo que ella
// sube desde su portal. Es su carpeta del Drive de la agencia (una unidad, ver
// 20261006120000_portal_contenido.sql): se lee con la RLS del Drive, y
// drive_mi_rol deja entrar como lector a quien ve a esa creadora y tiene «Ver y
// descargar su contenido». Para ver un archivo, el visor del Drive. Lo que ella
// «borró» desde el portal sigue aquí, marcado: solo salió de SU vista.

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
    cuerpo = <Navegador raiz={carpeta.data} creatorId={creatorId} />;
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

/** Su carpeta, con las piezas del Drive (Jhon, 06/10: «opción para descargar sin
 *  tener que abrir el contenido, como en Drive… y selección múltiple… un poco más
 *  parecido a lo que tenemos en Drive»): cuadrícula o galería, casillas (Shift
 *  para un tramo, Shift o Ctrl/⌘ sobre el elemento), la barra de selección con
 *  «Descargar» y el ⋮ de cada uno. Uno solo baja tal cual; varios o una carpeta,
 *  en un .zip con su avance. Solo se ve y se baja: no se mueve ni se borra. */
function Navegador({ raiz, creatorId }: { raiz: string; creatorId: string }) {
  const { t } = useLanguage();
  const { canAccess } = usePermissions();
  const fechas = useFechasDeArchivos();
  const ocultos = useQuery({
    queryKey: ["creadora-ocultos", creatorId],
    queryFn: async () => {
      const { data, error } = await supabase.from("creadora_ocultos" as never).select("item_id").eq("creator_id", creatorId);
      if (error) throw error;
      return new Set(((data ?? []) as { item_id: string }[]).map((x) => x.item_id));
    },
  }).data ?? new Set<string>();
  const [carpeta, setCarpeta] = useState(raiz);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [modo, setModo] = useState<"cuadricula" | "galeria">("cuadricula");
  const lista = useDriveVista("unidades", carpeta);
  const ruta = useRutaDrive(carpeta);
  // Las subidas a medias no se muestran ni se bajan.
  const items = useMemo(() => (lista.data ?? []).filter((i) => i.tipo === "carpeta" || i.estado === "listo"), [lista.data]);
  const orden = useMemo(() => items.map((i) => i.id), [items]);
  const miniaturas = useMiniaturasDrive(items, true);
  const { descargas, bajar: bajarZip, cancelar, elegirDonde, limpiar } = useDescargasZip();

  // La selección es de UNA carpeta: al cambiar de carpeta arranca vacía.
  const [seleccion, setSeleccion] = useState<{ carpeta: string; estado: EstadoSeleccion }>({ carpeta, estado: SIN_SELECCION });
  const estado = seleccion.carpeta === carpeta ? seleccion.estado : SIN_SELECCION;
  const elegir = (cambio: (e: EstadoSeleccion) => EstadoSeleccion) => setSeleccion({ carpeta, estado: cambio(estado) });
  const elegidos = items.filter((i) => estado.ids.has(i.id));
  const haySeleccion = elegidos.length > 0;
  const todas = haySeleccion && elegidos.length === items.length;

  // Esc suelta lo elegido (salvo que sea de un diálogo o un menú abierto).
  useEffect(() => {
    if (!haySeleccion) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) return;
      setSeleccion((s) => ({ ...s, estado: SIN_SELECCION }));
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [haySeleccion]);

  // Como en el Drive: un archivo solo baja tal cual; varios o una carpeta, un .zip.
  const bajar = async (de: DriveItem[]) => {
    if (de.length === 1 && de[0].tipo === "archivo") {
      return abrirArchivo(de[0].id, true).catch((e) => toast.error((e as Error).message));
    }
    if (!de.length) return;
    const z = await bajarZip(de.map((i) => i.id));
    if (!z) return;
    toast.error(
      z.codigo === "zip_demasiados" ? t("drive.zip.demasiados", { n: z.tope ?? "" })
        : z.codigo === "zip_muy_grande" ? t("drive.zip.muyGrande", { tope: tamano(z.tope ?? null) })
          : z.codigo === "zip_vacio" ? t("drive.zip.vacio")
            : `${t("drive.zip.error")}: ${z.message}`,
    );
  };

  const abrir = (i: DriveItem) => (i.tipo === "carpeta" ? setCarpeta(i.id) : setAbierto(i.id));
  const manejo: ManejoDeElemento = {
    elegida: (i) => estado.ids.has(i.id),
    haySeleccion,
    alClicCasilla: (e, i) => elegir((s) => clicDeSeleccion(s, orden, i.id, e.shiftKey)),
    alClicCaptura: (e, i) => {
      if (!(e.shiftKey || e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      e.stopPropagation();
      elegir((s) => clicDeSeleccion(s, orden, i.id, e.shiftKey));
    },
    abrir,
    arrastrable: () => false,
    alEmpezarArrastre: () => {},
    alTerminarArrastre: () => {},
    recibe: () => ({}),
    sobre: null,
    // El ⋮ del Drive recibe el menú entero (DropdownMenuContent), no solo los ítems.
    menu: (i) => (
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={() => void bajar([i])}>
          <Download className="mr-2 h-4 w-4" />{t("drive.accion.descargar")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    ),
    icono: iconoDe,
    miniatura: (i) => miniaturas.get(i.id),
    pie: (i) => (
      <>
        {i.tipo === "archivo" ? <>{tamano(i.size)} · {fechas.corta(i.updated_at)}</> : null}
        {ocultos.has(i.id) && <Badge variant="outline" className="ml-1 text-[10px]">{t("portal.agencia.contenido.oculto")}</Badge>}
      </>
    ),
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label={t("portal.contenido.ruta")} className="flex min-w-0 flex-wrap items-center gap-1 text-sm">
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
        <SelectorDeVista modo={modo} agrupar={false} onModo={(m) => setModo(m === "galeria" ? "galeria" : "cuadricula")} modos={["cuadricula", "galeria"]} />
        {canAccess("Oficina", "Drive") && (
          <Button asChild variant="outline" size="sm">
            <Link to={`/oficina/drive?vista=unidades&carpeta=${carpeta}`}>
              <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("portal.agencia.contenido.abrirEnDrive")}
            </Link>
          </Button>
        )}
      </div>

      <div className="rounded-panel border border-border/60">
        {/* Como el encabezado del Drive: la casilla de todo y cuántos; con algo
            elegido, la barra con «Descargar». */}
        <div className={cnFila(haySeleccion)}>
          <Checkbox
            checked={todas ? true : haySeleccion ? "indeterminate" : false}
            disabled={!items.length}
            onClick={(e) => { e.preventDefault(); elegir((s) => alternarTodas(s, orden)); }}
            aria-label={t(todas ? "drive.seleccion.ninguna" : "drive.seleccion.todas")}
            title={t(todas ? "drive.seleccion.ninguna" : "drive.seleccion.todas")}
          />
          {haySeleccion ? (
            <div className="min-w-0">
              <BarraDeSeleccion n={elegidos.length} acciones={{ descargar: () => void bajar(elegidos) }} ocupado={false} onLimpiar={() => elegir(() => SIN_SELECCION)} />
            </div>
          ) : (
            <span>{items.length === 1 ? t("drive.elementos.uno") : t("drive.elementos.n", { n: items.length })}</span>
          )}
        </div>

        {lista.isLoading ? (
          <div className="p-4"><Skeleton className="h-40 w-full" /></div>
        ) : items.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">{t("portal.agencia.contenido.vacio")}</p>
        ) : (
          <CuadriculaDrive modo={modo} secciones={[{ clave: "todo", titulo: null, items }]} manejo={manejo} />
        )}
      </div>

      <VisorArchivo items={items} abierto={abierto} onAbierto={setAbierto} />
      {descargas.length > 0 && (
        <div className="fixed bottom-36 right-4 z-50 w-[min(22rem,calc(100vw-2rem))] sm:bottom-4 sm:right-20">
          <PanelDeDescargas descargas={descargas} onCancelar={cancelar} onElegirDonde={elegirDonde} onCerrar={limpiar} />
        </div>
      )}
    </div>
  );
}

const cnFila = (elegido: boolean) =>
  `grid min-h-[2.75rem] grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-3 rounded-t-panel border-b border-border/60 px-4 py-1 text-xs font-medium text-muted-foreground ${elegido ? "bg-primary/5" : ""}`;
