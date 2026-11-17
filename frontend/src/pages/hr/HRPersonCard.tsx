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
import { useFormato } from "@/hooks/useFormato";
import type { Formato } from "@/lib/formato";
import { useHrPersonCard, HR_ROLE_LABEL } from "./useHrPeople";
import { periodLabel } from "@/pages/agency-qa/chatters-qa/useChatterScorecards";
import { PageHeader } from "@/components/ui/page-header";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { periodoDelMes, TURNO_ASISTENCIA } from "./etiquetasRrhh";
import { idiomaFuente } from "@/lib/idiomas";

// Roles de useHrPeople cuya etiqueta es una palabra en español.
const ROL_EN_ESPANOL: Record<string, TranslationKey> = {
  employee: "hr.opt.role.employee",
  coordinator_beta: "hr.opt.role.coordinator",
};

const usd = (n: number | null | undefined, f: Formato) =>
  n == null ? "—" : `$${Math.round(n).toLocaleString(f.intl("es-CO"))}`;
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
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("text-xl font-bold leading-tight", toneCls)}>{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Section({ icon: Icon, title, period, children }: { icon: any; title: string; period?: string; children: React.ReactNode }) {
  const { language } = useLanguage();
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title}
          {period && <span className="text-xs font-normal text-muted-foreground">· {periodoDelMes(period, idiomaFuente(language), periodLabel)}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default function HRPersonCard() {
  const { t } = useLanguage();
  const f = useFormato();
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
          <ArrowLeft className="h-4 w-4" /> {t("hr.card.backToStaff")}
        </Button>
        <Card><CardContent className="p-6 text-sm text-muted-foreground">{t("hr.card.loadError")}</CardContent></Card>
      </div>
    );
  }

  const { identity, attendance, effort, chatter, scorecard, closer, llg } = card;
  const etiquetaTurno = (turno: string | null) =>
    turno && TURNO_ASISTENCIA[turno] ? t(TURNO_ASISTENCIA[turno]) : (turno ?? "—");

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-white/10 bg-background/30 px-6 pt-4 pb-4 backdrop-blur-xl">
        <Button variant="ghost" size="sm" className="mb-2 w-fit gap-1.5 text-muted-foreground hover:text-foreground" onClick={() => navigate("/hr/personal")}>
          <ArrowLeft className="h-4 w-4" /> {t("hr.card.staff")}
        </Button>
        <PageHeader
          icon={
            <span className="text-sm font-semibold">
              {identity.name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")}
            </span>
          }
          title={identity.name}
          subtitle={
            <div className="flex items-center gap-2">
              <Badge variant="secondary-soft" className="text-[11px]">{ROL_EN_ESPANOL[identity.role] ? t(ROL_EN_ESPANOL[identity.role]) : (HR_ROLE_LABEL[identity.role] ?? identity.role)}</Badge>
              {identity.in_hubstaff ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-success"><Activity className="h-3 w-3" /> {t("hr.card.tracked")}</span>
              ) : (
                <span className="text-[11px] text-muted-foreground">{t("hr.card.notTracked")}</span>
              )}
            </div>
          }
        />
      </header>

      <div className="flex-1 space-y-4 overflow-auto p-6">
        {!effort && !attendance && !chatter && !closer && !llg && (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">
            {t("hr.card.noData")}
          </CardContent></Card>
        )}

        {/* Esfuerzo (horas/actividad) */}
        {effort && (
          <Section icon={Clock} title={t("hr.card.effort")} period={effort.period}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label={t("hr.card.trackedHours")} value={`${effort.total_hours}h`} />
              <Stat label={t("hr.card.avgActivity")} value={pct(effort.avg_activity_pct)} tone={effort.avg_activity_pct >= 50 ? "ok" : effort.avg_activity_pct >= 30 ? "warn" : "bad"} />
              <Stat label={t("common.days")} value={String(effort.dias)} />
            </div>
          </Section>
        )}

        {/* Asistencia / puntualidad */}
        {attendance && (
          <Section icon={CalendarClock} title={t("hr.card.attendance")} period={attendance.period}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label={t("hr.card.shift")} value={etiquetaTurno(attendance.turno)} hint={attendance.horario_cargado ? t("hr.card.ownSchedule") : t("hr.card.inferred")} />
              <Stat label={t("hr.card.avgCheckin")} value={hhmm(attendance.checkin_prom_min)} />
              <Stat label={t("hr.card.onTime")} value={pct(attendance.pct_a_tiempo)} tone={attendance.pct_a_tiempo >= 90 ? "ok" : attendance.pct_a_tiempo >= 80 ? "warn" : "bad"} />
              <Stat label={t("hr.card.lateArrivals")} value={String(attendance.tardanzas)} tone={attendance.tardanzas ? "warn" : "ok"} hint={attendance.min_tarde_prom != null ? t("hr.card.avgLate", { min: attendance.min_tarde_prom }) : undefined} />
            </div>
          </Section>
        )}

        {/* Chatter: costo / ROI / ventas */}
        {chatter && (
          <Section icon={DollarSign} title={t("hr.card.costRoi")} period={chatter.period}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label={t("hr.card.salesBlu")} value={usd(chatter.sales, f)} hint={chatter.sin_venta_blu ? t("hr.card.noBluSales") : undefined} />
              <Stat label={t("hr.card.agencyRevenue")} value={usd(chatter.agency_revenue_usd, f)} />
              <Stat label={t("hr.card.cost")} value={usd(chatter.cost_usd, f)} />
              <Stat label={t("hr.card.margin")} value={usd(chatter.margin_usd, f)} tone={(chatter.margin_usd ?? 0) >= 0 ? "ok" : "bad"} />
              <Stat label="ROI" value={chatter.roi_x != null ? `${chatter.roi_x}x` : "—"} tone={(chatter.roi_x ?? 0) >= 1 ? "ok" : "bad"} />
              <Stat label={t("common.status")} value={chatter.no_rentable ? t("hr.card.notProfitable") : t("hr.card.profitable")} tone={chatter.no_rentable ? "bad" : "ok"} />
            </div>
          </Section>
        )}

        {/* Chatter: scorecard */}
        {scorecard && (
          <Section icon={MessageSquare} title={t("hr.card.scorecard")}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label={t("hr.card.totalSales")} value={usd(scorecard.total_sales, f)} />
              <Stat label={t("hr.card.conversion")} value={pct(scorecard.fan_conversion_rate)} />
              <Stat label="Unlock rate" value={pct(scorecard.unlock_rate)} />
              <Stat label={t("hr.card.avgResponse")} value={scorecard.avg_response_seconds != null ? `${Math.round(scorecard.avg_response_seconds)}s` : "—"} />
              <Stat label={t("hr.card.schedVsActual")} value={`${scorecard.scheduled_hours ?? "—"}/${scorecard.clocked_hours ?? "—"}`} />
              <Stat label={t("hr.card.models")} value={scorecard.creators_count != null ? String(scorecard.creators_count) : "—"} />
            </div>
          </Section>
        )}

        {/* Closer */}
        {closer && (
          <Section icon={Headphones} title={t("hr.card.closing")} period={closer.period}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label={t("common.hours")} value={`${closer.total_hours}h`} />
              <Stat label={t("hr.card.activity")} value={pct(closer.avg_activity_pct)} />
              <Stat label="Leads" value={String(closer.leads)} />
              <Stat label={t("hr.card.closed")} value={String(closer.cerradas)} tone={closer.sin_cierres ? "bad" : "ok"} />
              <Stat label={t("hr.card.monetization")} value={usd(closer.monetizacion_usd, f)} />
              <Stat label={t("hr.card.avgQa")} value={closer.avg_qa_score != null ? `${closer.avg_qa_score}` : "—"} hint={`${closer.qa_calls} QAs`} />
            </div>
          </Section>
        )}

        {/* LLG */}
        {llg && (
          <Section icon={Megaphone} title="Lead generation" period={llg.period}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label={t("common.hours")} value={`${llg.total_hours}h`} />
              <Stat label={t("hr.card.activity")} value={pct(llg.avg_activity_pct)} />
              <Stat label="Leads" value={String(llg.leads)} />
              <Stat label={t("hr.card.leadsPerHour")} value={llg.leads_por_hora != null ? `${llg.leads_por_hora}` : "—"} />
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
