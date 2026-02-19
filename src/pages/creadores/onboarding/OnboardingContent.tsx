import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Users, Clock, Loader2, CheckCircle2, Search, List, LayoutGrid, Plus } from "lucide-react";
import StartOnboardingModal from "./StartOnboardingModal";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import DashboardMetricCard from "@/components/dashboard/DashboardMetricCard";
import OnboardingTable from "./OnboardingTable";
import OnboardingGrid from "./OnboardingGrid";
import { useOnboarding } from "./useOnboarding";

const areaTabs = ["Todas", "Atomic Agency", "Elite Models", "Kash Agency", "Otra", "Unlok Platform"];

const OnboardingContent = () => {
  const { data: creators = [], isLoading } = useOnboarding();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("Todas");
  const [view, setView] = useState<"table" | "grid">("table");
  const [showModal, setShowModal] = useState(false);

  const filtered = useMemo(() => {
    let list = creators;
    if (activeTab !== "Todas") {
      list = list.filter((c) => c.company.toLowerCase() === activeTab.toLowerCase());
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q) || c.company.toLowerCase().includes(q));
    }
    return list;
  }, [creators, activeTab, search]);

  const total = creators.length;
  const pending = creators.filter((c) => c.status === "Pendiente").length;
  const inProgress = creators.filter((c) => c.status === "En Progreso").length;
  const completed = creators.filter((c) => c.status === "Completado").length;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      <div className="shrink-0 bg-background px-6 pt-4 pb-2">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/creadores">Creadores</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Onboarding</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex items-center justify-between mt-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Onboarding</h1>
            <p className="text-sm text-muted-foreground">Gestiona el proceso de onboarding de nuevos creadores</p>
          </div>
          <Button onClick={() => setShowModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Iniciar Onboarding
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 pb-6 space-y-4">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-2">
          <DashboardMetricCard label="Total Onboarding" value={String(total)} icon={Users} />
          <DashboardMetricCard label="Pendientes" value={String(pending)} icon={Clock} valueColor="text-amber-500" />
          <DashboardMetricCard label="En Progreso" value={String(inProgress)} icon={Loader2} valueColor="text-blue-500" />
          <DashboardMetricCard label="Completados" value={String(completed)} icon={CheckCircle2} valueColor="text-emerald-500" />
        </div>

        {/* Area Tabs */}
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
          {areaTabs.map((tab) => (
            <Button
              key={tab}
              size="sm"
              variant={activeTab === tab ? "default" : "ghost"}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </Button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center justify-between gap-4">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o empresa..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-1 rounded-lg border p-1">
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
        ) : view === "table" ? (
          <OnboardingTable data={filtered} />
        ) : (
          <OnboardingGrid data={filtered} />
        )}
      </div>

      <StartOnboardingModal open={showModal} onClose={() => setShowModal(false)} />
    </div>
  );
};

export default OnboardingContent;
