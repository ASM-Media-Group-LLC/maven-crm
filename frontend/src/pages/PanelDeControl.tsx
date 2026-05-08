import { useState } from "react";
import { startOfMonth, endOfMonth, startOfDay, format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Users,
  Phone,
  PhoneCall,
  CheckCircle2,
  Clock,
  XCircle,
  Building2,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import {
  useOperationsDashboard,
  useMetricDetails,
  useLeadDetail,
  type MetricKey,
  type DashboardRange,
  type DetailRow,
} from "@/hooks/useOperationsDashboard";
import { cn } from "@/lib/utils";

// ─── KPI card ──────────────────────────────────────────────────────────

interface KpiCardProps {
  metricKey: MetricKey;
  label: string;
  value: number;
  icon: React.ReactNode;
  gradient: string;
  hint?: string;
  loading: boolean;
  onClick: () => void;
}

const KpiCard = ({
  label,
  value,
  icon,
  gradient,
  hint,
  loading,
  onClick,
}: KpiCardProps) => (
  <button
    type="button"
    onClick={onClick}
    disabled={loading}
    className={cn(
      "group relative overflow-hidden rounded-xl border border-border bg-card p-4 text-left",
      "transition-all duration-200 ease-out",
      "hover:scale-[1.025] hover:border-primary/40 hover:shadow-[0_0_24px_-4px_rgba(255,255,255,0.15)]",
      "active:scale-[0.99]",
      "disabled:cursor-not-allowed disabled:opacity-70",
    )}
  >
    {/* Gradient corner accent */}
    <div
      className={cn(
        "absolute -right-12 -top-12 h-32 w-32 rounded-full blur-3xl opacity-25",
        "transition-opacity group-hover:opacity-50",
        gradient,
      )}
    />

    <div className="relative space-y-3">
      <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", gradient)}>
        {icon}
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
          {label}
        </p>
        {loading ? (
          <Skeleton className="mt-1 h-9 w-24" />
        ) : (
          <p className="text-3xl font-bold tabular-nums leading-tight">
            {value.toLocaleString("es")}
          </p>
        )}
        {hint && (
          <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">
            {hint}
          </p>
        )}
      </div>
    </div>
  </button>
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
  metric: MetricKey | null;
  metricLabel: string;
  range: DashboardRange;
}) => {
  const navigate = useNavigate();
  const { data, isLoading } = useMetricDetails(
    metric ?? "contacted",
    range,
    open && !!metric,
  );
  // Lead detail nested dialog: cuando el user clickea una fila con
  // leadSource (lead o creator), abrimos un segundo dialog encima
  // con TODA la info del row.
  const [detailLead, setDetailLead] = useState<{
    source: "leadgen" | "scouter" | "creator";
    id: string;
    title: string;
  } | null>(null);

  return (
    <>
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
            data.map((row) => {
              const handleRowClick = () => {
                if (row.linkUrl) {
                  navigate(row.linkUrl);
                  onOpenChange(false);
                  return;
                }
                if (row.leadSource) {
                  setDetailLead({
                    source: row.leadSource,
                    id: row.id,
                    title: row.primary,
                  });
                }
              };
              const isClickable = !!row.linkUrl || !!row.leadSource;
              return (
                <div
                  key={row.id}
                  onClick={handleRowClick}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm transition-colors",
                    isClickable &&
                      "cursor-pointer hover:bg-accent hover:border-primary/40",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{row.primary}</p>
                    {row.secondary && (
                      <p className="text-xs text-muted-foreground truncate">
                        {row.secondary}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
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
                    {isClickable && (
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {data && data.length === 100 && (
          <p className="text-[10px] text-muted-foreground text-center pt-2 border-t border-border/40">
            Mostrando los primeros 100 — si querés todos, exportar desde Reports.
          </p>
        )}
      </DialogContent>
    </Dialog>

    {/* Lead detail nested popup — abre al click en una fila con leadSource */}
    <LeadDetailDialog
      open={!!detailLead}
      onOpenChange={(o) => !o && setDetailLead(null)}
      source={detailLead?.source}
      id={detailLead?.id ?? null}
      title={detailLead?.title ?? ""}
    />
    </>
  );
};

// ─── Lead detail dialog ────────────────────────────────────────────────
// Popup que muestra TODOS los campos del lead seleccionado en formato
// key/value. Funciona para los 3 sources: leadgen_entries, scouter_leads,
// creators (para los Ingresos al CRM).

const FIELD_LABELS: Record<string, string> = {
  model_handle: "Handle (modelo)",
  instagram_handle: "Instagram",
  phone_e164: "Teléfono",
  phone_raw: "Teléfono (raw)",
  phone: "Teléfono",
  status: "Status",
  quality: "Calidad",
  record_type: "Tipo de registro",
  notes: "Notas",
  source_link: "Source link",
  state: "Estado/Provincia",
  country: "País",
  country_code: "Código país",
  city: "Ciudad",
  followers: "Seguidores",
  bio: "Bio",
  ai_score: "AI Score",
  ai_status: "AI Status",
  ai_reason: "AI Razón",
  category: "Categoría",
  platform: "Plataforma",
  onlyfans_url: "OnlyFans URL",
  name: "Nombre",
  entered_crm_at: "Ingresada al CRM",
  entered_crm_notes: "Notas CRM",
  created_at: "Creada",
  updated_at: "Actualizada",
};

const HIDDEN_FIELDS = new Set([
  "id",
  "tenant_id",
  "lg_user_id",
  "entered_crm_by",
  "company_id",
  "created_creator_id",
]);

const LeadDetailDialog = ({
  open,
  onOpenChange,
  source,
  id,
  title,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  source?: "leadgen" | "scouter" | "creator";
  id: string | null;
  title: string;
}) => {
  const { data, isLoading } = useLeadDetail(source, id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {title}
            {source && (
              <Badge variant="outline" className="text-[10px]">
                {source}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {isLoading ? (
            <>
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </>
          ) : !data ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              No se encontró el registro.
            </p>
          ) : (
            Object.entries(data)
              .filter(
                ([k, v]) =>
                  !HIDDEN_FIELDS.has(k) &&
                  v !== null &&
                  v !== "" &&
                  !(typeof v === "object" && Object.keys(v ?? {}).length === 0),
              )
              .map(([k, v]) => (
                <div
                  key={k}
                  className="grid grid-cols-[140px_1fr] gap-3 py-1.5 border-b border-border/40 last:border-0"
                >
                  <span className="text-xs text-muted-foreground font-medium">
                    {FIELD_LABELS[k] ?? k}
                  </span>
                  <span className="text-sm break-words">
                    {typeof v === "boolean"
                      ? v
                        ? "Sí"
                        : "No"
                      : typeof v === "object"
                        ? JSON.stringify(v).slice(0, 200)
                        : String(v)}
                  </span>
                </div>
              ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ─── Page ──────────────────────────────────────────────────────────────

const PanelDeControl = () => {
  const today = startOfDay(new Date());
  const [range, setRange] = useState<DashboardRange>({
    from: startOfMonth(today),
    to: endOfMonth(today),
  });
  const [openMetric, setOpenMetric] = useState<MetricKey | null>(null);
  const { data, isLoading } = useOperationsDashboard(range);

  const k = data ?? {
    contacted: 0,
    scouterContacts: 0,
    llgWithPhone: 0,
    scouterWithPhone: 0,
    numbersObtained: 0,
    closerCalls: 0,
    closes: 0,
    onHold: 0,
    rejections: 0,
    enteredCrm: 0,
    totalLeads: 0,
  };

  // Tasa de números obtenidos / total leads (todos los canales)
  const phoneRate =
    k.totalLeads > 0
      ? Math.round((k.numbersObtained / k.totalLeads) * 1000) / 10
      : 0;

  // Bar chart del funnel — todo cross-team. "Contactadas" = LLG+Scouter
  // (= totalLeads). "Núm. obtenidos" = numbersObtained (combinado). La
  // cadena queda monotónicamente decreciente porque numbersObtained es
  // subset de totalLeads, closerCalls subset de numbersObtained, etc.
  const funnelChartData = [
    { stage: "Contactadas",     value: k.totalLeads,       fill: "#3b82f6" },
    { stage: "Núm. obtenidos",  value: k.numbersObtained,  fill: "#06b6d4" },
    { stage: "Llamadas",        value: k.closerCalls,      fill: "#8b5cf6" },
    { stage: "Cierres",         value: k.closes,           fill: "#10b981" },
    { stage: "Ingresos CRM",    value: k.enteredCrm,       fill: "#6366f1" },
  ];

  const cards: Array<{
    key: MetricKey;
    label: string;
    value: number;
    icon: React.ReactNode;
    gradient: string;
    hint: string;
  }> = [
    {
      key: "totalLeads",
      label: "Modelos contactadas",
      value: k.totalLeads,
      icon: <Users className="h-5 w-5 text-white" />,
      gradient: "bg-blue-500",
      hint: `LLG: ${k.contacted.toLocaleString("es")} · Scouter: ${k.scouterContacts.toLocaleString("es")}`,
    },
    {
      key: "numbersObtained",
      label: "Números obtenidos",
      value: k.numbersObtained,
      icon: <Phone className="h-5 w-5 text-white" />,
      gradient: "bg-cyan-500",
      hint: "Capturas únicas (leadgen + closer + creator) sin duplicados",
    },
    {
      key: "closerCalls",
      label: "Llamadas para cierre",
      value: k.closerCalls,
      icon: <PhoneCall className="h-5 w-5 text-white" />,
      gradient: "bg-violet-500",
      hint: "Audios subidos al Company QA",
    },
    {
      key: "closes",
      label: "Cierres",
      value: k.closes,
      icon: <CheckCircle2 className="h-5 w-5 text-white" />,
      gradient: "bg-emerald-500",
      hint: "IA marcó la llamada como cerro",
    },
    {
      key: "onHold",
      label: "En espera",
      value: k.onHold,
      icon: <Clock className="h-5 w-5 text-white" />,
      gradient: "bg-amber-500",
      hint: "Modelos pensándolo / no decidieron",
    },
    {
      key: "rejections",
      label: "Rechazos",
      value: k.rejections,
      icon: <XCircle className="h-5 w-5 text-white" />,
      gradient: "bg-rose-500",
      hint: "IA marcó la llamada como no_cerro",
    },
    {
      key: "enteredCrm",
      label: "Ingresos al CRM",
      value: k.enteredCrm,
      icon: <Building2 className="h-5 w-5 text-white" />,
      gradient: "bg-indigo-500",
      hint: "Closer marcó como ingresada al CRM",
    },
  ];

  // Tasa de cierre = cierres / total de llamadas. "En espera" y "rechazos"
  // ambos cuentan como NO cerrado, así que el denominador correcto es
  // closerCalls (el universo de llamadas) — no `contacted` (que es el
  // funnel arriba, mucho más ancho y produce % engañosamente bajo).
  const conversionRate =
    k.closerCalls > 0 ? Math.round((k.closes / k.closerCalls) * 1000) / 10 : 0;

  const activeMetricLabel =
    cards.find((c) => c.key === openMetric)?.label ?? "";

  const [tab, setTab] = useState<"modelos" | "chatters">("modelos");

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Panel de control</h1>
          <p className="text-sm text-muted-foreground">
            Funnel operativo en tiempo real — desde el contacto LLG hasta ingresos al CRM.
          </p>
        </div>
        <DateRangePicker
          from={range.from}
          to={range.to}
          onApply={(from, to) => setRange({ from, to })}
          placeholder="Seleccionar fechas"
        />
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "modelos" | "chatters")}>
        <TabsList>
          <TabsTrigger value="modelos">Reclutamiento modelos</TabsTrigger>
          <TabsTrigger value="chatters">Reclutamiento chatters</TabsTrigger>
        </TabsList>

        <TabsContent value="chatters" className="mt-4">
          <Card className="p-12 text-center space-y-3">
            <div className="mx-auto h-16 w-16 rounded-full bg-muted flex items-center justify-center">
              <Building2 className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold">Reclutamiento de chatters</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Pantalla en construcción. Acá vamos a mostrar el funnel de
              reclutamiento de chatters — contactos, entrevistas, contrataciones.
            </p>
          </Card>
        </TabsContent>

        <TabsContent value="modelos" className="mt-4 space-y-5">
      {/* Hero metrics: Total leads + phone rate — destacadas + clickeables */}
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setOpenMetric("totalLeads")}
          className="group relative overflow-hidden rounded-xl border-2 border-indigo-500/30 bg-card p-5 text-left transition-all duration-200 hover:scale-[1.015] hover:border-indigo-500/60 hover:shadow-[0_0_24px_-4px_rgba(99,102,241,0.4)]"
        >
          <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full blur-3xl opacity-30 bg-indigo-500 transition-opacity group-hover:opacity-50" />
          <div className="relative">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
              Total leads generados
            </p>
            <div className="flex items-end gap-3 mt-2">
              <p className="text-4xl font-bold tabular-nums leading-none">
                {k.totalLeads.toLocaleString("es")}
              </p>
              <p className="text-xs text-muted-foreground pb-1">
                LLG ({k.contacted.toLocaleString("es")}) + Scouter (
                {(k.totalLeads - k.contacted).toLocaleString("es")})
              </p>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setOpenMetric("numbersObtained")}
          className="group relative overflow-hidden rounded-xl border-2 border-cyan-500/30 bg-card p-5 text-left transition-all duration-200 hover:scale-[1.015] hover:border-cyan-500/60 hover:shadow-[0_0_24px_-4px_rgba(34,211,238,0.4)]"
        >
          <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full blur-3xl opacity-30 bg-cyan-500 transition-opacity group-hover:opacity-50" />
          <div className="relative">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
              Tasa de números obtenidos por lead
            </p>
            <div className="flex items-end gap-3 mt-2">
              <p className="text-4xl font-bold tabular-nums leading-none">
                {phoneRate}
                <span className="text-xl text-muted-foreground">%</span>
              </p>
              <p className="text-xs text-muted-foreground pb-1">
                {k.numbersObtained.toLocaleString("es")} de{" "}
                {k.totalLeads.toLocaleString("es")} leads
              </p>
            </div>
          </div>
        </button>
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

        {/* Conversion rate — derived metric, no popup */}
        <Card className="p-4 border-2 border-fuchsia-500/30 relative overflow-hidden">
          <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full blur-3xl opacity-30 bg-fuchsia-500" />
          <div className="relative space-y-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-fuchsia-500">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                Tasa de cierre
              </p>
              <p className="text-3xl font-bold tabular-nums leading-tight">
                {conversionRate}
                <span className="text-lg text-muted-foreground">%</span>
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Cierres / Llamadas ({k.closes}/{k.closerCalls})
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Funnel visual flow — cross-team. "Contactadas" = LLG+Scouter. */}
      <Card className="p-4">
        <h2 className="text-sm font-semibold mb-3">Flujo del funnel</h2>
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <FunnelStep label="Contactadas" value={k.totalLeads} color="text-blue-400" />
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <FunnelStep label="Con número" value={k.numbersObtained} color="text-cyan-400" />
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <FunnelStep label="Llamadas" value={k.closerCalls} color="text-violet-400" />
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <FunnelStep label="Cierres" value={k.closes} color="text-emerald-400" />
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <FunnelStep label="Ingresos CRM" value={k.enteredCrm} color="text-indigo-400" />
        </div>
      </Card>

      {/* Bar chart — visualización del funnel en barras */}
      <Card className="p-4">
        <h2 className="text-sm font-semibold mb-3">Distribución por etapa</h2>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={funnelChartData}
              margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="stage"
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 6,
                  fontSize: 12,
                }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
              />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Detail dialog */}
      <DetailDialog
        open={!!openMetric}
        onOpenChange={(o) => !o && setOpenMetric(null)}
        metric={openMetric}
        metricLabel={activeMetricLabel}
        range={range}
      />
        </TabsContent>
      </Tabs>
    </div>
  );
};

const FunnelStep = ({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) => (
  <div className="rounded-md border border-border bg-card/40 px-3 py-1.5">
    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
      {label}
    </p>
    <p className={cn("font-bold tabular-nums text-base", color)}>
      {value.toLocaleString("es")}
    </p>
  </div>
);

export default PanelDeControl;
// rebuild cache buster 1778199315
