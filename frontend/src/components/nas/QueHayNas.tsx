import { Link } from "react-router-dom";
import { Archive, File, FileText, Film, Image as ImagenIcono, Music, PieChart, Weight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { tamanoNas, type MasPesadosNas, type PorTipoNas, type TipoNas } from "@/lib/espacioNas";
import { Fila, Seccion, type EstadoDe } from "./comun";

// QUÉ HAY EN EL NAS (Alvaro, 10/11/2026): por tipo de archivo (video, fotos,
// documentos…) y los 50 archivos más pesados de todo el NAS.

const ICONO: Record<TipoNas, LucideIcon> = {
  video: Film, foto: ImagenIcono, audio: Music, documento: FileText, comprimido: Archive, otro: File,
};
const CLAVE_TIPO = {
  video: "dashboard.centro.nas.tipo.video",
  foto: "dashboard.centro.nas.tipo.foto",
  audio: "dashboard.centro.nas.tipo.audio",
  documento: "dashboard.centro.nas.tipo.documento",
  comprimido: "dashboard.centro.nas.tipo.comprimido",
  otro: "dashboard.centro.nas.tipo.otro",
} as const;

export function PorTipoNasVista({ q }: { q: EstadoDe<PorTipoNas> }) {
  const { t, language } = useLanguage();
  const loc = language === "es" ? "es-CO" : "en-US";
  return (
    <Seccion icono={PieChart} titulo={t("dashboard.centro.nas.tipo.titulo")} q={q} nota={t("dashboard.centro.nas.tipo.nota")}>
      {(d) => {
        const total = Math.max(1, d.tipos.reduce((s, x) => s + x.bytes, 0));
        return (
          <ul className="flex flex-col gap-3">
            {d.tipos.map((x) => {
              const Icono = ICONO[x.tipo] ?? File;
              return (
                <Fila key={x.tipo} pct={(x.bytes / total) * 100}
                  nombre={<span className="inline-flex items-center gap-2"><Icono className="h-4 w-4 text-primary/70" />{t(CLAVE_TIPO[x.tipo] ?? CLAVE_TIPO.otro)}</span>}
                  valor={`${tamanoNas(x.bytes, language)} · ${Math.round((x.bytes / total) * 100)} %`}
                  detalle={`${t("dashboard.centro.nas.archivos", { n: x.archivos.toLocaleString(loc) })} · ${x.extensiones.map((e) => `${e.ext === "—" ? t("dashboard.centro.nas.tipo.sinExtension") : `.${e.ext}`} ${tamanoNas(e.bytes, language)}`).join(" · ")}`} />
              );
            })}
          </ul>
        );
      }}
    </Seccion>
  );
}

export function MasPesadosNasVista({ q }: { q: EstadoDe<MasPesadosNas> }) {
  const { t, language } = useLanguage();
  const loc = language === "es" ? "es-CO" : "en-US";
  return (
    <Seccion icono={Weight} titulo={t("dashboard.centro.nas.pesados.titulo")} q={q} nota={t("dashboard.centro.nas.pesados.nota")}>
      {(d) => (
        <ol className="flex flex-col divide-y divide-border/40">
          {d.archivos.map((a, i) => {
            const Icono = ICONO[a.tipo] ?? File;
            return (
              <li key={a.id} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-start gap-x-2 py-2">
                <span className="pt-0.5 text-right text-[11px] tabular-nums text-muted-foreground">{i + 1}</span>
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm" title={a.nombre}>
                    <Icono className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span className="truncate">{a.nombre}</span>
                    {a.en_papelera && (
                      <span className="shrink-0 rounded-full border border-warning/40 px-1.5 text-[10px] text-warning">{t("dashboard.centro.nas.pesados.enPapelera")}</span>
                    )}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {a.carpeta_id
                      ? <Link to={`/oficina/drive?carpeta=${a.carpeta_id}`} className="hover:underline">{[a.unidad, a.carpeta].filter(Boolean).join(" › ")}</Link>
                      : a.unidad}
                    {a.dueno ? ` · ${a.dueno}` : ""} · {new Date(a.creado).toLocaleDateString(loc, { day: "2-digit", month: "short", year: "numeric" })}
                  </p>
                </div>
                <span className="text-right text-sm font-medium tabular-nums">{tamanoNas(a.size, language)}</span>
              </li>
            );
          })}
        </ol>
      )}
    </Seccion>
  );
}
