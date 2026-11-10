import { Link } from "react-router-dom";
import { ChevronRight, ExternalLink, FileIcon, Folder, FolderSearch, HardDrive } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { pctDelNivel, tamanoNas, type ExplorarNas } from "@/lib/espacioNas";
import { Seccion, useRpcNas, type EstadoDe } from "./comun";

// EXPLORADOR DEL NAS (Alvaro, 10/11/2026): "ver todo lo que hay en el NAS". Cada
// nivel muestra sus carpetas de la más pesada a la menos, con el peso de TODO
// lo que tienen adentro, y los archivos sueltos de ese nivel. Se baja tocando
// una carpeta; la ruta de arriba lleva de vuelta. «Abrir en el Drive» lleva a
// la carpeta real. No se mueve ni se borra nada desde acá.

/** El contenedor: pide el nivel (null = raíz del Drive). */
export default function ExploradorNas({ carpeta, onAbrir, on }: {
  carpeta: string | null; onAbrir: (id: string | null) => void; on: boolean;
}) {
  const q = useRpcNas<ExplorarNas>("nas_explorar", on, { _carpeta: carpeta });
  return <ExploradorNasVista q={q} onAbrir={onAbrir} />;
}

/** La vista: solo dibuja el nivel que le pasan. */
export function ExploradorNasVista({ q, onAbrir }: { q: EstadoDe<ExplorarNas>; onAbrir: (id: string | null) => void }) {
  const { t, language } = useLanguage();
  const loc = language === "es" ? "es-CO" : "en-US";
  const num = (n: number) => n.toLocaleString(loc);
  const tam = (b: number) => tamanoNas(b, language);

  return (
    <Seccion icono={FolderSearch} titulo={t("dashboard.centro.nas.explorador.titulo")} q={q}
      nota={t("dashboard.centro.nas.explorador.nota")}>
      {(n) => (
        <div className="flex flex-col gap-4">
          {/* Dónde estoy: NAS › Unidades de Google › Contenido Shootings … */}
          <nav aria-label={t("dashboard.centro.nas.explorador.ruta")} className="flex flex-wrap items-center gap-1 text-sm">
            <button type="button" onClick={() => onAbrir(null)} className="inline-flex items-center gap-1 rounded-control px-1.5 py-0.5 hover:bg-muted">
              <HardDrive className="h-3.5 w-3.5" />{t("dashboard.centro.nas.explorador.raiz")}
            </button>
            {n.ruta.map((r, i) => (
              <span key={r.id} className="inline-flex min-w-0 items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                {i === n.ruta.length - 1
                  ? <span className="truncate font-medium">{r.nombre}</span>
                  : <button type="button" onClick={() => onAbrir(r.id)} className="truncate rounded-control px-1.5 py-0.5 hover:bg-muted">{r.nombre}</button>}
              </span>
            ))}
          </nav>

          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm">
              <span className="font-display text-lg font-semibold tabular-nums">{tam(n.total.bytes)}</span>{" "}
              <span className="text-muted-foreground">{t("dashboard.centro.nas.explorador.enArchivos", { n: num(n.total.archivos) })}</span>
            </p>
            {n.carpeta && (
              <Link to={`/oficina/drive?carpeta=${n.carpeta.id}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <ExternalLink className="h-3.5 w-3.5" />{t("dashboard.centro.nas.explorador.abrirDrive")}
              </Link>
            )}
          </div>

          {!n.carpeta && <p className="text-[11px] text-muted-foreground">{t("dashboard.centro.nas.explorador.notaRaiz")}</p>}

          {n.hijos.length > 0 && (
            <ul className="flex flex-col divide-y divide-border/40">
              {n.hijos.map((c) => (
                <li key={c.id} className="flex items-center gap-2 py-1.5">
                  <button type="button" onClick={() => onAbrir(c.id)}
                    className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 rounded-control px-1 py-1 text-left hover:bg-muted/60">
                    <Folder className="h-4 w-4 text-primary/70" />
                    <span className="truncate text-sm">{c.nombre}</span>
                    <span className="text-right text-xs tabular-nums text-muted-foreground">
                      {tam(c.bytes)} · {Math.round(pctDelNivel(c.bytes, n.total.bytes))} %
                    </span>
                    <div className="col-span-3 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary/45" style={{ width: `${Math.min(100, Math.max(0.5, pctDelNivel(c.bytes, n.total.bytes)))}%` }} />
                    </div>
                    <span className="col-span-3 text-[10px] text-muted-foreground tabular-nums">
                      {t("dashboard.centro.nas.explorador.contenido", { archivos: num(c.archivos), carpetas: num(c.carpetas) })}
                    </span>
                  </button>
                  <Link to={`/oficina/drive?carpeta=${c.id}`} aria-label={t("dashboard.centro.nas.explorador.abrirDrive")}
                    className="shrink-0 rounded-control p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {n.sueltos_total.archivos > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold text-muted-foreground">
                {t("dashboard.centro.nas.explorador.sueltos", { n: num(n.sueltos_total.archivos), tam: tam(n.sueltos_total.bytes) })}
              </h3>
              <ul className="flex flex-col divide-y divide-border/30">
                {n.sueltos.map((a) => (
                  <li key={a.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 py-1.5">
                    <FileIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate text-sm" title={a.nombre}>{a.nombre}</span>
                    <span className="text-right text-xs tabular-nums text-muted-foreground">{tam(a.size ?? 0)}</span>
                  </li>
                ))}
              </ul>
              {n.sueltos_total.archivos > n.sueltos.length && (
                <p className="text-[11px] text-muted-foreground">
                  {t("dashboard.centro.nas.explorador.yMas", { n: num(n.sueltos_total.archivos - n.sueltos.length) })}
                </p>
              )}
            </div>
          )}

          {n.hijos.length === 0 && n.sueltos_total.archivos === 0 && (
            <p className="text-sm text-muted-foreground">{t("dashboard.centro.nas.explorador.vacia")}</p>
          )}
        </div>
      )}
    </Seccion>
  );
}
