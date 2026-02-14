import { useState, useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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

const navItems = [
  { label: "FOUNDATIONS", items: [
    { id: "colors", label: "1.1 Colores" },
    { id: "typography", label: "1.2 Tipografía" },
    { id: "spacing", label: "1.3 Espaciado" },
    { id: "borders", label: "1.4 Bordes" },
    { id: "shadows", label: "1.5 Sombras" },
    { id: "z-index", label: "1.6 Z-Index" },
    { id: "global-states", label: "1.7 Estados" },
  ]},
  { label: "COMPONENTS", items: [
    { id: "buttons", label: "2.1 Botones" },
    { id: "inputs", label: "2.2 Inputs" },
    { id: "dropdowns", label: "2.3 Dropdowns" },
    { id: "cards", label: "2.4 Cards" },
    { id: "modals", label: "2.5 Modales" },
    { id: "feedback", label: "2.6 Feedback" },
    { id: "data-display", label: "2.7 Data Display" },
  ]},
  { label: "LAYOUT", items: [
    { id: "layouts", label: "3.1 Page Layouts" },
    { id: "composition", label: "3.2 Composición" },
  ]},
  { label: "ICONS", items: [
    { id: "icons", label: "4.1 Iconografía" },
    { id: "avatars", label: "4.2 Avatares" },
  ]},
  { label: "DOCS", items: [
    { id: "documentation", label: "5.1 Docs & a11y" },
  ]},
];

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
  const [activeId, setActiveId] = useState("colors");
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { root: container, rootMargin: "-80px 0px -60% 0px", threshold: 0 }
    );

    const allIds = navItems.flatMap((g) => g.items.map((i) => i.id));
    allIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

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

      {/* Horizontal nav bar */}
      <div className="px-6 py-3 border-b border-border shrink-0 overflow-x-auto">
        <div className="flex items-center gap-1">
          {navItems.map((group, gi) => (
            <div key={group.label} className="flex items-center gap-1">
              {gi > 0 && (
                <div className="w-px h-5 bg-border mx-2 shrink-0" />
              )}
              {group.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => scrollTo(item.id)}
                  className={`whitespace-nowrap text-sm px-3 py-1.5 rounded-md transition-colors shrink-0 ${
                    activeId === item.id
                      ? "bg-primary/15 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Scrollable content */}
      <div ref={scrollContainerRef} className="flex-1 overflow-auto p-6 space-y-20">
        <ColorsSection />
        <TypographySection />
        <SpacingSection />
        <BordersSection />
        <ShadowsSection />
        <ZIndexSection />
        <GlobalStatesSection />
        <ButtonsSection />
        <InputsSection />
        <DropdownsSection />
        <CardsSection />
        <ModalsSection />
        <FeedbackSection />
        <DataDisplaySection />
        <LayoutPatternsSection />
        <IconsSection />
        <AvatarsSection />
        <DocumentationSection />
      </div>
    </div>
  );
};

export default DesignSystemPage;
