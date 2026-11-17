import { useMemo, useState } from "react";
import { Link as LinkRouter } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { es as esLocale } from "date-fns/locale";
import { AlertTriangle, ArrowLeft, Check, Copy, Folder, FolderOpen, Link2, Loader2, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tamano } from "@/lib/drive/formato";
import { urlDeAportar, useCopiar } from "@/components/oficina/LinkDeSubida";
import { LinksDeCreadoras } from "@/components/oficina/LinksDeCreadoras";

// LINKS DE LAS MODELOS (Alvaro, 10/11/2026): "¿dónde vergas está el link donde
// las modelos meten sus videos?". Todos los links de subida activos en un solo
// lugar: de qué carpeta (= qué modelo) es, cuánto ha mandado, cuándo fue lo
// último y quién lo creó, con Copiar y Abrir carpeta. Arriba lo reciente; al
// final, resaltadas, las que NUNCA han mandado nada. Datos: RPC
// drive_links_de_subida (dueño/admin/Drive completo ven todos; el resto, los suyos).

export interface LinkDeModelo {
  token: string;
  carpeta_id: string;
  carpeta: string;
  padre: string | null;
  creado_por: string | null;
  creado_at: string;
  archivos: number;
  bytes: number;
  ultimo: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { rpc: (f: string, a?: unknown) => Promise<{ data: any; error: { message: string } | null }> };

/** Una carpeta genérica («SCRIPT», «FEED») no dice de quién es: se le antepone
 *  la de arriba («YOISNIA › SCRIPT»). Las de agencia («CONTENIDO PLUS») no. */
export function nombreDeLaCarpeta(l: Pick<LinkDeModelo, "carpeta" | "padre">): string {
  return l.padre && !/^contenido\b/i.test(l.padre) ? `${l.padre} › ${l.carpeta}` : l.carpeta;
}

/** Busca sin tildes ni mayúsculas, en la carpeta, la de arriba y quién lo creó. */
export function filtrarLinks(links: LinkDeModelo[], q: string): LinkDeModelo[] {
  const norm = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const b = norm(q.trim());
  if (!b) return links;
  return links.filter((l) => [l.carpeta, l.padre, l.creado_por].some((x) => norm(x).includes(b)));
}

function hace(iso: string, idioma: string): string {
  try { return formatDistanceToNowStrict(new Date(iso), { addSuffix: true, locale: idioma === "es" ? esLocale : undefined }); } catch { return "—"; }
}

export default function LinksDeSubidaPage() {
  const { t } = useLanguage();
  const q = useQuery<LinkDeModelo[]>({
    queryKey: ["drive-links-de-subida"],
    staleTime: 60_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await sinTipar.rpc("drive_links_de_subida");
      if (error) throw new Error(error.message);
      return ((data ?? []) as LinkDeModelo[]).map((l) => ({ ...l, archivos: Number(l.archivos), bytes: Number(l.bytes) }));
    },
  });

  return (
    <Page>
      <PageHeader
        title={t("drive.links.titulo")}
        subtitle={t("drive.links.subtitulo")}
        icon={<Link2 />}
        actions={(
          <Button asChild variant="outline">
            <LinkRouter to="/oficina/drive" aria-label={t("drive.links.volver")}>
              <ArrowLeft className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">{t("drive.links.volver")}</span>
            </LinkRouter>
          </Button>
        )}
      />
      <div className="flex flex-col gap-8">
        <section className="flex flex-col gap-3">
          <div className="px-1">
            <h2 className="font-display text-lg font-semibold tracking-tight">{t("drive.creadoras.titulo")}</h2>
            <p className="max-w-3xl text-xs text-muted-foreground">{t("drive.creadoras.desc")}</p>
          </div>
          <LinksDeCreadoras />
        </section>
        <section className="flex flex-col gap-3">
          <div className="px-1">
            <h2 className="font-display text-lg font-semibold tracking-tight">{t("drive.links.otros")}</h2>
            <p className="max-w-3xl text-xs text-muted-foreground">{t("drive.links.otrosDesc")}</p>
          </div>
          <LinksDeSubidaVista links={q.data} cargando={q.isLoading} fallo={q.isError} onReintentar={() => void q.refetch()} />
        </section>
      </div>
    </Page>
  );
}

/** Solo dibuja (separada para el banco visual: /harness.html?ver=links). */
export function LinksDeSubidaVista({ links, cargando, fallo, onReintentar }: {
  links: LinkDeModelo[] | undefined; cargando: boolean; fallo: boolean; onReintentar: () => void;
}) {
  const { t, language } = useLanguage();
  const [busqueda, setBusqueda] = useState("");
  const { copiado, copiar } = useCopiar();
  const vistos = useMemo(() => filtrarLinks(links ?? [], busqueda), [links, busqueda]);
  const nunca = (links ?? []).filter((l) => l.archivos === 0).length;

  if (cargando) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (fallo) {
    // Un fallo no es "no hay links": se dice y se ofrece reintentar.
    return (
      <div role="alert" className="vidrio flex flex-wrap items-center gap-3 p-4 text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
        <span className="min-w-0 flex-1">{t("drive.links.fallo")}</span>
        <Button variant="outline" size="sm" onClick={onReintentar}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />{t("drive.links.reintentar")}
        </Button>
      </div>
    );
  }
  if (!links?.length) {
    return <p className="vidrio p-6 text-sm text-muted-foreground">{t("drive.links.vacio")}</p>;
  }

  const numero = (n: number) => n.toLocaleString(language === "es" ? "es-CO" : "en-US");
  return (
    <div className="flex flex-col gap-3">
      <div className="vidrio-barra flex flex-wrap items-center gap-2 p-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder={t("drive.links.buscar")}
            aria-label={t("drive.links.buscar")} className="h-9 rounded-xl border-transparent bg-background/40 pl-9 shadow-none" />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums sm:ml-auto sm:pr-2">{t("drive.links.resumen", { n: links.length, m: nunca })}</span>
      </div>

      {vistos.length === 0 ? (
        <p className="vidrio p-6 text-sm text-muted-foreground">{t("drive.links.sinResultados", { q: busqueda })}</p>
      ) : (
        <ul className="vidrio overflow-hidden p-1.5">
          {vistos.map((l) => {
            const url = urlDeAportar(l.token);
            const sinNada = l.archivos === 0;
            return (
              <li key={l.token}
                className="grid gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-primary/[0.05] sm:grid-cols-[minmax(0,1fr)_minmax(0,13rem)_15.5rem] sm:items-center sm:gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                    <Folder className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold" title={nombreDeLaCarpeta(l)}>{nombreDeLaCarpeta(l)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {l.padre ? t("drive.links.en", { padre: l.padre }) : null}
                      {l.padre && l.creado_por ? " · " : null}
                      {l.creado_por ? t("drive.links.creadoPor", { nombre: l.creado_por }) : null}
                    </p>
                  </div>
                </div>
                <div className="min-w-0 pl-11 text-xs sm:pl-0">
                  {sinNada ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 font-semibold text-warning/90">
                      {t("drive.links.nunca")}
                    </span>
                  ) : (
                    <>
                      <p className="font-medium tabular-nums">{t("drive.links.recibido", { n: numero(l.archivos), tam: tamano(l.bytes) })}</p>
                      {l.ultimo && <p className="mt-0.5 text-muted-foreground">{t("drive.links.ultimo", { hace: hace(l.ultimo, language) })}</p>}
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1.5 pl-11 sm:justify-end sm:pl-0">
                  <Button size="sm" variant="outline" className="h-8 rounded-lg px-3" onClick={() => void copiar(url)}>
                    {copiado === url ? <Check className="mr-1.5 h-3.5 w-3.5 text-success" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                    {t(copiado === url ? "drive.links.copiado" : "drive.links.copiar")}
                  </Button>
                  <Button size="icon" variant="ghost" asChild className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground">
                    <LinkRouter to={`/oficina/drive?carpeta=${l.carpeta_id}`} aria-label={t("drive.links.abrir")} title={t("drive.links.abrir")}>
                      <FolderOpen className="h-4 w-4" />
                    </LinkRouter>
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
