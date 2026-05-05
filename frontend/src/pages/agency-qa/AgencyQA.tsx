import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PhoneCall,
  Plus,
  MessageSquare,
  Users,
  BarChart3,
  Wrench,
  Headphones,
  MessageCircle,
  Briefcase,
  Megaphone,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import AgencyCalls from "./AgencyCalls";
import AgencyModels from "./AgencyModels";
import AgencyAnalytics from "./AgencyAnalytics";
import AgencyNewQa from "./AgencyNewQa";
import AgencyQaChat from "./AgencyQaChat";

// Agency QA — 2 niveles de tabs:
//
//   1. Outer: Closers QA · Chatters QA · Managers QA · Spammers QA
//      Cada rol tiene su propio set de QAs. Solo Closers QA está
//      poblado por ahora (port de kash-call-qa); el resto son
//      placeholders hasta que migremos esos flujos.
//
//   2. Inner (solo dentro de Closers QA): los 5 subtabs históricos
//      Calls · Nueva QA · QA Chat · Modelos · Analytics. Cada uno
//      sigue siendo gateable por canAccess() — un closer puede ver
//      Calls + Nueva QA, un supervisor el dashboard completo.

type ClosersQaKey = "calls" | "new-qa" | "qa-chat" | "models" | "analytics";

interface ClosersQaSub {
  key: ClosersQaKey;
  label: string;
  submodule: string;
  icon: React.ComponentType<{ className?: string }>;
  whatsComing: string;
  source: string;
}

const CLOSERS_QA_SUBS: ClosersQaSub[] = [
  {
    key: "calls",
    label: "Calls",
    submodule: "Calls",
    icon: PhoneCall,
    whatsComing:
      "Listado de llamadas analizadas con filtros y detalle por llamada (transcript, score, radar de dimensiones).",
    source: "app/calls/* + app/calls/[id]/page.tsx",
  },
  {
    key: "new-qa",
    label: "Nueva QA",
    submodule: "New QA",
    icon: Plus,
    whatsComing:
      "Form para subir el audio — Whisper transcribe, Groq analiza.",
    source: "app/new-qa/page.tsx → TranscriptUploader.tsx",
  },
  {
    key: "qa-chat",
    label: "QA Chat",
    submodule: "QA Chat",
    icon: MessageSquare,
    whatsComing:
      "Chat con Mike (asistente IA) sobre todas las QAs: ranking, comparativas, tendencias.",
    source: "app/qa/chat/page.tsx → MikeChatPanel.tsx",
  },
  {
    key: "models",
    label: "Modelos",
    submodule: "Models",
    icon: Users,
    whatsComing:
      "Catálogo de modelos con score histórico, leaderboard y trend por modelo.",
    source: "app/models/* + app/models/[id]",
  },
  {
    key: "analytics",
    label: "Analytics",
    submodule: "Analytics",
    icon: BarChart3,
    whatsComing:
      "Dashboard agregado: leaderboard de closers, distribución de outcomes, métricas.",
    source: "app/analytics/page.tsx",
  },
];

type RoleTabKey = "closers-qa" | "chatters-qa" | "managers-qa" | "spammers-qa";

interface RoleTab {
  key: RoleTabKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  ready: boolean;
  comingSoon: string;
}

const ROLE_TABS: RoleTab[] = [
  {
    key: "closers-qa",
    label: "Closers QA",
    icon: Headphones,
    ready: true,
    comingSoon: "",
  },
  {
    key: "chatters-qa",
    label: "Chatters QA",
    icon: MessageCircle,
    ready: false,
    comingSoon:
      "Auditorías de conversaciones de chatters con fans en OF — detección de tono, upsell, manejo de objeciones.",
  },
  {
    key: "managers-qa",
    label: "Managers QA",
    icon: Briefcase,
    ready: false,
    comingSoon:
      "Auditorías de manager → modelo: 1-on-1, follow-ups, planes de crecimiento.",
  },
  {
    key: "spammers-qa",
    label: "Spammers QA",
    icon: Megaphone,
    ready: false,
    comingSoon:
      "Auditorías de spam outbound (DMs masivos, bumps, content drops).",
  },
];

const ClosersQaSection = () => {
  const { canAccess } = usePermissions();
  const visibleSubs = CLOSERS_QA_SUBS.filter((s) =>
    canAccess("Agency QA", s.submodule),
  );
  const [active, setActive] = useState<ClosersQaKey>(
    (visibleSubs[0]?.key as ClosersQaKey) ?? "calls",
  );

  return (
    <Tabs value={active} onValueChange={(v) => setActive(v as ClosersQaKey)}>
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
          ) : s.key === "analytics" ? (
            <AgencyAnalytics />
          ) : s.key === "new-qa" ? (
            <AgencyNewQa />
          ) : s.key === "qa-chat" ? (
            <AgencyQaChat />
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
  );
};

const ComingSoonRoleTab = ({ tab }: { tab: RoleTab }) => (
  <Card>
    <CardContent className="space-y-3 p-6">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-amber-500/90">
        <Wrench className="h-3.5 w-3.5" />
        Próximamente
      </div>
      <h2 className="text-lg font-semibold">{tab.label}</h2>
      <p className="text-sm text-muted-foreground">{tab.comingSoon}</p>
    </CardContent>
  </Card>
);

const AgencyQA = () => {
  const [activeRole, setActiveRole] = useState<RoleTabKey>("closers-qa");

  return (
    <main className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agency QA</h1>
          <p className="text-sm text-muted-foreground">
            Auditorías de llamadas / conversaciones con IA por rol.
          </p>
        </div>

        <Tabs
          value={activeRole}
          onValueChange={(v) => setActiveRole(v as RoleTabKey)}
        >
          <TabsList>
            {ROLE_TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger key={tab.key} value={tab.key} className="gap-1.5">
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {ROLE_TABS.map((tab) => (
            <TabsContent key={tab.key} value={tab.key} className="mt-6">
              {tab.ready ? <ClosersQaSection /> : <ComingSoonRoleTab tab={tab} />}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </main>
  );
};

export default AgencyQA;
