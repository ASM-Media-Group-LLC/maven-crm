import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { format, isToday, isThisYear } from "date-fns";
import {
  Building2, ChevronRight, Clock, Download, File, FileArchive, FileImage, FileSpreadsheet, FileText, FileVideo,
  Folder, FolderPlus, HardDrive, Loader2, MoreVertical, Pencil, Plus, RotateCcw, Share2, Trash2,
  Upload, Users, X, AlertTriangle, Check,
} from "lucide-react";
import { toast } from "sonner";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { SubtabNav, SubtabNavItem } from "@/components/ui/subtab-nav";
import { Button } from "@/components/ui/button";
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

  const lista = items.data ?? [];

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
            <button type="button" onClick={() => ir(vista)} className="rounded-full px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground">
              {t(VISTAS.find((v) => v.id === vista)!.clave)}
            </button>
            {(ruta.data ?? []).map((r, n, todo) => (
              <span key={r.id} className="flex min-w-0 items-center gap-0.5">
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                {n === todo.length - 1 ? (
                  <span className="truncate px-2 py-1 font-medium">{r.nombre}</span>
                ) : (
                  <button type="button" onClick={() => ir(vista, r.id)} className="truncate rounded-full px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground">
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
          onDragOver={(e) => { if (sePuedeSubir) { e.preventDefault(); setArrastrando(true); } }}
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

          {/* Encabezado de columnas (se esconden en el teléfono) */}
          <div className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-border/60 px-4 py-2 text-xs font-medium text-muted-foreground md:grid-cols-[minmax(0,1fr)_10rem_9rem_6rem_2.5rem]">
            <span>{t("drive.col.nombre")}</span>
            <span className="hidden md:block">{t("drive.col.dueno")}</span>
            <span className="hidden md:block">{t("drive.col.modificado")}</span>
            <span className="hidden md:block">{t("drive.col.tamano")}</span>
            <span />
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
                return (
                  <li
                    key={i.id}
                    className="group grid grid-cols-[1fr_auto] items-center gap-3 border-b border-border/40 px-4 py-1.5 last:border-b-0 hover:bg-muted/40 md:grid-cols-[minmax(0,1fr)_10rem_9rem_6rem_2.5rem]"
                  >
                    {/* Un clic (o Enter) abre, carpeta o archivo: como Drive en el
                        teléfono. Con doble clic, en el celular no se podía abrir
                        nada, y el teclado (detail 0) no abría las carpetas. */}
                    {/* ⚠️ soloUnClic: el 2.º clic de un doble clic no abre otra vez. */}
                    <button
                      type="button"
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
                            {i.tipo === "archivo" && !incompleta && (
                              <DropdownMenuItem onSelect={() => abrirArchivo(i.id, true).catch((e) => toast.error((e as Error).message))}>
                                <Download className="mr-2 h-4 w-4" />{t("drive.accion.descargar")}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onSelect={() => setCompartiendo(i)}>
                              <Share2 className="mr-2 h-4 w-4" />{t("drive.accion.compartir")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setRenombrando(i)}>
                              <Pencil className="mr-2 h-4 w-4" />{t("drive.accion.renombrar")}
                            </DropdownMenuItem>
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
