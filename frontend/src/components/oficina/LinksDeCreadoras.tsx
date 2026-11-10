import { useMemo, useState } from "react";
import { Link as LinkRouter } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { es as esLocale } from "date-fns/locale";
import { AlertTriangle, Check, Copy, FolderOpen, FolderPlus, Link2, Loader2, MessageCircle, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tamano } from "@/lib/drive/formato";
import { urlDeAportar, useCopiar } from "@/components/oficina/LinkDeSubida";

// LAS CREADORAS Y SU LINK PERSONAL (Alvaro, 10/11/2026: «crear las 63 y
// pasarme la lista»). Cada creadora activa con su carpeta del Drive y su link
// personal (/aportar/<token>: sube, ve lo suyo por día, recibe «Del equipo» y
// comparte con su fotógrafo). Alvaro se lo manda: «Copiar mensaje» deja el
// texto listo y «Abrir WhatsApp» abre el chat con el mensaje escrito; nadie lo
// manda por él. Datos: RPC drive_links_de_creadoras.

export interface FilaCreadora {
  creator_id: string;
  nombre: string | null;
  artistico: string | null;
  telefono: string | null;
  carpeta_id: string | null;
  carpeta: string | null;
  raiz_id: string | null;
  raiz: string | null;
  token: string | null;
  archivos: number;
  bytes: number;
  ultimo: string | null;
  usado_at: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { rpc: (f: string, a?: unknown) => Promise<{ data: any; error: { message: string } | null }> };

export const nombreDeCreadora = (f: Pick<FilaCreadora, "artistico" | "nombre">) => (f.artistico?.trim() || f.nombre?.trim() || "—");

/** El chat de WhatsApp con el mensaje ya escrito (solo dígitos en el número). */
export function enlaceDeWhatsapp(telefono: string | null, texto: string): string | null {
  const digitos = (telefono ?? "").replace(/\D/g, "");
  if (digitos.length < 8) return null;
  return `https://wa.me/${digitos}?text=${encodeURIComponent(texto)}`;
}

/** Dónde se puede crear la carpeta de una que no tiene: las carpetas donde ya
 *  están las de las demás («CONTENIDO MASSIVE», «CONTENIDO PLUS»…). */
export function raicesDe(filas: FilaCreadora[]): { id: string; nombre: string }[] {
  const vistas = new Map<string, string>();
  for (const f of filas) if (f.raiz_id && f.raiz) vistas.set(f.raiz_id, f.raiz);
  return [...vistas].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre));
}

export function filtrarCreadoras(filas: FilaCreadora[], q: string): FilaCreadora[] {
  const norm = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const b = norm(q.trim());
  if (!b) return filas;
  return filas.filter((f) => [f.nombre, f.artistico, f.carpeta].some((x) => norm(x).includes(b)));
}

function hace(iso: string, idioma: string): string {
  try { return formatDistanceToNowStrict(new Date(iso), { addSuffix: true, locale: idioma === "es" ? esLocale : undefined }); } catch { return "—"; }
}

export function LinksDeCreadoras() {
  const q = useQuery<FilaCreadora[]>({
    queryKey: ["drive-links-de-creadoras"],
    staleTime: 60_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await sinTipar.rpc("drive_links_de_creadoras");
      if (error) throw new Error(error.message);
      return ((data ?? []) as FilaCreadora[]).map((f) => ({ ...f, archivos: Number(f.archivos), bytes: Number(f.bytes) }));
    },
  });
  return <LinksDeCreadorasVista filas={q.data} cargando={q.isLoading} fallo={q.isError} onReintentar={() => void q.refetch()} />;
}

/** Solo dibuja (separada para el banco visual). */
export function LinksDeCreadorasVista({ filas, cargando, fallo, onReintentar }: {
  filas: FilaCreadora[] | undefined; cargando: boolean; fallo: boolean; onReintentar: () => void;
}) {
  const { t, language } = useLanguage();
  const [busqueda, setBusqueda] = useState("");
  const [haciendo, setHaciendo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { copiado, copiar } = useCopiar();

  const todas = filas ?? [];
  const raices = useMemo(() => raicesDe(todas), [todas]);
  const vistas = useMemo(() => {
    const f = filtrarCreadoras(todas, busqueda);
    // Las que no tienen carpeta, al final.
    return [...f.filter((x) => x.carpeta_id), ...f.filter((x) => !x.carpeta_id)];
  }, [todas, busqueda]);
  const conLink = todas.filter((f) => f.token).length;
  const sinCarpeta = todas.filter((f) => !f.carpeta_id).length;

  async function hacer(id: string, accion: () => Promise<void>) {
    setHaciendo(id);
    setError(null);
    try {
      await accion();
      onReintentar();
    } catch (e) {
      setError(t("drive.creadoras.falloAccion", { m: (e as Error).message }));
    } finally {
      setHaciendo(null);
    }
  }
  const crearLink = (f: FilaCreadora) => hacer(f.creator_id, async () => {
    const { error } = await sinTipar.rpc("drive_link_personal", { _creator: f.creator_id });
    if (error) throw new Error(error.message);
  });
  const crearCarpeta = (f: FilaCreadora, raiz: string) => hacer(f.creator_id, async () => {
    const r1 = await sinTipar.rpc("drive_crear_carpeta_creadora", { _creator: f.creator_id, _dentro_de: raiz });
    if (r1.error) throw new Error(r1.error.message);
    const r2 = await sinTipar.rpc("drive_link_personal", { _creator: f.creator_id });
    if (r2.error) throw new Error(r2.error.message);
  });

  if (cargando) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (fallo) {
    return (
      <div role="alert" className="vidrio flex flex-wrap items-center gap-3 p-4 text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
        <span className="min-w-0 flex-1">{t("drive.creadoras.fallo")}</span>
        <Button variant="outline" size="sm" onClick={onReintentar}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />{t("drive.links.reintentar")}</Button>
      </div>
    );
  }
  if (!todas.length) return <p className="vidrio p-6 text-sm text-muted-foreground">{t("drive.creadoras.vacio")}</p>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder={t("drive.creadoras.buscar")}
            aria-label={t("drive.creadoras.buscar")} className="pl-8" />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">{t("drive.creadoras.resumen", { n: todas.length, c: conLink, s: sinCarpeta })}</span>
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

      {vistas.length === 0 ? (
        <p className="vidrio p-6 text-sm text-muted-foreground">{t("drive.links.sinResultados", { q: busqueda })}</p>
      ) : (
        <ul className="vidrio divide-y divide-border/50 overflow-hidden">
          {vistas.map((f) => {
            const nombre = nombreDeCreadora(f);
            const url = f.token ? urlDeAportar(f.token) : null;
            const mensaje = url ? t("drive.creadoras.mensaje", { n: nombre, url }) : "";
            const wa = url ? enlaceDeWhatsapp(f.telefono, mensaje) : null;
            const ocupada = haciendo === f.creator_id;
            return (
              <li key={f.creator_id} className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-4 sm:px-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{nombre}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {f.carpeta ? (f.raiz ? `${f.raiz} › ${f.carpeta}` : f.carpeta) : t("drive.creadoras.sinCarpeta")}
                  </p>
                </div>
                <div className="min-w-0 text-xs">
                  {f.carpeta_id && (
                    <>
                      <p className="font-medium tabular-nums">
                        {f.archivos > 0
                          ? t("drive.links.recibido", { n: f.archivos.toLocaleString(language === "es" ? "es-CO" : "en-US"), tam: tamano(f.bytes) })
                          : t("drive.creadoras.nadaAun")}
                      </p>
                      {f.token && (
                        <p className="text-muted-foreground">
                          {f.usado_at ? t("drive.creadoras.abierto", { hace: hace(f.usado_at, language) }) : t("drive.creadoras.nuncaAbierto")}
                        </p>
                      )}
                    </>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  {url ? (
                    <>
                      <Button size="sm" variant="outline" onClick={() => void copiar(mensaje)}>
                        {copiado === mensaje ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                        {t(copiado === mensaje ? "drive.creadoras.mensajeCopiado" : "drive.creadoras.copiarMensaje")}
                      </Button>
                      {wa && (
                        <Button size="sm" variant="outline" asChild>
                          <a href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle className="mr-1.5 h-3.5 w-3.5" />{t("drive.creadoras.whatsapp")}</a>
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => void copiar(url)}>
                        {copiado === url ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Link2 className="mr-1.5 h-3.5 w-3.5" />}
                        {t(copiado === url ? "drive.links.copiado" : "drive.creadoras.copiarLink")}
                      </Button>
                    </>
                  ) : f.carpeta_id ? (
                    <Button size="sm" onClick={() => void crearLink(f)} disabled={ocupada}>
                      {ocupada ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Link2 className="mr-1.5 h-3.5 w-3.5" />}
                      {t("drive.creadoras.crearLink")}
                    </Button>
                  ) : (
                    raices.map((r) => (
                      <Button key={r.id} size="sm" variant="outline" onClick={() => void crearCarpeta(f, r.id)} disabled={ocupada}>
                        {ocupada ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FolderPlus className="mr-1.5 h-3.5 w-3.5" />}
                        {t("drive.creadoras.crearEn", { c: r.nombre })}
                      </Button>
                    ))
                  )}
                  {f.carpeta_id && (
                    <Button size="sm" variant="ghost" asChild>
                      <LinkRouter to={`/oficina/drive?carpeta=${f.carpeta_id}`}><FolderOpen className="mr-1.5 h-3.5 w-3.5" />{t("drive.links.abrir")}</LinkRouter>
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
