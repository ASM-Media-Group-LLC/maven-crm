import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardCheck, MessageSquare, FileText, Clock, Wrench, ExternalLink, Bell, Megaphone } from "lucide-react";
import ChattersQaScorecard from "./ChattersQaScorecard";
import ChattersQaQualitative from "./ChattersQaQualitative";
import ChatterQaNotifications from "./ChatterQaNotifications";
import ChattersQaMasivos from "./ChattersQaMasivos";

// Chatters QA — antes era un placeholder "soon" en el rail de Agency QA.
// Ahora alberga el sistema de medición de chatters que reemplaza el sheet
// "Medidor de chatters" + el correo de QA del supervisor.
//
//   Scorecard      → la planilla mensual (Slice A, LISTO)
//   Mensajes Pro   → viewer de conversaciones = evidencia (ya existe en /conversaciones)
//   QA cualitativo → reporte estilo correo + borrador IA (Slice B, pendiente)
//   Hubstaff       → puntualidad/productividad automática (Slice C, pendiente)

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

export default function ChattersQaSection() {
  const [sp] = useSearchParams();
  const [tab, setTab] = useState(() => {
    const t = sp.get("tab") ?? "";
    return ["scorecard", "mensajes-pro", "qa", "masivos", "hubstaff", "notificaciones"].includes(t) ? t : "scorecard";
  });
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Chatters QA</h2>
        <p className="text-sm text-muted-foreground">
          Medición y auditoría de chatters — reemplaza el sheet "Medidor de chatters".
        </p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="scorecard" className="gap-1.5"><ClipboardCheck className="h-3.5 w-3.5" />Scorecard</TabsTrigger>
          <TabsTrigger value="mensajes-pro" className="gap-1.5"><MessageSquare className="h-3.5 w-3.5" />Mensajes Pro</TabsTrigger>
          <TabsTrigger value="qa" className="gap-1.5"><FileText className="h-3.5 w-3.5" />QA cualitativo</TabsTrigger>
          <TabsTrigger value="masivos" className="gap-1.5"><Megaphone className="h-3.5 w-3.5" />Masivos</TabsTrigger>
          <TabsTrigger value="hubstaff" className="gap-1.5"><Clock className="h-3.5 w-3.5" />Hubstaff</TabsTrigger>
          <TabsTrigger value="notificaciones" className="gap-1.5"><Bell className="h-3.5 w-3.5" />Notificaciones</TabsTrigger>
        </TabsList>

        <TabsContent value="scorecard" className="mt-4">
          <ChattersQaScorecard />
        </TabsContent>

        <TabsContent value="mensajes-pro" className="mt-4">
          <Card><CardContent className="space-y-3 p-6">
            <h3 className="text-lg font-semibold">Mensajes Pro</h3>
            <p className="text-sm text-muted-foreground">
              Las conversaciones chatter↔fan de Messages Pro (BLU) son la evidencia para puntuar el scorecard y redactar el QA cualitativo.
            </p>
            <Button asChild className="gap-1.5"><Link to="/conversaciones">Abrir Mensajes Pro <ExternalLink className="h-4 w-4" /></Link></Button>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="qa" className="mt-4">
          <ChattersQaQualitative />
        </TabsContent>

        <TabsContent value="masivos" className="mt-4">
          <ChattersQaMasivos />
        </TabsContent>

        <TabsContent value="hubstaff" className="mt-4">
          <ComingSoon slice="Fase 2" title="Hubstaff"
            desc="Conexión a la API de Hubstaff para auto-completar 2 de los 8 criterios del scorecard: Puntualidad y Cumplimiento + Productividad Hubstaff, por chatter y por mes." />
        </TabsContent>

        <TabsContent value="notificaciones" className="mt-4">
          <ChatterQaNotifications />
        </TabsContent>
      </Tabs>
    </div>
  );
}
