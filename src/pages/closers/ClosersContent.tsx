import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Search, X } from "lucide-react";
import { useCloserLeads } from "./hooks/useCloserLeads";
import ClosersKPICards from "./components/ClosersKPICards";
import LeadTable from "./components/LeadTable";

const QUALITIES = ["A+", "A", "B", "C"];

const TABS = [
  { value: "todos", label: "Todos" },
  { value: "sin_contactar", label: "Sin contactar" },
  { value: "contactados", label: "Contactados" },
  { value: "interesadas", label: "Interesadas" },
  { value: "negociacion", label: "En negociación" },
  { value: "confirmadas", label: "Confirmadas" },
  { value: "completadas", label: "Completadas" },
  { value: "no_interesadas", label: "No Interesadas" },
];

const ClosersContent = () => {
  const {
    leads, isLoading, statusCounts,
    search, setSearch,
    qualityFilter, setQualityFilter,
    dateFrom, setDateFrom, dateTo, setDateTo,
    activeTab, setActiveTab,
    updateStatus, updateField,
  } = useCloserLeads();

  const hasFilters = search || qualityFilter || dateFrom || dateTo;

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      <header className="bg-background px-6 pt-6 pb-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Closers</h1>
            <p className="text-sm text-muted-foreground">Gestión de leads desde LeadGen</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : (
          <>
            <ClosersKPICards statusCounts={statusCounts} />

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="flex-wrap">
                {TABS.map((tab) => (
                  <TabsTrigger key={tab.value} value={tab.value}>
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              <div className="flex flex-wrap items-center gap-3 mt-4">
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por handle..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={qualityFilter} onValueChange={setQualityFilter}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Calidad" />
                  </SelectTrigger>
                  <SelectContent>
                    {QUALITIES.map((q) => (
                      <SelectItem key={q} value={q}>{q}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <DateRangePicker
                  from={dateFrom}
                  to={dateTo}
                  onApply={(f, t) => { setDateFrom(f); setDateTo(t); }}
                />
                {hasFilters && (
                  <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setQualityFilter(""); setDateFrom(undefined); setDateTo(undefined); }}>
                    <X className="h-4 w-4 mr-1" /> Limpiar
                  </Button>
                )}
              </div>

              {TABS.map((tab) => (
                <TabsContent key={tab.value} value={tab.value}>
                  <LeadTable
                    leads={leads}
                    onStatusChange={(id, status) => updateStatus.mutate({ id, status })}
                    onFieldChange={(id, field, value) => updateField.mutate({ id, field, value })}
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Mostrando {leads.length} leads
                  </p>
                </TabsContent>
              ))}
            </Tabs>
          </>
        )}
      </div>
    </main>
  );
};

export default ClosersContent;
