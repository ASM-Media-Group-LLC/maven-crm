import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  MessageSquare,
  Users,
  BarChart3,
  Wrench,
  Headphones,
  MessageCircle,
  Briefcase,
  Megaphone,
  History,
  Bell,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import AgencyModels from "./AgencyModels";
import AgencyAnalytics from "./AgencyAnalytics";
import AgencyNewQa from "./AgencyNewQa";
import AgencyQaChat from "./AgencyQaChat";
import AgencyQaHistory from "./AgencyQaHistory";
import AgencyQaNotifications from "./AgencyQaNotifications";
import CallDetailPage from "./CallDetailPage";

// Agency QA — 2 niveles:
//
//   1. Left rail (vertical, estilo Settings): roles
//        Closers QA · Chatters QA · Managers QA · Spammers QA
//      Cada rol tiene su propio mundo de QAs. Solo Closers QA está
//      poblado (port de kash-call-qa); el resto son placeholders.
//
//   2. Inside Closers QA → horizontal tabs:
//        Calls · Nueva QA · QA Chat · Modelos · Analytics
//      Estos se mantienen como tabs horizontales (no se restructuran)
//      y siguen siendo gateables individualmente vía canAccess().

type ClosersQaKey =
  | "calls"
  | "new-qa"
  | "qa-history"
  | "qa-chat"
  | "models"
  | "analytics"
  | "notifications";

interface ClosersQaSub {
  key: ClosersQaKey;
  label: string;
  submodule: string;
  icon: React.ComponentType<{ className?: string }>;
  whatsComing: string;
  source: string;
}

const CLOSERS_QA_SUBS: ClosersQaSub[] = [
  // Dashboard = analytics agregadas. La lista de llamadas era redundante
  // con QA History, así que la fusionamos: este tab ahora muestra el
  // leaderboard / distribución / métricas, y el listado vive solo en
  // QA History.
  {
    key: "calls",
    label: "Dashboard",
    submodule: "Calls",
    icon: BarChart3,
    whatsComing: "Dashboard de analytics: leaderboard, outcomes, métricas.",
    source: "app/analytics/page.tsx",
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
    key: "qa-history",
    label: "QA History",
    submodule: "QA History",
    icon: History,
    whatsComing:
      "Mis QAs recientes con estado de transcripción y análisis IA.",
    source: "(propio de Maven — no existe en kash)",
  },
  {
    key: "qa-chat",
    label: "QA Chat",
    submodule: "QA Chat",
    icon: MessageSquare,
    whatsComing:
      "Chat con Clari (asistente IA) sobre todas las QAs: ranking, comparativas, tendencias.",
    source: "app/qa/chat/page.tsx → ClariChatPanel.tsx",
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
    key: "notifications",
    label: "Notificaciones",
    submodule: "Notifications",
    icon: Bell,
    whatsComing:
      "Config de emails: disparos por evento (cargada / analizada / score bajo / fallo) + lista de destinatarios.",
    source: "(propio de Maven — sigue patrón Chatter Evaluator)",
  },
];

type RoleKey = "closers-qa" | "chatters-qa" | "managers-qa" | "spammers-qa";

interface RoleSection {
  key: RoleKey;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  ready: boolean;
  comingSoon: string;
}

const ROLE_SECTIONS: RoleSection[] = [
  {
    key: "closers-qa",
    label: "Closers QA",
    description: "Llamadas de venta de closers a modelos.",
    icon: Headphones,
    ready: true,
    comingSoon: "",
  },
  {
    key: "chatters-qa",
    label: "Chatters QA",
    description: "Conversaciones de chatters con fans en OF.",
    icon: MessageCircle,
    ready: false,
    comingSoon:
      "Auditorías de conversaciones de chatters con fans en OF — detección de tono, upsell, manejo de objeciones.",
  },
  {
    key: "managers-qa",
    label: "Managers QA",
    description: "1-on-1 manager → modelo, follow-ups.",
    icon: Briefcase,
    ready: false,
    comingSoon:
      "Auditorías de manager → modelo: 1-on-1, follow-ups, planes de crecimiento.",
  },
  {
    key: "spammers-qa",
    label: "Spammers QA",
    description: "DMs masivos, bumps, content drops.",
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
  // Full-page call detail: when set, replaces the tabs with CallDetailPage.
  // El deeplink desde el email (`?callId=<uuid>`) lo abre automáticamente.
  const [searchParams, setSearchParams] = useSearchParams();
  const urlCallId = searchParams.get("callId");
  const [detailCallId, setDetailCallId] = useState<string | null>(urlCallId);

  // Sync state cuando cambia el URL param (ej. usuario pega un link).
  useEffect(() => {
    if (urlCallId && urlCallId !== detailCallId) {
      setDetailCallId(urlCallId);
    }
  }, [urlCallId, detailCallId]);

  const openCallDetail = (callId: string) => {
    setDetailCallId(callId);
    setSearchParams({ callId }, { replace: false });
  };
  const closeCallDetail = () => {
    setDetailCallId(null);
    // Limpia el query param sin agregar history entry redundante.
    const next = new URLSearchParams(searchParams);
    next.delete("callId");
    setSearchParams(next, { replace: true });
  };

  // If a call is selected, show the full-page detail view
  if (detailCallId) {
    return (
      <CallDetailPage
        callId={detailCallId}
        onBack={closeCallDetail}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Closers QA</h2>
        <p className="text-sm text-muted-foreground">
          Auditorías de llamadas de venta de closers a modelos.
        </p>
      </div>
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
              // Calls ahora muestra el dashboard de Analytics (la lista
              // se eliminó por ser redundante con QA History).
              <AgencyAnalytics />
            ) : s.key === "models" ? (
              <AgencyModels />
            ) : s.key === "new-qa" ? (
              <AgencyNewQa />
            ) : s.key === "qa-history" ? (
              <AgencyQaHistory onOpenDetail={openCallDetail} />
            ) : s.key === "qa-chat" ? (
              <AgencyQaChat />
            ) : s.key === "notifications" ? (
              <AgencyQaNotifications />
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
  );
};

const ComingSoonSection = ({ section }: { section: RoleSection }) => (
  <div className="space-y-4">
    <div>
      <h2 className="text-xl font-bold tracking-tight">{section.label}</h2>
      <p className="text-sm text-muted-foreground">{section.description}</p>
    </div>
    <Card>
      <CardContent className="space-y-3 p-6">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-amber-500/90">
          <Wrench className="h-3.5 w-3.5" />
          Próximamente
        </div>
        <p className="text-sm text-muted-foreground">{section.comingSoon}</p>
      </CardContent>
    </Card>
  </div>
);

const AgencyQA = () => {
  const [activeRole, setActiveRole] = useState<RoleKey>("closers-qa");
  const activeSection = ROLE_SECTIONS.find((s) => s.key === activeRole);

  return (
    <main className="flex flex-1 overflow-y-auto">
      {/* Left rail vertical estilo Settings — 4 role categorías. */}
      <aside className="w-60 shrink-0 border-r bg-card/40 p-4">
        <div className="sticky top-4 space-y-1">
          <div className="px-2 pb-2">
            <h1 className="text-base font-bold tracking-tight">Agency QA</h1>
            <p className="text-[11px] text-muted-foreground">
              Auditorías por rol.
            </p>
          </div>
          {ROLE_SECTIONS.map((sec) => {
            const Icon = sec.icon;
            const isActive = activeRole === sec.key;
            return (
              <button
                key={sec.key}
                type="button"
                onClick={() => setActiveRole(sec.key)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-primary/15 text-primary font-medium"
                    : "text-foreground hover:bg-muted/60",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{sec.label}</span>
                {!sec.ready && (
                  <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">
                    soon
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </aside>

      {/* Right side — contenido de la sección activa. */}
      <section className="min-w-0 flex-1 overflow-y-auto p-6 lg:p-8">
        {activeRole === "closers-qa" ? (
          <ClosersQaSection />
        ) : activeSection ? (
          <ComingSoonSection section={activeSection} />
        ) : null}
      </section>
    </main>
  );
};

export default AgencyQA;
