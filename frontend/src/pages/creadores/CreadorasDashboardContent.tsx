import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, UserCheck, Clock, PauseCircle, LogOut, XCircle, TrendingUp, Globe, Tag, DollarSign, AlertTriangle, ArrowRight, Instagram, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UserAvatar } from "@/components/UserAvatar";
import { useCreadores, type CreatorWithBusiness } from "./useCreadores";
import { ListRowButton } from "@/components/ui/list-row";
import CategorySectionHeader from "@/components/dashboard/CategorySectionHeader";
import { CATEGORY_ORDER } from "@/hooks/useOperationsDashboard";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { useFormato } from "@/hooks/useFormato";
import CreadoresHeader from "./CreadoresHeader";
import { etiquetaEstado } from "./etiquetasCreadora";
import type { TranslationKey } from "@/lib/i18n";
import { useLanguage } from "@/hooks/useLanguage";

const emptyFilters = { search: "", agency: "", status: "", category: "", country: "", city: "", manager: "" };

// Estilo Panel de Control / Dashboard v2 — gradient corner blur + icono
// con cuadrado coloreado + hover lift. La key se usa para navegar al
// listado filtrado o al onboarding.
const statusConfig: Array<{ key: string; label: TranslationKey; icon: typeof UserCheck; bg: string }> = [
  { key: "active",     label: "creadores.kpi.active",     icon: UserCheck,   bg: "bg-success" },
  { key: "onboarding", label: "creadores.kpi.onboarding", icon: Clock,       bg: "bg-blue-500" },
  { key: "paused",     label: "creadores.kpi.paused",     icon: PauseCircle, bg: "bg-warning" },
  { key: "leaving",    label: "creadores.dash.inRetirement", icon: LogOut,   bg: "bg-destructive" },
  { key: "terminated", label: "creadores.kpi.terminated", icon: XCircle,     bg: "bg-slate-500" },
];

// Llaves internas de los grupos "sin dato": solo se traducen al mostrarse.
const SIN_CATEGORIA = "__sin_categoria__";
const SIN_AGENCIA = "__sin_agencia__";
const DESCONOCIDO = "__desconocido__";

// creator_offboardings.categoria (DATO) → su etiqueta.
const CATEGORIA_SALIDA: Record<string, TranslationKey> = {
  voluntaria: "cr.offCatVoluntary",
  involuntaria: "cr.offCatInvoluntary",
  mutuo_acuerdo: "cr.offCatMutual",
  incumplimiento: "cr.offCatBreach",
  otro: "cr.offCatOther",
};

const CreadorasDashboardContent = () => {
  const f = useFormato();
  const { t } = useLanguage();
  // El nombre que se muestra de un grupo (las llaves "sin dato" se traducen).
  const grupo = (k: string) =>
    k === SIN_CATEGORIA ? t("creadores.dash.noCategory")
    : k === SIN_AGENCIA ? t("creadores.dash.noAgency")
    : k === DESCONOCIDO ? t("creadores.dash.unknown")
    : k;
  const navigate = useNavigate();
  const { allCreators, isLoading } = useCreadores(emptyFilters);
  type StatusKey = "active" | "onboarding" | "paused" | "leaving" | "terminated";
  const [statusPopup, setStatusPopup] = useState<StatusKey | null>(null);
  // Estado del collapse por categoría — default: top expandida, resto
  // colapsadas (mismo patrón que panel de control y dashboard v2).
  const [popupCollapsed, setPopupCollapsed] = useState<Set<string>>(new Set());
  // Ficha técnica de la creadora — abierta desde Últimas Incorporaciones
  // y al clickar dentro del popup de status. Muestra foto + IG + perfil.
  const [creatorDetail, setCreatorDetail] = useState<CreatorWithBusiness | null>(null);

  // Offboarding metrics
  const offboardingQuery = useQuery({
    queryKey: ["offboarding_dashboard_metrics"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creator_offboardings")
        .select("id, status, categoria, estimated_lost_revenue");
      if (error) throw error;
      return data ?? [];
    },
  });

  const offboardingMetrics = useMemo(() => {
    const items = offboardingQuery.data ?? [];
    const finalized = items.filter((i) => i.status === "finalizado");
    const totalLostRevenue = items.reduce((sum, i) => sum + (i.estimated_lost_revenue ?? 0), 0);
    const byCategoria: Record<string, number> = {};
    for (const i of items) {
      const cat = i.categoria ?? SIN_CATEGORIA;
      byCategoria[cat] = (byCategoria[cat] ?? 0) + 1;
    }
    return {
      totalFinalized: finalized.length,
      totalInProgress: items.length - finalized.length,
      totalLostRevenue,
      byCategoria: Object.entries(byCategoria).sort((a, b) => b[1] - a[1]),
    };
  }, [offboardingQuery.data]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { active: 0, onboarding: 0, paused: 0, leaving: 0, terminated: 0 };
    for (const c of allCreators) {
      const s = c.status ?? "";
      if (s === "pendiente" || s === "pendiente_verificacion") counts["onboarding"]++;
      else if (s in counts) counts[s]++;
    }
    return counts;
  }, [allCreators]);

  const pendingCount = useMemo(() => {
    return allCreators.filter(c => c.status === "pendiente" || c.status === "pendiente_verificacion").length;
  }, [allCreators]);

  const total = allCreators.length;

  // Filtramos las creadoras del popup según el status seleccionado.
  // "onboarding" agrupa también pendiente y pendiente_verificacion.
  const popupCreators = useMemo(() => {
    if (!statusPopup) return [];
    return allCreators.filter((c) => {
      const s = c.status ?? "";
      if (statusPopup === "onboarding") return s === "onboarding" || s === "pendiente" || s === "pendiente_verificacion";
      return s === statusPopup;
    });
  }, [statusPopup, allCreators]);

  // Distribution by agency
  const byAgency = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of allCreators) {
      const a = c.creator_business?.company?.name ?? c.creator_business?.assigned_agency ?? SIN_AGENCIA;
      map[a] = (map[a] ?? 0) + 1;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [allCreators]);

  // Distribution by country (top 5)
  const byCountry = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of allCreators) {
      const country = c.country ?? DESCONOCIDO;
      map[country] = (map[country] ?? 0) + 1;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [allCreators]);

  // Distribution by category
  const byCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of allCreators) {
      const cat = c.category ?? SIN_CATEGORIA;
      map[cat] = (map[cat] ?? 0) + 1;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [allCreators]);

  // Latest registrations (5)
  const latestCreators = useMemo(() =>
    [...allCreators]
      .filter((c) => c.created_at)
      .sort((a, b) => new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime())
      .slice(0, 5),
    [allCreators]
  );

  // Onboarding in progress

  const statusBadgeClass: Record<string, string> = {
    active: "bg-success/15 text-success border-success/30",
    onboarding: "bg-primary/15 text-primary border-primary/30",
    paused: "bg-warning/15 text-warning border-warning/30",
    leaving: "bg-destructive/15 text-destructive border-destructive/30",
    terminated: "bg-muted text-muted-foreground border-border",
  };

  if (isLoading) {
    return (
      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      <CreadoresHeader />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Section 1 — Status KPIs estilo Panel de Control / Dashboard v2 */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {statusConfig.map(({ key, label, icon: Icon, bg }) => {
            const count = statusCounts[key] ?? 0;
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            const isOnboarding = key === "onboarding";
            return (
              <button
                key={key}
                type="button"
                onClick={() => setStatusPopup(key as StatusKey)}
                className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 text-left transition-all duration-200 ease-out hover:border-primary/40 hover:shadow-[0_0_24px_-4px_rgba(255,255,255,0.15)] active:scale-[0.99]"
              >
                {isOnboarding && pendingCount > 0 && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 z-10">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive/60" />
                          <span className="relative inline-flex rounded-full h-4 w-4 bg-destructive" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>{t("creadores.dash.toVerify", { n: pendingCount })}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                <div className="relative space-y-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${bg}`}>
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-foreground/80 font-semibold">{t(label)}</p>
                    <p className="text-3xl font-bold tabular-nums leading-tight">{count}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{t("cr.pctOfTotal", { p: pct })}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Section 2 — Distribution */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* By Agency */}
          <Card className="transition-all duration-200 hover:shadow-md hover:border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                {t("creadores.dash.byAgency")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {byAgency.length === 0 && <p className="text-xs text-muted-foreground">{t("common.noData")}</p>}
              {byAgency.map(([agency, count]) => {
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                  <div key={agency} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="truncate text-foreground font-medium">{grupo(agency)}</span>
                      <span className="text-muted-foreground shrink-0 ml-2">{count} · {pct}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* By Country */}
          <Card className="transition-all duration-200 hover:shadow-md hover:border-success/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Globe className="h-4 w-4 text-success" />
                {t("creadores.dash.top5Countries")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {byCountry.length === 0 && <p className="text-xs text-muted-foreground">{t("common.noData")}</p>}
              {byCountry.map(([country, count], idx) => {
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                  <div key={country} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <span className="text-muted-foreground font-mono w-4 shrink-0">#{idx + 1}</span>
                        <span className="truncate font-medium text-foreground">{grupo(country)}</span>
                      </span>
                      <span className="text-muted-foreground shrink-0 ml-2">{count} · {pct}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-success transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* By Category */}
          <Card className="transition-all duration-200 hover:shadow-md hover:border-warning/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Tag className="h-4 w-4 text-warning" />
                {t("creadores.dash.byCategory")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {byCategory.length === 0 && <p className="text-xs text-muted-foreground">{t("common.noData")}</p>}
              {byCategory.map(([cat, count]) => {
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                  <div key={cat} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="truncate font-medium text-foreground">{grupo(cat)}</span>
                      <span className="text-muted-foreground shrink-0 ml-2">{count} · {pct}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-warning transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* Section 3 — Recent Activity */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
            <Users className="h-4 w-4 text-primary" />
            {t("creadores.dash.latest")}
          </h3>
          {latestCreators.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              {t("common.noData")}
            </div>
          ) : (
            <div className="space-y-2">
              {latestCreators.map((c) => {
                const handle = (c.instagram_handle || "").replace(/^@/, "");
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCreatorDetail(c)}
                    className="group w-full rounded-xl border border-white/10 bg-white/5 p-3 text-left transition-colors hover:bg-white/10 hover:border-primary/40"
                  >
                    <div className="flex items-center gap-3">
                      <UserAvatar
                        name={c.artistic_name || c.name}
                        src={c.profile_photo_url}
                        size="md"
                        className="h-10 w-10 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{c.artistic_name ?? c.name}</p>
                        {handle && (
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
                            <Instagram className="h-3 w-3 shrink-0" />
                            @{handle}
                          </p>
                        )}
                      </div>
                      <div className="hidden sm:flex items-center gap-4 text-right shrink-0">
                        <div>
                          <p className="text-xs text-muted-foreground">{t("creadores.table.colAgency")}</p>
                          <p className="text-xs font-medium truncate max-w-[120px]">{c.creator_business?.company?.name ?? c.creator_business?.assigned_agency ?? "—"}</p>
                        </div>
                        <Badge variant="outline" className={`text-[10px] ${statusBadgeClass[c.status ?? ""] ?? ""}`}>
                          {etiquetaEstado(t, c.status)}
                        </Badge>
                        <div>
                          <p className="text-xs text-muted-foreground">{t("creadores.dash.registered")}</p>
                          <p className="text-xs font-medium whitespace-nowrap">
                            {c.created_at ? format(new Date(c.created_at), "dd MMM", { locale: f.fechas }) : "—"}
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Section 4 — Offboarding Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-t-[3px] border-t-destructive cursor-pointer transition-all duration-200 hover:shadow-lg hover:bg-gradient-to-br hover:from-destructive/10 hover:to-transparent">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{t("creadores.dash.lostModels")}</p>
                  <p className="text-3xl font-bold mt-1 text-destructive">{offboardingMetrics.totalFinalized}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("creadores.dash.inProcess", { n: offboardingMetrics.totalInProgress })}</p>
                </div>
                <div className="p-2 rounded-lg bg-destructive/10 shrink-0">
                  <LogOut className="h-5 w-5 text-destructive" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-t-[3px] border-t-warning cursor-pointer transition-all duration-200 hover:shadow-lg hover:bg-gradient-to-br hover:from-warning/10 hover:to-transparent">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{t("creadores.dash.lostRevenue")}</p>
                  <p className="text-3xl font-bold mt-1 text-warning">
                    ${offboardingMetrics.totalLostRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("creadores.dash.est12m")}</p>
                </div>
                <div className="p-2 rounded-lg bg-warning/10 shrink-0">
                  <DollarSign className="h-5 w-5 text-warning" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="transition-all duration-200 hover:shadow-md hover:border-destructive/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                {t("creadores.dash.exitReasons")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {offboardingMetrics.byCategoria.length === 0 && (
                <p className="text-xs text-muted-foreground">{t("common.noData")}</p>
              )}
              {offboardingMetrics.byCategoria.map(([cat, count]) => (
                <div key={cat} className="flex items-center justify-between text-xs">
                  <span className="capitalize font-medium text-foreground">{CATEGORIA_SALIDA[cat] ? t(CATEGORIA_SALIDA[cat]) : grupo(cat).replace("_", " ")}</span>
                  <Badge variant="outline" className="text-[10px]">{count}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* CREATOR DETAIL — ficha técnica con foto + IG + ver perfil */}
      <Dialog open={creatorDetail !== null} onOpenChange={(o) => !o && setCreatorDetail(null)}>
        <DialogContent className="max-w-xl">
          {creatorDetail && (() => {
            const c = creatorDetail;
            const handle = (c.instagram_handle || "").replace(/^@/, "");
            const igUrl = handle ? `https://instagram.com/${handle}` : null;
            const stats: { label: string; value: string }[] = [
              { label: t("common.status"), value: etiquetaEstado(t, c.status) },
              { label: t("creadores.table.colAgency"), value: c.creator_business?.company?.name ?? c.creator_business?.assigned_agency ?? "—" },
              { label: t("common.country"), value: c.country ?? "—" },
              { label: t("common.category"), value: c.category ?? "—" },
              { label: t("creadores.dash.registered"), value: c.created_at ? format(new Date(c.created_at), "dd MMM yyyy", { locale: f.fechas }) : "—" },
              { label: t("creadores.list.managersPh"), value: c.creator_business?.manager_type ?? "—" },
            ];
            return (
              <>
                <DialogHeader>
                  <div className="flex items-start gap-4">
                    <UserAvatar
                      name={c.artistic_name || c.name}
                      src={c.profile_photo_url}
                      size="xl"
                      className="h-20 w-20 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <DialogTitle className="text-2xl mb-1 truncate">{c.artistic_name ?? c.name}</DialogTitle>
                      {handle && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                          <Instagram className="h-3.5 w-3.5" />
                          @{handle}
                        </p>
                      )}
                      <Badge variant="outline" className={`mt-2 text-[10px] ${statusBadgeClass[c.status ?? ""] ?? ""}`}>
                        {etiquetaEstado(t, c.status)}
                      </Badge>
                    </div>
                  </div>
                </DialogHeader>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                  {stats.map((s) => (
                    <div key={s.label} className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <p className="text-xs text-muted-foreground font-medium">{s.label}</p>
                      <p className="text-sm font-medium truncate">{s.value}</p>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border">
                  {igUrl && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => window.open(igUrl, "_blank", "noopener,noreferrer")}
                    >
                      <Instagram className="h-3.5 w-3.5" />
                      {t("creadores.dash.openInstagram")}
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      navigate(`/creadores/${c.id}`);
                      setCreatorDetail(null);
                    }}
                  >
                    {t("creadores.dash.viewFullProfile")}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* STATUS POPUP — abierto al clickar un cuadro de status */}
      <Dialog
        open={statusPopup !== null}
        onOpenChange={(o) => {
          if (!o) {
            setStatusPopup(null);
            setPopupCollapsed(new Set());
          }
        }}
      >
        <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {statusPopup === "active" && t("creadores.dash.popupActive", { n: popupCreators.length })}
              {statusPopup === "onboarding" && t("creadores.dash.popupOnboarding", { n: popupCreators.length })}
              {statusPopup === "paused" && t("creadores.dash.popupPaused", { n: popupCreators.length })}
              {statusPopup === "leaving" && t("creadores.dash.popupLeaving", { n: popupCreators.length })}
              {statusPopup === "terminated" && t("creadores.dash.popupTerminated", { n: popupCreators.length })}
            </DialogTitle>
          </DialogHeader>

          {popupCreators.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-12 text-center text-sm text-muted-foreground">
              {t("creadores.dash.popupEmpty")}
            </div>
          ) : (() => {
            // Agrupar por categoría — mismo estándar que panel /
            // dashboard v2 / contactos.
            const buckets = new Map<string, typeof popupCreators>();
            for (const c of popupCreators) {
              const key = c.category ?? SIN_CATEGORIA;
              const arr = buckets.get(key) ?? [];
              arr.push(c);
              buckets.set(key, arr);
            }
            const sortedCats = Array.from(buckets.keys()).sort((a, b) => {
              // El grupo "sin categoría" va siempre al final.
              const sa = a === SIN_CATEGORIA ? 1000 : CATEGORY_ORDER[a] ?? 999;
              const sb = b === SIN_CATEGORIA ? 1000 : CATEGORY_ORDER[b] ?? 999;
              if (sa !== sb) return sa - sb;
              return a.localeCompare(b);
            });
            const effectiveCollapsed = popupCollapsed.size === 0
              ? new Set(sortedCats.slice(1))
              : popupCollapsed;
            const toggleCat = (cat: string) => {
              const base = popupCollapsed.size === 0
                ? new Set(sortedCats.slice(1))
                : new Set(popupCollapsed);
              if (base.has(cat)) base.delete(cat);
              else base.add(cat);
              setPopupCollapsed(base);
            };
            const renderCreatorRow = (c: typeof popupCreators[number]) => {
              const handle = (c.instagram_handle || "").replace(/^@/, "");
              return (
                <ListRowButton
                  key={c.id}
                  onClick={() => {
                    setStatusPopup(null);
                    setPopupCollapsed(new Set());
                    navigate(`/creadores/${c.id}`);
                  }}
                  className="group"
                >
                  <UserAvatar
                    name={c.artistic_name || c.name}
                    src={c.profile_photo_url}
                    size="sm"
                    className="h-8 w-8 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{c.artistic_name || c.name || t("creadores.sell.noName")}</p>
                    {handle && (
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1 truncate">
                        <Instagram className="h-2.5 w-2.5 shrink-0" />
                        @{handle}
                      </p>
                    )}
                  </div>
                  <div className="hidden sm:flex items-center gap-3 text-right shrink-0">
                    {(c.creator_business?.company?.name || c.creator_business?.assigned_agency) && (
                      <span className="text-[10px] text-muted-foreground truncate max-w-[110px]">
                        {c.creator_business?.company?.name ?? c.creator_business?.assigned_agency}
                      </span>
                    )}
                    {c.country && (
                      <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">
                        {c.country}
                      </span>
                    )}
                  </div>
                  {handle && (
                    <a
                      href={`https://instagram.com/${handle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-muted-foreground hover:text-instagram-pink transition-colors shrink-0"
                      title={t("creadores.dash.openInstagram")}
                    >
                      <Instagram className="h-3.5 w-3.5" />
                    </a>
                  )}
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                </ListRowButton>
              );
            };
            return (
              <div className="space-y-3">
                {sortedCats.map((cat) => {
                  const rows = buckets.get(cat)!;
                  const isCollapsed = effectiveCollapsed.has(cat);
                  return (
                    <div key={cat} className="space-y-2">
                      <CategorySectionHeader
                        cat={grupo(cat)}
                        count={rows.length}
                        isCollapsed={isCollapsed}
                        onToggle={() => toggleCat(cat)}
                      />
                      {!isCollapsed && (
                        <div className="space-y-1.5 pl-1">
                          {rows.map(renderCreatorRow)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </main>
  );
};

export default CreadorasDashboardContent;
