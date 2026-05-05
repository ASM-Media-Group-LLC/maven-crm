import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PhoneCall, Plus, MessageSquare, Users, BarChart3, Wrench } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import AgencyCalls from "./AgencyCalls";
import AgencyModels from "./AgencyModels";

// Agency QA landing — visual scaffold for the migration of the
// closers-QA area of kash-call-qa into Maven.
//
//   Calls       ← kash app/calls/* + app/calls/[id]
//   New QA      ← kash app/new-qa/page.tsx
//   QA Chat     ← kash app/qa/chat/page.tsx (Mike chat)
//   Models      ← kash app/models/* + app/models/[id]
//   Analytics   ← kash app/analytics/page.tsx
//
// Each subtab is gateable as its own submodule so admins can split
// access (e.g. closer only sees Calls + New QA, supervisor sees the
// full Analytics dashboard).

type SubKey = "calls" | "new-qa" | "qa-chat" | "models" | "analytics";

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
    key: "calls",
    label: "Calls",
    submodule: "Calls",
    icon: PhoneCall,
    whatsComing:
      "Listado de llamadas analizadas con filtros (cerrador, modelo, outcome, fecha) y detalle de cada llamada con transcript, score y radar de dimensiones.",
    source: "app/calls/* + app/calls/[id]/page.tsx",
  },
  {
    key: "new-qa",
    label: "Nueva QA",
    submodule: "New QA",
    icon: Plus,
    whatsComing:
      "Formulario para subir una nueva grabación / transcript, asignar closer y modelo, y disparar el análisis automático.",
    source: "app/new-qa/page.tsx → TranscriptUploader.tsx",
  },
  {
    key: "qa-chat",
    label: "QA Chat",
    submodule: "QA Chat",
    icon: MessageSquare,
    whatsComing:
      "Chat con Mike (asistente IA) sobre el conjunto de QAs: ranking, comparativas, tendencias por closer.",
    source: "app/qa/chat/page.tsx → MikeChatPanel.tsx",
  },
  {
    key: "models",
    label: "Modelos",
    submodule: "Models",
    icon: Users,
    whatsComing:
      "Catálogo de modelos OnlyFans / agencia con score histórico, leaderboard y trend chart por modelo.",
    source: "app/models/* + app/models/[id] → ModelsTable + ModelScoreTrend",
  },
  {
    key: "analytics",
    label: "Analytics",
    submodule: "Analytics",
    icon: BarChart3,
    whatsComing:
      "Dashboard de métricas agregadas: leaderboard de closers, distribución de outcomes, audio metrics y feedback humano vs IA.",
    source: "app/analytics/page.tsx → CloserLeaderboardChart + AudioMetricsChart",
  },
];

const AgencyQA = () => {
  const { canAccess } = usePermissions();
  const visibleSubs = SUBS.filter((s) => canAccess("Agency QA", s.submodule));
  const [active, setActive] = useState<SubKey>(
    (visibleSubs[0]?.key as SubKey) ?? "calls",
  );

  return (
    <main className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agency QA</h1>
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
              {s.key === "calls" ? (
                <AgencyCalls />
              ) : s.key === "models" ? (
                <AgencyModels />
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

export default AgencyQA;
