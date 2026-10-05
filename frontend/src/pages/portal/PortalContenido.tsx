import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ChevronRight, Download, File as IconoArchivo, FileImage, FileVideo, Folder, FolderPlus, Loader2, MoreVertical, Pencil,
  RotateCcw, Trash2, Upload, X,
} from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import { usePortal } from "@/hooks/usePortal";
import {
  type ItemDelPortal,
  type Subida,
  useAccionesDelPortal,
  useCarpetaDelPortal,
  useMiniaturasDelPortal,
  useSubidas,
} from "@/hooks/usePortalContenido";
import type { TranslationKey } from "@/lib/i18n";
import { tamano } from "@/lib/drive/formato";
import { vistaDeArchivo } from "@/lib/drive/tipoDeArchivo";
import DialogoDeNombre from "@/components/oficina/DialogoDeNombre";
import { Miniatura } from "@/pages/oficina/drive/VistasDeDrive";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// MI CONTENIDO: su carpeta en el Drive de su agencia. Carpetas, fotos y videos;
// subir desde el celular (por partes, aguanta cortes); ver y bajar; borrar lo
// que subió en las últimas 24 horas. Lo ve su agencia (quien tiene el permiso).

const ERRORES = [
  "sin_espacio_en_la_agencia", "nas_no_responde", "nas_sin_lugar", "demasiado_grande", "ya_no_se_borra",
  "carpeta_con_cosas", "nombre_invalido", "nas_rechazo", "sin_red", "sin_recibo",
] as const;
const textoDeError = (codigo: unknown): TranslationKey =>
  (ERRORES as readonly string[]).includes(String(codigo)) ? (`portal.contenido.error.${codigo}` as TranslationKey) : "portal.contenido.error.generico";

const iconoDe = (i: ItemDelPortal) => {
  if (i.tipo === "carpeta") return Folder;
  const v = vistaDeArchivo({ nombre: i.nombre, mime: i.mime, size: i.size }).tipo;
  return v === "imagen" ? FileImage : v === "video" ? FileVideo : IconoArchivo;
};

export default function PortalContenido() {
  const { activa } = usePortal();
  return <Contenido key={activa.creator_id} creatorId={activa.creator_id} />;
}

function Contenido({ creatorId }: { creatorId: string }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const carpeta = params.get("carpeta");
  const lista = useCarpetaDelPortal(creatorId, carpeta);
  const acciones = useAccionesDelPortal(creatorId);
  const subidas = useSubidas();
  const elegir = useRef<HTMLInputElement>(null);
  const [dialogo, setDialogo] = useState<{ tipo: "carpeta" } | { tipo: "nombre" | "borrar"; item: ItemDelPortal } | null>(null);
  const [viendo, setViendo] = useState<ItemDelPortal | null>(null);

  const items = lista.data?.items ?? [];
  const carpetas = items.filter((i) => i.tipo === "carpeta");
  const archivos = items.filter((i) => i.tipo === "archivo");
  const miniaturas = useMiniaturasDelPortal(creatorId, archivos).data ?? {};
  const aqui = lista.data?.carpeta ?? null;
  const ir = (id: string | null) => setParams(id && id !== lista.data?.raiz ? { carpeta: id } : {});
  const fallo = (e: unknown) => toast({ title: t(textoDeError((e as Error)?.message)), variant: "destructive" });

  return (
    <Page>
      <PageHeader
        title={t("portal.contenido.titulo")}
        subtitle={t("portal.contenido.subtitulo")}
        actions={
          <>
            <Button variant="outline" className="min-h-11" onClick={() => setDialogo({ tipo: "carpeta" })} disabled={!aqui}>
              <FolderPlus className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("portal.contenido.nuevaCarpeta")}
            </Button>
            <Button className="min-h-11" onClick={() => elegir.current?.click()} disabled={!aqui}>
              <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("portal.contenido.subir")}
            </Button>
          </>
        }
      />
      <input
        ref={elegir}
        type="file"
        multiple
        accept="image/*,video/*"
        className="hidden"
        aria-label={t("portal.contenido.subir")}
        onChange={(e) => {
          const lista = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (lista.length && aqui) subidas.agregar(lista, aqui, creatorId);
        }}
      />

      {/* Las migas: Mi contenido › Sesión cocina */}
      {lista.data && lista.data.ruta.length > 1 && (
        <nav aria-label={t("portal.contenido.ruta")} className="mt-4 flex flex-wrap items-center gap-1 text-sm">
          {lista.data.ruta.map((r, n) => {
            const ultima = n === lista.data!.ruta.length - 1;
            const nombre = r.nombre || t("portal.contenido.titulo");
            return (
              <span key={r.id} className="flex items-center gap-1">
                {n > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
                {ultima ? (
                  <span className="font-semibold">{nombre}</span>
                ) : (
                  <button type="button" onClick={() => ir(r.id)} className="min-h-9 rounded-control px-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {nombre}
                  </button>
                )}
              </span>
            );
          })}
        </nav>
      )}

      {subidas.subidas.length > 0 && <PanelDeSubidas />}

      {lista.isLoading ? (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((n) => <Skeleton key={n} className="aspect-square w-full rounded-card" />)}
        </div>
      ) : lista.isError ? (
        <div className="mt-10 text-center">
          <p className="text-sm text-muted-foreground">{t("portal.contenido.errorCargar")}</p>
          <Button className="mt-4" variant="outline" onClick={() => lista.refetch()}>{t("portal.shell.reintentar")}</Button>
        </div>
      ) : items.length === 0 ? (
        <div className="mt-6 flex flex-col items-center rounded-card border border-dashed border-border px-6 py-12 text-center">
          <Upload className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-3 text-base font-semibold">{t("portal.contenido.vacio")}</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t("portal.contenido.vacioTexto")}</p>
          <Button className="mt-5 min-h-11" onClick={() => elegir.current?.click()}>
            <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
            {t("portal.contenido.subir")}
          </Button>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {carpetas.length > 0 && (
            <section aria-label={t("portal.contenido.carpetas")}>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{t("portal.contenido.carpetas")}</h2>
              <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {carpetas.map((c) => (
                  <li key={c.id} className="flex min-h-14 items-center gap-1 rounded-panel border border-border bg-card pr-1">
                    <button type="button" onClick={() => ir(c.id)} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-panel px-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <Folder className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                      <span className="truncate font-medium">{c.nombre}</span>
                    </button>
                    <MenuDe item={c} onNombre={() => setDialogo({ tipo: "nombre", item: c })} onBorrar={() => setDialogo({ tipo: "borrar", item: c })} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {archivos.length > 0 && (
            <section aria-label={t("portal.contenido.archivos")}>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{t("portal.contenido.archivos")}</h2>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
                {archivos.map((a) => (
                  <li key={a.id} className="overflow-hidden rounded-card border border-border bg-card">
                    <button
                      type="button"
                      onClick={() => a.estado === "listo" && setViendo(a)}
                      disabled={a.estado !== "listo"}
                      aria-label={t("portal.contenido.ver", { nombre: a.nombre })}
                      className="block aspect-square w-full bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                      <Miniatura url={miniaturas[a.id]} icono={iconoDe(a)} cubrir />
                    </button>
                    <div className="flex items-start gap-1 p-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{a.nombre}</p>
                        <p className="text-xs text-muted-foreground">
                          {a.estado === "listo" ? tamano(a.size) : t("portal.contenido.estado.subiendo")}
                        </p>
                      </div>
                      <MenuDe item={a} onNombre={() => setDialogo({ tipo: "nombre", item: a })} onBorrar={() => setDialogo({ tipo: "borrar", item: a })} onBajar={() => acciones.abrir(a.id, true).then((u) => { window.location.href = u; }).catch(fallo)} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {dialogo?.tipo === "carpeta" && aqui && (
        <DialogoDeNombre
          titulo={t("portal.contenido.nuevaCarpeta")}
          etiqueta={t("portal.contenido.nombreCarpeta")}
          inicial=""
          boton={t("portal.contenido.crear")}
          ocupado={acciones.crearCarpeta.isPending}
          onCerrar={() => setDialogo(null)}
          onGuardar={(nombre) => acciones.crearCarpeta.mutate({ carpeta: aqui, nombre }, { onSuccess: () => setDialogo(null), onError: fallo })}
        />
      )}
      {dialogo?.tipo === "nombre" && (
        <DialogoDeNombre
          titulo={t("portal.contenido.renombrar")}
          etiqueta={t("portal.contenido.nuevoNombre")}
          inicial={dialogo.item.nombre}
          boton={t("portal.contenido.guardar")}
          ocupado={acciones.renombrar.isPending}
          renombrando
          sinExtension={dialogo.item.tipo === "archivo"}
          onCerrar={() => setDialogo(null)}
          onGuardar={(nombre) => acciones.renombrar.mutate({ id: dialogo.item.id, nombre }, { onSuccess: () => setDialogo(null), onError: fallo })}
        />
      )}
      <AlertDialog open={dialogo?.tipo === "borrar"} onOpenChange={(o) => !o && setDialogo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialogo?.tipo === "borrar" ? t("portal.contenido.borrarTitulo", { nombre: dialogo.item.nombre }) : ""}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(dialogo?.tipo === "borrar" && dialogo.item.tipo === "carpeta" ? "portal.contenido.borrarCarpetaTexto" : "portal.contenido.borrarTexto")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("portal.contenido.cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (dialogo?.tipo !== "borrar") return;
                acciones.borrar.mutate(dialogo.item.id, { onSuccess: () => setDialogo(null), onError: (er) => { setDialogo(null); fallo(er); } });
              }}
            >
              {acciones.borrar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {t("portal.contenido.borrar")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {viendo && <Visor item={viendo} abrir={acciones.abrir} onCerrar={() => setViendo(null)} />}
    </Page>
  );
}

function MenuDe({ item, onNombre, onBorrar, onBajar }: { item: ItemDelPortal; onNombre: () => void; onBorrar: () => void; onBajar?: () => void }) {
  const { t } = useLanguage();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("portal.contenido.opciones", { nombre: item.nombre })}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MoreVertical className="h-5 w-5" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onBajar && item.estado === "listo" && (
          <DropdownMenuItem onSelect={onBajar} className="min-h-11 gap-2"><Download className="h-4 w-4" aria-hidden="true" />{t("portal.contenido.descargar")}</DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={onNombre} className="min-h-11 gap-2"><Pencil className="h-4 w-4" aria-hidden="true" />{t("portal.contenido.renombrar")}</DropdownMenuItem>
        {item.se_puede_borrar && (
          <DropdownMenuItem onSelect={onBorrar} className="min-h-11 gap-2 text-destructive focus:text-destructive"><Trash2 className="h-4 w-4" aria-hidden="true" />{t("portal.contenido.borrar")}</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const ESTADO: Record<Subida["estado"], TranslationKey> = {
  esperando: "portal.contenido.estado.esperando",
  subiendo: "portal.contenido.estado.subiendo",
  reintentando: "portal.contenido.estado.reintentando",
  sin_internet: "portal.contenido.estado.sin_internet",
  lista: "portal.contenido.estado.lista",
  error: "portal.contenido.estado.error",
  cancelada: "portal.contenido.estado.cancelada",
};

/** Lo que se está subiendo: el total arriba y cada archivo con su barra. */
export function PanelDeSubidas() {
  const { t } = useLanguage();
  const { subidas, cancelar, reintentar, limpiar, activas } = useSubidas();
  const enCurso = subidas.filter((s) => ["esperando", "subiendo", "reintentando", "sin_internet"].includes(s.estado));
  const total = subidas.reduce((n, s) => n + s.size, 0);
  const enviado = subidas.reduce((n, s) => n + (s.estado === "lista" ? s.size : s.enviado), 0);
  return (
    <section aria-live="polite" className="mt-4 rounded-card border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">
          {activas ? t("portal.contenido.subiendoTitulo", { n: enCurso.length }) : t("portal.contenido.subidasListas")}
        </h2>
        <span className="text-sm tabular-nums text-muted-foreground">{t("portal.contenido.progresoTotal", { enviado: tamano(enviado), total: tamano(total) })}</span>
      </div>
      {activas && <p className="mt-1 text-xs text-muted-foreground">{t("portal.contenido.subiendoAviso")}</p>}
      <ul className="mt-3 space-y-3">
        {subidas.map((s) => (
          <li key={s.clave}>
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-sm font-medium">{s.nombre}</span>
              <span className="flex shrink-0 items-center gap-1">
                <span className={cn("text-xs", s.estado === "error" ? "text-destructive" : s.estado === "lista" ? "text-success" : "text-muted-foreground")}>
                  {t(ESTADO[s.estado])}
                </span>
                {s.estado === "error" && (
                  <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={t("portal.contenido.reintentar", { nombre: s.nombre })} onClick={() => reintentar(s.clave)}>
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}
                {["esperando", "subiendo", "reintentando", "sin_internet"].includes(s.estado) && (
                  <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={t("portal.contenido.cancelarSubida", { nombre: s.nombre })} onClick={() => cancelar(s.clave)}>
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}
              </span>
            </div>
            {s.estado !== "lista" && s.estado !== "cancelada" && (
              <Progress value={s.size ? (s.enviado / s.size) * 100 : 0} className="mt-1.5 h-1.5" aria-label={s.nombre} />
            )}
            {s.estado === "error" && s.error && <p className="mt-1 text-xs text-destructive">{t(textoDeError(s.error))}</p>}
          </li>
        ))}
      </ul>
      {!activas && (
        <Button variant="link" className="mt-2 h-auto px-0" onClick={limpiar}>{t("portal.contenido.limpiar")}</Button>
      )}
    </section>
  );
}

/** Ver una foto o un video, con su botón para bajarlo. Lo demás, se baja. */
function Visor({ item, abrir, onCerrar }: { item: ItemDelPortal; abrir: (id: string, descargar?: boolean) => Promise<string>; onCerrar: () => void }) {
  const { t } = useLanguage();
  const [url, setUrl] = useState<string | null>(null);
  const [fallo, setFallo] = useState(false);
  const tipo = vistaDeArchivo({ nombre: item.nombre, mime: item.mime, size: item.size }).tipo;
  useEffect(() => {
    let vivo = true;
    abrir(item.id).then((u) => vivo && setUrl(u)).catch(() => vivo && setFallo(true));
    return () => { vivo = false; };
  }, [abrir, item.id]);
  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="flex h-[100dvh] max-w-none flex-col gap-0 rounded-none border-0 bg-background p-0 sm:h-[90dvh] sm:max-w-5xl sm:rounded-card">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
          <DialogTitle className="min-w-0 truncate text-base">{item.nombre}</DialogTitle>
          <div className="flex shrink-0 items-center gap-1 pr-8">
            <Button variant="ghost" size="sm" onClick={() => abrir(item.id, true).then((u) => { window.location.href = u; }).catch(() => setFallo(true))}>
              <Download className="mr-2 h-4 w-4" aria-hidden="true" />
              {t("portal.contenido.descargar")}
            </Button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center bg-black/90 p-2">
          {fallo ? (
            <p className="text-sm text-white/80">{t("portal.contenido.error.generico")}</p>
          ) : !url ? (
            <Loader2 className="h-8 w-8 animate-spin text-white/70" aria-hidden="true" />
          ) : tipo === "imagen" ? (
            <img src={url} alt={item.nombre} className="max-h-full max-w-full object-contain" />
          ) : tipo === "video" ? (
            <video src={url} controls playsInline preload="metadata" className="max-h-full max-w-full" />
          ) : (
            <p className="text-sm text-white/80">{t("portal.contenido.sinVistaPrevia")}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
