import { useState, type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, CalendarClock, ShieldAlert } from "lucide-react";
import QaAttendancePanel from "./QaAttendancePanel";
import QaAnomaliesPanel from "./QaAnomaliesPanel";
import type { QaRole } from "./useQaHubstaff";

// Sección QA estandarizada para roles cuya QA es SOLO la parte de Hubstaff (managers, LLG):
// las mismas 3 subpestañas que chatters/closers — Productividad · Asistencia · Anomalías.
// La Productividad la inyecta cada rol (manager=esfuerzo, LLG=leads); Asistencia y Anomalías
// son los componentes genéricos compartidos.
export default function RoleHubstaffSection({
  role, title, description, productividad,
}: {
  role: QaRole;
  title: string;
  description: string;
  productividad: ReactNode;
}) {
  const [tab, setTab] = useState("productividad");
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="productividad" className="gap-1.5"><Clock className="h-3.5 w-3.5" />Productividad</TabsTrigger>
          <TabsTrigger value="asistencia" className="gap-1.5"><CalendarClock className="h-3.5 w-3.5" />Asistencia</TabsTrigger>
          <TabsTrigger value="anomalias" className="gap-1.5"><ShieldAlert className="h-3.5 w-3.5" />Anomalías</TabsTrigger>
        </TabsList>
        <TabsContent value="productividad" className="mt-4">{productividad}</TabsContent>
        <TabsContent value="asistencia" className="mt-4"><QaAttendancePanel role={role} /></TabsContent>
        <TabsContent value="anomalias" className="mt-4"><QaAnomaliesPanel role={role} /></TabsContent>
      </Tabs>
    </div>
  );
}
