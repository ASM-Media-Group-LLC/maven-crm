import { useState } from "react";
import { ChevronDown, Copy, Recycle, Trash2 } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { tamanoNas, type QueLiberar } from "@/lib/espacioNas";
import { Seccion, type EstadoDe } from "./comun";

// LIBERAR ESPACIO, EN LENGUAJE CLARO (Alvaro, 10/11/2026: "eso de liberar no se
// entiende"). Arriba, cuánto se podría recuperar en total. Debajo, las dos
// fuentes explicadas en una frase cada una, con su lista plegada:
//   · la papelera: lo que ya se tiró pero sigue en el disco (al tirar una
//     carpeta solo se marca la carpeta: lo de adentro sigue ocupando lugar);
//   · las copias repetidas: el mismo archivo guardado dos o más veces.
// Nada se borra desde acá: vaciar o borrar es una decisión aparte.

function Plegable({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto}
        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
        {etiqueta}<ChevronDown className={`h-3.5 w-3.5 transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>
      {abierto && <div className="mt-2">{children}</div>}
    </div>
  );
}

export function LiberarNasVista({ q }: { q: EstadoDe<QueLiberar> }) {
  const { t, language } = useLanguage();
  const loc = language === "es" ? "es-CO" : "en-US";
  const num = (n: number) => n.toLocaleString(loc);
  const tam = (b: number) => tamanoNas(b, language);

  return (
    <Seccion icono={Recycle} titulo={t("dashboard.centro.nas.liberar.titulo")} q={q}>
      {(l) => (
        <div className="flex flex-col gap-4">
          <p className="text-sm">
            {t("dashboard.centro.nas.liberar.total")}{" "}
            <span className="font-display text-xl font-semibold tabular-nums">{tam(l.papelera.bytes + l.copias.bytes)}</span>
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            <article className="flex flex-col gap-2 rounded-panel border border-border/60 bg-card/40 p-3">
              <div className="flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-primary/80" />
                <h3 className="text-sm font-semibold">{t("dashboard.centro.nas.liberar.papeleraTitulo")}</h3>
                <span className="ml-auto font-display text-base font-semibold tabular-nums">{tam(l.papelera.bytes)}</span>
              </div>
              <p className="text-xs text-muted-foreground">{t("dashboard.centro.nas.liberar.papeleraTexto", { n: num(l.papelera.archivos) })}</p>
              {(l.carpetas_tiradas ?? []).length > 0 && (
                <Plegable etiqueta={t("dashboard.centro.nas.liberar.verPapelera")}>
                  <ul className="flex flex-col divide-y divide-border/40">
                    {(l.carpetas_tiradas ?? []).map((c) => {
                      const fecha = new Date(c.tirada).toLocaleDateString(loc, { day: "2-digit", month: "short", year: "numeric" });
                      return (
                        <li key={c.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 py-2">
                          <span className="truncate text-sm" title={c.nombre}>{c.nombre}</span>
                          <span className="text-right text-sm font-medium tabular-nums">{tam(c.bytes)}</span>
                          <span className="col-span-2 truncate text-[11px] text-muted-foreground">
                            {c.por
                              ? t("dashboard.centro.nas.pagina.tiradaPor", { padre: c.padre ?? "—", fecha, quien: c.por })
                              : t("dashboard.centro.nas.pagina.tirada", { padre: c.padre ?? "—", fecha })}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </Plegable>
              )}
            </article>

            <article className="flex flex-col gap-2 rounded-panel border border-border/60 bg-card/40 p-3">
              <div className="flex items-center gap-2">
                <Copy className="h-4 w-4 text-primary/80" />
                <h3 className="text-sm font-semibold">{t("dashboard.centro.nas.liberar.copiasTitulo")}</h3>
                <span className="ml-auto font-display text-base font-semibold tabular-nums">{tam(l.copias.bytes)}</span>
              </div>
              <p className="text-xs text-muted-foreground">{t("dashboard.centro.nas.liberar.copiasTexto", { n: num(l.copias.copias_de_mas) })}</p>
              {l.top.length > 0 && (
                <Plegable etiqueta={t("dashboard.centro.nas.liberar.verCopias")}>
                  <ul className="flex flex-col divide-y divide-border/40">
                    {l.top.map((c) => (
                      <li key={`${c.nombre}-${c.size}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 py-2">
                        <span className="truncate text-sm" title={c.nombre}>{c.nombre}</span>
                        <span className="text-right text-sm font-medium tabular-nums">{tam(c.recupera)}</span>
                        <span className="truncate text-[11px] text-muted-foreground">
                          {c.unidades.map((u) => u || t("dashboard.centro.nas.miUnidad")).join(" · ")}
                        </span>
                        <span className="text-right text-[11px] text-muted-foreground tabular-nums">
                          {t("dashboard.centro.nas.pagina.copiasDe", { n: c.copias, tam: tam(c.size) })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Plegable>
              )}
            </article>
          </div>

          <p className="text-[11px] text-muted-foreground">{t("dashboard.centro.nas.liberar.nadaSeBorra")}</p>
        </div>
      )}
    </Seccion>
  );
}
