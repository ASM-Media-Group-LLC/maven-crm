import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, History as HistoryIcon, Settings, ListChecks, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubtabNav, subtabNavItemClass } from "@/components/ui/subtab-nav";
import { PageHeader } from "@/components/ui/page-header";
import { usePermissions } from "@/hooks/usePermissions";
import { useChatterSessions } from "@/hooks/useChatterEvaluator";
import { NewSessionDialog } from "./NewSessionDialog";
import { useLanguage } from "@/hooks/useLanguage";

// Header compartido de /chatter-evaluator/* — título fijo, subtabs en
// posición constante (Dashboard / History / Admin) y acciones a la
// derecha (Workspace + Nueva sesión). Workspace queda como botón de
// acción — al igual que el workspace screen es un modo dedicado, no un
// subtab más.
const ChatterEvaluatorHeader = () => {
  const { t } = useLanguage();
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
    <header className="bg-background/30 backdrop-blur-xl px-6 pt-6 pb-4 border-b border-white/10 shrink-0">
      <PageHeader
        className="mb-4"
        title="Chatter Evaluator"
        actions={
          <>
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
              {t("chatters.sess.new")}
            </Button>
          </>
        }
      />
      <div className="flex items-center justify-between gap-3">
        <SubtabNav className="shrink-0 overflow-x-auto">
          {tabs.filter((tab) => tab.show).map((tab) => {
            const Icon = tab.icon;
            return (
              <Link
                key={tab.url}
                to={tab.url}
                className={subtabNavItemClass(isActive(tab))}
              >
                <Icon className="mr-1.5 h-4 w-4" />
                {tab.label}
              </Link>
            );
          })}
        </SubtabNav>
      </div>
      <NewSessionDialog open={newSessionOpen} onOpenChange={setNewSessionOpen} />
    </header>
  );
};

export default ChatterEvaluatorHeader;
