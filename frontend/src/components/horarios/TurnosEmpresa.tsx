import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Clock, Loader2, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";
import { a12 } from "@/lib/horaBogota";
import {
  type PuestoTurno, type TurnoEmpresa,
  useGuardarTurno, useGuardarTurnoPuesto, useTurnosEmpresa,
} from "@/hooks/useTurnosEmpresa";

// LOS TURNOS DE LA EMPRESA (Alvaro, 27/11/2026): la lista de la empresa (AM,
// PM, Madrugada… con sus horas) y, debajo, el turno por defecto de cada puesto.
// Viven en Ajustes → Empresa junto a las pausas y la cámara/pantalla, para que
// todo lo de un puesto se configure en el mismo sitio. A cada persona se le
// puede poner otro en Horarios del equipo (un chatter puede ser AM, PM o
// madrugada). Cambian: dueño, quien configura la empresa y RR. HH.

const HORA = "h-9 w-[7.25rem] rounded-lg border border-input bg-background/50 px-2 text-sm tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50";

function FilaTurno({ x, editable }: { x: TurnoEmpresa | null; editable: boolean }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const guardar = useGuardarTurno();
  const [nombre, setNombre] = useState(x?.nombre ?? "");
  const [entrada, setEntrada] = useState(x?.entrada ?? "08:00");
  const [salida, setSalida] = useState(x?.salida ?? "16:00");
  const cambiado = !x || nombre !== x.nombre || entrada !== x.entrada || salida !== x.salida;
  const valido = nombre.trim().length > 0 && /^\d{2}:\d{2}$/.test(entrada) && /^\d{2}:\d{2}$/.test(salida) && entrada !== salida;

  const enviar = () => guardar.mutate(
    { id: x?.id ?? null, nombre, entrada, salida, activa: x?.activa ?? true },
    {
      onSuccess: () => { toast({ title: t("hr.turnosEmp.guardado") }); if (!x) { setNombre(""); setEntrada("08:00"); setSalida("16:00"); } },
      onError: (e) => toast({ title: t("hr.turnosEmp.noSeGuardo"), description: (e as Error).message, variant: "destructive" }),
    },
  );

  const contenidoBoton = guardar.isPending
    ? <Loader2 className="h-4 w-4 animate-spin" />
    : x ? <>{t("hr.turnosEmp.guardar")}</> : <><Plus className="mr-1 h-4 w-4" />{t("hr.turnosEmp.agregar")}</>;

  if (!editable && x) {
    return (
      <li className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
        <span className="font-medium text-foreground">{x.nombre}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{a12(x.entrada)} – {a12(x.salida)}</span>
      </li>
    );
  }
  return (
    <li className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
      <input className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background/50 px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
        value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={t("hr.turnosEmp.nombre")} maxLength={40} aria-label={t("hr.turnosEmp.nombre")} />
      <input type="time" className={HORA} value={entrada} onChange={(e) => e.target.value && setEntrada(e.target.value)} aria-label={t("hr.horEq.entra")} />
      <span className="text-muted-foreground">–</span>
      <input type="time" className={HORA} value={salida} onChange={(e) => e.target.value && setSalida(e.target.value)} aria-label={t("hr.horEq.sale")} />
      {x && <span className="text-[11px] text-muted-foreground">{t("hr.turnosEmp.uso", { p: x.puestos, n: x.personas })}</span>}
      <Button size="sm" className="h-9 rounded-lg" disabled={!cambiado || !valido || guardar.isPending} onClick={enviar}>
        {contenidoBoton}
      </Button>
    </li>
  );
}

function FilaPuesto({ p, turnos }: { p: PuestoTurno; turnos: TurnoEmpresa[] }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const guardar = useGuardarTurnoPuesto();
  const actual = turnos.find((x) => x.id === p.turno_id) ?? null;
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
      <span className="min-w-0">
        <span className="block truncate font-medium text-foreground">{p.nombre}</span>
        <span className="block text-[11px] text-muted-foreground">{t("hr.turnosEmp.personas", { n: p.personas })}</span>
      </span>
      {p.puede ? (
        <select
          className="h-9 shrink-0 rounded-lg border border-input bg-background/50 px-2 text-sm"
          value={p.turno_id ?? ""}
          disabled={guardar.isPending}
          aria-label={t("hr.turnosEmp.turnoDe", { p: p.nombre })}
          onChange={(e) => guardar.mutate({ posicion: p.id, turno: e.target.value || null }, {
            onError: (err) => toast({ title: t("hr.turnosEmp.noSeGuardo"), description: (err as Error).message, variant: "destructive" }),
          })}
        >
          <option value="">{t("hr.turnosEmp.sinTurno")}</option>
          {turnos.filter((x) => x.activa || x.id === p.turno_id).map((x) => (
            <option key={x.id} value={x.id}>{x.nombre} · {a12(x.entrada)} – {a12(x.salida)}</option>
          ))}
        </select>
      ) : (
        <span className="shrink-0 text-xs text-muted-foreground">{actual ? `${actual.nombre} · ${a12(actual.entrada)} – ${a12(actual.salida)}` : t("hr.turnosEmp.sinTurno")}</span>
      )}
    </li>
  );
}

export function TurnosEmpresa() {
  const { t } = useLanguage();
  const q = useTurnosEmpresa();
  return (
    <section className="vidrio overflow-hidden p-0">
      <header className="flex items-start gap-3 border-b border-border/50 px-4 py-3">
        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{t("hr.turnosEmp.titulo")}</h2>
          <p className="text-xs text-muted-foreground">{q.data?.puede_editar ? t("hr.turnosEmp.subEditar") : t("hr.turnosEmp.subVer")}</p>
        </div>
      </header>
      {q.isLoading ? (
        <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : q.isError || !q.data ? (
        <div className="flex items-center justify-between gap-3 px-4 py-4 text-sm text-muted-foreground">
          {t("hr.turnosEmp.error")}
          <Button variant="outline" size="sm" className="rounded-lg" onClick={() => void q.refetch()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />{t("hr.casos.reintentar")}</Button>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-border/40">
            {q.data.turnos.map((x) => <FilaTurno key={`${x.id}-${x.nombre}-${x.entrada}-${x.salida}`} x={x} editable={q.data!.puede_editar} />)}
            {q.data.puede_editar && <FilaTurno x={null} editable />}
          </ul>
          {/* LOS CONFLICTOS (27/11/2026): varios puestos con turnos distintos. Se usa
              el del primer puesto; RR. HH. le pone el suyo en Horarios del equipo. */}
          {(q.data.conflictos ?? []).length > 0 && (
            <div className="border-t border-border/50 bg-warning/[0.06] px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />{t("hr.turnosEmp.conflictos")}
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {(q.data.conflictos ?? []).map((c) => (
                  <li key={c.user_id} className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{c.nombre}</span>
                    {" · "}{c.puestos.map((x) => `${x.puesto}: ${x.turno}`).join(" · ")}
                    {" → "}{t("hr.turnosEmp.seUsa", { t: c.usa })}
                  </li>
                ))}
              </ul>
              <Link to="/hr/horarios-equipo" className="mt-2 inline-block text-xs font-medium text-primary hover:underline">{t("hr.turnosEmp.arreglar")}</Link>
            </div>
          )}
          {q.data.puestos.length > 0 && (
            <>
              <p className="border-t border-border/50 px-4 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("hr.turnosEmp.porPuesto")}</p>
              <p className="px-4 pb-2 text-xs text-muted-foreground">{t("hr.turnosEmp.porPuestoSub")}</p>
              <ul className="divide-y divide-border/40">
                {q.data.puestos.map((p) => <FilaPuesto key={p.id} p={p} turnos={q.data!.turnos} />)}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
