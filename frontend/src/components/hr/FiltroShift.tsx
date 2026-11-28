import { SlidersHorizontal, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { SITUACIONES, type Situacion } from "@/lib/turnoTabla";

// EL FILTRO DE SHIFT (Alvaro, 28/11/2026, preguntas y respuestas): un botón
// «Filtrar» que abre una lista con casillas: situación de ahora (solo hoy), área
// y posición. Se pueden marcar varias; dentro de un grupo suma (Chatter O
// Supervisor), entre grupos se cruza (Chat Y en comida). Quien tiene dos
// posiciones sale en las dos.

export interface FiltrosShift { situaciones: Situacion[]; areas: string[]; posiciones: string[] }
export const SIN_FILTROS: FiltrosShift = { situaciones: [], areas: [], posiciones: [] };
export const cuantosFiltros = (f: FiltrosShift) => f.situaciones.length + f.areas.length + f.posiciones.length;

export interface OpcionFiltro { id: string; nombre: string; n: number }

const ETIQUETA_SIT: Record<Situacion, TranslationKey> = {
  trabajando: "hr.filtro.sit.trabajando",
  comida: "hr.filtro.sit.comida",
  bano: "hr.filtro.sit.bano",
  sinCamPant: "hr.filtro.sit.sinCamPant",
  sinInternet: "hr.filtro.sit.sinInternet",
  desconectado: "hr.filtro.sit.desconectado",
  yaSalio: "hr.filtro.sit.yaSalio",
};
const PUNTO_SIT: Record<Situacion, string> = {
  trabajando: "bg-success",
  comida: "bg-primary",
  bano: "bg-violet-500",
  sinCamPant: "bg-warning",
  sinInternet: "bg-destructive",
  desconectado: "bg-muted-foreground/50",
  yaSalio: "bg-muted-foreground/30",
};

function alternar<T>(xs: T[], x: T): T[] {
  return xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x];
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="px-2 pb-1 pt-2 text-xs text-muted-foreground">{titulo}</p>
      {children}
    </div>
  );
}

function Casilla({ marcada, onCambio, children, n }: { marcada: boolean; onCambio: () => void; children: React.ReactNode; n?: number }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-foreground hover:bg-foreground/[0.05]">
      <Checkbox checked={marcada} onCheckedChange={onCambio} />
      <span className="flex min-w-0 flex-1 items-center gap-2 truncate">{children}</span>
      {n != null && <span className="text-xs tabular-nums text-muted-foreground">{n}</span>}
    </label>
  );
}

export function FiltroShift({
  valor, onCambio, esHoy, situacionesN, areas, posiciones,
}: {
  valor: FiltrosShift;
  onCambio: (f: FiltrosShift) => void;
  esHoy: boolean;
  situacionesN: Record<Situacion, number>;
  areas: OpcionFiltro[];
  posiciones: OpcionFiltro[];
}) {
  const { t } = useLanguage();
  const n = cuantosFiltros(valor);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button"
          className={`flex h-10 shrink-0 items-center gap-1.5 rounded-2xl border px-3 text-xs font-medium transition ${n ? "border-primary/40 bg-primary/10 text-foreground" : "border-border/50 bg-background/40 text-muted-foreground hover:text-foreground"}`}
          aria-label={t("hr.filtro.boton")}>
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {t("hr.filtro.boton")}
          {n > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] tabular-nums text-primary-foreground">{n}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[70vh] w-72 overflow-y-auto rounded-2xl p-2">
        <div className="flex items-center justify-between px-2 pt-1">
          <p className="text-sm font-semibold text-foreground">{t("hr.filtro.titulo")}</p>
          {n > 0 && (
            <button type="button" onClick={() => onCambio(SIN_FILTROS)} className="flex items-center gap-1 text-xs text-primary hover:underline">
              <X className="h-3 w-3" />{t("hr.filtro.limpiar")}
            </button>
          )}
        </div>
        {esHoy && (
          <Grupo titulo={t("hr.filtro.situacion")}>
            {SITUACIONES.map((s) => (
              <Casilla key={s} marcada={valor.situaciones.includes(s)} n={situacionesN[s]}
                onCambio={() => onCambio({ ...valor, situaciones: alternar(valor.situaciones, s) })}>
                <span className={`h-2 w-2 shrink-0 rounded-full ${PUNTO_SIT[s]}`} aria-hidden />
                {t(ETIQUETA_SIT[s])}
              </Casilla>
            ))}
          </Grupo>
        )}
        {areas.length > 0 && (
          <Grupo titulo={t("hr.filtro.area")}>
            {areas.map((a) => (
              <Casilla key={a.id} marcada={valor.areas.includes(a.id)} n={a.n}
                onCambio={() => onCambio({ ...valor, areas: alternar(valor.areas, a.id) })}>{a.nombre}</Casilla>
            ))}
          </Grupo>
        )}
        <Grupo titulo={t("hr.filtro.posicion")}>
          {posiciones.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">{t("hr.filtro.sinPosiciones")}</p>}
          {posiciones.map((p) => (
            <Casilla key={p.id} marcada={valor.posiciones.includes(p.id)} n={p.n}
              onCambio={() => onCambio({ ...valor, posiciones: alternar(valor.posiciones, p.id) })}>{p.nombre}</Casilla>
          ))}
        </Grupo>
        {areas.length === 0 && <p className="px-2 pb-1 pt-2 text-[11px] text-muted-foreground">{t("hr.filtro.sinAreas")}</p>}
      </PopoverContent>
    </Popover>
  );
}
