import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

const ThemeToggle = () => {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const isDark = theme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors bg-muted hover:bg-muted/80 text-foreground"
      aria-label={`Cambiar a tema ${isDark ? "claro" : "oscuro"}`}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      <span>{isDark ? "Light" : "Dark"}</span>
    </button>
  );
};

const DesignSystemPage = () => {
  const [activeTab, setActiveTab] = useState<TabId>("foundations");

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      {/* Header */}
      <div className="bg-background px-6 pt-6 pb-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Design System</h1>
            <Badge variant="secondary" className="text-xs">v1.0.0</Badge>
          </div>
          <ThemeToggle />
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Referencia completa de tokens de diseño y componentes UI · React + Tailwind CSS · Light / Dark mode
        </p>
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
