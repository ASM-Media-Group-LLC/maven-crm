import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { tamanoNas, type FichaNas, type ResumenNas } from "@/lib/espacioNas";
import { Seccion, type EstadoDe } from "./comun";

// FICHA DEL NAS (Alvaro, 10/11/2026): qué es, dónde está, cómo llega el
// contenido y si tiene respaldo. Los hechos salen de infra/nas-drive/README.md
// (mini5, discos NAS1/NAS2, sin copia de seguridad por decisión del 28/09/2026)
// y los números, de la base (nas_ficha) y de la última medición del disco.

/** Qué es el NAS, en cuatro preguntas (título y respuesta). */
const EXPLICACION = [
  ["dashboard.centro.nas.ficha.queEsTitulo", "dashboard.centro.nas.ficha.queEsTexto"],
  ["dashboard.centro.nas.ficha.comoLlegaTitulo", "dashboard.centro.nas.ficha.comoLlegaTexto"],
  ["dashboard.centro.nas.ficha.comoSeConectaTitulo", "dashboard.centro.nas.ficha.comoSeConectaTexto"],
  ["dashboard.centro.nas.ficha.siSeCaeTitulo", "dashboard.centro.nas.ficha.siSeCaeTexto"],
] as const;

/** Un dato de la ficha: etiqueta chica arriba, valor abajo. */
function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-panel border border-border/60 bg-card/40 p-3">
      <div className="text-[11px] font-medium text-muted-foreground">{etiqueta}</div>
      <div className="mt-1 font-display text-base font-semibold tabular-nums">{valor}</div>
    </div>
  );
}

export function FichaNasVista({ q, resumen }: { q: EstadoDe<FichaNas>; resumen: ResumenNas | undefined }) {
  const { t, language } = useLanguage();
  const loc = language === "es" ? "es-CO" : "en-US";
  const num = (n: number) => n.toLocaleString(loc);
  const fecha = (iso: string) => new Date(iso).toLocaleString(loc, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <Seccion icono={Info} titulo={t("dashboard.centro.nas.ficha.titulo")} q={q}>
      {(f) => (
        <div className="flex flex-col gap-4">
          {/* Lo más importante primero: hoy no hay copia de seguridad. */}
          <div className="flex gap-3 rounded-panel border border-warning/40 bg-warning/5 p-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div className="text-sm">
              <p className="font-semibold">{t("dashboard.centro.nas.ficha.respaldoTitulo")}</p>
              <p className="mt-0.5 text-muted-foreground">{t("dashboard.centro.nas.ficha.respaldoTexto")}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm">
            {f.nas?.caido
              ? <><AlertTriangle className="h-4 w-4 text-destructive" />{t("dashboard.centro.nas.ficha.caido", { desde: f.nas.desde ? fecha(f.nas.desde) : "—" })}</>
              : <><CheckCircle2 className="h-4 w-4 text-success" />{t("dashboard.centro.nas.ficha.arriba", { cuando: f.nas?.actualizado ? fecha(f.nas.actualizado) : "—" })}</>}
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <Dato etiqueta={t("dashboard.centro.nas.ficha.archivos")} valor={num(f.archivos)} />
            <Dato etiqueta={t("dashboard.centro.nas.ficha.carpetas")} valor={num(f.carpetas)} />
            <Dato etiqueta={t("dashboard.centro.nas.ficha.unidades")} valor={num(f.unidades)} />
            <Dato etiqueta={t("dashboard.centro.nas.ficha.personas")} valor={num(f.personas)} />
            <Dato etiqueta={t("dashboard.centro.nas.ficha.links")} valor={num(f.links_modelos)} />
            <Dato etiqueta={t("dashboard.centro.nas.ficha.desde")} valor={f.desde ? String(new Date(f.desde).getFullYear()) : "—"} />
          </div>

          {resumen && !resumen.sin_muestras && (
            <div className="grid gap-2.5 sm:grid-cols-2">
              {resumen.discos.map((d, i) => (
                <Dato key={i} etiqueta={t("dashboard.centro.nas.ficha.disco", { n: i + 1 })}
                  valor={`${tamanoNas(d.total - d.libre, language)} / ${tamanoNas(d.total, language)}`} />
              ))}
            </div>
          )}

          <dl className="flex max-w-3xl flex-col gap-3 text-sm">
            {EXPLICACION.map(([titulo, texto]) => (
              <div key={titulo}>
                <dt className="font-semibold">{t(titulo)}</dt>
                <dd className="mt-0.5 text-muted-foreground">{t(texto)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </Seccion>
  );
}
