import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Brain, Mic, Search, AlertTriangle, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

// ─── Tipos ───────────────────────────────────────────────────────────
interface ProviderCap {
  provider: string;
  cost_usd_cap_monthly: number;
  amber_pct: number;
  red_pct: number;
}

interface UsageRow {
  provider: string;
  occurred_at: string;
  cost_usd: number;
  operation: string;
  model: string | null;
}

interface UsageTotal {
  provider: string;
  calls: number;
  cost_usd: number;
}

interface UsageDaily {
  day: string;
  provider: string;
  cost_usd: number;
}

interface UsageSummary {
  totals: UsageTotal[];
  daily: UsageDaily[];
  recent: UsageRow[];
}

interface ProviderSummary {
  provider: string;
  label: string;
  icon: typeof Brain;
  color: string;
  monthSpend: number;
  cap: number;
  pctOfCap: number;
  status: "green" | "amber" | "red";
  callsThisMonth: number;
}

const PROVIDER_LABEL: Record<string, string> = {
  anthropic: "Anthropic (Claude)",
  elevenlabs: "ElevenLabs (Scribe)",
  scrapecreators: "ScrapeCreators",
};

const PROVIDER_ICON: Record<string, typeof Brain> = {
  anthropic: Brain,
  elevenlabs: Mic,
  scrapecreators: Search,
};

const PROVIDER_COLOR: Record<string, string> = {
  anthropic: "rgb(168 85 247)",     // violet
  elevenlabs: "rgb(244 114 182)",   // pink
  scrapecreators: "rgb(34 197 94)", // green
};

// Tailwind classes que matchean con PROVIDER_COLOR. Las usamos para
// los gradient corner blurs y los icon containers — igual lenguaje
// visual que los otros subtabs de Panel de Control (modelos / chatters).
const PROVIDER_GRADIENT: Record<string, string> = {
  anthropic: "bg-violet-500",
  elevenlabs: "bg-pink-500",
  scrapecreators: "bg-emerald-500",
};

// ─── Data hooks ──────────────────────────────────────────────────────

const useCaps = () =>
  useQuery({
    queryKey: ["api-provider-caps"],
    queryFn: async (): Promise<ProviderCap[]> => {
      const { data, error } = await (supabase as any)
        .from("api_provider_caps")
        .select("provider, cost_usd_cap_monthly, amber_pct, red_pct");
      if (error) throw error;
      return (data ?? []) as ProviderCap[];
    },
    staleTime: 5 * 60 * 1000,
  });

// Usa RPC agregado server-side. Antes hacíamos SELECT directo con
// .limit(50000), pero PostgREST de Supabase capa a 1000 rows por defecto
// (db-max-rows) → el dashboard mostraba sólo los últimos 1000 registros,
// que en producción con miles de calls/día de ScrapeCreators significaba:
//   · KPIs subreportados (mostraba 1000 calls cuando había 2968)
//   · Filtro de fecha sin efecto perceptible (siempre los mismos 1000
//     rows más recientes, independiente del rango)
// El RPC agrega en Postgres y devuelve un único JSON con totals + daily
// + recent — un solo round-trip y sin tocar el cap de PostgREST.
const useUsageSummary = (from: Date | undefined, to: Date | undefined) =>
  useQuery({
    queryKey: ["api-usage-summary", from?.toISOString() ?? null, to?.toISOString() ?? null],
    queryFn: async (): Promise<UsageSummary> => {
      const since = from ?? (() => {
        const d = new Date();
        d.setUTCDate(1);
        d.setUTCHours(0, 0, 0, 0);
        return d;
      })();
      const until = to ?? new Date();
      const { data, error } = await (supabase as any).rpc("api_usage_summary", {
        _from: since.toISOString(),
        _to: until.toISOString(),
      });
      if (error) throw error;
      const summary = (data ?? {}) as Partial<UsageSummary>;
      return {
        totals: summary.totals ?? [],
        daily: summary.daily ?? [],
        recent: summary.recent ?? [],
      };
    },
    refetchInterval: 60_000,
    // staleTime 0 → al cambiar el rango se refetchea inmediato.
    staleTime: 0,
  });

// ─── Component ───────────────────────────────────────────────────────

interface ControlGastoTabProps {
  range?: { from: Date | undefined; to: Date | undefined };
}

const ControlGastoTab = ({ range }: ControlGastoTabProps = {}) => {
  const capsQ = useCaps();
  const summaryQ = useUsageSummary(range?.from, range?.to);
  const caps = capsQ.data ?? [];
  const totals = summaryQ.data?.totals ?? [];
  const daily = summaryQ.data?.daily ?? [];
  const recent = summaryQ.data?.recent ?? [];

  // Per-provider summary (los 3 fijos para que la UI siempre muestre las 3
  // cards aunque algún provider no tenga calls en el rango).
  const summaries = useMemo<ProviderSummary[]>(() => {
    const providers = ["anthropic", "elevenlabs", "scrapecreators"];
    return providers.map((p) => {
      const capRow = caps.find((c) => c.provider === p);
      const cap = capRow?.cost_usd_cap_monthly ?? 0;
      const amber = (capRow?.amber_pct ?? 50) / 100;
      const red = (capRow?.red_pct ?? 90) / 100;
      const totalRow = totals.find((t) => t.provider === p);
      const monthSpend = Number(totalRow?.cost_usd ?? 0);
      const calls = Number(totalRow?.calls ?? 0);
      const pct = cap > 0 ? monthSpend / cap : 0;
      const status: ProviderSummary["status"] =
        pct >= red ? "red" : pct >= amber ? "amber" : "green";
      return {
        provider: p,
        label: PROVIDER_LABEL[p] ?? p,
        icon: PROVIDER_ICON[p] ?? Brain,
        color: PROVIDER_COLOR[p] ?? "rgb(99 102 241)",
        monthSpend,
        cap,
        pctOfCap: pct,
        status,
        callsThisMonth: calls,
      };
    });
  }, [caps, totals]);

  // Daily chart data — el RPC ya devuelve agrupado por día+provider;
  // sólo necesitamos transformar al shape que Recharts espera (un objeto
  // por día con un campo por provider).
  const chartData = useMemo(() => {
    const byDay = new Map<string, Record<string, number>>();
    for (const r of daily) {
      const row = byDay.get(r.day) ?? {};
      row[r.provider] = (row[r.provider] ?? 0) + Number(r.cost_usd ?? 0);
      byDay.set(r.day, row);
    }
    const days = Array.from(byDay.keys()).sort();
    return days.map((day) => ({
      day,
      anthropic: byDay.get(day)?.anthropic ?? 0,
      elevenlabs: byDay.get(day)?.elevenlabs ?? 0,
      scrapecreators: byDay.get(day)?.scrapecreators ?? 0,
    }));
  }, [daily]);

  const totalMonth = summaries.reduce((s, p) => s + p.monthSpend, 0);
  const totalCap = summaries.reduce((s, p) => s + p.cap, 0);

  const totalPct = totalCap > 0 ? totalMonth / totalCap : 0;

  return (
    <div className="space-y-5">
      {/* Hero — Total mes en curso. Mismo lenguaje visual que las hero
          cards de Reclutamiento modelos: border-2 con color, gradient
          corner blur que se intensifica en hover. */}
      <Card className="p-5 border-2 border-indigo-500/30 relative overflow-hidden">
        <div className="relative">
          <p className="text-xs text-foreground/80 font-semibold">
            Total en el rango
          </p>
          <div className="flex items-end gap-3 mt-2">
            <p className="text-4xl font-bold tabular-nums leading-none">
              ${totalMonth.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground pb-1">
              de ${totalCap.toFixed(2)} caps combinados · {(totalPct * 100).toFixed(1)}%
            </p>
          </div>
        </div>
      </Card>

      {/* 3 cards por provider — estilo KpiCard del tab modelos: gradient
          corner blur con el color del provider, icono en cuadrado de
          color, label uppercase, valor grande, hint debajo. */}
      <div className="grid gap-3 sm:grid-cols-3">
        {summaries.map((s) => {
          const Icon = s.icon;
          const gradient = PROVIDER_GRADIENT[s.provider] ?? "bg-slate-500";
          const borderByStatus =
            s.status === "red"
              ? "border-destructive/40"
              : s.status === "amber"
                ? "border-warning/40"
                : "border-border";
          const barByStatus =
            s.status === "red" ? "bg-destructive" : s.status === "amber" ? "bg-warning" : "bg-success";
          return (
            <Card
              key={s.provider}
              className={cn(
                "p-4 relative overflow-hidden border",
                borderByStatus,
              )}
            >
              <div className="relative space-y-3">
                <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", gradient)}>
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-xs text-foreground/80 font-semibold truncate">
                    {s.label}
                  </p>
                  <p className="text-3xl font-bold tabular-nums leading-tight">
                    ${s.monthSpend.toFixed(2)}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">
                    de ${s.cap.toFixed(2)} · {s.callsThisMonth.toLocaleString("es")} calls
                  </p>
                </div>
                {/* Progress bar — fina, status-coloreada. */}
                <div>
                  <div className="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden">
                    <div
                      className={cn("h-full transition-all", barByStatus)}
                      style={{ width: `${Math.min(100, s.pctOfCap * 100).toFixed(1)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground tabular-nums mt-1">
                    {(s.pctOfCap * 100).toFixed(1)}% del cap
                  </p>
                </div>
                {s.status === "red" && (
                  <div className="flex items-center gap-1.5 text-[11px] text-destructive font-medium">
                    <AlertTriangle className="h-3 w-3" />
                    Cerca del cap mensual
                  </div>
                )}
              </div>
            </Card>
          );
        })}

        {/* Card derived — % del cap combinado. Misma estética que el
            "Tasa de cierre" del tab modelos. */}
        <Card className="p-4 border-2 border-fuchsia-500/30 relative overflow-hidden">
          <div className="relative space-y-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-fuchsia-500">
              <DollarSign className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-foreground/80 font-semibold">
                % del cap combinado
              </p>
              <p className="text-3xl font-bold tabular-nums leading-tight">
                {(totalPct * 100).toFixed(1)}
                <span className="text-lg text-muted-foreground">%</span>
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                ${totalMonth.toFixed(2)} / ${totalCap.toFixed(2)}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Gráfico diario */}
      <Card className="p-4">
        <h2 className="text-sm font-semibold mb-3">Gasto diario (rango seleccionado)</h2>
        {chartData.length === 0 ? (
          <p className="text-xs text-muted-foreground py-8 text-center">
            Sin actividad en el rango seleccionado.
          </p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="day" className="text-xs" tick={{ fill: "hsl(240,4%,46%)" }} />
                <YAxis
                  className="text-xs"
                  tick={{ fill: "hsl(240,4%,46%)" }}
                  tickFormatter={(v) => `$${Number(v).toFixed(2)}`}
                />
                <Tooltip
                  formatter={(v: any) => `$${Number(v).toFixed(4)}`}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                />
                <Legend />
                <Line type="monotone" dataKey="anthropic" stroke={PROVIDER_COLOR.anthropic} strokeWidth={2} dot={false} name="Anthropic" />
                <Line type="monotone" dataKey="elevenlabs" stroke={PROVIDER_COLOR.elevenlabs} strokeWidth={2} dot={false} name="ElevenLabs" />
                <Line type="monotone" dataKey="scrapecreators" stroke={PROVIDER_COLOR.scrapecreators} strokeWidth={2} dot={false} name="ScrapeCreators" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Actividad reciente */}
      <Card className="p-4">
        <h2 className="text-sm font-semibold mb-3">Últimas 50 calls</h2>
        {recent.length === 0 ? (
          <p className="text-xs text-muted-foreground py-8 text-center">
            Sin calls registradas todavía. El logging empieza después del próximo deploy de las edge functions / worker.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla-movil w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3">Fecha</th>
                  <th className="py-2 pr-3">Provider</th>
                  <th className="py-2 pr-3">Operación</th>
                  <th className="py-2 pr-3">Modelo</th>
                  <th className="py-2 pr-3 text-right">Costo</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r, i) => (
                  <tr key={i} className="border-b border-border/40">
                    <td className="py-1.5 pr-3 text-xs text-muted-foreground tabular-nums">
                      {new Date(r.occurred_at).toLocaleString("es-CO", {
                        month: "short",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-1.5 pr-3 text-xs">{PROVIDER_LABEL[r.provider] ?? r.provider}</td>
                    <td className="py-1.5 pr-3 text-xs font-mono text-muted-foreground">{r.operation}</td>
                    <td className="py-1.5 pr-3 text-xs font-mono text-muted-foreground">{r.model ?? "—"}</td>
                    <td className="py-1.5 pr-3 text-xs text-right tabular-nums">
                      ${Number(r.cost_usd).toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default ControlGastoTab;
