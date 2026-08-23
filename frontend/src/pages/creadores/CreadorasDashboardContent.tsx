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
import { es } from "date-fns/locale";
import CreadoresHeader from "./CreadoresHeader";

const emptyFilters = { search: "", agency: "", status: "", category: "", country: "", city: "", manager: "" };

// Estilo Panel de Control / Dashboard v2 — gradient corner blur + icono
// con cuadrado coloreado + hover lift. La key se usa para navegar al
// listado filtrado o al onboarding.
const statusConfig = [
  { key: "active",     label: "Activas",     icon: UserCheck,   bg: "bg-success" },
  { key: "onboarding", label: "En Onboarding", icon: Clock,     bg: "bg-blue-500" },
  { key: "paused",     label: "Pausadas",    icon: PauseCircle, bg: "bg-warning" },
  { key: "leaving",    label: "En retiro",   icon: LogOut,      bg: "bg-destructive" },
  { key: "terminated", label: "Terminadas",  icon: XCircle,     bg: "bg-slate-500" },
];

const CreadorasDashboardContent = () => {
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
      const a = c.creator_business?.company?.name ?? c.creator_business?.assigned_agency ?? "Sin agencia";
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
                className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 text-left transition-all duration-200 ease-out hover:scale-[1.025] hover:border-primary/40 hover:shadow-[0_0_24px_-4px_rgba(255,255,255,0.15)] active:scale-[0.99]"
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
                      <TooltipContent>Tienes {pendingCount} registros por verificar</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                <div className={`absolute -right-12 -top-12 h-32 w-32 rounded-full blur-3xl opacity-25 ${bg} transition-opacity group-hover:opacity-50`} />
                <div className="relative space-y-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${bg}`}>
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-foreground/80 font-semibold">{label}</p>
                    <p className="text-3xl font-bold tabular-nums leading-tight">{count}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{pct}% del total</p>
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
        <div className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
            <Users className="h-4 w-4 text-primary" />
            Últimas Incorporaciones
          </h3>
          {latestCreators.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              Sin datos
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
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Agencia</p>
                          <p className="text-xs font-medium truncate max-w-[120px]">{c.creator_business?.company?.name ?? c.creator_business?.assigned_agency ?? "—"}</p>
                        </div>
                        <Badge variant="outline" className={`text-[10px] ${statusBadgeClass[c.status ?? ""] ?? ""}`}>
                          {c.status}
                        </Badge>
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Registro</p>
                          <p className="text-xs font-medium whitespace-nowrap">
                            {c.created_at ? format(new Date(c.created_at), "dd MMM", { locale: es }) : "—"}
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

      {/* CREATOR DETAIL — ficha técnica con foto + IG + ver perfil */}
      <Dialog open={creatorDetail !== null} onOpenChange={(o) => !o && setCreatorDetail(null)}>
        <DialogContent className="max-w-xl">
          {creatorDetail && (() => {
            const c = creatorDetail;
            const handle = (c.instagram_handle || "").replace(/^@/, "");
            const igUrl = handle ? `https://instagram.com/${handle}` : null;
            const stats: { label: string; value: string }[] = [
              { label: "Estado", value: c.status ?? "—" },
              { label: "Agencia", value: c.creator_business?.company?.name ?? c.creator_business?.assigned_agency ?? "—" },
              { label: "País", value: c.country ?? "—" },
              { label: "Categoría", value: c.category ?? "—" },
              { label: "Registro", value: c.created_at ? format(new Date(c.created_at), "dd MMM yyyy", { locale: es }) : "—" },
              { label: "Manager", value: c.creator_business?.manager_type ?? "—" },
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
                        {c.status}
                      </Badge>
                    </div>
                  </div>
                </DialogHeader>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                  {stats.map((s) => (
                    <div key={s.label} className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{s.label}</p>
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
                      Abrir Instagram
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
                    Ver perfil completo
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
              {statusPopup === "active" && `Creadoras Activas (${popupCreators.length})`}
              {statusPopup === "onboarding" && `En Onboarding (${popupCreators.length})`}
              {statusPopup === "paused" && `Creadoras Pausadas (${popupCreators.length})`}
              {statusPopup === "leaving" && `En Retiro (${popupCreators.length})`}
              {statusPopup === "terminated" && `Creadoras Terminadas (${popupCreators.length})`}
            </DialogTitle>
          </DialogHeader>

          {popupCreators.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-12 text-center text-sm text-muted-foreground">
              Sin creadoras en este estado.
            </div>
          ) : (() => {
            // Agrupar por categoría — mismo estándar que panel /
            // dashboard v2 / contactos.
            const buckets = new Map<string, typeof popupCreators>();
            for (const c of popupCreators) {
              const key = c.category ?? "Sin categoría";
              const arr = buckets.get(key) ?? [];
              arr.push(c);
              buckets.set(key, arr);
            }
            const sortedCats = Array.from(buckets.keys()).sort((a, b) => {
              const sa = CATEGORY_ORDER[a] ?? 999;
              const sb = CATEGORY_ORDER[b] ?? 999;
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
                    <p className="font-medium text-sm truncate">{c.artistic_name || c.name || "Sin nombre"}</p>
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
                      className="text-muted-foreground hover:text-pink-500 transition-colors shrink-0"
                      title="Abrir Instagram"
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
                        cat={cat}
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
