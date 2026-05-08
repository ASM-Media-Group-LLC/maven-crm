import { useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, FileBarChart, Sparkles, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    if (tab.altPrefix && (pathname === tab.altPrefix || pathname.startsWith(tab.altPrefix + "/"))) return true;
    return false;
  };

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1 shrink-0 overflow-x-auto">
      {tabs.map((tab) => {
        if (!canAccess("Creator Sales", tab.submodule)) return null;
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

export default VentasSubtabs;
