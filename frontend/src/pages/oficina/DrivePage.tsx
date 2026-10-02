import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { format, isToday, isThisYear } from "date-fns";
import {
  Building2, ChevronRight, Clock, Download, File, FileArchive, FileImage, FileSpreadsheet, FileText, FileVideo,
  Folder, FolderInput, FolderPlus, HardDrive, Loader2, MoreVertical, Pencil, Plus, RotateCcw, Share2, Trash2,
  Upload, Users, X, AlertTriangle, Check,
} from "lucide-react";
import { toast } from "sonner";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { SubtabNav, SubtabNavItem } from "@/components/ui/subtab-nav";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { useFormato } from "@/hooks/useFormato";
import type { Formato } from "@/lib/formato";
import { useDirectorioCorreo } from "@/hooks/useDirectorioCorreo";
import {
  abrirArchivo, useBorrarParaSiempre, useCrearCarpeta, useCrearUnidad, useDriveVista, usePapelera, useRenombrar,
  useRutaDrive, useSubidasDrive, type DriveItem, type VistaDrive,
} from "@/hooks/useDrive";
import DriveCompartirDialog from "@/components/oficina/DriveCompartirDialog";
import { BarraDeUso, BarraDeUsoAgencia, CuposDialog } from "@/components/oficina/DriveCupos";
import { useUserRole } from "@/hooks/useUserRole";
import VisorArchivo from "@/pages/oficina/drive/VisorArchivo";
import { soloUnClic } from "@/pages/oficina/drive/gestos";
import BarraDeSeleccion, { type AccionesDeSeleccion } from "@/pages/oficina/drive/BarraDeSeleccion";
import DriveMoverDialog, { type LugarMover } from "@/components/oficina/DriveMoverDialog";
import {
  ErrorDelZip, mandarAlNas, pedirZip, useDeshacerMover, useMoverDrive, usePapeleraVarias, useUnidadesDrive,
  type ResultadoMover,
} from "@/hooks/useDriveVarios";
import {
  alternarTodas, clicDeSeleccion, motivoDelError, MOTIVOS_MOVER, SIN_SELECCION, type EstadoSeleccion,
} from "@/lib/drive/seleccion";

/** Lo que se arrastra DENTRO del Drive (para mover), distinto de los archivos
 *  que llegan desde la computadora (para subir: tipo "Files"). */
const TIPO_ARRASTRE = "application/x-maven-drive";
const tieneTipo = (e: React.DragEvent, tipo: string) => Array.from(e.dataTransfer?.types ?? []).includes(tipo);

const VISTAS: { id: VistaDrive; clave: TranslationKey; icono: typeof HardDrive }[] = [
  { id: "mia", clave: "drive.vista.mia", icono: HardDrive },
  { id: "unidades", clave: "drive.vista.unidades", icono: Building2 },
  { id: "compartido", clave: "drive.vista.compartido", icono: Users },
  { id: "recientes", clave: "drive.vista.recientes", icono: Clock },
  { id: "papelera", clave: "drive.vista.papelera", icono: Trash2 },
];

const VACIO: Record<VistaDrive, TranslationKey> = {
  mia: "drive.vacio.mia",
  unidades: "drive.vacio.unidades",
  compartido: "drive.vacio.compartido",
  recientes: "drive.vacio.recientes",
  papelera: "drive.vacio.papelera",
};

export { tamano } from "@/lib/drive/formato";
import { tamano } from "@/lib/drive/formato";

function cuando(iso: string, f: Formato): string {
  const d = new Date(iso);
  if (isToday(d)) return format(d, "HH:mm");
  if (isThisYear(d)) return format(d, f.idioma === "en" ? "MMM d" : "d MMM", { locale: f.fechas });
  return format(d, "d MMM yyyy", { locale: f.fechas });
}

export function iconoDe(i: Pick<DriveItem, "tipo" | "mime" | "nombre">) {
  if (i.tipo === "carpeta") return Folder;
  const m = i.mime ?? "";
  const ext = i.nombre.split(".").pop()?.toLowerCase() ?? "";
  if (m.startsWith("image/")) return FileImage;
  if (m.startsWith("video/")) return FileVideo;
  if (/spreadsheet|excel|csv/.test(m) || ["xlsx", "xls", "csv"].includes(ext)) return FileSpreadsheet;
  if (/zip|rar|7z|tar|gzip/.test(m) || ["zip", "rar", "7z"].includes(ext)) return FileArchive;
  if (m.startsWith("text/") || /pdf|word|document|presentation/.test(m)) return FileText;
  return File;
}

export default function DrivePage() {
  const { t } = useLanguage();
  const f = useFormato();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const vista = (VISTAS.find((v) => v.id === params.get("vista"))?.id ?? "mia") as VistaDrive;
  const carpeta = params.get("carpeta");

  const items = useDriveVista(vista, carpeta);
  const ruta = useRutaDrive(carpeta);
  const directorio = useDirectorioCorreo(true);
  const nombreDe = useMemo(() => {
    const m = new Map((directorio.data ?? []).map((p) => [p.user_id, p.nombre]));
    return (id: string | null) => (id === user?.id ? t("drive.yo") : (id && m.get(id)) || "—");
  }, [directorio.data, user?.id, t]);

  const crear = useCrearCarpeta();
  const crearUnidad = useCrearUnidad();
  const renombrar = useRenombrar();
  const papelera = usePapelera();
  const borrar = useBorrarParaSiempre();
  const { subidas, subir, limpiar } = useSubidasDrive();

  const [creando, setCreando] = useState(false);
  const [creandoUnidad, setCreandoUnidad] = useState(false);
  const [renombrando, setRenombrando] = useState<DriveItem | null>(null);
  const [borrando, setBorrando] = useState<DriveItem | null>(null);
  const [compartiendo, setCompartiendo] = useState<DriveItem | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [viendoCupos, setViendoCupos] = useState(false);
  /** El archivo abierto en el visor (id), o null. */
  const [viendo, setViendo] = useState<string | null>(null);
  const { isAdmin } = useUserRole();
  const inputArchivos = useRef<HTMLInputElement>(null);

  // Subir y crear solo donde se puede: en Mi unidad, o dentro de una carpeta
  // (si no tienes permiso de editar, la base lo rechaza y se avisa).
  const sePuedeSubir = vista === "mia" || !!carpeta;
  // Como en Google Workspace: las unidades compartidas las crea un admin.
  const sePuedeCrearUnidad = isAdmin && vista === "unidades" && !carpeta;
  const enPapelera = vista === "papelera" && !carpeta;

  const ir = (v: VistaDrive, c: string | null = null) => {
    const p = new URLSearchParams();
    if (v !== "mia") p.set("vista", v);
    if (c) p.set("carpeta", c);
    setParams(p);
  };

  const abrir = (i: DriveItem) => {
    if (i.tipo === "carpeta") return ir(vista, i.id);
    if (i.estado !== "listo") return;
    // En el visor, no en otra pestaña (ver drive/VisorArchivo.tsx).
    setViendo(i.id);
  };

  const soltar = (e: React.DragEvent) => {
    e.preventDefault();
    setArrastrando(false);
    if (!sePuedeSubir) return;
    const archivos = Array.from(e.dataTransfer.files ?? []);
    if (archivos.length) void subir(archivos, carpeta);
  };

  const lista = useMemo(() => items.data ?? [], [items.data]);
  const orden = useMemo(() => lista.map((i) => i.id), [lista]);

  // ── Elegir varios (María Villegas, 02/10, «como Google») ──────────────────
  // La selección es de UNA vista y carpeta: al cambiar de lugar arranca vacía
  // (sin un efecto que la borre: se guarda junto con el lugar al que
  // pertenece). Lo elegido es lo de la lista que está en el conjunto: si algo
  // se movió o se borró, deja de contar solo.
  const lugarActual = `${vista}|${carpeta ?? ""}`;
  const [seleccion, setSeleccion] = useState<{ lugar: string; estado: EstadoSeleccion }>({ lugar: lugarActual, estado: SIN_SELECCION });
  const estadoSel = seleccion.lugar === lugarActual ? seleccion.estado : SIN_SELECCION;
  const elegir = (cambio: (e: EstadoSeleccion) => EstadoSeleccion) =>
    setSeleccion((s) => ({ lugar: lugarActual, estado: cambio(s.lugar === lugarActual ? s.estado : SIN_SELECCION) }));
  const soltarSeleccion = () => elegir(() => SIN_SELECCION);
  const elegidos = lista.filter((i) => estadoSel.ids.has(i.id));
  const haySeleccion = elegidos.length > 0;
  const todasElegidas = haySeleccion && elegidos.length === lista.length;

  // Esc suelta lo elegido, salvo que el Esc sea de un diálogo o un menú abierto.
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

  // ── Mover ──────────────────────────────────────────────────────────────────
  const unidades = useUnidadesDrive();
  const moverDrive = useMoverDrive();
  const deshacer = useDeshacerMover();
  const papeleraVarias = usePapeleraVarias();
  const [moviendo, setMoviendo] = useState<DriveItem[] | null>(null);
  const [borrandoVarios, setBorrandoVarios] = useState<DriveItem[] | null>(null);
  const [preparandoZip, setPreparandoZip] = useState(false);
  // Una unidad compartida no se mueve (como en Google): es el principio de su ruta.
  const sePuedeMover = (i: DriveItem) => !enPapelera && i.estado === "listo" && !unidades.data?.has(i.id);

  /** El aviso de Google: «movido a X», con Deshacer; y lo que no se pudo, por qué. */
  const avisarMovido = (r: ResultadoMover, de: DriveItem[], destino: string) => {
    const motivo = (m: keyof typeof MOTIVOS_MOVER) => t(MOTIVOS_MOVER[m]);
    if (r.movidos.length) {
      soltarSeleccion();
      const nombre = de.find((i) => i.id === r.movidos[0].id)?.nombre ?? "";
      toast.success(
        r.movidos.length === 1
          ? t("drive.mover.listoUno", { name: nombre, destino })
          : t("drive.mover.listoVarios", { n: r.movidos.length, destino }),
        {
          action: {
            label: t("drive.mover.deshacer"),
            onClick: () => deshacer.mutate(r, {
              onSuccess: (d) => (d.fallidos.length
                ? toast.error(t("drive.mover.deshacerError", { motivo: motivo(d.fallidos[0].motivo) }))
                : toast.success(t("drive.mover.deshecho"))),
              onError: (e) => toast.error(t("drive.mover.deshacerError", { motivo: motivo(motivoDelError(e)) })),
            }),
          },
        },
      );
    }
    if (r.fallidos.length) {
      toast.error(r.movidos.length || r.fallidos.length > 1
        ? t("drive.mover.algunosNo", { n: r.fallidos.length, motivo: motivo(r.fallidos[0].motivo) })
        : t("drive.mover.error", { motivo: motivo(r.fallidos[0].motivo) }));
    }
  };

  const moverA = (de: DriveItem[], destino: string | null, nombreDestino: string) => moverDrive.mutate({ items: de, destino }, {
    onSuccess: (r) => avisarMovido(r, de, nombreDestino),
    onError: (e) => toast.error(t("drive.mover.error", { motivo: t(MOTIVOS_MOVER[motivoDelError(e)]) })),
  });

  // Dónde arranca «Mover a…»: donde se está mirando (si es un lugar del selector).
  const inicioMover = (): LugarMover => (vista === "mia" || vista === "unidades" || vista === "compartido"
    ? { raiz: vista, ruta: carpeta ? (ruta.data ?? []).map((r) => ({ id: r.id, nombre: r.nombre })) : [] }
    : { raiz: "mia", ruta: [] });

  // Arrastrar filas a una carpeta (o a las migas). `arrastre` guarda QUÉ se
  // arrastra: durante el arrastre el navegador no deja leer los datos.
  const arrastre = useRef<DriveItem[] | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const empezarArrastre = (e: React.DragEvent, i: DriveItem) => {
    const grupo = (estadoSel.ids.has(i.id) ? elegidos : [i]).filter(sePuedeMover);
    if (!grupo.length) { e.preventDefault(); return; }
    arrastre.current = grupo;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(TIPO_ARRASTRE, JSON.stringify(grupo.map((g) => g.id)));
  };
  const terminarArrastre = () => { arrastre.current = null; setSobre(null); };
  /** Las props para que algo reciba lo arrastrado. `destino` null = la raíz de
   *  Mi unidad (solo para lo que es mío, como en el selector). */
  const recibeArrastre = (destino: string | null, clave: string, nombre: string) => {
    const acepta = () => {
      const de = arrastre.current;
      if (!de) return false;
      if (destino !== null && de.some((d) => d.id === destino)) return false;
      if (destino === null && de.some((d) => d.owner_id !== user?.id)) return false;
      return !de.every((d) => d.parent_id === destino);
    };
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!tieneTipo(e, TIPO_ARRASTRE) || !acepta()) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        setSobre(clave);
      },
      onDragLeave: () => setSobre((s) => (s === clave ? null : s)),
      onDrop: (e: React.DragEvent) => {
        if (!tieneTipo(e, TIPO_ARRASTRE)) return;
        e.preventDefault();
        e.stopPropagation();
        const de = acepta() ? arrastre.current : null;
        terminarArrastre();
        if (de) moverA(de, destino, nombre);
      },
    };
  };

  // ── Descargar lo elegido ───────────────────────────────────────────────────
  // Un archivo solo, como siempre. Varios (o una carpeta): UN .zip que arma el
  // NAS mientras baja (infra/nas-drive/zip.mjs).
  const bajar = async (de: DriveItem[]) => {
    const listos = de.filter((i) => i.estado === "listo");
    if (listos.length === 1 && listos[0].tipo === "archivo") {
      return abrirArchivo(listos[0].id, true).catch((e) => toast.error((e as Error).message));
    }
    if (!listos.length) return;
    const aviso = toast.loading(t("drive.zip.preparando"));
    setPreparandoZip(true);
    try {
      const permiso = await pedirZip(listos.map((i) => i.id));
      mandarAlNas(permiso.url, permiso.t, () => toast.error(t("drive.zip.errorNas")));
      toast.success(t("drive.zip.empezo", { n: permiso.archivos }), { id: aviso });
    } catch (e) {
      const z = e instanceof ErrorDelZip ? e : null;
      toast.error(
        z?.codigo === "zip_demasiados" ? t("drive.zip.demasiados", { n: z.tope ?? "" })
          : z?.codigo === "zip_muy_grande" ? t("drive.zip.muyGrande", { tope: tamano(z.tope ?? null) })
            : z?.codigo === "zip_vacio" ? t("drive.zip.vacio")
              : `${t("drive.zip.error")}: ${(e as Error).message}`,
        { id: aviso },
      );
    } finally {
      setPreparandoZip(false);
    }
  };

  // ── Papelera de varios ─────────────────────────────────────────────────────
  const papeleraDe = (de: DriveItem[], tirar: boolean) => papeleraVarias.mutate({ ids: de.map((i) => i.id), tirar }, {
    onSuccess: ({ hechos, fallidos }) => {
      if (hechos.length) {
        soltarSeleccion();
        const texto = tirar
          ? (hechos.length === 1 ? t("drive.papelera.aviso") : t("drive.papelera.avisoVarios", { n: hechos.length }))
          : (hechos.length === 1 ? t("drive.restaurado") : t("drive.restauradoVarios", { n: hechos.length }));
        toast.success(texto, tirar ? {
          action: { label: t("drive.mover.deshacer"), onClick: () => papeleraVarias.mutate({ ids: hechos, tirar: false }) },
        } : undefined);
      }
      if (fallidos.length) toast.error(t("drive.papelera.algunosNo", { n: fallidos.length }));
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const borrarVarios = async (de: DriveItem[]) => {
    let hechos = 0;
    const errores: string[] = [];
    for (const i of de) {
      try { await borrar.mutateAsync(i.id); hechos++; } catch (e) { errores.push((e as Error).message); }
    }
    if (hechos) { soltarSeleccion(); toast.success(t("drive.borradoVarios", { n: hechos })); }
    if (errores.length) toast.error(t("drive.borrar.algunosNo", { n: errores.length, motivo: errores[0] }));
  };

  const acciones: AccionesDeSeleccion = enPapelera
    ? { restaurar: () => papeleraDe(elegidos, false), borrar: () => setBorrandoVarios(elegidos) }
    : {
      descargar: elegidos.some((i) => i.estado === "listo") ? () => void bajar(elegidos) : undefined,
      mover: elegidos.every(sePuedeMover) ? () => setMoviendo(elegidos) : undefined,
      papelera: () => papeleraDe(elegidos, true),
    };
  const ocupadoConVarios = moverDrive.isPending || papeleraVarias.isPending || preparandoZip || borrar.isPending;

  return (
    <Page>
      <PageHeader
        title={t("drive.titulo")}
        actions={sePuedeSubir || isAdmin ? (
          <>
          {sePuedeCrearUnidad && (
            <Button onClick={() => setCreandoUnidad(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              {t("drive.unidad.nueva")}
            </Button>
          )}
          {isAdmin && (
            <Button variant="outline" onClick={() => setViendoCupos(true)} aria-label={t("drive.cupos.boton")}>
              <HardDrive className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">{t("drive.cupos.boton")}</span>
            </Button>
          )}
          {sePuedeSubir && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <Plus className="mr-1.5 h-4 w-4" />
                {t("drive.nuevo")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={() => setCreando(true)}>
                <FolderPlus className="mr-2 h-4 w-4" />
                {t("drive.nuevaCarpeta")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => inputArchivos.current?.click()}>
                <Upload className="mr-2 h-4 w-4" />
                {t("drive.subirArchivos")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          )}
          </>
        ) : undefined}
      />
      <input
        ref={inputArchivos}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const archivos = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (archivos.length) void subir(archivos, carpeta);
        }}
      />

      <div className="mt-5 flex flex-col gap-5">
        {/* Pestañas a la izquierda; el espacio usado, a la derecha. */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          {/* Las vistas, con las mismas pestañas que el resto del CRM. */}
          <SubtabNav>
            {VISTAS.map(({ id, clave, icono: Icono }) => (
              <SubtabNavItem
                key={id}
                active={vista === id}
                onClick={() => ir(id)}
                aria-current={vista === id ? "page" : undefined}
                className="gap-1.5"
              >
                <Icono className="h-4 w-4" />
                {t(clave)}
              </SubtabNavItem>
            ))}
          </SubtabNav>
          {vista === "unidades" ? <BarraDeUsoAgencia /> : <BarraDeUso />}
        </div>

        {/* Migas: Mi unidad › Contabilidad › 2026 */}
        {carpeta && (
          <nav aria-label={t("drive.ruta")} className="flex min-w-0 flex-wrap items-center gap-0.5 text-sm">
            {/* Las migas también reciben lo que se arrastra (como en Google):
                la de «Mi unidad» es la raíz; las de las otras vistas no son
                una carpeta. */}
            <button
              type="button"
              onClick={() => ir(vista)}
              {...(vista === "mia" ? recibeArrastre(null, "__raiz__", t("drive.vista.mia")) : {})}
              className={cn("rounded-full px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground", sobre === "__raiz__" && "bg-primary/15 text-primary ring-2 ring-primary/40")}
            >
              {t(VISTAS.find((v) => v.id === vista)!.clave)}
            </button>
            {(ruta.data ?? []).map((r, n, todo) => (
              <span key={r.id} className="flex min-w-0 items-center gap-0.5">
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                {n === todo.length - 1 ? (
                  <span className="truncate px-2 py-1 font-medium">{r.nombre}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => ir(vista, r.id)}
                    {...recibeArrastre(r.id, `miga:${r.id}`, r.nombre)}
                    className={cn("truncate rounded-full px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground", sobre === `miga:${r.id}` && "bg-primary/15 text-primary ring-2 ring-primary/40")}
                  >
                    {r.nombre}
                  </button>
                )}
              </span>
            ))}
          </nav>
        )}

        {enPapelera && (
          <p className="rounded-panel bg-muted/50 px-4 py-2 text-xs text-muted-foreground">{t("drive.papelera.ayuda")}</p>
        )}

        <div
          // Solo los archivos de la computadora muestran «Suelta para subir»: una
          // fila arrastrada adentro del Drive es para mover, no para subir.
          onDragOver={(e) => { if (sePuedeSubir && tieneTipo(e, "Files")) { e.preventDefault(); setArrastrando(true); } }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={soltar}
          className={cn(
            "relative min-h-[16rem] rounded-panel border border-border/60",
            arrastrando && "border-primary ring-2 ring-primary/30",
          )}
        >
          {arrastrando && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-panel bg-primary/5 text-sm font-medium text-primary">
              {t("drive.soltar")}
            </div>
          )}

          {/* Encabezado de columnas (se esconden en el teléfono). Con algo
              elegido, la barra de acciones ocupa su lugar (como en Google) y
              se queda arriba al bajar por una carpeta larga. */}
          <div className={cn(
            "sticky top-0 z-[5] grid min-h-[2.75rem] grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-3 rounded-t-panel border-b border-border/60 bg-background px-4 py-1 text-xs font-medium text-muted-foreground md:grid-cols-[1.25rem_minmax(0,1fr)_10rem_9rem_6rem_2.5rem]",
            haySeleccion && "bg-primary/5",
          )}>
            <Checkbox
              checked={todasElegidas ? true : haySeleccion ? "indeterminate" : false}
              disabled={!lista.length}
              onClick={(e) => { e.preventDefault(); elegir((s) => alternarTodas(s, orden)); }}
              aria-label={t(todasElegidas ? "drive.seleccion.ninguna" : "drive.seleccion.todas")}
              title={t(todasElegidas ? "drive.seleccion.ninguna" : "drive.seleccion.todas")}
            />
            {haySeleccion ? (
              <div className="col-span-2 min-w-0 md:col-span-5">
                <BarraDeSeleccion n={elegidos.length} acciones={acciones} ocupado={ocupadoConVarios} onLimpiar={soltarSeleccion} />
              </div>
            ) : (
              <>
                <span>{t("drive.col.nombre")}</span>
                <span className="hidden md:block">{t("drive.col.dueno")}</span>
                <span className="hidden md:block">{t("drive.col.modificado")}</span>
                <span className="hidden md:block">{t("drive.col.tamano")}</span>
                <span />
              </>
            )}
          </div>

          {items.isLoading ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
            </div>
          ) : items.error ? (
            <p className="p-6 text-sm text-destructive">{t("drive.error")}: {(items.error as Error).message}</p>
          ) : lista.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
              <HardDrive className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">{t(carpeta ? "drive.vacio.carpeta" : VACIO[vista])}</p>
            </div>
          ) : (
            <ul>
              {lista.map((i) => {
                const Icono = iconoDe(i);
                const incompleta = i.estado !== "listo";
                const elegida = estadoSel.ids.has(i.id);
                const recibe = i.tipo === "carpeta" && !enPapelera && !incompleta;
                return (
                  <li
                    key={i.id}
                    draggable={sePuedeMover(i)}
                    onDragStart={(e) => empezarArrastre(e, i)}
                    onDragEnd={terminarArrastre}
                    {...(recibe ? recibeArrastre(i.id, i.id, i.nombre) : {})}
                    className={cn(
                      "group grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-border/40 px-4 py-1.5 last:border-b-0 hover:bg-muted/40 md:grid-cols-[1.25rem_minmax(0,1fr)_10rem_9rem_6rem_2.5rem]",
                      elegida && "bg-primary/10 hover:bg-primary/15",
                      sobre === i.id && "bg-primary/15 ring-2 ring-inset ring-primary/50",
                    )}
                  >
                    {/* La casilla: a la vista al pasar el mouse (siempre en el
                        teléfono) y en todas las filas apenas hay algo elegido.
                        Shift suma el tramo desde la última que se tocó. */}
                    <Checkbox
                      checked={elegida}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); elegir((s) => clicDeSeleccion(s, orden, i.id, e.shiftKey)); }}
                      aria-label={t("drive.seleccion.fila", { name: i.nombre })}
                      className={cn(
                        "transition-opacity",
                        !haySeleccion && "md:opacity-0 md:focus-visible:opacity-100 md:group-hover:opacity-100",
                      )}
                    />
                    {/* Un clic (o Enter) abre, carpeta o archivo: como Drive en el
                        teléfono. Con doble clic, en el celular no se podía abrir
                        nada, y el teclado (detail 0) no abría las carpetas. */}
                    {/* ⚠️ soloUnClic: el 2.º clic de un doble clic no abre otra vez. */}
                    {/* Con Shift o Ctrl/⌘ el clic ELIGE en vez de abrir, como en
                        Google: se ataja en la captura y el onClick no llega a correr. */}
                    <button
                      type="button"
                      onMouseDown={(e) => { if (e.shiftKey) e.preventDefault(); /* que Shift no pinte texto */ }}
                      onClickCapture={(e) => {
                        if (!e.shiftKey && !e.metaKey && !e.ctrlKey) return;
                        e.preventDefault();
                        e.stopPropagation();
                        elegir((s) => clicDeSeleccion(s, orden, i.id, e.shiftKey));
                      }}
                      onClick={soloUnClic(() => abrir(i))}
                      disabled={incompleta}
                      className="flex min-w-0 items-center gap-3 py-1 text-left text-sm disabled:cursor-default"
                    >
                      <Icono className={cn("h-5 w-5 shrink-0", i.tipo === "carpeta" ? "text-primary" : "text-muted-foreground")} />
                      <span className="min-w-0 truncate">{i.nombre}</span>
                      {incompleta && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning/15 px-2 text-[11px] text-warning">
                          <AlertTriangle className="h-3 w-3" />
                          {t("drive.subida.incompleta")}
                        </span>
                      )}
                    </button>
                    <span className="hidden truncate text-sm text-muted-foreground md:block">{nombreDe(i.owner_id)}</span>
                    <span className="hidden text-sm text-muted-foreground md:block">{cuando(i.trashed_at ?? i.updated_at, f)}</span>
                    <span className="hidden text-sm tabular-nums text-muted-foreground md:block">{i.tipo === "carpeta" ? "—" : tamano(i.size)}</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label={t("drive.accion.opciones", { name: i.nombre })}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        {enPapelera ? (
                          <>
                            <DropdownMenuItem onSelect={() => papelera.mutate({ id: i.id, tirar: false }, {
                              onSuccess: () => toast.success(t("drive.restaurado")),
                              onError: (e) => toast.error((e as Error).message),
                            })}>
                              <RotateCcw className="mr-2 h-4 w-4" />{t("drive.accion.restaurar")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setBorrando(i)} className="text-destructive focus:text-destructive">
                              <Trash2 className="mr-2 h-4 w-4" />{t("drive.accion.borrar")}
                            </DropdownMenuItem>
                          </>
                        ) : (
                          <>
                            {!incompleta && (
                              <DropdownMenuItem onSelect={() => abrir(i)}>
                                {i.tipo === "carpeta" ? <Folder className="mr-2 h-4 w-4" /> : <FileText className="mr-2 h-4 w-4" />}
                                {t("drive.accion.abrir")}
                              </DropdownMenuItem>
                            )}
                            {/* Una carpeta también se baja: en un .zip, como en Google. */}
                            {!incompleta && (
                              <DropdownMenuItem onSelect={() => void bajar([i])}>
                                <Download className="mr-2 h-4 w-4" />{t("drive.accion.descargar")}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onSelect={() => setCompartiendo(i)}>
                              <Share2 className="mr-2 h-4 w-4" />{t("drive.accion.compartir")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setRenombrando(i)}>
                              <Pencil className="mr-2 h-4 w-4" />{t("drive.accion.renombrar")}
                            </DropdownMenuItem>
                            {sePuedeMover(i) && (
                              <DropdownMenuItem onSelect={() => setMoviendo([i])}>
                                <FolderInput className="mr-2 h-4 w-4" />{t("drive.accion.mover")}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => papelera.mutate({ id: i.id, tirar: true }, {
                              onSuccess: () => toast.success(t("drive.papelera.aviso")),
                              onError: (e) => toast.error((e as Error).message),
                            })}>
                              <Trash2 className="mr-2 h-4 w-4" />{t("drive.accion.papelera")}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {creando && (
        <DialogoDeNombre
          titulo={t("drive.nuevaCarpeta")}
          etiqueta={t("drive.carpeta.nombre")}
          inicial={t("drive.carpeta.sinNombre")}
          boton={t("drive.carpeta.crear")}
          ocupado={crear.isPending}
          onCerrar={() => setCreando(false)}
          onGuardar={(nombre) => crear.mutate({ nombre, parentId: carpeta }, {
            onSuccess: () => setCreando(false),
            onError: (e) => toast.error((e as Error).message),
          })}
        />
      )}
      {creandoUnidad && (
        <DialogoDeNombre
          titulo={t("drive.unidad.nueva")}
          etiqueta={t("drive.unidad.nombre")}
          inicial={t("drive.unidad.sinNombre")}
          boton={t("drive.unidad.crear")}
          ocupado={crearUnidad.isPending}
          onCerrar={() => setCreandoUnidad(false)}
          onGuardar={(nombre) => crearUnidad.mutate(nombre, {
            onSuccess: () => { setCreandoUnidad(false); toast.success(t("drive.unidad.creada")); },
            onError: (e) => toast.error((e as Error).message),
          })}
        />
      )}
      {renombrando && (
        <DialogoDeNombre
          titulo={t("drive.renombrar.titulo")}
          etiqueta={t("drive.col.nombre")}
          inicial={renombrando.nombre}
          boton={t("drive.guardar")}
          ocupado={renombrar.isPending}
          onCerrar={() => setRenombrando(null)}
          onGuardar={(nombre) => renombrar.mutate({ id: renombrando.id, nombre }, {
            onSuccess: () => setRenombrando(null),
            onError: (e) => toast.error((e as Error).message),
          })}
        />
      )}
      <AlertDialog open={!!borrando} onOpenChange={(v) => !v && setBorrando(null)}>
        {borrando && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("drive.borrar.titulo")}</AlertDialogTitle>
              <AlertDialogDescription>{t("drive.borrar.cuerpo", { name: borrando.nombre })}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("drive.cancelar")}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => borrar.mutate(borrando.id, {
                  onSuccess: () => toast.success(t("drive.borrado")),
                  onError: (e) => toast.error((e as Error).message),
                })}
              >
                {t("drive.accion.borrar")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
      {compartiendo && (
        <DriveCompartirDialog item={compartiendo} onCerrar={() => setCompartiendo(null)} />
      )}
      {moviendo && (
        <DriveMoverDialog
          items={moviendo}
          inicio={inicioMover()}
          onCerrar={() => setMoviendo(null)}
          onMovido={(r, destino) => avisarMovido(r, moviendo, destino)}
        />
      )}
      <AlertDialog open={!!borrandoVarios} onOpenChange={(v) => !v && setBorrandoVarios(null)}>
        {borrandoVarios && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {borrandoVarios.length === 1 ? t("drive.borrar.titulo") : t("drive.borrar.tituloVarios", { n: borrandoVarios.length })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {borrandoVarios.length === 1
                  ? t("drive.borrar.cuerpo", { name: borrandoVarios[0].nombre })
                  : t("drive.borrar.cuerpoVarios")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("drive.cancelar")}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => void borrarVarios(borrandoVarios)}
              >
                {t("drive.accion.borrar")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>

      {subidas.length > 0 && <PanelDeSubidas subidas={subidas} onCerrar={limpiar} />}
      {viendoCupos && <CuposDialog onCerrar={() => setViendoCupos(false)} />}
      <VisorArchivo items={lista} abierto={viendo} onAbierto={setViendo} />
    </Page>
  );
}

function DialogoDeNombre({
  titulo, etiqueta, inicial, boton, ocupado, onCerrar, onGuardar,
}: {
  titulo: string; etiqueta: string; inicial: string; boton: string; ocupado: boolean;
  onCerrar: () => void; onGuardar: (nombre: string) => void;
}) {
  const { t } = useLanguage();
  const [nombre, setNombre] = useState(inicial);
  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{titulo}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (nombre.trim()) onGuardar(nombre.trim()); }} className="flex flex-col gap-4">
          <Input
            aria-label={etiqueta}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            maxLength={255}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onCerrar}>{t("drive.cancelar")}</Button>
            <Button type="submit" disabled={!nombre.trim() || ocupado}>{boton}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** El panelcito de abajo a la derecha de Google Drive, con el avance de cada
 *  archivo. */
function PanelDeSubidas({ subidas, onCerrar }: { subidas: ReturnType<typeof useSubidasDrive>["subidas"]; onCerrar: () => void }) {
  const { t } = useLanguage();
  const pendientes = subidas.filter((s) => s.estado === "subiendo").length;
  return (
    // ⚠️ No abajo a la derecha pegado al borde: ahí viven los botones flotantes
    // del Messenger y del asistente, y el panel quedaba debajo de ellos
    // (visto en prod el 28/09). En el teléfono va encima de esos botones; en
    // pantallas grandes, a su izquierda.
    <div className="fixed bottom-36 right-4 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-panel border border-border bg-card shadow-xl sm:bottom-4 sm:right-20">
      <div className="flex items-center justify-between bg-muted/60 px-4 py-2 text-sm font-medium">
        {pendientes ? t("drive.subiendo", { n: pendientes }) : t("drive.subidas.titulo")}
        <button type="button" onClick={onCerrar} disabled={pendientes > 0} aria-label={t("drive.subidas.cerrar")} className="rounded-full p-1 hover:bg-muted disabled:opacity-40">
          <X className="h-4 w-4" />
        </button>
      </div>
      <ul className="max-h-64 overflow-auto">
        {subidas.map((s) => {
          const pct = s.size ? Math.min(100, Math.round((s.enviado / s.size) * 100)) : 0;
          return (
            <li key={s.clave} className="flex items-center gap-3 border-b border-border/40 px-4 py-2 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{s.nombre}</p>
                {s.estado === "subiendo" && (
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
                  </div>
                )}
                {s.estado === "error" && <p className="truncate text-xs text-destructive">{t("drive.subida.error")}: {s.error}</p>}
              </div>
              {s.estado === "subiendo" && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
              {s.estado === "lista" && <Check className="h-4 w-4 shrink-0 text-success" aria-label={t("drive.subida.lista")} />}
              {s.estado === "error" && <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
