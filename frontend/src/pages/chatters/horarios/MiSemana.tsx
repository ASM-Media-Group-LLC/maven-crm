import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarOff, Moon, Users, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDescansos, useMiIdentidad, useNombres, useRoster } from "./useHorarios";
import { DIAS, DIAS_CORTOS, TURNOS, diaSemanaDe, etiquetaDia, etiquetaSemana, fechaDe, lunesDe, sumarDias, urlCreadora, type Descanso } from "./types";

export function TurnoBadge({ shift, conHoras = false, className }: { shift: keyof typeof TURNOS; conHoras?: boolean; className?: string }) {
  const t = TURNOS[shift];
  return <Badge variant="outline" className={cn("gap-1 font-semibold", t.clase, className)}>{t.label}{conHoras && <span className="font-normal opacity-80">· {t.horas}</span>}</Badge>;
}

// MI SEMANA: lo que el chatter abría el Excel para mirar. Solo lo suyo — la
// base no le entrega ni al compañero del otro turno ni a los demás grupos.
export default function MiSemana({ hoy = new Date() }: { hoy?: Date }) {
  const identidad = useMiIdentidad();
  const { grupos, miembros, creadoras, cargando } = useRoster();
  const semana = lunesDe(hoy);
  const siguiente = sumarDias(semana, 7);
  const descansos = useDescansos(semana, siguiente);

  const yo = identidad.data ?? null;
  const miFila = miembros.find((m) => m.identity_id === yo) ?? null;
  const miGrupo = miFila ? grupos.find((g) => g.id === miFila.group_id) ?? null : null;
  const misCreadoras = useMemo(() => creadoras.filter((c) => miFila && c.group_id === miFila.group_id), [creadoras, miFila]);

  const todos = descansos.data ?? [];
  const miDescanso = todos.find((d) => d.week_start === semana && d.identity_id === yo) ?? null;
  const miDescansoProx = todos.find((d) => d.week_start === siguiente && d.identity_id === yo) ?? null;
  const cubro = todos.filter((d) => d.covered_by_identity_id === yo && d.identity_id !== yo);
  const notasDia = todos.filter((d) => d.week_start === semana && d.identity_id === null && (!miGrupo || d.agency === miGrupo.agency) && (!miFila || d.shift === miFila.shift));
  const nombres = useNombres([yo ?? "", ...todos.flatMap((d) => [d.identity_id ?? "", d.covered_by_identity_id ?? ""])]);

  if (identidad.isLoading || cargando || descansos.isLoading) {
    return <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}</div>;
  }
  if (!yo || !miFila || !miGrupo) {
    return (
      <div className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
        <Users className="mx-auto mb-3 h-8 w-8 opacity-50" />
        <p className="font-medium text-foreground">Todavía no estás en ningún grupo</p>
        <p className="text-sm mt-1">Cuando un supervisor te asigne un grupo y turno, acá vas a ver tus creadoras y tu descanso.</p>
      </div>
    );
  }

  const diaHoy = diaSemanaDe(hoy);
  const descansoHoy = miDescanso?.weekday === diaHoy;
  const fechaLarga = hoy.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-[1.3fr_1fr]">
        {/* Hoy */}
        <section className="rounded-2xl border bg-card p-5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Hoy · {fechaLarga}</p>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">{nombres[yo] ?? "Tu turno"}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {descansoHoy
              ? <Badge variant="outline" className="gap-1 border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300 font-semibold"><CalendarOff className="h-3.5 w-3.5" /> Hoy descansás</Badge>
              : <TurnoBadge shift={miFila.shift} conHoras />}
            <Badge variant="secondary" className="font-normal">{miGrupo.name} · {miGrupo.agency === "plus" ? "Plus" : "Massive"}</Badge>
            {miFila.is_supernumerary && <Badge variant="secondary" className="font-normal">Supernumerario</Badge>}
          </div>

          <p className="mt-5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Tus creadoras · {misCreadoras.length}
          </p>
          {misCreadoras.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Tu grupo todavía no tiene creadoras cargadas.</p>
          ) : (
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {misCreadoras.map((c) => {
                const url = urlCreadora(c);
                const marcas = [c.ig && "IG", c.mad && "MAD", c.sop && "SOP"].filter(Boolean).join(" · ");
                const inner = (
                  <>
                    <span className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border" />
                    <span className={cn("font-mono text-[13px] truncate", url && "underline decoration-border underline-offset-4 group-hover:decoration-foreground")}>@{c.creator_handle}</span>
                    {marcas && <span className="ml-auto text-[10px] text-muted-foreground border rounded px-1.5 py-0.5 shrink-0">{marcas}</span>}
                    {url && <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />}
                  </>
                );
                return (
                  <li key={c.id}>
                    {url
                      ? <Link to={url} className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/60" title="Abrir el perfil de la creadora">{inner}</Link>
                      : <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-muted-foreground" title="Esta cuenta no está ligada a una creadora de Maven">{inner}</div>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Descanso */}
        <section className="rounded-2xl border bg-card p-5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Tu descanso esta semana</p>
          {miDescanso ? (
            <>
              <h3 className="mt-1 font-display text-2xl font-bold tracking-tight">{etiquetaDia(semana, miDescanso.weekday)}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {miDescanso.covered_by_identity_id ? <>Te cubre <strong className="text-foreground">{nombres[miDescanso.covered_by_identity_id] ?? "…"}</strong>.</> : "Todavía no hay quien te cubra."}
                {miDescanso.note && <> {miDescanso.note}.</>}
              </p>
            </>
          ) : (
            <>
              <h3 className="mt-1 font-display text-2xl font-bold tracking-tight text-muted-foreground">Sin descanso cargado</h3>
              <p className="mt-1 text-sm text-muted-foreground">{notasDia[0]?.note ?? "El supervisor todavía no cerró la semana."}</p>
            </>
          )}
          <p className="mt-5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Semana del {etiquetaSemana(siguiente)}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {miDescansoProx ? <>Descansás el <strong className="text-foreground">{etiquetaDia(siguiente, miDescansoProx.weekday).toLowerCase()}</strong>.</> : "Todavía sin publicar."}
          </p>
          {cubro.length > 0 && (
            <>
              <p className="mt-5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Cubrís a</p>
              <ul className="mt-1 space-y-1 text-sm">
                {cubro.map((d) => <li key={d.id}><strong>{nombres[d.identity_id ?? ""] ?? "…"}</strong> <span className="text-muted-foreground">· {etiquetaDia(d.week_start, d.weekday)} <TurnoBadge shift={d.shift} className="ml-1 text-[10px] px-1.5 py-0" /></span></li>)}
              </ul>
            </>
          )}
        </section>
      </div>

      {/* La semana, día por día */}
      <section className="rounded-2xl border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <p className="text-sm font-semibold">Semana del {etiquetaSemana(semana)}</p>
          <p className="text-xs text-muted-foreground">{miGrupo.name} · {misCreadoras.length} creadoras</p>
        </div>
        <ul className="divide-y">
          {DIAS.map((dia, i) => {
            const esHoy = i === diaHoy;
            const libre = miDescanso?.weekday === i;
            const nota = notasDia.find((n) => n.weekday === i);
            const fecha = fechaDe(sumarDias(semana, i)).getDate();
            return (
              <li key={dia} className={cn("flex items-center gap-4 px-5 py-2.5 text-sm", esHoy && "bg-primary/5")}>
                <span className={cn("w-24 shrink-0 font-semibold", esHoy && "text-primary")}>{DIAS_CORTOS[i]} {fecha}{esHoy && <span className="ml-1 text-[10px] font-medium uppercase">hoy</span>}</span>
                {libre
                  ? <Badge variant="outline" className="gap-1 border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300 font-semibold"><CalendarOff className="h-3 w-3" /> Descanso</Badge>
                  : <TurnoBadge shift={miFila.shift} />}
                <span className="text-muted-foreground truncate">
                  {libre ? (miDescanso?.covered_by_identity_id ? `Te cubre ${nombres[miDescanso.covered_by_identity_id] ?? "…"}` : "Sin cobertura asignada") : nota?.note ?? ""}
                </span>
                {miFila.shift === "mad" && !libre && <Moon className="ml-auto h-3.5 w-3.5 text-muted-foreground" />}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

export type { Descanso };
