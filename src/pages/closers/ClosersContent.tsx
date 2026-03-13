import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Search, X } from "lucide-react";
import { useCloserLeads, CloserLead, TAB_STATUS_MAP } from "./hooks/useCloserLeads";
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
    updateStatus, updateNotes,
  } = useCloserLeads();

  const [editingNotes, setEditingNotes] = useState<CloserLead | null>(null);
  const [notesText, setNotesText] = useState("");

  const hasFilters = search || qualityFilter || dateFrom || dateTo;

  const handleEditNotes = (lead: CloserLead) => {
    setEditingNotes(lead);
    setNotesText(lead.notes || "");
  };

  const handleSaveNotes = () => {
    if (editingNotes) {
      updateNotes.mutate({ id: editingNotes.id, notes: notesText }, {
        onSuccess: () => setEditingNotes(null),
      });
    }
  };

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

              {/* Shared filters */}
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

              {/* All tabs share the same table — filtering is done by the hook */}
              {TABS.map((tab) => (
                <TabsContent key={tab.value} value={tab.value}>
                  <LeadTable
                    leads={leads}
                    onStatusChange={(id, status) => updateStatus.mutate({ id, status })}
                    onEditNotes={handleEditNotes}
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

      {/* Notes edit dialog */}
      <Dialog open={!!editingNotes} onOpenChange={(o) => !o && setEditingNotes(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Notas — @{editingNotes?.model_handle}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={notesText}
            onChange={(e) => setNotesText(e.target.value)}
            rows={4}
            placeholder="Agregar notas..."
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingNotes(null)}>Cancelar</Button>
            <Button onClick={handleSaveNotes} disabled={updateNotes.isPending}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
};

export default ClosersContent;
