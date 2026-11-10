import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowLeft, ChevronRight, Download, File as IconoArchivo, Film, Folder, Image as IconoImagen,
  Inbox, Loader2, Play, RefreshCw, Share2,
} from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CajaDeLink, urlDeAportar } from "@/components/oficina/LinkDeSubida";
import { mandarAlNas } from "@/hooks/useDriveVarios";
import { tamano } from "@/lib/drive/formato";
import {
  esImagen, esVideo, type HijoDeCarpeta, hoyEnColombia, invocarAporte, type Listado, queDiaEs,
} from "@/lib/aportar/api";

// LO QUE HAY EN LA CARPETA DE LA CREADORA, por link y sin cuenta (Alvaro,
// 10/11/2026: «como Dropbox»). Carpetas por día arriba, archivos con miniatura,
// tocar uno lo abre (foto o video) con «Bajar»; una carpeta se baja entera en
// .zip y, si el link es el de la creadora, se comparte con un link de solo ver.
// Todo lo firma la edge drive-aporte después de comprobar que es de este link.

const DE_A = 90;

export function ExploradorDeCarpeta({ token, raizId, modo, puedeCompartir, version }: {
  token: string;
  /** Dónde arranca: la carpeta del link o «Del equipo». */
  raizId: string;
  /** «mios»: lo de la creadora (sin «Del equipo», que tiene su pestaña). */
  modo: "mios" | "equipo" | "compartida";
  puedeCompartir: boolean;
  /** Sube cuando termina una subida, para volver a leer. */
  version: number;
}) {
  const { t, language } = useLanguage();
  const [carpetaId, setCarpetaId] = useState(raizId);
  const [cuantos, setCuantos] = useState(DE_A);
  const [abierto, setAbierto] = useState<HijoDeCarpeta | null>(null);
  const [bajando, setBajando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [compartido, setCompartido] = useState<string | null>(null);
  const [compartiendo, setCompartiendo] = useState(false);

  useEffect(() => { setCarpetaId(raizId); }, [raizId]);
  useEffect(() => { setCuantos(DE_A); setAviso(null); setCompartido(null); }, [carpetaId]);

  const q = useQuery<Listado>({
    queryKey: ["aportar-listar", token, carpetaId, version],
    queryFn: () => invocarAporte<Listado>(token, "listar", { carpeta: carpetaId }),
    staleTime: 30_000,
    retry: 1,
  });

  const enRaiz = carpetaId === raizId;
  const hijos = useMemo(
    () => (q.data?.hijos ?? []).filter((h) => !(modo === "mios" && enRaiz && h.del_equipo)),
    [q.data, modo, enRaiz],
  );
  const carpetas = hijos.filter((h) => h.tipo === "carpeta");
  const archivos = hijos.filter((h) => h.tipo === "archivo");
  const visibles = archivos.slice(0, cuantos);
  const idsConMiniatura = visibles.filter((h) => h.estado === "listo").map((h) => h.id);

  const minis = useQuery<Record<string, string>>({
    queryKey: ["aportar-minis", token, carpetaId, idsConMiniatura.length, version],
    enabled: idsConMiniatura.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => (await invocarAporte<{ urls: Record<string, string> }>(token, "miniaturas", { carpeta: carpetaId, ids: idsConMiniatura })).urls ?? {},
  });

  // La ruta desde donde arranca esta vista (no más arriba).
  const ruta = useMemo(() => {
    const r = q.data?.ruta ?? [];
    const i = r.findIndex((x) => x.id === raizId);
    return i >= 0 ? r.slice(i) : r;
  }, [q.data, raizId]);

  const hoy = hoyEnColombia();
  const nombreDe = (nombre: string) => {
    const d = queDiaEs(nombre, hoy);
    if (d === "hoy") return t("drive.carpeta.hoy");
    if (d === "ayer") return t("drive.carpeta.ayer");
    if (d instanceof Date) {
      return d.toLocaleDateString(language === "es" ? "es-CO" : "en-US", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    }
    return nombre;
  };

  async function bajarTodo() {
    setBajando(true);
    setAviso(null);
    try {
      const p = await invocarAporte<{ url: string; t: string }>(token, "bajar_carpeta", { carpeta: carpetaId });
      mandarAlNas(p.url, p.t, () => setAviso(t("drive.carpeta.falloBajar")));
    } catch (e) {
      setAviso((e as Error).message || t("drive.carpeta.falloBajar"));
    } finally {
      // El NAS tarda en arrancar el .zip: se deja el botón quieto un momento.
      setTimeout(() => setBajando(false), 4000);
    }
  }

  async function compartirCarpeta() {
    setCompartiendo(true);
    setAviso(null);
    try {
      const r = await invocarAporte<{ token: string }>(token, "crear_link", { tipo: "ver", carpeta: carpetaId, nombre: q.data?.carpeta.nombre });
      setCompartido(urlDeAportar(r.token));
    } catch (e) {
      setAviso((e as Error).message || t("drive.carpeta.compartir.falloCrear"));
    } finally {
      setCompartiendo(false);
    }
  }

  if (q.isLoading) {
    return <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />{t("drive.carpeta.cargandoCarpeta")}</div>;
  }
  if (q.isError || !q.data) {
    // Un fallo no es «carpeta vacía»: se dice y se ofrece reintentar.
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-panel border border-destructive/30 bg-destructive/10 p-4 text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
        <span className="min-w-0 flex-1">{t("drive.carpeta.falloCarpeta")}</span>
        <Button variant="outline" size="sm" onClick={() => void q.refetch()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />{t("drive.carpeta.reintentar")}</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {!enRaiz && (
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="outline" size="sm" className="shrink-0" onClick={() => setCarpetaId(ruta.length > 1 ? ruta[ruta.length - 2].id : raizId)}>
            <ArrowLeft className="mr-1 h-3.5 w-3.5" />{t("drive.carpeta.volver")}
          </Button>
          <p className="min-w-0 truncate text-sm font-semibold">{nombreDe(q.data.carpeta.nombre)}</p>
        </div>
      )}

      {(archivos.length > 0 || (!enRaiz && puedeCompartir)) && (
        <div className="flex flex-wrap gap-2">
          {archivos.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => void bajarTodo()} disabled={bajando}>
              {bajando ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
              {t(bajando ? "drive.carpeta.bajandoTodo" : "drive.carpeta.bajarTodo")}
            </Button>
          )}
          {!enRaiz && puedeCompartir && modo === "mios" && (
            <Button size="sm" variant="outline" onClick={() => void compartirCarpeta()} disabled={compartiendo}>
              {compartiendo ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Share2 className="mr-1.5 h-3.5 w-3.5" />}
              {t("drive.carpeta.compartirCarpeta")}
            </Button>
          )}
        </div>
      )}
      {compartido && (
        <div className="flex flex-col gap-1.5 rounded-panel border border-primary/30 bg-primary/10 p-3">
          <p className="text-xs text-muted-foreground">{t("drive.carpeta.compartir.listoVer")}</p>
          <CajaDeLink url={compartido} />
        </div>
      )}
      {aviso && <p role="alert" className="text-xs text-destructive">{aviso}</p>}

      {carpetas.length === 0 && archivos.length === 0 ? (
        <p className="rounded-panel border border-border/50 bg-card/30 p-6 text-center text-sm text-muted-foreground">
          {t(modo === "equipo" && enRaiz ? "drive.carpeta.equipoVacio" : "drive.carpeta.vacia")}
        </p>
      ) : null}

      {carpetas.length > 0 && (
        <ul className="flex flex-col divide-y divide-border/40 overflow-hidden rounded-panel border border-border/50 bg-card/30">
          {carpetas.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => setCarpetaId(c.id)}
                className="flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-foreground/5">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-control ${c.del_equipo ? "bg-primary/15 text-primary" : "bg-muted/40 text-muted-foreground"}`}>
                  {c.del_equipo ? <Inbox className="h-4 w-4" /> : <Folder className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{c.del_equipo ? t("drive.carpeta.tab.equipo") : nombreDe(c.nombre)}</span>
                  <span className="block text-xs text-muted-foreground tabular-nums">{t("drive.carpeta.nArchivos", { n: c.hijos ?? 0 })}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {visibles.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {visibles.map((f) => {
            const mini = minis.data?.[f.id];
            const listo = f.estado === "listo";
            return (
              <button key={f.id} type="button" disabled={!listo} onClick={() => setAbierto(f)} title={f.nombre}
                className="relative aspect-square overflow-hidden rounded-control border border-border/50 bg-card/40 text-muted-foreground transition hover:border-primary/50 disabled:cursor-wait">
                {mini ? (
                  <img src={mini} alt={f.nombre} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full flex-col items-center justify-center gap-1 p-2">
                    {esVideo(f) ? <Film className="h-6 w-6" /> : esImagen(f) ? <IconoImagen className="h-6 w-6" /> : <IconoArchivo className="h-6 w-6" />}
                    <span className="w-full truncate text-center text-[10px]">{f.nombre}</span>
                  </span>
                )}
                {esVideo(f) && listo && (
                  <span className="absolute bottom-1 left-1 flex h-5 w-5 items-center justify-center rounded-full bg-background/80 text-foreground">
                    <Play className="h-3 w-3" />
                  </span>
                )}
                {!listo && (
                  <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background/70 text-[10px] text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />{t("drive.carpeta.procesando")}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      {archivos.length > visibles.length && (
        <Button variant="outline" size="sm" className="self-center" onClick={() => setCuantos((n) => n + DE_A)}>
          {t("drive.carpeta.verMas", { n: archivos.length - visibles.length })}
        </Button>
      )}

      <Visor token={token} archivo={abierto} alCerrar={() => setAbierto(null)} />
    </div>
  );
}

/** Abre una foto o un video de la carpeta, con «Bajar» el original. */
function Visor({ token, archivo, alCerrar }: { token: string; archivo: HijoDeCarpeta | null; alCerrar: () => void }) {
  const { t } = useLanguage();
  const [bajando, setBajando] = useState(false);
  const [fallo, setFallo] = useState(false);
  const ver = useQuery<string>({
    queryKey: ["aportar-abrir", token, archivo?.id],
    enabled: !!archivo,
    staleTime: 60 * 60_000,
    queryFn: async () => (await invocarAporte<{ url: string }>(token, "abrir", { id: archivo!.id })).url,
  });

  async function bajar() {
    if (!archivo) return;
    setBajando(true);
    setFallo(false);
    try {
      const { url } = await invocarAporte<{ url: string }>(token, "abrir", { id: archivo.id, descargar: true });
      // El NAS responde «para guardar»: la página no se va.
      window.location.assign(url);
    } catch {
      setFallo(true);
    } finally {
      setBajando(false);
    }
  }

  return (
    <Dialog open={!!archivo} onOpenChange={(o) => { if (!o) alCerrar(); }}>
      <DialogContent className="max-w-3xl gap-3 p-3 sm:p-4">
        <DialogTitle className="truncate pr-8 text-sm">{archivo?.nombre}</DialogTitle>
        <div className="flex max-h-[70vh] min-h-[200px] items-center justify-center overflow-hidden rounded-control bg-black/80">
          {ver.isLoading ? (
            <Loader2 className="h-6 w-6 animate-spin text-white/70" />
          ) : ver.isError || !ver.data ? (
            <p className="p-6 text-center text-sm text-white/80">{t("drive.carpeta.falloAbrir")}</p>
          ) : archivo && esVideo(archivo) ? (
            <video src={ver.data} controls playsInline className="max-h-[70vh] w-full" />
          ) : archivo && esImagen(archivo) ? (
            <img src={ver.data} alt={archivo.nombre} className="max-h-[70vh] w-auto object-contain" />
          ) : (
            <p className="p-6 text-center text-sm text-white/80">{t("drive.carpeta.sinVista")}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 text-xs text-muted-foreground tabular-nums">{archivo?.size ? tamano(archivo.size) : ""}</span>
          {fallo && <span className="text-xs text-destructive">{t("drive.carpeta.falloBajar")}</span>}
          <Button size="sm" onClick={() => void bajar()} disabled={bajando}>
            {bajando ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
            {t("drive.carpeta.bajar")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
