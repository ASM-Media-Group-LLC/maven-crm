import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Camera, Eye, Loader2, RefreshCw, X } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { Button } from "@/components/ui/button";
import { CajaDeLink, urlDeAportar } from "@/components/oficina/LinkDeSubida";
import { invocarAporte, type LinkCompartido } from "@/lib/aportar/api";

// COMPARTIR desde la carpeta de la creadora (Alvaro, 10/11/2026: «comparten con
// externos»). Dos clases de link, ninguno abre su carpeta entera:
//   · para el fotógrafo o editor: SOLO SUBE a su carpeta (no ve nada suyo);
//   · una carpeta compartida (se saca en «Mis archivos»): solo ve y baja ESA.
// Aquí se crean los de subir y se ven/cierran todos. Si la creadora cierra el
// suyo (o el equipo lo apaga), estos mueren con él.

export function CompartirCarpeta({ token }: { token: string }) {
  const { t } = useLanguage();
  const [nombre, setNombre] = useState("");
  const [creando, setCreando] = useState(false);
  const [nuevo, setNuevo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cerrando, setCerrando] = useState<string | null>(null);
  const [porCerrar, setPorCerrar] = useState<string | null>(null);

  const q = useQuery<LinkCompartido[]>({
    queryKey: ["aportar-mis-links", token],
    queryFn: async () => (await invocarAporte<{ links: LinkCompartido[] }>(token, "mis_links")).links ?? [],
    staleTime: 30_000,
    retry: 1,
  });

  async function crear() {
    setCreando(true);
    setError(null);
    try {
      const r = await invocarAporte<{ token: string }>(token, "crear_link", { tipo: "invitado", nombre });
      setNuevo(urlDeAportar(r.token));
      setNombre("");
      void q.refetch();
    } catch (e) {
      setError((e as Error).message || t("drive.carpeta.compartir.falloCrear"));
    } finally {
      setCreando(false);
    }
  }

  async function cerrar(hijo: string) {
    setCerrando(hijo);
    setError(null);
    try {
      await invocarAporte(token, "cerrar_link", { hijo });
      setPorCerrar(null);
      if (nuevo?.endsWith(hijo)) setNuevo(null);
      void q.refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCerrando(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-panel border border-border/50 bg-card/30 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-primary/15 text-primary"><Camera className="h-4 w-4" /></span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{t("drive.carpeta.compartir.invitadoTitulo")}</h2>
            <p className="text-xs text-muted-foreground">{t("drive.carpeta.compartir.invitadoDesc")}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={t("drive.carpeta.compartir.nombre")}
            aria-label={t("drive.carpeta.compartir.nombre")} maxLength={80}
            className="min-w-0 flex-1 rounded-control border border-border/60 bg-background/60 px-3 py-2 text-sm outline-none ring-primary/40 focus:ring-2" />
          <Button onClick={() => void crear()} disabled={creando}>
            {creando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            {t(creando ? "drive.carpeta.compartir.creando" : "drive.carpeta.compartir.crear")}
          </Button>
        </div>
        {nuevo && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-success">{t("drive.carpeta.compartir.listo")}</p>
            <CajaDeLink url={nuevo} />
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded-panel border border-border/50 bg-card/30 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-muted/40 text-muted-foreground"><Eye className="h-4 w-4" /></span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{t("drive.carpeta.compartir.verTitulo")}</h2>
            <p className="text-xs text-muted-foreground">{t("drive.carpeta.compartir.verDesc")}</p>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">{t("drive.carpeta.compartir.activos")}</h2>
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        {q.isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : q.isError ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-panel border border-destructive/30 bg-destructive/10 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
            <span className="min-w-0 flex-1">{t("drive.carpeta.compartir.falloLista")}</span>
            <Button variant="outline" size="sm" onClick={() => void q.refetch()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />{t("drive.carpeta.reintentar")}</Button>
          </div>
        ) : !q.data?.length ? (
          <p className="rounded-panel border border-border/50 bg-card/30 p-4 text-sm text-muted-foreground">{t("drive.carpeta.compartir.ninguno")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border/40 overflow-hidden rounded-panel border border-border/50 bg-card/30">
            {q.data.map((l) => (
              <li key={l.token} className="flex flex-col gap-2 p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{l.nombre || t(l.tipo === "ver" ? "drive.carpeta.compartir.sinNombreVer" : "drive.carpeta.compartir.sinNombre")}</p>
                    <p className="text-xs text-muted-foreground">
                      {l.tipo === "ver" ? t("drive.carpeta.compartir.tipoVer", { c: l.carpeta ?? "" }) : t("drive.carpeta.compartir.tipoInvitado")}
                    </p>
                  </div>
                  {porCerrar === l.token ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button size="sm" variant="destructive" onClick={() => void cerrar(l.token)} disabled={cerrando === l.token}>
                        {cerrando === l.token ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("drive.carpeta.compartir.siCerrar")}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setPorCerrar(null)} aria-label={t("drive.carpeta.cerrar")}><X className="h-3.5 w-3.5" /></Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="ghost" className="shrink-0" onClick={() => setPorCerrar(l.token)}>{t("drive.carpeta.compartir.cerrarLink")}</Button>
                  )}
                </div>
                {porCerrar === l.token && <p className="text-xs text-muted-foreground">{t("drive.carpeta.compartir.confirmarCerrar")}</p>}
                <CajaDeLink url={urlDeAportar(l.token)} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
