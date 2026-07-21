import { useState } from "react";
import { cn } from "@/lib/utils";
import { Settings, Bell, Radio, Layers, BarChart3, FileText, Moon, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import GeneralTab from "./notificaciones/GeneralTab";
import CanalesTab from "./notificaciones/CanalesTab";
import EventosTab from "./notificaciones/EventosTab";
import PrioridadTab from "./notificaciones/PrioridadTab";
import ResumenesTab from "./notificaciones/ResumenesTab";
import NoMolestarTab from "./notificaciones/NoMolestarTab";

const TABS = [
  { id: "general", label: "General", icon: Settings },
  { id: "canales", label: "Canales", icon: Radio },
  { id: "eventos", label: "Eventos", icon: Bell },
  { id: "prioridad", label: "Prioridad", icon: BarChart3 },
  { id: "resumenes", label: "Resúmenes", icon: FileText },
  { id: "no-molestar", label: "No Molestar", icon: Moon },
] as const;

const TAB_CONTENT: Record<string, React.FC> = {
  general: GeneralTab,
  canales: CanalesTab,
  eventos: EventosTab,
  prioridad: PrioridadTab,
  resumenes: ResumenesTab,
  "no-molestar": NoMolestarTab,
};

const NotificacionesSettings = () => {
  const [activeTab, setActiveTab] = useState("general");
  const navigate = useNavigate();
  const ActiveComponent = TAB_CONTENT[activeTab];

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="flex-1 min-h-0 overflow-hidden">
      <div className="h-full flex flex-col">
        {/* Fixed Header */}
        <div className="shrink-0 border-b border-border bg-background px-6 py-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => navigate("/notificaciones")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-foreground">Configuración de Notificaciones</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Controla qué notificaciones recibes, por qué canal y con qué prioridad.
              </p>
            </div>
          </div>
        </div>

        {/* Content: Sidebar + Tab Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* Vertical Tabs - Desktop */}
          <nav className="hidden md:flex shrink-0 w-48 border-r border-border bg-muted/30 flex-col py-2">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={cn(
                  "flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors text-left",
                  activeTab === id
                    ? "bg-background text-foreground font-medium border-r-2 border-primary shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </button>
            ))}
          </nav>

          {/* Horizontal Tabs - Mobile */}
          <div className="md:hidden shrink-0 border-b border-border bg-background overflow-x-auto">
            <div className="flex px-2 py-1.5 gap-1 min-w-max">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs whitespace-nowrap transition-colors",
                    activeTab === id
                      ? "bg-primary text-primary-foreground font-medium"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-auto p-6">
            <div className="max-w-3xl">
              <ActiveComponent />
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};

export default NotificacionesSettings;
