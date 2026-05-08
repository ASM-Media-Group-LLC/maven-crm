import { useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, Sparkles, LogOut, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/usePermissions";

// Subtabs compartidos por las páginas /creadores/* — mismo patrón que
// los subtabs de Panel de Control. Click navega entre rutas, la active
// se calcula del pathname.
const CreadoresSubtabs = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { canAccess } = usePermissions();

  const tabs = [
    { url: "/creadores/dashboard", label: "Dashboard", icon: LayoutDashboard, submodule: "Dashboard" },
    { url: "/creadores", label: "Listado", icon: Users, submodule: "Lista", exact: true },
    { url: "/creadores/onboarding", label: "Onboarding", icon: Sparkles, submodule: "Onboarding" },
    { url: "/creadores/offboarding", label: "Offboarding", icon: LogOut, submodule: "Offboarding" },
    { url: "/creadores/personalizados", label: "Personalizados", icon: Star, submodule: "Personalizados" },
  ];

  const isActive = (tab: typeof tabs[number]) => {
    if (tab.exact) return pathname === tab.url;
    return pathname === tab.url || pathname.startsWith(tab.url + "/");
  };

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1 shrink-0 overflow-x-auto">
      {tabs.map((tab) => {
        if (!canAccess("Creadores", tab.submodule)) return null;
        const Icon = tab.icon;
        return (
          <Button
            key={tab.url}
            variant={isActive(tab) ? "secondary" : "ghost"}
            size="sm"
            onClick={() => navigate(tab.url)}
            className="shrink-0"
          >
            <Icon className="mr-1.5 h-4 w-4" />
            {tab.label}
          </Button>
        );
      })}
    </div>
  );
};

export default CreadoresSubtabs;
