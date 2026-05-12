import { useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, FileBarChart, Sparkles, ShieldAlert } from "lucide-react";
import { SubtabNav, SubtabNavItem } from "@/components/ui/subtab-nav";
import { usePermissions } from "@/hooks/usePermissions";

// Subtabs compartidos por las páginas /sales-* — mismo patrón que
// CreadoresSubtabs. Click navega entre rutas, la activa se calcula del
// pathname.
const VentasSubtabs = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { canAccess } = usePermissions();

  const tabs = [
    { url: "/sales-overview", label: "Dashboard", icon: LayoutDashboard, submodule: "Dashboard", prefix: "/sales-overview" },
    { url: "/salesdashboard", label: "Reportes", icon: FileBarChart, submodule: "Reportes", prefix: "/salesdashboard" },
    { url: "/aisales", label: "IA Ventas", icon: Sparkles, submodule: "IA Ventas", prefix: "/aisales" },
    { url: "/sales-audit", label: "Auditoría", icon: ShieldAlert, submodule: "Auditoría", prefix: "/sales-audit" },
  ];

  const isActive = (tab: typeof tabs[number]) => {
    if (pathname === tab.url) return true;
    if (pathname.startsWith(tab.prefix + "/")) return true;
    return false;
  };

  return (
    <SubtabNav className="shrink-0 overflow-x-auto">
      {tabs.map((tab) => {
        if (!canAccess("Creator Sales", tab.submodule)) return null;
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

export default VentasSubtabs;
