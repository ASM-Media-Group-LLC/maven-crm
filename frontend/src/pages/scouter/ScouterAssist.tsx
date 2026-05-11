import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Eye, Heart, Users, BarChart3, Wrench, Radar, Settings, ClipboardList, AlertTriangle } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import ScouterHome from "./ScouterHome";
import ScouterLeads from "./ScouterLeads";
import ScouterFunnel from "./ScouterFunnel";
import ScouterDiscover from "./ScouterDiscover";
import ScouterSettings from "./ScouterSettings";
import MisTareas from "./MisTareas";
import ScouterAlertas from "./ScouterAlertas";

// Scouter Assist landing — visual scaffold for the migration of the
// `app/scouter/*` area from kash-call-qa into Maven. Each subtab is a
// placeholder that documents what will land here in upcoming
// migration slices.
//
//   Home       ← kash app/scouter/page.tsx        — discover panel
//   Favoritas  ← kash app/scouter/favoritas/...   — saved leads
//   Leads      ← kash app/scouter/leads/...       — full CRM table
//   Funnel     ← kash app/scouter/funnel/...      — pipeline metrics
//
// Permissions: the parent route is gated by `Scouter Assist`; each
// subtab is independently gateable as a submodule so admins can grant
// e.g. "Funnel only" later.

type SubKey = "home" | "busquedas" | "favoritas" | "leads" | "funnel" | "settings" | "mis-tareas" | "alertas";

interface SubDef {
  key: SubKey;
  label: string;
  submodule: string;
  icon: React.ComponentType<{ className?: string }>;
  whatsComing: string;
  source: string;
}

const SUBS: SubDef[] = [
  {
    key: "home",
    label: "Home",
    submodule: "Home",
    icon: Eye,
    whatsComing:
      "Panel de descubrimiento de prospectos: filtros por país, categoría, seguidores, engagement. Lista priorizada por scoring.",
    source: "app/scouter/page.tsx → ScouterDiscoverPanel.tsx",
  },
  {
    key: "busquedas",
    label: "Búsquedas",
    submodule: "Busquedas",
    icon: Radar,
    whatsComing:
      "Botón de escaneo con animación radar, consola live del worker, y grid de leads recién descubiertas aprobadas por IA.",
    source: "app/scouter/page.tsx → ScouterDiscoverPanel.tsx (discover section)",
  },
  {
    key: "favoritas",
    label: "Favoritas",
    submodule: "Favoritas",
    icon: Heart,
    whatsComing:
      "Tablero de leads marcados como favoritos por el scouter. Acciones rápidas: archivar, mover a CRM, generar resumen IA.",
    source: "app/scouter/favoritas/page.tsx",
  },
  {
    key: "leads",
    label: "Leads",
    submodule: "Leads",
    icon: Users,
    whatsComing:
      "Tabla CRM completa de leads con drawer lateral, edición inline, asignación a closers y export a Excel.",
    source: "app/scouter/leads/page.tsx → LeadsCrm.tsx + LeadDrawer.tsx",
  },
  {
    // key + submodule se mantienen para no romper permisos guardados
    // en role_permissions; solo el label visible cambió a "Analytics".
    key: "funnel",
    label: "Analytics",
    submodule: "Funnel",
    icon: BarChart3,
    whatsComing:
      "Embudo del pipeline + progreso diario del equipo de spammers.",
    source: "app/scouter/funnel/page.tsx → ScouterFunnelPanel.tsx",
  },
  {
    key: "settings",
    label: "Settings",
    submodule: "Settings",
    icon: Settings,
    whatsComing:
      "Gestión de compañías, configuración de búsqueda por IA, presupuesto Apify, y parámetros del scorer.",
    source: "kash settings/scouter → ScouterSettings.tsx",
  },
  {
    key: "mis-tareas",
    label: "Mis Tareas",
    submodule: "Mis Tareas",
    icon: ClipboardList,
    whatsComing:
      "Panel diario del spammer con 50 leads asignados por IA y micro-tareas de interacción.",
    source: "scouter-daily-tasks → MisTareas.tsx",
  },
  {
    key: "alertas",
    label: "Alertas",
    submodule: "Alertas",
    icon: AlertTriangle,
    whatsComing:
      "Vista de manager con tareas pendientes acumuladas por spammer. Sirve para detectar quién deja tareas sin completar antes de que se rolleen al día siguiente.",
    source: "ScouterAlertas.tsx",
  },
];

const ScouterAssist = () => {
  const { canAccess } = usePermissions();
  const visibleSubs = SUBS.filter((s) => canAccess("Scouter Assist", s.submodule));
  const [active, setActive] = useState<SubKey>(
    (visibleSubs[0]?.key as SubKey) ?? "home",
  );

  return (
    <main className="flex-1 overflow-y-auto p-6">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Scouter Assist</h1>
          <p className="text-sm text-muted-foreground">
            Migrando desde Kash-call-qa. Las pestañas y permisos ya están
            cableados; el contenido se llenará en las próximas iteraciones.
          </p>
        </div>

        <Tabs value={active} onValueChange={(v) => setActive(v as SubKey)}>
          <TabsList>
            {visibleSubs.map((s) => {
              const Icon = s.icon;
              return (
                <TabsTrigger key={s.key} value={s.key} className="gap-1.5">
                  <Icon className="h-3.5 w-3.5" />
                  {s.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
          {visibleSubs.map((s) => (
            <TabsContent key={s.key} value={s.key} className="mt-4">
              {s.key === "home" ? (
                <ScouterHome />
              ) : s.key === "busquedas" ? (
                <ScouterDiscover />
              ) : s.key === "favoritas" ? (
                <ScouterHome favoritesOnly />
              ) : s.key === "leads" ? (
                <ScouterLeads />
              ) : s.key === "funnel" ? (
                <ScouterFunnel />
              ) : s.key === "settings" ? (
                <ScouterSettings />
              ) : s.key === "mis-tareas" ? (
                <MisTareas />
              ) : s.key === "alertas" ? (
                <ScouterAlertas />
              ) : (
                <Card>
                  <CardContent className="space-y-3 p-6">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-amber-500/90">
                      <Wrench className="h-3.5 w-3.5" />
                      En migración
                    </div>
                    <h2 className="text-lg font-semibold">{s.label}</h2>
                    <p className="text-sm text-muted-foreground">{s.whatsComing}</p>
                    <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-[11px] font-mono text-muted-foreground">
                      Origen: {s.source}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </main>
  );
};

export default ScouterAssist;
