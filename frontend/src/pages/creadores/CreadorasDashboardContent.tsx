import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Users, UserCheck, Clock, PauseCircle, LogOut, XCircle, TrendingUp, Globe, Tag, DollarSign, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { useCreadores } from "./useCreadores";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const emptyFilters = { search: "", agency: "", status: "", category: "", country: "", city: "", manager: "" };

const statusConfig = [
  { key: "active",     label: "Activas",     icon: UserCheck,   color: "text-success",      border: "border-t-success",      bg: "hover:from-success/10",      iconBg: "bg-success/10" },
  { key: "onboarding", label: "En Onboarding",  icon: Clock,       color: "text-primary",      border: "border-t-primary",      bg: "hover:from-primary/10",      iconBg: "bg-primary/10" },
  { key: "paused",     label: "Pausadas",    icon: PauseCircle, color: "text-warning",      border: "border-t-warning",      bg: "hover:from-warning/10",      iconBg: "bg-warning/10" },
  { key: "leaving",    label: "En retiro",   icon: LogOut,      color: "text-destructive",  border: "border-t-destructive",  bg: "hover:from-destructive/10",  iconBg: "bg-destructive/10" },
  { key: "terminated", label: "Terminadas",  icon: XCircle,     color: "text-muted-foreground", border: "border-t-border",   bg: "hover:from-muted/30",        iconBg: "bg-muted" },
];

const CreadorasDashboardContent = () => {
  const navigate = useNavigate();
  const { allCreators, isLoading } = useCreadores(emptyFilters);

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
      const cat = i.categoria ?? "Sin categoría";
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

  // Distribution by agency
  const byAgency = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of allCreators) {
      const a = c.creator_business?.assigned_agency ?? "Sin agencia";
      map[a] = (map[a] ?? 0) + 1;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [allCreators]);

  // Distribution by country (top 5)
  const byCountry = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of allCreators) {
      const country = c.country ?? "Desconocido";
      map[country] = (map[country] ?? 0) + 1;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [allCreators]);

  // Distribution by category
  const byCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of allCreators) {
      const cat = c.category ?? "Sin categoría";
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
      <header className="bg-background px-6 pt-6 pb-4 border-b border-border shrink-0">
        <div>
          <h1 className="text-2xl font-bold">Dashboard de Creadores</h1>
          <p className="text-sm text-muted-foreground">Visión ejecutiva · {total} creadores en total</p>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Section 1 — Status KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {statusConfig.map(({ key, label, icon: Icon, color, border, bg, iconBg }) => {
            const count = statusCounts[key] ?? 0;
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <Card
                key={key}
                className={`${key === "onboarding" ? "relative " : ""}border-t-[3px] ${border} cursor-pointer transition-all duration-200 hover:scale-[1.03] hover:shadow-lg hover:bg-gradient-to-br ${bg} hover:to-transparent hover:border-b hover:border-x ${key === "onboarding" ? "group" : ""}`}
                onClick={() => navigate(key === "onboarding" ? "/creadores/onboarding" : `/creadores?status=${key}`)}
              >
                {key === "onboarding" && pendingCount > 0 && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 z-10">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive/60" />
                          <span className="relative inline-flex rounded-full h-4 w-4 bg-destructive" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Tienes {pendingCount} registros por verificar</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground font-medium">{label}</p>
                      <p className={`text-3xl font-bold mt-1 ${color}`}>{count}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{pct}% del total</p>
                      {key === "onboarding" && (
                        <p className="text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                          Ver listado →
                        </p>
                      )}
                    </div>
                    <div className={`p-2 rounded-lg ${iconBg} shrink-0`}>
                      <Icon className={`h-5 w-5 ${color}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
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
                Por Agencia
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {byAgency.length === 0 && <p className="text-xs text-muted-foreground">Sin datos</p>}
              {byAgency.map(([agency, count]) => {
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                  <div key={agency} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="truncate text-foreground font-medium">{agency}</span>
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
                Top 5 Países
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {byCountry.length === 0 && <p className="text-xs text-muted-foreground">Sin datos</p>}
              {byCountry.map(([country, count], idx) => {
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                  <div key={country} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5">
                        <span className="text-muted-foreground font-mono w-4 shrink-0">#{idx + 1}</span>
                        <span className="truncate font-medium text-foreground">{country}</span>
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
                Por Categoría
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {byCategory.length === 0 && <p className="text-xs text-muted-foreground">Sin datos</p>}
              {byCategory.map(([cat, count]) => {
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                  <div key={cat} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="truncate font-medium text-foreground">{cat}</span>
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
        <div className="grid grid-cols-1 gap-4">
          {/* Latest registrations */}
          <Card className="transition-all duration-200 hover:shadow-md hover:border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Últimas Incorporaciones
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {latestCreators.length === 0 && <p className="text-xs text-muted-foreground">Sin datos</p>}
              {latestCreators.map((c) => (
                <button
                  key={c.id}
                  onClick={() => navigate(`/creadores/${c.id}`)}
                  className="w-full flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-muted/60 transition-colors text-left group"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                      {c.artistic_name ?? c.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.creator_business?.assigned_agency ?? "Sin agencia"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className={`text-[10px] ${statusBadgeClass[c.status ?? ""] ?? ""}`}>
                      {c.status}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {c.created_at ? format(new Date(c.created_at), "dd MMM", { locale: es }) : ""}
                    </span>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Section 4 — Offboarding Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-t-[3px] border-t-destructive cursor-pointer transition-all duration-200 hover:scale-[1.03] hover:shadow-lg hover:bg-gradient-to-br hover:from-destructive/10 hover:to-transparent">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Modelos Perdidas</p>
                  <p className="text-3xl font-bold mt-1 text-destructive">{offboardingMetrics.totalFinalized}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{offboardingMetrics.totalInProgress} en proceso</p>
                </div>
                <div className="p-2 rounded-lg bg-destructive/10 shrink-0">
                  <LogOut className="h-5 w-5 text-destructive" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-t-[3px] border-t-warning cursor-pointer transition-all duration-200 hover:scale-[1.03] hover:shadow-lg hover:bg-gradient-to-br hover:from-warning/10 hover:to-transparent">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Revenue Perdido</p>
                  <p className="text-3xl font-bold mt-1 text-warning">
                    ${offboardingMetrics.totalLostRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Estimado 12 meses</p>
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
                Motivos de Salida
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {offboardingMetrics.byCategoria.length === 0 && (
                <p className="text-xs text-muted-foreground">Sin datos</p>
              )}
              {offboardingMetrics.byCategoria.map(([cat, count]) => (
                <div key={cat} className="flex items-center justify-between text-xs">
                  <span className="capitalize font-medium text-foreground">{cat.replace("_", " ")}</span>
                  <Badge variant="outline" className="text-[10px]">{count}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
};

export default CreadorasDashboardContent;
