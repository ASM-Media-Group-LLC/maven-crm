import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { ClipboardCheck, FileText, Clock, Wrench, Bell, Megaphone, Lock } from "lucide-react";
import ChattersQaScorecard from "./ChattersQaScorecard";
import ChattersQaQualitative from "./ChattersQaQualitative";
import ChatterQaNotifications from "./ChatterQaNotifications";
import ChattersQaMasivos from "./ChattersQaMasivos";
import { useQaProcessingWatcher } from "./useChatterQaReports";
import { usePermissions } from "@/hooks/usePermissions";

// Chatters QA — antes era un placeholder "soon" en el rail de Agency QA.
// Ahora alberga el sistema de medición de chatters que reemplaza el sheet
// "Medidor de chatters" + el correo de QA del supervisor.
//
//   Scorecard      → la planilla mensual (Slice A, LISTO)
//   QA cualitativo → reporte estilo correo + borrador IA (Slice B, pendiente)
//   Masivos        → análisis de masivos por modelo (vista exploratoria)
//   Hubstaff       → puntualidad/productividad automática (Slice C, pendiente)
// (La evidencia 1-a-1 vive en el viewer /conversaciones; no necesita un subtab que solo linkee.)

const ComingSoon = ({ title, desc, slice }: { title: string; desc: string; slice: string }) => (
  <Card>
    <CardContent className="space-y-3 p-6">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-amber-500/90">
        <Wrench className="h-3.5 w-3.5" /> Próximamente · {slice}
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{desc}</p>
    </CardContent>
  </Card>
);

// Subtabs gateados por rol: cada uno declara su `submodule` en role_permissions ("Agency QA").
// Sin fila → se ve (hereda del permiso de "Chatters QA"); para TAPAR uno, el admin lo destilda
// en Roles (can_access=false). Espejo del patrón de Closers QA (AgencyQA.tsx).
const CHATTER_QA_SUBS = [
  { key: "scorecard",      label: "Scorecard",      icon: ClipboardCheck, submodule: "Chatters: Scorecard" },
  { key: "qa",             label: "QA cualitativo", icon: FileText,       submodule: "Chatters: QA Cualitativo" },
  { key: "masivos",        label: "Masivos",        icon: Megaphone,      submodule: "Chatters: Masivos" },
  { key: "hubstaff",       label: "Hubstaff",       icon: Clock,          submodule: "Chatters: Hubstaff" },
  { key: "notificaciones", label: "Notificaciones", icon: Bell,           submodule: "Chatters: Notificaciones" },
] as const;

export default function ChattersQaSection() {
  useQaProcessingWatcher(); // avisa (toast verde/rojo) cuando un borrador IA termina, aunque cambies de subtab
  const { canAccess } = usePermissions();
  const [sp] = useSearchParams();

  const visibleSubs = CHATTER_QA_SUBS.filter((s) => canAccess("Agency QA", s.submodule));

  const [tab, setTab] = useState(() => {
    const t = sp.get("tab") ?? "";
    // el ?tab= del URL solo vale si ese subtab está habilitado para el rol; si no, el primero visible.
    if (visibleSubs.some((s) => s.key === t)) return t;
    return visibleSubs[0]?.key ?? "scorecard";
  });

  if (visibleSubs.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Lock className="h-4 w-4" /> No tenés acceso a ningún subtab de Chatters QA. Pedile a un admin que te habilite alguno en Roles.
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
        <p className="text-sm text-muted-foreground">
          Medición y auditoría de chatters — reemplaza el sheet "Medidor de chatters".
        </p>
      </div>
      <Tabs value={activeTab} onValueChange={setTab}>
        <TabsList>
          {visibleSubs.map((s) => {
            const Icon = s.icon;
            return (
              <TabsTrigger key={s.key} value={s.key} className="gap-1.5">
                <Icon className="h-3.5 w-3.5" />{s.label}
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
          <TabsContent value="hubstaff" className="mt-4">
            <ComingSoon slice="Fase 2" title="Hubstaff"
              desc="Conexión a la API de Hubstaff para auto-completar 2 de los 8 criterios del scorecard: Puntualidad y Cumplimiento + Productividad Hubstaff, por chatter y por mes." />
          </TabsContent>
        )}
        {visibleSubs.some((s) => s.key === "notificaciones") && (
          <TabsContent value="notificaciones" className="mt-4"><ChatterQaNotifications /></TabsContent>
        )}
      </Tabs>
    </div>
  );
}
