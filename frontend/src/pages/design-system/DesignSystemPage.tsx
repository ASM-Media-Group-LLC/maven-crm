import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { SistemaSection } from "./sections/SistemaSection";
import { ColorsSection } from "./sections/ColorsSection";
import { TypographySection } from "./sections/TypographySection";
import { SpacingSection } from "./sections/SpacingSection";
import { BordersSection } from "./sections/BordersSection";
import { ShadowsSection } from "./sections/ShadowsSection";
import { ZIndexSection } from "./sections/ZIndexSection";
import { GlobalStatesSection } from "./sections/GlobalStatesSection";
import { ButtonsSection } from "./sections/ButtonsSection";
import { InputsSection } from "./sections/InputsSection";
import { DropdownsSection } from "./sections/DropdownsSection";
import { CardsSection } from "./sections/CardsSection";
import { StatChipEmptyStateSection } from "./sections/StatChipEmptyStateSection";
import { ModalsSection } from "./sections/ModalsSection";
import { FeedbackSection } from "./sections/FeedbackSection";
import { DataDisplaySection } from "./sections/DataDisplaySection";
import { LayoutPatternsSection } from "./sections/LayoutPatternsSection";
import { IconsSection } from "./sections/IconsSection";
import { AvatarsSection } from "./sections/AvatarsSection";
import { DocumentationSection } from "./sections/DocumentationSection";

const tabs = [
  { id: "foundations", label: "Design Foundations" },
  { id: "components", label: "Component Library" },
  { id: "layout", label: "Layout & Patterns" },
  { id: "icons", label: "Icons & Logos" },
  { id: "docs", label: "Docs & Accessibility" },
] as const;

type TabId = (typeof tabs)[number]["id"];



const DesignSystemPage = () => {
  const [activeTab, setActiveTab] = useState<TabId>("foundations");

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      {/* Header */}
      <div className="bg-background/30 backdrop-blur-xl px-6 pt-6 pb-4 border-b border-white/10 shrink-0">
        <PageHeader
          title={<span className="inline-flex items-center gap-3">Design System <Badge variant="secondary" className="text-xs font-sans">v2.0</Badge></span>}
          subtitle="Tokens, componentes y las ocho reglas del sistema, en tema claro y oscuro."
        />
      </div>

      {/* Tab bar */}
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

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto p-6 space-y-20">
        {activeTab === "foundations" && (
          <>
            <SistemaSection />
            <ColorsSection />
            <TypographySection />
            <SpacingSection />
            <BordersSection />
            <ShadowsSection />
            <ZIndexSection />
            <GlobalStatesSection />
          </>
        )}
        {activeTab === "components" && (
          <>
            <ButtonsSection />
            <InputsSection />
            <DropdownsSection />
            <CardsSection />
            <StatChipEmptyStateSection />
            <ModalsSection />
            <FeedbackSection />
            <DataDisplaySection />
          </>
        )}
        {activeTab === "layout" && (
          <>
            <LayoutPatternsSection />
          </>
        )}
        {activeTab === "icons" && (
          <>
            <IconsSection />
            <AvatarsSection />
          </>
        )}
        {activeTab === "docs" && (
          <>
            <DocumentationSection />
          </>
        )}
      </div>
    </div>
  );
};

export default DesignSystemPage;
