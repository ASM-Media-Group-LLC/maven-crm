import { useState } from "react";
import { Plus, UserPlus, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import LeadGenCantidadCard from "./LeadGenCantidadCard";
import LeadGenEstadosCard from "./LeadGenEstadosCard";

const tabs = [
  { id: "leads", label: "Leads" },
  { id: "agentes", label: "Agentes" },
  { id: "supervisores", label: "Supervisores" },
  { id: "rendimiento", label: "Rendimiento" },
  { id: "leads-hora", label: "Leads por Hora" },
];

const LeadGenContent = () => {
  const [activeTab, setActiveTab] = useState("leads");

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      {/* Header */}
      <header className="shrink-0 px-6 pt-6 pb-4 border-b">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">LeadGen</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Marketing y generación de leads · 0 leads
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <UserPlus className="h-4 w-4" />
              Contacto
            </Button>
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Lead
            </Button>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <LeadGenCantidadCard />
          <LeadGenEstadosCard />
        </div>
      </div>

      {/* Footer tab bar */}
      <footer className="shrink-0 border-t px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="inline-flex items-center gap-1 rounded-lg bg-muted/50 p-1">
            {tabs.map((tab) => (
              <Button
                key={tab.id}
                variant={activeTab === tab.id ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setActiveTab(tab.id)}
                className="text-xs"
              >
                {tab.label}
              </Button>
            ))}
          </div>
          <Button variant="outline" size="sm">
            <Database className="h-4 w-4" />
            Base de Datos
          </Button>
        </div>
      </footer>
    </main>
  );
};

export default LeadGenContent;
