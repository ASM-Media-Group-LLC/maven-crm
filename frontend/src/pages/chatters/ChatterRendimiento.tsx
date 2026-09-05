import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import {
  Users, Gauge, DollarSign, Clock, Send, Info, AlertTriangle, Loader2, ChevronRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import DateRangePresets, { rangeForPreset, type DateRange, type RangePreset } from "@/components/dashboard/DateRangePresets";
import { differenceInCalendarDays } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/EmptyState";
import { cn } from "@/lib/utils";
import {
  useChatterPeriodo, useCobertura, useDiasDeChatter, useModelosDelDia, useMasivos,
  isoDia, tonoDeNota, money, NOMBRE_FALTANTE,
  type ChatterPeriodo,
} from "./useChatterRendimiento";

// ── Aviso de cobertura ─────────────────────────────────────────────────────
// La agencia está migrando de Infloww a BLU, así que hacia atrás hay días con
// pocas personas o ninguna. Sin este aviso, un promedio de 3 días se leería
// como el promedio del mes y alguien tomaría una decisión sobre una persona con
// eso. Se muestra el dato, pero nunca sin su contexto.
function AvisoCobertura({ dias, diasConDatos }: { dias: number; diasConDatos: number }) {
  const parcial = diasConDatos < dias;
  if (!parcial) return null;
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning/10 px-3.5 py-2.5">
      <AlertTriangle className="h-4 w-4 shrink-0 text-warning mt-0.5" />
      <p className="text-xs leading-relaxed text-foreground/90">
        <span className="font-medium">Notas provisionales.</span>{" "}
        Del periodo elegido ({dias} {dias === 1 ? "día" : "días"}) hay registro en {diasConDatos}. La agencia está migrando
        de Infloww a BLU, así que lo esperado se calcula con las personas que ya se mudaron y va a
        moverse cuando entren las demás. Sirve para ver la operación; todavía no para
        evaluar a nadie.
      </p>
    </div>
  );
}

// Feedback del TL en el período: el neto de puntos, con el antes/después en el
// tooltip. La columna Nota YA lo incluye — acá se muestra cuánto de esa nota es
// feedback, que es lo que Jhon pidió ver ("que sea justo lo que el supervisor
// puso ahí en esa nota").
// Si llegaste acá desde otra pantalla de Maven (?back=/dashboard), se dibuja
// un botón para volver. Mismo patrón y misma guarda que el back del Messenger:
// una ruta que no sea interna no se convierte en botón.
const rutaInterna = (r: string | null): boolean => !!r && /^\/[A-Za-z0-9\-_/]*(\?[^#]*)?$/.test(r) && !r.startsWith("//");

function FeedbackCelda({ fila }: { fila: ChatterPeriodo }) {
  const pts = Number(fila.feedback_puntos ?? 0);
  if (!fila.feedback_n) return <span className="text-muted-foreground">—</span>;
  const base = fila.nota_base_promedio == null ? null : Number(fila.nota_base_promedio);
  return (
    <span
      title={base != null
        ? `Nota sin feedback ${base.toFixed(2)} → con feedback ${Number(fila.nota_promedio).toFixed(2)} · ${fila.feedback_n} registro${fila.feedback_n === 1 ? "" : "s"}`
        : `${fila.feedback_n} registro${fila.feedback_n === 1 ? "" : "s"}`}
      className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums",
        pts < 0 ? "border-destructive/30 bg-destructive/10 text-destructive"
        : pts > 0 ? "border-success/30 bg-success/10 text-success"
        : "border-border text-muted-foreground")}
    >
      {pts > 0 ? "+" : ""}{pts}
      <span className="text-[9px] font-normal opacity-70">· {fila.feedback_n}</span>
    </span>
  );
}

function NotaBadge({ nota, dias }: { nota: number | null; dias?: number }) {
  if (nota == null) {
    return <span className="text-xs text-muted-foreground">Sin datos</span>;
  }
  return (
    <span className={cn("inline-flex items-baseline gap-1 rounded-lg border px-2 py-0.5 tabular-nums", tonoDeNota(nota))}>
      <span className="text-sm font-semibold">{nota.toFixed(1)}</span>
      <span className="text-[10px] opacity-70">/10</span>
      {dias != null && <span className="text-[10px] opacity-70">· {dias}d</span>}
    </span>
  );
}

// ── Tira de días ───────────────────────────────────────────────────────────
// El "calendario de movimiento": un cuadrito por día, coloreado por la nota.
// Gris = no hay dato, y es deliberadamente distinto de rojo: no es lo mismo un
// mal día que un día del que no sabemos nada.
function TiraDeDias({
  identityId, desde, hasta, diaSel, onDia,
}: { identityId: string; desde: string; hasta: string; diaSel: string | null; onDia: (d: string) => void }) {
  const { data, isLoading } = useDiasDeChatter(identityId, desde, hasta);
  if (isLoading) return <div className="h-9 flex items-center"><Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /></div>;
  if (!data?.length) return <p className="text-xs text-muted-foreground">Todavía no hay días calculados.</p>;

  return (
    <TooltipProvider delayDuration={120}>
      <div className="flex flex-wrap gap-1">
        {data.map((d) => {
          const faltan = d.detalle?.faltantes ?? [];
          return (
            <Tooltip key={d.dia}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onDia(d.dia)}
                  className={cn(
                    "h-9 w-9 rounded-lg border text-[11px] font-medium tabular-nums transition-all",
                    tonoDeNota(d.nota),
                    diaSel === d.dia && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                  )}
                >
                  {d.nota == null ? "–" : d.nota.toFixed(0)}
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-[240px]">
                <p className="font-medium">{d.dia}</p>
                {d.nota == null ? (
                  <p className="text-xs mt-1">
                    Sin nota{faltan.length > 0 && `: ${faltan.map((f) => NOMBRE_FALTANTE[f] ?? f).join(", ")}`}
                  </p>
                ) : (
                  <div className="text-xs mt-1 space-y-0.5">
                    <p>Vendió {money(d.ventas)} · se esperaba {money(d.ventas_esperadas)}</p>
                    {d.horas != null && <p>Horas {d.horas.toFixed(1)}</p>}
                    {faltan.length > 0 && (
                      <p className="text-warning">
                        Calculada sin: {faltan.map((f) => NOMBRE_FALTANTE[f] ?? f).join(", ")}
                      </p>
                    )}
                  </div>
                )}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

function ModelosDelDia({ identityId, dia }: { identityId: string; dia: string }) {
  const { data, isLoading } = useModelosDelDia(identityId, dia);
  if (isLoading) return <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />;
  if (!data?.length) {
    return <p className="text-xs text-muted-foreground">De este día no tenemos el cruce con modelos.</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {data.map((m) => (
        <span key={m.blu_model_id} className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-2 py-1 text-xs">
          <span className="text-foreground">{m.model_name ?? `Modelo ${m.blu_model_id}`}</span>
          <span className="tabular-nums font-medium">{money(m.sales)}</span>
          <span className="text-muted-foreground">· {m.fans_chatted} fans</span>
        </span>
      ))}
    </div>
  );
}

function Masivos({ identityId, desde, hasta }: { identityId: string; desde: string; hasta: string }) {
  const { data, isLoading } = useMasivos(identityId, desde, hasta);
  if (isLoading) return <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />;
  if (!data?.length) return <p className="text-xs text-muted-foreground">Sin masivos atribuidos en el periodo.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-muted-foreground">
          <tr className="border-b border-border">
            <th className="py-1.5 pr-3 text-left font-medium">Día</th>
            <th className="py-1.5 pr-3 text-left font-medium">Modelo</th>
            <th className="py-1.5 pr-3 text-left font-medium">Mensaje</th>
            <th className="py-1.5 pr-3 text-right font-medium">Precio</th>
            <th className="py-1.5 pr-3 text-right font-medium">Enviados</th>
            <th className="py-1.5 pr-3 text-right font-medium">Vistos</th>
            <th className="py-1.5 pr-3 text-right font-medium">Compraron</th>
            <th className="py-1.5 pr-3 text-right font-medium">Conversión</th>
            <th className="py-1.5 text-right font-medium">Generó</th>
          </tr>
        </thead>
        <tbody>
          {data.map((m) => {
            // Conversión sobre los que LO VIERON, no sobre los enviados: quien no
            // lo abrió nunca tuvo la oportunidad de comprar, y meterlo en el
            // denominador castiga al chatter por algo que no depende de él.
            const conv = m.viewed > 0 ? (100 * m.purchased) / m.viewed : null;
            return (
              <tr key={m.blu_id} className="border-b border-border/50 last:border-0">
                <td className="py-1.5 pr-3 whitespace-nowrap text-muted-foreground">{m.dia}</td>
                <td className="py-1.5 pr-3 whitespace-nowrap">{m.model_name ?? "—"}</td>
                <td className="py-1.5 pr-3 max-w-[280px] truncate" title={m.copy ?? ""}>{m.copy ?? "—"}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{m.price ? money(m.price) : "Gratis"}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{m.sent.toLocaleString("es")}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{m.viewed.toLocaleString("es")}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{m.purchased.toLocaleString("es")}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">
                  {conv == null ? <span className="text-muted-foreground">—</span> : `${conv.toFixed(1)}%`}
                </td>
                <td className="py-1.5 text-right tabular-nums font-medium">{money(m.earnings)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Detalle({ fila, desde, hasta }: { fila: ChatterPeriodo; desde: string; hasta: string }) {
  const [dia, setDia] = useState<string | null>(null);
  return (
    <div className="space-y-4 border-t border-border bg-secondary/30 px-4 py-4">
      <section className="space-y-2">
        <h4 className="text-xs font-medium text-muted-foreground">Nota por día</h4>
        <TiraDeDias identityId={fila.identity_id} desde={desde} hasta={hasta} diaSel={dia} onDia={setDia} />
      </section>

      {dia && (
        <section className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground">Modelos que atendió el {dia}</h4>
          <ModelosDelDia identityId={fila.identity_id} dia={dia} />
        </section>
      )}

      <section className="space-y-2">
        <h4 className="text-xs font-medium text-muted-foreground">Masivos del periodo</h4>
        <Masivos identityId={fila.identity_id} desde={desde} hasta={hasta} />
      </section>
    </div>
  );
}

export default function ChatterRendimiento() {
  // Mismo selector que Panel de control: chips rápidos + calendario de rango.
  const [range, setRange] = useState<DateRange>(() => rangeForPreset("this_month"));
  const [preset, setPreset] = useState<RangePreset | null>("this_month");
  const desde = useMemo(() => isoDia(range.from), [range.from]);
  const hasta = useMemo(() => isoDia(range.to), [range.to]);
  // Por dias de CALENDARIO: el `to` de los presets es el final del dia
  // (23:59:59.999), asi que restar milisegundos y redondear daba un dia de mas.
  const dias = useMemo(
    () => Math.max(1, differenceInCalendarDays(range.to, range.from) + 1),
    [range],
  );
  const [abierto, setAbierto] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const volverA = searchParams.get("back");
  const puedeVolver = rutaInterna(volverA);

  const periodoQ = useChatterPeriodo(desde, hasta);
  const coberturaQ = useCobertura(desde, hasta);

  const diasConDatos = useMemo(
    () => (coberturaQ.data ?? []).filter((c) => c.modelos_traidos > 0).length,
    [coberturaQ.data],
  );

  const filas = periodoQ.data ?? [];
  const activos = filas.filter((f) => f.activo);

  const totales = useMemo(() => {
    const conNota = activos.filter((f) => f.nota_promedio != null);
    return {
      chatters: activos.length,
      conNota: conNota.length,
      // Promedio de promedios, ponderado por días con nota: un chatter con un
      // solo día no debe pesar igual que uno con quince.
      nota: conNota.length
        ? conNota.reduce((a, f) => a + (f.nota_promedio! * f.dias_con_nota), 0) /
          conNota.reduce((a, f) => a + f.dias_con_nota, 0)
        : null,
      ventas: activos.reduce((a, f) => a + (f.ventas_total ?? 0), 0),
      horas: activos.reduce((a, f) => a + (f.horas_total ?? 0), 0),
      masivos: activos.reduce((a, f) => a + f.masivos, 0),
    };
  }, [activos]);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {puedeVolver && (
            <Button
              variant="ghost" size="sm"
              className="mb-1 -ml-2 h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => navigate(volverA!)}
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Volver al dashboard
            </Button>
          )}
          <h1 className="text-xl font-semibold text-foreground">Rendimiento de chatters</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Ventas contra lo esperado, masivos y nota diaria
          </p>
        </div>
        <DateRangePresets
          range={range}
          activePreset={preset}
          onChange={(r, p) => { setRange(r); setPreset(p); }}
          placeholder="Elegir fechas"
        />
      </header>

      <AvisoCobertura dias={dias} diasConDatos={diasConDatos} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Resumen icon={Users} label="Chatters activos" valor={String(totales.chatters)}
          nota={`${totales.conNota} con nota`} />
        <Resumen icon={Gauge} label="Nota del equipo"
          valor={totales.nota == null ? "—" : totales.nota.toFixed(1)} nota="ponderada por días" />
        <Resumen icon={DollarSign} label="Ventas" valor={money(totales.ventas)} />
        <Resumen icon={Clock} label="Horas" valor={totales.horas ? totales.horas.toFixed(0) : "—"} />
        <Resumen icon={Send} label="Masivos" valor={String(totales.masivos)} nota="atribuidos" />
      </div>

      <Card className="overflow-hidden">
        {periodoQ.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !activos.length ? (
          <EmptyState icon={Users} title="Sin chatters" description="No hay chatters activos para mostrar." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-secondary/50 text-xs text-muted-foreground">
                <tr>
                  <th className="py-2.5 pl-4 pr-3 text-left font-medium">Chatter</th>
                  <th className="py-2.5 pr-3 text-left font-medium">Nota</th>
                  <th className="py-2.5 pr-3 text-center font-medium" title="Puntos que el supervisor sumó o restó en el período. La Nota ya los incluye.">Feedback TL</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Ventas</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Esperado</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Horas</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Modelos</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Masivos</th>
                  <th className="py-2.5 pr-4 text-right font-medium">Conversión</th>
                </tr>
              </thead>
              <tbody>
                {activos.map((f) => {
                  const conv = f.masivos_vistos > 0 ? (100 * f.masivos_comprados) / f.masivos_vistos : null;
                  const abiertoAca = abierto === f.identity_id;
                  return (
                    <>
                      <tr
                        key={f.identity_id}
                        onClick={() => setAbierto(abiertoAca ? null : f.identity_id)}
                        className="cursor-pointer border-b border-border/50 hover:bg-secondary/40 transition-colors"
                      >
                        <td className="py-2.5 pl-4 pr-3">
                          <span className="flex items-center gap-1.5">
                            <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", abiertoAca && "rotate-90")} />
                            <span className="font-medium text-foreground">{f.display_name}</span>
                            {!f.maven_user_id && (
                              <Badge variant="outline" className="h-4 px-1 text-[9px] text-muted-foreground">
                                sin cuenta Maven
                              </Badge>
                            )}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3">
                          <NotaBadge nota={f.nota_promedio} dias={f.dias_con_nota || undefined} />
                        </td>
                        <td className="py-2.5 pr-3 text-center">
                          <FeedbackCelda fila={f} />
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{money(f.ventas_total)}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums text-muted-foreground">
                          {money(f.ventas_esperadas_total)}
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">
                          {f.horas_total == null ? <span className="text-muted-foreground">—</span> : f.horas_total.toFixed(0)}
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{f.modelos_distintas || "—"}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{f.masivos || "—"}</td>
                        <td className="py-2.5 pr-4 text-right tabular-nums">
                          {conv == null ? <span className="text-muted-foreground">—</span> : `${conv.toFixed(1)}%`}
                        </td>
                      </tr>
                      {abiertoAca && (
                        <tr key={`${f.identity_id}-detalle`}>
                          <td colSpan={9} className="p-0">
                            <Detalle fila={f} desde={desde} hasta={hasta} />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
        <Info className="h-3.5 w-3.5 shrink-0 mt-px" />
        <span>
          <strong className="font-medium text-foreground">Esperado</strong> es cuánto debería
          vender esa persona ese día: se suman las modelos que atendió, y de cada una se toma lo
          que suele producir <em>un</em> chatter — el total de la modelo repartido entre quienes
          la cubren, porque son tres turnos. Así 400 puede ser mucho para uno y poco para otro.
          Un componente sin dato no cuenta como cero: se reparte el peso entre los que sí hay, y
          si faltan todos, el día queda «Sin datos».
        </span>
      </p>
    </div>
  );
}

function Resumen({ icon: Icon, label, valor, nota }: {
  icon: typeof Users; label: string; valor: string; nota?: string;
}) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[11px]">{label}</span>
      </div>
      <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{valor}</p>
      {nota && <p className="text-[10px] text-muted-foreground">{nota}</p>}
    </Card>
  );
}
