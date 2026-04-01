import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, isSameDay, addDays, startOfWeek, isToday, isFuture, startOfDay } from "date-fns";
import { es } from "date-fns/locale";
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
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import DashboardMetricCard from "@/components/dashboard/DashboardMetricCard";
import { DateRangePicker } from "@/components/ui/date-range-picker";
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
import PromologTable from "./PromologTable";
import PromologGrid from "./PromologGrid";
import PromologAgentDetailView from "./PromologAgentDetailView";
import PromologPerformanceView from "./PromologPerformanceView";
import DataTableShell from "@/components/ui/data-table-shell";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";

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

const tabItems = [
  { id: "promos" as const, label: "Promos", icon: Table2 },
  { id: "agentes" as const, label: "Agentes", icon: Users },
  { id: "campanas" as const, label: "Campañas", icon: Target },
  { id: "rendimiento" as const, label: "Rendimiento", icon: BarChart3 },
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
  const isManagement = ["admin", "manager", "supervisor"].includes(role ?? "");

  const { data: creators = [] } = useQuery({
    queryKey: ["creators-promolog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creators")
        .select("id, name, artistic_name, category, country, country_code, status, profile_photo_url, instagram_handle, twitter_handle, tiktok_handle")
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

  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  // Fetch real promolog entries
  const { data: promologEntries = [], isLoading: entriesLoading } = useQuery({
    queryKey: ["promolog-entries", user?.id, dateFrom?.toISOString(), dateTo?.toISOString()],
    queryFn: async () => {
      let query = supabase
        .from("promolog_entries")
        .select("*, creators(name, artistic_name, instagram_handle)")
        .order("date", { ascending: false })
        .limit(200);

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

      // Deduplicar: mantener la entrada más completa de cada grupo
      const deduped = (() => {
        const map = new Map<string, any>();
        for (const e of data ?? []) {
          const dayKey = e.date?.split("T")[0] ?? e.date;
          const key = `${e.creator_id}|${dayKey}|${e.network}|${e.platform}|${e.promoted}`;
          const existing = map.get(key);
          if (!existing) {
            map.set(key, e);
          } else {
            const score = (r: any) =>
              (r.evidence_url ? 1 : 0) +
              (r.notes ? 1 : 0) +
              (r.reviewed_by ? 1 : 0) +
              (r.action_taken ? 1 : 0);
            if (score(e) > score(existing)) {
              map.set(key, e);
            }
          }
        }
        return Array.from(map.values());
      })();
      return deduped;
    },
  });

  // Map DB entries to PromologEntry interface
  const entries: PromologEntry[] = useMemo(() => {
    return promologEntries.map((pe: any) => {
      const dateObj = new Date(pe.date);
      const creator = pe.creators as any;
      return {
        id: pe.id,
        ticketNumber: pe.ticket_number || "",
        name: creator?.artistic_name || creator?.name || "Sin nombre",
        handle: creator?.instagram_handle || undefined,
        network: (pe.network || "").toLowerCase(),
        platform: pe.platform || "OnlyFans",
        result: promotedToResult(pe.promoted),
        date: dateObj.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }),
        time: dateObj.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", hour12: true }),
        agent: (pe.reviewed_by && profilesMap[pe.reviewed_by]) || "—",
        notes: pe.notes || "",
        creator_id: pe.creator_id,
        reviewed_by: pe.reviewed_by || undefined,
      };
    });
  }, [promologEntries, profilesMap]);

  // Dynamic social & platform counts (only "Sí" entries)
  const socialCards = useMemo(() => {
    const siEntries = entries.filter(e => e.result === "Sí");
    const countByNetwork = (net: string) => siEntries.filter(e => e.network === net).length;
    return [
      { name: "Instagram", value: countByNetwork("instagram"), icon: <InstagramIcon className="h-6 w-6" />, bg: "bg-pink-500/10" },
      { name: "TikTok", value: countByNetwork("tiktok"), icon: <TikTokIcon className="h-6 w-6" />, bg: "bg-slate-500/10" },
      { name: "X", value: countByNetwork("x"), icon: <XIcon className="h-6 w-6" />, bg: "bg-slate-500/10" },
      { name: "Telegram", value: countByNetwork("telegram"), icon: <Send className="h-6 w-6" />, bg: "bg-blue-500/10" },
    ];
  }, [entries]);

  const platformCards = useMemo(() => {
    const siEntries = entries.filter(e => e.result === "Sí");
    const countByPlatform = (plat: string) => siEntries.filter(e => (e.platform || "").toLowerCase().includes(plat)).length;
    return [
      { name: "OnlyFans", value: countByPlatform("onlyfans"), bg: "bg-blue-500/10", icon: <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-white text-[10px] font-bold">OF</span> },
      { name: "Unlok", value: countByPlatform("unlok"), bg: "bg-purple-500/10", icon: <span className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-500 text-white text-[10px] font-bold">U</span> },
      { name: "Otra", value: siEntries.length - countByPlatform("onlyfans") - countByPlatform("unlok"), bg: "bg-muted/50", icon: <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground"><Info className="h-4 w-4" /></span> },
    ];
  }, [entries]);

  const strategyOptions = [
    { value: "incentivo_economico", label: "Incentivo económico" },
    { value: "llamada_motivacional", label: "Llamada motivacional" },
    { value: "mensaje_estrategico", label: "Mensaje estratégico" },
    { value: "recordatorio_amable", label: "Recordatorio amable" },
    { value: "otro", label: "Otro" },
  ];

  const [activeTab, setActiveTab] = useState<"promos" | "agentes" | "campanas" | "rendimiento">("promos");
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
  const [sortOrder, setSortOrder] = useState("pendientes");
  const [entryView, setEntryView] = useState<"list" | "grid">("list");

  const [searchAgent, setSearchAgent] = useState("");
  const [searchCampaign, setSearchCampaign] = useState("");
  const [campaignStatusFilter, setCampaignStatusFilter] = useState("");
  const [agentDateFrom, setAgentDateFrom] = useState<Date | undefined>(undefined);
  const [agentDateTo, setAgentDateTo] = useState<Date | undefined>(undefined);
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
  const entryFileInputRef = useRef<HTMLInputElement>(null);

  // Entry action state (table/grid actions)
  const [selectedEntry, setSelectedEntry] = useState<PromologEntry | null>(null);
  const [viewEntryOpen, setViewEntryOpen] = useState(false);
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

  // Dynamic agents data
  const agentsData = useMemo(() => {
    const agentMap = new Map<string, { id: string; tickets: number; si: number; parcial: number; no: number; networks: Record<string, number> }>();

    for (const pe of promologEntries) {
      const agentId = pe.reviewed_by || pe.created_by;
      if (!agentId || !profilesMap[agentId]) continue;

      // Date filter for agents tab
      if (agentDateFrom) {
        const entryDate = new Date(pe.date);
        if (entryDate < agentDateFrom) continue;
      }
      if (agentDateTo) {
        const entryDate = new Date(pe.date);
        const toEnd = new Date(agentDateTo);
        toEnd.setDate(toEnd.getDate() + 1);
        if (entryDate >= toEnd) continue;
      }

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
  }, [promologEntries, profilesMap, agentDateFrom, agentDateTo]);

  const handleViewEntry = (entry: PromologEntry) => {
    setSelectedEntry(entry);
    setViewEntryOpen(true);
  };
  const handleEditEntry = (entry: PromologEntry) => {
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

  const handleEntryFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setEntryEvidencePreview(url);
    }
  };

  const resetEntryModal = () => {
    setEntryResult("si");
    setEntryNetwork("");
    setEntryPlatform("");
    setEntryContactType("");
    setEntryNotes("");
    setEntryEvidencePreview("");
    setEntryStrategy("");
    setEntryCustomPlatform("");
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

  const filteredCreators = useMemo(() => {
    let list = [...creators];
    if (searchCreator) {
      const q = searchCreator.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q) || (c.artistic_name?.toLowerCase().includes(q)));
    }
    switch (sortOrder) {
      case "pendientes":
        list.sort((a, b) => {
          const aP = a.status !== "active" ? 0 : 1;
          const bP = b.status !== "active" ? 0 : 1;
          return aP - bP;
        });
        break;
      case "alfabetico":
        list.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "categoria":
        const catOrder: Record<string, number> = { "A+": 0, A: 1, "B+": 2, B: 3, C: 4 };
        list.sort((a, b) => (catOrder[a.category ?? "C"] ?? 5) - (catOrder[b.category ?? "C"] ?? 5));
        break;
    }
    return list;
  }, [creators, searchCreator, sortOrder]);

  const completedToday = filteredCreators.filter(c => c.status === "active").length;
  const pendingCreators = filteredCreators.length - completedToday;

  const [searchEntry, setSearchEntry] = useState("");
  const [promoPage, setPromoPage] = useState(1);
  const [promoPageSize, setPromoPageSize] = useState(25);
  const [statsCollapsed, setStatsCollapsed] = useState(false);
  const handleContentScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setStatsCollapsed(e.currentTarget.scrollTop > 40);
  }, []);

  // KPI modal state
  const [kpiModalType, setKpiModalType] = useState<"ingresados" | "no_chequeadas" | "completadas" | null>(null);
  const kpiModalEntries = useMemo(() => {
    if (!kpiModalType) return [];
    if (kpiModalType === "no_chequeadas") return entries.filter(e => e.result === "Pendiente");
    if (kpiModalType === "completadas") return entries.filter(e => e.result === "Sí");
    return entries;
  }, [entries, kpiModalType]);
  const kpiModalTitle = kpiModalType === "ingresados" ? "Tickets Ingresados" : kpiModalType === "no_chequeadas" ? "Tickets NO Chequeadas" : "Tickets Completadas Hoy";

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (selectedCreatorFilter !== "" && entry.creator_id !== selectedCreatorFilter) return false;
      if (selectedStatus !== "") {
        const statusMap: Record<string, string> = { si_promociono: "Sí", no_promociono: "No", parcial: "Parcial", pendiente: "Pendiente" };
        if (entry.result !== statusMap[selectedStatus]) return false;
      }
      if (selectedNetwork !== "" && entry.network !== selectedNetwork) return false;
      if (selectedCardPlatform !== "" && !(entry.platform || "").toLowerCase().includes(selectedCardPlatform)) return false;
      if (searchEntry) {
        const q = searchEntry.toLowerCase();
        if (!entry.name.toLowerCase().includes(q) && !entry.ticketNumber.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [entries, selectedCreatorFilter, selectedStatus, selectedNetwork, selectedCardPlatform, searchEntry]);

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
      {/* Header sticky */}
       <header className="bg-background px-6 pt-6 pb-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Promolog</h1>
            <p className="text-sm text-muted-foreground">Seguimiento promocional diario</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-9" onClick={() => setCampaignModalOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Agregar Campaña
            </Button>
            <Button variant="default" size="sm" className="h-9" onClick={() => setCreatorsModalOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Agregar Promo
            </Button>
          </div>
        </div>
      </header>

      {/* KPI Cards */}
      <div className={`shrink-0 px-6 pt-4 transition-all duration-300 overflow-hidden ${statsCollapsed ? "max-h-0 opacity-0 py-0 pb-0" : "max-h-[200px] opacity-100 pb-2"}`}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <DashboardMetricCard label="Total Promos" value={String(filteredEntries.length)} icon={Table2} color="accent" />
          <DashboardMetricCard label="Tasa de éxito" value={filteredEntries.length > 0 ? `${Math.round((filteredEntries.filter(e => e.result === "Sí").length / filteredEntries.length) * 100)}%` : "0%"} icon={TrendingUp} color="primary" />
          <div className="cursor-pointer" onClick={() => setKpiModalType("no_chequeadas")}>
            <DashboardMetricCard label="Sin revisar" value={String(entries.filter(e => e.result === "Pendiente").length)} icon={AlertTriangle} color="destructive" />
          </div>
          <DashboardMetricCard label="Creadoras" value={String(new Set(filteredEntries.map(e => e.creator_id)).size)} icon={Users} color="success" />
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 px-6 pb-2">
        <div className="inline-flex items-center gap-1 rounded-lg bg-muted/50 p-1">
          {tabItems.filter(tab => isManagement || tab.id !== "agentes").map((tab) => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setActiveTab(tab.id)}
            >
              <tab.icon className="mr-1.5 h-4 w-4" />
              {tab.label}
            </Button>
          ))}
        </div>
      </div>

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
              <DateRangePicker
                from={dateFrom}
                to={dateTo}
                onApply={(from, to) => { setDateFrom(from); setDateTo(to); }}
                placeholder="Selecciona fechas"
                className="h-9"
              />
              {(searchEntry || selectedStatus || selectedNetwork || selectedCardPlatform || selectedCreatorFilter || dateFrom || dateTo) && (
                <Button variant="ghost" size="sm" className="h-9" onClick={() => { setSearchEntry(""); setSelectedStatus(""); setSelectedNetwork(""); setSelectedCardPlatform(""); setSelectedCreatorFilter(""); setDateFrom(undefined); setDateTo(undefined); }}>
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
                  entries={filteredEntries.slice((promoPage - 1) * promoPageSize, promoPage * promoPageSize)}
                  onView={handleViewEntry}
                  onEdit={handleEditEntry}
                  onDelete={handleDeleteEntry}
                  onNotesChange={handleNotesChange}
                  onAssignAgent={handleAssignAgent}
                  isManagement={isManagement}
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
          {/* Filters row */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar agente..." className="pl-9 h-9" value={searchAgent} onChange={(e) => setSearchAgent(e.target.value)} />
            </div>
            <DateRangePicker
              from={agentDateFrom}
              to={agentDateTo}
              onApply={(from, to) => { setAgentDateFrom(from); setAgentDateTo(to); }}
              placeholder="Selecciona fechas"
              className="h-9"
            />
            {(searchAgent || agentDateFrom || agentDateTo) && (
              <Button variant="ghost" size="sm" className="h-9" onClick={() => { setSearchAgent(""); setAgentDateFrom(undefined); setAgentDateTo(undefined); }}>
                <X className="mr-1.5 h-4 w-4" />
                Limpiar filtros
              </Button>
            )}
            <div className="ml-auto flex gap-1">
              <Button variant={agentesView === "list" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setAgentesView("list")}>
                <List className="h-4 w-4" />
              </Button>
              <Button variant={agentesView === "grid" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setAgentesView("grid")}>
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button variant={agentesView === "calendar" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setAgentesView("calendar")}>
                <CalendarIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>

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

      {/* Campañas tab */}
      {activeTab === "campanas" && (
        <div className="flex-1 min-h-0 overflow-auto p-6 space-y-3">
          {/* Filters row */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar campaña..." className="pl-9 h-9" value={searchCampaign} onChange={(e) => setSearchCampaign(e.target.value)} />
            </div>
            <Select value={campaignStatusFilter || undefined} onValueChange={(v) => setCampaignStatusFilter(v === "__all__" ? "" : v)}>
              <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                <SelectItem value="activa">Activa</SelectItem>
                <SelectItem value="finalizada">Finalizada</SelectItem>
                <SelectItem value="pendiente">Pendiente</SelectItem>
              </SelectContent>
            </Select>
            <DateRangePicker
              from={campDateFrom}
              to={campDateTo}
              onApply={(from, to) => { setCampDateFrom(from); setCampDateTo(to); }}
              placeholder="Selecciona fechas"
              className="h-9"
            />
            {(searchCampaign || campaignStatusFilter || campDateFrom || campDateTo) && (
              <Button variant="ghost" size="sm" className="h-9" onClick={() => { setSearchCampaign(""); setCampaignStatusFilter(""); setCampDateFrom(undefined); setCampDateTo(undefined); }}>
                <X className="mr-1.5 h-4 w-4" />
                Limpiar filtros
              </Button>
            )}
            <div className="ml-auto flex gap-1">
              <Button variant={campanasView === "list" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setCampanasView("list")}>
                <List className="h-4 w-4" />
              </Button>
              <Button variant={campanasView === "grid" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setCampanasView("grid")}>
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {(() => {
            const filtered = campaigns.filter((c: any) => {
              const creator = c.creators as any;
              const name = (creator?.artistic_name || creator?.name || "").toLowerCase();
              if (searchCampaign && !name.includes(searchCampaign.toLowerCase())) return false;
              if (campaignStatusFilter && c.status !== campaignStatusFilter) return false;
              return true;
            });
            if (filtered.length === 0) {
              return (
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex flex-col items-center justify-center py-16">
                      <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                        <Target className="h-8 w-8 text-muted-foreground/50" />
                      </div>
                      <p className="text-muted-foreground text-sm">No hay campañas</p>
                    </div>
                  </CardContent>
                </Card>
              );
            }
            if (campanasView === "list") {
              return (
                <div className="rounded-md border overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Creadora</TableHead>
                        <TableHead>Mes</TableHead>
                        <TableHead className="text-right">Obj. Mensual</TableHead>
                        <TableHead className="text-right">Obj. Semanal</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>Creación</TableHead>
                        <TableHead className="text-right w-[100px]">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((c: any) => {
                        const creator = c.creators as any;
                        const monthDate = new Date(c.month_year + "T00:00:00");
                        return (
                          <TableRow key={c.id}>
                            <TableCell className="font-medium">{creator?.artistic_name || creator?.name || "—"}</TableCell>
                            <TableCell className="capitalize">{monthDate.toLocaleDateString("es-ES", { month: "long", year: "numeric" })}</TableCell>
                            <TableCell className="text-right">{c.goal_monthly}</TableCell>
                            <TableCell className="text-right">{c.goal_weekly}</TableCell>
                            <TableCell>
                              <Badge variant={c.status === "activa" ? "default" : c.status === "finalizada" ? "secondary" : "outline"} className="capitalize">{c.status}</Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString("es-ES")}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewCampaign(c)}>
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                                {isManagement && (
                                  <>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                                      setEditCampaign(c);
                                      setEditCampGoalMonthly(String(c.goal_monthly || ""));
                                      setEditCampGoalWeekly(String(c.goal_weekly || ""));
                                      setEditCampStatus(c.status || "activa");
                                    }}>
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteCampaign(c)}>
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              );
            }
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filtered.map((c: any) => {
                  const creator = c.creators as any;
                  const monthDate = new Date(c.month_year + "T00:00:00");
                  return (
                    <Card key={c.id}>
                      <CardContent className="p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="font-semibold text-sm">{creator?.artistic_name || creator?.name || "—"}</p>
                          <Badge variant={c.status === "activa" ? "default" : c.status === "finalizada" ? "secondary" : "outline"} className="capitalize text-xs">{c.status}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground capitalize">{monthDate.toLocaleDateString("es-ES", { month: "long", year: "numeric" })}</p>
                        <div className="flex gap-4 text-xs">
                          <span><strong>{c.goal_monthly}</strong> mensual</span>
                          <span><strong>{c.goal_weekly}</strong> semanal</span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* Rendimiento tab */}
      {activeTab === "rendimiento" && (
        <div className="flex-1 min-h-0 overflow-auto p-6">
          <PromologPerformanceView profiles={profiles} />
        </div>
      )}

      {/* Creators Selection Modal */}
        <Dialog open={creatorsModalOpen} onOpenChange={setCreatorsModalOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
            <DialogHeader className="pr-8">
              <DialogTitle>Todas - Selecciona una Creadora</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-3 gap-3">
              <Card className="border-t-[3px] border-t-success">
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Total Creadoras</p>
                  <p className="text-xl font-bold text-success">{creators.length}</p>
                </CardContent>
              </Card>
              <Card className="border-t-[3px] border-t-warning">
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Pendientes</p>
                  <p className="text-xl font-bold text-warning">{pendingCreators}</p>
                </CardContent>
              </Card>
              <Card className="border-t-[3px] border-t-success">
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Completadas Hoy</p>
                  <p className="text-xl font-bold text-success">{completedToday}</p>
                </CardContent>
              </Card>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar creadora..." value={searchCreator} onChange={(e) => setSearchCreator(e.target.value)} className="pl-9" />
              </div>
              <Select value={sortOrder} onValueChange={setSortOrder}>
                <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendientes">Pendientes Primero</SelectItem>
                  <SelectItem value="alfabetico">Alfabético (A-Z)</SelectItem>
                  <SelectItem value="categoria">Por Categoría</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <ScrollArea className="flex-1 min-h-0 max-h-[50vh]">
              <div className="flex flex-col divide-y divide-border">
                {filteredCreators.map((creator) => (
                  <div
                    key={creator.id}
                    className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/50 rounded-md transition-colors"
                    onClick={() => {
                      setSelectedCreatorForEntry(creator);
                      resetEntryModal();
                      setEntryModalOpen(true);
                      setCreatorsModalOpen(false);
                    }}
                  >
                    <div className="relative shrink-0">
                      <Avatar className="h-8 w-8 border border-muted-foreground/30">
                        {creator.profile_photo_url ? <AvatarImage src={creator.profile_photo_url} alt={creator.name} /> : null}
                        <AvatarFallback className="bg-muted text-xs font-medium">{creator.name.charAt(0).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      {creator.status !== "active" && (
                        <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-destructive border-2 border-background" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{creator.artistic_name || creator.name}</p>
                      <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
                        {creator.instagram_handle && (
                          <span className="flex items-center gap-0.5 truncate"><InstagramIcon className="h-3 w-3 shrink-0" />@{creator.instagram_handle}</span>
                        )}
                        {creator.tiktok_handle && (
                          <span className="flex items-center gap-0.5 truncate"><TikTokIcon className="h-3 w-3 shrink-0" />@{creator.tiktok_handle}</span>
                        )}
                        {creator.twitter_handle && (
                          <span className="flex items-center gap-0.5 truncate"><XIcon className="h-3 w-3 shrink-0" />@{creator.twitter_handle}</span>
                        )}
                      </div>
                    </div>
                    {creator.category && (
                      <Badge variant={getCategoryBadgeVariant(creator.category)} className="text-[10px] px-1.5 py-0 shrink-0">{creator.category}</Badge>
                    )}
                    <span className="text-sm shrink-0">{getCountryFlag(creator.country)}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>

        {/* Registration Modal */}
        <Dialog open={entryModalOpen} onOpenChange={setEntryModalOpen}>
          <DialogContent className="max-w-lg max-h-[80vh] !flex !flex-col gap-0 p-0 overflow-hidden">
            {selectedCreatorForEntry && (
              <>
                {/* Fixed header */}
                <div className="shrink-0 p-6 pb-4 space-y-4">
                  <DialogHeader className="pr-8">
                    <DialogTitle>Registrar Promoción</DialogTitle>
                    <DialogDescription className="sr-only">Registrar una nueva entrada de promoción para esta creadora</DialogDescription>
                  </DialogHeader>
                  <Card className="bg-muted">
                    <CardContent className="p-3 flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        {selectedCreatorForEntry.profile_photo_url ? <AvatarImage src={selectedCreatorForEntry.profile_photo_url} alt={selectedCreatorForEntry.name} /> : null}
                        <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">{getInitials(selectedCreatorForEntry.name)}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold">{selectedCreatorForEntry.artistic_name || selectedCreatorForEntry.name}</span>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          {selectedCreatorForEntry.instagram_handle && <span className="flex items-center gap-0.5"><InstagramIcon className="h-3 w-3" />@{selectedCreatorForEntry.instagram_handle}</span>}
                          {selectedCreatorForEntry.twitter_handle && <span className="flex items-center gap-0.5"><XIcon className="h-3 w-3" />@{selectedCreatorForEntry.twitter_handle}</span>}
                          {selectedCreatorForEntry.tiktok_handle && <span className="flex items-center gap-0.5"><TikTokIcon className="h-3 w-3" />@{selectedCreatorForEntry.tiktok_handle}</span>}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <div className="space-y-2">
                    <span className="text-sm font-medium">¿Promocionó Hoy?</span>
                    <div className="grid grid-cols-2 gap-3">
                      <button type="button" onClick={() => setEntryResult("si")} className={`flex items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-medium transition-colors ${entryResult === "si" ? "bg-primary text-primary-foreground" : "border border-input bg-background text-muted-foreground hover:bg-accent"}`}>
                        <Check className="h-4 w-4" />Sí Promocionó
                      </button>
                      <button type="button" onClick={() => setEntryResult("no")} className={`flex items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-medium transition-colors ${entryResult === "no" ? "bg-secondary text-secondary-foreground" : "border border-input bg-background text-muted-foreground hover:bg-accent"}`}>
                        <X className="h-4 w-4" />No Promocionó
                      </button>
                    </div>
                  </div>
                </div>

                {/* Scrollable content */}
                <div className="flex-1 min-h-0 overflow-y-auto px-6">
                  <div className="space-y-4 py-4">
                    {entryResult === "si" && (
                      <>
                        <div className="space-y-2">
                          <span className="text-sm font-medium">Red Social <span className="text-destructive">*</span></span>
                          <div className="grid grid-cols-4 gap-2">
                            {networkOptions.map((opt) => {
                              const Icon = opt.icon;
                              const isSelected = entryNetwork === opt.value;
                              return (
                                <button key={opt.value} type="button" onClick={() => setEntryNetwork(opt.value)} className={`flex flex-col items-center justify-center gap-1.5 rounded-md px-2 py-3 text-xs font-medium transition-colors ${isSelected ? "border-2 border-primary bg-accent text-accent-foreground" : "border border-input bg-background text-muted-foreground hover:bg-accent"}`}>
                                  <Icon className="h-5 w-5" />{opt.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <span className="text-sm font-medium">Plataforma <span className="text-destructive">*</span></span>
                          <div className="grid grid-cols-3 gap-2">
                            {platformOptions.map((opt) => {
                              const isSelected = entryPlatform === opt.value;
                              return (
                                <button key={opt.value} type="button" onClick={() => setEntryPlatform(opt.value)} className={`flex items-center justify-center rounded-md px-3 py-3 text-xs font-medium transition-colors ${isSelected ? "border-2 border-primary bg-accent text-accent-foreground" : "border border-input bg-background text-muted-foreground hover:bg-accent"}`}>
                                  {opt.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <span className="text-sm font-medium">Tipo de Contacto <span className="text-destructive">*</span></span>
                          <div className="grid grid-cols-3 gap-2">
                            {contactTypeOptions.map((opt) => {
                              const isSelected = entryContactType === opt.value;
                              return (
                                <button key={opt.value} type="button" onClick={() => setEntryContactType(opt.value)} className={`flex items-center justify-center rounded-md px-3 py-3 text-xs font-medium transition-colors ${isSelected ? "border-2 border-primary bg-accent text-accent-foreground" : "border border-input bg-background text-muted-foreground hover:bg-accent"}`}>
                                  {opt.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}

                    {/* Always visible fields */}
                    <div className="space-y-2">
                      <span className="text-sm font-medium">Notas</span>
                      <Textarea value={entryNotes} onChange={(e) => setEntryNotes(e.target.value)} placeholder="Agregar notas..." className="min-h-[80px]" />
                    </div>
                    <div className="space-y-2">
                      <span className="text-sm font-medium">Evidencia (Pantallazo)</span>
                      <div className="border-2 border-dashed border-input rounded-md p-4 text-center cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => entryFileInputRef.current?.click()}>
                        <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                        <span className="text-xs text-muted-foreground">Subir Evidencia</span>
                        <input ref={entryFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleEntryFileChange} />
                      </div>
                      {entryEvidencePreview && (
                        <div className="space-y-2">
                          <img src={entryEvidencePreview} alt="Evidencia" className="w-full rounded-md border border-input max-h-48 object-contain" />
                          <button type="button" className="flex items-center gap-1 text-xs text-primary hover:underline" onClick={() => window.open(entryEvidencePreview, "_blank")}>
                            <ExternalLink className="h-3 w-3" />Abrir en nueva pestaña
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Fixed footer */}
                <div className="shrink-0 p-6 pt-4 border-t">
                  <DialogFooter>
                    <Button variant="outline" onClick={() => { setEntryModalOpen(false); toast({ title: "Registro cancelado" }); }}>Cancelar</Button>
                    <Button onClick={async () => {
                      if (!selectedCreatorForEntry) return;
                      if (entryResult === "si") {
                        if (!entryNetwork || !entryPlatform || !entryContactType) {
                          toast({ title: "Campos requeridos", description: "Completa Red Social, Plataforma y Tipo de Contacto.", variant: "destructive" });
                          return;
                        }
                      }
                      const platformValue = entryPlatform === "otra" ? entryCustomPlatform : entryPlatform;
                      const { error } = await supabase.from("promolog_entries").insert({
                        creator_id: selectedCreatorForEntry.id,
                        date: new Date().toISOString(),
                        promoted: entryResult === "si" ? "true" : "false",
                        network: entryResult === "si" ? entryNetwork : "n/a",
                        platform: entryResult === "si" ? platformValue : null,
                        contact_type: entryResult === "si" ? entryContactType : null,
                        notes: entryNotes || null,
                        action_taken: entryResult === "si" ? entryStrategy || null : null,
                        evidence_url: entryEvidencePreview || null,
                        reviewed_by: user?.id,
                        created_by: user?.id,
                      });
                      if (error) {
                        toast({ title: "Error", description: error.message, variant: "destructive" });
                        return;
                      }
      queryClient.invalidateQueries({ queryKey: ["promolog-entries", user?.id] });
                      toast({ title: "Promoción registrada", description: `La entrada para ${selectedCreatorForEntry.artistic_name || selectedCreatorForEntry.name} ha sido guardada.` });
                      resetEntryModal();
                      setEntryModalOpen(false);
                    }}>Guardar Promoción</Button>
                  </DialogFooter>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* View Entry Modal */}
        {selectedEntry && (
          <Dialog open={viewEntryOpen} onOpenChange={setViewEntryOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader className="pr-8">
                <DialogTitle>Detalle de Entrada</DialogTitle>
                <DialogDescription className="sr-only">Detalle de la entrada de promolog</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-xs">{selectedEntry.ticketNumber}</Badge>
                  <span className="text-sm font-semibold">{selectedEntry.name}</span>
                  {selectedEntry.handle && <span className="text-sm text-muted-foreground">@{selectedEntry.handle}</span>}
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Red Social:</span> <span className="font-medium capitalize">{selectedEntry.network}</span></div>
                  <div><span className="text-muted-foreground">Plataforma:</span> <span className="font-medium">{selectedEntry.platform}</span></div>
                  <div><span className="text-muted-foreground">Resultado:</span> <Badge variant="outline" className="ml-1 text-xs">{selectedEntry.result}</Badge></div>
                  <div><span className="text-muted-foreground">Agente:</span> <span className="font-medium">@{selectedEntry.agent}</span></div>
                  <div><span className="text-muted-foreground">Fecha:</span> <span className="font-medium">{selectedEntry.date}</span></div>
                  <div><span className="text-muted-foreground">Hora:</span> <span className="font-medium">{selectedEntry.time}</span></div>
                </div>
                {selectedEntry.notes && (
                  <div className="text-sm"><span className="font-semibold">Notas: </span><span className="text-muted-foreground">{selectedEntry.notes}</span></div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setViewEntryOpen(false)}>Cerrar</Button>
                <Button onClick={() => { setViewEntryOpen(false); handleEditEntry(selectedEntry); }}>Editar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Edit Entry Modal (from table/grid actions) */}
        {selectedEntry && (
          <Dialog open={editEntryOpen} onOpenChange={setEditEntryOpen}>
            <DialogContent className="max-w-lg max-h-[80vh] !flex !flex-col gap-0 p-0 overflow-hidden">
              {/* Fixed header */}
              <div className="shrink-0 p-6 pb-4 space-y-4">
                <DialogHeader className="pr-8">
                  <DialogTitle>Editar Promoción</DialogTitle>
                  <DialogDescription className="sr-only">Editar los detalles de promoción</DialogDescription>
                </DialogHeader>
                <Card className="bg-muted">
                  <CardContent className="p-3 flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">{getInitials(selectedEntry.name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold">{selectedEntry.name}</span>
                      {selectedEntry.handle && <span className="text-xs text-muted-foreground">@{selectedEntry.handle}</span>}
                    </div>
                  </CardContent>
                </Card>
                <div className="space-y-2">
                  <span className="text-sm font-medium">¿Promocionó Hoy?</span>
                  <div className="grid grid-cols-2 gap-3">
                    <button type="button" onClick={() => setEntryResult("si")} className={`flex items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-medium transition-colors ${entryResult === "si" ? "bg-cyan-500 text-white" : "border border-input bg-background text-muted-foreground hover:bg-accent"}`}>
                      <Check className="h-4 w-4" />Sí Promocionó
                    </button>
                    <button type="button" onClick={() => setEntryResult("no")} className={`flex items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-medium transition-colors ${entryResult === "no" ? "bg-blue-500 text-white" : "border border-input bg-background text-muted-foreground hover:bg-accent"}`}>
                      <X className="h-4 w-4" />No Promocionó
                    </button>
                  </div>
                </div>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 min-h-0 overflow-y-auto px-6">
                <div className="space-y-4 py-4">
                  {entryResult === "si" && (
                    <>
                      <div className="space-y-2">
                        <span className="text-sm font-medium">Red Social <span className="text-destructive">*</span></span>
                        <div className="grid grid-cols-4 gap-2">
                          {networkOptions.map((opt) => {
                            const Icon = opt.icon;
                            const isSelected = entryNetwork === opt.value;
                            return (
                              <button key={opt.value} type="button" onClick={() => setEntryNetwork(opt.value)} className={`flex flex-col items-center justify-center gap-1.5 rounded-md px-2 py-3 text-xs font-medium transition-colors ${isSelected ? "border-2 border-primary bg-accent text-accent-foreground" : "border border-input bg-background text-muted-foreground hover:bg-accent"}`}>
                                <Icon className="h-5 w-5" />{opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <span className="text-sm font-medium">Plataforma <span className="text-destructive">*</span></span>
                        <div className="grid grid-cols-3 gap-2">
                          {platformOptions.map((opt) => {
                            const isSelected = entryPlatform === opt.value;
                            return (
                              <button key={opt.value} type="button" onClick={() => { setEntryPlatform(opt.value); if (opt.value !== "otra") setEntryCustomPlatform(""); }} className={`flex items-center justify-center rounded-md px-3 py-3 text-xs font-medium transition-colors ${isSelected ? "border-2 border-primary bg-accent text-accent-foreground" : "border border-input bg-background text-muted-foreground hover:bg-accent"}`}>
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                        {entryPlatform === "otra" && (
                          <Input placeholder="Nombre de la plataforma..." value={entryCustomPlatform} onChange={(e) => setEntryCustomPlatform(e.target.value)} />
                        )}
                      </div>
                      <div className="space-y-2">
                        <span className="text-sm font-medium">Tipo de Contacto <span className="text-destructive">*</span></span>
                        <div className="grid grid-cols-3 gap-2">
                          {contactTypeOptions.map((opt) => {
                            const isSelected = entryContactType === opt.value;
                            return (
                              <button key={opt.value} type="button" onClick={() => setEntryContactType(opt.value)} className={`flex items-center justify-center rounded-md px-3 py-3 text-xs font-medium transition-colors ${isSelected ? "border-2 border-primary bg-accent text-accent-foreground" : "border border-input bg-background text-muted-foreground hover:bg-accent"}`}>
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <span className="text-sm font-medium">¿Qué se hizo para que promocione?</span>
                        <div className="grid grid-cols-2 gap-2">
                          {strategyOptions.map((opt) => {
                            const isSelected = entryStrategy === opt.value;
                            return (
                              <button key={opt.value} type="button" onClick={() => setEntryStrategy(opt.value)} className={`flex items-center justify-center rounded-md px-3 py-2.5 text-xs font-medium transition-colors ${isSelected ? "border-2 border-primary bg-accent text-accent-foreground" : "border border-input bg-background text-muted-foreground hover:bg-accent"}`}>
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Always visible fields */}
                  <div className="space-y-2">
                    <span className="text-sm font-medium">Notas</span>
                    <Textarea value={entryNotes} onChange={(e) => setEntryNotes(e.target.value)} placeholder={entryResult === "no" ? "¿Por qué no se pudo hacer la promo?..." : "Agregar notas..."} className="min-h-[80px]" />
                  </div>
                  <div className="space-y-2">
                    <span className="text-sm font-medium">Evidencia (Pantallazo)</span>
                    <div className="border-2 border-dashed border-input rounded-md p-4 text-center cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => entryFileInputRef.current?.click()}>
                      <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                      <span className="text-xs text-muted-foreground">Subir Evidencia</span>
                      <input ref={entryFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleEntryFileChange} />
                    </div>
                    {entryEvidencePreview && (
                      <div className="space-y-2">
                        <img src={entryEvidencePreview} alt="Evidencia" className="w-full rounded-md border border-input max-h-48 object-contain" />
                        <button type="button" className="flex items-center gap-1 text-xs text-primary hover:underline" onClick={() => window.open(entryEvidencePreview, "_blank")}>
                          <ExternalLink className="h-3 w-3" />Abrir en nueva pestaña
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Fixed footer */}
              <div className="shrink-0 p-6 pt-4 border-t">
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setEditEntryOpen(false); toast({ title: "Edición cancelada" }); }}>Cancelar</Button>
                  <Button className="bg-cyan-500 hover:bg-cyan-600 text-white" onClick={async () => {
                    if (!selectedEntry) return;
                    if (entryResult === "si") {
                      if (!entryNetwork || !entryPlatform || !entryContactType) {
                        toast({ title: "Campos requeridos", description: "Completa Red Social, Plataforma y Tipo de Contacto.", variant: "destructive" });
                        return;
                      }
                    }
                    const platformValue = entryPlatform === "otra" ? entryCustomPlatform : entryPlatform;
                    const { error } = await supabase.from("promolog_entries").update({
                      promoted: entryResult === "si" ? "true" : "false",
                      network: entryResult === "si" ? entryNetwork : "n/a",
                      platform: entryResult === "si" ? platformValue : null,
                      contact_type: entryResult === "si" ? entryContactType : null,
                      notes: entryNotes || null,
                      action_taken: entryResult === "si" ? entryStrategy || null : null,
                      evidence_url: entryEvidencePreview || null,
                    }).eq("id", selectedEntry.id);
                    if (error) {
                      toast({ title: "Error", description: error.message, variant: "destructive" });
                      return;
                    }
                    queryClient.invalidateQueries({ queryKey: ["promolog-entries", user?.id] });
                    toast({ title: "Promoción actualizada", description: `Los cambios para ${selectedEntry.name} han sido guardados.` });
                    resetEntryModal();
                    setEditEntryOpen(false);
                  }}>Guardar Cambios</Button>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>
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
      <Dialog open={!!kpiModalType} onOpenChange={(open) => !open && setKpiModalType(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{kpiModalTitle}</DialogTitle>
            <DialogDescription>
              {kpiModalEntries.length} {kpiModalEntries.length === 1 ? "entrada" : "entradas"} encontradas
            </DialogDescription>
          </DialogHeader>
          {kpiModalEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Info className="h-10 w-10 mb-2 opacity-40" />
              <p className="text-sm">No hay entradas para mostrar</p>
            </div>
          ) : (
            <div className="max-h-[500px] overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticket</TableHead>
                    <TableHead>Creadora</TableHead>
                    <TableHead>Red</TableHead>
                    <TableHead>Plataforma</TableHead>
                    <TableHead>Resultado</TableHead>
                    <TableHead>Fecha / Hora</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {kpiModalEntries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-mono text-xs">{entry.ticketNumber || "—"}</TableCell>
                      <TableCell className="font-medium text-sm">{entry.name}</TableCell>
                      <TableCell className="capitalize text-sm">{entry.network}</TableCell>
                      <TableCell className="text-sm">{entry.platform}</TableCell>
                      <TableCell>
                        <Badge variant={resultToBadgeVariant(entry.result)} className="text-xs">{entry.result}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{entry.date} {entry.time}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
