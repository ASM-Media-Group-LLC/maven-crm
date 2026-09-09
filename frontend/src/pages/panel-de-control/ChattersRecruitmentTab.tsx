import { useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Users,
  UserCheck,
  MessageSquare,
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import StatChip from "@/components/StatChip";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useChattersRecruitment,
  useChattersRecruitmentDetails,
  type ChattersMetricKey,
  type ChattersRange,
} from "@/hooks/useChattersRecruitment";
import { cn } from "@/lib/utils";
import { ListRow } from "@/components/ui/list-row";

// ─── KPI card (mismo lenguaje visual que el tab modelos) ───────────────
interface KpiCardProps {
  metricKey: ChattersMetricKey;
  label: string;
  value: number;
  icon: React.ReactNode;
  gradient: string;
  hint?: string;
  loading: boolean;
  onClick: () => void;
}

const KpiCard = ({ label, value, icon, gradient, hint, loading, onClick }: KpiCardProps) => (
  <StatChip
    label={label}
    value={loading ? <Skeleton className="h-6 w-16" /> : value.toLocaleString("es")}
    hint={hint}
    color={gradient}
    icon={icon}
    onClick={loading ? undefined : onClick}
  />
);

// ─── Funnel step indicator (igual al tab modelos) ──────────────────────
const FunnelStep = ({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) => (
  <div className="flex flex-col">
    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
    <span className={cn("text-lg font-bold tabular-nums", color)}>
      {value.toLocaleString("es")}
    </span>
  </div>
);

// ─── Detail dialog ─────────────────────────────────────────────────────
const DetailDialog = ({
  open,
  onOpenChange,
  metric,
  metricLabel,
  range,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  metric: ChattersMetricKey | null;
  metricLabel: string;
  range: ChattersRange;
}) => {
  const { data, isLoading } = useChattersRecruitmentDetails(
    metric ?? "total",
    range,
    open && !!metric,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{metricLabel}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
          {isLoading ? (
            <>
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </>
          ) : !data || data.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              Sin registros en el rango seleccionado.
            </p>
          ) : (
            data.map((row) => (
              <ListRow key={row.id} className="justify-between">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{row.primary}</p>
                  {row.secondary && (
                    <p className="text-xs text-muted-foreground truncate">{row.secondary}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {typeof row.scorePct === "number" && (
                    <span className="text-xs tabular-nums font-semibold">
                      {row.scorePct}%
                    </span>
                  )}
                  {row.badge && (
                    <Badge variant="outline" className="text-[10px]">
                      {row.badge}
                    </Badge>
                  )}
                  {row.date && (
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {format(new Date(row.date), "d MMM", { locale: es })}
                    </span>
                  )}
                </div>
              </ListRow>
            ))
          )}
        </div>

        {data && data.length === 100 && (
          <p className="text-[10px] text-muted-foreground text-center pt-2 border-t border-border/40">
            Mostrando los primeros 100.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
};

// ─── Main tab ─────────────────────────────────────────────────────────
interface Props {
  range: ChattersRange;
}

const ChattersRecruitmentTab = ({ range }: Props) => {
  const { data, isLoading } = useChattersRecruitment(range);
  const [openMetric, setOpenMetric] = useState<ChattersMetricKey | null>(null);

  const k = data ?? {
    total: 0,
    claimed: 0,
    ended: 0,
    evaluated: 0,
    apto: 0,
    noApto: 0,
  };

  // Tasa de aprobación = apto / evaluated. Mide eficacia del filtro.
  const approvalRate =
    k.evaluated > 0 ? Math.round((k.apto / k.evaluated) * 1000) / 10 : 0;
  // Tasa de claim = claimed / total. Mide cuántos candidatos efectivamente
  // abren el link después de recibirlo.
  const claimRate = k.total > 0 ? Math.round((k.claimed / k.total) * 1000) / 10 : 0;

  const cards: Array<{
    key: ChattersMetricKey;
    label: string;
    value: number;
    icon: React.ReactNode;
    gradient: string;
    hint?: string;
  }> = [
    {
      key: "total",
      label: "Sesiones creadas",
      value: k.total,
      icon: <Users className="h-3.5 w-3.5" />,
      gradient: "bg-indigo-500",
      hint: "Invitaciones generadas por examiners",
    },
    {
      key: "claimed",
      label: "Reclamadas",
      value: k.claimed,
      icon: <UserCheck className="h-3.5 w-3.5" />,
      gradient: "bg-primary",
      hint: "Candidato abrió el link y comenzó la sesión",
    },
    {
      key: "ended",
      label: "Completadas",
      value: k.ended,
      icon: <MessageSquare className="h-3.5 w-3.5" />,
      gradient: "bg-cyan-500",
      hint: "Sesiones terminadas (status='ended')",
    },
    {
      key: "evaluated",
      label: "Evaluadas",
      value: k.evaluated,
      icon: <ClipboardCheck className="h-3.5 w-3.5" />,
      gradient: "bg-primary",
      hint: "El examiner cerró el veredicto",
    },
    {
      key: "apto",
      label: "Aprobados",
      value: k.apto,
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      gradient: "bg-success",
      hint: "Verdict = apto",
    },
    {
      key: "noApto",
      label: "Rechazados",
      value: k.noApto,
      icon: <XCircle className="h-3.5 w-3.5" />,
      gradient: "bg-destructive",
      hint: "Verdict = no_apto",
    },
  ];

  const activeMetricLabel =
    cards.find((c) => c.key === openMetric)?.label ?? "";

  const funnelChartData = [
    { stage: "Creadas",     value: k.total,      fill: "#6366f1" },
    { stage: "Reclamadas",  value: k.claimed,    fill: "#3b82f6" },
    { stage: "Completadas", value: k.ended,      fill: "#06b6d4" },
    { stage: "Evaluadas",   value: k.evaluated,  fill: "#8b5cf6" },
    { stage: "Aprobadas",   value: k.apto,       fill: "#10b981" },
  ];

  return (
    <div className="space-y-5">
      {/* Hero — Total sesiones + Tasa de aprobación */}
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setOpenMetric("total")}
          className="group relative overflow-hidden rounded-xl border-2 border-indigo-500/30 bg-card p-5 text-left transition-all duration-200 hover:border-indigo-500/60 hover:shadow-[0_0_24px_-4px_rgba(99,102,241,0.4)]"
        >
          <div className="relative">
            <p className="text-xs uppercase tracking-wider text-foreground/80 font-semibold">
              Total sesiones de evaluación
            </p>
            <div className="flex items-end gap-3 mt-2">
              <p className="text-4xl font-bold tabular-nums leading-none">
                {k.total.toLocaleString("es")}
              </p>
              <p className="text-xs text-muted-foreground pb-1">
                {k.claimed.toLocaleString("es")} reclamadas ({claimRate}%)
              </p>
            </div>
          </div>
        </button>

        <Card className="p-5 border-2 border-emerald-500/30 relative overflow-hidden">
          <div className="relative">
            <p className="text-xs uppercase tracking-wider text-foreground/80 font-semibold">
              Tasa de aprobación
            </p>
            <div className="flex items-end gap-3 mt-2">
              <p className="text-4xl font-bold tabular-nums leading-none">
                {approvalRate}
                <span className="text-xl text-muted-foreground">%</span>
              </p>
              <p className="text-xs text-muted-foreground pb-1">
                {k.apto.toLocaleString("es")} aptos de {k.evaluated.toLocaleString("es")} evaluados
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* KPI grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <KpiCard
            key={c.key}
            metricKey={c.key}
            label={c.label}
            value={c.value}
            icon={c.icon}
            gradient={c.gradient}
            hint={c.hint}
            loading={isLoading}
            onClick={() => setOpenMetric(c.key)}
          />
        ))}

        {/* Tasa de aprobación — derived metric, sin popup */}
        <Card className="p-4 border-2 border-emerald-500/30 relative overflow-hidden">
          <div className="relative space-y-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-foreground/80 font-semibold">
                Tasa de aprobación
              </p>
              <p className="text-3xl font-bold tabular-nums leading-tight">
                {approvalRate}
                <span className="text-lg text-muted-foreground">%</span>
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Aprobados / Evaluados ({k.apto}/{k.evaluated})
              </p>
            </div>
          </div>
        </Card>

        {/* Tasa de claim — derived metric, sin popup */}
        <Card className="p-4 border-2 border-blue-500/30 relative overflow-hidden">
          <div className="relative space-y-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-foreground/80 font-semibold">
                Tasa de claim
              </p>
              <p className="text-3xl font-bold tabular-nums leading-tight">
                {claimRate}
                <span className="text-lg text-muted-foreground">%</span>
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Reclamadas / Creadas ({k.claimed}/{k.total})
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Funnel visual flow */}
      <Card className="p-4">
        <h2 className="text-sm font-semibold mb-3">Flujo del funnel</h2>
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <FunnelStep label="Creadas"     value={k.total}     color="text-indigo-400" />
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <FunnelStep label="Reclamadas"  value={k.claimed}   color="text-blue-400" />
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <FunnelStep label="Completadas" value={k.ended}     color="text-cyan-400" />
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <FunnelStep label="Evaluadas"   value={k.evaluated} color="text-violet-400" />
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <FunnelStep label="Aprobadas"   value={k.apto}      color="text-emerald-400" />
        </div>
      </Card>

      {/* Bar chart del funnel */}
      <Card className="p-4">
        <h2 className="text-sm font-semibold mb-3">Funnel de reclutamiento</h2>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={funnelChartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="stage" className="text-xs" tick={{ fill: "hsl(240,4%,46%)" }} />
              <YAxis className="text-xs" tick={{ fill: "hsl(240,4%,46%)" }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
              />
              <Bar dataKey="value" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <DetailDialog
        open={openMetric !== null}
        onOpenChange={(o) => !o && setOpenMetric(null)}
        metric={openMetric}
        metricLabel={activeMetricLabel}
        range={range}
      />
    </div>
  );
};

export default ChattersRecruitmentTab;
