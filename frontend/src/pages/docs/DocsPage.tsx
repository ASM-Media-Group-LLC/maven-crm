import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import VisionGeneralSection from "./sections/VisionGeneralSection";
import ArquitecturaSection from "./sections/ArquitecturaSection";
import ModulosSection from "./sections/ModulosSection";
import EscalabilidadSection from "./sections/EscalabilidadSection";

const tabs = [
  { id: "vision", label: "Vision General" },
  { id: "arquitectura", label: "Arquitectura" },
  { id: "modulos", label: "Modulos" },
  { id: "escalabilidad", label: "Escalabilidad" },
] as const;

type TabId = (typeof tabs)[number]["id"];

const DocsPage = () => {
  const [activeTab, setActiveTab] = useState<TabId>("vision");

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      <div className="bg-background/60 backdrop-blur-xl px-6 pt-6 pb-4 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Documentacion Maven</h1>
          <Badge variant="secondary" className="text-xs">v1.0</Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Referencia oficial del sistema — Arquitectura, modulos, flujos y logica de negocio
        </p>
      </div>

      <div className="px-6 py-3 border-b border-border shrink-0">
        <div className="inline-flex rounded-lg border bg-muted/50 p-1">
          {tabs.map((tab) => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setActiveTab(tab.id)}
              className="text-sm"
            >
              {tab.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-12">
        {activeTab === "vision" && <VisionGeneralSection />}
        {activeTab === "arquitectura" && <ArquitecturaSection />}
        {activeTab === "modulos" && <ModulosSection />}
        {activeTab === "escalabilidad" && <EscalabilidadSection />}
      </div>
    </div>
  );
};

export default DocsPage;
