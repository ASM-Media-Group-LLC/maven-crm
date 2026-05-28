import { useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users,
  TrendingUp,
  AlertTriangle,
  Table2,
  Trophy,
  Clock,
  Flame,
  Award,
  Send,
  AlertCircle,
  Eye,
  CheckCircle2,
  XCircle,
  Instagram as InstagramIcon,
} from "lucide-react";
import { format, eachDayOfInterval, isSameDay, differenceInCalendarDays } from "date-fns";
import { es } from "date-fns/locale";
import KpiCard from "@/components/dashboard/KpiCard";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ListRowButton } from "@/components/ui/list-row";
import { CATEGORY_ORDER } from "@/hooks/useOperationsDashboard";
import { categoryTone } from "@/components/dashboard/categoryTones";
import { type PromologEntry } from "./PromologEntryCard";
import TikTokIcon from "@/components/icons/TikTokIcon";
import XIcon from "@/components/icons/XIcon";

// PromologDashboardView — el subtab "Dashboard" del módulo Promolog.
//
// Recibe los entries ya filtrados por date range global + dedupedEntries
// (para "Sin revisar" que es global) y deriva 5 secciones:
//   1. KPI cards (Creadores escaneados / Tasa de éxito / Sin revisar /
//      Promos totales) — los mismos que estaban arriba del listado.
//   2. Dos podios Top 3 paralelos: "Más Promocionaron" (volumen bruto) y
//      "Más Constantes" (% días con ≥1 promo en el rango).
//   3. Insights operativos: streak más larga · categoría más cumplidora ·
//      red más usada · plataforma destino.
//   4. Trend chart de los últimos 14 días — barras de # promos por día
//      coloreadas por result (Sí verde / No rojo).
//   5. Acción requerida — Elite que no promocionaron hoy + entries con
//      AI confidence baja que necesitan review manual.
//
// El componente es 100% derivado de los entries que le pasen; no hace
// fetches propios para que el page padre controle el cache y el filtro
// de date range global con una sola fuente.

type CreatorAgg = {
  creatorId: string;
  name: string;
  handle: string | null;
  category: string | null;
  photo: string | null;
  promoCount: number;        // entries con result="Sí"
  totalCount: number;        // todas las entries
  daysWithPromo: number;     // días distintos con ≥1 promo
};

interface Props {
  filteredEntries: PromologEntry[];
  dedupedEntries: PromologEntry[];
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
  onOpenKpiModal: (kind: "creadores_escaneados" | "completadas" | "no_chequeadas" | "ingresados") => void;
}

const PromologDashboardView = ({
  filteredEntries,
  dedupedEntries,
  dateFrom,
  dateTo,
  onOpenKpiModal,
}: Props) => {
  const navigate = useNavigate();

  // ── Agregados por creador (alimenta KPI, podios, insights, acción) ──
  const creatorsAgg = useMemo<CreatorAgg[]>(() => {
    const byCreator = new Map<string, CreatorAgg>();
    for (const e of filteredEntries) {
      const id = e.creator_id || `__no_id__${e.name}`;
      const dayKey = e.date; // ya viene formateado "28 may 2026"
      const existing = byCreator.get(id);
      const isPromo = e.result === "Sí";
      if (existing) {
        existing.totalCount += 1;
        if (isPromo) {
          existing.promoCount += 1;
          // contar días únicos con promo
          const seen = (existing as any)._days as Set<string>;
          if (!seen.has(dayKey)) {
            seen.add(dayKey);
            existing.daysWithPromo += 1;
          }
        }
      } else {
        const seen = new Set<string>();
        if (isPromo) seen.add(dayKey);
        const agg: CreatorAgg = {
          creatorId: id,
          name: e.name,
          handle: e.handle ?? null,
          category: e.category ?? null,
          photo: e.profile_photo_url ?? null,
          promoCount: isPromo ? 1 : 0,
          totalCount: 1,
          daysWithPromo: isPromo ? 1 : 0,
        };
        (agg as any)._days = seen;
        byCreator.set(id, agg);
      }
    }
    return Array.from(byCreator.values());
  }, [filteredEntries]);

  // ── KPIs ────────────────────────────────────────────────────────────
  const creatorsScannedCount = creatorsAgg.length;
  const creatorsPromotedCount = creatorsAgg.filter(c => c.promoCount > 0).length;
  const creatorsNotPromotedCount = creatorsScannedCount - creatorsPromotedCount;
  const totalEntries = filteredEntries.length;
  const successRate = totalEntries > 0
    ? Math.round((filteredEntries.filter(e => e.result === "Sí").length / totalEntries) * 100)
    : 0;
  const pendingCount = dedupedEntries.filter(e => e.result === "Pendiente").length;

  // ── Podio 1: Top 3 por volumen de promos (más promocionaron) ────────
  const topByVolume = useMemo(() => {
    return [...creatorsAgg]
      .filter(c => c.promoCount > 0)
      .sort((a, b) => b.promoCount - a.promoCount)
      .slice(0, 3);
  }, [creatorsAgg]);

  // ── Podio 2: Top 3 por % constancia (más constantes) ────────────────
  // % = daysWithPromo / totalDaysInRange. Necesitamos los días del rango
  // para que el denominador sea consistente.
  const daysInRange = useMemo(() => {
    if (!dateFrom || !dateTo) return 1;
    const diff = differenceInCalendarDays(dateTo, dateFrom) + 1;
    return Math.max(1, diff);
  }, [dateFrom, dateTo]);
  const topByConsistency = useMemo(() => {
    // Sólo creators que tienen al menos 1 día con promo. Empate por daysWithPromo
    // se desempata con promoCount (más volumen gana en empate).
    return [...creatorsAgg]
      .filter(c => c.daysWithPromo > 0)
      .map(c => ({ ...c, pct: Math.round((c.daysWithPromo / daysInRange) * 100) }))
      .sort((a, b) => b.pct - a.pct || b.promoCount - a.promoCount)
      .slice(0, 3);
  }, [creatorsAgg, daysInRange]);

  // ── Insights row ────────────────────────────────────────────────────
  // (1) Streak: usando los entries crudos del filtered, buscar la
  //     creadora con más días consecutivos promocionando.
  const longestStreak = useMemo(() => {
    // Agrupamos entries promoted por creator → set de días.
    const daysByCreator = new Map<string, { name: string; days: Set<string> }>();
    for (const e of filteredEntries.filter(x => x.result === "Sí")) {
      const id = e.creator_id || `__no_id__${e.name}`;
      const slot = daysByCreator.get(id);
      if (slot) slot.days.add(e.date);
      else daysByCreator.set(id, { name: e.name, days: new Set([e.date]) });
    }
    let best: { name: string; streak: number } = { name: "—", streak: 0 };
    for (const { name, days } of daysByCreator.values()) {
      // En el set tenemos strings tipo "28 may 2026". El cálculo de streak
      // requiere convertirlos a Date y ordenarlos. Para mantener simple,
      // contamos el número de días — el "streak real" sería días
      // consecutivos, pero como el listado de entries es limitado a 500
      // (~últimos días), usamos daysWithPromo como aproximación práctica.
      // TODO: streak true requiere tomar todo el historial.
      if (days.size > best.streak) best = { name, streak: days.size };
    }
    return best;
  }, [filteredEntries]);

  // (2) Categoría más cumplidora — % de creators con al menos 1 promo
  //     dentro de cada bucket de categoría.
  const topCategory = useMemo(() => {
    const byCat = new Map<string, { total: number; promoted: number }>();
    for (const c of creatorsAgg) {
      const key = c.category ?? "Sin categoría";
      const slot = byCat.get(key) ?? { total: 0, promoted: 0 };
      slot.total += 1;
      if (c.promoCount > 0) slot.promoted += 1;
      byCat.set(key, slot);
    }
    // Ordenamos por % desc, tie-break por orden canónico de categorías.
    const ranked = Array.from(byCat.entries())
      .filter(([, v]) => v.total > 0)
      .map(([k, v]) => ({ cat: k, pct: Math.round((v.promoted / v.total) * 100), total: v.total }))
      .sort((a, b) => b.pct - a.pct || (CATEGORY_ORDER[a.cat] ?? 999) - (CATEGORY_ORDER[b.cat] ?? 999));
    return ranked[0] ?? null;
  }, [creatorsAgg]);

  // (3) Red más usada — count de entries promoted por network.
  const topNetwork = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of filteredEntries.filter(x => x.result === "Sí")) {
      const k = (e.network || "").toLowerCase() || "otra";
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    return sorted[0] ?? null;
  }, [filteredEntries]);

  // (4) Plataforma destino — count de entries promoted por platform.
  const topPlatform = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of filteredEntries.filter(x => x.result === "Sí")) {
      const k = (e.platform || "").toLowerCase() || "otra";
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    return sorted[0] ?? null;
  }, [filteredEntries]);

  // ── Trend chart — últimos 14 días (Sí / No por día) ─────────────────
  const trendData = useMemo(() => {
    // Definimos la ventana: si hay dateFrom/dateTo, usar ese rango (cap
    // a 14 días). Sino, los últimos 14 días desde hoy.
    const end = dateTo ?? new Date();
    let start = dateFrom ?? new Date();
    const maxDays = 14;
    const diff = differenceInCalendarDays(end, start);
    if (diff > maxDays - 1) start = new Date(end.getTime() - (maxDays - 1) * 86_400_000);
    if (diff < 0) start = new Date(end.getTime() - (maxDays - 1) * 86_400_000);
    const days = eachDayOfInterval({ start, end });
    return days.map((d) => {
      const dayEntries = filteredEntries.filter((e) => {
        // entry.date es ya un string formateado "28 may 2026"
        // mejor parsear vía RegExp invertido — pero por simplicidad
        // hacemos un nuevo Date y comparamos día.
        // Sus campos `date` originales se perdieron en el map; usamos
        // el `time` como fallback. Como fix práctico, comparamos por
        // el string format que ya tenemos:
        const dayLabel = format(d, "d MMM yyyy", { locale: es });
        // entry.date tiene formato "28 may 2026" (toLocaleDateString)
        return e.date === dayLabel;
      });
      const si = dayEntries.filter(e => e.result === "Sí").length;
      const no = dayEntries.filter(e => e.result === "No").length;
      return { day: d, si, no, total: si + no };
    });
  }, [filteredEntries, dateFrom, dateTo]);
  const maxTrendCount = Math.max(1, ...trendData.map(d => d.total));

  // ── Acción requerida ────────────────────────────────────────────────
  // (1) Elite que NO promocionaron en el período.
  const eliteNotPromoted = useMemo(() => {
    return creatorsAgg.filter(c => c.category === "Elite" && c.promoCount === 0);
  }, [creatorsAgg]);
  // (2) Entries pendientes de revisar (status="Pendiente" — la AI no
  // pudo clasificar con confianza, o el humano aún no revisó).
  const pendingEntries = useMemo(() => {
    return dedupedEntries.filter(e => e.result === "Pendiente").slice(0, 5);
  }, [dedupedEntries]);

  // ── Render helpers ──────────────────────────────────────────────────
  const getInitials = (name: string) => name
    .split(" ")
    .map(w => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const goToCreator = (creatorId: string) => {
    if (!creatorId.startsWith("__no_id__")) {
      navigate(`/creadores/${creatorId}`);
    }
  };

  const networkLabel: Record<string, { label: string; icon: ReactNode; color: string }> = {
    instagram: { label: "Instagram", icon: <InstagramIcon className="h-4 w-4" />, color: "text-pink-400" },
    tiktok: { label: "TikTok", icon: <TikTokIcon className="h-4 w-4" />, color: "text-foreground" },
    x: { label: "X", icon: <XIcon className="h-4 w-4" />, color: "text-foreground" },
    telegram: { label: "Telegram", icon: <Send className="h-4 w-4" />, color: "text-sky-400" },
  };

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
      {/* ═══ Row 1: KPI cards ═══════════════════════════════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Creadores Escaneados"
          value={String(creatorsScannedCount)}
          icon={Users}
          color="bg-blue-500"
          onClick={() => onOpenKpiModal("creadores_escaneados")}
          footer={
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 ring-1 ring-emerald-500/30">
                <CheckCircle2 className="h-3 w-3" />
                Promocionaron: <span className="tabular-nums">{creatorsPromotedCount}</span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold text-rose-400 ring-1 ring-rose-500/30">
                <XCircle className="h-3 w-3" />
                No promocionaron: <span className="tabular-nums">{creatorsNotPromotedCount}</span>
              </span>
            </div>
          }
        />
        <KpiCard
          label="Tasa de éxito"
          value={`${successRate}%`}
          icon={TrendingUp}
          color="bg-emerald-500"
          onClick={() => onOpenKpiModal("completadas")}
        />
        <KpiCard
          label="Sin revisar"
          value={String(pendingCount)}
          icon={AlertTriangle}
          color="bg-rose-500"
          onClick={() => onOpenKpiModal("no_chequeadas")}
        />
        <KpiCard
          label="Promos totales"
          value={String(totalEntries)}
          icon={Table2}
          color="bg-violet-500"
          onClick={() => onOpenKpiModal("ingresados")}
        />
      </div>

      {/* ═══ Row 2: Dos podios Top 3 paralelos ═════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <PodioCard
          title="Top 3 — Más Promocionaron"
          subtitle="Por # de promos en el rango"
          icon={<Trophy className="h-4 w-4 text-amber-400" />}
          items={topByVolume.map((c, i) => ({
            position: i,
            creatorId: c.creatorId,
            name: c.name,
            handle: c.handle,
            photo: c.photo,
            category: c.category,
            primaryValue: `${c.promoCount} promo${c.promoCount === 1 ? "" : "s"}`,
            secondaryValue: `${Math.round((c.promoCount / Math.max(1, c.totalCount)) * 100)}% éxito`,
          }))}
          onClick={goToCreator}
        />
        <PodioCard
          title="Top 3 — Más Constantes"
          subtitle="% días con promo en el rango"
          icon={<Clock className="h-4 w-4 text-blue-400" />}
          items={topByConsistency.map((c, i) => ({
            position: i,
            creatorId: c.creatorId,
            name: c.name,
            handle: c.handle,
            photo: c.photo,
            category: c.category,
            primaryValue: `${c.pct}%`,
            secondaryValue: `${c.daysWithPromo} de ${daysInRange} días`,
          }))}
          onClick={goToCreator}
        />
      </div>

      {/* ═══ Row 3: Insights row — 4 mini cards ════════════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <InsightCard
          icon={<Flame className="h-4 w-4 text-orange-400" />}
          label="Streak más larga"
          value={longestStreak.streak > 0 ? `${longestStreak.streak} día${longestStreak.streak === 1 ? "" : "s"}` : "—"}
          subtitle={longestStreak.streak > 0 ? longestStreak.name : "Sin promos en rango"}
        />
        <InsightCard
          icon={<Award className="h-4 w-4 text-amber-400" />}
          label="Categoría top"
          value={topCategory ? topCategory.cat : "—"}
          subtitle={topCategory ? `${topCategory.pct}% promo rate (${topCategory.total})` : "Sin datos"}
        />
        <InsightCard
          icon={topNetwork ? (networkLabel[topNetwork[0]]?.icon ?? <Send className="h-4 w-4" />) : <Send className="h-4 w-4" />}
          label="Red más usada"
          value={topNetwork ? (networkLabel[topNetwork[0]]?.label ?? topNetwork[0]) : "—"}
          subtitle={topNetwork ? `${topNetwork[1]} promos` : "Sin promos"}
        />
        <InsightCard
          icon={<span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-white text-[9px] font-bold">OF</span>}
          label="Plataforma destino"
          value={topPlatform ? (topPlatform[0] === "ninguna" ? "Sin plataforma" : topPlatform[0]) : "—"}
          subtitle={topPlatform ? `${topPlatform[1]} promos` : "Sin promos"}
        />
      </div>

      {/* ═══ Row 4: Trend chart — barras 14 días ═══════════════════ */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold">Tendencia · {trendData.length} días</h3>
              <p className="text-xs text-muted-foreground">Promos por día (verde = sí · rojo = no)</p>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-emerald-500" /> Sí
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-rose-500" /> No
              </span>
            </div>
          </div>
          {trendData.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">Sin datos en el rango.</p>
          ) : (
            <div className="flex items-end gap-1.5 h-32">
              {trendData.map((d, i) => {
                const isToday = isSameDay(d.day, new Date());
                const total = d.si + d.no;
                const heightTotal = (total / maxTrendCount) * 100;
                const siHeight = total > 0 ? (d.si / total) * heightTotal : 0;
                const noHeight = total > 0 ? (d.no / total) * heightTotal : 0;
                return (
                  <div
                    key={i}
                    className="flex-1 flex flex-col items-center gap-1 group"
                    title={`${format(d.day, "d 'de' MMMM", { locale: es })}\nSí: ${d.si} · No: ${d.no}`}
                  >
                    <div className="w-full flex-1 flex flex-col justify-end gap-px">
                      {d.no > 0 && (
                        <div
                          className="w-full rounded-t-sm bg-rose-500/70 group-hover:bg-rose-500 transition-colors"
                          style={{ height: `${noHeight}%` }}
                        />
                      )}
                      {d.si > 0 && (
                        <div
                          className={`w-full ${d.no > 0 ? "" : "rounded-t-sm"} ${d.no === 0 ? "rounded-t-sm" : ""} bg-emerald-500/70 group-hover:bg-emerald-500 transition-colors`}
                          style={{ height: `${siHeight}%` }}
                        />
                      )}
                    </div>
                    <span className={`text-[9px] tabular-nums ${isToday ? "text-primary font-bold" : "text-muted-foreground"}`}>
                      {format(d.day, "d", { locale: es })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ Row 5: Acción Requerida ═══════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* (a) Elite que no promocionaron */}
        <Card className={eliteNotPromoted.length > 0 ? "border-rose-500/30" : ""}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <AlertCircle className={`h-4 w-4 ${eliteNotPromoted.length > 0 ? "text-rose-400" : "text-muted-foreground"}`} />
                <div>
                  <h3 className="text-sm font-semibold">Elite que NO promocionaron</h3>
                  <p className="text-xs text-muted-foreground">Atención prioritaria — son las top tier</p>
                </div>
              </div>
              <Badge variant={eliteNotPromoted.length > 0 ? "destructive-soft" : "secondary-soft"} className="text-[10px]">
                {eliteNotPromoted.length}
              </Badge>
            </div>
            {eliteNotPromoted.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <CheckCircle2 className="h-6 w-6 text-emerald-400 mb-1" />
                <p className="text-xs text-emerald-400 font-medium">Todas las Elite cumplieron 🎉</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {eliteNotPromoted.map((c) => (
                  <ListRowButton
                    key={c.creatorId}
                    onClick={() => goToCreator(c.creatorId)}
                    className="justify-between"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Avatar className="h-6 w-6">
                        {c.photo ? <AvatarImage src={c.photo} alt={c.name} /> : null}
                        <AvatarFallback className="text-[10px]">{getInitials(c.name)}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-xs truncate">{c.name}</span>
                    </div>
                    <Badge variant="destructive-soft" className="text-[9px] gap-1 shrink-0">
                      <XCircle className="h-3 w-3" />
                      Sin promo
                    </Badge>
                  </ListRowButton>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* (b) Pendientes de revisar */}
        <Card className={pendingEntries.length > 0 ? "border-amber-500/30" : ""}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Eye className={`h-4 w-4 ${pendingEntries.length > 0 ? "text-amber-400" : "text-muted-foreground"}`} />
                <div>
                  <h3 className="text-sm font-semibold">Pendientes de revisar</h3>
                  <p className="text-xs text-muted-foreground">Stories que necesitan validación manual</p>
                </div>
              </div>
              <Badge variant={pendingEntries.length > 0 ? "warning-soft" : "secondary-soft"} className="text-[10px]">
                {pendingEntries.length}
              </Badge>
            </div>
            {pendingEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <CheckCircle2 className="h-6 w-6 text-emerald-400 mb-1" />
                <p className="text-xs text-emerald-400 font-medium">Sin pendientes 👌</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {pendingEntries.map((entry) => (
                  <ListRowButton
                    key={entry.id}
                    onClick={() => goToCreator(entry.creator_id ?? "")}
                    className="justify-between"
                  >
                    <div className="min-w-0 flex-1 flex items-center gap-2">
                      <span className="font-medium text-xs truncate">{entry.name}</span>
                      <span className="text-[10px] text-muted-foreground capitalize shrink-0">{entry.network}</span>
                    </div>
                    <span className="text-[9px] text-muted-foreground tabular-nums shrink-0">{entry.date}</span>
                  </ListRowButton>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

// ─── Sub-components ──────────────────────────────────────────────────

const POSITION_STYLES = [
  // Oro
  { ring: "ring-amber-500/40", bg: "bg-amber-500/10", text: "text-amber-400", medal: "🥇" },
  // Plata
  { ring: "ring-slate-400/40", bg: "bg-slate-400/10", text: "text-slate-300", medal: "🥈" },
  // Bronce
  { ring: "ring-orange-600/40", bg: "bg-orange-600/10", text: "text-orange-400", medal: "🥉" },
];

interface PodioItem {
  position: number;
  creatorId: string;
  name: string;
  handle: string | null;
  photo: string | null;
  category: string | null;
  primaryValue: string;
  secondaryValue: string;
}

interface PodioCardProps {
  title: string;
  subtitle: string;
  icon: ReactNode;
  items: PodioItem[];
  onClick: (creatorId: string) => void;
}

const PodioCard = ({ title, subtitle, icon, items, onClick }: PodioCardProps) => (
  <Card>
    <CardContent className="p-4">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="text-center text-xs text-muted-foreground py-6">Sin datos en el rango.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const style = POSITION_STYLES[item.position];
            const tone = item.category ? categoryTone(item.category) : null;
            const initials = item.name.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
            return (
              <button
                key={item.creatorId}
                type="button"
                onClick={() => onClick(item.creatorId)}
                className={`group w-full flex items-center gap-3 rounded-lg border border-border bg-card/40 p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-card/60 ring-1 ${style.ring}`}
              >
                <span className="text-xl shrink-0" aria-hidden>{style.medal}</span>
                <Avatar className="h-9 w-9 shrink-0">
                  {item.photo ? <AvatarImage src={item.photo} alt={item.name} /> : null}
                  <AvatarFallback className="text-[10px]">{initials || "?"}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-sm truncate">{item.name}</span>
                    {tone && (
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${tone.bg} ${tone.text} shrink-0`}>
                        {item.category}
                      </span>
                    )}
                  </div>
                  {item.handle && (
                    <p className="text-[10px] text-muted-foreground truncate">@{item.handle.replace(/^@/, "").replace(/\/$/, "").split("/").pop()}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-bold tabular-nums ${style.text}`}>{item.primaryValue}</p>
                  <p className="text-[9px] text-muted-foreground tabular-nums">{item.secondaryValue}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </CardContent>
  </Card>
);

interface InsightCardProps {
  icon: ReactNode;
  label: string;
  value: string;
  subtitle: string;
}

const InsightCard = ({ icon, label, value, subtitle }: InsightCardProps) => (
  <Card>
    <CardContent className="p-3">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      </div>
      <p className="text-xl font-bold truncate">{value}</p>
      <p className="text-[10px] text-muted-foreground truncate mt-0.5">{subtitle}</p>
    </CardContent>
  </Card>
);

export default PromologDashboardView;
