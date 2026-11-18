import { type ReactNode, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Clapperboard, CloudUpload, Eye, FolderOpen, Inbox, Loader2, Lock, Share2, Upload } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { SubirAqui } from "@/components/aportar/SubirAqui";
import { ExploradorDeCarpeta } from "@/components/aportar/ExploradorDeCarpeta";
import { CompartirCarpeta } from "@/components/aportar/CompartirCarpeta";
import { PedidoParaGrabar } from "@/components/aportar/PedidoParaGrabar";
import {
  hoyEnColombia, type InfoDelLink, invocarAporte, leerVisto, type Listado, marcarVisto, nuevosDesde,
} from "@/lib/aportar/api";

// PÁGINA PÚBLICA /aportar/:token (Alvaro, 04/11), SIN cuenta. Desde el 10/11 es
// también LA CARPETA DE LA CREADORA, para dejar de pagar Dropbox: con su link
// personal sube (cae en la carpeta del día), ve todo lo suyo, baja lo que el
// equipo le deja en «Del equipo» y saca links para su fotógrafo o para
// compartir una carpeta. Qué se ve depende del tipo de link (lo decide la edge
// drive-aporte): los de siempre y los de invitado solo suben; uno de «ver»
// solo muestra la carpeta compartida.

type Pestana = "subir" | "mios" | "equipo" | "compartir";

export default function PaginaAportar() {
  const { token = "" } = useParams<{ token: string }>();
  const { t } = useLanguage();
  const [pestana, setPestana] = useState<Pestana>("subir");
  const [version, setVersion] = useState(0);

  const info = useQuery<InfoDelLink>({
    queryKey: ["aportar-info", token],
    queryFn: () => invocarAporte<InfoDelLink>(token, "info"),
    staleTime: 5 * 60_000,
    retry: 2,
  });

  const d = info.data;
  const personal = d?.tipo === "personal";
  const soloVer = d?.tipo === "ver";
  // El link de un pedido de personalizado (Backstage, 18/11/2026).
  const pedido = d?.tipo === "pedido" ? d.pedido ?? null : null;

  // «Del equipo»: cuántas cosas nuevas desde la última vez que lo miró.
  const equipo = useQuery<Listado>({
    queryKey: ["aportar-listar", token, d?.del_equipo_id, 0],
    enabled: personal && !!d?.del_equipo_id,
    staleTime: 60_000,
    queryFn: () => invocarAporte<Listado>(token, "listar", { carpeta: d!.del_equipo_id }),
  });
  const [visto, setVisto] = useState<string | null>(() => leerVisto(token));
  const nuevos = equipo.data ? nuevosDesde(equipo.data.hijos, visto) : 0;
  useEffect(() => {
    if (pestana !== "equipo") return;
    const ahora = new Date().toISOString();
    marcarVisto(token, ahora);
    setVisto(ahora);
  }, [pestana, token]);

  const ancho = personal || soloVer || pedido ? "max-w-3xl" : "max-w-md";

  return (
    <div className="flex min-h-[100svh] justify-center bg-background px-4 py-8 text-foreground sm:py-10">
      <div className={`flex w-full ${ancho} flex-col gap-5`}>
        <header className="flex flex-col items-center text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-panel bg-primary/15 text-primary">
            {pedido ? <Clapperboard className="h-6 w-6" /> : soloVer ? <Eye className="h-6 w-6" /> : personal ? <FolderOpen className="h-6 w-6" /> : <CloudUpload className="h-6 w-6" />}
          </span>
          <h1 className="font-display text-xl font-bold tracking-tight">
            {pedido
              ? (d?.creadora ? t("drive.pedido.hola", { n: d.creadora }) : t("drive.pedido.titulo", { r: pedido.referencia }))
              : personal
              ? (d?.creadora ? t("drive.carpeta.hola", { n: d.creadora }) : t("drive.carpeta.tuCarpeta"))
              : soloVer ? t("drive.carpeta.compartidaContigo") : t("drive.aportar.titulo")}
          </h1>
          {d?.activo && pedido && (
            <p className="mt-1 text-sm text-muted-foreground">{t("drive.pedido.titulo", { r: pedido.referencia })}</p>
          )}
          {d?.activo && d.carpeta && !pedido && (
            <p className="mt-1 text-sm text-muted-foreground">
              {personal ? t("drive.carpeta.tuCarpeta") : soloVer ? d.etiqueta || d.carpeta : t("drive.aportar.aLaCarpeta", { c: d.etiqueta || d.carpeta })}
            </p>
          )}
        </header>

        {info.isLoading ? (
          <div className="flex justify-center py-10 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : info.isError ? (
          // No contestó: no es lo mismo que «link no existe».
          <div className="flex flex-col items-center gap-3 rounded-panel border border-border/50 bg-card/40 px-6 py-10 text-center">
            <p className="text-sm text-muted-foreground">{t("drive.carpeta.falloInfo")}</p>
            <button type="button" onClick={() => void info.refetch()} className="text-sm font-semibold text-primary hover:underline">{t("drive.carpeta.reintentar")}</button>
          </div>
        ) : !d?.existe || !d.activo ? (
          <div className="flex flex-col items-center gap-3 rounded-panel border border-border/50 bg-card/40 px-6 py-12 text-center">
            <Lock className="h-8 w-8 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">{t(d?.existe ? "drive.aportar.cerrado" : "drive.aportar.noExiste")}</p>
          </div>
        ) : pedido ? (
          <PedidoParaGrabar token={token} pedido={pedido} carpetaId={d.carpeta_id ?? null} />
        ) : soloVer && d.carpeta_id ? (
          <ExploradorDeCarpeta token={token} raizId={d.carpeta_id} modo="compartida" puedeCompartir={false} version={version} />
        ) : personal && d.carpeta_id ? (
          <>
            <nav aria-label={t("drive.carpeta.tuCarpeta")} className="grid grid-cols-2 gap-1 rounded-panel border border-border/50 bg-card/30 p-1 sm:grid-cols-4">
              <BotonPestana activa={pestana === "subir"} onClick={() => setPestana("subir")} icono={<Upload className="h-4 w-4" />} texto={t("drive.carpeta.tab.subir")} />
              <BotonPestana activa={pestana === "mios"} onClick={() => setPestana("mios")} icono={<FolderOpen className="h-4 w-4" />} texto={t("drive.carpeta.tab.mios")} />
              <BotonPestana activa={pestana === "equipo"} onClick={() => setPestana("equipo")} icono={<Inbox className="h-4 w-4" />} texto={t("drive.carpeta.tab.equipo")}
                marca={nuevos > 0 && pestana !== "equipo" ? nuevos : 0} />
              <BotonPestana activa={pestana === "compartir"} onClick={() => setPestana("compartir")} icono={<Share2 className="h-4 w-4" />} texto={t("drive.carpeta.tab.compartir")} />
            </nav>

            {pestana === "subir" && (
              <>
                <p className="text-center text-xs text-muted-foreground">{t("drive.carpeta.porDia", { d: hoyEnColombia() })}</p>
                <SubirAqui token={token} pedirNombre={false} alSubir={() => setVersion((v) => v + 1)} />
              </>
            )}
            {pestana === "mios" && (
              <ExploradorDeCarpeta token={token} raizId={d.carpeta_id} modo="mios" puedeCompartir version={version} />
            )}
            {pestana === "equipo" && d.del_equipo_id && (
              <ExploradorDeCarpeta token={token} raizId={d.del_equipo_id} modo="equipo" puedeCompartir={false} version={version} />
            )}
            {pestana === "compartir" && <CompartirCarpeta token={token} />}

            <div className="flex flex-col gap-1 border-t border-border/40 pt-4 text-center text-[11px] text-muted-foreground">
              <p>{t("drive.carpeta.soloTuyo")}</p>
              <p>{t("drive.carpeta.pantallaInicio")}</p>
            </div>
          </>
        ) : (
          <>
            <SubirAqui token={token} pedirNombre />
            <p className="text-center text-[11px] text-muted-foreground">{t("drive.aportar.pie")}</p>
          </>
        )}
      </div>
    </div>
  );
}

function BotonPestana({ activa, onClick, icono, texto, marca = 0 }: {
  activa: boolean; onClick: () => void; icono: ReactNode; texto: string; marca?: number;
}) {
  return (
    <button type="button" onClick={onClick} aria-current={activa ? "page" : undefined}
      className={`relative flex items-center justify-center gap-1.5 rounded-control px-2 py-2 text-xs font-semibold transition ${activa ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
      {icono}
      <span className="truncate">{texto}</span>
      {marca > 0 && (
        <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground tabular-nums">{marca}</span>
      )}
    </button>
  );
}
