import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { SubtabNav, SubtabNavItem } from "@/components/ui/subtab-nav";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, isSameDay, addDays, startOfWeek, isToday, isFuture, startOfDay } from "date-fns";
import { es } from "date-fns/locale";
import { computeDayScore } from "./promoScore";
import {
  Users,
  Search,
  Target,
  Plus,
  Check,
  Minus,
  X,
  Table2,
  Info,
  AlertTriangle,
  TrendingUp,
  CheckCircle,
  Upload,
  ExternalLink,
  List,
  LayoutGrid,
  Send,
  Eye,
  CalendarIcon,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  BarChart3,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Bot,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import KpiCard from "@/components/dashboard/KpiCard";
import CategorySectionHeader from "@/components/dashboard/CategorySectionHeader";
import DateRangePresets, { type RangePreset, rangeForPreset } from "@/components/dashboard/DateRangePresets";
import PromologDashboardView from "./PromologDashboardView";
import PromobotPanel from "./PromobotPanel";
import PromologCalendarView from "./PromologCalendarView";
import PromologEntryDetailDialog from "./PromologEntryDetailDialog";
import PromologEntryFormDialog from "./PromologEntryFormDialog";
import { CATEGORY_ORDER } from "@/hooks/useOperationsDashboard";
import { ListRow, ListRowButton } from "@/components/ui/list-row";
import { useTimezone, formatDateInTz, formatTimeInTz } from "@/hooks/useTimezone";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandItem } from "@/components/ui/command";
// Calendar removed - month/year selector uses Select components
import InstagramIcon from "@/components/icons/InstagramIcon";
import TikTokIcon from "@/components/icons/TikTokIcon";
import XIcon from "@/components/icons/XIcon";
import TelegramIcon from "@/components/icons/TelegramIcon";
import PromologEntryCard, { type PromologEntry } from "./PromologEntryCard";
import PromologTable, { type SortKey, sortPromologEntries } from "./PromologTable";
import PromologGrid from "./PromologGrid";
import PromologAgentDetailView from "./PromologAgentDetailView";
import PromologStoryGallery from "./PromologStoryGallery";
import { collectDayStories } from "./storyEvidence";
import PromologPerformanceView from "./PromologPerformanceView";
import AnalyticsSectionBanner from "@/components/analytics/AnalyticsSectionBanner";
import DataTableShell from "@/components/ui/data-table-shell";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { usePermissions } from "@/hooks/usePermissions";

const networkOptions = [
  { value: "instagram", label: "Instagram", icon: InstagramIcon },
  { value: "tiktok", label: "TikTok", icon: TikTokIcon },
  { value: "x", label: "X", icon: XIcon },
  { value: "telegram", label: "Telegram", icon: TelegramIcon },
] as const;

const platformOptions = [
  { value: "onlyfans", label: "OnlyFans" },
  { value: "unlok", label: "Unlok" },
  { value: "otra", label: "Otra" },
] as const;

const contactTypeOptions = [
  { value: "hablaron", label: "Hablaron" },
  { value: "textearon", label: "Textearon" },
  { value: "mensaje_voz", label: "Mensaje de Voz" },
] as const;

const promotedToResult = (promoted: string | null): string => {
  switch (promoted) {
    case "true": return "Sí";
    case "false": return "No";
    case "partial": return "Parcial";
    case "pending": return "Pendiente";
    default: return "Pendiente";
  }
};

const resultToBadgeVariant = (result: string): "success-soft" | "destructive-soft" | "warning-soft" | "secondary-soft" => {
  switch (result) {
    case "Sí": return "success-soft";
    case "No": return "destructive-soft";
    case "Parcial": return "warning-soft";
    default: return "secondary-soft";
  }
};

// agentsData is now computed dynamically via useMemo inside the component

// Subtabs visibles dentro de Promolog. Antes había Promos/Agentes/
// Campañas/Rendimiento; el spec nuevo dejó Dashboard/Promos/Agentes
// (Campañas se eliminó completo, Rendimiento ya estaba poco usado).
const tabItems = [
  { id: "dashboard" as const, label: "Dashboard", icon: BarChart3 },
  { id: "promos" as const, label: "Promos", icon: Table2 },
  { id: "calendario" as const, label: "Calendario", icon: CalendarIcon },
  { id: "agentes" as const, label: "Agentes", icon: Users },
  { id: "promobot" as const, label: "Promobot", icon: Bot },
];

const DAY_LABELS_ES = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];

const getAgentWeekDays = (offset: number): Date[] => {
  const now = new Date();
  const monday = startOfWeek(addDays(now, offset * 7), { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
};

const PromologContent = () => {
  const { user } = useAuth();
  const { role } = useUserRole();
  const { canAccess } = usePermissions();
  const isManagement = ["admin", "manager", "supervisor"].includes(role ?? "");
  // Promobot: gateado por el sistema de permisos (default solo admin, marcable
  // por rol en Settings/admin/roles). Admin siempre true vía usePermissions.
  const canPromobot = canAccess("Promolog", "Promobot");

  // Sólo creadoras activas — el bot promolog (Apify + Gemini) trackea
  // únicamente estas. Las terminadas, en onboarding, paused y borradores
  // no tienen flujo de promo diaria, así que aparecer en el modal de
  // "Agregar Promo" era ruido (mostraba tests Testing102, ILIANA CHACÓN
  // ya terminada, etc.). Si después necesitamos ampliar a paused/
  // onboarding por excepción, se vuelve a relajar el filtro.
  const { data: creators = [] } = useQuery({
    queryKey: ["creators-promolog-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creators")
        .select("id, name, artistic_name, category, country, country_code, status, profile_photo_url, instagram_handle, twitter_handle, tiktok_handle")
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch campaigns
  const { data: campaigns = [] } = useQuery({
    queryKey: ["promolog-campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("promolog_campaigns")
        .select("*, creators(name, artistic_name)")
        .order("month_year", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch profiles for agent name resolution
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name");
      return data || [];
    },
  });

  const profilesMap = useMemo(() => {
    const map: Record<string, string> = {};
    profiles.forEach((p: any) => { if (p.id && p.full_name) map[p.id] = p.full_name; });
    return map;
  }, [profiles]);

  const queryClient = useQueryClient();

  // Date range global — controla el filtrado de TODOS los subtabs
  // (Dashboard, Promos, Agentes). Default = "Hoy" igual que Panel de
  // Control: la mayoría del uso es check del día en curso. El user
  // puede ampliar a Ayer / Esta semana / Este mes con los chips, o
  // elegir un rango custom desde el DateRangePicker.
  const initialRange = rangeForPreset("today");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(initialRange.from);
  const [dateTo, setDateTo] = useState<Date | undefined>(initialRange.to);
  const [activeDatePreset, setActiveDatePreset] = useState<RangePreset | null>("today");

  // Fetch real promolog entries
  const { data: promologEntries = [], isLoading: entriesLoading } = useQuery({
    queryKey: ["promolog-entries", user?.id, dateFrom?.toISOString(), dateTo?.toISOString()],
    queryFn: async () => {
      // Limit alto porque cada día el bot genera ~400 entries (20 stories
      // por creadora * ~120 activas). Con limit 500 antes, "Esta semana"
      // o "Este mes" solo veían las 500 más recientes (= hoy + ayer
      // parcial). 10000 cubre ~25 días holgado. Si se acerca a este cap
      // habría que mover los counts a queries agregadas server-side.
      let query = supabase
        .from("promolog_entries")
        .select("*, creators(name, artistic_name, instagram_handle, category, profile_photo_url)")
        .order("date", { ascending: false })
        .limit(10000);

      // Closers/agents/employees only see their own entries
      if (!isManagement && user?.id) {
        query = query.or(`reviewed_by.eq.${user.id},created_by.eq.${user.id}`);
      }

      if (dateFrom) {
        const fromStr = dateFrom.toISOString().split("T")[0];
        query = query.gte("date", fromStr);
      }
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setDate(toDate.getDate() + 1);
        const toStr = toDate.toISOString().split("T")[0];
        query = query.lt("date", toStr);
      }

      const { data, error } = await query;
      if (error) throw error;

      return data ?? [];
    },
  });

  // Métricas del PERÍODO ANTERIOR equivalente (misma longitud, justo antes del rango)
  // para los deltas ▲/▼ del Dashboard. Query liviana (solo creator_id/date/promoted) +
  // dedup por creador+día con la misma semántica que el Dashboard (un creador-día cuenta
  // como promo si tuvo ≥1 entry promocionada).
  const { data: prevMetrics = null } = useQuery({
    queryKey: ["promolog-prev-metrics", user?.id, dateFrom?.toISOString(), dateTo?.toISOString(), isManagement],
    enabled: !!dateFrom && !!dateTo,
    queryFn: async () => {
      const lenDays = Math.max(1, Math.round((dateTo!.getTime() - dateFrom!.getTime()) / 86_400_000) + 1);
      const prevToStr = dateFrom!.toISOString().split("T")[0]; // exclusivo: arranca el rango actual
      const prevFromStr = new Date(dateFrom!.getTime() - lenDays * 86_400_000).toISOString().split("T")[0];
      let q = supabase
        .from("promolog_entries")
        .select("creator_id, date, promoted")
        .gte("date", prevFromStr)
        .lt("date", prevToStr)
        .limit(10000);
      if (!isManagement && user?.id) q = q.or(`reviewed_by.eq.${user.id},created_by.eq.${user.id}`);
      const { data, error } = await q;
      if (error) throw error;
      const groups = new Map<string, boolean>();
      for (const r of (data ?? []) as Array<{ creator_id: string | null; date: string; promoted: string | null }>) {
        // Agrupar por creador+DÍA (no por timestamp): el campo `date` es un timestamp con
        // hora, así que recortamos a YYYY-MM-DD para contar creador-días como el Dashboard.
        const key = `${r.creator_id || ""}|${(r.date || "").slice(0, 10)}`;
        const isPromo = r.promoted === "true" || r.promoted === "yes";
        groups.set(key, (groups.get(key) || false) || isPromo);
      }
      const creatorDays = groups.size;
      const promos = [...groups.values()].filter(Boolean).length;
      return { promos, successRate: creatorDays > 0 ? Math.round((promos / creatorDays) * 100) : 0 };
    },
  });

  // Timezone preferido del user — afecta cómo se renderizan TODAS las
  // fechas/horas en Promolog. Cuando el user cambia el TZ en el topbar,
  // este memo recalcula y todas las entries se re-renderean con la nueva
  // zona. Default: TZ guardado en localStorage / fallback Miami.
  const { timezone: userTz } = useTimezone();

  // Map DB entries to PromologEntry interface
  const entries: PromologEntry[] = useMemo(() => {
    return promologEntries.map((pe: any) => {
      const creator = pe.creators as any;
      return {
        id: pe.id,
        ticketNumber: pe.ticket_number || "",
        name: creator?.artistic_name || creator?.name || "Sin nombre",
        handle: creator?.instagram_handle || undefined,
        network: (pe.network || "").toLowerCase(),
        platform: pe.platform || "OnlyFans",
        result: promotedToResult(pe.promoted),
        // Formateado en el TZ del user — `pe.date` viene en UTC desde DB
        // (timestamp). Sin esto, se renderizaba con el TZ del browser
        // que en muchos casos era UTC (la promo de las 6:12pm Miami se
        // veía como 10:12pm porque -4h UTC).
        date: formatDateInTz(pe.date, userTz),
        time: formatTimeInTz(pe.date, userTz),
        agent: (pe.created_by && profilesMap[pe.created_by]) || (pe.reviewed_by && profilesMap[pe.reviewed_by]) || "AI Agent",
        notes: pe.notes || "",
        creator_id: pe.creator_id,
        reviewed_by: pe.reviewed_by || undefined,
        category: creator?.category ?? null,
        profile_photo_url: creator?.profile_photo_url ?? null,
        // action_taken sigue para entries manuales (el chatter elige una
        // estrategia del dropdown). Para entries del bot, este campo
        // viene null — pero el `ai_reasoning` cubre la explicación.
        action_taken: pe.action_taken ?? null,
        evidence_url: pe.evidence_url ?? null,
        buy_link_type: pe.buy_link_type ?? null,
        has_buy_link: pe.has_buy_link === true,
        ai_reasoning: pe.ai_reasoning ?? null,
        ai_confidence: pe.ai_confidence != null ? Number(pe.ai_confidence) : null,
        analyzed_by_ai: pe.analyzed_by_ai === true,
        story_index: pe.story_index != null ? Number(pe.story_index) : null,
        story_count: pe.story_count != null ? Number(pe.story_count) : null,
        apify_run_id: pe.apify_run_id ?? null,
        rawDate: pe.date ?? null,
        source_handle: pe.source_handle ?? null,
      };
    });
  }, [promologEntries, profilesMap, userTz]);

  // 1 fila por MODELO + DÍA (no por resultado). El bot crea 1 entry por story; acá
  // las colapsamos: si la modelo promocionó en ALGUNA story ese día, la fila la
  // representa esa promo (resultado "Sí" + plataforma + evidencia de la story que
  // promocionó); si no promocionó en ninguna, la story más completa ("No"). Antes la
  // key incluía el resultado → una modelo con 1 promo + otras sin promo salía 2 veces.
  const dedupedEntries = useMemo(() => {
    const groups = new Map<string, PromologEntry[]>();
    for (const entry of entries) {
      const key = `${entry.creator_id || ""}|${entry.date}`;
      const group = groups.get(key);
      if (group) group.push(entry);
      else groups.set(key, [entry]);
    }
    // Score: preferir entries con evidencia, notas, review humano, agente humano.
    const pickBest = (list: PromologEntry[]) => {
      const scored = list.map(e => ({
        entry: e,
        score: (e.evidence_url ? 2 : 0) + (e.notes ? 2 : 0) + (e.reviewed_by ? 2 : 0) + (e.agent !== "AI Agent" ? 3 : 0),
      }));
      scored.sort((a, b) => b.score - a.score);
      return scored[0].entry;
    };
    const NETWORK_ORDER = ["instagram", "telegram", "tiktok", "x", "twitter", "facebook", "reddit", "youtube"];
    const result: PromologEntry[] = [];
    for (const group of groups.values()) {
      const promoted = group.filter(e => e.result === "Sí");
      const best = promoted.length > 0 ? pickBest(promoted) : pickBest(group);
      // Todas las redes ANALIZADAS ese día (distintas), ordenadas estable. La
      // columna "Red Social" muestra el logo de cada una (todo conectado por modelo+día).
      const networks = Array.from(new Set(group.map(e => (e.network || "").toLowerCase()).filter(Boolean)))
        .sort((a, b) => {
          const ia = NETWORK_ORDER.indexOf(a), ib = NETWORK_ORDER.indexOf(b);
          return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        });
      // Redes donde SÍ promocionó (subconjunto de networks) → la columna las pinta
      // full; las "solo revisadas, sin promo" salen en gris.
      const promotedNetworks = Array.from(new Set(
        group.filter(e => e.result === "Sí").map(e => (e.network || "").toLowerCase()).filter(Boolean),
      ));
      // Score de calidad del día (peso×calidad por red) desde TODO el grupo del día.
      const { score: dayScore, networks: networkScores } = computeDayScore(
        group.map((e) => ({
          network: e.network,
          promoted: e.result === "Sí",
          partial: e.result === "Parcial",
          analyzed_by_ai: e.analyzed_by_ai,
          ai_reasoning: e.ai_reasoning,
          platform: e.platform,
          has_buy_link: e.has_buy_link,
          buy_link_type: e.buy_link_type,
          ai_confidence: e.ai_confidence,
          notes: e.notes,
        })),
      );
      result.push({ ...best, networks, promotedNetworks, dayScore, networkScores });
    }
    return result;
  }, [entries]);

  // Dynamic social & platform counts (only "Sí" entries)
  const socialCards = useMemo(() => {
    const siEntries = dedupedEntries.filter(e => e.result === "Sí");
    const countByNetwork = (net: string) => siEntries.filter(e => e.network === net).length;
    return [
      { name: "Instagram", value: countByNetwork("instagram"), icon: <InstagramIcon className="h-6 w-6" />, bg: "bg-pink-500/10" },
      { name: "TikTok", value: countByNetwork("tiktok"), icon: <TikTokIcon className="h-6 w-6" />, bg: "bg-slate-500/10" },
      { name: "X", value: countByNetwork("x"), icon: <XIcon className="h-6 w-6" />, bg: "bg-slate-500/10" },
      { name: "Telegram", value: countByNetwork("telegram"), icon: <Send className="h-6 w-6" />, bg: "bg-blue-500/10" },
    ];
  }, [dedupedEntries]);

  const platformCards = useMemo(() => {
    const siEntries = dedupedEntries.filter(e => e.result === "Sí");
    const countByPlatform = (plat: string) => siEntries.filter(e => (e.platform || "").toLowerCase().includes(plat)).length;
    return [
      { name: "OnlyFans", value: countByPlatform("onlyfans"), bg: "bg-blue-500/10", icon: <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-white text-[10px] font-bold">OF</span> },
      { name: "Unlok", value: countByPlatform("unlok"), bg: "bg-purple-500/10", icon: <span className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-500 text-white text-[10px] font-bold">U</span> },
      { name: "Otra", value: siEntries.length - countByPlatform("onlyfans") - countByPlatform("unlok"), bg: "bg-muted/50", icon: <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground"><Info className="h-4 w-4" /></span> },
    ];
  }, [dedupedEntries]);

  const strategyOptions = [
    { value: "incentivo_economico", label: "Incentivo económico" },
    { value: "llamada_motivacional", label: "Llamada motivacional" },
    { value: "mensaje_estrategico", label: "Mensaje estratégico" },
    { value: "recordatorio_amable", label: "Recordatorio amable" },
    { value: "otro", label: "Otro" },
  ];

  // Default = "dashboard": al abrir Promolog la primera vista es el
  // dashboard con KPIs + podios + insights. El user navega a "Promos"
  // si quiere ver el listado, "Agentes" para el detalle por agente.
  const [activeTab, setActiveTab] = useState<"dashboard" | "promos" | "calendario" | "agentes" | "promobot">("dashboard");
  const [agentesView, setAgentesView] = useState<"list" | "grid" | "calendar">("list");
  const [agentWeekOffset, setAgentWeekOffset] = useState(0);
  const [campanasView, setCampanasView] = useState<"list" | "grid">("list");

  const [selectedCreator, setSelectedCreator] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [entryStrategy, setEntryStrategy] = useState<string>("");
  const [entryCustomPlatform, setEntryCustomPlatform] = useState("");
  const [selectedNetwork, setSelectedNetwork] = useState("");
  const [selectedCardPlatform, setSelectedCardPlatform] = useState("");
  
  const [selectedCreatorFilter, setSelectedCreatorFilter] = useState("");
  const [creatorsModalOpen, setCreatorsModalOpen] = useState(false);
  const [searchCreator, setSearchCreator] = useState("");
  // Collapsed state del modal "Selecciona Creadora Activa" — mismo patrón
  // que usamos en el modal "Creadores Escaneados" del Dashboard: solo
  // la primera categoría con resultados arranca expandida, las demás
  // colapsadas. set vacío = default; cualquier toggle materializa el
  // estado completo y opera con set normal.
  const [creatorModalCollapsed, setCreatorModalCollapsed] = useState<Set<string>>(new Set());
  const [entryView, setEntryView] = useState<"list" | "grid">("list");

  const [searchAgent, setSearchAgent] = useState("");
  const [searchCampaign, setSearchCampaign] = useState("");
  const [campaignStatusFilter, setCampaignStatusFilter] = useState("");
  const [campDateFrom, setCampDateFrom] = useState<Date | undefined>(undefined);
  const [campDateTo, setCampDateTo] = useState<Date | undefined>(undefined);

  const { toast } = useToast();
  const [selectedCreatorForEntry, setSelectedCreatorForEntry] = useState<typeof creators[0] | null>(null);
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [entryResult, setEntryResult] = useState<"si" | "no">("si");
  const [entryNetwork, setEntryNetwork] = useState<string>("");
  const [entryPlatform, setEntryPlatform] = useState<string>("");
  const [entryContactType, setEntryContactType] = useState<string>("");
  const [entryNotes, setEntryNotes] = useState<string>("");
  const [entryEvidencePreview, setEntryEvidencePreview] = useState<string>("");
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const entryFileInputRef = useRef<HTMLInputElement>(null);
  // Multi-foto para la promo MANUAL (modal "Agregar Promo"), espejo de cómo el bot
  // guarda 1 fila por story: cada foto = una story con su propio Sí/No (promoted).
  // (El modal de EDITAR sigue con foto única vía entryEvidencePreview.)
  const [entryPhotos, setEntryPhotos] = useState<Array<{ url: string; promoted: boolean }>>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const entryPhotosInputRef = useRef<HTMLInputElement>(null);

  // Entry action state (table/grid actions)
  const [selectedEntry, setSelectedEntry] = useState<PromologEntry | null>(null);
  const [verdictSavingId, setVerdictSavingId] = useState<string | null>(null);
  const [viewEntryOpen, setViewEntryOpen] = useState(false);

  // Todas las stories del día de la creadora seleccionada (para la galería de
  // evidencia del modal). Usa las entries SIN deduplicar — la tabla muestra 1
  // fila por resultado, pero acá queremos ver cada historia analizada.
  const selectedDayStories = useMemo(
    () => collectDayStories(entries, selectedEntry),
    [entries, selectedEntry],
  );
  // Evidencia del día AGRUPADA POR RED para el popup: junta TODAS las entries del
  // día de la creadora (todas las redes) y arma la galería de cada una. Así el
  // popup muestra Evidencia Instagram / X / Telegram juntas, no solo la red "mejor".
  // TODAS las entries del día (todas las redes) del entry seleccionado → para que el
  // form de Editar precargue por red (multi-red, igual que Agregar).
  const selectedDayEntries = useMemo(() => {
    if (!selectedEntry?.creator_id) return [];
    return entries.filter(
      (e) => e.creator_id === selectedEntry.creator_id && e.date === selectedEntry.date,
    );
  }, [entries, selectedEntry]);

  const selectedDayByNetwork = useMemo(() => {
    if (!selectedEntry?.creator_id) return [];
    const ORDER = ["instagram", "telegram", "x", "twitter", "tiktok", "facebook", "reddit", "youtube"];
    const day = entries.filter(
      (e) => e.creator_id === selectedEntry.creator_id && e.date === selectedEntry.date,
    );
    const byNet = new Map<string, PromologEntry[]>();
    for (const e of day) {
      const net = (e.network || "otra").toLowerCase();
      const arr = byNet.get(net);
      if (arr) arr.push(e);
      else byNet.set(net, [e]);
    }
    return [...byNet.entries()]
      .map(([network, list]) => {
        const rep = list.find((e) => e.evidence_url) || list[0];
        // collectDayStories (rama manual) junta por creador+día SIN mirar la red →
        // hay que filtrar por red, si no X y Facebook mostraban lo mismo (mezclado).
        const stories = collectDayStories(entries, rep).filter(
          (s) => (s.network || "").toLowerCase() === network,
        );
        return { network, stories, promoted: list.some((e) => e.result === "Sí") };
      })
      .sort((a, b) => {
        const ia = ORDER.indexOf(a.network), ib = ORDER.indexOf(b.network);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });
  }, [entries, selectedEntry]);
  // Mostramos SIEMPRE todas las historias del día (cada una marcada Sí/No con su toggle).
  // El resultado del día se computa abajo (dayResult): Sí si cualquiera quedó en Sí.
  const showStoryGallery = selectedDayStories.length > 0;
  // Resultado del día EN VIVO (refleja cambios de veredicto sin reabrir el popup):
  // "Sí" si cualquier historia es Sí; si no, "No"; si no hay stories del bot, el del entry.
  const dayResult = useMemo(() => {
    if (selectedDayStories.some((s) => s.result === "Sí")) return "Sí";
    if (selectedDayStories.some((s) => s.result === "No")) return "No";
    return selectedEntry?.result ?? "Pendiente";
  }, [selectedDayStories, selectedEntry]);
  const [editEntryOpen, setEditEntryOpen] = useState(false);
  const [deleteEntryOpen, setDeleteEntryOpen] = useState(false);
  const [assignAgentOpen, setAssignAgentOpen] = useState(false);
  const [assignAgentTarget, setAssignAgentTarget] = useState<PromologEntry | null>(null);
  const [assignAgentSelected, setAssignAgentSelected] = useState<string>("");
  const [assignAgentSearch, setAssignAgentSearch] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<{ id: string; name: string } | null>(null);

  // Campaign actions state
  const [viewCampaign, setViewCampaign] = useState<any>(null);
  const [editCampaign, setEditCampaign] = useState<any>(null);
  const [deleteCampaign, setDeleteCampaign] = useState<any>(null);
  const [editCampMonth, setEditCampMonth] = useState("");
  const [editCampGoalMonthly, setEditCampGoalMonthly] = useState("");
  const [editCampGoalWeekly, setEditCampGoalWeekly] = useState("");
  const [editCampStatus, setEditCampStatus] = useState("");

  // Fetch all agent IDs via RPC to avoid limit(200) bias
  const { data: allAgentIds = [] } = useQuery({
    queryKey: ["promolog-distinct-agents"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_distinct_promolog_agents");
      if (error) throw error;
      return (data || []).map((r: any) => r.agent_id as string);
    },
  });

  // Fetch agent stats separately without limit. Usa el MISMO date-range global
  // del header (dateFrom/dateTo) que Dashboard y Promos — el subtab Agentes ya
  // no tiene su propio selector de fechas.
  const { data: agentEntries = [] } = useQuery({
    queryKey: ["promolog-agent-entries", dateFrom?.toISOString(), dateTo?.toISOString()],
    queryFn: async () => {
      let query = supabase
        .from("promolog_entries")
        .select("reviewed_by, created_by, promoted, network, date")
        .order("date", { ascending: false });

      if (dateFrom) {
        query = query.gte("date", dateFrom.toISOString().split("T")[0]);
      }
      if (dateTo) {
        const toEnd = new Date(dateTo);
        toEnd.setDate(toEnd.getDate() + 1);
        query = query.lt("date", toEnd.toISOString().split("T")[0]);
      }

      // Fetch all pages
      const allData: any[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await query.range(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allData.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return allData;
    },
    enabled: allAgentIds.length > 0,
  });

  // Dynamic agents data from full dataset
  const agentsData = useMemo(() => {
    const agentMap = new Map<string, { id: string; tickets: number; si: number; parcial: number; no: number; networks: Record<string, number> }>();

    // Initialize all known agents
    for (const agentId of allAgentIds) {
      if (profilesMap[agentId]) {
        agentMap.set(agentId, { id: agentId, tickets: 0, si: 0, parcial: 0, no: 0, networks: {} });
      }
    }

    for (const pe of agentEntries) {
      const agentId = pe.reviewed_by || pe.created_by;
      if (!agentId || !profilesMap[agentId]) continue;

      let agent = agentMap.get(agentId);
      if (!agent) agent = { id: agentId, tickets: 0, si: 0, parcial: 0, no: 0, networks: {} };
      agent.tickets++;
      if (pe.promoted === "true") agent.si++;
      else if (pe.promoted === "partial") agent.parcial++;
      else if (pe.promoted === "false") agent.no++;
      const net = (pe.network || "otro").toLowerCase();
      const netLabel = net === "instagram" ? "IG" : net === "tiktok" ? "TK" : net === "x" ? "X" : net === "telegram" ? "TG" : "Otro";
      agent.networks[netLabel] = (agent.networks[netLabel] || 0) + 1;
      agentMap.set(agentId, agent);
    }

    return Array.from(agentMap.entries()).map(([id, d]) => ({
      id,
      name: profilesMap[id] || id,
      tickets: d.tickets,
      si: d.si,
      parcial: d.parcial,
      no: d.no,
      badges: Object.entries(d.networks).map(([label, value]) => ({ label, value })),
    }));
  }, [allAgentIds, agentEntries, profilesMap]);

  const handleViewEntry = (entry: PromologEntry) => {
    setSelectedEntry(entry);
    setViewEntryOpen(true);
  };
  const handleEditEntry = (entry: PromologEntry) => {
    // El form (PromologEntryFormDialog) se autocarga desde `entry` + las stories
    // del día (selectedDayStories), así que acá solo seleccionamos y abrimos.
    setSelectedEntry(entry);
    setEditEntryOpen(true);
  };
  const handleDeleteEntry = (entry: PromologEntry) => {
    setSelectedEntry(entry);
    setDeleteEntryOpen(true);
  };
  const handleAssignAgent = (entry: PromologEntry) => {
    setAssignAgentTarget(entry);
    setAssignAgentSelected(entry.reviewed_by || "");
    setAssignAgentSearch("");
    setAssignAgentOpen(true);
  };
  const handleNotesChange = async (entryId: string, notes: string | null) => {
    const { error } = await supabase.from("promolog_entries").update({ notes }).eq("id", entryId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["promolog-entries", user?.id] });
  };

  // Override manual del veredicto de UNA historia (desde la galería del popup): persiste
  // `promoted`, marca review humano y refresca → la dedup recalcula el resultado del día
  // (Sí si CUALQUIER historia quedó en Sí).
  const handleSetStoryVerdict = async (story: PromologEntry, verdict: "Sí" | "No") => {
    if (story.result === verdict) return;
    setVerdictSavingId(story.id);
    const { error } = await supabase
      .from("promolog_entries")
      .update({ promoted: verdict === "Sí" ? "true" : "false", reviewed_by: user?.id })
      .eq("id", story.id);
    setVerdictSavingId(null);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["promolog-entries", user?.id] });
  };

  const [campaignModalOpen, setCampaignModalOpen] = useState(false);
  const [campaignCreator, setCampaignCreator] = useState("");
  const [campaignMonth, setCampaignMonth] = useState<Date | undefined>(undefined);
  const [campaignGoalMonthly, setCampaignGoalMonthly] = useState("");
  const [campaignGoalWeekly, setCampaignGoalWeekly] = useState("");
  const [campaignCreatorOpen, setCampaignCreatorOpen] = useState(false);
  const [campaignMonthOpen, setCampaignMonthOpen] = useState(false);

  const handleCreateCampaign = async () => {
    if (!campaignCreator || !campaignMonth || !campaignGoalMonthly) {
      toast({ title: "Campos requeridos", description: "Completa todos los campos obligatorios.", variant: "destructive" });
      return;
    }
    const monthDate = new Date(campaignMonth.getFullYear(), campaignMonth.getMonth(), 1);
    const { error } = await supabase.from("promolog_campaigns").insert({
      creator_id: campaignCreator,
      month_year: monthDate.toISOString().split("T")[0],
      goal_monthly: parseInt(campaignGoalMonthly) || 0,
      goal_weekly: parseInt(campaignGoalWeekly) || 0,
      status: "activa",
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["promolog-campaigns"] });
    toast({ title: "Campaña creada", description: "La campaña mensual se ha creado correctamente." });
    setCampaignModalOpen(false);
    setCampaignCreator("");
    setCampaignMonth(undefined);
    setCampaignGoalMonthly("");
    setCampaignGoalWeekly("");
  };

  const getInitials = (name: string) => name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

  const countryFlags: Record<string, string> = {
    colombia: "🇨🇴", mexico: "🇲🇽", argentina: "🇦🇷", chile: "🇨🇱", peru: "🇵🇪",
    venezuela: "🇻🇪", ecuador: "🇪🇨", españa: "🇪🇸", "estados unidos": "🇺🇸", brasil: "🇧🇷",
    uruguay: "🇺🇾", "costa rica": "🇨🇷", panama: "🇵🇦", "república dominicana": "🇩🇴",
  };

  const getCountryFlag = (country?: string | null) => {
    if (!country) return "🌎";
    return countryFlags[country.toLowerCase()] || "🌎";
  };

  const getCategoryBadgeVariant = (cat?: string | null): "default" | "success" | "warning" | "secondary" | "destructive" => {
    switch (cat) {
      case "A+": return "default";
      case "A": return "success";
      case "B+": return "warning";
      case "B": return "warning";
      case "C": return "secondary";
      default: return "secondary";
    }
  };

  // Stats del modal "Agregar Promo":
  //   · Total Activas:    creadoras con flujo de promo activo (= creators)
  //   · Promocionaron hoy: # activas con al menos 1 entry result="Sí" hoy
  //   · Sin actividad hoy: total - promocionaron (las que faltan reportar)
  // El cálculo de "hoy" usa la zona del browser/user para el match.
  // (Si en el futuro queremos que use el TZ elegido en topbar, hay que
  // pasarlo aquí — por ahora el caso simple alcanza.)
  const promotedTodayIds = useMemo(() => {
    const today = new Date();
    const todayStr = today.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
    const ids = new Set<string>();
    for (const e of dedupedEntries) {
      if (e.result === "Sí" && e.date === todayStr && e.creator_id) {
        ids.add(e.creator_id);
      }
    }
    return ids;
  }, [dedupedEntries]);
  const totalActiveCreators = creators.length;
  const completedToday = promotedTodayIds.size;
  const pendingCreators = totalActiveCreators - completedToday;

  // filteredCreators removido — la lógica de filtrado/agrupado vive
  // inline en el modal "Selecciona Creadora Activa" porque necesita
  // construir buckets por categoría con headers colapsables.

  const [searchEntry, setSearchEntry] = useState("");
  const [promoPage, setPromoPage] = useState(1);
  const [promoPageSize, setPromoPageSize] = useState(25);
  // Orden de la tabla de Promos — vive ACÁ (en el padre) para ordenar el dataset
  // COMPLETO antes de paginar. Si viviera en la tabla, solo ordenaría la página
  // visible (las filas quedaban desparramadas entre páginas). null = sin orden
  // explícito → se respeta el orden de la query (creación desc).
  const [promoSortKey, setPromoSortKey] = useState<SortKey | null>(null);
  const [promoSortAsc, setPromoSortAsc] = useState(true);
  const handlePromoSort = (key: SortKey) => {
    if (promoSortKey === key) {
      setPromoSortAsc((a) => !a);
    } else {
      setPromoSortKey(key);
      setPromoSortAsc(true);
    }
    setPromoPage(1); // volver a la página 1 para ver el inicio del nuevo orden
  };
  const [statsCollapsed, setStatsCollapsed] = useState(false);
  const handleContentScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setStatsCollapsed(e.currentTarget.scrollTop > 40);
  }, []);

  // Reset a la página 1 cuando cambia el rango de fechas o CUALQUIER filtro.
  // Bug (2026-06-08): sin esto, si estabas en una página alta (ej. p.15 de
  // "Este mes" = 359 registros) y cambiabas a un rango más chico ("Hoy" = 3
  // páginas), la tabla quedaba en una página fuera de rango → "No hay entradas"
  // aunque sí había registros. Se veía como "el filtro de tiempo no funciona".
  useEffect(() => {
    setPromoPage(1);
  }, [dateFrom, dateTo, selectedStatus, selectedNetwork, selectedCardPlatform, searchEntry, selectedCreatorFilter]);

  // KPI modal state. "creadores_escaneados" abre un modal especial con
  // las creadoras únicas agrupadas por categoría (Elite, A+, ...). Los
  // otros tipos siguen mostrando entries individuales.
  type KpiModalType = "ingresados" | "no_chequeadas" | "completadas" | "creadores_escaneados" | null;
  const [kpiModalType, setKpiModalType] = useState<KpiModalType>(null);
  // Categorías colapsadas dentro del modal "Creadores escaneados".
  // Default: solo la primera categoría con resultados queda expandida.
  const [kpiCollapsed, setKpiCollapsed] = useState<Set<string>>(new Set());
  // Reset el collapsed state al abrir/cerrar/cambiar de KPI para que
  // siempre arranque con el default (solo top expandida).
  const openKpiModal = (next: KpiModalType) => {
    setKpiModalType(next);
    setKpiCollapsed(new Set());
  };
  const closeKpiModal = () => {
    setKpiModalType(null);
    setKpiCollapsed(new Set());
  };

  const kpiModalEntries = useMemo(() => {
    if (!kpiModalType) return [];
    if (kpiModalType === "no_chequeadas") return dedupedEntries.filter(e => e.result === "Pendiente");
    if (kpiModalType === "completadas") return dedupedEntries.filter(e => e.result === "Sí");
    return dedupedEntries;
  }, [dedupedEntries, kpiModalType]);
  const kpiModalTitle = kpiModalType === "ingresados" ? "Tickets Ingresados"
    : kpiModalType === "no_chequeadas" ? "Tickets NO Chequeadas"
    : kpiModalType === "completadas" ? "Tickets Completadas Hoy"
    : "Creadores Escaneados";

  const navigate = useNavigate();

  const filteredEntries = useMemo(() => {
    return dedupedEntries.filter((entry) => {
      if (selectedCreatorFilter !== "" && entry.creator_id !== selectedCreatorFilter) return false;
      if (selectedStatus !== "") {
        const statusMap: Record<string, string> = { si_promociono: "Sí", no_promociono: "No", parcial: "Parcial", pendiente: "Pendiente" };
        if (entry.result !== statusMap[selectedStatus]) return false;
      }
      if (selectedNetwork !== "" && !(entry.networks ?? [entry.network]).includes(selectedNetwork)) return false;
      if (selectedCardPlatform !== "" && !(entry.platform || "").toLowerCase().includes(selectedCardPlatform)) return false;
      if (searchEntry) {
        const q = searchEntry.toLowerCase();
        if (!entry.name.toLowerCase().includes(q) && !entry.ticketNumber.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [dedupedEntries, selectedCreatorFilter, selectedStatus, selectedNetwork, selectedCardPlatform, searchEntry]);

  // Orden GLOBAL antes de paginar. Sin orden explícito (null) se respeta el orden
  // de la query; con orden se ordena el set completo y recién ahí se corta la página.
  const sortedFilteredEntries = useMemo(
    () => (promoSortKey ? sortPromologEntries(filteredEntries, promoSortKey, promoSortAsc) : filteredEntries),
    [filteredEntries, promoSortKey, promoSortAsc],
  );

  // Resumen por creator para el KPI "Creadores escaneados" + su modal.
  // Una creadora cuenta como "Promocionó" si tiene AL MENOS una entry
  // result === "Sí" en el período filtrado; sino cuenta como "No
  // promocionó". Entries pendientes no califican como promoción.
  type CreatorScanRow = {
    creatorId: string;
    name: string;
    handle: string | null;
    category: string | null;
    promoted: boolean;
    entryCount: number;
  };
  const creatorsScan = useMemo<CreatorScanRow[]>(() => {
    const byCreator = new Map<string, CreatorScanRow>();
    for (const e of filteredEntries) {
      const id = e.creator_id || `__no_id__${e.name}`;
      const existing = byCreator.get(id);
      if (existing) {
        existing.entryCount += 1;
        if (e.result === "Sí") existing.promoted = true;
      } else {
        byCreator.set(id, {
          creatorId: id,
          name: e.name,
          handle: e.handle ?? null,
          category: e.category ?? null,
          promoted: e.result === "Sí",
          entryCount: 1,
        });
      }
    }
    return Array.from(byCreator.values());
  }, [filteredEntries]);
  const creatorsScannedCount = creatorsScan.length;
  const creatorsPromotedCount = useMemo(() => creatorsScan.filter(c => c.promoted).length, [creatorsScan]);
  const creatorsNotPromotedCount = creatorsScannedCount - creatorsPromotedCount;

  const formattedDate = dateFrom ? dateFrom.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }) : "Seleccionar fecha";
  const shortDate = dateFrom ? dateFrom.toLocaleDateString("es-ES", { day: "numeric", month: "short" }) : "";

  // If agent detail is selected, render that view
  if (selectedAgent) {
    return (
      <PromologAgentDetailView
        agent={selectedAgent}
        onBack={() => setSelectedAgent(null)}
      />
    );
  }

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      {/* Header global — título a la izquierda, presets (Ayer/Hoy/...) +
          DateRangePicker a la derecha. Mismo patrón que PanelDeControl.
          El date range que vive acá afecta a los 3 subtabs (Dashboard,
          Promos, Agentes) — es la única fuente de verdad temporal. */}
      <header className="bg-background/30 backdrop-blur-xl px-6 pt-6 pb-4 border-b border-white/10 shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Promolog</h1>
            <p className="text-sm text-muted-foreground">Seguimiento promocional diario</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <DateRangePresets
              range={{ from: dateFrom ?? new Date(), to: dateTo ?? new Date() }}
              activePreset={activeDatePreset}
              onChange={(r, preset) => {
                setDateFrom(r.from);
                setDateTo(r.to);
                setActiveDatePreset(preset);
              }}
            />
            <Button variant="default" size="sm" className="h-9" onClick={() => setCreatorsModalOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Agregar Promo
            </Button>
          </div>
        </div>
      </header>

      {/* Tabs — SubtabNav (glow azul gradient + ring) para match
          con Closers / LeadGen / Creadores / etc. */}
      <div className="shrink-0 px-6 pt-3 pb-2">
        <SubtabNav>
          {tabItems.filter(tab => {
            if (tab.id === "agentes") return isManagement;
            if (tab.id === "calendario") return isManagement;
            if (tab.id === "promobot") return canPromobot;
            return true;
          }).map((tab) => (
            <SubtabNavItem
              key={tab.id}
              active={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="gap-1.5"
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </SubtabNavItem>
          ))}
        </SubtabNav>
      </div>

      {/* Promobot tab — control manual del pipeline (lanzar + monitor de corridas) */}
      {activeTab === "promobot" && canPromobot && <PromobotPanel />}

      {/* Calendario tab — calendario mensual por creadora: días que promocionó / no / sin análisis */}
      {activeTab === "calendario" && isManagement && <PromologCalendarView creators={creators} onEditEntry={handleEditEntry} />}

      {/* Dashboard tab — KPIs, podios, insights, trend, acción */}
      {activeTab === "dashboard" && (
        <PromologDashboardView
          filteredEntries={filteredEntries}
          dedupedEntries={dedupedEntries}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onOpenKpiModal={openKpiModal}
          onOpenEntry={handleViewEntry}
          activeCreatorsCount={creators.length}
          activeCreators={creators as any}
          prevMetrics={prevMetrics}
        />
      )}

      {/* Promos tab */}
      {activeTab === "promos" && (
        <>
          {/* Filters */}
          <div className="shrink-0 px-6 pb-2">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar entrada..." className="pl-9 h-9" value={searchEntry} onChange={(e) => setSearchEntry(e.target.value)} />
              </div>
              <Select value={selectedStatus || undefined} onValueChange={(v) => setSelectedStatus(v === "__all__" ? "" : v)}>
                <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Estado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  <SelectItem value="si_promociono">Sí</SelectItem>
                  <SelectItem value="no_promociono">No</SelectItem>
                  <SelectItem value="parcial">Parcial</SelectItem>
                  <SelectItem value="pendiente">Pendiente</SelectItem>
                </SelectContent>
              </Select>
              <Select value={selectedNetwork || undefined} onValueChange={(v) => setSelectedNetwork(v === "__all__" ? "" : v)}>
                <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Red Social" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {networkOptions.map((n) => (
                    <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedCardPlatform || undefined} onValueChange={(v) => setSelectedCardPlatform(v === "__all__" ? "" : v)}>
                <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Plataforma" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  <SelectItem value="onlyfans">OnlyFans</SelectItem>
                  <SelectItem value="unlok">Unlok</SelectItem>
                  <SelectItem value="otra">Otra</SelectItem>
                </SelectContent>
              </Select>
              {/* DateRangePicker removido — ahora vive global en el header
                  (DateRangePresets con chips Ayer/Hoy/Semana/Mes). El
                  rango afecta a los 3 subtabs (Dashboard, Promos, Agentes)
                  desde una sola fuente, eliminando la duplicidad anterior. */}
              {(searchEntry || selectedStatus || selectedNetwork || selectedCardPlatform || selectedCreatorFilter) && (
                <Button variant="ghost" size="sm" className="h-9" onClick={() => { setSearchEntry(""); setSelectedStatus(""); setSelectedNetwork(""); setSelectedCardPlatform(""); setSelectedCreatorFilter(""); }}>
                  <X className="mr-1.5 h-4 w-4" />
                  Limpiar filtros
                </Button>
              )}
              <div className="ml-auto flex gap-1">
                <Button variant={entryView === "list" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setEntryView("list")}>
                  <List className="h-4 w-4" />
                </Button>
                <Button variant={entryView === "grid" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setEntryView("grid")}>
                  <LayoutGrid className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Table area */}
          <div className="flex-1 min-h-0 px-6 pb-4 flex flex-col">
            {entryView === "list" ? (
              <DataTableShell
                onScroll={handleContentScroll}
                className="flex-1 min-h-0"
                currentPage={promoPage}
                totalPages={Math.max(1, Math.ceil(filteredEntries.length / promoPageSize))}
                totalCount={filteredEntries.length}
                pageSize={promoPageSize}
                onPageChange={setPromoPage}
                onPageSizeChange={(s) => { setPromoPageSize(s); setPromoPage(1); }}
              >
                <PromologTable
                  entries={sortedFilteredEntries.slice((promoPage - 1) * promoPageSize, promoPage * promoPageSize)}
                  onView={handleViewEntry}
                  onEdit={handleEditEntry}
                  onDelete={handleDeleteEntry}
                  onNotesChange={handleNotesChange}
                  onAssignAgent={handleAssignAgent}
                  isManagement={isManagement}
                  sortKey={promoSortKey ?? undefined}
                  sortAsc={promoSortAsc}
                  onSort={handlePromoSort}
                />
              </DataTableShell>
            ) : (
              <div className="flex-1 min-h-0 overflow-auto">
                <PromologGrid entries={filteredEntries} onView={handleViewEntry} onEdit={handleEditEntry} onDelete={handleDeleteEntry} />
              </div>
            )}
          </div>
        </>
      )}

      {/* Agentes tab */}
      {activeTab === "agentes" && (
        <div className="flex-1 min-h-0 overflow-auto p-6 space-y-6">
          <AnalyticsSectionBanner
            title="Rendimiento de Agentes"
            subtitle={
              agentesView === "calendar"
                ? (() => { const days = getAgentWeekDays(agentWeekOffset); return `${format(days[0], "d 'de' MMMM", { locale: es })} – ${format(days[6], "d 'de' MMMM, yyyy", { locale: es })}`; })()
                : (dateFrom ? dateFrom.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }) : "Seleccionar fecha")
            }
            count={agentsData.length}
            countLabel="Agentes Activos"
          />

          {/* Calendar view or agent cards */}
          {agentesView === "calendar" ? (() => {
            const weekDays = getAgentWeekDays(agentWeekOffset);
            const entriesInDay = (agentId: string, day: Date) =>
              promologEntries.filter(pe =>
                (pe.reviewed_by === agentId || pe.created_by === agentId) &&
                pe.promoted === "true" &&
                isSameDay(new Date(pe.date), day)
              ).length;
            const colTotals = weekDays.map(day =>
              agentsData.reduce((sum, ag) => sum + entriesInDay(ag.id, day), 0)
            );
            const grandTotal = colTotals.reduce((a, b) => a + b, 0);
            return (
              <Card>
                <CardContent className="pt-4 px-4 pb-4">
                  <div className="flex items-center justify-between mb-4">
                    <Button variant="outline" size="sm" onClick={() => setAgentWeekOffset(w => w - 1)}>
                      <ChevronLeft className="h-4 w-4 mr-1" /> Semana anterior
                    </Button>
                    <span className="text-sm font-medium text-muted-foreground">
                      {format(weekDays[0], "d 'de' MMMM", { locale: es })} – {format(weekDays[6], "d 'de' MMMM, yyyy", { locale: es })}
                    </span>
                    <Button variant="outline" size="sm" onClick={() => setAgentWeekOffset(w => w + 1)} disabled={agentWeekOffset >= 0}>
                      Semana siguiente <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[140px]">Agente</TableHead>
                          {weekDays.map((day, i) => (
                            <TableHead key={i} className={`text-center min-w-[70px] ${isToday(day) ? "bg-primary/10 text-primary font-bold" : ""}`}>
                              {DAY_LABELS_ES[i]} {format(day, "d")}
                            </TableHead>
                          ))}
                          <TableHead className="text-center font-semibold">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {agentsData.map((agent) => {
                          const dayCounts = weekDays.map(day => entriesInDay(agent.id, day));
                          const rowTotal = dayCounts.reduce((a, b) => a + b, 0);
                          return (
                            <TableRow key={agent.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedAgent({ id: agent.id, name: agent.name })}>
                              <TableCell className="font-medium text-sm">{agent.name}</TableCell>
                              {dayCounts.map((cnt, i) => (
                                <TableCell key={i} className={`text-center text-sm ${isToday(weekDays[i]) ? "bg-primary/10 text-primary font-bold" : ""} ${(cnt === 0 || isFuture(startOfDay(weekDays[i]))) ? "text-muted-foreground" : ""}`}>
                                  {isFuture(startOfDay(weekDays[i])) || cnt === 0 ? "—" : cnt}
                                </TableCell>
                              ))}
                              <TableCell className="text-center font-semibold">{rowTotal > 0 ? rowTotal : "—"}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                      <tfoot>
                        <TableRow className="border-t-2 bg-muted/30">
                          <TableCell className="font-bold text-sm">Total</TableCell>
                          {colTotals.map((t, i) => (
                            <TableCell key={i} className={`text-center font-bold text-sm ${isToday(weekDays[i]) ? "bg-primary/10 text-primary" : ""} ${(t === 0 || isFuture(startOfDay(weekDays[i]))) ? "text-muted-foreground" : ""}`}>
                              {isFuture(startOfDay(weekDays[i])) || t === 0 ? "—" : t}
                            </TableCell>
                          ))}
                          <TableCell className="text-center">
                            <Badge variant="default">{grandTotal}</Badge>
                          </TableCell>
                        </TableRow>
                      </tfoot>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            );
          })() : (
          agentsData.filter(a => !searchAgent || a.name.toLowerCase().includes(searchAgent.toLowerCase())).length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                    <Users className="h-8 w-8 text-muted-foreground/50" />
                  </div>
                  <p className="text-muted-foreground text-sm">No hay datos para esta fecha</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <DataTableShell
              currentPage={1}
              totalPages={1}
              totalCount={agentsData.filter(a => !searchAgent || a.name.toLowerCase().includes(searchAgent.toLowerCase())).length}
              pageSize={50}
              onPageChange={() => {}}
              className="flex-1 min-h-0"
            >
              <Table className="min-w-[700px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky top-0 bg-background z-10 min-w-[200px]">Agente</TableHead>
                    <TableHead className="sticky top-0 bg-background z-10 text-center min-w-[70px]">Total</TableHead>
                    <TableHead className="sticky top-0 bg-background z-10 text-center min-w-[60px]">Sí</TableHead>
                    <TableHead className="sticky top-0 bg-background z-10 text-center min-w-[70px]">Parcial</TableHead>
                    <TableHead className="sticky top-0 bg-background z-10 text-center min-w-[60px]">No</TableHead>
                    <TableHead className="sticky top-0 bg-background z-10 text-center min-w-[120px]">Redes</TableHead>
                    <TableHead className="sticky top-0 bg-background z-10 text-right w-[80px]">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agentsData.filter(a => !searchAgent || a.name.toLowerCase().includes(searchAgent.toLowerCase())).map((agent) => {
                    const initials = agent.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
                    const successRate = agent.tickets > 0 ? Math.round((agent.si / agent.tickets) * 100) : 0;
                    return (
                      <TableRow key={agent.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedAgent({ id: agent.id, name: agent.name })}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9">
                              <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">{initials}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold truncate">{agent.name}</p>
                              <p className="text-xs text-muted-foreground">{successRate}% éxito</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className="text-xs">{agent.tickets}</Badge>
                        </TableCell>
                        <TableCell className="text-center text-sm font-medium text-success">{agent.si}</TableCell>
                        <TableCell className="text-center text-sm font-medium text-warning">{agent.parcial}</TableCell>
                        <TableCell className="text-center text-sm font-medium text-destructive">{agent.no}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1 flex-wrap">
                            {agent.badges.map((b: { label: string; value: number }) => (
                              <Badge key={b.label} variant="outline" className="text-xs">{b.label} {b.value}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setSelectedAgent({ id: agent.id, name: agent.name }); }}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </DataTableShell>
          ))}
        </div>
      )}

      {/* Creators Selection Modal — sólo creadoras ACTIVAS (las que el
          flujo de promo realmente trackea). Los counts ahora reflejan el
          estado real del día: total activas, cuántas ya promocionaron
          hoy (entry result=Sí en HOY) y cuántas faltan reportar. */}
        <Dialog open={creatorsModalOpen} onOpenChange={setCreatorsModalOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
            <DialogHeader className="pr-8">
              <DialogTitle>Selecciona una Creadora Activa</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-3 gap-3">
              <Card className="border-t-[3px] border-t-blue-500">
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Total Activas</p>
                  <p className="text-xl font-bold text-blue-500">{totalActiveCreators}</p>
                </CardContent>
              </Card>
              <Card className="border-t-[3px] border-t-warning">
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Sin actividad hoy</p>
                  <p className="text-xl font-bold text-warning">{pendingCreators}</p>
                </CardContent>
              </Card>
              <Card className="border-t-[3px] border-t-success">
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Promocionaron hoy</p>
                  <p className="text-xl font-bold text-success">{completedToday}</p>
                </CardContent>
              </Card>
            </div>
            {/* Solo el campo de búsqueda — el ordenamiento ya no es
                necesario porque agrupamos por categoría siguiendo el
                orden canónico (Elite → A+ → A → ...). Mismo patrón que
                el modal "Creadores Escaneados" del Dashboard. */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar creadora..." value={searchCreator} onChange={(e) => setSearchCreator(e.target.value)} className="pl-9" />
            </div>
            <ScrollArea className="flex-1 min-h-0 max-h-[55vh]">
              {(() => {
                // Filtrar por búsqueda (sin sortOrder — el agrupado por
                // categoría reemplaza al sort manual).
                const list = searchCreator
                  ? creators.filter(c =>
                      c.name.toLowerCase().includes(searchCreator.toLowerCase())
                      || (c.artistic_name?.toLowerCase().includes(searchCreator.toLowerCase()))
                    )
                  : [...creators];
                const sorted = [...list].sort((a, b) => (a.artistic_name || a.name).localeCompare(b.artistic_name || b.name));
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
                // Default expand: solo la primera categoría con
                // resultados. El user puede expandir el resto con click.
                const effectiveCollapsed = creatorModalCollapsed.size === 0
                  ? new Set(sortedCats.slice(1))
                  : creatorModalCollapsed;
                const toggleCat = (cat: string) => {
                  const base = creatorModalCollapsed.size === 0
                    ? new Set(sortedCats.slice(1))
                    : new Set(creatorModalCollapsed);
                  if (base.has(cat)) base.delete(cat);
                  else base.add(cat);
                  setCreatorModalCollapsed(base);
                };
                if (sorted.length === 0) {
                  return <p className="text-center text-sm text-muted-foreground py-8">Sin resultados para "{searchCreator}"</p>;
                }
                return (
                  <div className="space-y-3 pr-2">
                    {sortedCats.map((cat) => {
                      const rows = buckets.get(cat)!;
                      const isCollapsed = effectiveCollapsed.has(cat);
                      const pendingInCat = rows.filter(r => !promotedTodayIds.has(r.id)).length;
                      return (
                        <div key={cat} className="space-y-1.5">
                          <CategorySectionHeader
                            cat={cat}
                            count={rows.length}
                            isCollapsed={isCollapsed}
                            onToggle={() => toggleCat(cat)}
                          />
                          {!isCollapsed && (
                            <div className="space-y-0.5 pl-1">
                              {/* Subheader pequeño: cuántas faltan reportar en esta cat */}
                              {pendingInCat > 0 && (
                                <p className="text-[10px] text-muted-foreground px-2 pb-1">
                                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-destructive mr-1.5 align-middle" />
                                  {pendingInCat} sin promo hoy
                                </p>
                              )}
                              {rows.map((creator) => (
                                <div
                                  key={creator.id}
                                  className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50 rounded-md transition-colors"
                                  onClick={() => {
                                    setSelectedCreatorForEntry(creator);
                                    setEntryModalOpen(true);
                                    setCreatorsModalOpen(false);
                                  }}
                                >
                                  <div className="relative shrink-0">
                                    <Avatar className="h-8 w-8 border border-muted-foreground/30">
                                      {creator.profile_photo_url ? <AvatarImage src={creator.profile_photo_url} alt={creator.name} /> : null}
                                      <AvatarFallback className="bg-muted text-xs font-medium">{creator.name.charAt(0).toUpperCase()}</AvatarFallback>
                                    </Avatar>
                                    {!promotedTodayIds.has(creator.id) && (
                                      <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-destructive border-2 border-background" title="Sin promo hoy" />
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{creator.artistic_name || creator.name}</p>
                                    <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
                                      {creator.instagram_handle && (
                                        <span className="flex items-center gap-0.5 truncate"><InstagramIcon className="h-3 w-3 shrink-0" />@{creator.instagram_handle.replace(/^@/, "").replace(/\/$/, "").split("/").pop()}</span>
                                      )}
                                      {creator.tiktok_handle && (
                                        <span className="flex items-center gap-0.5 truncate"><TikTokIcon className="h-3 w-3 shrink-0" />@{creator.tiktok_handle}</span>
                                      )}
                                    </div>
                                  </div>
                                  <span className="text-sm shrink-0">{getCountryFlag(creator.country)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </ScrollArea>
          </DialogContent>
        </Dialog>

        {/* Registrar Promoción — form compartido (mismo componente que Editar). */}
        <PromologEntryFormDialog
          mode="add"
          open={entryModalOpen}
          onOpenChange={setEntryModalOpen}
          creator={selectedCreatorForEntry}
        />

        {/* View Entry Modal — ahora muestra todo lo que el bot Promolog
            graba: red social, plataforma destino, link de compra, acción
            tomada, notas, evidencia visual (pantallazo de la story/post),
            y razonamiento de la AI cuando viene del pipeline automático.
            "Tipo de Contacto" se eliminó del flow porque era ruido para
            el equipo de management — la red social + plataforma ya dicen
            por dónde vino la promo. */}
        {selectedEntry && (
          <PromologEntryDetailDialog
            open={viewEntryOpen}
            onOpenChange={setViewEntryOpen}
            entry={selectedEntry}
            dayStories={selectedDayStories}
            dayNetworks={selectedDayByNetwork}
            dayResult={dayResult}
            onSetVerdict={handleSetStoryVerdict}
            savingId={verdictSavingId}
            onEdit={(e) => { setViewEntryOpen(false); handleEditEntry(e); }}
          />
        )}

        {/* Editar Promoción — form compartido (mismo componente que Registrar). */}
        {selectedEntry && (
          <PromologEntryFormDialog
            mode="edit"
            open={editEntryOpen}
            onOpenChange={setEditEntryOpen}
            entry={selectedEntry}
            dayStories={selectedDayStories}
            dayEntries={selectedDayEntries}
          />
        )}

        {/* Delete Entry Dialog */}
        {selectedEntry && (
          <Dialog open={deleteEntryOpen} onOpenChange={setDeleteEntryOpen}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Eliminar Entrada</DialogTitle>
                <DialogDescription>¿Estás seguro de que deseas eliminar la entrada de <span className="font-semibold">{selectedEntry.name}</span>? Esta acción no se puede deshacer.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteEntryOpen(false)}>Cancelar</Button>
                <Button variant="destructive" onClick={async () => {
                  const { error } = await supabase
                    .from("promolog_entries")
                    .delete()
                    .eq("id", selectedEntry.id);
                  if (error) {
                    toast({ title: "Error al eliminar", description: error.message, variant: "destructive" });
                    return;
                  }
                  queryClient.invalidateQueries({ queryKey: ["promolog-entries", user?.id] });
                  setDeleteEntryOpen(false);
                  toast({ title: "Entrada eliminada", description: `La entrada de ${selectedEntry.name} ha sido eliminada.` });
                }}>Eliminar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Campaign Modal */}
        <Dialog open={campaignModalOpen} onOpenChange={setCampaignModalOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader className="pr-8">
              <DialogTitle>Nueva Campaña Mensual</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Creador/a *</Label>
                <Popover open={campaignCreatorOpen} onOpenChange={setCampaignCreatorOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" aria-expanded={campaignCreatorOpen} className="w-full justify-between font-normal">
                      {campaignCreator
                        ? (creators.find(c => c.id === campaignCreator)?.artistic_name || creators.find(c => c.id === campaignCreator)?.name || "Seleccionar creador/a")
                        : "Seleccionar creador/a"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar creador/a..." />
                      <CommandList>
                        <CommandEmpty>No se encontró.</CommandEmpty>
                        {creators.map((c) => (
                          <CommandItem key={c.id} value={c.artistic_name || c.name} onSelect={() => { setCampaignCreator(c.id); setCampaignCreatorOpen(false); }}>
                            <Check className={cn("mr-2 h-4 w-4", campaignCreator === c.id ? "opacity-100" : "opacity-0")} />
                            {c.artistic_name || c.name}
                          </CommandItem>
                        ))}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Mes/Año *</Label>
                <Popover open={campaignMonthOpen} onOpenChange={setCampaignMonthOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !campaignMonth && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {campaignMonth ? format(campaignMonth, "MMMM yyyy") : "Seleccionar mes"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-4" align="start">
                    <div className="flex items-center gap-2">
                      <Select
                        value={campaignMonth ? String(campaignMonth.getMonth()) : undefined}
                        onValueChange={(m) => {
                          const year = campaignMonth ? campaignMonth.getFullYear() : new Date().getFullYear();
                          const d = new Date(year, Number(m), 1);
                          setCampaignMonth(d);
                          if (campaignMonth && campaignMonth.getFullYear()) setCampaignMonthOpen(false);
                        }}
                      >
                        <SelectTrigger className="w-[130px]"><SelectValue placeholder="Mes" /></SelectTrigger>
                        <SelectContent>
                          {["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"].map((m, i) => (
                            <SelectItem key={i} value={String(i)}>{m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={campaignMonth ? String(campaignMonth.getFullYear()) : undefined}
                        onValueChange={(y) => {
                          const month = campaignMonth ? campaignMonth.getMonth() : new Date().getMonth();
                          const d = new Date(Number(y), month, 1);
                          setCampaignMonth(d);
                          if (campaignMonth && campaignMonth.getMonth() !== undefined) setCampaignMonthOpen(false);
                        }}
                      >
                        <SelectTrigger className="w-[100px]"><SelectValue placeholder="Año" /></SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - 1 + i).map((y) => (
                            <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Objetivo Mensual *</Label>
                  <Input type="number" placeholder="Ej: 20" value={campaignGoalMonthly} onChange={(e) => setCampaignGoalMonthly(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Objetivo Semanal *</Label>
                  <Input type="number" placeholder="Ej: 5" value={campaignGoalWeekly} onChange={(e) => setCampaignGoalWeekly(e.target.value)} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCampaignModalOpen(false)}>Cancelar</Button>
              <Button onClick={handleCreateCampaign}>Crear Campaña</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      {/* KPI Detail Modal */}
      <Dialog open={!!kpiModalType} onOpenChange={(open) => !open && closeKpiModal()}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {kpiModalType === "creadores_escaneados" && <Users className="h-5 w-5 text-blue-500" />}
              {kpiModalTitle}
            </DialogTitle>
            <DialogDescription>
              {kpiModalType === "creadores_escaneados" ? (
                <span className="inline-flex items-center gap-2">
                  <span>{creatorsScannedCount} {creatorsScannedCount === 1 ? "creadora escaneada" : "creadoras escaneadas"}</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400 ring-1 ring-emerald-500/30">
                    <CheckCircle2 className="h-3 w-3" /> {creatorsPromotedCount}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-400 ring-1 ring-rose-500/30">
                    <XCircle className="h-3 w-3" /> {creatorsNotPromotedCount}
                  </span>
                </span>
              ) : (
                <>{kpiModalEntries.length} {kpiModalEntries.length === 1 ? "entrada" : "entradas"} encontradas</>
              )}
            </DialogDescription>
          </DialogHeader>

          {kpiModalType === "creadores_escaneados" ? (
            // ─── Branch nuevo: creadoras agrupadas por categoría ───
            // Mismo patrón que el popup de Dashboard v2 / Panel de Control:
            // sortear por CATEGORY_ORDER (Elite > A+ > A > B+ > B > C+ > C),
            // header sticky por categoría, default solo la primera con
            // resultados expandida. Click en una creadora navega a su
            // perfil.
            creatorsScan.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Info className="h-10 w-10 mb-2 opacity-40" />
                <p className="text-sm">No hay creadoras escaneadas en este período.</p>
              </div>
            ) : (() => {
              const sorted = [...creatorsScan].sort((a, b) => a.name.localeCompare(b.name));
              const buckets = new Map<string, CreatorScanRow[]>();
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
              // Default: solo la primera categoría con resultados queda
              // expandida; el resto colapsadas. El user puede expandir las
              // demás clickeando el header.
              const effectiveCollapsed = kpiCollapsed.size === 0
                ? new Set(sortedCats.slice(1))
                : kpiCollapsed;
              const toggleCat = (cat: string) => {
                const base = kpiCollapsed.size === 0
                  ? new Set(sortedCats.slice(1))
                  : new Set(kpiCollapsed);
                if (base.has(cat)) base.delete(cat);
                else base.add(cat);
                setKpiCollapsed(base);
              };
              return (
                <div className="max-h-[60vh] overflow-auto space-y-3 mt-2">
                  {sortedCats.map((cat) => {
                    const rows = buckets.get(cat)!;
                    const isCollapsed = effectiveCollapsed.has(cat);
                    const catPromoted = rows.filter(r => r.promoted).length;
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
                            {/* Mini-subheader con desglose de la categoría */}
                            <div className="flex items-center gap-2 px-1 text-[10px] text-muted-foreground">
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-emerald-400">
                                <CheckCircle2 className="h-2.5 w-2.5" /> {catPromoted}
                              </span>
                              <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-1.5 py-0.5 text-rose-400">
                                <XCircle className="h-2.5 w-2.5" /> {rows.length - catPromoted}
                              </span>
                            </div>
                            {rows.map((c) => (
                              <ListRowButton
                                key={c.creatorId}
                                onClick={() => {
                                  if (!c.creatorId.startsWith("__no_id__")) {
                                    navigate(`/creadores/${c.creatorId}`);
                                    closeKpiModal();
                                  }
                                }}
                                className="justify-between"
                              >
                                <div className="min-w-0 flex-1 flex items-center gap-2">
                                  <span className="font-medium truncate">{c.name}</span>
                                  {c.handle && (
                                    <span className="text-[10px] text-muted-foreground truncate">@{c.handle.replace(/^@/, "").replace(/\/$/, "").split("/").pop()}</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {c.promoted ? (
                                    <Badge variant="success-soft" className="text-[10px] gap-1">
                                      <CheckCircle2 className="h-3 w-3" />
                                      Promocionó
                                    </Badge>
                                  ) : (
                                    <Badge variant="destructive-soft" className="text-[10px] gap-1">
                                      <XCircle className="h-3 w-3" />
                                      No promocionó
                                    </Badge>
                                  )}
                                  <span className="text-[10px] text-muted-foreground tabular-nums w-14 text-right">
                                    {c.entryCount} {c.entryCount === 1 ? "entry" : "entries"}
                                  </span>
                                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                                </div>
                              </ListRowButton>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()
          ) : kpiModalEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Info className="h-10 w-10 mb-2 opacity-40" />
              <p className="text-sm">No hay entradas para mostrar</p>
            </div>
          ) : (
            <div className="max-h-[500px] overflow-auto space-y-1.5">
              {/* Header labels — sticky para alinearse con las columnas
                  de cada ListRow. */}
              <div className="sticky top-0 z-[1] flex items-center gap-3 px-3 pt-1 pb-2 text-[10px] uppercase tracking-wider text-muted-foreground bg-card/40 backdrop-blur-md">
                <span className="w-12">Ticket</span>
                <span className="flex-1">Creadora</span>
                <span className="w-20">Red</span>
                <span className="w-24">Plataforma</span>
                <span className="w-20">Resultado</span>
                <span className="w-32 text-right">Fecha / Hora</span>
              </div>
              {kpiModalEntries.map((entry) => (
                <ListRow key={entry.id}>
                  <span className="w-12 font-mono text-xs text-muted-foreground">{entry.ticketNumber || "—"}</span>
                  <span className="flex-1 font-medium text-sm truncate">{entry.name}</span>
                  <span className="w-20 capitalize text-xs">{entry.network}</span>
                  <span className="w-24 text-xs">{entry.platform}</span>
                  <span className="w-20">
                    <Badge variant={resultToBadgeVariant(entry.result)} className="text-[10px]">{entry.result}</Badge>
                  </span>
                  <span className="w-32 text-[10px] text-muted-foreground tabular-nums whitespace-nowrap text-right">
                    {entry.date} {entry.time}
                  </span>
                </ListRow>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Assign Agent Dialog */}
      <Dialog open={assignAgentOpen} onOpenChange={setAssignAgentOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Asignar Agente</DialogTitle>
            <DialogDescription>
              Selecciona el agente para la entrada de <span className="font-semibold">{assignAgentTarget?.name}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Buscar agente..."
              value={assignAgentSearch}
              onChange={(e) => setAssignAgentSearch(e.target.value)}
              className="h-9"
            />
            <ScrollArea className="h-[200px] border rounded-md">
              <div className="p-1">
                {profiles
                  .filter((p: any) => p.full_name?.toLowerCase().includes(assignAgentSearch.toLowerCase()))
                  .map((p: any) => (
                    <button
                      key={p.id}
                      onClick={() => setAssignAgentSelected(p.id)}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                        assignAgentSelected === p.id
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted"
                      )}
                    >
                      {p.full_name}
                    </button>
                  ))}
              </div>
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignAgentOpen(false)}>Cancelar</Button>
            <Button
              disabled={!assignAgentSelected}
              onClick={async () => {
                if (!assignAgentTarget) return;
                const { error } = await supabase
                  .from("promolog_entries")
                  .update({ reviewed_by: assignAgentSelected })
                  .eq("id", assignAgentTarget.id);
                if (error) {
                  toast({ title: "Error", description: error.message, variant: "destructive" });
                  return;
                }
                queryClient.invalidateQueries({ queryKey: ["promolog-entries", user?.id] });
                setAssignAgentOpen(false);
                toast({ title: "Agente asignado", description: `Agente asignado a ${assignAgentTarget.name}.` });
              }}
            >
              Asignar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Campaign Modal */}
      {viewCampaign && (
        <Dialog open={!!viewCampaign} onOpenChange={(open) => !open && setViewCampaign(null)}>
          <DialogContent className="sm:max-w-[450px]">
            <DialogHeader>
              <DialogTitle>Detalle de Campaña</DialogTitle>
              <DialogDescription>Información completa de la campaña</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Creadora</p>
                  <p className="text-sm font-medium">{(viewCampaign.creators as any)?.artistic_name || (viewCampaign.creators as any)?.name || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Mes</p>
                  <p className="text-sm font-medium capitalize">{new Date(viewCampaign.month_year + "T00:00:00").toLocaleDateString("es-ES", { month: "long", year: "numeric" })}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Obj. Mensual</p>
                  <p className="text-sm font-bold">{viewCampaign.goal_monthly}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Obj. Semanal</p>
                  <p className="text-sm font-bold">{viewCampaign.goal_weekly}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Estado</p>
                  <Badge variant={viewCampaign.status === "activa" ? "default" : "secondary"} className="capitalize mt-1">{viewCampaign.status}</Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Creación</p>
                  <p className="text-sm">{new Date(viewCampaign.created_at).toLocaleDateString("es-ES")}</p>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Campaign Modal */}
      {editCampaign && (
        <Dialog open={!!editCampaign} onOpenChange={(open) => !open && setEditCampaign(null)}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle>Editar Campaña</DialogTitle>
              <DialogDescription>Modifica los objetivos o estado de la campaña</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Obj. Mensual</Label>
                  <Input type="number" value={editCampGoalMonthly} onChange={(e) => setEditCampGoalMonthly(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Obj. Semanal</Label>
                  <Input type="number" value={editCampGoalWeekly} onChange={(e) => setEditCampGoalWeekly(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Estado</Label>
                <Select value={editCampStatus} onValueChange={setEditCampStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="activa">Activa</SelectItem>
                    <SelectItem value="finalizada">Finalizada</SelectItem>
                    <SelectItem value="pendiente">Pendiente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditCampaign(null)}>Cancelar</Button>
              <Button onClick={async () => {
                const { error } = await supabase.from("promolog_campaigns").update({
                  goal_monthly: parseInt(editCampGoalMonthly) || 0,
                  goal_weekly: parseInt(editCampGoalWeekly) || 0,
                  status: editCampStatus,
                }).eq("id", editCampaign.id);
                if (error) {
                  toast({ title: "Error", description: error.message, variant: "destructive" });
                  return;
                }
                queryClient.invalidateQueries({ queryKey: ["promolog-campaigns"] });
                setEditCampaign(null);
                toast({ title: "Campaña actualizada" });
              }}>Guardar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Campaign Modal */}
      {deleteCampaign && (
        <Dialog open={!!deleteCampaign} onOpenChange={(open) => !open && setDeleteCampaign(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Eliminar Campaña</DialogTitle>
              <DialogDescription>
                ¿Estás seguro de eliminar la campaña de <span className="font-semibold">{(deleteCampaign.creators as any)?.artistic_name || (deleteCampaign.creators as any)?.name}</span>? Esta acción no se puede deshacer.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteCampaign(null)}>Cancelar</Button>
              <Button variant="destructive" onClick={async () => {
                const { error } = await supabase.from("promolog_campaigns").delete().eq("id", deleteCampaign.id);
                if (error) {
                  toast({ title: "Error", description: error.message, variant: "destructive" });
                  return;
                }
                queryClient.invalidateQueries({ queryKey: ["promolog-campaigns"] });
                setDeleteCampaign(null);
                toast({ title: "Campaña eliminada" });
              }}>Eliminar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </main>
  );
};

export default PromologContent;
