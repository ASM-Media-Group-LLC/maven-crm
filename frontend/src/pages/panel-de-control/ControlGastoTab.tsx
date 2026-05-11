import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Brain, Mic, Search, AlertTriangle } from "lucide-react";
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

// Pulls del 1° del mes en curso hasta ahora — el período natural de
// los caps de los providers (Anthropic factura mensual, ElevenLabs
// también, ScrapeCreators idem).
const useUsageThisMonth = () =>
  useQuery({
    queryKey: ["api-usage-this-month"],
    queryFn: async (): Promise<UsageRow[]> => {
      const since = new Date();
      since.setUTCDate(1);
      since.setUTCHours(0, 0, 0, 0);
      const { data, error } = await (supabase as any)
        .from("api_usage_log")
        .select("provider, occurred_at, cost_usd, operation, model")
        .gte("occurred_at", since.toISOString())
        .order("occurred_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as UsageRow[];
    },
    refetchInterval: 60_000,
  });

// ─── Component ───────────────────────────────────────────────────────

const ControlGastoTab = () => {
  const capsQ = useCaps();
  const usageQ = useUsageThisMonth();
  const caps = capsQ.data ?? [];
  const usage = usageQ.data ?? [];

  // Per-provider summary
  const summaries = useMemo<ProviderSummary[]>(() => {
    const providers = ["anthropic", "elevenlabs", "scrapecreators"];
    return providers.map((p) => {
      const capRow = caps.find((c) => c.provider === p);
      const cap = capRow?.cost_usd_cap_monthly ?? 0;
      const amber = (capRow?.amber_pct ?? 50) / 100;
      const red = (capRow?.red_pct ?? 90) / 100;
      const rows = usage.filter((u) => u.provider === p);
      const monthSpend = rows.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
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
        callsThisMonth: rows.length,
      };
    });
  }, [caps, usage]);

  // Daily chart data — agrupado por día y provider
  const chartData = useMemo(() => {
    const byDay = new Map<string, Record<string, number>>();
    for (const r of usage) {
      const day = r.occurred_at.slice(0, 10);
      const row = byDay.get(day) ?? {};
      row[r.provider] = (row[r.provider] ?? 0) + Number(r.cost_usd ?? 0);
      byDay.set(day, row);
    }
    const days = Array.from(byDay.keys()).sort();
    return days.map((day) => ({
      day,
      anthropic: byDay.get(day)?.anthropic ?? 0,
      elevenlabs: byDay.get(day)?.elevenlabs ?? 0,
      scrapecreators: byDay.get(day)?.scrapecreators ?? 0,
    }));
  }, [usage]);

  const totalMonth = summaries.reduce((s, p) => s + p.monthSpend, 0);
  const totalCap = summaries.reduce((s, p) => s + p.cap, 0);
  const recent = usage.slice(0, 50);

  return (
    <div className="space-y-5">
      {/* Total combinado */}
      <Card className="p-4">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Total mes en curso</p>
            <p className="text-3xl font-bold tabular-nums">${totalMonth.toFixed(2)}</p>
          </div>
          <p className="text-sm text-muted-foreground">
            de ${totalCap.toFixed(2)} caps combinados
          </p>
        </div>
      </Card>

      {/* 3 cards por provider */}
      <div className="grid gap-3 sm:grid-cols-3">
        {summaries.map((s) => {
          const Icon = s.icon;
          const bgByStatus =
            s.status === "red"
              ? "border-rose-500/40 bg-rose-500/5"
              : s.status === "amber"
                ? "border-amber-500/40 bg-amber-500/5"
                : "border-border bg-card";
          const barByStatus =
            s.status === "red" ? "bg-rose-500" : s.status === "amber" ? "bg-amber-500" : "bg-emerald-500";
          return (
            <Card key={s.provider} className={`p-4 ${bgByStatus}`}>
              <div className="flex items-start gap-3">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: s.color }}
                >
                  <Icon className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs uppercase tracking-wider text-foreground/80 font-semibold truncate">
                    {s.label}
                  </p>
                  <p className="mt-1 text-2xl font-bold tabular-nums leading-none">
                    ${s.monthSpend.toFixed(2)}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    de ${s.cap.toFixed(2)} · {s.callsThisMonth.toLocaleString("es")} calls
                  </p>
                </div>
              </div>
              {/* Barra de progreso */}
              <div className="mt-3 h-1.5 w-full rounded-full bg-muted/50 overflow-hidden">
                <div
                  className={`h-full transition-all ${barByStatus}`}
                  style={{ width: `${Math.min(100, s.pctOfCap * 100).toFixed(1)}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
                {(s.pctOfCap * 100).toFixed(1)}% del cap
              </p>
              {s.status === "red" && (
                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-rose-500">
                  <AlertTriangle className="h-3 w-3" />
                  Cerca del cap mensual
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Gráfico diario */}
      <Card className="p-4">
        <h2 className="text-sm font-semibold mb-3">Gasto diario (mes en curso)</h2>
        {chartData.length === 0 ? (
          <p className="text-xs text-muted-foreground py-8 text-center">
            Sin actividad en el mes en curso todavía.
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
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
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
