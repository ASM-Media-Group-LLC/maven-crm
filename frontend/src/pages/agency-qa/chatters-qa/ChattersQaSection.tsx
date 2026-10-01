import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { ClipboardCheck, FileText, Clock, Bell, Megaphone, Lock, CalendarClock, ShieldAlert } from "lucide-react";
import ChattersQaScorecard from "./ChattersQaScorecard";
import ChattersQaQualitative from "./ChattersQaQualitative";
import ChatterQaNotifications from "./ChatterQaNotifications";
import ChattersQaMasivos from "./ChattersQaMasivos";
import ChattersQaHubstaff from "./ChattersQaHubstaff";
import QaAttendancePanel from "../QaAttendancePanel";
import QaAnomaliesPanel from "../QaAnomaliesPanel";
import { useQaProcessingWatcher } from "./useChatterQaReports";
import { usePermissions } from "@/hooks/usePermissions";
import { useLanguage } from "@/hooks/useLanguage";

// Chatters QA — antes era un placeholder "soon" en el rail de Agency QA.
// Ahora alberga el sistema de medición de chatters que reemplaza el sheet
// "Medidor de chatters" + el correo de QA del supervisor.
//
//   Scorecard      → la planilla mensual (Slice A, LISTO)
//   QA cualitativo → reporte estilo correo + borrador IA (Slice B, pendiente)
//   Masivos        → análisis de masivos por modelo (vista exploratoria)
//   Hubstaff       → Esfuerzo vs Resultado (horas/actividad × venta) + estado del sync (LISTO)
// (La evidencia 1-a-1 vive en el viewer /conversaciones; no necesita un subtab que solo linkee.)

// Subtabs gateados por rol: cada uno declara su `submodule` en role_permissions ("Agency QA").
// Sin fila → se ve (hereda del permiso de "Chatters QA"); para TAPAR uno, el admin lo destilda
// en Roles (can_access=false). Espejo del patrón de Closers QA (AgencyQA.tsx).
// ⚠️ `submodule` es la LLAVE en role_permissions: no se traduce. Solo `label`.
// (`label: null` = el nombre es igual en los dos idiomas: "Scorecard".)
const CHATTER_QA_SUBS = [
  { key: "scorecard",      label: null,                             icon: ClipboardCheck, submodule: "Chatters: Scorecard" },
  { key: "qa",             label: "agencyQa.tab.qualitative",       icon: FileText,       submodule: "Chatters: QA Cualitativo" },
  { key: "masivos",        label: "agencyQa.tab.massMessages",      icon: Megaphone,      submodule: "Chatters: Masivos" },
  { key: "hubstaff",       label: "agencyQa.tab.productivity",      icon: Clock,          submodule: "Chatters: Hubstaff" },
  { key: "asistencia",     label: "agencyQa.tab.attendance",        icon: CalendarClock,  submodule: "Chatters: Asistencia" },
  { key: "anomalias",      label: "agencyQa.tab.anomalies",         icon: ShieldAlert,    submodule: "Chatters: Anomalías" },
  { key: "notificaciones", label: "agencyQa.tab.notifications",     icon: Bell,           submodule: "Chatters: Notificaciones" },
] as const;

export default function ChattersQaSection() {
  const { t } = useLanguage();
  useQaProcessingWatcher(); // avisa (toast verde/rojo) cuando un borrador IA termina, aunque cambies de subtab
  const { canAccess } = usePermissions();
  const [sp] = useSearchParams();

  const visibleSubs = CHATTER_QA_SUBS.filter((s) => canAccess("Agency QA", s.submodule));

  const [tab, setTab] = useState(() => {
    const pedido = sp.get("tab") ?? "";
    // el ?tab= del URL solo vale si ese subtab está habilitado para el rol; si no, el primero visible.
    if (visibleSubs.some((s) => s.key === pedido)) return pedido;
    return visibleSubs[0]?.key ?? "scorecard";
  });

  if (visibleSubs.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Lock className="h-4 w-4" /> {t("agencyQa.chatters.noAccess")}
        </CardContent>
      </Card>
    );
  }

  // Si el tab activo dejó de estar visible (cambio de permisos en vivo), caer al primero visible.
  const activeTab = visibleSubs.some((s) => s.key === tab) ? tab : visibleSubs[0].key;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Chatters QA</h2>
        <p className="text-sm text-muted-foreground">{t("agencyQa.chatters.subtitle")}</p>
      </div>
      <Tabs value={activeTab} onValueChange={setTab}>
        <TabsList>
          {visibleSubs.map((s) => {
            const Icon = s.icon;
            return (
              <TabsTrigger key={s.key} value={s.key} className="gap-1.5">
                <Icon className="h-3.5 w-3.5" />{s.label ? t(s.label) : "Scorecard"}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {visibleSubs.some((s) => s.key === "scorecard") && (
          <TabsContent value="scorecard" className="mt-4"><ChattersQaScorecard /></TabsContent>
        )}
        {visibleSubs.some((s) => s.key === "qa") && (
          <TabsContent value="qa" className="mt-4"><ChattersQaQualitative /></TabsContent>
        )}
        {visibleSubs.some((s) => s.key === "masivos") && (
          <TabsContent value="masivos" className="mt-4"><ChattersQaMasivos /></TabsContent>
        )}
        {visibleSubs.some((s) => s.key === "hubstaff") && (
          <TabsContent value="hubstaff" className="mt-4"><ChattersQaHubstaff /></TabsContent>
        )}
        {visibleSubs.some((s) => s.key === "asistencia") && (
          <TabsContent value="asistencia" className="mt-4"><QaAttendancePanel role="Chatter" /></TabsContent>
        )}
        {visibleSubs.some((s) => s.key === "anomalias") && (
          <TabsContent value="anomalias" className="mt-4"><QaAnomaliesPanel role="Chatter" /></TabsContent>
        )}
        {visibleSubs.some((s) => s.key === "notificaciones") && (
          <TabsContent value="notificaciones" className="mt-4"><ChatterQaNotifications /></TabsContent>
        )}
      </Tabs>
    </div>
  );
}
