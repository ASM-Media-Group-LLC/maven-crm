import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import {
  Building2, ChevronRight, Clock, Download, File, FileArchive, FileImage, FileSpreadsheet, FileText, FileVideo,
  Folder, FolderInput, FolderPlus, HardDrive, History, Info, Loader2, MoreVertical, Pencil, Plus, RotateCcw, Share2, Trash2,
  Upload, Users, X, AlertTriangle, Check,
} from "lucide-react";
import { toast } from "sonner";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { SubtabNav, SubtabNavItem } from "@/components/ui/subtab-nav";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { useFormato } from "@/hooks/useFormato";
import { useFechasDeArchivos } from "@/hooks/useFechasDeArchivos";
import { useDirectorioCorreo } from "@/hooks/useDirectorioCorreo";
import {
  abrirArchivo, SIN_PERMISO_DRIVE, useBorrarParaSiempre, useCrearCarpeta, useCrearUnidad, useDriveVista, useFichaDrive,
  useRenombrar, useRutaDrive, useSubidasDrive, useTamanosDeCarpetas, useUnidadesConNombre, type DriveItem, type VistaDrive,
} from "@/hooks/useDrive";
import DialogoDeNombre from "@/components/oficina/DialogoDeNombre";
import PanelDeDetalles, { type ObjetivoDeDetalles } from "@/pages/oficina/drive/PanelDeDetalles";
import { useAnchoMinimo } from "@/hooks/useAnchoMinimo";
import { TamanoCarpeta } from "@/pages/oficina/drive/Tamanos";
import DriveCompartirDialog from "@/components/oficina/DriveCompartirDialog";
import { BarraDeUso, BarraDeUsoAgencia, CuposDialog } from "@/components/oficina/DriveCupos";
import { useUserRole } from "@/hooks/useUserRole";
import VisorArchivo from "@/pages/oficina/drive/VisorArchivo";
import { soloUnClic } from "@/pages/oficina/drive/gestos";
import BarraDeSeleccion, { type AccionesDeSeleccion } from "@/pages/oficina/drive/BarraDeSeleccion";
import DriveMoverDialog, { type LugarMover } from "@/components/oficina/DriveMoverDialog";
import {
  useDeshacerMover, useMoverDrive, usePapeleraVarias, useUnidadesDrive, type ResultadoMover,
} from "@/hooks/useDriveVarios";
import { useDescargasZip } from "@/hooks/useDescargasZip";
import PanelDeDescargas from "@/pages/oficina/drive/PanelDeDescargas";
import { useAvisoDeEspacio } from "@/components/oficina/DriveAvisoEspacio";
import DriveVersionesDialog from "@/components/oficina/DriveVersionesDialog";
import {
  alternarTodas, clicDeSeleccion, motivoDelError, MOTIVOS_MOVER, SIN_SELECCION, type EstadoSeleccion,
} from "@/lib/drive/seleccion";

import { useVistaDrive } from "@/hooks/useVistaDrive";
import { useMiniaturasDrive } from "@/hooks/useMiniaturasDrive";
import { agruparPorFecha, recortarGrupos, type Grupo, type TipoDeGrupo } from "@/lib/drive/agrupar";
import { usePorTramos } from "@/pages/oficina/drive/porTramos";
import {
  CuadriculaDrive, SelectorDeVista, type ManejoDeElemento, type SeccionDeVista,
} from "@/pages/oficina/drive/VistasDeDrive";

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

/** Desde qué ancho el panel de Detalles va al costado de la lista (como en
 *  Google); más angosto, en una hoja que entra desde la derecha. */
const ANCHO_PANEL_AL_COSTADO = 1280;

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
  const fechas = useFechasDeArchivos();
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

  // ── «Propietario» (Jhon, 03/10): lo importado de Google no tiene dueño y se
  // veía «—». Como Google: en una unidad compartida, la unidad (las unidades
  // no tienen dueño); en la «Mi unidad» de Google de alguien, esa persona; si
  // no se sabe de dónde viene, «Importado de Google».
  const unidadesConNombre = useUnidadesConNombre();
  const raizDeLaRuta = carpeta ? ruta.data?.[0] : undefined;
  const duenoDe = (i: DriveItem): { texto: string; titulo?: string } => {
    if (i.owner_id) return { texto: nombreDe(i.owner_id) };
    const u = unidadesConNombre.data;
    const propia = u?.get(i.id);
    if (propia?.tipo === "empresa") return { texto: t("drive.tipo.unidad") };
    if (propia?.tipo === "personal" && propia.persona) return { texto: nombreDe(propia.persona) };
    const unidad = i.unidad_id ? u?.get(i.unidad_id) : undefined;
    if (unidad) return { texto: unidad.nombre, titulo: t("drive.dueno.unidad", { name: unidad.nombre }) };
    // Dentro de la «Mi unidad» de Google de alguien: lo de adentro es suyo.
    const deLaRuta = raizDeLaRuta ? u?.get(raizDeLaRuta.id) : undefined;
    if (deLaRuta?.tipo === "personal" && deLaRuta.persona) return { texto: nombreDe(deLaRuta.persona) };
    return { texto: t("drive.dueno.google") };
  };

  const crear = useCrearCarpeta();
  const crearUnidad = useCrearUnidad();
  const renombrar = useRenombrar();
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

  /** La fecha de cada vista, la misma en la columna y al agrupar: en la
   *  papelera, cuándo se tiró; en Recientes, cuándo lo abrí YO; si no, la
   *  última modificación. */
  const fechaDe = (i: DriveItem): string =>
    (enPapelera ? i.trashed_at : vista === "recientes" && !carpeta ? i.abierto_por_mi_at : null) ?? i.updated_at;

  // ── Cómo se ve (Jhon, 02/10): Lista, Cuadrícula o Galería, y si se agrupa
  // por fecha. Lo que se ve, en el orden en que se ve: Shift-clic, el visor y
  // las miniaturas siguen ESE orden.
  const [prefs, cambiarPrefs] = useVistaDrive();
  const enLista = prefs.modo === "lista";
  const grupos = useMemo(
    () => (prefs.agrupar ? agruparPorFecha(lista, fechaDe) : null),
    // fechaDe solo depende de la vista (enPapelera, vista, carpeta).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prefs.agrupar, lista, enPapelera, vista, carpeta],
  );
  const ordenados = useMemo(() => (grupos ? grupos.flatMap((g) => g.items) : lista), [grupos, lista]);
  const orden = useMemo(() => ordenados.map((i) => i.id), [ordenados]);

  // ── Elegir varios (María Villegas, 02/10, «como Google») ──────────────────
  // La selección es de UNA vista y carpeta: al cambiar de lugar arranca vacía
  // (sin un efecto que la borre: se guarda junto con el lugar al que
  // pertenece). Lo elegido es lo de la lista que está en el conjunto: si algo
  // se movió o se borró, deja de contar solo.
  const lugarActual = `${vista}|${carpeta ?? ""}`;
  const [seleccion, setSeleccion] = useState<{ lugar: string; estado: EstadoSeleccion }>({ lugar: lugarActual, estado: SIN_SELECCION });
  const estadoSel = seleccion.lugar === lugarActual ? seleccion.estado : SIN_SELECCION;
  // ── Detalles (ⓘ): de lo que se eligió en «Ver detalles» del menú; si no, de
  // lo seleccionado; si no, de la carpeta en la que se está. Elegir otra cosa
  // le gana a «Ver detalles» (como en Google).
  const [detallesAbiertos, setDetallesAbiertos] = useState(false);
  const [detalleDe, setDetalleDe] = useState<string | null>(null);
  const elegir = (cambio: (e: EstadoSeleccion) => EstadoSeleccion) => {
    setDetalleDe(null);
    setSeleccion((s) => ({ lugar: lugarActual, estado: cambio(s.lugar === lugarActual ? s.estado : SIN_SELECCION) }));
  };
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
  const { descargas, bajar: bajarZip, cancelar: cancelarDescarga, elegirDonde, limpiar: limpiarDescargas } = useDescargasZip();
  const preparandoZip = descargas.some((d) => d.estado === "preparando");
  /** El archivo cuyas versiones se están mirando («Administrar versiones»). */
  const [versionesDe, setVersionesDe] = useState<DriveItem | null>(null);
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

  // El aviso de cuando lo que se mueve cambia de espacio (Mi unidad ↔ unidad
  // compartida): ver components/oficina/DriveAvisoEspacio.tsx.
  const espacio = useAvisoDeEspacio();

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
        // Si cambia de qué espacio se descuenta, primero el aviso (como en Google).
        if (de) void espacio.confirmar(de, destino, nombre).then((seguir) => { if (seguir) moverA(de, destino, nombre); });
      },
    };
  };

  // ── Descargar lo elegido ───────────────────────────────────────────────────
  // Un archivo solo, como siempre. Varios (o una carpeta): UN .zip que arma el
  // NAS mientras baja (infra/nas-drive/zip.mjs), con su avance y «Cancelar» en
  // el panel de descargas (hooks/useDescargasZip.ts).
  const bajar = async (de: DriveItem[]) => {
    const listos = de.filter((i) => i.estado === "listo");
    if (listos.length === 1 && listos[0].tipo === "archivo") {
      return abrirArchivo(listos[0].id, true).catch((e) => toast.error((e as Error).message));
    }
    if (!listos.length) return;
    const z = await bajarZip(listos.map((i) => i.id));
    if (!z) return;
    // La edge no lo dejó armar: se dice por qué, en el idioma de la persona.
    toast.error(
      z.codigo === "zip_demasiados" ? t("drive.zip.demasiados", { n: z.tope ?? "" })
        : z.codigo === "zip_muy_grande" ? t("drive.zip.muyGrande", { tope: tamano(z.tope ?? null) })
          : z.codigo === "zip_vacio" ? t("drive.zip.vacio")
            : `${t("drive.zip.error")}: ${z.message}`,
    );
  };

  // ── La papelera (una o varias) ─────────────────────────────────────────────
  // Como Google: «Movido a la papelera · Deshacer». Lo que la RLS no deja
  // tocar (alguien que solo puede ver) vuelve como no hecho y se dice por qué.
  // `soltar`: desde el menú ⋮ de una sola fila, lo que estaba elegido sigue elegido.
  const papeleraDe = (de: DriveItem[], tirar: boolean, soltar = true) => papeleraVarias.mutate({ ids: de.map((i) => i.id), tirar }, {
    onSuccess: ({ hechos, fallidos }) => {
      if (hechos.length) {
        if (soltar) soltarSeleccion();
        const texto = tirar
          ? (hechos.length === 1 ? t("drive.papelera.aviso") : t("drive.papelera.avisoVarios", { n: hechos.length }))
          : (hechos.length === 1 ? t("drive.restaurado") : t("drive.restauradoVarios", { n: hechos.length }));
        toast.success(texto, tirar ? {
          action: {
            label: t("drive.mover.deshacer"),
            onClick: () => papeleraVarias.mutate({ ids: hechos, tirar: false }, {
              onSuccess: (r) => (r.fallidos.length
                ? toast.error(t("drive.papelera.restaurarAlgunosNo", { n: r.fallidos.length }))
                : toast.success(t("drive.mover.deshecho"))),
              onError: (e) => toast.error((e as Error).message),
            }),
          },
        } : undefined);
      }
      if (fallidos.length) {
        const solo = fallidos.length === 1 && de.length === 1 ? de[0].nombre : null;
        toast.error(tirar
          ? (solo ? t("drive.papelera.tirarNo", { name: solo }) : t("drive.papelera.algunosNo", { n: fallidos.length }))
          : (solo ? t("drive.papelera.restaurarNo", { name: solo }) : t("drive.papelera.restaurarAlgunosNo", { n: fallidos.length })));
      }
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

  // De a tramos: hay carpetas con miles de archivos (ver drive/porTramos.ts).
  const { limite, centinela, hayMas } = usePorTramos(`${lugarActual}|${prefs.modo}|${prefs.agrupar}`, ordenados.length);
  const mostrados = useMemo(() => ordenados.slice(0, limite), [ordenados, limite]);
  const TITULOS: Record<Exclude<TipoDeGrupo, "otroMes">, TranslationKey> = {
    hoy: "drive.grupo.hoy", ayer: "drive.grupo.ayer", semana: "drive.grupo.semana", mes: "drive.grupo.mes",
  };
  const tituloDe = (g: Grupo<DriveItem>) => {
    if (g.tipo !== "otroMes") return t(TITULOS[g.tipo]);
    const mes = format(g.inicio, "LLLL", { locale: f.fechas });
    return t("drive.grupo.mesDe", { mes: mes.charAt(0).toUpperCase() + mes.slice(1), anio: g.inicio.getFullYear() });
  };
  const secciones: SeccionDeVista[] = grupos
    ? recortarGrupos(grupos, limite).map((g) => ({ clave: g.clave, titulo: tituloDe(g), items: g.items }))
    : [{ clave: "todo", titulo: null, items: mostrados }];
  // Las miniaturas, solo en cuadrícula y galería, y solo de lo dibujado.
  const miniaturas = useMiniaturasDrive(mostrados, !enLista);
  // El tamaño de las carpetas dibujadas (Jhon, 03/10): de a tandas chicas y a
  // la vez, con el último tamaño conocido mientras cuenta (ver useTamanosDeCarpetas).
  const carpetasDibujadas = useMemo(
    () => mostrados.filter((i) => i.tipo === "carpeta" && i.estado === "listo").map((i) => i.id),
    [mostrados],
  );
  const tamanoDe = useTamanosDeCarpetas(carpetasDibujadas);

  const verDetalles = (i: DriveItem) => { setDetalleDe(i.id); setDetallesAbiertos(true); };

  /** El menú ⋮ de un elemento: el mismo en la lista, la cuadrícula y la galería. */
  const menuDe = (i: DriveItem) => {
    const incompleta = i.estado !== "listo";
    return (
      <DropdownMenuContent align="end" className="w-52">
        {enPapelera ? (
          <>
            <DropdownMenuItem onSelect={() => papeleraDe([i], false, false)}>
              <RotateCcw className="mr-2 h-4 w-4" />{t("drive.accion.restaurar")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => verDetalles(i)}>
              <Info className="mr-2 h-4 w-4" />{t("drive.detalles.boton")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
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
            <DropdownMenuItem onSelect={() => verDetalles(i)}>
              <Info className="mr-2 h-4 w-4" />{t("drive.detalles.boton")}
            </DropdownMenuItem>
            {/* Como «Administrar versiones» de Google: las de lo editado en la Oficina. */}
            {i.tipo === "archivo" && !incompleta && (
              <DropdownMenuItem onSelect={() => setVersionesDe(i)}>
                <History className="mr-2 h-4 w-4" />{t("drive.versiones.boton")}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => papeleraDe([i], true, false)}>
              <Trash2 className="mr-2 h-4 w-4" />{t("drive.accion.papelera")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    );
  };

  /** Las columnas de la lista. En la papelera, una más desde pantallas
   *  grandes: «Ubicación original». */
  const columnasDeLista = enPapelera
    ? "grid-cols-[1.25rem_minmax(0,1fr)_auto] md:grid-cols-[1.25rem_minmax(0,1fr)_10rem_9rem_6rem_2.5rem] lg:grid-cols-[1.25rem_minmax(0,1fr)_10rem_9rem_12rem_6rem_2.5rem]"
    : "grid-cols-[1.25rem_minmax(0,1fr)_auto] md:grid-cols-[1.25rem_minmax(0,1fr)_10rem_9rem_6rem_2.5rem]";

  /** Dónde estaba algo de la papelera: su carpeta (si la puedo ver); arriba
   *  de todo, «Mi unidad» o «Unidades compartidas». */
  const ubicacionOriginal = (i: DriveItem): string => i.ubicacion
    ?? (i.parent_id ? "—"
      : i.owner_id === user?.id ? t("drive.vista.mia")
        : unidadesConNombre.data?.get(i.id)?.tipo === "empresa" ? t("drive.vista.unidades") : "—");

  /** El tamaño: el del archivo o, el de una carpeta, lo que suma adentro. */
  const tamanoDeFicha = (i: DriveItem) => (i.tipo === "carpeta"
    ? (i.estado === "listo" ? <TamanoCarpeta estado={tamanoDe(i.id)} /> : "—")
    : tamano(i.size));

  /** La fecha de la vista, corta, con la completa en el globito. */
  const fechaCorta = (i: DriveItem, className?: string) => {
    const iso = fechaDe(i);
    return <time dateTime={iso} title={fechas.completa(iso)} className={className}>{fechas.corta(iso)}</time>;
  };

  /** La línea chica debajo del nombre en las tarjetas: tamaño (y fecha). */
  const pieDe = (i: DriveItem) => (i.tipo === "carpeta"
    ? tamanoDeFicha(i)
    : <>{tamano(i.size)} · {fechaCorta(i)}</>);

  /** Una fila de la lista (la vista de siempre). */
  const filaDeLista = (i: DriveItem) => {
    const Icono = iconoDe(i);
    const incompleta = i.estado !== "listo";
    const elegida = estadoSel.ids.has(i.id);
    const recibe = i.tipo === "carpeta" && !enPapelera && !incompleta;
    const dueno = enPapelera ? { texto: i.trashed_by ? nombreDe(i.trashed_by) : "—" } : duenoDe(i);
    return (
      <li
        key={i.id}
        draggable={sePuedeMover(i)}
        onDragStart={(e) => empezarArrastre(e, i)}
        onDragEnd={terminarArrastre}
        {...(recibe ? recibeArrastre(i.id, i.id, i.nombre) : {})}
        className={cn(
          "group grid items-center gap-3 border-b border-border/40 px-4 py-1.5 last:border-b-0 hover:bg-muted/40",
          columnasDeLista,
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
          <span className="min-w-0">
            <span className="block truncate">{i.nombre}</span>
            {/* En el teléfono no entran las columnas: tamaño y fecha, abajo.
                aria-hidden: el nombre del botón sigue siendo el del archivo. */}
            <span aria-hidden="true" className="block truncate text-xs text-muted-foreground md:hidden">{pieDe(i)}</span>
          </span>
          {incompleta && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning/15 px-2 text-[11px] text-warning">
              <AlertTriangle className="h-3 w-3" />
              {t("drive.subida.incompleta")}
            </span>
          )}
        </button>
        <span className="hidden truncate text-sm text-muted-foreground md:block" title={dueno.titulo}>{dueno.texto}</span>
        {fechaCorta(i, "hidden truncate text-sm text-muted-foreground md:block")}
        {enPapelera && (
          <span className="hidden truncate text-sm text-muted-foreground lg:block" title={ubicacionOriginal(i)}>{ubicacionOriginal(i)}</span>
        )}
        <span className="hidden text-sm tabular-nums text-muted-foreground md:block">{tamanoDeFicha(i)}</span>
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
          {menuDe(i)}
        </DropdownMenu>
      </li>
    );
  };

  /** Lo que la cuadrícula y la galería necesitan para elegir, arrastrar, abrir
   *  y el menú: lo mismo que usa la lista. */
  const manejo: ManejoDeElemento = {
    elegida: (i) => estadoSel.ids.has(i.id),
    haySeleccion,
    alClicCasilla: (e, i) => { e.preventDefault(); e.stopPropagation(); elegir((s) => clicDeSeleccion(s, orden, i.id, e.shiftKey)); },
    alClicCaptura: (e, i) => {
      if (!e.shiftKey && !e.metaKey && !e.ctrlKey) return;
      e.preventDefault();
      e.stopPropagation();
      elegir((s) => clicDeSeleccion(s, orden, i.id, e.shiftKey));
    },
    abrir,
    arrastrable: sePuedeMover,
    alEmpezarArrastre: empezarArrastre,
    alTerminarArrastre: terminarArrastre,
    recibe: (i) => (i.tipo === "carpeta" && !enPapelera && i.estado === "listo" ? recibeArrastre(i.id, i.id, i.nombre) : {}),
    sobre,
    menu: (i) => menuDe(i),
    icono: iconoDe,
    miniatura: (i) => miniaturas.get(i.id),
    pie: pieDe,
  };

  // Lo que muestra el panel de Detalles.
  const fichaDeLaCarpeta = useFichaDrive(carpeta, detallesAbiertos && !!carpeta);
  const elegidoParaDetalles = detalleDe ? lista.find((i) => i.id === detalleDe) : undefined;
  const objetivo: ObjetivoDeDetalles = elegidoParaDetalles ? { tipo: "uno", item: elegidoParaDetalles }
    : elegidos.length === 1 ? { tipo: "uno", item: elegidos[0] }
      : elegidos.length > 1 ? { tipo: "varios", items: elegidos }
        : carpeta ? (fichaDeLaCarpeta.data ? { tipo: "uno", item: fichaDeLaCarpeta.data } : fichaDeLaCarpeta.isPending ? { tipo: "cargando" } : { tipo: "nada" })
          : { tipo: "nada" };
  const panelAlCostado = useAnchoMinimo(ANCHO_PANEL_AL_COSTADO);
  const cerrarDetalles = () => { setDetallesAbiertos(false); setDetalleDe(null); };
  const propsDelPanel = {
    objetivo,
    duenoDe,
    nombreDe,
    unidades: unidadesConNombre.data,
    tamanoDe,
    icono: iconoDe,
    onIrA: (v: VistaDrive, c: string) => { setDetalleDe(null); ir(v, c); },
    onVersiones: enPapelera ? undefined : (i: DriveItem) => setVersionesDe(i),
  };

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

        {/* Migas a la izquierda; cómo se ve (Lista · Cuadrícula · Galería) y
            «Agrupar por fecha», a la derecha, como en Google Drive. */}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
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
          <SelectorDeVista
            modo={prefs.modo}
            agrupar={prefs.agrupar}
            onModo={(modo) => cambiarPrefs({ modo })}
            onAgrupar={(agrupar) => cambiarPrefs({ agrupar })}
          />
          {/* ⓘ de Google Drive: abre y cierra el panel de Detalles. */}
          <button
            type="button"
            aria-pressed={detallesAbiertos}
            onClick={() => (detallesAbiertos ? cerrarDetalles() : setDetallesAbiertos(true))}
            aria-label={t(detallesAbiertos ? "drive.detalles.ocultar" : "drive.detalles.boton")}
            title={t(detallesAbiertos ? "drive.detalles.ocultar" : "drive.detalles.boton")}
            className={cn(
              "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors",
              detallesAbiertos ? "border-primary/40 bg-primary/15 text-primary" : "border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Info className="h-4 w-4" />
          </button>
        </div>

        {enPapelera && (
          <p className="rounded-panel bg-muted/50 px-4 py-2 text-xs text-muted-foreground">{t("drive.papelera.ayuda")}</p>
        )}

        {/* La lista y, en pantallas anchas, el panel de Detalles al costado. */}
        <div className={cn(detallesAbiertos && panelAlCostado && "flex items-start gap-4")}>
        <div
          // Solo los archivos de la computadora muestran «Suelta para subir»: una
          // fila arrastrada adentro del Drive es para mover, no para subir.
          onDragOver={(e) => { if (sePuedeSubir && tieneTipo(e, "Files")) { e.preventDefault(); setArrastrando(true); } }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={soltar}
          className={cn(
            "relative min-h-[16rem] min-w-0 flex-1 rounded-panel border border-border/60",
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
            "sticky top-0 z-[5] grid min-h-[2.75rem] items-center gap-3 rounded-t-panel border-b border-border/60 bg-background px-4 py-1 text-xs font-medium text-muted-foreground",
            enLista ? columnasDeLista : "grid-cols-[1.25rem_minmax(0,1fr)]",
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
              <div className={cn("min-w-0", enLista && "col-span-2 md:col-span-5", enLista && enPapelera && "lg:col-span-6")}>
                <BarraDeSeleccion n={elegidos.length} acciones={acciones} ocupado={ocupadoConVarios} onLimpiar={soltarSeleccion} />
              </div>
            ) : !enLista ? (
              <span>{lista.length === 1 ? t("drive.elementos.uno") : t("drive.elementos.n", { n: lista.length })}</span>
            ) : (
              <>
                <span>{t("drive.col.nombre")}</span>
                <span className="hidden md:block">{t(enPapelera ? "drive.col.eliminadoPor" : "drive.col.dueno")}</span>
                <span className="hidden md:block">
                  {t(enPapelera ? "drive.col.eliminado" : vista === "recientes" && !carpeta ? "drive.col.abierto" : "drive.col.modificado")}
                </span>
                {enPapelera && <span className="hidden lg:block">{t("drive.col.ubicacion")}</span>}
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
          ) : prefs.modo === "lista" ? (
            <ul>
              {secciones.map((s) => (
                <Fragment key={s.clave}>
                  {s.titulo && (
                    <li role="presentation" className="border-b border-border/40 bg-muted/20 px-4 pb-1.5 pt-3 text-xs font-medium text-muted-foreground">
                      {s.titulo}
                    </li>
                  )}
                  {s.items.map(filaDeLista)}
                </Fragment>
              ))}
            </ul>
          ) : (
            <CuadriculaDrive modo={prefs.modo} secciones={secciones} manejo={manejo} />
          )}
          {/* Al acercarse al final se dibujan los siguientes (carpetas de miles). */}
          {hayMas && <div ref={centinela} aria-hidden className="h-8" />}
        </div>
        {detallesAbiertos && panelAlCostado && (
          <aside className="sticky top-0 flex max-h-[calc(100dvh-6rem)] w-80 shrink-0 flex-col overflow-hidden rounded-panel border border-border/60 bg-card">
            <PanelDeDetalles {...propsDelPanel} onCerrar={cerrarDetalles} />
          </aside>
        )}
        </div>
      </div>

      {/* En pantallas angostas, el panel entra desde la derecha. */}
      {detallesAbiertos && !panelAlCostado && (
        <Sheet open onOpenChange={(v) => { if (!v) cerrarDetalles(); }}>
          <SheetContent side="right" className="flex w-[22rem] max-w-full flex-col p-0" aria-describedby={undefined}>
            <SheetTitle className="sr-only">{t("drive.detalles.titulo")}</SheetTitle>
            <PanelDeDetalles {...propsDelPanel} />
          </SheetContent>
        </Sheet>
      )}

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
          renombrando
          // Como Google: en un archivo queda elegido el nombre sin la extensión.
          sinExtension={renombrando.tipo === "archivo"}
          onCerrar={() => setRenombrando(null)}
          onGuardar={(nombre) => renombrar.mutate({ id: renombrando.id, nombre }, {
            onSuccess: () => setRenombrando(null),
            onError: (e) => toast.error((e as Error).message === SIN_PERMISO_DRIVE
              ? t("drive.renombrar.sinPermiso")
              : (e as Error).message),
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

      {/* Abajo a la derecha, como en Google Drive: las descargas en .zip y las
          subidas, una arriba de la otra.
          ⚠️ No pegado al borde: ahí viven los botones flotantes del Messenger
          y del asistente, y el panel quedaba debajo de ellos (visto en prod el
          28/09). En el teléfono va encima de esos botones; en pantallas
          grandes, a su izquierda. */}
      {(subidas.length > 0 || descargas.length > 0) && (
        <div className="fixed bottom-36 right-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2 sm:bottom-4 sm:right-20">
          {descargas.length > 0 && (
            <PanelDeDescargas
              descargas={descargas}
              onCancelar={cancelarDescarga}
              onElegirDonde={elegirDonde}
              onCerrar={limpiarDescargas}
            />
          )}
          {subidas.length > 0 && <PanelDeSubidas subidas={subidas} onCerrar={limpiar} />}
        </div>
      )}
      {versionesDe && <DriveVersionesDialog item={versionesDe} nombreDe={nombreDe} onCerrar={() => setVersionesDe(null)} />}
      {espacio.dialogo}
      {viendoCupos && <CuposDialog onCerrar={() => setViendoCupos(false)} />}
      <VisorArchivo items={ordenados} abierto={viendo} onAbierto={setViendo} />
    </Page>
  );
}

/** El panelcito de abajo a la derecha de Google Drive, con el avance de cada
 *  archivo. */
function PanelDeSubidas({ subidas, onCerrar }: { subidas: ReturnType<typeof useSubidasDrive>["subidas"]; onCerrar: () => void }) {
  const { t } = useLanguage();
  const pendientes = subidas.filter((s) => s.estado === "subiendo").length;
  return (
    // Dónde va (abajo a la derecha, sin tapar los botones flotantes) lo decide
    // la página, junto con el de las descargas.
    <div className="overflow-hidden rounded-panel border border-border bg-card shadow-xl">
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
