import { useState, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  CalendarDays,
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
} from "lucide-react";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import InstagramIcon from "@/components/icons/InstagramIcon";
import TikTokIcon from "@/components/icons/TikTokIcon";
import XIcon from "@/components/icons/XIcon";
import TelegramIcon from "@/components/icons/TelegramIcon";
import PromologEntryCard, { type PromologEntry } from "./PromologEntryCard";
import PromologTable from "./PromologTable";
import PromologGrid from "./PromologGrid";

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

const socialCards = [
  { name: "Instagram", value: 3, icon: <InstagramIcon className="h-6 w-6" />, bg: "bg-pink-500/10" },
  { name: "TikTok", value: 0, icon: <TikTokIcon className="h-6 w-6" />, bg: "bg-slate-500/10" },
  { name: "X", value: 2, icon: <XIcon className="h-6 w-6" />, bg: "bg-slate-500/10" },
  { name: "Telegram", value: 0, icon: <Send className="h-6 w-6" />, bg: "bg-blue-500/10" },
];

const platformCards = [
  {
    name: "OnlyFans",
    value: 5,
    bg: "bg-blue-500/10",
    icon: (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-white text-[10px] font-bold">
        OF
      </span>
    ),
  },
  {
    name: "Unlok",
    value: 0,
    bg: "bg-purple-500/10",
    icon: (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-500 text-white text-[10px] font-bold">
        U
      </span>
    ),
  },
  {
    name: "Otra",
    value: 0,
    bg: "bg-muted/50",
    icon: (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Info className="h-4 w-4" />
      </span>
    ),
  },
];

const mockEntries: PromologEntry[] = [
  { id: "1", ticketNumber: "PL065201", name: "Desieee Daniela Gonzalez angel", handle: "deziig", network: "instagram", platform: "OnlyFans", result: "Sí", date: "13 feb 2026", time: "10:05 AM", agent: "lorena_lozano", notes: "CC promociona en IG, publica foto" },
  { id: "2", ticketNumber: "PL068144", name: "Veronica Sanchez", network: "x", platform: "OnlyFans", result: "Sí", date: "13 feb 2026", time: "09:57 AM", agent: "lorena_lozano", notes: "CC promociona en reddit, publica foto" },
  { id: "3", ticketNumber: "PL111676", name: "Valentin Magallanes", handle: "valentin.only", network: "instagram", platform: "OnlyFans", result: "Sí", date: "13 feb 2026", time: "09:53 AM", agent: "lorena_lozano", notes: "CC promociona en IG, publica video" },
  { id: "4", ticketNumber: "PL641620", name: "Elizabeth Loaiza", handle: "elizabethloaiza", network: "instagram", platform: "OnlyFans", result: "Sí", date: "13 feb 2026", time: "09:48 AM", agent: "lorena_lozano", notes: "CC promociona en IG, publica foto" },
  { id: "5", ticketNumber: "PL492883", name: "Alejandra Rojas Soto", handle: "alemiarojas", network: "x", platform: "OnlyFans", result: "Sí", date: "13 feb 2026", time: "09:25 AM", agent: "lorena_lozano", notes: "CC promociona en X, publica video" },
];

const agentsData = [
  { name: "lorena_lozano", tickets: 5, si: 5, parcial: 0, no: 0, badges: [{ label: "IG", value: 3 }, { label: "X", value: 2 }] },
];

const tabItems = [
  { id: "dashboard" as const, label: "Dashboard", icon: Table2 },
  { id: "agentes" as const, label: "Agentes", icon: Users },
  { id: "campanas" as const, label: "Campañas", icon: Target },
  { id: "calendario" as const, label: "Calendario", icon: CalendarDays },
];

const PromologContent = () => {
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

  const categoryOptions = [
    { value: "A+", label: "A+ - Excelente" },
    { value: "A", label: "A - Muy buena" },
    { value: "B+", label: "B+ - Buena plus" },
    { value: "B", label: "B - Buena" },
    { value: "C", label: "C - Regular" },
  ];

  const [date, setDate] = useState<Date>(new Date());
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"dashboard" | "agentes" | "campanas" | "calendario">("dashboard");

  const [selectedCreator, setSelectedCreator] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedNetwork, setSelectedNetwork] = useState("");
  const [creatorsModalOpen, setCreatorsModalOpen] = useState(false);
  const [searchCreator, setSearchCreator] = useState("");
  const [sortOrder, setSortOrder] = useState("pendientes");
  const [entryView, setEntryView] = useState<"list" | "grid">("list");

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

  const [campaignModalOpen, setCampaignModalOpen] = useState(false);
  const [campaignCreator, setCampaignCreator] = useState("");
  const [campaignMonth, setCampaignMonth] = useState("");
  const [campaignGoalMonthly, setCampaignGoalMonthly] = useState("");
  const [campaignGoalWeekly, setCampaignGoalWeekly] = useState("");

  const handleCreateCampaign = () => {
    toast({ title: "Campaña creada", description: "La campaña mensual se ha creado correctamente." });
    setCampaignModalOpen(false);
    setCampaignCreator("");
    setCampaignMonth("");
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

  const filteredEntries = mockEntries.filter((entry) => {
    if (selectedStatus !== "") {
      const statusMap: Record<string, string> = { si_promociono: "Sí", no_promociono: "No", parcial: "Parcial", pendiente: "Pendiente" };
      if (entry.result !== statusMap[selectedStatus]) return false;
    }
    if (selectedNetwork !== "" && entry.network !== selectedNetwork) return false;
    if (searchEntry) {
      const q = searchEntry.toLowerCase();
      if (!entry.name.toLowerCase().includes(q) && !entry.ticketNumber.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const formattedDate = date.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
  const shortDate = date.toLocaleDateString("es-ES", { day: "numeric", month: "short" });

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      {/* Header sticky */}
      <header className="bg-background px-6 pt-6 pb-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Promolog</h1>
            <p className="text-sm text-muted-foreground">Seguimiento promocional diario</p>
          </div>
          <Button variant="outline" onClick={() => { /* open entry modal */ }}>
            <Plus className="mr-2 h-4 w-4" />
            Agregar Entrada
          </Button>
        </div>
      </header>

      {/* Tab bar */}
      <div className="border-b px-6 py-2 flex items-center justify-between gap-4 shrink-0">
        <div className="inline-flex items-center gap-1 rounded-lg bg-muted/50 p-1">
          {tabItems.map((tab) => {
            const Icon = tab.icon;
            return (
              <Button
                key={tab.id}
                variant={activeTab === tab.id ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setActiveTab(tab.id)}
                className="text-xs"
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </Button>
            );
          })}
        </div>
        <Button variant="outline" size="sm" onClick={() => setCampaignModalOpen(true)}>
          <Plus className="h-4 w-4" />
          Agregar Campaña
        </Button>
      </div>

      {/* Filters bar - visible on dashboard tab */}
      {activeTab === "dashboard" && (
        <div className="border-b px-6 py-3 flex items-center gap-3 shrink-0">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar entrada..." className="pl-9 h-9" value={searchEntry} onChange={(e) => setSearchEntry(e.target.value)} />
          </div>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 h-9">
                <CalendarDays className="h-4 w-4" />
                {formattedDate}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={date} onSelect={(d) => { if (d) { setDate(d); setOpen(false); } }} locale={es} weekStartsOn={1} className="p-3 pointer-events-auto" />
              <Separator />
              <div className="flex items-center gap-2 p-2">
                <Button variant="ghost" size="sm" onClick={() => { setDate(new Date()); setOpen(false); }}>Hoy</Button>
                <Button variant="ghost" size="sm" onClick={() => { const d = new Date(); d.setDate(d.getDate() - 7); setDate(d); setOpen(false); }}>7 días</Button>
              </div>
            </PopoverContent>
          </Popover>
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
              <SelectItem value="instagram">Instagram</SelectItem>
              <SelectItem value="tiktok">TikTok</SelectItem>
              <SelectItem value="x">X</SelectItem>
              <SelectItem value="telegram">Telegram</SelectItem>
            </SelectContent>
          </Select>
          <Select value={selectedCategory || undefined} onValueChange={(v) => setSelectedCategory(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Categoría" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas</SelectItem>
              {categoryOptions.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto flex gap-1">
            <Button variant={entryView === "list" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setEntryView("list")}>
              <List className="h-4 w-4" />
            </Button>
            <Button variant={entryView === "grid" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setEntryView("grid")}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Dashboard tab */}
        {activeTab === "dashboard" && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="border-t-[3px] border-t-accent cursor-pointer transition-colors hover:bg-muted/50" onClick={() => setCreatorsModalOpen(true)}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-muted-foreground">Total Modelos</p>
                    <Users className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-2xl font-bold text-success">{creators.length}</p>
                  <p className="text-xs text-muted-foreground">Registradas en sistema - Filtrando</p>
                </CardContent>
              </Card>
              <Card className="border-t-[3px] border-t-primary">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-muted-foreground">Tickets ingresados</p>
                    <CheckCircle className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-2xl font-bold text-primary">6</p>
                  <p className="text-xs text-muted-foreground">Tickets ingresados hoy</p>
                </CardContent>
              </Card>
              <Card className="border-t-[3px] border-t-destructive">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-muted-foreground">NO Chequeadas</p>
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-2xl font-bold text-destructive">128</p>
                  <p className="text-xs text-muted-foreground">Equipo no las revisó</p>
                </CardContent>
              </Card>
              <Card className="border-t-[3px] border-t-success">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-muted-foreground">Completadas Hoy</p>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-2xl font-bold">6</p>
                  <p className="text-xs text-muted-foreground">Tickets ingresados hoy</p>
                </CardContent>
              </Card>
            </div>

            {/* Social & Platform Section */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">
                Promociones por Red Social y Plataforma{" "}
                <span className="text-sm font-normal text-muted-foreground">(solo tickets &apos;Sí&apos;)</span>
              </h2>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Red Social</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {socialCards.map((s) => (
                    <Card key={s.name} className={s.bg}>
                      <CardContent className="flex items-center gap-3 p-4">
                        {s.icon}
                        <div>
                          <p className="text-xs text-muted-foreground">{s.name}</p>
                          <p className="text-xl font-bold">{s.value}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Plataforma</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {platformCards.map((p) => (
                    <Card key={p.name} className={p.bg}>
                      <CardContent className="flex items-center gap-3 p-4">
                        {p.icon}
                        <div>
                          <p className="text-xs text-muted-foreground">{p.name}</p>
                          <p className="text-xl font-bold">{p.value}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
              <p className="text-xs text-center text-muted-foreground">
                Mostrando datos del {shortDate} al {shortDate}
              </p>
            </div>

            {/* Entries */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">Entradas Recientes</h2>
                <span className="text-sm text-muted-foreground">{filteredEntries.length} entradas</span>
              </div>
              {entryView === "list" ? (
                <PromologTable entries={filteredEntries} />
              ) : (
                <PromologGrid entries={filteredEntries} />
              )}
            </div>
          </div>
        )}

        {/* Agentes tab */}
        {activeTab === "agentes" && (
          <div className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">Desempeño por Agente</h2>
              <p className="text-sm text-muted-foreground">
                Mostrando {agentsData.length} agente con actividad entre {shortDate} - {shortDate}
              </p>
            </div>
            <div className="space-y-3">
              {agentsData.map((agent) => (
                <Card key={agent.name}>
                  <CardContent className="flex items-center gap-4 p-4">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-muted">
                        <Users className="h-5 w-5 text-muted-foreground" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{agent.name}</p>
                      <p className="text-xs text-muted-foreground">{agent.tickets} tickets ingresados</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500/15">
                          <Check className="h-3 w-3 text-green-600" />
                        </span>
                        <span className="text-sm font-medium">{agent.si}</span>
                        <span className="text-xs text-muted-foreground">Sí</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-yellow-500/15">
                          <Minus className="h-3 w-3 text-yellow-600" />
                        </span>
                        <span className="text-sm font-medium">{agent.parcial}</span>
                        <span className="text-xs text-muted-foreground">Parcial</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/15">
                          <X className="h-3 w-3 text-red-600" />
                        </span>
                        <span className="text-sm font-medium">{agent.no}</span>
                        <span className="text-xs text-muted-foreground">No</span>
                      </div>
                      <Separator orientation="vertical" className="h-8" />
                      <div className="flex items-center gap-1.5">
                        {agent.badges.map((b) => (
                          <Badge key={b.label} variant="outline" className="text-xs">
                            {b.label} {b.value}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Campañas tab */}
        {activeTab === "campanas" && (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground text-center">
              Vista de campañas próximamente...
            </CardContent>
          </Card>
        )}

        {/* Calendario tab */}
        {activeTab === "calendario" && (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground text-center">
              Vista de calendario próximamente...
            </CardContent>
          </Card>
        )}

        {/* Creators Selection Modal */}
        <Dialog open={creatorsModalOpen} onOpenChange={setCreatorsModalOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
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
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 p-1">
                {filteredCreators.map((creator) => (
                  <Card
                    key={creator.id}
                    className="relative cursor-pointer transition-colors hover:bg-muted/50"
                    onClick={() => {
                      setSelectedCreatorForEntry(creator);
                      resetEntryModal();
                      setEntryModalOpen(true);
                      setCreatorsModalOpen(false);
                    }}
                  >
                    <CardContent className="flex flex-col items-center p-3 gap-2">
                      {creator.status !== "active" && (
                        <span className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-destructive" />
                      )}
                      <Avatar className="h-12 w-12 border-2 border-muted-foreground/50">
                        {creator.profile_photo_url ? <AvatarImage src={creator.profile_photo_url} alt={creator.name} /> : null}
                        <AvatarFallback className="bg-muted text-sm font-medium">{creator.name.charAt(0).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <p className="text-xs font-medium text-center truncate w-full">{creator.artistic_name || creator.name}</p>
                      <span className="text-sm">{getCountryFlag(creator.country)}</span>
                      <div className="flex items-center gap-1.5">
                        {creator.instagram_handle && <InstagramIcon className="h-3.5 w-3.5 text-muted-foreground" />}
                        {creator.twitter_handle && <XIcon className="h-3.5 w-3.5 text-muted-foreground" />}
                        {creator.tiktok_handle && <TikTokIcon className="h-3.5 w-3.5 text-muted-foreground" />}
                      </div>
                      {creator.category && (
                        <Badge variant={getCategoryBadgeVariant(creator.category)} className="text-[10px] px-1.5 py-0">{creator.category}</Badge>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>

        {/* Registration Modal */}
        <Dialog open={entryModalOpen} onOpenChange={setEntryModalOpen}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader className="pr-8">
              <DialogTitle>Registrar Promoción</DialogTitle>
              <DialogDescription className="sr-only">Registrar una nueva entrada de promoción para esta creadora</DialogDescription>
            </DialogHeader>
            {selectedCreatorForEntry && (
              <>
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
                  </>
                )}

                <DialogFooter>
                  <Button variant="outline" onClick={() => { setEntryModalOpen(false); toast({ title: "Registro cancelado" }); }}>Cancelar</Button>
                  <Button onClick={() => { setEntryModalOpen(false); toast({ title: "Promoción registrada", description: `La entrada para ${selectedCreatorForEntry.artistic_name || selectedCreatorForEntry.name} ha sido guardada.` }); }}>Guardar Entrada</Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Campaign Modal */}
        <Dialog open={campaignModalOpen} onOpenChange={setCampaignModalOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader className="pr-8">
              <DialogTitle>Nueva Campaña Mensual</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Creador/a *</Label>
                <Select value={campaignCreator} onValueChange={setCampaignCreator}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar creador/a" /></SelectTrigger>
                  <SelectContent>
                    {creators.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Mes/Año *</Label>
                <Input type="month" value={campaignMonth} onChange={(e) => setCampaignMonth(e.target.value)} />
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
      </div>
    </main>
  );
};

export default PromologContent;
