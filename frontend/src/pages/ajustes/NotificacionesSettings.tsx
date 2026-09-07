import { cn } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { TABS, TAB_POR_DEFECTO, tabDesdeUrl, type TabId } from "./notificaciones/tabs";
import { Button } from "@/components/ui/button";
import GeneralTab from "./notificaciones/GeneralTab";
import CanalesTab from "./notificaciones/CanalesTab";
import EventosTab from "./notificaciones/EventosTab";
import PrioridadTab from "./notificaciones/PrioridadTab";
import ResumenesTab from "./notificaciones/ResumenesTab";
import NoMolestarTab from "./notificaciones/NoMolestarTab";

const TAB_CONTENT: Record<string, React.FC> = {
  general: GeneralTab,
  canales: CanalesTab,
  eventos: EventosTab,
  prioridad: PrioridadTab,
  resumenes: ResumenesTab,
  "no-molestar": NoMolestarTab,
};

const NotificacionesSettings = () => {
  // La pestaña va en la URL (?tab=…) para sobrevivir al refresco; ver tabs.ts.
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = tabDesdeUrl(searchParams.get("tab"));
  const setActiveTab = (tab: TabId) => {
    const siguiente = new URLSearchParams(searchParams);
    if (tab === TAB_POR_DEFECTO) siguiente.delete("tab");
    else siguiente.set("tab", tab);
    setSearchParams(siguiente, { replace: true });
  };
  const navigate = useNavigate();
  const ActiveComponent = TAB_CONTENT[activeTab];

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="flex-1 min-h-0 overflow-hidden">
      <div className="h-full flex flex-col">
        {/* Encabezado fijo. Escala del PageHeader canónico (font-display). */}
        <div className="shrink-0 border-b border-border/60 bg-background/80 backdrop-blur px-4 py-3 md:px-8 md:py-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg"
              onClick={() => navigate("/notificaciones")}
              aria-label="Volver a notificaciones"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <h1 className="font-display text-xl md:text-2xl font-bold leading-tight tracking-tight text-foreground">
                Notificaciones
              </h1>
              <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
                Qué te avisa Maven, por dónde y cuándo.
              </p>
            </div>
          </div>
        </div>

        {/* Content: Sidebar + Tab Content. En teléfono la fila pasa a columna: las
            pestañas horizontales arriba y el contenido debajo. Con `flex` (fila)
            las pestañas y el contenido quedaban lado a lado y el contenido se iba
            fuera de la pantalla — en el celular no se veía NADA de la pestaña. */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          {/* Secciones (escritorio). La activa lleva la barrita con el degradé de marca. */}
          <nav className="hidden md:flex shrink-0 w-56 border-r border-border/60 flex-col gap-0.5 p-3">
            {TABS.map(({ id, label, icon: Icon }) => {
              const activa = activeTab === id;
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  aria-current={activa ? "page" : undefined}
                  className={cn(
                    "relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors text-left",
                    activa
                      ? "bg-primary/10 text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  )}
                >
                  {activa && (
                    <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-gradient-to-b from-accent to-primary" />
                  )}
                  <Icon className={cn("h-4 w-4 shrink-0", activa && "text-primary")} />
                  {label}
                </button>
              );
            })}
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

          {/* Contenido. Ocupa la pantalla (hasta 1700 px): antes era una columna
              max-w-3xl pegada a la izquierda y en un monitor grande quedaba media
              pantalla vacía (Jhon, 07/09/2026). Cada pestaña decide cómo repartir
              ese ancho (Eventos: matriz + panel lateral). */}
          <div className="flex-1 min-h-0 overflow-auto p-4 md:p-8">
            <div className="mx-auto w-full max-w-[1700px]">
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
