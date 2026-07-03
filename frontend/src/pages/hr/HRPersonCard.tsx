import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Activity, Clock, CalendarClock, DollarSign, TrendingUp, Headphones,
  Megaphone, CheckCircle2, AlertTriangle, MessageSquare, Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useHrPersonCard, HR_ROLE_LABEL } from "./useHrPeople";
import { periodLabel } from "@/pages/agency-qa/chatters-qa/useChatterScorecards";

const usd = (n: number | null | undefined) =>
  n == null ? "—" : `$${Math.round(n).toLocaleString("es-CO")}`;
const pct = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n)}%`);
const hhmm = (min: number | null | undefined) => {
  if (min == null) return "—";
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

function Stat({ label, value, tone, hint }: { label: string; value: string; tone?: "ok" | "warn" | "bad"; hint?: string }) {
  const toneCls = tone === "ok" ? "text-success" : tone === "warn" ? "text-warning" : tone === "bad" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card/40 p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("text-xl font-bold leading-tight", toneCls)}>{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Section({ icon: Icon, title, period, children }: { icon: any; title: string; period?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title}
          {period && <span className="text-xs font-normal text-muted-foreground">· {periodLabel(period)}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default function HRPersonCard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: card, isLoading, error } = useHrPersonCard(id ?? null);

  if (isLoading) {
    return (
      <div className="flex h-full flex-col gap-4 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>
      </div>
    );
  }

  if (error || !card) {
    return (
      <div className="flex h-full flex-col gap-3 p-6">
        <Button variant="ghost" size="sm" className="w-fit gap-1.5 text-muted-foreground" onClick={() => navigate("/hr/personal")}>
          <ArrowLeft className="h-4 w-4" /> Volver al personal
        </Button>
        <Card><CardContent className="p-6 text-sm text-muted-foreground">No se pudo cargar la ficha de esta persona.</CardContent></Card>
      </div>
    );
  }

  const { identity, attendance, effort, chatter, scorecard, closer, llg } = card;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-white/10 bg-background/30 px-6 pt-4 pb-4 backdrop-blur-xl">
        <Button variant="ghost" size="sm" className="mb-2 w-fit gap-1.5 text-muted-foreground hover:text-foreground" onClick={() => navigate("/hr/personal")}>
          <ArrowLeft className="h-4 w-4" /> Personal
        </Button>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {identity.name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")}
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">{identity.name}</h1>
            <div className="flex items-center gap-2">
              <Badge variant="secondary-soft" className="text-[11px]">{HR_ROLE_LABEL[identity.role] ?? identity.role}</Badge>
              {identity.in_hubstaff ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-success"><Activity className="h-3 w-3" /> Trackeado en Hubstaff</span>
              ) : (
                <span className="text-[11px] text-muted-foreground">Sin tracking de Hubstaff</span>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-auto p-6">
        {!effort && !attendance && !chatter && !closer && !llg && (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">
            Sin datos de Hubstaff/BLU para esta persona todavía. Si debería estar trackeada, verificá el mapeo en Hubstaff.
          </CardContent></Card>
        )}

        {/* Esfuerzo (horas/actividad) */}
        {effort && (
          <Section icon={Clock} title="Esfuerzo (Hubstaff)" period={effort.period}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label="Horas trackeadas" value={`${effort.total_hours}h`} />
              <Stat label="Actividad prom." value={pct(effort.avg_activity_pct)} tone={effort.avg_activity_pct >= 50 ? "ok" : effort.avg_activity_pct >= 30 ? "warn" : "bad"} />
              <Stat label="Días" value={String(effort.dias)} />
            </div>
          </Section>
        )}

        {/* Asistencia / puntualidad */}
        {attendance && (
          <Section icon={CalendarClock} title="Asistencia y puntualidad" period={attendance.period}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Turno" value={attendance.turno ?? "—"} hint={attendance.horario_cargado ? "horario propio" : "deducido"} />
              <Stat label="Check-in prom." value={hhmm(attendance.checkin_prom_min)} />
              <Stat label="A tiempo" value={pct(attendance.pct_a_tiempo)} tone={attendance.pct_a_tiempo >= 90 ? "ok" : attendance.pct_a_tiempo >= 80 ? "warn" : "bad"} />
              <Stat label="Tardanzas" value={String(attendance.tardanzas)} tone={attendance.tardanzas ? "warn" : "ok"} hint={attendance.min_tarde_prom != null ? `+${attendance.min_tarde_prom}m prom.` : undefined} />
            </div>
          </Section>
        )}

        {/* Chatter: costo / ROI / ventas */}
        {chatter && (
          <Section icon={DollarSign} title="Costo, ingreso y ROI" period={chatter.period}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="Ventas (BLU)" value={usd(chatter.sales)} hint={chatter.sin_venta_blu ? "sin venta BLU" : undefined} />
              <Stat label="Ingreso agencia" value={usd(chatter.agency_revenue_usd)} />
              <Stat label="Costo" value={usd(chatter.cost_usd)} />
              <Stat label="Margen" value={usd(chatter.margin_usd)} tone={(chatter.margin_usd ?? 0) >= 0 ? "ok" : "bad"} />
              <Stat label="ROI" value={chatter.roi_x != null ? `${chatter.roi_x}x` : "—"} tone={(chatter.roi_x ?? 0) >= 1 ? "ok" : "bad"} />
              <Stat label="Estado" value={chatter.no_rentable ? "No rentable" : "Rentable"} tone={chatter.no_rentable ? "bad" : "ok"} />
            </div>
          </Section>
        )}

        {/* Chatter: scorecard */}
        {scorecard && (
          <Section icon={MessageSquare} title="Scorecard (Mensajes Pro)">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="Ventas totales" value={usd(scorecard.total_sales)} />
              <Stat label="Conversión" value={pct(scorecard.fan_conversion_rate)} />
              <Stat label="Unlock rate" value={pct(scorecard.unlock_rate)} />
              <Stat label="Resp. prom." value={scorecard.avg_response_seconds != null ? `${Math.round(scorecard.avg_response_seconds)}s` : "—"} />
              <Stat label="Hrs prog/real" value={`${scorecard.scheduled_hours ?? "—"}/${scorecard.clocked_hours ?? "—"}`} />
              <Stat label="Modelos" value={scorecard.creators_count != null ? String(scorecard.creators_count) : "—"} />
            </div>
          </Section>
        )}

        {/* Closer */}
        {closer && (
          <Section icon={Headphones} title="Cierre y monetización" period={closer.period}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="Horas" value={`${closer.total_hours}h`} />
              <Stat label="Actividad" value={pct(closer.avg_activity_pct)} />
              <Stat label="Leads" value={String(closer.leads)} />
              <Stat label="Cerradas" value={String(closer.cerradas)} tone={closer.sin_cierres ? "bad" : "ok"} />
              <Stat label="Monetización" value={usd(closer.monetizacion_usd)} />
              <Stat label="QA prom." value={closer.avg_qa_score != null ? `${closer.avg_qa_score}` : "—"} hint={`${closer.qa_calls} QAs`} />
            </div>
          </Section>
        )}

        {/* LLG */}
        {llg && (
          <Section icon={Megaphone} title="Lead generation" period={llg.period}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Horas" value={`${llg.total_hours}h`} />
              <Stat label="Actividad" value={pct(llg.avg_activity_pct)} />
              <Stat label="Leads" value={String(llg.leads)} />
              <Stat label="Leads/hora" value={llg.leads_por_hora != null ? `${llg.leads_por_hora}` : "—"} />
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
