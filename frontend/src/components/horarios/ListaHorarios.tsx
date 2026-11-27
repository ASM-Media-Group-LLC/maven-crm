import { useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronDown, Loader2, RefreshCw, Search } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/UserAvatar";
import { useToast } from "@/hooks/use-toast";
import { a12 } from "@/lib/horaBogota";
import { useGuardarHorario, useHorariosEquipo } from "@/hooks/useHorariosEquipo";
import { type PausaDePersona, usePausasDelEquipo } from "@/hooks/usePausas";
import { type TurnoDePersona, type TurnoEmpresa, useGuardarTurnoPersona, useTurnosDeLaGente, useTurnosEmpresa } from "@/hooks/useTurnosEmpresa";
import {
  type DiaHorario, type FilaEquipoHorario, alternarDia, cambio, hhmm, mismaHoraTodos, ponerHoraATodos, semanaInicial,
  trabaja, validarSemana,
} from "@/lib/horarioSemana";

// HORARIOS DEL EQUIPO (Alvaro, 19/11/2026): una fila por persona con su horario
// de la semana (entrada, salida y días de descanso; «distinto por día» si hace
// falta) y un botón «Confirmar». Lo usan RR. HH. en su cartel obligatorio y los
// supervisores en su página. Argos no cuenta tarde hasta que esté confirmado.

type Tr = (k: TranslationKey, p?: Record<string, string | number>) => string;
const DIA_CORTO: Record<number, TranslationKey> = {
  0: "hr.horEq.dia.0", 1: "hr.horEq.dia.1", 2: "hr.horEq.dia.2", 3: "hr.horEq.dia.3",
  4: "hr.horEq.dia.4", 5: "hr.horEq.dia.5", 6: "hr.horEq.dia.6",
};
type Filtro = "pendientes" | "confirmados" | "todos";

const ENTRADA_HORA = "h-9 w-[7.25rem] rounded-lg border border-input bg-background/50 px-2 text-sm tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50";

// La pausa de la persona (19/11/2026): sale de su puesto; aquí solo se ve.
// Para cambiarla se le cambia el puesto (Ajustes → Posiciones).
function PausaDeLaFila({ pausa, t }: { pausa: PausaDePersona | undefined; t: Tr }) {
  if (!pausa) return null;
  const texto = pausa.modalidad
    ? t("hr.pausas.deFila", { m: pausa.modalidad, a: pausa.comida_min, b: pausa.bano_min })
    : t("hr.pausas.deFilaSinNombre", { a: pausa.comida_min, b: pausa.bano_min });
  return <span className="text-[11px] text-muted-foreground">{texto}</span>;
}

function FilaHorario({ f, t, pausa, turnos, suTurno }: { f: FilaEquipoHorario; t: Tr; pausa?: PausaDePersona; turnos: TurnoEmpresa[]; suTurno?: TurnoDePersona }) {
  const { toast } = useToast();
  const guardar = useGuardarHorario();
  const guardarTurno = useGuardarTurnoPersona();
  // SU TURNO (27/11/2026): el suyo, si RR. HH. le puso uno; si no, el del puesto.
  const turnoPropio = suTurno?.origen === "persona" ? suTurno.turno_id : null;
  const [turnoSel, setTurnoSel] = useState<string | null>(turnoPropio);
  const turnoCambio = turnoSel !== turnoPropio;
  const hayTurnos = turnos.some((tu) => tu.activa);
  const inicial = useMemo(() => semanaInicial(f), [f]);
  const [dias, setDias] = useState<DiaHorario[]>(inicial);
  const misma = mismaHoraTodos(dias);
  const [porDia, setPorDia] = useState<boolean>(() => !mismaHoraTodos(inicial) && inicial.some(trabaja));
  const base = hhmm(f.base_entrada) && hhmm(f.base_salida) ? { entrada: hhmm(f.base_entrada)!, salida: hhmm(f.base_salida)! } : null;
  const error = validarSemana(dias);
  const confirmado = !!f.confirmado_at;
  const pendienteDeGuardar = cambio(inicial, dias) || turnoCambio;
  const nombre = f.nombre ?? "—";

  const confirmar = () => {
    guardar.mutate({ userId: f.user_id, dias }, {
      onSuccess: () => {
        toast({ title: t("hr.horEq.listo", { n: nombre }) });
        if (turnoCambio) guardarTurno.mutate({ userId: f.user_id, turno: turnoSel }, {
          onError: (e) => toast({ title: t("hr.horEq.noSeGuardo"), description: (e as Error).message, variant: "destructive" }),
        });
      },
      onError: (e) => toast({ title: t("hr.horEq.noSeGuardo"), description: (e as Error).message, variant: "destructive" }),
    });
  };

  return (
    <li className="flex flex-col gap-3 px-3 py-3.5 sm:px-4">
      <div className="flex min-w-0 items-center gap-3">
        <UserAvatar name={nombre} src={f.avatar_url ?? undefined} seed={f.avatar_seed ?? undefined} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{nombre}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {[f.puesto, f.equipo].filter(Boolean).join(" · ")}
            {base && <> · {t("hr.horEq.base", { a: a12(base.entrada) ?? base.entrada, b: a12(base.salida) ?? base.salida })}{f.turno ? ` (${f.turno})` : ""}</>}
          </p>
        </div>
        {confirmado && !pendienteDeGuardar ? (
          <span className="hidden shrink-0 items-center gap-1 rounded-full bg-foreground/[0.07] px-2 py-0.5 text-[11px] text-foreground/80 sm:inline-flex" title={f.confirmado_por ?? ""}>
            <Check className="h-3 w-3" />{t("hr.horEq.confirmadoPor", { n: f.confirmado_por ?? "—" })}
          </span>
        ) : (
          <span className="hidden shrink-0 items-center gap-1.5 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-foreground/90 sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden />{confirmado ? t("hr.horEq.cambiosSinGuardar") : t("hr.horEq.sinConfirmar")}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2.5 pl-0 sm:pl-11">
        {/* Días que trabaja (prendidos) y de descanso (apagados). */}
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("hr.horEq.diasLbl")}>
          {dias.map((d) => (
            <button key={d.dia} type="button" aria-pressed={trabaja(d)}
              onClick={() => setDias((prev) => alternarDia(prev, d.dia, base))}
              className={`h-8 min-w-[2.6rem] rounded-lg px-2 text-xs font-semibold transition-colors ${trabaja(d) ? "bg-primary/20 text-foreground ring-1 ring-primary/40" : "bg-foreground/[0.05] text-muted-foreground line-through decoration-muted-foreground/50"}`}>
              {t(DIA_CORTO[d.dia])}
            </button>
          ))}
          <span className="ml-1 text-[11px] text-muted-foreground">{t("hr.horEq.tocaDescanso")}</span>
        </div>

        {/* EL TURNO (27/11/2026): tocar uno pone sus horas en los días que trabaja. */}
        {hayTurnos && (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("hr.turnosEmp.suTurno")}>
            <span className="mr-1 text-xs text-muted-foreground">{t("hr.turnosEmp.suTurno")}</span>
            {turnos.filter((x) => x.activa || x.id === turnoSel).map((x) => {
              const activo = turnoSel === x.id;
              const delPuesto = !turnoSel && suTurno?.origen === "puesto" && suTurno.turno_id === x.id;
              return (
                <button key={x.id} type="button" aria-pressed={activo}
                  title={`${a12(x.entrada)} – ${a12(x.salida)}`}
                  onClick={() => {
                    if (activo) { setTurnoSel(null); return; }
                    setTurnoSel(x.id); setPorDia(false);
                    setDias((prev) => ponerHoraATodos(prev, x.entrada, x.salida));
                  }}
                  className={`h-8 rounded-lg px-2.5 text-xs font-medium transition-colors ${activo ? "bg-primary/20 text-foreground ring-1 ring-primary/40" : delPuesto ? "bg-foreground/[0.06] text-foreground ring-1 ring-border" : "bg-foreground/[0.04] text-muted-foreground hover:text-foreground"}`}>
                  {x.nombre}{delPuesto && <span className="ml-1 text-[10px] text-muted-foreground">{t("hr.turnosEmp.delPuesto")}</span>}
                </button>
              );
            })}
          </div>
        )}

        {!porDia ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <label className="flex items-center gap-2">{t("hr.horEq.entra")}
              <input type="time" className={ENTRADA_HORA} value={misma?.entrada ?? ""} disabled={!dias.some(trabaja)}
                onChange={(e) => e.target.value && setDias((prev) => ponerHoraATodos(prev, e.target.value, misma?.salida ?? base?.salida ?? "16:00"))} />
            </label>
            <label className="flex items-center gap-2">{t("hr.horEq.sale")}
              <input type="time" className={ENTRADA_HORA} value={misma?.salida ?? ""} disabled={!dias.some(trabaja)}
                onChange={(e) => e.target.value && setDias((prev) => ponerHoraATodos(prev, misma?.entrada ?? base?.entrada ?? "08:00", e.target.value))} />
            </label>
            <button type="button" onClick={() => setPorDia(true)} className="text-xs font-medium text-primary hover:underline">{t("hr.horEq.distintoPorDia")}</button>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {dias.filter(trabaja).map((d) => (
              <div key={d.dia} className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="w-9 font-semibold text-foreground/85">{t(DIA_CORTO[d.dia])}</span>
                <input type="time" className={ENTRADA_HORA} value={d.entrada ?? ""} aria-label={t("hr.horEq.entra")}
                  onChange={(e) => e.target.value && setDias((prev) => prev.map((x) => (x.dia === d.dia ? { ...x, entrada: e.target.value } : x)))} />
                <span>–</span>
                <input type="time" className={ENTRADA_HORA} value={d.salida ?? ""} aria-label={t("hr.horEq.sale")}
                  onChange={(e) => e.target.value && setDias((prev) => prev.map((x) => (x.dia === d.dia ? { ...x, salida: e.target.value } : x)))} />
              </div>
            ))}
            {misma && <button type="button" onClick={() => setPorDia(false)} className="self-start text-xs font-medium text-primary hover:underline">{t("hr.horEq.igualTodos")}</button>}
          </div>
        )}

        <PausaDeLaFila pausa={pausa} t={t} />

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" className="h-9 rounded-lg" onClick={confirmar} disabled={!!error || guardar.isPending || (confirmado && !pendienteDeGuardar)}>
            {guardar.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
            {confirmado && !pendienteDeGuardar ? t("hr.horEq.yaConfirmado") : pendienteDeGuardar && confirmado ? t("hr.horEq.guardarCambios") : t("hr.horEq.confirmar")}
          </Button>
          {error && <span className="text-[11px] text-muted-foreground">{t(error === "sinDias" ? "hr.horEq.errSinDias" : "hr.horEq.errIncompleto")}</span>}
          {pendienteDeGuardar && (
            <button type="button" onClick={() => { setDias(inicial); setTurnoSel(turnoPropio); setPorDia(!mismaHoraTodos(inicial) && inicial.some(trabaja)); }} className="text-[11px] text-muted-foreground hover:text-foreground">
              {t("hr.horEq.deshacer")}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

export function ListaHorarios({ obligatorio = false }: { obligatorio?: boolean }) {
  const pausas = usePausasDelEquipo();
  const { t } = useLanguage();
  const q = useHorariosEquipo();
  const filas = useMemo(() => q.data ?? [], [q.data]);
  // Los turnos de la empresa y el de cada persona. Si no cargan, la fila se ve
  // como antes (sin botones de turno): nunca se inventa un turno.
  const turnosEmp = useTurnosEmpresa();
  const turnosGente = useTurnosDeLaGente(useMemo(() => filas.map((f) => f.user_id), [filas]));
  const pendientes = filas.filter((f) => !f.confirmado_at).length;
  const [filtro, setFiltro] = useState<Filtro>(obligatorio ? "pendientes" : "pendientes");
  const [buscar, setBuscar] = useState("");
  const [equipo, setEquipo] = useState<string | null>(null);

  const equipos = useMemo(() => [...new Set(filas.map((f) => f.equipo ?? "—"))].sort((a, b) => a.localeCompare(b, "es")), [filas]);
  const vistas = useMemo(() => {
    const txt = buscar.trim().toLowerCase();
    return filas.filter((f) =>
      (filtro === "todos" || (filtro === "pendientes" ? !f.confirmado_at : !!f.confirmado_at))
      && (!equipo || (f.equipo ?? "—") === equipo)
      && (!txt || (f.nombre ?? "").toLowerCase().includes(txt)));
  }, [filas, filtro, buscar, equipo]);

  if (q.isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (q.isError) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 p-4 text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
        <span className="min-w-0 flex-1">{t("hr.horEq.fallo")}</span>
        <Button variant="outline" size="sm" onClick={() => void q.refetch()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />{t("hr.horEq.reintentar")}</Button>
      </div>
    );
  }
  if (filas.length === 0) return <p className="p-6 text-sm text-muted-foreground">{t("hr.horEq.nadie")}</p>;

  const SEG = (activa: boolean) => `inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${activa ? "bg-background/80 text-foreground shadow-sm ring-1 ring-border/50" : "text-muted-foreground hover:text-foreground"}`;

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-2.5 border-b border-border/40 p-3 sm:flex-row sm:items-center sm:p-4">
        <div className="inline-flex shrink-0 gap-1 self-start rounded-xl bg-foreground/[0.045] p-1" role="group">
          {([["pendientes", "hr.horEq.fPendientes", pendientes], ["confirmados", "hr.horEq.fConfirmados", filas.length - pendientes], ["todos", "hr.horEq.fTodos", filas.length]] as const).map(([k, lbl, n]) => (
            <button key={k} type="button" aria-pressed={filtro === k} onClick={() => setFiltro(k)} className={SEG(filtro === k)}>
              {t(lbl)}<span className="tabular-nums opacity-60">{n}</span>
            </button>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder={t("hr.horEq.buscar")}
              className="h-9 w-full rounded-lg border border-input bg-background/40 pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50" />
          </label>
          {equipos.length > 1 && (
            <label className="relative shrink-0">
              <select value={equipo ?? ""} onChange={(e) => setEquipo(e.target.value || null)} aria-label={t("hr.horEq.equipo")}
                className="h-9 max-w-[9.5rem] appearance-none rounded-lg border border-input bg-background/40 pl-3 pr-8 text-sm focus:outline-none sm:max-w-none">
                <option value="">{t("hr.horEq.todosEquipos")}</option>
                {equipos.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </label>
          )}
        </div>
      </div>
      {vistas.length === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">{filtro === "pendientes" && pendientes === 0 ? t("hr.horEq.todosListos") : t("hr.horEq.nadieFiltro")}</p>
      ) : (
        <ul className="divide-y divide-border/25">
          {vistas.map((f) => <FilaHorario key={`${f.user_id}-${f.confirmado_at ?? "x"}-${turnosGente.data?.get(f.user_id)?.turno_id ?? ""}`} f={f} t={t} pausa={pausas.data?.get(f.user_id)} turnos={turnosEmp.data?.turnos ?? []} suTurno={turnosGente.data?.get(f.user_id)} />)}
        </ul>
      )}
    </div>
  );
}
