import { useState, type DragEvent, type MouseEvent, type ReactNode } from "react";
import { CalendarDays, Images, LayoutGrid, List, MoreVertical, type LucideIcon } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import type { DriveItem } from "@/hooks/useDrive";
import type { ModoDeVista } from "@/hooks/useVistaDrive";
import { soloUnClic } from "@/pages/oficina/drive/gestos";

// Las otras vistas del Drive (Jhon, 02/10): CUADRÍCULA (como Google Drive:
// carpetas arriba en cuadritos chicos y después los archivos en tarjetas con su
// miniatura) y GALERÍA (miniaturas grandes sin texto, para carpetas de fotos y
// videos). Elegir varios, arrastrar y el menú ⋮ funcionan igual que en la
// lista: todo lo hace la página y llega acá en `manejo`.

/** Lo que la página sabe hacer con cada elemento, igual en las tres vistas. */
export interface ManejoDeElemento {
  elegida: (i: DriveItem) => boolean;
  haySeleccion: boolean;
  /** Clic en la casilla (con Shift, un tramo). */
  alClicCasilla: (e: MouseEvent, i: DriveItem) => void;
  /** Clic con Shift o Ctrl/⌘ en el elemento: elige en vez de abrir. */
  alClicCaptura: (e: MouseEvent, i: DriveItem) => void;
  abrir: (i: DriveItem) => void;
  arrastrable: (i: DriveItem) => boolean;
  alEmpezarArrastre: (e: DragEvent, i: DriveItem) => void;
  alTerminarArrastre: () => void;
  /** Las props para recibir lo que se arrastra (una carpeta), o {}. */
  recibe: (i: DriveItem) => Record<string, unknown>;
  /** El id sobre el que se está arrastrando algo. */
  sobre: string | null;
  /** El contenido del menú ⋮ (el mismo de la lista). */
  menu: (i: DriveItem) => ReactNode;
  icono: (i: DriveItem) => LucideIcon;
  miniatura: (i: DriveItem) => string | undefined;
}

export interface SeccionDeVista { clave: string; titulo: string | null; items: DriveItem[] }

const MODOS: { id: ModoDeVista; clave: TranslationKey; icono: LucideIcon }[] = [
  { id: "lista", clave: "drive.modo.lista", icono: List },
  { id: "cuadricula", clave: "drive.modo.cuadricula", icono: LayoutGrid },
  { id: "galeria", clave: "drive.modo.galeria", icono: Images },
];

/** Arriba a la derecha, como en Google Drive: Lista · Cuadrícula · Galería, y
 *  «Agrupar por fecha» (vale en las tres). */
export function SelectorDeVista({ modo, agrupar, onModo, onAgrupar }: {
  modo: ModoDeVista; agrupar: boolean; onModo: (m: ModoDeVista) => void; onAgrupar: (v: boolean) => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="ml-auto flex shrink-0 items-center gap-2">
      <button
        type="button"
        aria-pressed={agrupar}
        onClick={() => onAgrupar(!agrupar)}
        title={t("drive.agrupar")}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
          agrupar ? "border-primary/40 bg-primary/15 text-primary" : "border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <CalendarDays className="h-4 w-4" />
        <span className="hidden sm:inline">{t("drive.agrupar")}</span>
      </button>
      <div role="group" aria-label={t("drive.modo.titulo")} className="inline-flex rounded-full border border-border/60 p-0.5">
        {MODOS.map(({ id, clave, icono: Icono }) => (
          <button
            key={id}
            type="button"
            aria-pressed={modo === id}
            aria-label={t(clave)}
            title={t(clave)}
            onClick={() => onModo(id)}
            className={cn(
              "inline-flex h-7 w-9 items-center justify-center rounded-full transition-colors",
              modo === id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icono className="h-4 w-4" />
          </button>
        ))}
      </div>
    </div>
  );
}

/** La miniatura del NAS sobre el ícono del tipo: mientras carga, o si no hay
 *  (o falla), se ve el ícono. `loading="lazy"`: solo se pide lo que está cerca
 *  de la pantalla. */
export function Miniatura({ url, icono: Icono, cubrir, claseIcono, pie }: {
  url: string | undefined; icono: LucideIcon; cubrir: boolean; claseIcono?: string;
  /** Lo que va debajo del ícono cuando no se ve la miniatura (en la galería, el nombre). */
  pie?: string;
}) {
  const [fallo, setFallo] = useState<string | null>(null);
  const [cargada, setCargada] = useState<string | null>(null);
  const hay = !!url && fallo !== url;
  const seVe = hay && cargada === url;
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-2 overflow-hidden p-2">
      {!seVe && <Icono className={cn("h-10 w-10 shrink-0 text-muted-foreground/60", claseIcono)} aria-hidden />}
      {!seVe && pie && <span className="line-clamp-2 max-w-full break-words text-center text-xs text-muted-foreground">{pie}</span>}
      {hay && (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setCargada(url)}
          onError={() => setFallo(url)}
          className={cn("absolute inset-0 h-full w-full", cubrir ? "object-cover" : "object-contain", cargada !== url && "opacity-0")}
        />
      )}
    </div>
  );
}

/** La casilla de una tarjeta: en la esquina, al pasar el mouse (siempre en el
 *  teléfono y apenas hay algo elegido). */
function CasillaDeTarjeta({ i, manejo, className }: { i: DriveItem; manejo: ManejoDeElemento; className?: string }) {
  const { t } = useLanguage();
  const elegida = manejo.elegida(i);
  return (
    <Checkbox
      checked={elegida}
      onClick={(e) => manejo.alClicCasilla(e, i)}
      aria-label={t("drive.seleccion.fila", { name: i.nombre })}
      className={cn(
        "bg-background/80 transition-opacity",
        !manejo.haySeleccion && !elegida && "md:opacity-0 md:focus-visible:opacity-100 md:group-hover:opacity-100",
        className,
      )}
    />
  );
}

function BotonDeMenu({ i, manejo, className }: { i: DriveItem; manejo: ManejoDeElemento; className?: string }) {
  const { t } = useLanguage();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("drive.accion.opciones", { name: i.nombre })}
          className={cn("inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground", className)}
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      {manejo.menu(i)}
    </DropdownMenu>
  );
}

/** Las props comunes de arrastrar y de cómo se ve elegida. */
function propsDeTarjeta(i: DriveItem, manejo: ManejoDeElemento) {
  const elegida = manejo.elegida(i);
  return {
    draggable: manejo.arrastrable(i),
    onDragStart: (e: DragEvent) => manejo.alEmpezarArrastre(e, i),
    onDragEnd: manejo.alTerminarArrastre,
    ...manejo.recibe(i),
    "data-elegida": elegida || undefined,
    className: cn(
      "group relative rounded-panel border border-border/60 bg-card/60 transition-colors hover:bg-muted/40",
      elegida && "border-primary/50 bg-primary/10 hover:bg-primary/15",
      manejo.sobre === i.id && "bg-primary/15 ring-2 ring-primary/60",
    ),
  };
}

/** Una carpeta en un cuadrito chico (arriba de todo, como en Google). */
function CuadritoDeCarpeta({ i, manejo }: { i: DriveItem; manejo: ManejoDeElemento }) {
  const Icono = manejo.icono(i);
  return (
    <li {...propsDeTarjeta(i, manejo)}>
      <div className="flex min-w-0 items-center gap-2 py-1.5 pl-3 pr-1">
        <CasillaDeTarjeta i={i} manejo={manejo} />
        <button
          type="button"
          onClickCapture={(e) => manejo.alClicCaptura(e, i)}
          onClick={soloUnClic(() => manejo.abrir(i))}
          className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left text-sm font-medium"
        >
          <Icono className="h-5 w-5 shrink-0 text-primary" />
          <span className="min-w-0 truncate">{i.nombre}</span>
        </button>
        <BotonDeMenu i={i} manejo={manejo} />
      </div>
    </li>
  );
}

/** Un archivo en tarjeta: la miniatura grande y abajo el ícono y el nombre. */
function TarjetaDeArchivo({ i, manejo }: { i: DriveItem; manejo: ManejoDeElemento }) {
  const Icono = manejo.icono(i);
  const incompleta = i.estado !== "listo";
  return (
    <li {...propsDeTarjeta(i, manejo)}>
      <button
        type="button"
        onClickCapture={(e) => manejo.alClicCaptura(e, i)}
        onClick={soloUnClic(() => manejo.abrir(i))}
        disabled={incompleta}
        aria-label={i.nombre}
        className="block w-full overflow-hidden rounded-t-panel text-left disabled:cursor-default"
      >
        <div className="aspect-[4/3] bg-muted/40">
          <Miniatura url={manejo.miniatura(i)} icono={Icono} cubrir />
        </div>
      </button>
      <div className="flex min-w-0 items-center gap-2 py-1.5 pl-3 pr-1">
        <Icono className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm" title={i.nombre}>{i.nombre}</span>
        <BotonDeMenu i={i} manejo={manejo} />
      </div>
      <CasillaDeTarjeta i={i} manejo={manejo} className="absolute left-2 top-2" />
    </li>
  );
}

/** Galería: el cuadrado entero es la miniatura. Sin miniatura, el ícono y el
 *  nombre (si no, no se sabría qué es). La casilla y el ⋮ en las esquinas. */
function CuadroDeGaleria({ i, manejo }: { i: DriveItem; manejo: ManejoDeElemento }) {
  const Icono = manejo.icono(i);
  return (
    <li {...propsDeTarjeta(i, manejo)}>
      <button
        type="button"
        onClickCapture={(e) => manejo.alClicCaptura(e, i)}
        onClick={soloUnClic(() => manejo.abrir(i))}
        disabled={i.estado !== "listo"}
        aria-label={i.nombre}
        title={i.nombre}
        className="block aspect-square w-full overflow-hidden rounded-panel bg-muted/40 disabled:cursor-default"
      >
        <Miniatura url={manejo.miniatura(i)} icono={Icono} cubrir claseIcono="h-12 w-12" pie={i.nombre} />
      </button>
      <CasillaDeTarjeta i={i} manejo={manejo} className="absolute left-2 top-2" />
      <div className={cn(
        "absolute right-1 top-1 rounded-full bg-background/80 transition-opacity",
        !manejo.haySeleccion && "md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100",
      )}>
        <BotonDeMenu i={i} manejo={manejo} />
      </div>
    </li>
  );
}

/** La cuadrícula o la galería, sección por sección (una sola si no se agrupa
 *  por fecha). Las carpetas siempre en cuadritos chicos arriba. */
export function CuadriculaDrive({ modo, secciones, manejo }: {
  modo: "cuadricula" | "galeria"; secciones: SeccionDeVista[]; manejo: ManejoDeElemento;
}) {
  const { t } = useLanguage();
  const sinTitulos = secciones.length === 1 && !secciones[0].titulo;
  return (
    <div className="flex flex-col gap-5 p-4">
      {secciones.map((s) => {
        const carpetas = s.items.filter((i) => i.tipo === "carpeta");
        const archivos = s.items.filter((i) => i.tipo !== "carpeta");
        return (
          <section key={s.clave} aria-label={s.titulo ?? undefined} className="flex flex-col gap-3">
            {s.titulo && <h3 className="text-sm font-medium text-foreground">{s.titulo}</h3>}
            {carpetas.length > 0 && (
              <>
                {sinTitulos && <h3 className="text-xs font-medium text-muted-foreground">{t("drive.seccion.carpetas")}</h3>}
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3">
                  {carpetas.map((i) => <CuadritoDeCarpeta key={i.id} i={i} manejo={manejo} />)}
                </ul>
              </>
            )}
            {archivos.length > 0 && (
              <>
                {sinTitulos && carpetas.length > 0 && <h3 className="mt-2 text-xs font-medium text-muted-foreground">{t("drive.seccion.archivos")}</h3>}
                {modo === "cuadricula" ? (
                  <ul className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]">
                    {archivos.map((i) => <TarjetaDeArchivo key={i.id} i={i} manejo={manejo} />)}
                  </ul>
                ) : (
                  <ul className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]">
                    {archivos.map((i) => <CuadroDeGaleria key={i.id} i={i} manejo={manejo} />)}
                  </ul>
                )}
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
