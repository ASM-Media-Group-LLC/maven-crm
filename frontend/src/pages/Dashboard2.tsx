import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, startOfDay, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subDays, endOfDay, differenceInCalendarDays } from "date-fns";
import { es } from "date-fns/locale";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
// Dashboard 2 ahora se alimenta de la data VIVA de BLU (creator_daily_earnings).
// La fuente vieja (of_gross_earnings, vía useEarningsData) dejó de actualizarse el 9-may.
import { useDashboard2Summary } from "./sales-performance/useDashboard2Summary";
import { useDashboard2Daily } from "./sales-performance/useDashboard2Daily";
import { useTopFans } from "./sales-performance/useTopFans";
import { useFanRetention } from "./sales-performance/useFanRetention";
import { useChatters } from "./sales-performance/useChatters";
import { usePromoDays } from "./sales-performance/usePromoDays";
import { useCohortRetention } from "./sales-performance/useCohortRetention";
import CohortRetentionTab from "./sales-performance/CohortRetentionTab";
import LtvTab, { type LtvData, type LtvCreator } from "./sales-performance/LtvTab";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Info, TrendingUp, TrendingDown, Users, DollarSign, Calendar,
  ArrowUpDown, ArrowUp, ArrowDown, Search, Filter, Instagram, PieChart,
  BarChart3, MessageSquare, Repeat, Heart, Eye, AlertTriangle, Target, Crown, X,
  Download, Zap, Activity, Brain, Layers, BarChart, Sparkles, UserCheck, ShieldAlert,
  Telescope, ArrowRight, ChevronRight, Scale, GitCompare, CheckCircle2, Camera, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ExternalLink } from "lucide-react";
import {
  Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ListRow, ListRowButton } from "@/components/ui/list-row";
import CategorySectionHeader from "@/components/dashboard/CategorySectionHeader";
import { CATEGORY_ORDER } from "@/hooks/useOperationsDashboard";
import {
  PieChart as RechartsPie, Pie, Cell, Tooltip, ResponsiveContainer,
} from "recharts";
import { useUserRole } from "@/hooks/useUserRole";
// jspdf + jspdf-autotable are loaded on demand inside exportPdf() so
// the (large) PDF chunk only enters the bundle when the user actually
// clicks export. Saves ~140 KB gzipped on the cold-load critical path.

// ─── Types ───────────────────────────────────────────────────────
interface CreatorSummary {
  creatorId: string;
  name: string;
  instagramHandle: string | null;
  profilePhotoUrl: string | null;
  platform: string;
  category: string | null;
  total: number;
  net: number;
  subs: number;
  newSubs: number;
  recurringSubs: number;
  tips: number;
  messages: number;
  activeFans: number;
  newFans: number;
  daysWithData: number;
  lastDate: string;
  avgPerDay: number;
  avgPerFan: number;
}

type SortKey = "name" | "total" | "net" | "subs" | "newSubs" | "recurringSubs" | "tips" | "messages" | "activeFans" | "newFans" | "daysWithData" | "lastDate" | "avgPerDay" | "avgPerFan";
type SortDir = "asc" | "desc";

// Capitaliza la 1ª letra (labels de mes).
const cap = (s: string) => s.replace(/^\w/, (c) => c.toUpperCase());

// Presets de rango rápido — mismos pills que Panel de Control.
type RangePreset = "yesterday" | "today" | "this_week" | "this_month";
const PRESET_CONFIG: Array<{ key: RangePreset; label: string }> = [
  { key: "yesterday", label: "Ayer" },
  { key: "today", label: "Hoy" },
  { key: "this_week", label: "Esta semana" },
  { key: "this_month", label: "Este mes" },
];
function rangeForPreset(preset: RangePreset, ref: Date): { from: Date; to: Date } {
  const today = startOfDay(ref);
  switch (preset) {
    case "yesterday": { const y = subDays(today, 1); return { from: y, to: endOfDay(y) }; }
    case "this_week": return { from: startOfWeek(today, { weekStartsOn: 1 }), to: endOfWeek(today, { weekStartsOn: 1 }) };
    case "this_month": return { from: startOfMonth(today), to: endOfMonth(today) };
    case "today":
    default: return { from: today, to: endOfDay(today) };
  }
}

const PIE_COLORS = ["hsl(221,83%,53%)","hsl(142,71%,45%)","hsl(25,95%,53%)","hsl(280,67%,55%)","hsl(350,80%,55%)","hsl(190,80%,45%)","hsl(45,93%,47%)","hsl(160,60%,45%)","hsl(320,70%,50%)","hsl(200,70%,50%)","hsl(100,60%,45%)","hsl(0,70%,55%)","hsl(260,50%,55%)","hsl(30,80%,50%)","hsl(170,70%,40%)","hsl(220,50%,60%)","hsl(60,70%,50%)","hsl(310,60%,55%)","hsl(140,50%,50%)","hsl(10,70%,50%)"];

// ─── Component ───────────────────────────────────────────────────
const Dashboard2 = () => {
  const navigate = useNavigate();
  const { isAdmin } = useUserRole();
  // La data de ingresos ya NO se baja cruda (13k+ filas, 14 requests, sin caché): se
  // agrega SERVER-SIDE por el RPC get_dashboard2_creator_summary. Las llamadas (período
  // seleccionado / anterior / mes en curso) viven más abajo, tras definir los períodos.
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [ddSort, setDdSort] = useState<Record<string, { key: string; dir: "asc" | "desc" }>>({
    mom: { key: "delta", dir: "desc" },
    compare: { key: "total", dir: "desc" },
    scalability: { key: "total", dir: "desc" },
    channels: { key: "total", dir: "desc" },
  });
  const ddToggleSort = (tab: string, key: string) => {
    setDdSort(prev => {
      const cur = prev[tab] ?? { key: "total", dir: "desc" };
      if (cur.key === key) return { ...prev, [tab]: { key, dir: cur.dir === "desc" ? "asc" : "desc" } };
      return { ...prev, [tab]: { key, dir: "desc" } };
    });
  };
  const ddSortedList = <T extends Record<string, any>>(tab: string, list: T[]): T[] => {
    const s = ddSort[tab] ?? { key: "total", dir: "desc" };
    return [...list].sort((a, b) => {
      const av = a[s.key] ?? 0, bv = b[s.key] ?? 0;
      if (typeof av === "string" && typeof bv === "string") return s.dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return s.dir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  };
  const ddHead = (tab: string, key: string, label: string, align = "text-right") => (
    <TableHead
      className={`${align} cursor-pointer select-none hover:text-foreground transition-colors`}
      onClick={() => ddToggleSort(tab, key)}
    >
      <span className="inline-flex items-center gap-1">
        {label}{ddSort[tab]?.key === key ? (ddSort[tab].dir === "desc" ? " ↓" : " ↑") : ""}
      </span>
    </TableHead>
  );
  const [searchText, setSearchText] = useState("");
  const [showZeros, setShowZeros] = useState(false);
  const [minTotal, setMinTotal] = useState("");
  const [maxTotal, setMaxTotal] = useState("");
  // Estados del Resumen — el highlight de top80% en la tabla solo se
  // aplica cuando el user está en la tab "pareto" (era el viejo
  // showPareto que controlaba un modal).
  const [alertTab, setAlertTab] = useState<"zero" | "drop" | "fanLoss" | null>(null);
  const [paretoView, setParetoView] = useState<"list" | "chart">("list");
  const [paretoGroup, setParetoGroup] = useState<"80" | "20">("80");

  // Subtabs del dashboard. Cada tab renderiza su contenido inline (no
  // como overlay/dialog) — mismo patrón que Panel de Control y Scouter
  // Assist. Resumen = KPIs + insights, Creator Reports = filter + tabla
  // de creadoras, los otros = secciones de análisis.
  type DashTab =
    | "resumen"
    | "creator-reports"
    | "metrics"
    | "pareto"
    | "alerts"
    | "projection"
    | "deepdive";
  const [dashTab, setDashTab] = useState<DashTab>("resumen");

  // Popup que muestra una lista de creadoras ordenada por una métrica
  // específica. Triggered por click en las KPI cards (Revenue Bruto,
  // Creadoras, etc). null = cerrado.
  // Lo guardamos en URL (?kpi=revenue) en vez de useState para que al
  // navegar a un perfil de creadora y dar back, el browser restore el
  // popup donde el user estaba.
  type KpiList = "revenue" | "creators" | null;
  const [searchParams, setSearchParams] = useSearchParams();
  const kpiListOpen = (searchParams.get("kpi") as KpiList) ?? null;
  // Estado de colapsado del KPI list popup — mismo patrón que panel
  // de control: por defecto solo la categoría top (Elite > A+ > ...)
  // expandida, el resto colapsadas.
  const [kpiCollapsed, setKpiCollapsed] = useState<Set<string>>(new Set());
  const setKpiListOpen = (next: KpiList) => {
    setSearchParams((prev) => {
      const np = new URLSearchParams(prev);
      if (next) np.set("kpi", next);
      else np.delete("kpi");
      return np;
    });
    // Reset el collapsed state al cerrar o cambiar de KPI, así la
    // próxima apertura vuelve al default (top expandido, resto colapsado).
    setKpiCollapsed(new Set());
  };

  // Dialog de ficha técnica de una creadora — se abre desde los
  // cajones de Pareto y de Creator Reports. Muestra foto, todas las
  // métricas + botón para abrir IG.
  const [creatorDetail, setCreatorDetail] = useState<CreatorSummary | null>(null);
  // Detalle de proyección — popup focalizado solo en las 4 métricas
  // que pidió el user (Acumulado, $/Día, Días, Proyectado) + foto + IG.
  type ProjectionItem = { creatorId: string; name: string; ig: string | null; photo: string | null; total: number; days: number; projected: number; dailyAvg: number };
  const [projectionDetail, setProjectionDetail] = useState<ProjectionItem | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Upload del avatar de la creadora — bucket público `creator-files`.
  // Path convención: avatars/{creator_id}/profile-{ts}.{ext} para que
  // cada upload genere una URL nueva y se vea el cambio inmediato (no
  // hay cache busting con la misma path porque el CDN cachea).
  const handlePhotoUpload = async (file: File) => {
    if (!creatorDetail) return;
    if (!file.type.startsWith("image/")) {
      toast.error("El archivo debe ser una imagen");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("La imagen no debe superar 5 MB");
      return;
    }
    setPhotoUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `avatars/${creatorDetail.creatorId}/profile-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("creator-files").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("creator-files").getPublicUrl(path);
      const newUrl = pub?.publicUrl;
      if (!newUrl) throw new Error("No se pudo obtener la URL pública");
      const { error: dbErr } = await supabase
        .from("creators")
        .update({ profile_photo_url: newUrl })
        .eq("id", creatorDetail.creatorId);
      if (dbErr) throw dbErr;
      // Sync local state así el avatar del popup se actualiza al toque.
      setCreatorDetail({ ...creatorDetail, profilePhotoUrl: newUrl });
      // Invalidar caches para que el dashboard refresque.
      await queryClient.invalidateQueries({ queryKey: ["creator-info-dashboard2"] });
      toast.success("Foto actualizada");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error al subir foto";
      toast.error(msg);
    } finally {
      setPhotoUploading(false);
    }
  };
  const [deepDiveTab, setDeepDiveTab] = useState<"mom" | "compare" | "scalability" | "alerts" | "channels" | "opportunities" | "ballenas" | "retencion" | "chatter" | "ltv" | "content_roi" | "cohort">("mom");
  // Ballenas / Retención: solo se jalan cuando el usuario abre el tab respectivo.
  const { data: topFans = [], isLoading: topFansLoading } = useTopFans(deepDiveTab === "ballenas" || deepDiveTab === "ltv");
  const { data: retentionRows = [], isLoading: retLoading } = useFanRetention(deepDiveTab === "retencion");
  const { data: chatters = [], isLoading: chattersLoading } = useChatters(deepDiveTab === "chatter");

  // Filtro por RANGO de fechas (mismo DateRangePicker + pills que Panel de Control), en
  // vez del dropdown de meses. Default: el mes en curso.
  const [range, setRange] = useState<{ from: Date | undefined; to: Date | undefined }>(
    () => rangeForPreset("this_month", new Date()),
  );
  const [activePreset, setActivePreset] = useState<RangePreset | null>("this_month");

  const selectedPeriod = useMemo(() => {
    const f = range.from, t = range.to;
    if (!f || !t) {
      // "Todo" → todo el histórico hasta hoy.
      return { startStr: "2000-01-01", endStr: format(new Date(), "yyyy-MM-dd"), label: "Todo el histórico", value: "all" };
    }
    const startStr = format(f, "yyyy-MM-dd");
    const endStr = format(t, "yyyy-MM-dd");
    const sameMonth = f.getFullYear() === t.getFullYear() && f.getMonth() === t.getMonth();
    const isFullMonth = sameMonth && f.getDate() === 1 && t.getDate() === endOfMonth(f).getDate();
    const label = isFullMonth
      ? cap(format(f, "MMMM yyyy", { locale: es }))
      : `${format(f, "d MMM", { locale: es })} – ${format(t, "d MMM yyyy", { locale: es })}`;
    return { startStr, endStr, label, value: `${startStr}_${endStr}` };
  }, [range]);

  // Resumen por creadora del período seleccionado (agregado server-side, 1 request,
  // cacheado). Reemplaza el `allRows` crudo. isLoading/isError/refetch del dashboard
  // cuelgan de acá (es la data principal que alimenta rawCreators → KPIs/pareto/lista).
  const { data: selSummary = [], isLoading, isError, refetch } = useDashboard2Summary(
    selectedPeriod.startStr,
    selectedPeriod.endStr,
  );

  // Content ROI (Promolog × ingreso): depende de selectedPeriod, así que DEBE ir
  // después de su declaración. Estaba antes → ReferenceError TDZ "Cannot access
  // 'selectedPeriod' before initialization" que tiraba /dashboard2 en blanco.
  const { data: promoDays, isLoading: promoLoading } = usePromoDays(selectedPeriod?.startStr ?? "", selectedPeriod?.endStr ?? "", deepDiveTab === "content_roi");
  const { data: cohortData, isLoading: cohortLoading } = useCohortRetention(selectedPeriod?.startStr ?? "", selectedPeriod?.endStr ?? "", deepDiveTab === "cohort");
  // Filas diarias SOLO para Content ROI (lazy + acotado al período): necesita granularidad
  // por-día para cruzar con días de promo. El resto del dashboard usa el resumen agregado.
  const { data: contentRoiDaily = [] } = useDashboard2Daily(selectedPeriod.startStr, selectedPeriod.endStr, deepDiveTab === "content_roi");

  // LTV estimado (interim): ARPU mensual × vida media. ARPU = ingreso del período /
  // fans activos prom / meses; vida media = subscription_length_days prom (top fans) / 30.
  // Estimación sobre toda la base (el LTV medido por fan llega con la ingesta B1).
  const ltvData = useMemo<LtvData | null>(() => {
    if (deepDiveTab !== "ltv") return null;
    const subDays = topFans.map((f) => f.subscription_length_days).filter((d): d is number => d != null && d > 0);
    const avgLifespanMonths = subDays.length ? subDays.reduce((a, b) => a + b, 0) / subDays.length / 30 : null;
    const startMs = new Date(selectedPeriod.startStr + "T00:00:00Z").getTime();
    const endMs = new Date(selectedPeriod.endStr + "T00:00:00Z").getTime();
    const months = Math.max(1, Math.round((endMs - startMs) / 86400000) + 1) / 30;
    // selSummary ya viene agregado por creadora y filtrado al período (server-side):
    // gross = total, y activeFans = promedio de active_fans sobre los días con fans (af_sum/af_days).
    const perCreator: LtvCreator[] = [];
    let aggGross = 0, aggActive = 0;
    for (const r of selSummary) {
      if (!r.creator_id) continue;
      const activeFans = r.af_days > 0 ? r.af_sum / r.af_days : 0;
      if (activeFans <= 0) continue;
      const arpuMonthly = r.total / activeFans / months;
      const ltv = avgLifespanMonths != null ? arpuMonthly * avgLifespanMonths : 0;
      perCreator.push({ creator_id: r.creator_id, name: r.artistic_name || r.blu_creator_name || "Sin nombre", activeFans, arpuMonthly, ltv, gross: r.total });
      aggGross += r.total;
      aggActive += activeFans;
    }
    perCreator.sort((a, b) => b.ltv - a.ltv);
    const aggArpuMonthly = aggActive > 0 ? aggGross / aggActive / months : null;
    const aggLtv = aggArpuMonthly != null && avgLifespanMonths != null ? aggArpuMonthly * avgLifespanMonths : null;
    return { avgLifespanMonths, aggArpuMonthly, aggLtv, totalActiveFans: Math.round(aggActive), perCreator };
  }, [deepDiveTab, selSummary, selectedPeriod, topFans]);

  // Período anterior (= mismo largo, justo antes del rango) para los deltas MoM.
  const prevPeriod = useMemo(() => {
    const f = range.from, t = range.to;
    if (!f || !t) return null;
    const lenDays = differenceInCalendarDays(t, f);
    const prevTo = subDays(f, 1);
    const prevFrom = subDays(prevTo, lenDays);
    return { startStr: format(prevFrom, "yyyy-MM-dd"), endStr: format(prevTo, "yyyy-MM-dd") };
  }, [range]);

  // Resumen del período ANTERIOR (deltas MoM) y del MES EN CURSO (proyección), también
  // agregados server-side. React Query dedupe si alguna ventana coincide con otra.
  const { data: prevSummary = [] } = useDashboard2Summary(prevPeriod?.startStr, prevPeriod?.endStr, !!prevPeriod);
  const projWindow = useMemo(() => {
    const now = new Date();
    return {
      from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`,
      to: format(now, "yyyy-MM-dd"),
      dayOfMonth: now.getDate(),
    };
  }, []);
  const { data: projSummary = [] } = useDashboard2Summary(projWindow.from, projWindow.to, projWindow.dayOfMonth > 1);

  const { data: creatorInfoMap = {} } = useQuery({
    queryKey: ["creator-info-dashboard2"],
    queryFn: async () => {
      const [{ data: biz }, { data: crs }] = await Promise.all([
        supabase.from("creator_business").select("creator_id, main_platform"),
        supabase.from("creators").select("id, instagram_handle, profile_photo_url, name, category"),
      ]);
      const map: Record<string, { platform: string; ig: string | null; photo: string | null; name: string | null; category: string | null }> = {};
      for (const r of biz ?? []) {
        if (r.creator_id) map[r.creator_id] = { platform: r.main_platform || "", ig: null, photo: null, name: null, category: null };
      }
      for (const c of crs ?? []) {
        if (map[c.id]) {
          map[c.id].ig = c.instagram_handle || null;
          map[c.id].photo = c.profile_photo_url || null;
          map[c.id].name = c.name || null;
          map[c.id].category = c.category || null;
        } else {
          map[c.id] = { platform: "", ig: c.instagram_handle || null, photo: c.profile_photo_url || null, name: c.name || null, category: c.category || null };
        }
      }
      return map;
    },
  });

  // Build creator summaries — OnlyFans only
  const rawCreators = useMemo(() => {
    // selSummary ya viene agregado por creadora (server-side) para el período. Acá solo
    // aplicamos la exclusión de plataforma (unlok/instagram, vía creatorInfoMap), el join
    // de info (foto/categoría/ig) y los derivados (net, avgPerDay, avgPerFan).
    const out: CreatorSummary[] = [];
    for (const r of selSummary) {
      const info = r.creator_id ? creatorInfoMap[r.creator_id] : null;
      const plat = info?.platform || null;
      const normPlat = (plat || "").toLowerCase();
      if (normPlat === "unlok" || normPlat === "instagram") continue;
      const total = r.total;
      const activeFans = r.max_active_fans;
      out.push({
        creatorId: r.group_key,
        name: r.artistic_name || r.blu_creator_name || "Sin nombre",
        instagramHandle: info?.ig || null,
        profilePhotoUrl: info?.photo || null,
        platform: plat || "OnlyFans",
        category: info?.category || null,
        total,
        net: total * 0.8,
        subs: r.subs,
        newSubs: r.new_sub,
        recurringSubs: r.recurring_sub,
        tips: r.tips,
        messages: r.messages,
        activeFans,
        newFans: r.new_fans,
        daysWithData: r.days_with_data,
        lastDate: r.last_date || "",
        avgPerDay: r.days_with_data > 0 ? total / r.days_with_data : 0,
        avgPerFan: activeFans > 0 ? total / activeFans : 0,
      });
    }
    return out;
  }, [selSummary, creatorInfoMap]);

  // ¿Hay data para el período? (para distinguir "sin datos" de un $0 real, y de un error de fetch)
  const hasData = rawCreators.length > 0;

  // Pareto analysis
  const paretoAnalysis = useMemo(() => {
    const sorted = [...rawCreators].filter((c) => c.total > 0).sort((a, b) => b.total - a.total);
    const total = sorted.reduce((s, c) => s + c.total, 0);
    if (total === 0) return { top: [], rest: [], topPercent: 0, topRevenue: 0, totalRevenue: 0, topCount: 0, totalCount: sorted.length };
    let cumulative = 0;
    let cutoff = 0;
    for (let i = 0; i < sorted.length; i++) {
      cumulative += sorted[i].total;
      if (cumulative >= total * 0.8) { cutoff = i + 1; break; }
    }
    if (cutoff === 0) cutoff = sorted.length;
    const top = sorted.slice(0, cutoff);
    const rest = sorted.slice(cutoff);
    const topRevenue = top.reduce((s, c) => s + c.total, 0);
    return { top, rest, topPercent: sorted.length > 0 ? (cutoff / sorted.length) * 100 : 0, topRevenue, totalRevenue: total, topCount: cutoff, totalCount: sorted.length };
  }, [rawCreators]);

  // High-level KPIs
  const hlKpis = useMemo(() => {
    const active = rawCreators.filter((c) => c.total > 0);
    const totalBruto = active.reduce((s, c) => s + c.total, 0);
    const totalTips = active.reduce((s, c) => s + c.tips, 0);
    const totalMsgs = active.reduce((s, c) => s + c.messages, 0);
    const totalSubs = active.reduce((s, c) => s + c.subs, 0);
    const totalNewSubs = active.reduce((s, c) => s + c.newSubs, 0);
    const totalRecurring = active.reduce((s, c) => s + c.recurringSubs, 0);
    const totalFansAll = active.reduce((s, c) => s + c.activeFans, 0);
    const renewalRate = totalSubs > 0 ? (totalRecurring / totalSubs) * 100 : 0;
    const tipsPct = totalBruto > 0 ? (totalTips / totalBruto) * 100 : 0;
    const msgsPct = totalBruto > 0 ? (totalMsgs / totalBruto) * 100 : 0;
    const subsPct = totalBruto > 0 ? (totalSubs / totalBruto) * 100 : 0;
    const avgPerFanGlobal = totalFansAll > 0 ? totalBruto / totalFansAll : 0;
    const avgPerCreator = active.length > 0 ? totalBruto / active.length : 0;
    const topCreator = active.length > 0 ? active.reduce((best, c) => c.total > best.total ? c : best, active[0]) : null;
    const zeroCreators = rawCreators.filter((c) => c.total === 0).length;
    const creatorsUnder1k = active.filter((c) => c.total < 1000).length;
    const creatorsOver10k = active.filter((c) => c.total >= 10000).length;
    // Growth: creators growing vs falling
    const topCreatorImpact = topCreator && totalBruto > 0 ? (topCreator.total / totalBruto) * 100 : 0;
    return { renewalRate, tipsPct, msgsPct, subsPct, avgPerFanGlobal, totalNewSubs, totalRecurring, totalTips, totalMsgs, totalSubs, totalBruto, avgPerCreator, topCreator, zeroCreators, creatorsUnder1k, creatorsOver10k, activeCount: active.length, totalFansAll, topCreatorImpact };
  }, [rawCreators]);

  // Pie data
  const pieData = useMemo(() => {
    if (paretoGroup === "80") {
      const items = paretoAnalysis.top.map((c) => ({ name: c.name, value: c.total }));
      const restTotal = paretoAnalysis.totalRevenue - paretoAnalysis.topRevenue;
      if (restTotal > 0) items.push({ name: `Resto (${paretoAnalysis.rest.length})`, value: restTotal });
      return items;
    }
    return paretoAnalysis.rest.map((c) => ({ name: c.name, value: c.total }));
  }, [paretoAnalysis, paretoGroup]);

  const pieGroupTotal = useMemo(() => pieData.reduce((s, d) => s + d.value, 0), [pieData]);

  // Previous month for comparison
  const prevMonthMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of prevSummary) {
      const info = r.creator_id ? creatorInfoMap[r.creator_id] : null;
      const normPlat = (info?.platform || "").toLowerCase();
      if (normPlat === "unlok" || normPlat === "instagram") continue;
      map.set(r.group_key, r.total);
    }
    return map;
  }, [prevSummary, creatorInfoMap]);

  // Growth vs decline counts
  const growthStats = useMemo(() => {
    let growing = 0, declining = 0, stable = 0;
    for (const c of rawCreators) {
      const prev = prevMonthMap.get(c.creatorId);
      if (!prev || prev === 0) continue;
      const change = ((c.total - prev) / prev) * 100;
      if (change > 5) growing++;
      else if (change < -5) declining++;
      else stable++;
    }
    return { growing, declining, stable };
  }, [rawCreators, prevMonthMap]);

  // Previous month total for comparison
  const prevMonthTotal = useMemo(() => {
    let total = 0;
    for (const v of prevMonthMap.values()) total += v;
    return total;
  }, [prevMonthMap]);

  const totalChangePercent = prevMonthTotal > 0 ? ((hlKpis.totalBruto - prevMonthTotal) / prevMonthTotal) * 100 : 0;

  const fmtInline = (n: number) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Alerts
  const alerts = useMemo(() => {
    const items: { type: "drop" | "zero" | "fanLoss"; creator: CreatorSummary; detail: string }[] = [];
    for (const c of rawCreators) {
      const prev = prevMonthMap.get(c.creatorId);
      if (c.total === 0 && prev && prev > 0) {
        items.push({ type: "zero", creator: c, detail: `Vendía ${fmtInline(prev)} → ahora $0` });
      } else if (prev && prev > 0 && c.total > 0) {
        const change = ((c.total - prev) / prev) * 100;
        if (change <= -30) {
          items.push({ type: "drop", creator: c, detail: `Cayó ${Math.abs(change).toFixed(0)}% (${fmtInline(prev)} → ${fmtInline(c.total)})` });
        }
      }
      if (c.activeFans > 0 && c.newFans < 0) {
        items.push({ type: "fanLoss", creator: c, detail: `Perdiendo fans: ${c.newFans} netos` });
      }
    }
    return items.sort((a, b) => {
      const order = { zero: 0, drop: 1, fanLoss: 2 };
      return order[a.type] - order[b.type];
    });
  }, [rawCreators, prevMonthMap]);

  // Projection
  const projection = useMemo(() => {
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = now.getDate();
    if (dayOfMonth <= 1) return [];
    // projSummary ya está agregado por creadora para el MES EN CURSO (server-side):
    // total + days_with_data (días con data) → proyección = promedio diario × días del mes.
    return projSummary
      .map((r) => {
        const info = r.creator_id ? creatorInfoMap[r.creator_id] : null;
        const normPlat = (info?.platform || "").toLowerCase();
        if (normPlat === "unlok" || normPlat === "instagram") return null;
        if (r.total <= 0) return null;
        const days = r.days_with_data;
        return {
          name: r.artistic_name || r.blu_creator_name || "Sin nombre",
          ig: info?.ig || null,
          photo: info?.photo || null,
          total: r.total,
          days,
          creatorId: r.group_key,
          projected: days > 0 ? (r.total / days) * daysInMonth : 0,
          dailyAvg: days > 0 ? r.total / days : 0,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .sort((a, b) => b.projected - a.projected);
  }, [projSummary, creatorInfoMap]);

  const projectionTotal = useMemo(() => projection.reduce((s, c) => s + c.projected, 0), [projection]);
  // El día 1 del mes no hay suficientes días para proyectar (la useMemo devuelve []).
  const projectionTooEarly = new Date().getDate() <= 1;

  // Filters
  const filteredCreators = useMemo(() => {
    let list = rawCreators;
    if (!showZeros) list = list.filter((c) => c.total > 0);
    if (searchText.trim()) {
      const q = searchText.toLowerCase().trim();
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }
    const minV = parseFloat(minTotal);
    if (!isNaN(minV)) list = list.filter((c) => c.total >= minV);
    const maxV = parseFloat(maxTotal);
    if (!isNaN(maxV)) list = list.filter((c) => c.total <= maxV);
    return list;
  }, [rawCreators, showZeros, searchText, minTotal, maxTotal]);

  const creators = useMemo(() => {
    const sorted = [...filteredCreators];
    sorted.sort((a, b) => {
      let av: string | number, bv: string | number;
      switch (sortKey) {
        case "name": av = a.name.toLowerCase(); bv = b.name.toLowerCase(); break;
        case "lastDate": av = a.lastDate; bv = b.lastDate; break;
        default: av = a[sortKey]; bv = b[sortKey];
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredCreators, sortKey, sortDir]);

  const grandTotal = filteredCreators.reduce((s, c) => s + c.total, 0);
  const totalFans = filteredCreators.reduce((s, c) => s + c.activeFans, 0);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir(key === "name" ? "asc" : "desc"); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return sortDir === "desc" ? <ArrowDown className="h-3 w-3 text-primary" /> : <ArrowUp className="h-3 w-3 text-primary" />;
  };

  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtShort = (n: number) => Math.abs(n) >= 1000 ? `${n < 0 ? "-" : ""}$${(Math.abs(n) / 1000).toFixed(1)}k` : fmt(n);
  const fmtK = (n: number) => Math.abs(n) >= 1000 ? `${n < 0 ? "-" : ""}$${(Math.abs(n) / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`;

  const dataStoppedEarly = (lastDate: string) => {
    const day = parseInt(lastDate.split("-")[2], 10);
    return day < 20;
  };

  const exportPdf = async () => {
    if (!selectedPeriod) return;
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    doc.setFontSize(16);
    doc.text(`Ventas OnlyFans - ${selectedPeriod.label}`, 14, 15);
    doc.setFontSize(9);
    doc.text(`Periodo: ${selectedPeriod.startStr} a ${selectedPeriod.endStr} | Generado: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 21);
    doc.setFontSize(10);
    const activeCount = creators.filter(c => c.total > 0).length;
    doc.text(`Total Bruto: ${fmt(grandTotal)}  |  Neto (80%): ${fmt(grandTotal * 0.8)}  |  Creadoras: ${activeCount}  |  Retencion: ${hlKpis.renewalRate.toFixed(1)}%`, 14, 28);
    const tHead = [["#", "Creadora", "Instagram", "Bruto", "Neto 80%", "Subs", "Nuevas", "Recur.", "Tips", "Msgs", "Fans", "New", "$/Dia", "$/Fan", "Dias", "Ultima"]];
    const tBody = creators.map((c, i) => [
      String(i + 1), c.name, c.instagramHandle ? "@" + c.instagramHandle.replace(/^@/, "") : "-",
      fmt(c.total), fmt(c.net), fmtShort(c.subs), fmtShort(c.newSubs), fmtShort(c.recurringSubs),
      fmtShort(c.tips), fmtShort(c.messages), String(c.activeFans), String(c.newFans),
      fmtShort(c.avgPerDay), fmtShort(c.avgPerFan), String(c.daysWithData),
      format(new Date(c.lastDate + "T12:00:00"), "dd MMM", { locale: es }),
    ]);
    autoTable(doc, { startY: 33, head: tHead, body: tBody, styles: { fontSize: 7, cellPadding: 1.5 }, headStyles: { fillColor: [30, 64, 175], textColor: 255, fontSize: 7 }, alternateRowStyles: { fillColor: [245, 245, 250] }, margin: { left: 8, right: 8 } });
    doc.addPage();
    doc.setFontSize(14);
    doc.text("Analisis 80/20 (Pareto)", 14, 15);
    doc.setFontSize(9);
    const topPct = paretoAnalysis.totalRevenue > 0 ? ((paretoAnalysis.topRevenue / paretoAnalysis.totalRevenue) * 100).toFixed(1) : "0";
    doc.text(`Top ${paretoAnalysis.topCount} = ${fmt(paretoAnalysis.topRevenue)} (${topPct}%)  |  Resto ${paretoAnalysis.rest.length} = ${fmt(paretoAnalysis.totalRevenue - paretoAnalysis.topRevenue)}`, 14, 22);
    const pH = [["#", "Creadora", "Instagram", "Bruto", "% Top", "% Total"]];
    const pB = paretoAnalysis.top.map((c, i) => [
      String(i + 1), c.name, c.instagramHandle ? "@" + c.instagramHandle.replace(/^@/, "") : "-",
      fmt(c.total),
      (paretoAnalysis.topRevenue > 0 ? (c.total / paretoAnalysis.topRevenue * 100).toFixed(1) : "0") + "%",
      (paretoAnalysis.totalRevenue > 0 ? (c.total / paretoAnalysis.totalRevenue * 100).toFixed(1) : "0") + "%",
    ]);
    autoTable(doc, { startY: 27, head: pH, body: pB, styles: { fontSize: 8, cellPadding: 2 }, headStyles: { fillColor: [30, 64, 175], textColor: 255 }, alternateRowStyles: { fillColor: [245, 245, 250] }, margin: { left: 14, right: 14 } });
    doc.save(`Ventas_OnlyFans_${selectedPeriod.value}.pdf`);
  };

  const SortableHead = ({ col, label, right }: { col: SortKey; label: string; right?: boolean }) => (
    <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort(col)}>
      <span className={`flex items-center gap-1 ${right ? "justify-end" : ""}`}>{label} <SortIcon col={col} /></span>
    </TableHead>
  );

  const CreatorRow = ({ c, i }: { c: CreatorSummary; i: number }) => {
    const stopped = dataStoppedEarly(c.lastDate);
    const isZero = c.total === 0;
    const isTop = paretoAnalysis.top.some((t) => t.creatorId === c.creatorId);
    return (
      <TableRow key={c.creatorId} className={`${isZero ? "opacity-50" : ""} ${dashTab === "pareto" && isTop ? "bg-primary/5" : ""}`}>
        <TableCell className="text-muted-foreground tabular-nums text-xs">{i + 1}</TableCell>
        <TableCell className="whitespace-nowrap">
          <div className="flex items-center gap-1.5">
            {dashTab === "pareto" && isTop && <span className="inline-block h-2 w-2 rounded-full bg-primary shrink-0" title="Top 80/20" />}
            {c.instagramHandle && (
              <a href={`https://instagram.com/${c.instagramHandle.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-pink-500 transition-colors shrink-0" onClick={(e) => e.stopPropagation()}>
                <Instagram className="h-3.5 w-3.5" />
              </a>
            )}
            <button className="font-medium text-foreground hover:text-primary hover:underline underline-offset-2 transition-colors text-left" onClick={() => navigate(`/creadores/${c.creatorId}`)}>
              {c.name}
            </button>
          </div>
        </TableCell>
        <TableCell className={`text-right tabular-nums font-semibold ${isZero ? "text-muted-foreground" : ""}`}>{fmt(c.total)}</TableCell>
        <TableCell className={`text-right tabular-nums font-semibold ${isZero ? "text-muted-foreground" : "text-success"}`}>{fmt(c.net)}</TableCell>
        {(() => {
          const prev = prevMonthMap.get(c.creatorId);
          if (!prev || prev === 0) return <TableCell className="text-right tabular-nums text-xs text-muted-foreground">—</TableCell>;
          const change = ((c.total - prev) / prev) * 100;
          const color = change > 0 ? "text-success" : change < -10 ? "text-destructive" : "text-muted-foreground";
          return <TableCell className={`text-right tabular-nums text-xs font-medium ${color}`}>{change > 0 ? "↑" : "↓"} {Math.abs(change).toFixed(0)}%</TableCell>;
        })()}
        <TableCell className="text-right tabular-nums text-sm">{fmtShort(c.subs)}</TableCell>
        <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{fmtShort(c.newSubs)}</TableCell>
        <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{fmtShort(c.recurringSubs)}</TableCell>
        <TableCell className="text-right tabular-nums text-sm">{fmtShort(c.tips)}</TableCell>
        <TableCell className="text-right tabular-nums text-sm">{fmtShort(c.messages)}</TableCell>
        <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{c.activeFans.toLocaleString()}</TableCell>
        <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{c.newFans.toLocaleString()}</TableCell>
        <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{fmtShort(c.avgPerDay)}</TableCell>
        <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{fmtShort(c.avgPerFan)}</TableCell>
        <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{c.daysWithData}</TableCell>
        <TableCell className={`text-sm tabular-nums whitespace-nowrap ${stopped ? "font-medium" : "text-muted-foreground"}`} style={stopped ? { color: "hsl(25, 95%, 53%)" } : undefined}>
          {format(new Date(c.lastDate + "T12:00:00"), "dd MMM", { locale: es })}
          {stopped && " ⚠"}
        </TableCell>
      </TableRow>
    );
  };

  // ─── Render ────────────────────────────────────────────────────
  return (
          <main className="flex-1 overflow-auto">
            {/* ══════ COMPACT HEADER ══════ */}
            <div className="sticky top-0 z-20 bg-background/30 backdrop-blur-xl border-b border-white/10 px-6 py-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold text-foreground tracking-tight">
                    Ventas OF
                  </h1>
                  <TooltipProvider delayDuration={200}>
                    <UITooltip>
                      <TooltipTrigger asChild>
                        <span className="text-[10px] text-muted-foreground cursor-help">
                          <Info className="h-3.5 w-3.5 inline" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs text-xs">
                        <strong>Bruto</strong> = lo que reporta OF (100%). <strong>Neto</strong> = agencia (80%).
                        Fuente: <code className="bg-muted px-1 rounded font-mono text-[10px]">creator_daily_earnings</code> (BLU, en vivo, incl. fan-reports). Ranking de OF no disponible desde BLU.
                      </TooltipContent>
                    </UITooltip>
                  </TooltipProvider>
                </div>
                {/* Calendario arriba a la derecha + pills de presets al costado — igual que Panel de Control. */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="inline-flex items-center rounded-lg border border-border bg-card/40 p-0.5">
                    {PRESET_CONFIG.map((p) => {
                      const isActive = activePreset === p.key;
                      return (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => {
                            setRange(rangeForPreset(p.key, new Date()));
                            setActivePreset(p.key);
                          }}
                          className={cn(
                            "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                            isActive
                              ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                          )}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                  <DateRangePicker
                    from={range.from}
                    to={range.to}
                    onApply={(from, to) => { setRange({ from, to }); setActivePreset(null); }}
                    placeholder="Seleccionar rango"
                  />
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 text-xs px-3"
                      onClick={exportPdf}
                      disabled={isLoading || creators.length === 0}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Exportar PDF
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Subtabs — el dashboard principal sigue siempre visible
                  arriba; al pickear una tab distinta de "Resumen" se
                  abre el modal/panel correspondiente. Replica el patrón
                  de Panel de Control (Reclutamiento modelos / chatters). */}
              <Tabs value={dashTab} onValueChange={(v) => setDashTab(v as DashTab)}>
                <TabsList className="flex-wrap h-auto">
                  <TabsTrigger value="resumen">Resumen</TabsTrigger>
                  <TabsTrigger value="creator-reports" className="gap-1.5">
                    <Users className="h-3.5 w-3.5" /> Creator Reports
                  </TabsTrigger>
                  <TabsTrigger value="metrics" className="gap-1.5">
                    <BarChart3 className="h-3.5 w-3.5" /> Métricas detalladas
                  </TabsTrigger>
                  <TabsTrigger value="pareto" className="gap-1.5">
                    <PieChart className="h-3.5 w-3.5" /> Análisis 80/20
                  </TabsTrigger>
                  <TabsTrigger value="alerts" className="gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" /> Red Flags
                    {alerts.length > 0 && (
                      <span className="ml-1 px-1.5 rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                        {alerts.length}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="projection" className="gap-1.5">
                    <Target className="h-3.5 w-3.5" /> Proyección del mes
                  </TabsTrigger>
                  <TabsTrigger value="deepdive" className="gap-1.5">
                    <Telescope className="h-3.5 w-3.5" /> Más análisis
                  </TabsTrigger>
                </TabsList>

                {/* Resumen — KPI strip rediseñado + insights estratégicos */}
                <TabsContent value="resumen" className="mt-4 space-y-5">

              {/* ══════ EXECUTIVE KPI STRIP — 2 rows redesign ══════ */}
              {/* Row 1: 4 stat cards (Revenue Bruto + Creadoras
                  clickeables, ARPC + $/Fan derivados).
                  Row 2: Retención (1/3) + Revenue Mix (2/3) — Mix tiene
                  bar chart con 3 legends, antes quedaba apretado al
                  competir con 5 stats en una sola fila. */}
              {/* Estado de error/sin-datos: NO mostrar KPIs en $0 cuando la consulta falló o el período está vacío. */}
              {!isLoading && (isError || !hasData) && (
                <div className="rounded-lg border border-border bg-card text-center py-12 px-6 text-sm">
                  {isError ? (
                    <div className="space-y-2">
                      <p className="font-medium text-destructive">No se pudieron cargar los ingresos</p>
                      <p className="text-xs text-muted-foreground">La consulta a BLU falló — no es que las ventas sean $0.</p>
                      <Button variant="outline" size="sm" onClick={() => refetch()}>Reintentar</Button>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">Sin datos para {selectedPeriod?.label}</p>
                  )}
                </div>
              )}
              {!isLoading && !isError && hasData && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Revenue Bruto — clickable */}
                  <button
                    type="button"
                    onClick={() => {/* Retención no tiene popup todavía */}}
                    disabled
                    className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 text-left disabled:cursor-default"
                  >
                    <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full blur-3xl opacity-25 bg-cyan-500" />
                    <div className="relative space-y-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500">
                        <Repeat className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-foreground/80 font-semibold">Retención</p>
                        <p className="text-3xl font-bold tabular-nums leading-tight">{hlKpis.renewalRate.toFixed(1)}%</p>
                        <p className="text-[10px] text-muted-foreground mt-1">Tasa de renovación</p>
                      </div>
                    </div>
                  </button>

                  {/* Creadoras — clickable */}
                  <button
                    type="button"
                    onClick={() => setKpiListOpen("creators")}
                    className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 text-left transition-all duration-200 ease-out hover:scale-[1.025] hover:border-primary/40 hover:shadow-[0_0_24px_-4px_rgba(255,255,255,0.15)] active:scale-[0.99]"
                  >
                    <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full blur-3xl opacity-25 bg-blue-500 transition-opacity group-hover:opacity-50" />
                    <div className="relative space-y-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500">
                        <Users className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-foreground/80 font-semibold">Creadoras</p>
                        <p className="text-3xl font-bold tabular-nums leading-tight">{hlKpis.activeCount}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {hlKpis.zeroCreators} inactivas
                          {hlKpis.zeroCreators > 0 && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-destructive/60 align-middle" />}
                        </p>
                      </div>
                    </div>
                  </button>

                  {/* ARPC — derived metric, no popup */}
                  <div className="rounded-xl border border-border bg-card p-4 relative overflow-hidden">
                    <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full blur-3xl opacity-25 bg-violet-500" />
                    <div className="relative space-y-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500">
                        <TrendingUp className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-foreground/80 font-semibold">ARPC</p>
                        <p className="text-3xl font-bold tabular-nums leading-tight">{fmtK(hlKpis.avgPerCreator)}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">Avg Revenue / Creator</p>
                      </div>
                    </div>
                  </div>

                  {/* $/Fan — derived metric */}
                  <div className="rounded-xl border border-border bg-card p-4 relative overflow-hidden">
                    <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full blur-3xl opacity-25 bg-rose-500" />
                    <div className="relative space-y-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-500">
                        <Heart className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-foreground/80 font-semibold">$/Fan</p>
                        <p className="text-3xl font-bold tabular-nums leading-tight">{hlKpis.totalFansAll > 0 ? `$${hlKpis.avgPerFanGlobal.toFixed(2)}` : "—"}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">{hlKpis.totalFansAll > 0 ? `${hlKpis.totalFansAll.toLocaleString()} fans` : "Sincronizando fans…"}</p>
                      </div>
                    </div>
                  </div>

                </div>
              )}

              {/* Row 2: Revenue Bruto (1/3) + Distribución de la
                  Monetización (2/3). Sin items-start — Revenue Bruto
                  ahora usa flex internamente para llenar la altura sin
                  dejar espacio negro al fondo cuando se estira para
                  emparejar la card más alta. */}
              {!isLoading && !isError && hasData && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  {/* Revenue Bruto — hero card grande, ahora en Row 2
                      donde antes vivía Retención. Más espacio + número
                      más grande para que tenga el peso visual de hero. */}
                  <button
                    type="button"
                    onClick={() => setKpiListOpen("revenue")}
                    className="group relative overflow-hidden rounded-xl border-2 border-emerald-500/30 bg-card p-5 text-left transition-all duration-200 ease-out hover:scale-[1.015] hover:border-emerald-500/60 hover:shadow-[0_0_24px_-4px_rgba(16,185,129,0.4)] flex flex-col"
                  >
                    <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full blur-3xl opacity-30 bg-emerald-500 transition-opacity group-hover:opacity-50" />
                    <div className="relative flex flex-col flex-1">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-500">
                        <DollarSign className="h-6 w-6 text-white" />
                      </div>
                      {/* Bloque de número centrado en el espacio sobrante para
                          que la card iguale en altura a Eficiencia sin
                          dejar un hueco vacío abajo. */}
                      <div className="flex-1 flex flex-col justify-center mt-3">
                        <p className="text-xs uppercase tracking-wider text-foreground/80 font-semibold">Revenue Bruto</p>
                        <p className="text-5xl font-bold tabular-nums leading-tight tracking-tight">{fmtK(grandTotal)}</p>
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-3 mt-auto border-t border-border/50 text-xs">
                        <span className="text-muted-foreground">Net <span className="font-semibold text-foreground tabular-nums">{fmtK(grandTotal * 0.8)}</span></span>
                        {prevMonthTotal > 0 && (
                          <span className={`font-bold ${totalChangePercent >= 0 ? "text-success" : "text-destructive"}`}>
                            {totalChangePercent >= 0 ? "↑" : "↓"}{Math.abs(totalChangePercent).toFixed(1)}%
                          </span>
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Eficiencia de Monetización — wide card (2/3 width).
                      Reemplaza al viejo Revenue Mix; barras gruesas con
                      el % adentro y el monto al costado. */}
                  <div className="rounded-xl border border-border bg-card p-5 relative overflow-hidden lg:col-span-2">
                    <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full blur-3xl opacity-25 bg-amber-500" />
                    <div className="relative space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500 shrink-0">
                          <Zap className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          {/* Título de sección — mismo peso visual que
                              "Concentración de Revenue" / "Velocidad de
                              Crecimiento" para que no se pierda. */}
                          <p className="text-sm font-semibold text-foreground">Distribución de la Monetización</p>
                          <p className="text-[11px] text-muted-foreground">Mensajería · Propinas · Suscripciones</p>
                        </div>
                      </div>
                      <div className="space-y-2.5">
                        {[
                          { label: "Mensajería", value: hlKpis.totalMsgs, pct: hlKpis.msgsPct, color: "bg-blue-500" },
                          { label: "Propinas", value: hlKpis.totalTips, pct: hlKpis.tipsPct, color: "bg-rose-500" },
                          { label: "Suscripciones", value: hlKpis.totalSubs, pct: hlKpis.subsPct, color: "bg-emerald-500" },
                        ].map((item) => (
                          <div key={item.label} className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground w-28 shrink-0 font-medium">{item.label}</span>
                            <div className="flex-1 h-7 rounded-md bg-muted/60 overflow-hidden relative">
                              <div
                                className={`h-full ${item.color} transition-all`}
                                style={{ width: `${Math.max(item.pct, 2)}%` }}
                              />
                              {/* % adentro si la barra es ancha (blanco); si es angosta, justo a la
                                  derecha sobre el track (foreground) para que NO se corte el número. */}
                              <span
                                className={`absolute top-1/2 -translate-y-1/2 text-[11px] font-bold tabular-nums whitespace-nowrap ${item.pct >= 15 ? "text-white drop-shadow-sm" : "text-foreground/80"}`}
                                style={item.pct >= 15
                                  ? { right: `calc(${100 - Math.max(item.pct, 2)}% + 8px)` }
                                  : { left: `calc(${Math.max(item.pct, 2)}% + 6px)` }}
                              >
                                {item.pct.toFixed(1)}%
                              </span>
                            </div>
                            <span className="text-sm font-bold tabular-nums w-20 text-right">{fmtK(item.value)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-border text-[11px] text-muted-foreground">
                        <span>Nuevas subs: <span className="font-semibold text-foreground tabular-nums">{hlKpis.totalNewSubs.toLocaleString()}</span></span>
                        <span>Recurrentes: <span className="font-semibold text-foreground tabular-nums">{hlKpis.totalRecurring.toLocaleString()}</span></span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ══════ STRATEGIC INSIGHTS — 2 cards (Concentración +
                  Velocidad) ahora que Eficiencia se movió arriba al
                  KPI strip. Cada card ocupa la mitad del row. ══════ */}
              {!isLoading && !isError && hasData && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Revenue Concentration */}
                  <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Crown className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">Concentración de Revenue</p>
                        <p className="text-[11px] text-muted-foreground">Análisis Pareto</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-baseline justify-between">
                        <span className="text-2xl font-bold tabular-nums text-primary">{paretoAnalysis.topCount}</span>
                        <span className="text-xs text-muted-foreground">de {paretoAnalysis.totalCount} creadoras = 80% revenue</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${paretoAnalysis.topPercent}%` }} />
                      </div>
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Top {paretoAnalysis.topPercent.toFixed(0)}% genera {fmt(paretoAnalysis.topRevenue)}</span>
                      </div>
                    </div>
                    {hlKpis.topCreator && (
                      <div className="flex items-center gap-2 pt-1 border-t border-border">
                        <Crown className="h-3 w-3 text-amber-500" />
                        <span className="text-[11px] font-medium truncate">{hlKpis.topCreator.name}</span>
                        <span className="text-[10px] text-primary font-bold ml-auto tabular-nums">{hlKpis.topCreatorImpact.toFixed(1)}%</span>
                      </div>
                    )}
                  </div>

                  {/* Growth Velocity */}
                  <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-success/10 flex items-center justify-center">
                        <Activity className="h-4 w-4 text-success" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">Velocidad de Crecimiento</p>
                        <p className="text-[11px] text-muted-foreground">vs período anterior</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-success/10 p-2">
                        <p className="text-lg font-bold tabular-nums text-success">{growthStats.growing}</p>
                        <p className="text-[9px] text-muted-foreground">Creciendo</p>
                      </div>
                      <div className="rounded-lg bg-muted p-2">
                        <p className="text-lg font-bold tabular-nums text-muted-foreground">{growthStats.stable}</p>
                        <p className="text-[9px] text-muted-foreground">Estable</p>
                      </div>
                      <div className="rounded-lg bg-destructive/10 p-2">
                        <p className="text-lg font-bold tabular-nums text-destructive">{growthStats.declining}</p>
                        <p className="text-[9px] text-muted-foreground">Cayendo</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-1 border-t border-border">
                      <span className="text-[10px] text-muted-foreground">
                        {hlKpis.creatorsOver10k} creadoras &gt; $10k · {hlKpis.creatorsUnder1k} &lt; $1k
                      </span>
                    </div>
                  </div>

                </div>
              )}


              </TabsContent>

              {/* ══════ ALERTS / RED FLAGS TAB ══════ */}
              <TabsContent value="alerts" className="mt-4">
              {!isLoading && (() => {
                const zeros = alerts.filter((a) => a.type === "zero");
                const drops = alerts.filter((a) => a.type === "drop");
                const fanLoss = alerts.filter((a) => a.type === "fanLoss");
                const sections = [
                  { key: "zero" as const, emoji: "🔴", label: "Inactivas ($0)", desc: "Vendían el mes pasado, ahora $0", items: zeros, border: "border-destructive/40", bg: "bg-destructive/10", text: "text-destructive" },
                  { key: "drop" as const, emoji: "🟠", label: "Caída > 30%", desc: "Revenue cayó más del 30%", items: drops, border: "border-orange-400/40", bg: "bg-orange-500/10", text: "text-orange-600 dark:text-orange-400" },
                  { key: "fanLoss" as const, emoji: "🟡", label: "Perdiendo Fans", desc: "Fans netos negativos", items: fanLoss, border: "border-warning/40", bg: "bg-warning/10", text: "text-warning" },
                ];
                const activeSection = sections.find((s) => s.key === alertTab);
                const activeItems = activeSection?.items || [];

                return (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      {sections.map((s) => (
                        <button key={s.key} onClick={() => setAlertTab(alertTab === s.key ? null : s.key)}
                          className={`rounded-lg border-2 p-3 text-left transition-all ${alertTab === s.key ? `${s.border} ${s.bg} ring-2 ring-offset-1 ring-offset-background ring-primary/20` : "border-border bg-card hover:border-muted-foreground/30"}`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-base">{s.emoji}</span>
                            <span className={`text-xl font-bold tabular-nums ${s.items.length > 0 ? s.text : "text-muted-foreground"}`}>{s.items.length}</span>
                          </div>
                          <p className={`text-xs font-semibold ${s.items.length > 0 ? "text-foreground" : "text-muted-foreground"}`}>{s.label}</p>
                          {/* Creator name previews */}
                          {s.items.length > 0 && (
                            <div className="mt-1.5 space-y-0.5">
                              {s.items.slice(0, 3).map((a, idx) => (
                                <p key={idx} className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                                  <ChevronRight className="h-2.5 w-2.5 shrink-0" />
                                  {a.creator.name}
                                </p>
                              ))}
                              {s.items.length > 3 && (
                                <p className="text-[9px] text-muted-foreground/60">+{s.items.length - 3} más…</p>
                              )}
                            </div>
                          )}
                          {s.items.length === 0 && (
                            <p className="text-[9px] text-muted-foreground mt-0.5">{s.desc}</p>
                          )}
                        </button>
                      ))}
                    </div>
                    {alertTab && activeSection && (
                      <div className={`rounded-lg border-2 ${activeSection.border} ${activeSection.bg} p-4 space-y-2`}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-base">{activeSection.emoji}</span>
                          <h3 className={`text-sm font-bold ${activeSection.text}`}>{activeSection.label}</h3>
                          <span className="text-xs text-muted-foreground">— {activeItems.length} creadora{activeItems.length !== 1 ? "s" : ""}</span>
                        </div>
                        {activeItems.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-3">Sin alertas en esta categoría ✓</p>
                        ) : (
                          <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
                            {activeItems.map((a, i) => (
                              <ListRow key={i}>
                                <span className="text-xs text-muted-foreground tabular-nums w-5 shrink-0">{i + 1}</span>
                                {a.creator.instagramHandle && (
                                  <a href={`https://instagram.com/${a.creator.instagramHandle.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-pink-500 transition-colors shrink-0">
                                    <Instagram className="h-3.5 w-3.5" />
                                  </a>
                                )}
                                <button className="font-medium text-sm text-foreground hover:text-primary hover:underline underline-offset-2 transition-colors text-left min-w-[110px]" onClick={() => navigate(`/creadores/${a.creator.creatorId}`)}>
                                  {a.creator.name}
                                </button>
                                <span className="text-sm text-muted-foreground flex-1">{a.detail}</span>
                              </ListRow>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
              </TabsContent>

              {/* ══════ PROJECTION TAB ══════ */}
              <TabsContent value="projection" className="mt-4">
              {!isLoading && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Target className="h-5 w-5 text-primary" />
                      <h2 className="text-xl font-semibold text-foreground">
                        Proyección {format(new Date(), "MMMM yyyy", { locale: es }).replace(/^\w/, (c) => c.toUpperCase())}
                      </h2>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Proyección bruto</p>
                      <p className="text-2xl font-bold tabular-nums">{projectionTooEarly ? "—" : fmt(projectionTotal)}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {projectionTooEarly
                      ? "La proyección estará disponible a partir del día 2 del mes."
                      : `Basado en ${new Date().getDate() - 1} días. Fórmula: (acumulado / días) × días del mes.`}
                  </p>
                  {projectionTooEarly ? (
                    <p className="text-sm text-muted-foreground">Aún no hay suficientes días del mes para proyectar.</p>
                  ) : projection.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin datos del mes actual.</p>
                  ) : (
                    <div className="space-y-2">
                      {projection.map((c, i) => {
                        const igHandle = c.ig?.replace(/^@/, "") || "";
                        const initials = c.name.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
                        return (
                          <button
                            key={c.creatorId}
                            type="button"
                            onClick={() => setProjectionDetail(c)}
                            className="group w-full rounded-xl border border-white/10 bg-white/5 p-3 text-left transition-colors hover:bg-white/10 hover:border-primary/40"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-muted-foreground tabular-nums w-6 text-center shrink-0">{i + 1}</span>
                              <Avatar className="h-10 w-10 shrink-0">
                                {c.photo && <AvatarImage src={c.photo} alt={c.name} />}
                                <AvatarFallback className="text-xs font-semibold">{initials || "?"}</AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{c.name}</p>
                                {igHandle && (
                                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                                    <Instagram className="h-3 w-3" />
                                    @{igHandle}
                                  </p>
                                )}
                              </div>
                              <div className="hidden sm:flex items-center gap-4 text-right shrink-0">
                                <div>
                                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">$/Día</p>
                                  <p className="text-sm font-medium tabular-nums">{fmt(c.dailyAvg)}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Días</p>
                                  <p className="text-sm font-medium tabular-nums">{c.days}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Acumulado</p>
                                  <p className="text-sm font-medium tabular-nums">{fmt(c.total)}</p>
                                </div>
                              </div>
                              <div className="text-right shrink-0 min-w-[90px]">
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Proyectado</p>
                                <p className="text-base font-bold tabular-nums text-primary">{fmt(c.projected)}</p>
                              </div>
                              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              </TabsContent>

              {/* ══════ CREATOR REPORTS TAB — filters + table ══════ */}
              <TabsContent value="creator-reports" className="mt-4 space-y-3">
              {!isLoading && (
                <div className="flex flex-wrap items-center gap-2.5 text-xs">
                  <div className="relative flex-1 min-w-[160px] max-w-[220px]">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input placeholder="Buscar creadora…" value={searchText} onChange={(e) => setSearchText(e.target.value)} className="pl-8 h-8 text-xs" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Label className="text-[10px] text-muted-foreground">Mín $</Label>
                    <Input type="number" placeholder="0" value={minTotal} onChange={(e) => setMinTotal(e.target.value)} className="h-8 w-16 text-xs tabular-nums" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Label className="text-[10px] text-muted-foreground">Máx $</Label>
                    <Input type="number" placeholder="∞" value={maxTotal} onChange={(e) => setMaxTotal(e.target.value)} className="h-8 w-16 text-xs tabular-nums" />
                  </div>
                  <div className="flex items-center gap-1.5 ml-auto">
                    <Switch id="show-zeros" checked={showZeros} onCheckedChange={setShowZeros} className="scale-90" />
                    <Label htmlFor="show-zeros" className="text-[10px] text-muted-foreground cursor-pointer">$0</Label>
                    <span className="text-[10px] text-muted-foreground tabular-nums ml-2">{filteredCreators.length} creadoras</span>
                  </div>
                </div>
              )}

              {/* ══════ SORTING TOOLBAR ══════ */}
              {!isLoading && creators.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-1">Ordenar:</span>
                  {[
                    { col: "total" as SortKey, label: "Bruto" },
                    { col: "net" as SortKey, label: "Neto" },
                    { col: "subs" as SortKey, label: "Subs" },
                    { col: "tips" as SortKey, label: "Tips" },
                    { col: "messages" as SortKey, label: "Mensajería" },
                    { col: "activeFans" as SortKey, label: "Fans" },
                    { col: "name" as SortKey, label: "Nombre" },
                  ].map((opt) => (
                    <button
                      key={opt.col}
                      type="button"
                      onClick={() => {
                        if (sortKey === opt.col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                        else { setSortKey(opt.col); setSortDir("desc"); }
                      }}
                      className={`px-2.5 py-1 rounded-md text-[11px] border transition-colors ${
                        sortKey === opt.col
                          ? "bg-primary/10 border-primary/40 text-primary font-semibold"
                          : "bg-card border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                      }`}
                    >
                      {opt.label}
                      {sortKey === opt.col && (sortDir === "asc" ? " ↑" : " ↓")}
                    </button>
                  ))}
                </div>
              )}

              {/* ══════ CREATOR CARDS LIST ══════ */}
              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : creators.length === 0 ? (
                <div className="rounded-lg border border-border bg-card text-center py-12 text-muted-foreground text-sm">
                  {rawCreators.length > 0 ? "No hay resultados con los filtros actuales" : `Sin datos para ${selectedPeriod?.label}`}
                </div>
              ) : (
                <div className="space-y-2">
                  {creators.map((c, i) => {
                    const initials = c.name.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
                    return (
                      <button
                        key={c.creatorId}
                        type="button"
                        onClick={() => setCreatorDetail(c)}
                        className="w-full flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left hover:bg-muted/40 hover:border-primary/40 hover:shadow-[0_0_18px_-4px_rgba(255,255,255,0.12)] transition-all duration-150"
                      >
                        <span className="text-xs font-bold text-muted-foreground w-7 shrink-0 tabular-nums">{i + 1}</span>
                        <Avatar className="h-11 w-11 shrink-0">
                          {c.profilePhotoUrl && <AvatarImage src={c.profilePhotoUrl} alt={c.name} />}
                          <AvatarFallback className="text-xs">{initials || "?"}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-[140px] flex-1">
                          <p className="font-medium text-sm truncate">{c.name}</p>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            {c.instagramHandle && (
                              <span className="flex items-center gap-1">
                                <Instagram className="h-3 w-3" />@{c.instagramHandle.replace(/^@/, "")}
                              </span>
                            )}
                            <span>·</span>
                            <span>{c.activeFans.toLocaleString()} fans</span>
                            <span>·</span>
                            <span>{c.daysWithData}d</span>
                          </div>
                        </div>
                        <div className="hidden md:flex items-center gap-4 text-xs text-muted-foreground">
                          <div className="text-right w-20">
                            <p className="text-[10px] uppercase tracking-wider">Subs</p>
                            <p className="text-sm font-semibold tabular-nums text-foreground">{fmtK(c.subs)}</p>
                          </div>
                          <div className="text-right w-20">
                            <p className="text-[10px] uppercase tracking-wider">Tips</p>
                            <p className="text-sm font-semibold tabular-nums text-foreground">{fmtK(c.tips)}</p>
                          </div>
                          <div className="text-right w-20">
                            <p className="text-[10px] uppercase tracking-wider">Msgs</p>
                            <p className="text-sm font-semibold tabular-nums text-foreground">{fmtK(c.messages)}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0 w-[110px]">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Bruto</p>
                          <p className="text-base font-bold tabular-nums">{fmt(c.total)}</p>
                          <p className="text-[10px] tabular-nums text-success">{fmt(c.net)} <span className="text-muted-foreground">net</span></p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}
              </TabsContent>
              </Tabs>
              {/* Métricas / Análisis 80/20 / Más análisis se renderizan
                  como secciones inline debajo (antes eran Dialogs/popups
                  que tapaban la pantalla). Cada una se monta condicional
                  por el dashTab activo. */}
            </div>

            {/* ══════ KPI LIST POPUP — click en cards Revenue/Creadoras ══════ */}
            <Dialog open={kpiListOpen !== null} onOpenChange={(o) => !o && setKpiListOpen(null)}>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {kpiListOpen === "revenue" ? (
                      <>
                        <DollarSign className="h-5 w-5 text-emerald-500" />
                        Revenue por Creadora · {selectedPeriod?.label}
                      </>
                    ) : (
                      <>
                        <Users className="h-5 w-5 text-blue-500" />
                        Creadoras ({creators.length}) · {selectedPeriod?.label}
                      </>
                    )}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3 mt-2">
                  {creators.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-12">
                      Sin datos para este período.
                    </p>
                  ) : (() => {
                    // Agrupar por categoría — mismo estándar que panel
                    // de control. Default: solo la categoría top expandida.
                    const sorted = [...creators].sort((a, b) =>
                      kpiListOpen === "revenue" ? b.total - a.total : a.name.localeCompare(b.name),
                    );
                    const buckets = new Map<string, typeof sorted>();
                    for (const c of sorted) {
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
                    // Inicializar collapsed si está vacío: todas menos la
                    // primera. Usamos un computed default — el state se
                    // actualiza solo cuando el user clickea.
                    const effectiveCollapsed = kpiCollapsed.size === 0
                      ? new Set(sortedCats.slice(1))
                      : kpiCollapsed;
                    const toggleCat = (cat: string) => {
                      // Si todavía estamos con el default (size === 0),
                      // materializamos el estado actual antes de toggle.
                      const base = kpiCollapsed.size === 0
                        ? new Set(sortedCats.slice(1))
                        : new Set(kpiCollapsed);
                      if (base.has(cat)) base.delete(cat);
                      else base.add(cat);
                      setKpiCollapsed(base);
                    };
                    let globalIdx = 0;
                    return sortedCats.map((cat) => {
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
                              {rows.map((c) => {
                                globalIdx++;
                                const myIdx = globalIdx;
                                return (
                                  <ListRowButton
                                    key={c.creatorId}
                                    onClick={() => {
                                      navigate(`/creadores/${c.creatorId}`);
                                    }}
                                    className="justify-between"
                                  >
                                    <div className="min-w-0 flex-1 flex items-center gap-2">
                                      <span className="text-[10px] text-muted-foreground tabular-nums w-6 shrink-0">
                                        {myIdx}.
                                      </span>
                                      <span className="font-medium truncate">{c.name}</span>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                      <span className="text-xs font-bold tabular-nums text-emerald-500">
                                        {fmtK(c.total)}
                                      </span>
                                      <span className="text-[10px] text-muted-foreground tabular-nums w-12 text-right">
                                        {c.activeFans?.toLocaleString() ?? 0} fans
                                      </span>
                                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                                    </div>
                                  </ListRowButton>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              </DialogContent>
            </Dialog>

            {/* ══════ CREATOR DETAIL DIALOG — ficha técnica con foto ══════ */}
            <Dialog open={creatorDetail !== null} onOpenChange={(o) => !o && setCreatorDetail(null)}>
              <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                {creatorDetail && (() => {
                  const c = creatorDetail;
                  const igHandle = c.instagramHandle?.replace(/^@/, "") || "";
                  const igUrl = igHandle ? `https://instagram.com/${igHandle}` : null;
                  const initials = c.name.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
                  const stats = [
                    { label: "Bruto", value: fmt(c.total), highlight: true },
                    { label: "Neto (80%)", value: fmt(c.net), highlight: true, color: "text-success" },
                    { label: "Subs", value: fmt(c.subs) },
                    { label: "Nuevas Subs", value: fmt(c.newSubs) },
                    { label: "Recurrentes", value: fmt(c.recurringSubs) },
                    { label: "Tips", value: fmt(c.tips) },
                    { label: "Mensajería", value: fmt(c.messages) },
                    { label: "Fans activos", value: c.activeFans.toLocaleString() },
                    { label: "Fans nuevos", value: c.newFans.toLocaleString() },
                    { label: "$/Día", value: fmt(c.avgPerDay) },
                    { label: "$/Fan", value: fmt(c.avgPerFan) },
                    { label: "Días activos", value: c.daysWithData.toString() },
                  ];
                  return (
                    <>
                      <DialogHeader>
                        <div className="flex items-start gap-4">
                          <button
                            type="button"
                            onClick={() => photoInputRef.current?.click()}
                            disabled={photoUploading}
                            className="relative group/avatar shrink-0 rounded-full overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-default"
                            title="Subir foto de perfil"
                          >
                            <Avatar className="h-20 w-20">
                              {c.profilePhotoUrl && <AvatarImage src={c.profilePhotoUrl} alt={c.name} />}
                              <AvatarFallback className="text-lg font-semibold">{initials || "?"}</AvatarFallback>
                            </Avatar>
                            <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover/avatar:opacity-100 transition-opacity rounded-full">
                              {photoUploading ? (
                                <Loader2 className="h-5 w-5 text-white animate-spin" />
                              ) : (
                                <Camera className="h-5 w-5 text-white" />
                              )}
                            </div>
                            {photoUploading && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-full">
                                <Loader2 className="h-5 w-5 text-white animate-spin" />
                              </div>
                            )}
                          </button>
                          <input
                            ref={photoInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handlePhotoUpload(file);
                              if (photoInputRef.current) photoInputRef.current.value = "";
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <DialogTitle className="text-2xl mb-1 truncate">{c.name}</DialogTitle>
                            {c.instagramHandle && (
                              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                                <Instagram className="h-3.5 w-3.5" />
                                @{igHandle}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">
                              {selectedPeriod?.label} · {c.platform}
                            </p>
                          </div>
                        </div>
                      </DialogHeader>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                        {stats.map((s) => (
                          <div
                            key={s.label}
                            className={`rounded-lg border ${s.highlight ? "border-primary/30 bg-primary/5" : "border-border bg-card"} p-3`}
                          >
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{s.label}</p>
                            <p className={`text-lg font-bold tabular-nums ${s.color || ""}`}>{s.value}</p>
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
                            navigate(`/creadores/${c.creatorId}`);
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

            {/* ══════ PROJECTION DETAIL DIALOG — popup foco proyección ══════ */}
            <Dialog open={projectionDetail !== null} onOpenChange={(o) => !o && setProjectionDetail(null)}>
              <DialogContent className="max-w-lg">
                {projectionDetail && (() => {
                  const p = projectionDetail;
                  const igHandle = p.ig?.replace(/^@/, "") || "";
                  const igUrl = igHandle ? `https://instagram.com/${igHandle}` : null;
                  const initials = p.name.split(" ").map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
                  const stats = [
                    { label: "Acumulado", value: fmt(p.total) },
                    { label: "$/Día", value: fmt(p.dailyAvg) },
                    { label: "Días", value: p.days.toString() },
                    { label: "Proyectado", value: fmt(p.projected), highlight: true },
                  ];
                  return (
                    <>
                      <DialogHeader>
                        <div className="flex items-start gap-4">
                          <Avatar className="h-20 w-20 shrink-0">
                            {p.photo && <AvatarImage src={p.photo} alt={p.name} />}
                            <AvatarFallback className="text-lg font-semibold">{initials || "?"}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <DialogTitle className="text-2xl mb-1 truncate">{p.name}</DialogTitle>
                            {igHandle && (
                              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                                <Instagram className="h-3.5 w-3.5" />
                                @{igHandle}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">
                              Proyección {format(new Date(), "MMMM yyyy", { locale: es })}
                            </p>
                          </div>
                        </div>
                      </DialogHeader>

                      <div className="grid grid-cols-2 gap-2 mt-2">
                        {stats.map((s) => (
                          <div
                            key={s.label}
                            className={`rounded-lg border ${s.highlight ? "border-primary/30 bg-primary/5" : "border-border bg-card"} p-3`}
                          >
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{s.label}</p>
                            <p className={`text-xl font-bold tabular-nums ${s.highlight ? "text-primary" : ""}`}>{s.value}</p>
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
                            navigate(`/creadores/${p.creatorId}`);
                            setProjectionDetail(null);
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

            {/* ══════ METRICS — inline tab section ══════ */}
            {dashTab === "metrics" && !isLoading && !isError && hasData && (
              <div className="px-6 pb-6 -mt-1 space-y-6">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  Métricas — {selectedPeriod?.label}
                </h2>
                <div className="space-y-6">
                  {/* Retención & Fans — 4 cards estilo Panel de Control */}
                  <div>
                    <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">Retención & Fans</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { icon: <Repeat className="h-5 w-5 text-white" />, value: `${hlKpis.renewalRate.toFixed(1)}%`, label: "Retención", sub: "tasa de renovación", color: "bg-cyan-500" },
                        { icon: <DollarSign className="h-5 w-5 text-white" />, value: fmt(hlKpis.avgPerFanGlobal), label: "$/Fan", sub: "promedio por fan", color: "bg-rose-500" },
                        { icon: <Users className="h-5 w-5 text-white" />, value: hlKpis.totalNewSubs.toLocaleString(), label: "Nuevas Subs", sub: "este período", color: "bg-emerald-500" },
                        { icon: <Repeat className="h-5 w-5 text-white" />, value: hlKpis.totalRecurring.toLocaleString(), label: "Recurrentes", sub: "renovaciones", color: "bg-violet-500" },
                      ].map((item, idx) => (
                        <div key={idx} className="rounded-xl border border-border bg-card p-4 relative overflow-hidden">
                          <div className={`absolute -right-12 -top-12 h-32 w-32 rounded-full blur-3xl opacity-25 ${item.color}`} />
                          <div className="relative space-y-3">
                            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${item.color}`}>{item.icon}</div>
                            <div>
                              <p className="text-xs uppercase tracking-wider text-foreground/80 font-semibold">{item.label}</p>
                              <p className="text-3xl font-bold tabular-nums leading-tight">{item.value}</p>
                              <p className="text-[10px] text-muted-foreground mt-1">{item.sub}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {isAdmin && (
                    <div>
                      <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">CEO Insights</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {/* Top creadora — clickable, abre ficha técnica */}
                        <button
                          type="button"
                          onClick={() => hlKpis.topCreator && setCreatorDetail(hlKpis.topCreator)}
                          disabled={!hlKpis.topCreator}
                          className="group rounded-xl border-2 border-amber-500/40 bg-card p-4 relative overflow-hidden text-left transition-all duration-200 hover:scale-[1.015] hover:border-amber-500/70 hover:shadow-[0_0_24px_-4px_rgba(245,158,11,0.4)] disabled:cursor-default"
                        >
                          <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full blur-3xl opacity-30 bg-amber-500 transition-opacity group-hover:opacity-50" />
                          <div className="relative space-y-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500"><Crown className="h-5 w-5 text-white" /></div>
                            <div>
                              <p className="text-xs uppercase tracking-wider text-foreground/80 font-semibold">Top creadora</p>
                              <p className="text-sm font-bold truncate">{hlKpis.topCreator?.name || "—"}</p>
                              <p className="text-2xl font-bold tabular-nums text-amber-500 leading-tight">{hlKpis.topCreator ? fmt(hlKpis.topCreator.total) : "$0"}</p>
                            </div>
                          </div>
                        </button>

                        <div className="rounded-xl border border-border bg-card p-4 relative overflow-hidden">
                          <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full blur-3xl opacity-25 bg-blue-500" />
                          <div className="relative space-y-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500"><Target className="h-5 w-5 text-white" /></div>
                            <div>
                              <p className="text-xs uppercase tracking-wider text-foreground/80 font-semibold">Promedio</p>
                              <p className="text-3xl font-bold tabular-nums leading-tight">{fmt(hlKpis.avgPerCreator)}</p>
                              <p className="text-[10px] text-muted-foreground mt-1">{hlKpis.activeCount} activas</p>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-xl border border-destructive/40 bg-card p-4 relative overflow-hidden">
                          <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full blur-3xl opacity-30 bg-destructive" />
                          <div className="relative space-y-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive"><AlertTriangle className="h-5 w-5 text-white" /></div>
                            <div>
                              <p className="text-xs uppercase tracking-wider text-foreground/80 font-semibold">Inactivas</p>
                              <p className="text-3xl font-bold tabular-nums leading-tight">{hlKpis.zeroCreators}</p>
                              <p className="text-[10px] text-muted-foreground mt-1">$0 en ventas</p>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-xl border border-border bg-card p-4 relative overflow-hidden">
                          <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full blur-3xl opacity-25 bg-emerald-500" />
                          <div className="relative space-y-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500"><TrendingUp className="h-5 w-5 text-white" /></div>
                            <div>
                              <p className="text-xs uppercase tracking-wider text-foreground/80 font-semibold">Distribución</p>
                              <p className="text-base font-bold tabular-nums leading-tight">{hlKpis.creatorsOver10k} <span className="text-muted-foreground font-normal text-xs">{'>'} $10k</span></p>
                              <p className="text-base font-bold tabular-nums leading-tight">{hlKpis.creatorsUnder1k} <span className="text-muted-foreground font-normal text-xs">{'<'} $1k</span></p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ══════ PARETO — inline tab section ══════ */}
            {dashTab === "pareto" && !isLoading && !isError && hasData && (
              <div className="px-6 pb-6 -mt-1 space-y-6">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <PieChart className="h-5 w-5 text-primary" />
                  Análisis 80/20 — {selectedPeriod?.label}
                </h2>
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 bg-muted rounded-lg p-1">
                      <Button variant={paretoView === "list" ? "default" : "ghost"} size="sm" className="h-7 text-xs px-3" onClick={() => setParetoView("list")}>Lista</Button>
                      <Button variant={paretoView === "chart" ? "default" : "ghost"} size="sm" className="h-7 text-xs px-3" onClick={() => setParetoView("chart")}>Gráfico</Button>
                    </div>
                    <div className="flex items-center gap-2 bg-muted rounded-lg p-1">
                      <Button variant={paretoGroup === "80" ? "default" : "ghost"} size="sm" className="h-7 text-xs px-3" onClick={() => setParetoGroup("80")}>Top 20% (generan 80%)</Button>
                      <Button variant={paretoGroup === "20" ? "default" : "ghost"} size="sm" className="h-7 text-xs px-3" onClick={() => setParetoGroup("20")}>Bottom 80% (generan 20%)</Button>
                    </div>
                    <div className="ml-auto text-right">
                      <p className="text-sm font-bold tabular-nums">{paretoAnalysis.topCount} <span className="text-muted-foreground font-normal text-xs">de {paretoAnalysis.totalCount}</span></p>
                      <p className="text-[10px] text-muted-foreground">generan 80% del revenue</p>
                    </div>
                  </div>

                  {paretoView === "chart" && (
                    <div className="space-y-4">
                      <div className="flex flex-col items-center">
                        <ResponsiveContainer width="100%" height={400}>
                          <RechartsPie>
                            <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={80} outerRadius={160} paddingAngle={1} stroke="hsl(var(--border))"
                              label={({ name, percent }: { name: string; percent: number }) => percent > 0.03 ? `${name.length > 12 ? name.slice(0, 12) + '…' : name} ${(percent * 100).toFixed(0)}%` : ''}
                              labelLine={true}
                            >
                              {pieData.map((_, idx) => <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />)}
                            </Pie>
                            <Tooltip
                              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }}
                              itemStyle={{ color: "hsl(var(--foreground))" }}
                              labelStyle={{ color: "hsl(var(--foreground))" }}
                              formatter={(value: number, name: string) => [fmt(value), name]}
                            />
                          </RechartsPie>
                        </ResponsiveContainer>
                      </div>
                      {/* Legend with names */}
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1.5 px-2">
                        {pieData.map((d, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 text-xs truncate">
                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[idx % PIE_COLORS.length] }} />
                            <span className="truncate text-foreground">{d.name}</span>
                            <span className="text-muted-foreground tabular-nums ml-auto shrink-0">{fmtK(d.value)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="border-t border-border bg-muted/30 px-6 py-2.5 w-full text-center rounded-b-lg">
                        <p className="text-[10px] text-muted-foreground">
                          Montos <strong>BRUTOS</strong> · {paretoGroup === "80" ? `Top ${paretoAnalysis.topCount} creadoras generan ${fmt(paretoAnalysis.topRevenue)}` : `Bottom ${paretoAnalysis.rest.length} generan ${fmt(paretoAnalysis.totalRevenue - paretoAnalysis.topRevenue)}`} de {fmt(paretoAnalysis.totalRevenue)} total
                        </p>
                      </div>
                    </div>
                  )}

                  {paretoView === "list" && (
                    <div className="space-y-5">
                      {paretoGroup === "80" && (
                      <div>
                        <p className="text-[11px] font-semibold text-muted-foreground mb-3 uppercase tracking-widest">🔥 Top {paretoAnalysis.topCount} — BRUTO</p>
                        <div className="space-y-2">
                          {paretoAnalysis.top.map((c, i) => {
                            const pctOfTop = paretoAnalysis.topRevenue > 0 ? (c.total / paretoAnalysis.topRevenue) * 100 : 0;
                            const pctOfTotal = paretoAnalysis.totalRevenue > 0 ? (c.total / paretoAnalysis.totalRevenue) * 100 : 0;
                            const initials = c.name.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
                            return (
                              <button
                                key={c.creatorId}
                                type="button"
                                onClick={() => setCreatorDetail(c)}
                                className="w-full flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left hover:bg-muted/40 hover:border-primary/40 hover:shadow-[0_0_18px_-4px_rgba(255,255,255,0.12)] transition-all duration-150"
                              >
                                <span className="text-xs font-bold text-primary w-6 shrink-0 tabular-nums">{i + 1}</span>
                                <Avatar className="h-10 w-10 shrink-0">
                                  {c.profilePhotoUrl && <AvatarImage src={c.profilePhotoUrl} alt={c.name} />}
                                  <AvatarFallback className="text-xs">{initials || "?"}</AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium text-sm truncate">{c.name}</p>
                                  {c.instagramHandle && (
                                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                                      <Instagram className="h-3 w-3" />@{c.instagramHandle.replace(/^@/, "")}
                                    </p>
                                  )}
                                </div>
                                <div className="flex-1 mx-2">
                                  <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(pctOfTop, 100)}%` }} />
                                  </div>
                                </div>
                                <span className="text-sm font-bold tabular-nums w-[60px] text-right text-primary">{pctOfTop.toFixed(1)}%</span>
                                <span className="text-xs tabular-nums text-muted-foreground w-[50px] text-right">({pctOfTotal.toFixed(1)}%)</span>
                                <span className="text-sm font-semibold tabular-nums w-[100px] text-right">{fmt(c.total)}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      )}
                      {paretoGroup === "20" && (
                      <div>
                        <p className="text-[11px] font-semibold text-muted-foreground mb-3 uppercase tracking-widest">📉 Resto ({paretoAnalysis.rest.length})</p>
                        {paretoAnalysis.rest.length > 0 ? (
                          <div className="space-y-2">
                            {paretoAnalysis.rest.map((c, i) => {
                              const restRevenue = paretoAnalysis.totalRevenue - paretoAnalysis.topRevenue;
                              const pctOfRest = restRevenue > 0 ? (c.total / restRevenue) * 100 : 0;
                              const pctOfTotal = paretoAnalysis.totalRevenue > 0 ? (c.total / paretoAnalysis.totalRevenue) * 100 : 0;
                              const initials = c.name.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
                              return (
                                <button
                                  key={c.creatorId}
                                  type="button"
                                  onClick={() => setCreatorDetail(c)}
                                  className="w-full flex items-center gap-3 rounded-xl border border-border/50 bg-muted/15 px-4 py-2.5 text-left hover:bg-muted/35 hover:border-primary/30 hover:shadow-[0_0_18px_-4px_rgba(255,255,255,0.08)] transition-all duration-150"
                                >
                                  <span className="text-xs text-muted-foreground w-6 shrink-0 tabular-nums">{paretoAnalysis.topCount + i + 1}</span>
                                  <Avatar className="h-9 w-9 shrink-0 opacity-80">
                                    {c.profilePhotoUrl && <AvatarImage src={c.profilePhotoUrl} alt={c.name} />}
                                    <AvatarFallback className="text-xs">{initials || "?"}</AvatarFallback>
                                  </Avatar>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm text-muted-foreground truncate">{c.name}</p>
                                    {c.instagramHandle && (
                                      <p className="text-[10px] text-muted-foreground/70 flex items-center gap-1">
                                        <Instagram className="h-3 w-3" />@{c.instagramHandle.replace(/^@/, "")}
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex-1 mx-2">
                                    <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                                      <div className="h-full rounded-full bg-muted-foreground/40 transition-all" style={{ width: `${Math.min(pctOfRest, 100)}%` }} />
                                    </div>
                                  </div>
                                  <span className="text-sm font-bold tabular-nums w-[60px] text-right text-muted-foreground">{pctOfRest.toFixed(1)}%</span>
                                  <span className="text-xs tabular-nums text-muted-foreground w-[50px] text-right">({pctOfTotal.toFixed(1)}%)</span>
                                  <span className="text-sm tabular-nums text-muted-foreground w-[100px] text-right">{fmt(c.total)}</span>
                                </button>
                              );
                            })}
                          </div>
                        ) : <p className="text-sm text-muted-foreground">Ninguna.</p>}
                      </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ══════ DEEP DIVE — inline tab section ══════ */}
            {dashTab === "deepdive" && !isLoading && (
              <div className="px-6 pb-6 -mt-1 space-y-4">
                <div className="pb-3 border-b border-border">
                   <h2 className="text-lg font-semibold flex items-center gap-2">
                       <Telescope className="h-5 w-5 text-primary" />
                       Deep Dive
                       <span className="text-muted-foreground">—</span>
                       <DateRangePicker
                         from={range.from}
                         to={range.to}
                         onApply={(from, to) => { setRange({ from, to }); setActivePreset(null); }}
                         placeholder="Seleccionar rango"
                       />
                     </h2>
                  <div className="flex flex-wrap items-center gap-1 mt-3 bg-muted rounded-lg p-1">
                    {([
                      { key: "mom" as const, icon: <GitCompare className="h-3.5 w-3.5" />, label: "MoM", desc: "Mes vs Mes" },
                      { key: "ballenas" as const, icon: <Crown className="h-3.5 w-3.5" />, label: "Ballenas", desc: "Top spenders por creadora" },
                      { key: "retencion" as const, icon: <Repeat className="h-3.5 w-3.5" />, label: "Retención", desc: "Retención de fans por cohorte" },
                      { key: "chatter" as const, icon: <MessageSquare className="h-3.5 w-3.5" />, label: "Chatters", desc: "Rendimiento por chatter" },
                      { key: "content_roi" as const, icon: <Layers className="h-3.5 w-3.5" />, label: "Content ROI", desc: "Promo (Promolog) → ingreso" },
                      { key: "cohort" as const, icon: <Brain className="h-3.5 w-3.5" />, label: "Cohortes", desc: "Retención por cohorte de fans" },
                      { key: "ltv" as const, icon: <UserCheck className="h-3.5 w-3.5" />, label: "LTV", desc: "Valor de vida del fan (estimado)" },
                      { key: "compare" as const, icon: <Scale className="h-3.5 w-3.5" />, label: "Ranking", desc: "Posición por revenue" },
                      { key: "scalability" as const, icon: <Target className="h-3.5 w-3.5" />, label: "Escalabilidad", desc: "Potencial de crecimiento" },
                      { key: "channels" as const, icon: <BarChart3 className="h-3.5 w-3.5" />, label: "Canales", desc: "Msgs vs Tips vs Subs" },
                      { key: "opportunities" as const, icon: <Sparkles className="h-3.5 w-3.5" />, label: "Oportunidades", desc: "Dónde hay potencial" },
                      { key: "alerts" as const, icon: <ShieldAlert className="h-3.5 w-3.5" />, label: `Alertas (${alerts.length})`, desc: "Riesgos activos" },
                    ]).map((tab) => (
                      <UITooltip key={tab.key}>
                        <TooltipTrigger asChild>
                          <Button
                            variant={deepDiveTab === tab.key ? "default" : "ghost"}
                            size="sm"
                            className="h-7 text-xs px-2.5 gap-1 flex-1 min-w-0"
                            onClick={() => setDeepDiveTab(tab.key)}
                          >
                            {tab.icon} <span className="truncate">{tab.label}</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">{tab.desc}</TooltipContent>
                      </UITooltip>
                    ))}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-6">
                  {/* ── MoM Comparison ── */}
                  {deepDiveTab === "mom" && (() => {
                     const momBase = rawCreators
                       .filter((c) => c.total > 0 || prevMonthMap.has(c.creatorId))
                       .map((c) => {
                         const prev = prevMonthMap.get(c.creatorId) ?? 0;
                         const change = prev > 0 ? ((c.total - prev) / prev) * 100 : (c.total > 0 ? 100 : 0);
                         const delta = c.total - prev;
                         return { ...c, prev, change, delta };
                       });
                     const momCreators = ddSortedList("mom", momBase);

                     return (
                       <div className="space-y-5">
                         <div className="rounded-lg bg-muted/40 px-4 py-2.5 border border-border">
                           <p className="text-xs font-semibold text-foreground">📊 Comparativa Mes vs Mes (MoM)</p>
                           <p className="text-[10px] text-muted-foreground mt-0.5">Compara el revenue de cada creadora entre el período seleccionado y el anterior. Identifica quién creció, quién cayó y en cuánto.</p>
                         </div>
                        <div className="grid grid-cols-4 gap-3">
                          <div className="rounded-xl border border-border bg-card p-3 text-center">
                            <p className="text-[10px] text-muted-foreground uppercase">Actual</p>
                            <p className="text-lg font-bold tabular-nums">{fmtK(hlKpis.totalBruto)}</p>
                          </div>
                          <div className="rounded-xl border border-border bg-card p-3 text-center">
                            <p className="text-[10px] text-muted-foreground uppercase">Anterior</p>
                            <p className="text-lg font-bold tabular-nums">{fmtK(prevMonthTotal)}</p>
                          </div>
                          <div className="rounded-xl border border-border bg-card p-3 text-center">
                            <p className="text-[10px] text-muted-foreground uppercase">Diferencia</p>
                            <p className={`text-lg font-bold tabular-nums ${totalChangePercent >= 0 ? "text-success" : "text-destructive"}`}>
                              {totalChangePercent >= 0 ? "+" : ""}{fmtK(hlKpis.totalBruto - prevMonthTotal)}
                            </p>
                          </div>
                          <div className="rounded-xl border border-border bg-card p-3 text-center">
                            <p className="text-[10px] text-muted-foreground uppercase">Cambio %</p>
                            <p className={`text-lg font-bold tabular-nums ${totalChangePercent >= 0 ? "text-success" : "text-destructive"}`}>
                              {totalChangePercent >= 0 ? "↑" : "↓"}{Math.abs(totalChangePercent).toFixed(1)}%
                            </p>
                          </div>
                        </div>

                        {/* Creator-by-creator comparison table */}
                        <div className="rounded-lg border border-border bg-card overflow-auto max-h-[420px]">
                          <Table>
                            <TableHeader className="sticky top-0 z-10 bg-card">
                              <TableRow>
                                 <TableHead className="w-8">#</TableHead>
                                 <TableHead>Creadora</TableHead>
                                 {ddHead("mom", "total", "Mes Actual")}
                                 {ddHead("mom", "prev", "Mes Anterior")}
                                 {ddHead("mom", "delta", "Diferencia")}
                                 {ddHead("mom", "change", "Cambio %")}
                                 <TableHead className="text-center w-20">Tendencia</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {momCreators.map((c, i) => (
                                <TableRow key={c.creatorId}>
                                  <TableCell className="text-xs text-muted-foreground tabular-nums">{i + 1}</TableCell>
                                  <TableCell>
                                    <button className="font-medium text-sm text-foreground hover:text-primary hover:underline underline-offset-2 transition-colors text-left" onClick={() => navigate(`/creadores/${c.creatorId}`)}>
                                      {c.name}
                                    </button>
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums text-sm font-semibold">{fmt(c.total)}</TableCell>
                                  <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{c.prev > 0 ? fmt(c.prev) : "—"}</TableCell>
                                  <TableCell className={`text-right tabular-nums text-sm font-medium ${c.delta >= 0 ? "text-success" : "text-destructive"}`}>
                                    {c.delta >= 0 ? "+" : ""}{fmtShort(c.delta)}
                                  </TableCell>
                                  <TableCell className={`text-right tabular-nums text-sm font-medium ${c.change >= 0 ? "text-success" : "text-destructive"}`}>
                                    {c.prev > 0 ? `${c.change >= 0 ? "+" : ""}${c.change.toFixed(0)}%` : "Nueva"}
                                  </TableCell>
                                  <TableCell className="text-center">
                                    {c.change > 10 && <Badge variant="outline" className="text-[9px] h-5 border-success/40 text-success">↑ Crece</Badge>}
                                    {c.change <= 10 && c.change >= -10 && <Badge variant="outline" className="text-[9px] h-5 border-muted-foreground/30">= Estable</Badge>}
                                    {c.change < -10 && <Badge variant="outline" className="text-[9px] h-5 border-destructive/40 text-destructive">↓ Cae</Badge>}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── Creator Ranking ── */}
                  {deepDiveTab === "compare" && (() => {
                     const base = rawCreators.filter((c) => c.total > 0).map(c => {
                       const topTotal = rawCreators.filter(x => x.total > 0).reduce((s, x) => s + x.total, 0);
                       const pct = topTotal > 0 ? (c.total / topTotal) * 100 : 0;
                       const retention = c.subs > 0 ? (c.recurringSubs / c.subs) * 100 : 0;
                       return { ...c, pct, retention };
                     });
                     const ranked = ddSortedList("compare", base);
                     const topTotal = base.reduce((s, c) => s + c.total, 0);
                     return (
                       <div className="space-y-5">
                         <div className="rounded-lg bg-muted/40 px-4 py-2.5 border border-border">
                           <p className="text-xs font-semibold text-foreground">🏆 Ranking de Creadoras</p>
                           <p className="text-[10px] text-muted-foreground mt-0.5">Posición de cada creadora por revenue bruto total. Muestra su participación en el total, eficiencia ($/Día, $/Fan) y tasa de retención de suscriptores.</p>
                         </div>
                         <p className="text-xs text-muted-foreground">Ranking completo por revenue bruto. Muestra participación individual, performance relativa y posición.</p>
                         <div className="rounded-lg border border-border bg-card overflow-auto max-h-[500px]">
                           <Table>
                             <TableHeader className="sticky top-0 z-10 bg-card">
                               <TableRow>
                                 <TableHead className="w-8">#</TableHead>
                                 <TableHead>Creadora</TableHead>
                                 {ddHead("compare", "total", "Bruto")}
                                 {ddHead("compare", "pct", "% Total")}
                                 <TableHead className="w-[180px]">Participación</TableHead>
                                 {ddHead("compare", "avgPerDay", "$/Día")}
                                 {ddHead("compare", "avgPerFan", "$/Fan")}
                                 {ddHead("compare", "activeFans", "Fans")}
                                 {ddHead("compare", "retention", "Retención")}
                               </TableRow>
                             </TableHeader>
                             <TableBody>
                              {ranked.map((c, i) => {
                                return (
                                  <TableRow key={c.creatorId}>
                                    <TableCell className="text-xs text-muted-foreground tabular-nums font-bold">{i + 1}</TableCell>
                                    <TableCell>
                                      <div className="flex items-center gap-1.5">
                                        {i < 3 && <Crown className="h-3 w-3 text-amber-500 shrink-0" />}
                                        <button className="font-medium text-sm text-foreground hover:text-primary hover:underline underline-offset-2 transition-colors text-left" onClick={() => navigate(`/creadores/${c.creatorId}`)}>
                                          {c.name}
                                        </button>
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums text-sm font-semibold">{fmt(c.total)}</TableCell>
                                    <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{c.pct.toFixed(1)}%</TableCell>
                                    <TableCell>
                                       <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                                         <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(c.pct * 2, 100)}%` }} />
                                       </div>
                                     </TableCell>
                                     <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{fmtShort(c.avgPerDay)}</TableCell>
                                     <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{fmtShort(c.avgPerFan)}</TableCell>
                                     <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{c.activeFans.toLocaleString()}</TableCell>
                                     <TableCell className="text-right tabular-nums text-sm">
                                       <span className={c.retention > 50 ? "text-success" : c.retention > 30 ? "text-warning" : "text-destructive"}>
                                         {c.retention.toFixed(0)}%
                                      </span>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── Scalability ── */}
                  {deepDiveTab === "scalability" && (() => {
                     const base = rawCreators.filter((c) => c.total > 0).map(c => {
                       const target = c.total * 1.2;
                       const gap = target - c.total;
                       const progress = c.total > 0 ? (c.total / target) * 100 : 0;
                       return { ...c, target, gap, progress };
                     });
                     const active = ddSortedList("scalability", base);
                     return (
                       <div className="space-y-5">
                         <div className="rounded-lg bg-muted/40 px-4 py-2.5 border border-border">
                           <p className="text-xs font-semibold text-foreground">📈 Escalabilidad</p>
                           <p className="text-[10px] text-muted-foreground mt-0.5">¿Cuánto más podría generar cada creadora? Se calcula un target de +20% sobre su actual y se sugiere la acción más efectiva para alcanzarlo.</p>
                         </div>
                         <p className="text-xs text-muted-foreground">¿Cuánto más podría generar cada creadora? Target: +20% sobre su actual.</p>
                         <div className="rounded-lg border border-border bg-card overflow-auto max-h-[500px]">
                           <Table>
                             <TableHeader className="sticky top-0 z-10 bg-card">
                               <TableRow>
                                 <TableHead className="w-8">#</TableHead>
                                 <TableHead>Creadora</TableHead>
                                 {ddHead("scalability", "total", "Actual")}
                                 {ddHead("scalability", "target", "Target")}
                                 {ddHead("scalability", "gap", "Falta")}
                                 <TableHead className="w-[140px]">Progreso</TableHead>
                                 <TableHead className="text-center">Sugerencia</TableHead>
                               </TableRow>
                             </TableHeader>
                             <TableBody>
                              {active.map((c, i) => {
                                const action = c.avgPerFan < hlKpis.avgPerFanGlobal * 0.5
                                   ? "💰 Monetizar mejor"
                                   : c.messages / (c.total || 1) < 0.3
                                   ? "💬 Más mensajería"
                                   : c.newFans <= 0
                                   ? "📣 Adquirir fans"
                                   : "✅ Mantener";
                                 return (
                                   <TableRow key={c.creatorId}>
                                     <TableCell className="text-xs text-muted-foreground tabular-nums">{i + 1}</TableCell>
                                     <TableCell>
                                       <button className="font-medium text-sm text-foreground hover:text-primary hover:underline underline-offset-2 transition-colors text-left" onClick={() => navigate(`/creadores/${c.creatorId}`)}>
                                         {c.name}
                                       </button>
                                     </TableCell>
                                     <TableCell className="text-right tabular-nums text-sm font-semibold">{fmtShort(c.total)}</TableCell>
                                     <TableCell className="text-right tabular-nums text-sm text-primary">{fmtShort(c.target)}</TableCell>
                                     <TableCell className="text-right tabular-nums text-sm text-success">+{fmtShort(c.gap)}</TableCell>
                                    <TableCell>
                                      <div className="flex items-center gap-2">
                                        <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                                         <div className="h-full rounded-full bg-success transition-all" style={{ width: `${Math.min(c.progress, 100)}%` }} />
                                        </div>
                                         <span className="text-[10px] text-muted-foreground tabular-nums w-8">{c.progress.toFixed(0)}%</span>
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-center text-xs">{action}</TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                        {/* Summary insight */}
                        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-start gap-3">
                          <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-foreground">Insight de Escalabilidad</p>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                              Si todas las creadoras activas ({active.length}) alcanzan su target +20%, el revenue bruto mensual pasaría de {fmtK(hlKpis.totalBruto)} a <strong className="text-primary">{fmtK(hlKpis.totalBruto * 1.2)}</strong>.
                              La oportunidad más grande está en creadoras con $/Fan por debajo del promedio ({fmt(hlKpis.avgPerFanGlobal)}/fan) — mejorar su monetización genera mayor impacto.
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── Alerts Review ── */}
                  {deepDiveTab === "alerts" && (() => {
                    const zeros = alerts.filter((a) => a.type === "zero");
                    const drops = alerts.filter((a) => a.type === "drop");
                    const fanLoss = alerts.filter((a) => a.type === "fanLoss");

                    const renderSection = (title: string, emoji: string, items: typeof alerts, borderColor: string, bgColor: string) => (
                      <div className={`rounded-xl border-2 ${borderColor} ${bgColor} p-4 space-y-3`}>
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{emoji}</span>
                          <h3 className="text-sm font-bold text-foreground">{title}</h3>
                          <Badge variant="outline" className="text-[9px] h-5 ml-auto">{items.length}</Badge>
                        </div>
                        {items.length === 0 ? (
                          <div className="flex items-center gap-2 py-2">
                            <CheckCircle2 className="h-4 w-4 text-success" />
                            <p className="text-sm text-muted-foreground">Sin alertas en esta categoría</p>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {items.map((a, i) => (
                              <ListRow key={i} className="py-2.5">
                                <span className="text-xs text-muted-foreground tabular-nums w-5 shrink-0 font-bold">{i + 1}</span>
                                <button className="font-medium text-sm text-foreground hover:text-primary hover:underline underline-offset-2 transition-colors text-left min-w-[120px]" onClick={() => navigate(`/creadores/${a.creator.creatorId}`)}>
                                  {a.creator.name}
                                </button>
                                <span className="text-sm text-muted-foreground flex-1">{a.detail}</span>
                                <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                                  {a.creator.activeFans > 0 ? `${a.creator.activeFans} fans` : ""}
                                </span>
                              </ListRow>
                            ))}
                          </div>
                        )}
                      </div>
                    );

                    return (
                      <div className="space-y-4">
                        <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
                          <div className="flex-1">
                            <p className="text-xs font-semibold text-foreground">Resumen de Alertas — {selectedPeriod?.label}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {alerts.length} alertas activas: {zeros.length} inactivas, {drops.length} caídas severas, {fanLoss.length} perdiendo fans
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <div className="text-center px-3">
                              <p className="text-lg font-bold tabular-nums text-destructive">{zeros.length}</p>
                              <p className="text-[9px] text-muted-foreground">Inactivas</p>
                            </div>
                            <div className="text-center px-3">
                              <p className="text-lg font-bold tabular-nums text-orange-500">{drops.length}</p>
                              <p className="text-[9px] text-muted-foreground">Caída</p>
                            </div>
                            <div className="text-center px-3">
                              <p className="text-lg font-bold tabular-nums text-warning">{fanLoss.length}</p>
                              <p className="text-[9px] text-muted-foreground">Fan Loss</p>
                            </div>
                          </div>
                        </div>
                        {renderSection("Inactivas — Revenue $0", "🔴", zeros, "border-destructive/30", "bg-destructive/5")}
                        {renderSection("Caída severa (>30%)", "🟠", drops, "border-orange-400/30", "bg-orange-500/5")}
                        {renderSection("Pérdida de fans", "🟡", fanLoss, "border-warning/30", "bg-warning/5")}
                      </div>
                    );
                  })()}

                  {/* ── Revenue por Canal (Deep) ── */}
                  {deepDiveTab === "channels" && (() => {
                     const base = rawCreators.filter((c) => c.total > 0).map(c => {
                       const msgPct = c.total > 0 ? (c.messages / c.total) * 100 : 0;
                       const tipPct = c.total > 0 ? (c.tips / c.total) * 100 : 0;
                       const subPct = c.total > 0 ? (c.subs / c.total) * 100 : 0;
                       return { ...c, msgPct, tipPct, subPct };
                     });
                     const active = ddSortedList("channels", base);
                     return (
                       <div className="space-y-5">
                         <div className="rounded-lg bg-muted/40 px-4 py-2.5 border border-border">
                           <p className="text-xs font-semibold text-foreground">💬 Análisis por Canal de Monetización</p>
                           <p className="text-[10px] text-muted-foreground mt-0.5">Desglose de ingresos por canal (Mensajería, Tips, Suscripciones) para cada creadora. Si una creadora tiene &gt;70% en un solo canal, aparece con ⚠ indicando riesgo de dependencia.</p>
                         </div>
                         <p className="text-xs text-muted-foreground">Desglose detallado por canal de monetización para cada creadora. Identifica dependencias y oportunidades de diversificación.</p>
                         <div className="rounded-lg border border-border bg-card overflow-auto max-h-[500px]">
                           <Table>
                             <TableHeader className="sticky top-0 z-10 bg-card">
                               <TableRow>
                                 <TableHead className="w-8">#</TableHead>
                                 <TableHead>Creadora</TableHead>
                                 {ddHead("channels", "total", "Total")}
                                 {ddHead("channels", "messages", "Msgs $")}
                                 {ddHead("channels", "msgPct", "Msgs %")}
                                 {ddHead("channels", "tips", "Tips $")}
                                 {ddHead("channels", "tipPct", "Tips %")}
                                 {ddHead("channels", "subs", "Subs $")}
                                 {ddHead("channels", "subPct", "Subs %")}
                                 <TableHead className="text-center">Canal Dominante</TableHead>
                               </TableRow>
                             </TableHeader>
                             <TableBody>
                              {active.map((c, i) => {
                                const dominant = c.msgPct >= c.tipPct && c.msgPct >= c.subPct ? "💬 Msgs" : c.tipPct >= c.subPct ? "💰 Tips" : "🔄 Subs";
                                 const concentrated = Math.max(c.msgPct, c.tipPct, c.subPct) > 70;
                                return (
                                  <TableRow key={c.creatorId}>
                                    <TableCell className="text-xs text-muted-foreground tabular-nums">{i + 1}</TableCell>
                                    <TableCell>
                                      <button className="font-medium text-sm text-foreground hover:text-primary hover:underline underline-offset-2 transition-colors text-left" onClick={() => navigate(`/creadores/${c.creatorId}`)}>{c.name}</button>
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums text-sm font-semibold">{fmtShort(c.total)}</TableCell>
                                    <TableCell className="text-right tabular-nums text-sm">{fmtShort(c.messages)}</TableCell>
                                    <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{c.msgPct.toFixed(0)}%</TableCell>
                                     <TableCell className="text-right tabular-nums text-sm">{fmtShort(c.tips)}</TableCell>
                                     <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{c.tipPct.toFixed(0)}%</TableCell>
                                     <TableCell className="text-right tabular-nums text-sm">{fmtShort(c.subs)}</TableCell>
                                     <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{c.subPct.toFixed(0)}%</TableCell>
                                    <TableCell className="text-center text-xs">
                                      <span className={concentrated ? "text-warning font-semibold" : ""}>{dominant}</span>
                                      {concentrated && <span className="text-[9px] text-warning ml-1">⚠</span>}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-start gap-3">
                          <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-foreground">Insight de Diversificación</p>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                              {active.filter(c => { const max = Math.max(c.total > 0 ? (c.messages / c.total) * 100 : 0, c.total > 0 ? (c.tips / c.total) * 100 : 0, c.total > 0 ? (c.subs / c.total) * 100 : 0); return max > 70; }).length} creadoras tienen &gt;70% concentrado en un solo canal — riesgo de dependencia. Diversificar canales reduce volatilidad.
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── Top Oportunidades ── */}
                  {deepDiveTab === "opportunities" && (() => {
                    const active = rawCreators.filter((c) => c.total > 0);
                    const lowMonetization = active.filter(c => c.avgPerFan < hlKpis.avgPerFanGlobal * 0.6 && c.activeFans > 50).sort((a, b) => b.activeFans - a.activeFans).slice(0, 10);
                    const highGrowth = active.filter(c => { const prev = prevMonthMap.get(c.creatorId); return prev && prev > 0 && ((c.total - prev) / prev) > 0.2; }).sort((a, b) => b.total - a.total).slice(0, 10);
                    const underperforming = active.filter(c => c.avgPerFan > 0 && c.activeFans < 100 && c.total > 500).sort((a, b) => b.avgPerFan - a.avgPerFan).slice(0, 10);

                    return (
                      <div className="space-y-5">
                        <div className="rounded-lg bg-muted/40 px-4 py-2.5 border border-border">
                          <p className="text-xs font-semibold text-foreground">🎯 Oportunidades de Crecimiento</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Tres categorías accionables: creadoras en racha de crecimiento, creadoras con muchos fans pero baja monetización, y creadoras con buena monetización pero pocos fans.</p>
                        </div>
                        <p className="text-xs text-muted-foreground">Creadoras con mayor potencial de crecimiento basado en métricas actuales.</p>
                        
                        <div className="rounded-xl border-2 border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">🚀</span>
                            <h3 className="text-sm font-bold text-foreground">Alto Crecimiento</h3>
                            <span className="text-[10px] text-muted-foreground">Crecieron &gt;20% vs período anterior — mantener impulso</span>
                          </div>
                          {highGrowth.length === 0 ? <p className="text-sm text-muted-foreground">Sin creadoras en esta categoría</p> : (
                            <div className="space-y-1.5">
                              {highGrowth.map((c, i) => {
                                const prev = prevMonthMap.get(c.creatorId) ?? 0;
                                const pct = prev > 0 ? ((c.total - prev) / prev * 100) : 0;
                                return (
                                  <ListRow key={c.creatorId}>
                                    <span className="text-xs text-muted-foreground tabular-nums w-5">{i + 1}</span>
                                    <button className="font-medium text-sm text-foreground hover:text-primary hover:underline underline-offset-2 transition-colors text-left min-w-[120px]" onClick={() => navigate(`/creadores/${c.creatorId}`)}>{c.name}</button>
                                    <span className="text-sm tabular-nums font-semibold">{fmtShort(c.total)}</span>
                                    <span className="text-xs tabular-nums text-emerald-500 font-bold ml-auto">↑{pct.toFixed(0)}%</span>
                                  </ListRow>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        <div className="rounded-xl border-2 border-blue-500/30 bg-blue-500/5 p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">💎</span>
                            <h3 className="text-sm font-bold text-foreground">Sub-monetizadas</h3>
                            <span className="text-[10px] text-muted-foreground">$/Fan bajo vs promedio ({fmt(hlKpis.avgPerFanGlobal)}) pero +50 fans — oportunidad de monetización</span>
                          </div>
                          {lowMonetization.length === 0 ? <p className="text-sm text-muted-foreground">Sin creadoras en esta categoría</p> : (
                            <div className="space-y-1.5">
                              {lowMonetization.map((c, i) => (
                                <ListRow key={c.creatorId}>
                                  <span className="text-xs text-muted-foreground tabular-nums w-5">{i + 1}</span>
                                  <button className="font-medium text-sm text-foreground hover:text-primary hover:underline underline-offset-2 transition-colors text-left min-w-[120px]" onClick={() => navigate(`/creadores/${c.creatorId}`)}>{c.name}</button>
                                  <span className="text-sm tabular-nums">{fmtShort(c.total)}</span>
                                  <span className="text-xs text-muted-foreground">{c.activeFans} fans</span>
                                  <span className="text-xs tabular-nums text-blue-500 font-bold ml-auto">{fmt(c.avgPerFan)}/fan</span>
                                </ListRow>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="rounded-xl border-2 border-purple-500/30 bg-purple-500/5 p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">📣</span>
                            <h3 className="text-sm font-bold text-foreground">Necesitan Audiencia</h3>
                            <span className="text-[10px] text-muted-foreground">Buen $/Fan pero &lt;100 fans — necesitan adquisición</span>
                          </div>
                          {underperforming.length === 0 ? <p className="text-sm text-muted-foreground">Sin creadoras en esta categoría</p> : (
                            <div className="space-y-1.5">
                              {underperforming.map((c, i) => (
                                <ListRow key={c.creatorId}>
                                  <span className="text-xs text-muted-foreground tabular-nums w-5">{i + 1}</span>
                                  <button className="font-medium text-sm text-foreground hover:text-primary hover:underline underline-offset-2 transition-colors text-left min-w-[120px]" onClick={() => navigate(`/creadores/${c.creatorId}`)}>{c.name}</button>
                                  <span className="text-sm tabular-nums">{fmtShort(c.total)}</span>
                                  <span className="text-xs text-muted-foreground">{c.activeFans} fans</span>
                                  <span className="text-xs tabular-nums text-purple-500 font-bold ml-auto">{fmt(c.avgPerFan)}/fan</span>
                                </ListRow>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── Ballenas (top fans / spenders) ── */}
                  {deepDiveTab === "ballenas" && (() => {
                    const now = new Date();
                    const soonMs = now.getTime() + 7 * 86400000;
                    const isSoon = (f: typeof topFans[number]) => !!(f.is_active && f.expires_at && new Date(f.expires_at).getTime() <= soonMs);
                    const top = topFans.slice(0, 100);
                    const totalSpend = topFans.reduce((s, f) => s + (f.spent_gross ?? 0), 0);
                    const soon = topFans.filter(isSoon).length;
                    const snap = topFans[0]?.snapshot_from && topFans[0]?.snapshot_to
                      ? `${topFans[0].snapshot_from} → ${topFans[0].snapshot_to}` : "—";
                    return (
                      <div className="space-y-5">
                        <div className="rounded-lg bg-muted/40 px-4 py-2.5 border border-border">
                          <p className="text-xs font-semibold text-foreground">🐋 Ballenas — Top spenders por creadora</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Los fans que más gastaron (snapshot {snap}). Para retención/upsell: priorizá a los que están por expirar. Fuente: <code className="bg-muted px-1 rounded font-mono text-[10px]">creator_top_fans</code> (BLU fan-reports).</p>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="rounded-xl border border-border bg-card p-3 text-center">
                            <p className="text-[10px] text-muted-foreground uppercase">Ballenas</p>
                            <p className="text-lg font-bold tabular-nums">{topFans.length.toLocaleString()}</p>
                          </div>
                          <div className="rounded-xl border border-border bg-card p-3 text-center">
                            <p className="text-[10px] text-muted-foreground uppercase">Gasto total (top)</p>
                            <p className="text-lg font-bold tabular-nums">{fmtK(totalSpend)}</p>
                          </div>
                          <div className="rounded-xl border border-border bg-card p-3 text-center">
                            <p className="text-[10px] text-muted-foreground uppercase">Expiran ≤7d</p>
                            <p className="text-lg font-bold tabular-nums text-orange-400">{soon}</p>
                          </div>
                        </div>
                        {topFansLoading ? (
                          <div className="p-8 text-center text-sm text-muted-foreground">Cargando ballenas…</div>
                        ) : topFans.length === 0 ? (
                          <div className="rounded-lg border border-border bg-card text-center py-12 text-sm text-muted-foreground">Sin ballenas todavía — esperá la próxima sincronización de BLU.</div>
                        ) : (
                          <div className="rounded-xl border border-border overflow-hidden">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-10">#</TableHead>
                                  <TableHead>Fan</TableHead>
                                  <TableHead>Creadora</TableHead>
                                  <TableHead className="text-right">Gasto</TableHead>
                                  <TableHead className="text-right">Mensajes</TableHead>
                                  <TableHead>Estado</TableHead>
                                  <TableHead>Expira</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {top.map((f, i) => {
                                  const exp = f.expires_at ? new Date(f.expires_at) : null;
                                  const expSoon = isSoon(f);
                                  return (
                                    <TableRow key={f.id}>
                                      <TableCell className="text-muted-foreground tabular-nums text-sm">{i + 1}</TableCell>
                                      <TableCell className="font-medium text-sm">{f.fan_name || f.fan_username || `u${f.fan_user_id}`}</TableCell>
                                      <TableCell className="text-sm">{f.artistic_name || f.blu_name}</TableCell>
                                      <TableCell className="text-right tabular-nums font-semibold">{fmtK(f.spent_gross)}</TableCell>
                                      <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{fmtK(f.messages_gross)}</TableCell>
                                      <TableCell>
                                        {f.is_active === false
                                          ? <Badge variant="outline" className="text-muted-foreground">Inactivo</Badge>
                                          : <Badge variant="outline" className="text-success border-success/30">Activo</Badge>}
                                      </TableCell>
                                      <TableCell className={`text-sm tabular-nums whitespace-nowrap ${expSoon ? "text-orange-400 font-medium" : "text-muted-foreground"}`}>
                                        {exp ? format(exp, "dd MMM yy", { locale: es }) : "—"}{expSoon && " ⚠"}
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* ── Retención por cohorte ── */}
                  {deepDiveTab === "retencion" && (() => {
                    const rows = retentionRows;
                    const curve = Array.from({ length: 12 }, (_, d) => {
                      let w = 0, sum = 0;
                      for (const r of rows) {
                        const v = r.after_days?.[d];
                        if (typeof v === "number" && r.new_fans > 0) { w += r.new_fans; sum += r.new_fans * v; }
                      }
                      return w > 0 ? sum / w : null;
                    });
                    const byC = new Map<string, { name: string; newFans: number; d1w: number; d1s: number; d7w: number; d7s: number }>();
                    for (const r of rows) {
                      const key = r.creator_id || r.blu_name;
                      const e = byC.get(key) || { name: r.artistic_name || r.blu_name, newFans: 0, d1w: 0, d1s: 0, d7w: 0, d7s: 0 };
                      e.newFans += r.new_fans;
                      const v1 = r.after_days?.[1]; if (typeof v1 === "number" && r.new_fans > 0) { e.d1w += r.new_fans; e.d1s += r.new_fans * v1; }
                      const v7 = r.after_days?.[7]; if (typeof v7 === "number" && r.new_fans > 0) { e.d7w += r.new_fans; e.d7s += r.new_fans * v7; }
                      byC.set(key, e);
                    }
                    const perCreator = [...byC.values()]
                      .map((e) => ({ name: e.name, newFans: e.newFans, d1: e.d1w > 0 ? e.d1s / e.d1w : null, d7: e.d7w > 0 ? e.d7s / e.d7w : null }))
                      .filter((c) => c.d7 != null && c.newFans >= 10)
                      .sort((a, b) => (a.d7 ?? 0) - (b.d7 ?? 0));
                    const snap = rows.length ? `${rows[rows.length - 1]?.cohort_date} → ${rows[0]?.cohort_date}` : "—";
                    const retColor = (v: number | null) => v == null ? "text-muted-foreground" : v < 40 ? "text-destructive" : v < 60 ? "text-orange-400" : "text-success";
                    return (
                      <div className="space-y-5">
                        <div className="rounded-lg bg-muted/40 px-4 py-2.5 border border-border">
                          <p className="text-xs font-semibold text-foreground">🔁 Retención de fans por cohorte</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">De cada grupo de fans nuevos, qué % sigue suscripto a los días 0–11 (cohortes últimos 60d: {snap}). Caída fuerte = problema de retención. Fuente: <code className="bg-muted px-1 rounded font-mono text-[10px]">creator_fan_retention</code> (BLU).</p>
                        </div>
                        {retLoading ? (
                          <div className="p-8 text-center text-sm text-muted-foreground">Cargando retención…</div>
                        ) : rows.length === 0 ? (
                          <div className="rounded-lg border border-border bg-card text-center py-12 text-sm text-muted-foreground">Sin datos de retención todavía — esperá la próxima sincronización de BLU.</div>
                        ) : (
                          <>
                            <div className="rounded-xl border border-border bg-card p-4">
                              <p className="text-xs font-semibold text-foreground mb-3">Curva de retención (todas las creadoras, ponderada por fans)</p>
                              <div className="flex items-end gap-1.5 h-36">
                                {curve.map((v, d) => (
                                  <div key={d} className="flex-1 flex flex-col items-center gap-1 h-full">
                                    <span className="text-[9px] text-muted-foreground tabular-nums">{v != null ? `${Math.round(v)}%` : "—"}</span>
                                    <div className="w-full bg-muted/40 rounded-sm relative flex-1">
                                      <div className="absolute bottom-0 w-full bg-primary rounded-sm transition-all" style={{ height: `${v ?? 0}%` }} />
                                    </div>
                                    <span className="text-[9px] text-muted-foreground">D{d}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="rounded-xl border border-border overflow-hidden">
                              <div className="px-4 py-2.5 border-b border-border bg-muted/20">
                                <p className="text-xs font-semibold text-foreground">Retención por creadora — peores primero (a afinar)</p>
                              </div>
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Creadora</TableHead>
                                    <TableHead className="text-right">Fans nuevos (60d)</TableHead>
                                    <TableHead className="text-right">Ret. día 1</TableHead>
                                    <TableHead className="text-right">Ret. día 7</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {perCreator.slice(0, 40).map((c) => (
                                    <TableRow key={c.name}>
                                      <TableCell className="font-medium text-sm">{c.name}</TableCell>
                                      <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{c.newFans.toLocaleString()}</TableCell>
                                      <TableCell className={`text-right tabular-nums text-sm ${retColor(c.d1)}`}>{c.d1 != null ? `${c.d1.toFixed(0)}%` : "—"}</TableCell>
                                      <TableCell className={`text-right tabular-nums text-sm font-semibold ${retColor(c.d7)}`}>{c.d7 != null ? `${c.d7.toFixed(0)}%` : "—"}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })()}

                  {/* ── Chatter Performance ── */}
                  {deepDiveTab === "chatter" && (() => {
                    const list = chatters;
                    const totalSales = list.reduce((s, c) => s + (c.total_sales ?? 0), 0);
                    const avgConv = (() => {
                      let w = 0, sum = 0;
                      for (const c of list) { if (c.fan_conversion_rate != null && c.fans_chatted > 0) { w += c.fans_chatted; sum += c.fans_chatted * c.fan_conversion_rate; } }
                      return w > 0 ? sum / w : null;
                    })();
                    const snap = list[0]?.snapshot_from && list[0]?.snapshot_to ? `${list[0].snapshot_from} → ${list[0].snapshot_to}` : "—";
                    const fmtHrs = (h: number | null) => h == null ? "—" : `${h.toFixed(0)}h`;
                    const fmtResp = (s: number | null) => s == null ? "—" : s >= 3600 ? `${(s / 3600).toFixed(1)}h` : s >= 60 ? `${Math.round(s / 60)}m` : `${Math.round(s)}s`;
                    return (
                      <div className="space-y-5">
                        <div className="rounded-lg bg-muted/40 px-4 py-2.5 border border-border">
                          <p className="text-xs font-semibold text-foreground">🧑‍💻 Rendimiento por chatter</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Ventas, conversión y tiempos por chatter (mes en curso: {snap}). Δ = vs período anterior. Fuente: <code className="bg-muted px-1 rounded font-mono text-[10px]">chatter_performance</code> (BLU employee-reports).</p>
                        </div>
                        {chattersLoading ? (
                          <div className="p-8 text-center text-sm text-muted-foreground">Cargando chatters…</div>
                        ) : list.length === 0 ? (
                          <div className="rounded-lg border border-border bg-card text-center py-12 text-sm text-muted-foreground">Sin datos de chatters todavía — esperá la próxima sincronización de BLU.</div>
                        ) : (
                          <>
                            <div className="grid grid-cols-3 gap-3">
                              <div className="rounded-xl border border-border bg-card p-3 text-center">
                                <p className="text-[10px] text-muted-foreground uppercase">Chatters</p>
                                <p className="text-lg font-bold tabular-nums">{list.length}</p>
                              </div>
                              <div className="rounded-xl border border-border bg-card p-3 text-center">
                                <p className="text-[10px] text-muted-foreground uppercase">Ventas (total)</p>
                                <p className="text-lg font-bold tabular-nums">{fmtK(totalSales)}</p>
                              </div>
                              <div className="rounded-xl border border-border bg-card p-3 text-center">
                                <p className="text-[10px] text-muted-foreground uppercase">Conversión prom</p>
                                <p className="text-lg font-bold tabular-nums">{avgConv != null ? `${avgConv.toFixed(1)}%` : "—"}</p>
                              </div>
                            </div>
                            <div className="rounded-xl border border-border overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Chatter</TableHead>
                                    <TableHead>Grupo</TableHead>
                                    <TableHead className="text-right">Ventas</TableHead>
                                    <TableHead className="text-right">Δ</TableHead>
                                    <TableHead className="text-right">Fans chat.</TableHead>
                                    <TableHead className="text-right">Conv.</TableHead>
                                    <TableHead className="text-right">$/fan pago</TableHead>
                                    <TableHead className="text-right">Resp.</TableHead>
                                    <TableHead className="text-right">Hrs (real/prog)</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {list.map((c) => {
                                    const d = c.delta_total_sales;
                                    return (
                                      <TableRow key={c.id}>
                                        <TableCell className="font-medium text-sm whitespace-nowrap">{c.name || `#${c.blu_employee_id}`}</TableCell>
                                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{c.group_name || "—"}</TableCell>
                                        <TableCell className="text-right tabular-nums font-semibold">{fmtK(c.total_sales)}</TableCell>
                                        <TableCell className={`text-right tabular-nums text-sm ${d == null ? "text-muted-foreground" : d >= 0 ? "text-success" : "text-destructive"}`}>{d == null ? "—" : `${d >= 0 ? "+" : ""}${fmtK(d)}`}</TableCell>
                                        <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{(c.fans_chatted ?? 0).toLocaleString()}</TableCell>
                                        <TableCell className="text-right tabular-nums text-sm">{c.fan_conversion_rate != null ? `${c.fan_conversion_rate.toFixed(0)}%` : "—"}</TableCell>
                                        <TableCell className="text-right tabular-nums text-sm">{c.avg_earnings_per_paying_fan != null ? fmtK(c.avg_earnings_per_paying_fan) : "—"}</TableCell>
                                        <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{fmtResp(c.avg_response_seconds)}</TableCell>
                                        <TableCell className="text-right tabular-nums text-sm text-muted-foreground whitespace-nowrap">{fmtHrs(c.clocked_hours)}/{fmtHrs(c.scheduled_hours)}</TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })()}

                  {/* ── Customer LTV (Placeholder) ── */}
                  {deepDiveTab === "ltv" && (
                    <LtvTab data={ltvData} loading={topFansLoading} periodLabel={selectedPeriod?.label} />
                  )}

                  {/* ── Content ROI — Promolog (promo) × ingreso BLU ── */}
                  {deepDiveTab === "content_roi" && (() => {
                    const pd = promoDays ?? new Map<string, Set<string>>();
                    const byC = new Map<string, { name: string; promoInc: number; promoDays: number; nonInc: number; nonDays: number }>();
                    let aPromoInc = 0, aPromoDays = 0, aNonInc = 0, aNonDays = 0;
                    for (const r of contentRoiDaily) {
                      const d = r.date;
                      const isPromo = pd.get(r.creator_id)?.has(d) ?? false;
                      const inc = r.total_gross;
                      const e = byC.get(r.creator_id) || { name: r.artistic_name || "Sin nombre", promoInc: 0, promoDays: 0, nonInc: 0, nonDays: 0 };
                      if (isPromo) { e.promoInc += inc; e.promoDays++; aPromoInc += inc; aPromoDays++; }
                      else { e.nonInc += inc; e.nonDays++; aNonInc += inc; aNonDays++; }
                      byC.set(r.creator_id, e);
                    }
                    const list = [...byC.values()].filter((e) => e.promoDays > 0).map((e) => {
                      const avgP = e.promoDays > 0 ? e.promoInc / e.promoDays : null;
                      const avgN = e.nonDays > 0 ? e.nonInc / e.nonDays : null;
                      const lift = (avgP != null && avgN != null && avgN > 0) ? (avgP / avgN - 1) * 100 : null;
                      return { name: e.name, promoDays: e.promoDays, avgP, avgN, lift };
                    }).sort((a, b) => (b.lift ?? -1e9) - (a.lift ?? -1e9));
                    const agAvgP = aPromoDays > 0 ? aPromoInc / aPromoDays : null;
                    const agAvgN = aNonDays > 0 ? aNonInc / aNonDays : null;
                    const agLift = (agAvgP != null && agAvgN != null && agAvgN > 0) ? (agAvgP / agAvgN - 1) * 100 : null;
                    const liftColor = (v: number | null) => v == null ? "text-muted-foreground" : v > 0 ? "text-success" : "text-destructive";
                    const fmtPct = (v: number | null) => v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(0)}%`;
                    return (
                      <div className="space-y-5">
                        <div className="rounded-lg bg-muted/40 px-4 py-2.5 border border-border">
                          <p className="text-xs font-semibold text-foreground">📣 Content ROI — ¿promocionar mueve la aguja?</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Ingreso/día en días que la creadora promocionó (Promolog) vs días que no, en {selectedPeriod?.label}. "Lift" = cuánto más rinde un día con promo. Fuente: <code className="bg-muted px-1 rounded font-mono text-[10px]">promolog_entries</code> × <code className="bg-muted px-1 rounded font-mono text-[10px]">creator_daily_earnings</code>.</p>
                        </div>
                        {promoLoading ? (
                          <div className="p-8 text-center text-sm text-muted-foreground">Cargando promos…</div>
                        ) : list.length === 0 ? (
                          <div className="rounded-lg border border-border bg-card text-center py-12 text-sm text-muted-foreground">Sin días de promo en {selectedPeriod?.label}.</div>
                        ) : (
                          <>
                            <div className="grid grid-cols-3 gap-3">
                              <div className="rounded-xl border border-border bg-card p-3 text-center">
                                <p className="text-[10px] text-muted-foreground uppercase">$/día CON promo</p>
                                <p className="text-lg font-bold tabular-nums">{agAvgP != null ? fmtK(agAvgP) : "—"}</p>
                              </div>
                              <div className="rounded-xl border border-border bg-card p-3 text-center">
                                <p className="text-[10px] text-muted-foreground uppercase">$/día SIN promo</p>
                                <p className="text-lg font-bold tabular-nums">{agAvgN != null ? fmtK(agAvgN) : "—"}</p>
                              </div>
                              <div className="rounded-xl border border-border bg-card p-3 text-center">
                                <p className="text-[10px] text-muted-foreground uppercase">Promo lift</p>
                                <p className={`text-lg font-bold tabular-nums ${liftColor(agLift)}`}>{fmtPct(agLift)}</p>
                              </div>
                            </div>
                            <div className="rounded-xl border border-border overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Creadora</TableHead>
                                    <TableHead className="text-right">Días promo</TableHead>
                                    <TableHead className="text-right">$/día c/promo</TableHead>
                                    <TableHead className="text-right">$/día s/promo</TableHead>
                                    <TableHead className="text-right">Lift</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {list.map((c) => (
                                    <TableRow key={c.name}>
                                      <TableCell className="font-medium text-sm whitespace-nowrap">{c.name}</TableCell>
                                      <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{c.promoDays}</TableCell>
                                      <TableCell className="text-right tabular-nums text-sm">{c.avgP != null ? fmtK(c.avgP) : "—"}</TableCell>
                                      <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{c.avgN != null ? fmtK(c.avgN) : "—"}</TableCell>
                                      <TableCell className={`text-right tabular-nums text-sm font-semibold ${liftColor(c.lift)}`}>{fmtPct(c.lift)}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })()}

                  {/* ── Cohortes de retención (creator_fan_retention vía RPC) ── */}
                  {deepDiveTab === "cohort" && (
                    <CohortRetentionTab
                      rows={cohortData?.rows ?? []}
                      maxOffset={cohortData?.maxOffset ?? 11}
                      loading={cohortLoading}
                      periodLabel={selectedPeriod?.label}
                    />
                  )}
                </div>
              </div>
            )}
          </main>
  );
};

export default Dashboard2;
