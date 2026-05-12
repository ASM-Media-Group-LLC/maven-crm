import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Clock, Loader2, CheckCircle2, Search, List, LayoutGrid, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import KpiCard from "@/components/dashboard/KpiCard";
import OnboardingTable from "./OnboardingTable";
import OnboardingGrid from "./OnboardingGrid";
import { useOnboarding, calculateCurrentStep, type OnboardingCreator } from "./useOnboarding";
import { useUserRole } from "@/hooks/useUserRole";
import CreadoresHeader from "../CreadoresHeader";

const agencyOptions = ["Atomic Agency", "Elite Models", "Kash Agency", "Unlok Platform", "Trafix", "Otra"];

const OnboardingContent = () => {
  const { data: creators = [], isLoading } = useOnboarding();
  const { isAgent } = useUserRole();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("Todas");
  const [statusFilter, setStatusFilter] = useState<string>("Todas");
  const [stepFilter, setStepFilter] = useState("");
  const [view, setView] = useState<"table" | "grid">("table");

  const statusMap: Record<string, string> = { Pendientes: "Pendiente", "En Progreso": "En Progreso", Completados: "Completado" };

  const filtered = useMemo(() => {
    let list = creators;
    if (activeTab !== "Todas") {
      list = list.filter((c) => c.company.toLowerCase() === activeTab.toLowerCase());
    }
    if (statusFilter !== "Todas") {
      const mapped = statusMap[statusFilter];
      if (mapped) list = list.filter((c) => c.status === mapped);
    }
    if (stepFilter) {
      list = list.filter((c) => String(calculateCurrentStep(c)) === stepFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q) || c.company.toLowerCase().includes(q));
    }
    return list;
  }, [creators, activeTab, statusFilter, stepFilter, search]);

  const total = creators.length;
  const pending = creators.filter((c) => c.status === "Pendiente").length;
  const inProgress = creators.filter((c) => c.status === "En Progreso").length;
  const completed = creators.filter((c) => c.status === "Completado").length;

  const hasActiveFilters = statusFilter !== "Todas" || activeTab !== "Todas" || stepFilter !== "" || search !== "";

  const clearFilters = () => {
    setStatusFilter("Todas");
    setActiveTab("Todas");
    setStepFilter("");
    setSearch("");
  };

  const kpiCards = [
    { label: "Total", value: total, icon: Users, filter: "Todas", color: "bg-blue-500" },
    { label: "Pendientes", value: pending, icon: Clock, filter: "Pendientes", color: "bg-amber-500" },
    { label: "En Progreso", value: inProgress, icon: Loader2, filter: "En Progreso", color: "bg-violet-500" },
    { label: "Completados", value: completed, icon: CheckCircle2, filter: "Completados", color: "bg-emerald-500" },
  ];

  const handleCardClick = (creator: OnboardingCreator) => {
    navigate(`/creadores/onboarding/${creator.id}`);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      <CreadoresHeader
        action={
          !isAgent ? (
            <Button onClick={() => navigate("/creadores/onboarding/nuevo")}>
              <Plus className="h-4 w-4 mr-2" />
              Iniciar Onboarding
            </Button>
          ) : undefined
        }
      />

      <div className="flex-1 overflow-auto px-6 pt-6 pb-6 space-y-4">
        {/* KPI Cards — click filtra la lista (no abre modal porque la lista vive abajo) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {kpiCards.map((kpi) => (
            <KpiCard
              key={kpi.label}
              label={kpi.label}
              value={String(kpi.value)}
              icon={kpi.icon}
              color={kpi.color}
              onClick={() => setStatusFilter(kpi.filter)}
              className={statusFilter === kpi.filter ? "ring-2 ring-primary" : undefined}
            />
          ))}
        </div>

        {/* Agency Tabs */}
        <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
          <Button size="sm" variant={activeTab === "Todas" ? "secondary" : "ghost"} onClick={() => setActiveTab("Todas")}>Todas</Button>
          {agencyOptions.map((a) => (
            <Button key={a} size="sm" variant={activeTab === a ? "secondary" : "ghost"} onClick={() => setActiveTab(a)}>{a}</Button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o empresa..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select value={stepFilter || undefined} onValueChange={(v) => setStepFilter(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Etapa del Proceso" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas las etapas</SelectItem>
              <SelectItem value="1">Paso 1: Datos Personales</SelectItem>
              <SelectItem value="2">Paso 2: Perfil Psicológico</SelectItem>
              <SelectItem value="3">Paso 3: Documentación</SelectItem>
              <SelectItem value="4">Paso 4: Config. Comercial</SelectItem>
            </SelectContent>
          </Select>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="mr-1.5 h-4 w-4" />
              Limpiar filtros
            </Button>
          )}

          <div className="ml-auto flex items-center gap-1 rounded-lg border p-1">
            <Button size="icon" variant={view === "table" ? "secondary" : "ghost"} className="h-8 w-8" onClick={() => setView("table")}>
              <List className="h-4 w-4" />
            </Button>
            <Button size="icon" variant={view === "grid" ? "secondary" : "ghost"} className="h-8 w-8" onClick={() => setView("grid")}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div key={view} className="animate-fade-in">
            {view === "table" ? (
              <OnboardingTable data={filtered} onManage={handleCardClick} />
            ) : (
              <OnboardingGrid data={filtered} onManage={handleCardClick} />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default OnboardingContent;
