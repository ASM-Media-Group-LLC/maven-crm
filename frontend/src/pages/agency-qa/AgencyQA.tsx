import { useEffect, useState } from "react";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom";
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
  Clock,
  CalendarClock,
  ShieldAlert,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import AgencyModels from "./AgencyModels";
import AgencyAnalytics from "./AgencyAnalytics";
import AgencyNewQa from "./AgencyNewQa";
import AgencyQaChat from "./AgencyQaChat";
import AgencyQaHistory from "./AgencyQaHistory";
import AgencyQaNotifications from "./AgencyQaNotifications";
import CallDetailPage from "./CallDetailPage";
import ChattersQaSection from "./chatters-qa/ChattersQaSection";
import AgencyCloserHubstaff from "./AgencyCloserHubstaff";
import QaAttendancePanel from "./QaAttendancePanel";
import QaAnomaliesPanel from "./QaAnomaliesPanel";
import QaEffortPanel from "./QaEffortPanel";
import AgencyLlgHubstaff from "./AgencyLlgHubstaff";
import RoleHubstaffSection from "./RoleHubstaffSection";

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
  | "hubstaff"
  | "asistencia"
  | "anomalias"
  | "new-qa"
  | "qa-history"
  | "qa-chat"
  | "models"
  | "analytics"
  | "notifications";

// ⚠️ `submodule` es la LLAVE en role_permissions (canAccess): no se traduce.
// `label` es la clave del diccionario; null = el nombre es igual en los dos idiomas
// y va en `fixed` ("Dashboard", "QA History", "QA Chat").
interface ClosersQaSub {
  key: ClosersQaKey;
  label: TranslationKey | null;
  fixed?: string;
  submodule: string;
  icon: React.ComponentType<{ className?: string }>;
}

const CLOSERS_QA_SUBS: ClosersQaSub[] = [
  // Dashboard = analytics agregadas. La lista de llamadas era redundante
  // con QA History, así que la fusionamos: este tab ahora muestra el
  // leaderboard / distribución / métricas, y el listado vive solo en
  // QA History.
  { key: "calls", label: null, fixed: "Dashboard", submodule: "Calls", icon: BarChart3 },
  { key: "hubstaff", label: "agencyQa.tab.productivity", submodule: "Closers: Hubstaff", icon: Clock },
  { key: "asistencia", label: "agencyQa.tab.attendance", submodule: "Closers: Asistencia", icon: CalendarClock },
  { key: "anomalias", label: "agencyQa.tab.anomalies", submodule: "Closers: Anomalías", icon: ShieldAlert },
  { key: "new-qa", label: "agencyQa.tab.newQa", submodule: "New QA", icon: Plus },
  { key: "qa-history", label: null, fixed: "QA History", submodule: "QA History", icon: History },
  { key: "qa-chat", label: null, fixed: "QA Chat", submodule: "QA Chat", icon: MessageSquare },
  { key: "models", label: "agencyQa.models", submodule: "Models", icon: Users },
  { key: "notifications", label: "agencyQa.tab.notifications", submodule: "Notifications", icon: Bell },
];

type RoleKey = "closers-qa" | "chatters-qa" | "managers-qa" | "llgs-qa";

interface RoleSection {
  key: RoleKey;
  label: string;
  description: TranslationKey;
  icon: React.ComponentType<{ className?: string }>;
  ready: boolean;
  comingSoon: string;
}

const ROLE_SECTIONS: RoleSection[] = [
  {
    key: "closers-qa",
    label: "Closers QA",
    description: "agencyQa.role.closers",
    icon: Headphones,
    ready: true,
    comingSoon: "",
  },
  {
    key: "chatters-qa",
    label: "Chatters QA",
    description: "agencyQa.role.chatters",
    icon: MessageCircle,
    ready: true,
    comingSoon: "",
  },
  {
    key: "managers-qa",
    label: "Managers QA",
    description: "agencyQa.role.managers",
    icon: Briefcase,
    ready: true,
    comingSoon: "",
  },
  {
    key: "llgs-qa",
    label: "LLG's QA",
    description: "agencyQa.role.llg",
    icon: Megaphone,
    ready: true,
    comingSoon: "",
  },
];

const ClosersQaSection = () => {
  const { t } = useLanguage();
  const { canAccess } = usePermissions();
  const visibleSubs = CLOSERS_QA_SUBS.filter((s) =>
    canAccess("Agency QA", s.submodule),
  );
  const [active, setActive] = useState<ClosersQaKey>(
    (visibleSubs[0]?.key as ClosersQaKey) ?? "calls",
  );
  // Detail embebido: cuando hay callId, se muestra CallDetailPage
  // ADENTRO del tab qa-history en vez de reemplazar todo Closers QA.
  // Así las tabs y el header siguen visibles y la sensación es de
  // "abrir el detalle en el mismo espacio" (con back button).
  // El deeplink desde el email (`?callId=<uuid>`) lo abre automáticamente.
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
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
    // Forzamos el tab qa-history porque ahí vive el detail embebido.
    setActive("qa-history");
  };
  const closeCallDetail = () => {
    // Si el user llegó aquí navegando desde otra pantalla del CRM
    // (ej. popup de Panel de Control), location.key !== 'default' y
    // tenemos history para volver. navigate(-1) lo lleva al popup
    // exactamente donde estaba (el openMetric del panel vive en URL).
    //
    // Si entró directo por deeplink (?callId=...), no hay history —
    // caemos al comportamiento de limpiar el param y mostrar la lista.
    if (location.key !== "default") {
      navigate(-1);
      return;
    }
    setDetailCallId(null);
    const next = new URLSearchParams(searchParams);
    next.delete("callId");
    setSearchParams(next, { replace: true });
  };

  // Si entran con un deeplink ?callId=, asegurar que el tab activo sea
  // qa-history para que el detail embebido se vea.
  useEffect(() => {
    if (detailCallId && active !== "qa-history") {
      setActive("qa-history");
    }
  }, [detailCallId, active]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Closers QA</h2>
        <p className="text-sm text-muted-foreground">{t("agencyQa.closers.subtitle")}</p>
      </div>
      <Tabs value={active} onValueChange={(v) => setActive(v as ClosersQaKey)}>
        <TabsList>
          {visibleSubs.map((s) => {
            const Icon = s.icon;
            return (
              <TabsTrigger key={s.key} value={s.key} className="gap-1.5">
                <Icon className="h-3.5 w-3.5" />
                {s.label ? t(s.label) : s.fixed}
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
            ) : s.key === "hubstaff" ? (
              <AgencyCloserHubstaff />
            ) : s.key === "asistencia" ? (
              <QaAttendancePanel role="closer" />
            ) : s.key === "anomalias" ? (
              <QaAnomaliesPanel role="closer" />
            ) : s.key === "models" ? (
              <AgencyModels />
            ) : s.key === "new-qa" ? (
              <AgencyNewQa />
            ) : s.key === "qa-history" ? (
              detailCallId ? (
                <CallDetailPage callId={detailCallId} onBack={closeCallDetail} />
              ) : (
                <AgencyQaHistory onOpenDetail={openCallDetail} />
              )
            ) : s.key === "qa-chat" ? (
              <AgencyQaChat />
            ) : s.key === "notifications" ? (
              <AgencyQaNotifications />
            ) : null}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

const ComingSoonSection = ({ section }: { section: RoleSection }) => {
  const { t } = useLanguage();
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight">{section.label}</h2>
        <p className="text-sm text-muted-foreground">{t(section.description)}</p>
      </div>
      <Card>
        <CardContent className="space-y-3 p-6">
          <div className="flex items-center gap-2 text-xs font-semibold text-warning/90">
            <Wrench className="h-3.5 w-3.5" />
            {t("common.comingSoon")}
          </div>
          <p className="text-sm text-muted-foreground">{section.comingSoon}</p>
        </CardContent>
      </Card>
    </div>
  );
};

// Mapeo de RoleKey → label del submódulo de Agency QA en el sistema
// de permisos. El admin puede prender/apagar cada uno desde Settings →
// Usuarios → Roles → permisos → módulo "Agency QA".
const ROLE_TO_SUBMODULE: Record<RoleKey, string> = {
  "closers-qa": "Closers QA",
  "chatters-qa": "Chatters QA",
  "managers-qa": "Managers QA",
  "llgs-qa": "LLG QA",
};

const AgencyQA = () => {
  const { t } = useLanguage();
  const { canAccess } = usePermissions();
  // Filtramos las 4 categorías por permiso. Si un rol no tiene acceso
  // a "Closers QA" (submódulo), no aparece su tab en el rail izquierdo.
  const visibleRoleSections = ROLE_SECTIONS.filter((sec) =>
    canAccess("Agency QA", ROLE_TO_SUBMODULE[sec.key]),
  );
  // Default al primer rol al que tenga acceso. Si no tiene acceso a
  // ninguno, mostramos un mensaje en blanco; eso indica que el admin
  // debería habilitarle al menos uno desde Settings.
  // Deep-link: el CTA del email del QA de chatters abre /agency-qa?role=chatters-qa para
  // caer en la sección correcta (antes caía en Closers QA, la primera del rail).
  const [agencySp] = useSearchParams();
  const [activeRole, setActiveRole] = useState<RoleKey>(() => {
    const r = agencySp.get("role") as RoleKey | null;
    if (r && ROLE_SECTIONS.some((s) => s.key === r)) return r;
    return (visibleRoleSections[0]?.key ?? "closers-qa") as RoleKey;
  });
  const activeSection = ROLE_SECTIONS.find((s) => s.key === activeRole);
  const activeIsAllowed = visibleRoleSections.some((s) => s.key === activeRole);

  return (
    <main className="flex flex-1 overflow-y-auto">
      {/* Left rail vertical estilo Settings — 4 categorías de QA por rol.
          Mismo lenguaje visual que la sidebar principal: sidebar-glass-hover
          en reposo, sidebar-glass-active cuando el rol está seleccionado
          (accent bar + bg gradient + glow). */}
      <aside className="sub-rail w-60 shrink-0 border-r bg-card/40 p-4">
        <div className="sticky top-4 space-y-1">
          {/* Header del rail — mismo tratamiento que el resto de los
              sub-rails (text-[11px], tracking-widest, foreground/70). */}
          <div className="px-2 pb-3">
            <h1 className="text-xs font-semibold text-foreground/70">
              Company QA
            </h1>
            <p className="mt-1 text-[11px] text-muted-foreground/80">
              {t("agencyQa.rail.subtitle")}
            </p>
          </div>
          {visibleRoleSections.length === 0 && (
            <p className="px-2 py-3 text-[11px] italic text-muted-foreground">
              {t("agencyQa.rail.noAccess")}
            </p>
          )}
          {visibleRoleSections.map((sec) => {
            const Icon = sec.icon;
            const isActive = activeRole === sec.key;
            return (
              <button
                key={sec.key}
                type="button"
                onClick={() => setActiveRole(sec.key)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-sm sidebar-glass-hover",
                  isActive && "sidebar-glass-active font-medium",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{sec.label}</span>
                {!sec.ready && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    Soon
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </aside>

      {/* Right side — contenido de la sección activa. */}
      <section className="min-w-0 flex-1 overflow-y-auto p-6 lg:p-8">
        {!activeIsAllowed ? null : activeRole === "closers-qa" ? (
          <ClosersQaSection />
        ) : activeRole === "chatters-qa" ? (
          <ChattersQaSection />
        ) : activeRole === "managers-qa" ? (
          <RoleHubstaffSection
            role="manager"
            title="Managers QA"
            description={t("agencyQa.role.managers")}
            productividad={<QaEffortPanel role="manager" />}
          />
        ) : activeRole === "llgs-qa" ? (
          <RoleHubstaffSection
            role="LLG"
            title="LLG's QA"
            description={t("agencyQa.role.llg")}
            productividad={<AgencyLlgHubstaff />}
          />
        ) : activeSection ? (
          <ComingSoonSection section={activeSection} />
        ) : null}
      </section>
    </main>
  );
};

export default AgencyQA;
