import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Users, Clock, Loader2, CheckCircle2, Search, List, LayoutGrid, Plus, RefreshCw, FolderOpen } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import OnboardingWizard from "./OnboardingWizard";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import DashboardMetricCard from "@/components/dashboard/DashboardMetricCard";
import OnboardingTable from "./OnboardingTable";
import OnboardingGrid from "./OnboardingGrid";
import { useOnboarding, calculateCurrentStep, getStepLabel, type OnboardingCreator } from "./useOnboarding";

const areaTabs = ["Todas", "Atomic Agency", "Elite Models", "Kash Agency", "Trafix", "Unlok Platform", "Otra"];

const OnboardingContent = () => {
  const { data: creators = [], isLoading } = useOnboarding();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("Todas");
  const [view, setView] = useState<"table" | "grid">("table");
  const [showWizard, setShowWizard] = useState(false);
  const [editingCreator, setEditingCreator] = useState<{ id: string; initialStep: number } | null>(null);

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

  const inProgressCreators = useMemo(() => {
    return creators.filter((c) => c.dbStatus === "borrador" || c.dbStatus === "pendiente_verificacion");
  }, [creators]);

  const total = creators.length;
  const pending = creators.filter((c) => c.status === "Pendiente").length;
  const inProgress = creators.filter((c) => c.status === "En Progreso").length;
  const completed = creators.filter((c) => c.status === "Completado").length;

  const handleCardClick = (creator: OnboardingCreator) => {
    const step = calculateCurrentStep(creator);
    setEditingCreator({ id: creator.id, initialStep: step });
    setShowWizard(true);
  };

  const handleCloseWizard = () => {
    setShowWizard(false);
    setEditingCreator(null);
  };

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
            <p className="text-sm text-muted-foreground">Gestiona el onboarding de nuevos creadores</p>
          </div>
          {!showWizard && (
            <Button onClick={() => { setEditingCreator(null); setShowWizard(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Iniciar Onboarding
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 pb-6 space-y-4">
        {/* KPI Cards - always visible */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-2">
          <DashboardMetricCard label="Total" value={String(total)} icon={Users} />
          <DashboardMetricCard label="Pendientes" value={String(pending)} icon={Clock} valueColor="text-amber-500" />
          <DashboardMetricCard label="En Progreso" value={String(inProgress)} icon={Loader2} valueColor="text-blue-500" />
          <DashboardMetricCard label="Completados" value={String(completed)} icon={CheckCircle2} valueColor="text-emerald-500" />
        </div>

        {/* Onboardings en Curso - always visible when wizard is hidden */}
        {!showWizard && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-4">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Onboardings en Curso</CardTitle>
                <Badge variant="secondary-soft" className="text-xs">{inProgressCreators.length}</Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {inProgressCreators.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 border border-dashed border-border rounded-lg bg-muted/30">
                  <FolderOpen className="h-10 w-10 text-muted-foreground/50 mb-3" />
                  <p className="text-sm text-muted-foreground text-center max-w-xs">
                    No hay onboardings en curso. Haz clic en <span className="font-medium text-foreground">+ Iniciar Onboarding</span> para registrar una nueva creadora.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {inProgressCreators.map((creator) => {
                    const currentStep = calculateCurrentStep(creator);
                    const label = getStepLabel(currentStep, creator.dbStatus);
                    const progressValue = (currentStep / 4) * 100;
                    const isPending = creator.dbStatus === "pendiente_verificacion";
                    const displayName = creator.name?.trim() || "Borrador sin nombre";
                    const initials = displayName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

                    return (
                      <Card key={creator.id} className="flex flex-col gap-3 p-4 transition-all hover:border-primary/40">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9">
                            <AvatarFallback className="text-xs bg-primary/15 text-primary">{initials}</AvatarFallback>
                          </Avatar>
                          <p className="font-medium text-sm truncate flex-1">{displayName}</p>
                        </div>
                        <Progress value={isPending ? 100 : progressValue} className="h-1.5" indicatorClassName="bg-gradient-to-r from-accent to-primary" />
                        <div className="flex items-center justify-between">
                          <Badge variant={isPending ? "warning-soft" : "primary-soft"} className="text-[10px]">
                            {isPending ? "Pendiente de aprobación" : `Paso ${currentStep} de 4 — ${label}`}
                          </Badge>
                        </div>
                        <Button variant="secondary" size="sm" className="w-full mt-1" onClick={() => handleCardClick(creator)}>
                          Continuar
                        </Button>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {showWizard ? (
          <div key="wizard" className="animate-fade-in">
            <OnboardingWizard
              onCancel={handleCloseWizard}
              initialStep={editingCreator?.initialStep}
              editCreatorId={editingCreator?.id}
            />
          </div>
        ) : (
          <div key="list" className="animate-fade-in">
            {/* Area Tabs */}
            <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
              {areaTabs.map((tab) => (
                <Button
                  key={tab}
                  size="sm"
                  variant={activeTab === tab ? "secondary" : "ghost"}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab}
                </Button>
              ))}
            </div>

            {/* Filters */}
            <div className="flex items-center justify-between gap-4 mt-4">
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
            ) : (
              <div key={view} className="animate-fade-in mt-4">
                {view === "table" ? (
                  <OnboardingTable data={filtered} />
                ) : (
                  <OnboardingGrid data={filtered} />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default OnboardingContent;
