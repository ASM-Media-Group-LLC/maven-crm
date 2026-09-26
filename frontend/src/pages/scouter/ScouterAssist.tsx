import { useState } from "react";
import { useTheme } from "next-themes";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Eye, Heart, Users, BarChart3, Wrench, Radar, Settings, ClipboardList, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { usePermissions } from "@/hooks/usePermissions";
import { useScouterCompanies } from "@/hooks/useScouterLeads";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
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
//
// ⚠️ `submodule` es la llave de role_permissions ("Mis Tareas", "Busquedas"…):
// no se traduce nunca. Lo que se traduce es `label`, que es una clave de i18n.

type SubKey = "home" | "busquedas" | "favoritas" | "leads" | "funnel" | "settings" | "mis-tareas" | "alertas";

interface SubDef {
  key: SubKey;
  label: TranslationKey;
  submodule: string;
  icon: React.ComponentType<{ className?: string }>;
  whatsComing: TranslationKey;
  source: string;
}

const SUBS: SubDef[] = [
  {
    key: "home",
    label: "scouter.tab.home",
    submodule: "Home",
    icon: Eye,
    whatsComing: "scouter.tab.coming.home",
    source: "app/scouter/page.tsx → ScouterDiscoverPanel.tsx",
  },
  {
    key: "busquedas",
    label: "scouter.tab.searches",
    submodule: "Busquedas",
    icon: Radar,
    whatsComing: "scouter.tab.coming.searches",
    source: "app/scouter/page.tsx → ScouterDiscoverPanel.tsx (discover section)",
  },
  {
    key: "favoritas",
    label: "scouter.tab.favorites",
    submodule: "Favoritas",
    icon: Heart,
    whatsComing: "scouter.tab.coming.favorites",
    source: "app/scouter/favoritas/page.tsx",
  },
  {
    key: "leads",
    label: "scouter.tab.leads",
    submodule: "Leads",
    icon: Users,
    whatsComing: "scouter.tab.coming.leads",
    source: "app/scouter/leads/page.tsx → LeadsCrm.tsx + LeadDrawer.tsx",
  },
  {
    // key + submodule se mantienen para no romper permisos guardados
    // en role_permissions; solo el label visible cambió a "Analytics".
    key: "funnel",
    label: "scouter.tab.analytics",
    submodule: "Funnel",
    icon: BarChart3,
    whatsComing: "scouter.tab.coming.analytics",
    source: "app/scouter/funnel/page.tsx → ScouterFunnelPanel.tsx",
  },
  {
    key: "settings",
    label: "scouter.tab.settings",
    submodule: "Settings",
    icon: Settings,
    whatsComing: "scouter.tab.coming.settings",
    source: "kash settings/scouter → ScouterSettings.tsx",
  },
  {
    key: "mis-tareas",
    label: "scouter.tab.myTasks",
    submodule: "Mis Tareas",
    icon: ClipboardList,
    whatsComing: "scouter.tab.coming.myTasks",
    source: "scouter-daily-tasks → MisTareas.tsx",
  },
  {
    key: "alertas",
    label: "scouter.tab.alerts",
    submodule: "Alertas",
    icon: AlertTriangle,
    whatsComing: "scouter.tab.coming.alerts",
    source: "ScouterAlertas.tsx",
  },
];

const ScouterAssist = () => {
  const { t } = useLanguage();
  const { canAccess } = usePermissions();
  const visibleSubs = SUBS.filter((s) => canAccess("Scouter Assist", s.submodule));
  const [active, setActive] = useState<SubKey>(
    (visibleSubs[0]?.key as SubKey) ?? "home",
  );
  // companyFilter lifted desde ScouterHome — el header necesita saber
  // qué compañía está filtrada para decidir si mostrar su logo.
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const companiesQ = useScouterCompanies();
  const { resolvedTheme } = useTheme();
  const activeCompany = companyFilter !== "all"
    ? companiesQ.data?.find((c) => c.id === companyFilter) ?? null
    : null;
  // Pick correcto según theme con fallback al otro. Si solo hay uno
  // cargado, se usa para ambos modes. Si no hay ninguno, showLogo=false.
  const isDark = resolvedTheme === "dark";
  const logoForTheme = activeCompany
    ? (isDark
        ? activeCompany.logo_dark_url ?? activeCompany.logo_light_url
        : activeCompany.logo_light_url ?? activeCompany.logo_dark_url)
    : null;
  const showLogo = !!logoForTheme;

  return (
    <main className="flex-1 overflow-y-auto p-6">
      <div className="space-y-6">
        <PageHeader
          title={
            showLogo ? (
              // Logo de la compañía filtrada (reemplaza el título). h-12 =
              // 48px, layout tight — sin scale ni min-h artificial. Si el
              // PNG cargado tiene padding interno, el logo visible va a
              // verse chiquito; la solución real es el auto-crop al
              // subir (queda pendiente como mejora).
              <img
                src={logoForTheme!}
                alt={activeCompany!.name}
                className="h-12 w-auto object-contain"
              />
            ) : (
              "Maven Scouter Assist"
            )
          }
        />

        <Tabs value={active} onValueChange={(v) => setActive(v as SubKey)}>
          <TabsList>
            {visibleSubs.map((s) => {
              const Icon = s.icon;
              return (
                <TabsTrigger key={s.key} value={s.key} className="gap-1.5">
                  <Icon className="h-3.5 w-3.5" />
                  {t(s.label)}
                </TabsTrigger>
              );
            })}
          </TabsList>
          {visibleSubs.map((s) => (
            <TabsContent key={s.key} value={s.key} className="mt-4">
              {s.key === "home" ? (
                <ScouterHome
                  companyFilter={companyFilter}
                  setCompanyFilter={setCompanyFilter}
                />
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
                    <div className="flex items-center gap-2 text-xs font-semibold text-warning/90">
                      <Wrench className="h-3.5 w-3.5" />
                      {t("scouter.tab.inMigration")}
                    </div>
                    <h2 className="text-lg font-semibold">{t(s.label)}</h2>
                    <p className="text-sm text-muted-foreground">{t(s.whatsComing)}</p>
                    <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-[11px] font-mono text-muted-foreground">
                      {t("scouter.tab.source", { source: s.source })}
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
