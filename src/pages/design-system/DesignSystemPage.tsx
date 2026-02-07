import { useState, useEffect } from "react";
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
    { id: "icons", label: "1.8 Iconografía" },
    { id: "avatars", label: "1.9 Avatares" },
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
  { label: "GUIDELINES", items: [
    { id: "documentation", label: "3.1 Docs & a11y" },
  ]},
];

const DesignSystemPage = () => {
  const [activeId, setActiveId] = useState("colors");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 }
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
    <div className="min-h-screen bg-background text-foreground" style={{ scrollBehavior: "smooth" }}>
      <div className="flex">
        {/* Sidebar */}
        <nav className="hidden lg:block w-60 shrink-0 border-r border-border">
          <div className="sticky top-0 h-screen overflow-y-auto py-8 px-4 space-y-6">
            <div>
              <h1 className="text-lg font-bold">Design System</h1>
              <p className="text-xs text-muted-foreground">v1.0.0</p>
            </div>
            {navItems.map((group) => (
              <div key={group.label}>
                <p className="text-xs font-semibold text-muted-foreground tracking-wider mb-2">
                  {group.label}
                </p>
                <ul className="space-y-0.5">
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <button
                        onClick={() => scrollTo(item.id)}
                        className={`w-full text-left text-sm px-3 py-1.5 rounded-md transition-colors ${
                          activeId === item.id
                            ? "bg-primary/15 text-primary font-medium"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        }`}
                      >
                        {item.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        {/* Main content */}
        <main className="flex-1 min-w-0 max-w-5xl mx-auto px-6 py-12 space-y-20">
          <header className="space-y-2">
            <h1 className="text-5xl font-bold tracking-tight lg:hidden">Design System</h1>
            <p className="text-muted-foreground text-lg">
              Referencia completa de tokens de diseño y componentes UI.
            </p>
            <p className="text-sm text-muted-foreground">
              React + Tailwind CSS · Tema oscuro · Tokens semánticos HSL
            </p>
          </header>

          {/* Foundations */}
          <ColorsSection />
          <TypographySection />
          <SpacingSection />
          <BordersSection />
          <ShadowsSection />
          <ZIndexSection />
          <GlobalStatesSection />
          <IconsSection />
          <AvatarsSection />

          {/* Components */}
          <ButtonsSection />
          <InputsSection />
          <DropdownsSection />
          <CardsSection />
          <ModalsSection />
          <FeedbackSection />
          <DataDisplaySection />

          {/* Guidelines */}
          <DocumentationSection />
        </main>
      </div>
    </div>
  );
};

export default DesignSystemPage;
