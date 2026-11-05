import { useEffect, useState, type ReactNode } from "react";
import { ChevronRight, History, Info, Loader2, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useFechasDeArchivos } from "@/hooks/useFechasDeArchivos";
import {
  useAperturaMia, useRutaDrive, useTamanoCarpeta, type DriveItem, type EstadoDeTamano, type UnidadConNombre, type VistaDrive,
} from "@/hooks/useDrive";
import { tamano } from "@/lib/drive/formato";
import { tipoDeFicha } from "@/lib/drive/tipoDeArchivo";
import { textoDeTamano, useCuantos } from "@/pages/oficina/drive/Tamanos";
import PanelDeActividad from "@/pages/oficina/drive/PanelDeActividad";
import { LinkDeSubida } from "@/components/oficina/LinkDeSubida";

// EL PANEL DE DETALLES (ⓘ) de Google Drive (Jhon, 03/10: «no veo el tamaño de
// los archivos por ningún lado; la fecha tampoco es clara»). De lo elegido (o
// de la carpeta en la que se está): tipo, tamaño (el de una carpeta lo cuenta
// la base: drive_tamano_carpeta), dónde está, de quién es, cuándo se modificó,
// cuándo lo abrí yo y cuándo se creó. En la papelera, además, quién lo tiró.
//
// En pantallas anchas va al costado de la lista, como en Google; en las
// angostas, en una hoja que entra desde la derecha (eso lo decide la página).

export type ObjetivoDeDetalles =
  | { tipo: "uno"; item: DriveItem }
  | { tipo: "varios"; items: DriveItem[] }
  | { tipo: "cargando" }
  | { tipo: "nada" };

export interface PanelDeDetallesProps {
  objetivo: ObjetivoDeDetalles;
  /** «Propietario» como lo muestra la lista (persona, unidad compartida o «Importado de Google»). */
  duenoDe: (i: DriveItem) => { texto: string; titulo?: string };
  nombreDe: (id: string | null) => string;
  unidades: Map<string, UnidadConNombre> | undefined;
  /** El tamaño de una carpeta que la lista ya pidió (para «varios»). */
  tamanoDe: (id: string) => EstadoDeTamano;
  icono: (i: DriveItem) => LucideIcon;
  /** Ir a la carpeta donde está (la ubicación es un enlace, como en Google). */
  onIrA: (vista: VistaDrive, carpeta: string) => void;
  /** Sin la X propia: en la hoja del teléfono la pone la hoja. */
  onCerrar?: () => void;
  /** «Administrar versiones» de un archivo (sin esto, no se ofrece: la papelera). */
  onVersiones?: (i: DriveItem) => void;
}

export default function PanelDeDetalles(props: PanelDeDetallesProps) {
  const { t } = useLanguage();
  const { objetivo, onCerrar } = props;
  const unItem = objetivo.tipo === "uno" ? objetivo.item : null;
  // Pestañas Detalles | Actividad (solo con un elemento elegido, como en Google).
  const [tab, setTab] = useState<"detalles" | "actividad">("detalles");
  // Al cambiar de elemento (o dejar de tener uno) se vuelve a Detalles.
  useEffect(() => { setTab("detalles"); }, [unItem?.id, objetivo.tipo]);

  const tabBtn = (clave: "detalles" | "actividad", etiqueta: string) => (
    <button
      type="button"
      onClick={() => setTab(clave)}
      className={cn(
        "relative px-1 py-1 text-sm font-semibold transition-colors",
        tab === clave ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {etiqueta}
      {tab === clave && <span className="absolute inset-x-0 -bottom-[9px] h-0.5 rounded-full bg-primary" />}
    </button>
  );

  return (
    <section aria-label={t("drive.detalles.titulo")} className="flex min-h-0 flex-col">
      <div className="flex items-center gap-4 border-b border-border/60 px-4 py-2.5">
        {unItem ? (
          <div className="flex min-w-0 flex-1 items-center gap-4">
            {tabBtn("detalles", t("drive.detalles.titulo"))}
            {tabBtn("actividad", t("drive.actividad.titulo"))}
          </div>
        ) : (
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{t("drive.detalles.titulo")}</h2>
        )}
        {onCerrar && (
          <button
            type="button"
            onClick={onCerrar}
            aria-label={t("drive.detalles.cerrar")}
            title={t("drive.detalles.cerrar")}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {unItem && tab === "actividad" ? (
          <PanelDeActividad itemId={unItem.id} activo />
        ) : objetivo.tipo === "uno" ? (
          <DetallesDeUno key={objetivo.item.id} item={objetivo.item} {...props} />
        ) : objetivo.tipo === "varios" ? (
          <DetallesDeVarios items={objetivo.items} tamanoDe={props.tamanoDe} />
        ) : objetivo.tipo === "cargando" ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="flex flex-col items-center gap-3 px-2 py-10 text-center">
            <Info className="h-8 w-8 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">{t("drive.detalles.vacio")}</p>
          </div>
        )}
      </div>
    </section>
  );
}

function Fila({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium text-muted-foreground">{etiqueta}</dt>
      <dd className="break-words text-sm">{children}</dd>
    </div>
  );
}

function DetallesDeUno({ item, duenoDe, nombreDe, unidades, icono, onIrA, tamanoDe, onVersiones }: PanelDeDetallesProps & { item: DriveItem }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const fechas = useFechasDeArchivos();
  const cuantos = useCuantos();
  const esCarpeta = item.tipo === "carpeta";
  const unidad = unidades?.get(item.id);
  const tamanoCarpeta = useTamanoCarpeta(esCarpeta ? item.id : null);
  const apertura = useAperturaMia(esCarpeta ? null : item.id);
  const ruta = useRutaDrive(item.parent_id);
  const Icono = icono(item);
  const tipo = tipoDeFicha(item, unidad?.tipo === "empresa");
  const dueno = duenoDe(item);

  // Dónde está: la ruta hasta su carpeta, empezando por «Mi unidad» o
  // «Unidades compartidas» cuando se sabe (como las migas del Drive).
  const pasos = ruta.data ?? [];
  const raiz = pasos[0];
  const unidadRaiz = raiz ? unidades?.get(raiz.id) : undefined;
  const esMioArriba = (r: { owner_id: string | null } | undefined, u: UnidadConNombre | undefined) =>
    (!!r?.owner_id && r.owner_id === user?.id) || (u?.tipo === "personal" && u.persona === user?.id);
  let vista: VistaDrive = "compartido";
  let principio: string | null = null;
  if (item.parent_id) {
    if (unidadRaiz?.tipo === "empresa") { vista = "unidades"; principio = t("drive.vista.unidades"); }
    else if (esMioArriba(raiz, unidadRaiz)) { vista = "mia"; principio = t("drive.vista.mia"); }
  } else if (unidad?.tipo === "empresa") {
    principio = t("drive.vista.unidades");
  } else if (esMioArriba(item, unidad)) {
    principio = t("drive.vista.mia");
  } else {
    principio = t("drive.vista.compartido");
  }
  const ubicacion = [principio, ...pasos.map((p) => p.nombre)].filter(Boolean).join(" › ");
  const madre = pasos[pasos.length - 1];

  // Lo de la carpeta: lo que contó el panel o, mientras llega, lo que ya trajo
  // la lista (la misma cuenta) para no mostrar «Calculando…» por algo que se ve al lado.
  const deLaLista = esCarpeta ? tamanoDe(item.id) : null;
  const deCarpeta = tamanoCarpeta.data ?? (deLaLista?.estado === "listo" ? deLaLista.tamano : undefined);

  let tamanoTexto: ReactNode;
  if (!esCarpeta) {
    tamanoTexto = item.size == null ? "—" : t("drive.detalles.bytes", { tamano: tamano(item.size), n: cuantos.numero(item.size) });
  } else if (deCarpeta) {
    tamanoTexto = textoDeTamano(deCarpeta);
  } else if (tamanoCarpeta.isPending) {
    tamanoTexto = <span className="inline-flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />{t("drive.tamano.calculando")}</span>;
  } else {
    tamanoTexto = <span className="text-muted-foreground">{t("drive.tamano.error")}</span>;
  }

  const fecha = (iso: string | null | undefined) => (iso ? <time dateTime={iso}>{fechas.completa(iso)}</time> : t("drive.detalles.nunca"));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex min-w-0 items-start gap-3">
        <Icono className={cn("mt-0.5 h-6 w-6 shrink-0", esCarpeta ? "text-primary" : "text-muted-foreground")} />
        <p className="min-w-0 break-words text-base font-medium leading-snug">{item.nombre}</p>
      </div>
      <dl className="flex flex-col gap-4">
        <Fila etiqueta={t("drive.detalles.tipo")}>{t(tipo.clave, { ext: tipo.ext })}</Fila>
        <Fila etiqueta={t("drive.detalles.tamano")}>{tamanoTexto}</Fila>
        {esCarpeta && deCarpeta && (
          <Fila etiqueta={t("drive.detalles.contenido")}>
            {cuantos.archivos(deCarpeta.archivos)} · {cuantos.carpetas(deCarpeta.carpetas)}
            {!deCarpeta.completo && <span className="mt-1 block text-xs text-muted-foreground">{t("drive.tamano.incompleto")}</span>}
          </Fila>
        )}
        <Fila etiqueta={item.trashed_at ? t("drive.detalles.ubicacionOriginal") : t("drive.detalles.ubicacion")}>
          {item.parent_id && ruta.isPending ? "…" : madre ? (
            <button
              type="button"
              onClick={() => onIrA(vista, madre.id)}
              title={t("drive.mover.entrar", { name: madre.nombre })}
              className="inline-flex max-w-full items-center gap-1 rounded-control text-left text-primary hover:underline"
            >
              <span className="break-words">{ubicacion}</span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            </button>
          ) : ubicacion || "—"}
        </Fila>
        <Fila etiqueta={t("drive.detalles.dueno")}><span title={dueno.titulo}>{dueno.texto}</span></Fila>
        {item.trashed_at && (
          <>
            <Fila etiqueta={t("drive.detalles.eliminadoPor")}>{item.trashed_by ? nombreDe(item.trashed_by) : "—"}</Fila>
            <Fila etiqueta={t("drive.detalles.eliminado")}>{fecha(item.trashed_at)}</Fila>
          </>
        )}
        <Fila etiqueta={t("drive.detalles.modificado")}>{fecha(item.updated_at)}</Fila>
        {!esCarpeta && (
          <Fila etiqueta={t("drive.detalles.abiertoPorMi")}>
            {apertura.isPending ? "…" : fecha(item.abierto_por_mi_at ?? apertura.data)}
          </Fila>
        )}
        <Fila etiqueta={t("drive.detalles.creado")}>{fecha(item.created_at)}</Fila>
      </dl>
      {/* Las versiones de lo editado en la Oficina, como en Google. */}
      {!esCarpeta && !item.trashed_at && item.estado === "listo" && onVersiones && (
        <button
          type="button"
          onClick={() => onVersiones(item)}
          className="inline-flex items-center gap-2 self-start rounded-control text-sm text-primary hover:underline"
        >
          <History className="h-4 w-4" />
          {t("drive.versiones.boton")}
        </button>
      )}
      {/* Link PÚBLICO de subida (solo carpetas): la gente sube aquí sin cuenta. */}
      {esCarpeta && !item.trashed_at && <LinkDeSubida itemId={item.id} />}
    </div>
  );
}

function DetallesDeVarios({ items, tamanoDe }: { items: DriveItem[]; tamanoDe: (id: string) => EstadoDeTamano }) {
  const { t } = useLanguage();
  // Los archivos, más las carpetas que ya se contaron en la lista.
  let total = 0;
  for (const i of items) {
    if (i.tipo === "archivo") total += i.size ?? 0;
    else {
      const e = tamanoDe(i.id);
      if (e.estado === "listo") total += e.tamano.bytes;
    }
  }
  return (
    <div className="flex flex-col items-center gap-3 px-2 py-8 text-center">
      <Info className="h-8 w-8 text-muted-foreground/60" />
      <p className="text-sm font-medium">{t("drive.detalles.varios", { n: items.length })}</p>
      <p className="text-sm text-muted-foreground">{t("drive.detalles.variosTamano", { tamano: tamano(total) })}</p>
    </div>
  );
}
