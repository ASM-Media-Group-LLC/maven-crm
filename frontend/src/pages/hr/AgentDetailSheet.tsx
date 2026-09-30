import { useState, useMemo } from "react";
import { EmptyState } from "@/components/EmptyState";
import {
  Clock, Mouse, Keyboard, TrendingUp, Monitor, Play, Pause, Coffee,
  LogOut, Zap, AlertTriangle, ArrowLeft, Loader2, ImageOff,
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/UserAvatar";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useHubstaffAgentDetail } from "@/hooks/useHubstaffAgentDetail";
import type { HubstaffAgent } from "@/hooks/useHubstaffData";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";

interface AgentDetailViewProps {
  agent: HubstaffAgent;
  onBack: () => void;
}

const TIMELINE_CONFIG: Record<string, { icon: typeof Play; color: string }> = {
  start: { icon: Play, color: "text-success" },
  high: { icon: Zap, color: "text-success" },
  medium: { icon: TrendingUp, color: "text-warning" },
  low: { icon: AlertTriangle, color: "text-destructive" },
  break: { icon: Coffee, color: "text-blue-500" },
  end: { icon: LogOut, color: "text-muted-foreground" },
};

// `agent.status` viene así de Hubstaff (valor, no texto): se traduce solo la etiqueta.
const STATUS_LABELS: Record<string, { label: TranslationKey; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  activo: { label: "common.active", variant: "default" },
  inactivo: { label: "common.inactive", variant: "secondary" },
  desconectado: { label: "hrg.agent.offline", variant: "outline" },
  en_pausa: { label: "hrg.agent.paused", variant: "secondary" },
};

function MiniKPI({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Clock }) {
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground truncate">{label}</p>
          <p className="text-sm font-bold text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AgentDetailView({ agent, onBack }: AgentDetailViewProps) {
  const { t } = useLanguage();
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);

  const { chartData, screenshots, timeline, kpis, isLoading, isEmpty } = useHubstaffAgentDetail(agent.memberId, period);

  const statusCfg = STATUS_LABELS[agent.status] ?? STATUS_LABELS.desconectado;

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="shrink-0 border-b border-border bg-background px-6 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onBack} aria-label={t("common.back")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <UserAvatar name={agent.name} size="md" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-semibold text-foreground truncate">{agent.name}</h3>
                <Badge variant={statusCfg.variant} className="text-xs">{t(statusCfg.label)}</Badge>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : isEmpty ? (
            <div className="space-y-6">
              <Tabs value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
                <TabsList>
                  <TabsTrigger value="daily">{t("hrg.agent.daily")}</TabsTrigger>
                  <TabsTrigger value="weekly">{t("hrg.ann.recurrence.weekly")}</TabsTrigger>
                  <TabsTrigger value="monthly">{t("hrg.ann.recurrence.monthly")}</TabsTrigger>
                </TabsList>
              </Tabs>
              <EmptyState icon={<Monitor className="h-8 w-8 text-muted-foreground" />} title={t("hrg.agent.noActivity")} description={t("hrg.agent.noActivityHint")} />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Period Tabs */}
              <Tabs value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
                <TabsList>
                  <TabsTrigger value="daily">{t("hrg.agent.daily")}</TabsTrigger>
                  <TabsTrigger value="weekly">{t("hrg.ann.recurrence.weekly")}</TabsTrigger>
                  <TabsTrigger value="monthly">{t("hrg.ann.recurrence.monthly")}</TabsTrigger>
                </TabsList>

                {/* KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                  <MiniKPI label={t("hrg.agent.totalHours")} value={kpis.hours} icon={Clock} />
                  <MiniKPI label={t("hrg.agent.productivity")} value={kpis.productivity} icon={TrendingUp} />
                  <MiniKPI label={t("hrg.agent.mouseActivity")} value={kpis.mouse} icon={Mouse} />
                  <MiniKPI label={t("hrg.agent.keyboardActivity")} value={kpis.keyboard} icon={Keyboard} />
                </div>

                {/* Chart */}
                <TabsContent value={period} className="mt-4">
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs font-medium text-muted-foreground mb-3">
                        {t(period === "daily" ? "hrg.agent.perfByHour" : period === "weekly" ? "hrg.agent.perfByDay" : "hrg.agent.perfByMonthDay")}
                      </p>
                      {chartData.length > 0 ? (
                        <>
                          <ResponsiveContainer width="100%" height={250}>
                            <AreaChart data={chartData}>
                              <defs>
                                <linearGradient id="fillMouse" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="fillKeyboard" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" domain={[0, 100]} unit="%" />
                              <Tooltip
                                contentStyle={{
                                  background: "hsl(var(--background))",
                                  border: "1px solid hsl(var(--border))",
                                  borderRadius: 8,
                                  fontSize: 12,
                                }}
                              />
                              <Area type="monotone" dataKey="mouse" name="Mouse" stroke="hsl(var(--primary))" fill="url(#fillMouse)" strokeWidth={2} />
                              <Area type="monotone" dataKey="keyboard" name={t("hrg.agent.keyboard")} stroke="#6366f1" fill="url(#fillKeyboard)" strokeWidth={2} />
                            </AreaChart>
                          </ResponsiveContainer>
                          <div className="flex items-center justify-center gap-4 mt-2">
                            <div className="flex items-center gap-1.5">
                              <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                              <span className="text-xs text-muted-foreground">Mouse</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#6366f1" }} />
                              <span className="text-xs text-muted-foreground">{t("hrg.agent.keyboard")}</span>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">
                          {t("hrg.agent.noDataPeriod")}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>

              {/* Screenshots */}
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-3">{t("hrg.agent.screenshots")}</h4>
                {screenshots.length > 0 ? (
                  <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2">
                    {screenshots.map((ss) => (
                      <button
                        key={ss.id}
                        onClick={() => setScreenshotPreview(ss.url ?? ss.timestamp)}
                        className="group relative aspect-video rounded-lg border border-border bg-muted/50 flex flex-col items-center justify-center gap-1 hover:border-primary/50 hover:bg-muted transition-colors cursor-pointer overflow-hidden"
                      >
                        {ss.url ? (
                          <img src={ss.url} alt={t("hrg.agent.screenshotAlt", { time: ss.timestamp })} className="absolute inset-0 w-full h-full object-cover" />
                        ) : (
                          <Monitor className="h-5 w-5 text-muted-foreground/50 group-hover:text-primary/60" />
                        )}
                        <span className="relative text-[10px] text-muted-foreground bg-background/80 px-1 rounded">{ss.timestamp}</span>
                        <div className="absolute bottom-1 right-1">
                          <span className={`text-[9px] font-medium ${ss.activity > 60 ? "text-success" : ss.activity > 30 ? "text-warning" : "text-destructive"}`}>
                            {ss.activity}%
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-6 text-muted-foreground">
                    <ImageOff className="h-5 w-5 shrink-0" />
                    <p className="text-sm">{t("hrg.agent.noScreenshots")}</p>
                  </div>
                )}
              </div>

              {/* Timeline */}
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-3">{t("hrg.agent.timeline")}</h4>
                {timeline.length > 0 ? (
                  <div className="space-y-0">
                    {timeline.map((event, i) => {
                      const cfg = TIMELINE_CONFIG[event.type] ?? TIMELINE_CONFIG.end;
                      const EventIcon = cfg.icon;
                      return (
                        <div key={i} className="flex items-start gap-3 relative">
                          {i < timeline.length - 1 && (
                            <div className="absolute left-[11px] top-6 bottom-0 w-px bg-border" />
                          )}
                          <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-background ${cfg.color}`}>
                            <EventIcon className="h-3 w-3" />
                          </div>
                          <div className="pb-4 min-w-0">
                            <p className="text-xs font-medium text-foreground">{event.label}</p>
                            <p className="text-[11px] text-muted-foreground">{event.time}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-6 text-muted-foreground">
                    <Clock className="h-5 w-5 shrink-0" />
                    <p className="text-sm">{t("hrg.agent.noTimeline")}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Screenshot Preview Dialog */}
      <Dialog open={!!screenshotPreview} onOpenChange={() => setScreenshotPreview(null)}>
        <DialogContent className="sm:max-w-2xl">
          <div className="aspect-video rounded-lg bg-muted/50 border border-border flex flex-col items-center justify-center gap-3 overflow-hidden">
            {screenshotPreview?.startsWith("http") ? (
              <img src={screenshotPreview} alt={t("hrg.agent.screenshot")} className="w-full h-full object-contain" />
            ) : (
              <>
                <Monitor className="h-12 w-12 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">{t("hrg.agent.screenshotAt", { time: screenshotPreview ?? "" })}</p>
                <p className="text-xs text-muted-foreground italic">{t("hrg.agent.realScreenshot")}</p>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
