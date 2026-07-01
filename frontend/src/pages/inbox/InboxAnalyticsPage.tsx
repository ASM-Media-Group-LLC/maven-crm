// Analítica SLA de la bandeja de WhatsApp (P1.3, inspirado en Whaticket → Informes).
// Management-only: el RPC get_wa_inbox_sla gatea por blu_is_management; la ruta
// va bajo submódulo "Analítica" (admins la ven; roles no-management → 42501 → aviso).
// Métrica clave = MEDIANA de 1ª respuesta (el promedio se infla con outliers).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { format, subDays, startOfToday } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { ArrowLeft, BarChart3, Clock, MessageSquare, AlertTriangle, Bot } from "lucide-react";

interface AgentRow { user_id: string | null; respondidas: number; sin_responder: number; resp_prom_min: number | null; resp_median_min: number | null; }
interface ChannelRow { channel_id: string | null; respondidas: number; sin_responder: number; resp_prom_min: number | null; }
interface SlaData {
  overall: {
    convos: number; entrantes: number; sal_humano: number; sal_bot: number;
    respondidas: number; sin_responder: number; pct_respondidas: number;
    resp_prom_min: number | null; resp_median_min: number | null;
  };
  by_agent: AgentRow[];
  by_channel: ChannelRow[];
}

const fmtMin = (m: number | null | undefined): string => {
  if (m == null) return "—";
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`;
};
const ymd = (d: Date | undefined) => (d ? format(d, "yyyy-MM-dd") : null);

const InboxAnalyticsPage = () => {
  const [from, setFrom] = useState<Date | undefined>(subDays(startOfToday(), 29));
  const [to, setTo] = useState<Date | undefined>(startOfToday());

  const { data, isLoading, error } = useQuery({
    queryKey: ["wa-inbox-sla", ymd(from), ymd(to)],
    queryFn: async (): Promise<SlaData | null> => {
      const { data, error } = await (supabase as any).rpc("get_wa_inbox_sla", { p_from: ymd(from), p_to: ymd(to) });
      if (error) {
        if (error.code === "42501") return null; // sin permiso
        throw error;
      }
      return data as SlaData;
    },
    staleTime: 60_000,
  });

  // Nombres de agentes y etiquetas de líneas (mismas queries livianas que la bandeja).
  const { data: users = [] } = useQuery({
    queryKey: ["wa-sla-users"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name");
      return (data ?? []) as { id: string; full_name: string | null }[];
    },
    staleTime: 5 * 60_000,
  });
  const { data: channels = [] } = useQuery({
    queryKey: ["wa-sla-channels"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("wa_channels").select("id, label, evolution_instance");
      return (data ?? []) as { id: string; label: string | null; evolution_instance: string }[];
    },
    staleTime: 5 * 60_000,
  });
  const userName = (id: string | null) => (!id ? "Sin asignar" : users.find((u) => u.id === id)?.full_name || id.slice(0, 8));
  const channelName = (id: string | null) => {
    if (!id) return "Sin línea";
    const c = channels.find((c) => c.id === id);
    return c ? (c.label || c.evolution_instance) : id.slice(0, 8);
  };

  const o = data?.overall;
  const agents = useMemo(() => (data?.by_agent ?? []).slice().sort((a, b) => (b.sin_responder - a.sin_responder)), [data]);
  const chans = data?.by_channel ?? [];

  return (
    <div className="space-y-4 px-6 py-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" className="h-7 w-7 -ml-1" title="Volver a la bandeja">
          <Link to="/inbox"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <BarChart3 className="h-5 w-5 text-primary" />
        <div className="flex-1">
          <h1 className="text-base font-semibold leading-tight">Analítica de la bandeja</h1>
          <p className="text-xs text-muted-foreground">
            Tiempo de 1ª respuesta, conversaciones sin responder y volumen — por closer y por línea.
          </p>
        </div>
        <DateRangePicker from={from} to={to} onApply={(f, t) => { setFrom(f); setTo(t); }} placeholder="Rango de fechas" />
        <Button variant="outline" size="sm" asChild>
          <Link to="/inbox/canales">Canales</Link>
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
          Error cargando la analítica: {(error as Error).message}
        </div>
      ) : !isLoading && !data ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Esta sección es solo para management. Si creés que deberías tener acceso, pedíselo a un admin.
        </div>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Cargando…</p>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg border bg-card p-3 md:col-span-1">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> 1ª respuesta (mediana)</p>
              <p className="text-2xl font-bold text-foreground">{fmtMin(o?.resp_median_min)}</p>
              <p className="text-xs text-muted-foreground">promedio {fmtMin(o?.resp_prom_min)}</p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Sin responder</p>
              <p className="text-2xl font-bold" style={{ color: "hsl(0, 65%, 55%)" }}>{o?.sin_responder ?? 0}</p>
              <p className="text-xs text-muted-foreground">de {o?.convos ?? 0} conversaciones</p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" /> Respondidas</p>
              <p className="text-2xl font-bold" style={{ color: "hsl(150, 60%, 45%)" }}>{o?.respondidas ?? 0}</p>
              <p className="text-xs text-muted-foreground">{o?.pct_respondidas ?? 0}% del total</p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">Mensajes (entran / salen)</p>
              <p className="text-2xl font-bold text-foreground">{o?.entrantes ?? 0} <span className="text-muted-foreground text-lg">/ {o?.sal_humano ?? 0}</span></p>
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Bot className="h-3 w-3" /> {o?.sal_bot ?? 0} del bot</p>
            </div>
          </div>

          {/* Por agente */}
          <div>
            <p className="text-xs text-muted-foreground mb-2 font-semibold">Por closer</p>
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead>
                  <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                    <th className="text-left p-2 font-semibold">Closer</th>
                    <th className="text-right p-2 font-semibold">1ª resp (mediana)</th>
                    <th className="text-right p-2 font-semibold">Promedio</th>
                    <th className="text-right p-2 font-semibold">Respondidas</th>
                    <th className="text-right p-2 font-semibold">Sin responder</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.length === 0 ? (
                    <tr><td colSpan={5} className="p-4 text-center text-muted-foreground text-xs">Sin datos en el rango.</td></tr>
                  ) : agents.map((a) => (
                    <tr key={a.user_id ?? "none"} className="border-b last:border-0">
                      <td className="p-2 font-medium text-foreground">{userName(a.user_id)}</td>
                      <td className="p-2 text-right tabular-nums">{fmtMin(a.resp_median_min)}</td>
                      <td className="p-2 text-right tabular-nums text-muted-foreground">{fmtMin(a.resp_prom_min)}</td>
                      <td className="p-2 text-right tabular-nums" style={{ color: "hsl(150, 60%, 45%)" }}>{a.respondidas}</td>
                      <td className="p-2 text-right tabular-nums" style={{ color: a.sin_responder > 0 ? "hsl(0, 65%, 55%)" : undefined }}>{a.sin_responder}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Por línea */}
          <div>
            <p className="text-xs text-muted-foreground mb-2 font-semibold">Por línea</p>
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-sm min-w-[420px]">
                <thead>
                  <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                    <th className="text-left p-2 font-semibold">Línea</th>
                    <th className="text-right p-2 font-semibold">1ª resp (prom)</th>
                    <th className="text-right p-2 font-semibold">Respondidas</th>
                    <th className="text-right p-2 font-semibold">Sin responder</th>
                  </tr>
                </thead>
                <tbody>
                  {chans.length === 0 ? (
                    <tr><td colSpan={4} className="p-4 text-center text-muted-foreground text-xs">Sin datos en el rango.</td></tr>
                  ) : chans.map((c) => (
                    <tr key={c.channel_id ?? "none"} className="border-b last:border-0">
                      <td className="p-2 font-medium text-foreground">{channelName(c.channel_id)}</td>
                      <td className="p-2 text-right tabular-nums text-muted-foreground">{fmtMin(c.resp_prom_min)}</td>
                      <td className="p-2 text-right tabular-nums" style={{ color: "hsl(150, 60%, 45%)" }}>{c.respondidas}</td>
                      <td className="p-2 text-right tabular-nums" style={{ color: c.sin_responder > 0 ? "hsl(0, 65%, 55%)" : undefined }}>{c.sin_responder}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            "1ª respuesta" = del primer mensaje entrante de la conversación (en el rango) a la primera respuesta de un agente. La <b>mediana</b> es más fiel que el promedio (que se infla con casos que respondieron días después).
          </p>
        </>
      )}
    </div>
  );
};

export default InboxAnalyticsPage;
