import { useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, Sparkles, LogOut } from "lucide-react";
import { SubtabNav, SubtabNavItem } from "@/components/ui/subtab-nav";
import { usePermissions } from "@/hooks/usePermissions";

// Subtabs compartidos por las páginas /creadores/* — mismo patrón que
// los subtabs de Panel de Control. Click navega entre rutas, la active
// se calcula del pathname. Usa el componente shared <SubtabNav> para
// matchear el lenguaje visual de Tabs en el resto del CRM.
const CreadoresSubtabs = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { canAccess } = usePermissions();

  const tabs = [
    { url: "/creadores/dashboard", label: "Dashboard", icon: LayoutDashboard, submodule: "Dashboard" },
    { url: "/creadores", label: "Listado", icon: Users, submodule: "Lista", exact: true },
    { url: "/creadores/onboarding", label: "Onboarding", icon: Sparkles, submodule: "Onboarding" },
    { url: "/creadores/offboarding", label: "Offboarding", icon: LogOut, submodule: "Offboarding" },
  ];

  const isActive = (tab: typeof tabs[number]) => {
    if (tab.exact) return pathname === tab.url;
    return pathname === tab.url || pathname.startsWith(tab.url + "/");
  };

  return (
    <SubtabNav className="max-w-full overflow-x-auto scrollbar-thin-x">
      {tabs.map((tab) => {
        if (!canAccess("Creadores", tab.submodule)) return null;
        const Icon = tab.icon;
        return (
          <SubtabNavItem
            key={tab.url}
            active={isActive(tab)}
            onClick={() => navigate(tab.url)}
          >
            <Icon className="mr-1.5 h-4 w-4" />
            {tab.label}
          </SubtabNavItem>
        );
      })}
    </SubtabNav>
  );
};

export default CreadoresSubtabs;
