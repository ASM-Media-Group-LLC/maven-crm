import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, History as HistoryIcon, Settings, ListChecks, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/usePermissions";
import { useChatterSessions } from "@/hooks/useChatterEvaluator";
import { NewSessionDialog } from "./NewSessionDialog";

// Header compartido de /chatter-evaluator/* — título fijo, subtabs en
// posición constante (Dashboard / History / Admin) y acciones a la
// derecha (Workspace + Nueva sesión). Workspace queda como botón de
// acción — al igual que el workspace screen es un modo dedicado, no un
// subtab más.
const ChatterEvaluatorHeader = () => {
  const { pathname } = useLocation();
  const { canAccess } = usePermissions();
  const canSeeAdmin = canAccess("Chatters", "Admin");
  const canSeeWorkspace = canAccess("Chatters", "Workspace");
  const sessionsQ = useChatterSessions("active-only");
  const [newSessionOpen, setNewSessionOpen] = useState(false);

  const tabs = [
    { url: "/chatter-evaluator", label: "Dashboard", icon: LayoutDashboard, exact: true, show: true },
    { url: "/chatter-evaluator/history", label: "History", icon: HistoryIcon, show: true },
    { url: "/chatter-evaluator/admin", label: "Admin", icon: Settings, show: canSeeAdmin },
  ];

  const isActive = (tab: typeof tabs[number]) => {
    if (tab.exact) return pathname === tab.url;
    return pathname === tab.url || pathname.startsWith(tab.url + "/");
  };

  return (
    <header className="bg-background px-6 pt-6 pb-4 border-b border-border shrink-0">
      <h1 className="text-2xl font-bold mb-4">Chatter Evaluator</h1>
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1 shrink-0 overflow-x-auto">
          {tabs.filter((t) => t.show).map((tab) => {
            const Icon = tab.icon;
            return (
              <Button
                key={tab.url}
                asChild
                variant={isActive(tab) ? "secondary" : "ghost"}
                size="sm"
                className="shrink-0"
              >
                <Link to={tab.url}>
                  <Icon className="mr-1.5 h-4 w-4" />
                  {tab.label}
                </Link>
              </Button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canSeeWorkspace && (
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link to="/chatter-evaluator/workspace">
                <ListChecks className="h-4 w-4" />
                Workspace
                {sessionsQ.data && sessionsQ.data.length > 0 && (
                  <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                    {sessionsQ.data.length}
                  </span>
                )}
              </Link>
            </Button>
          )}
          <Button onClick={() => setNewSessionOpen(true)} size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            Nueva sesión
          </Button>
        </div>
      </div>
      <NewSessionDialog open={newSessionOpen} onOpenChange={setNewSessionOpen} />
    </header>
  );
};

export default ChatterEvaluatorHeader;
