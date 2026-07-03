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
  Link2,
  Gauge,
  Sparkles,
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
import { displayPlatform } from "./promoScore";
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
  // Abre el popup de veredicto de una entry (para revisar Pendientes en el lugar).
  onOpenEntry?: (entry: PromologEntry) => void;
  // Total de creadoras ACTIVAS (roster) para la métrica de cobertura.
  activeCreatorsCount?: number;
  // Métricas del período anterior equivalente, para los deltas ▲/▼.
  prevMetrics?: { promos: number; successRate: number } | null;
  // Roster activo (lista) para el feed de "Acciones recomendadas".
  activeCreators?: Array<{ id: string; name: string | null; category: string | null; instagram_handle: string | null; profile_photo_url: string | null }>;
}

const PromologDashboardView = ({
  filteredEntries,
  dedupedEntries,
  dateFrom,
  dateTo,
  onOpenKpiModal,
  onOpenEntry,
  activeCreatorsCount,
  prevMetrics,
  activeCreators,
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
  // Promos REALES (Sí), distinto de totalEntries (que incluye los "No" escaneados).
  const promoSi = useMemo(() => filteredEntries.filter(e => e.result === "Sí"), [filteredEntries]);
  const promosCount = promoSi.length;
  const successRate = totalEntries > 0 ? Math.round((promosCount / totalEntries) * 100) : 0;
  // "Sin revisar" = pendientes de la IA + las que marcó para revisión manual (needs_review).
  const pendingCount = dedupedEntries.filter(e => e.result === "Pendiente" || e.needs_review).length;

  // Tipo de promo: DIRECTA (link de compra visible) vs INDIRECTA (CTA sin link).
  // Es la distinción clave para OF (las creadoras evitan links explícitos por el ban
  // algorítmico de IG). has_buy_link lo setea Gemini.
  const directas = useMemo(() => promoSi.filter(e => e.has_buy_link === true).length, [promoSi]);
  const indirectas = promosCount - directas;
  const directPct = promosCount > 0 ? Math.round((directas / promosCount) * 100) : 0;

  // Calidad promedio: media del dayScore (peso×calidad, IG 60% + multi-red) de los
  // creadora-días que SÍ sumaron (dayScore>0). "Cuando promocionan, qué tan buena es
  // la promo" — reutiliza el computeDayScore que ya viene en cada entry deduplicada.
  const qualityAvg = useMemo(() => {
    const withScore = filteredEntries.filter(e => (e.dayScore ?? 0) > 0);
    if (!withScore.length) return 0;
    return Math.round((withScore.reduce((s, e) => s + (e.dayScore ?? 0), 0) / withScore.length) * 100);
  }, [filteredEntries]);
  const qualityColor = qualityAvg >= 70 ? "#10b981" : qualityAvg >= 40 ? "#f59e0b" : qualityAvg > 0 ? "#f43f5e" : "transparent";

  // Cobertura del pipeline: cuántas de las activas se escanearon en el rango.
  const coverGap = activeCreatorsCount ? Math.max(0, activeCreatorsCount - creatorsScannedCount) : 0;

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
  // Top 3 MENOS Promoción — las creadoras escaneadas que MENOS
  // promocionaron en el rango (volumen ascendente). El management las
  // usa para identificar quién necesita refuerzo del chatter. Incluimos
  // las que tienen 0 promos en el período (son las más críticas). Si
  // hay menos de 3 con 0 promos, completamos con las de 1, 2, etc.
  // Tie-break: menos % cumplimiento primero, luego nombre alfabético.
  const bottomByVolume = useMemo(() => {
    return [...creatorsAgg]
      .map(c => ({ ...c, pct: Math.round((c.daysWithPromo / daysInRange) * 100) }))
      .sort((a, b) =>
        a.promoCount - b.promoCount ||
        a.pct - b.pct ||
        a.name.localeCompare(b.name),
      )
      .slice(0, 3);
  }, [creatorsAgg, daysInRange]);

  // ── Insights row ────────────────────────────────────────────────────
  // (1) Streak: usando los entries crudos del filtered, buscar la
  //     creadora con más días consecutivos promocionando.
  const longestStreak = useMemo(() => {
    // Racha CONSECUTIVA real: agrupamos los días con promo por creadora (usando rawDate,
    // YYYY-MM-DD, para no depender del string formateado), ordenamos y contamos el run
    // de días consecutivos más largo. Acotada al rango cargado, pero ya es una racha de
    // verdad (antes contaba el total de días distintos, que no es lo mismo).
    const daysByCreator = new Map<string, { name: string; days: Set<string> }>();
    for (const e of filteredEntries) {
      if (e.result !== "Sí") continue;
      const key = (e.rawDate || "").slice(0, 10);
      if (!key) continue;
      const id = e.creator_id || `__no_id__${e.name}`;
      const slot = daysByCreator.get(id);
      if (slot) slot.days.add(key);
      else daysByCreator.set(id, { name: e.name, days: new Set([key]) });
    }
    let best: { name: string; streak: number } = { name: "—", streak: 0 };
    for (const { name, days } of daysByCreator.values()) {
      const sorted = [...days].sort();
      let run = 0, max = 0, prev: number | null = null;
      for (const k of sorted) {
        const t = Date.parse(`${k}T00:00:00Z`);
        run = (prev !== null && t - prev === 86_400_000) ? run + 1 : 1;
        prev = t;
        if (run > max) max = run;
      }
      if (max > best.streak) best = { name, streak: max };
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
      // displayPlatform normaliza OnlyFans/Unlok/etc. (o "Sin plataforma" si no se identificó).
      const k = displayPlatform(e) ?? "Sin plataforma";
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
    // Bucket por día UNA sola vez con el día crudo (rawDate → YYYY-MM-DD), en vez de
    // comparar el string formateado de la entry (formateado en el TZ del user) contra
    // otro string formateado por date-fns (TZ del browser) — eso desfasaba/vaciaba barras.
    const byDay = new Map<string, { si: number; no: number }>();
    for (const e of filteredEntries) {
      const key = (e.rawDate || "").slice(0, 10);
      if (!key) continue;
      const slot = byDay.get(key) ?? { si: 0, no: 0 };
      if (e.result === "Sí") slot.si += 1;
      else if (e.result === "No") slot.no += 1;
      byDay.set(key, slot);
    }
    return days.map((d) => {
      const slot = byDay.get(format(d, "yyyy-MM-dd")) ?? { si: 0, no: 0 };
      return { day: d, si: slot.si, no: slot.no, total: slot.si + slot.no };
    });
  }, [filteredEntries, dateFrom, dateTo]);
  const maxTrendCount = Math.max(1, ...trendData.map(d => d.total));

  // ── Acción requerida ────────────────────────────────────────────────
  // (1) Elite que NO promocionaron en el período.
  // Feed "Acciones recomendadas": señales accionables por creadora en el rango.
  // Mismo payload que después consumirá el bot de WhatsApp asesor. Prioridad:
  //   1 = tier alto (Elite/A+) sin promocionar · 2 = promo de baja calidad ·
  //   3 = solo promociona en IG (empujar multi-red para subir el score).
  const recommendations = useMemo(() => {
    const byCreator = new Map<string, { promoted: boolean; nets: Set<string>; bestScore: number }>();
    for (const e of filteredEntries) {
      if (!e.creator_id) continue;
      const cur = byCreator.get(e.creator_id) ?? { promoted: false, nets: new Set<string>(), bestScore: 0 };
      if (e.result === "Sí") cur.promoted = true;
      (e.promotedNetworks ?? []).forEach((n) => cur.nets.add(n));
      cur.bestScore = Math.max(cur.bestScore, e.dayScore ?? 0);
      byCreator.set(e.creator_id, cur);
    }
    type Rec = { id: string; name: string; handle: string | null; photo: string | null; category: string | null; kind: string; priority: number; reason: string };
    const recs: Rec[] = [];
    for (const c of activeCreators ?? []) {
      const tierHigh = c.category === "Elite" || c.category === "A+";
      const st = byCreator.get(c.id);
      const base = { id: c.id, name: c.name ?? "—", handle: c.instagram_handle, photo: c.profile_photo_url, category: c.category };
      if (!st || !st.promoted) {
        // No promocionó: solo lo accionamos si es tier alto (el resto ya sale en "Menos Promoción").
        if (tierHigh) recs.push({ ...base, kind: "tier_sin_promo", priority: 1, reason: "Tier alto sin promocionar — empujar promo" });
        continue;
      }
      if (st.bestScore > 0 && st.bestScore < 0.4) {
        recs.push({ ...base, kind: "baja_calidad", priority: 2, reason: `Promo floja (${Math.round(st.bestScore * 100)}%) — pedir link de compra` });
      } else if (st.nets.size === 1 && st.nets.has("instagram")) {
        recs.push({ ...base, kind: "solo_ig", priority: 3, reason: "Solo promociona en IG — empujar otra red (sube el score)" });
      }
    }
    recs.sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
    return recs;
  }, [filteredEntries, activeCreators]);
  // (2) Entries pendientes de revisar (status="Pendiente" — la AI no
  // pudo clasificar con confianza, o el humano aún no revisó).
  const pendingEntries = useMemo(() => {
    return dedupedEntries.filter(e => e.result === "Pendiente" || e.needs_review).slice(0, 5);
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
            <div className="space-y-1">
              {activeCreatorsCount ? (
                <p className={`text-[10px] ${coverGap > 0 ? "text-warning" : "text-muted-foreground"}`}>
                  de {activeCreatorsCount} activas{coverGap > 0 ? ` · ${coverGap} sin escanear` : " · cobertura completa"}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success ring-1 ring-success/30">
                  <CheckCircle2 className="h-3 w-3" />
                  Promocionaron: <span className="tabular-nums">{creatorsPromotedCount}</span>
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold text-destructive ring-1 ring-destructive/30">
                  <XCircle className="h-3 w-3" />
                  No promocionaron: <span className="tabular-nums">{creatorsNotPromotedCount}</span>
                </span>
              </div>
            </div>
          }
        />
        <KpiCard
          label="Tasa de éxito"
          value={`${successRate}%`}
          icon={TrendingUp}
          color="bg-success"
          onClick={() => onOpenKpiModal("completadas")}
          footer={
            <span className="text-[10px] text-muted-foreground">
              promos ÷ escaneadas{prevMetrics ? <> · <DeltaSpan diff={successRate - prevMetrics.successRate} suffix="pp" /> vs ant.</> : null}
            </span>
          }
        />
        <KpiCard
          label="Sin revisar"
          value={String(pendingCount)}
          icon={AlertTriangle}
          color="bg-destructive"
          onClick={() => onOpenKpiModal("no_chequeadas")}
        />
        <KpiCard
          label="Promos (Sí)"
          value={String(promosCount)}
          icon={Table2}
          color="bg-violet-500"
          onClick={() => onOpenKpiModal("ingresados")}
          footer={
            <span className="text-[10px] text-muted-foreground">
              de {totalEntries} escaneadas{prevMetrics ? <> · <DeltaSpan diff={promosCount - prevMetrics.promos} /> vs ant.</> : null}
            </span>
          }
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
        {/* Top 3 MENOS Promoción — antes era "Más Constantes" (las que
            promueven más seguido). Cambiado a su inverso porque el equipo
            las usa para identificar a quién hacerle seguimiento prioritario.
            Las 3 que aparecen son las que necesitan refuerzo del chatter. */}
        <PodioCard
          title="Top 3 — Menos Promoción"
          subtitle="Las que necesitan refuerzo del chatter"
          icon={<AlertCircle className="h-4 w-4 text-destructive" />}
          items={bottomByVolume.map((c, i) => ({
            position: i,
            creatorId: c.creatorId,
            name: c.name,
            handle: c.handle,
            photo: c.photo,
            category: c.category,
            primaryValue: `${c.promoCount} promo${c.promoCount === 1 ? "" : "s"}`,
            secondaryValue: c.pct > 0 ? `${c.pct}% cumplimiento` : "Sin actividad",
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
          value={topPlatform ? topPlatform[0] : "—"}
          subtitle={topPlatform ? `${topPlatform[1]} promos` : "Sin promos"}
        />
      </div>

      {/* ═══ Row 3.5: Calidad promedio + Tipo de promo ════════════ */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {/* (a) Calidad de promo — media del dayScore (peso×calidad) */}
      <Card>
        <CardContent className="p-4">
          <div className="mb-2 flex items-center gap-2">
            <Gauge className="h-4 w-4 text-emerald-400" />
            <div>
              <h3 className="text-sm font-semibold">Calidad de promo</h3>
              <p className="text-xs text-muted-foreground">Promedio (peso×calidad, IG 60% + multi-red) de las que sumaron</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold tabular-nums">{qualityAvg}%</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted/40 ring-1 ring-border/50">
              <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${qualityAvg}%`, backgroundColor: qualityColor }} />
            </div>
          </div>
        </CardContent>
      </Card>
      {/* (b) Tipo de promo — Directa vs Indirecta */}
      <Card>
        <CardContent className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-sky-400" />
              <div>
                <h3 className="text-sm font-semibold">Tipo de promo</h3>
                <p className="text-xs text-muted-foreground">Directa (link de compra visible) vs indirecta (CTA sin link)</p>
              </div>
            </div>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{promosCount} promos</span>
          </div>
          {promosCount === 0 ? (
            <p className="py-2 text-center text-xs text-muted-foreground">Sin promos en el rango.</p>
          ) : (
            <>
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted/40 ring-1 ring-border/50">
                <div className="bg-emerald-500" style={{ width: `${directPct}%` }} title={`Directa: ${directas}`} />
                <div className="bg-sky-500/60" style={{ width: `${100 - directPct}%` }} title={`Indirecta: ${indirectas}`} />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-emerald-500" /> Directa <b className="tabular-nums">{directas}</b> ({directPct}%)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-sky-500/60" /> Indirecta <b className="tabular-nums">{indirectas}</b> ({100 - directPct}%)
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
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
                <span className="h-2 w-2 rounded-sm bg-success" /> Sí
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm bg-destructive" /> No
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
                          className="w-full rounded-t-sm bg-destructive/70 group-hover:bg-destructive transition-colors"
                          style={{ height: `${noHeight}%` }}
                        />
                      )}
                      {d.si > 0 && (
                        <div
                          className={`w-full ${d.no > 0 ? "" : "rounded-t-sm"} ${d.no === 0 ? "rounded-t-sm" : ""} bg-success/70 group-hover:bg-success transition-colors`}
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
        {/* (a) Acciones recomendadas — feed accionable (mismo payload del futuro bot asesor) */}
        <Card className={recommendations.length > 0 ? "border-warning/30" : ""}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles className={`h-4 w-4 ${recommendations.length > 0 ? "text-warning" : "text-muted-foreground"}`} />
                <div>
                  <h3 className="text-sm font-semibold">Acciones recomendadas</h3>
                  <p className="text-xs text-muted-foreground">Qué pedirle al chatter — priorizado</p>
                </div>
              </div>
              <Badge variant={recommendations.length > 0 ? "warning-soft" : "secondary-soft"} className="text-[10px]">
                {recommendations.length}
              </Badge>
            </div>
            {recommendations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <CheckCircle2 className="h-6 w-6 text-success mb-1" />
                <p className="text-xs text-success font-medium">Nada urgente 🎉</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {recommendations.slice(0, 20).map((r) => (
                  <ListRowButton key={r.id} onClick={() => goToCreator(r.id)} className="justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <Avatar className="h-6 w-6">
                        {r.photo ? <AvatarImage src={r.photo} alt={r.name} /> : null}
                        <AvatarFallback className="text-[10px]">{getInitials(r.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium">{r.name}</span>
                        <span className="block truncate text-[10px] text-muted-foreground">{r.reason}</span>
                      </div>
                    </div>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold ${REC_TONE[r.priority] ?? "bg-muted text-muted-foreground"}`}>
                      P{r.priority}
                    </span>
                  </ListRowButton>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* (b) Pendientes de revisar */}
        <Card className={pendingEntries.length > 0 ? "border-warning/30" : ""}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Eye className={`h-4 w-4 ${pendingEntries.length > 0 ? "text-warning" : "text-muted-foreground"}`} />
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
                <CheckCircle2 className="h-6 w-6 text-success mb-1" />
                <p className="text-xs text-success font-medium">Sin pendientes 👌</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {pendingEntries.map((entry) => (
                  <ListRowButton
                    key={entry.id}
                    onClick={() => (onOpenEntry ? onOpenEntry(entry) : goToCreator(entry.creator_id ?? ""))}
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

// Color del chip de prioridad en el feed de acciones recomendadas.
const REC_TONE: Record<number, string> = {
  1: "bg-destructive/15 text-destructive",
  2: "bg-warning/15 text-warning",
  3: "bg-sky-500/15 text-sky-400",
};

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

// Delta ▲/▼ contra el período anterior (verde = subió, rojo = bajó, gris = igual).
const DeltaSpan = ({ diff, suffix = "" }: { diff: number; suffix?: string }) => {
  if (diff === 0) return <span className="text-muted-foreground">=</span>;
  const up = diff > 0;
  return (
    <span className={up ? "text-success" : "text-destructive"}>
      {up ? "▲" : "▼"}{Math.abs(diff)}{suffix}
    </span>
  );
};

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
