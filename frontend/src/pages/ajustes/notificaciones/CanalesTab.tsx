import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, Mail, Smartphone, FileText, CheckCircle2 } from "lucide-react";
import NotificacionesEnEsteDispositivo from "./NotificacionesEnEsteDispositivo";

const CHANNELS = [
  { key: "in_app", label: "In-app", desc: "Notificaciones dentro de la plataforma", icon: Bell, active: true },
  { key: "email", label: "Email", desc: "Recibir notificaciones por correo electrónico", icon: Mail, active: false },
  { key: "push", label: "Push", desc: "Notificaciones push para app móvil", icon: Smartphone, active: false },
  { key: "digest", label: "Resumen periódico", desc: "Recibir un digest con el resumen de actividad", icon: FileText, active: false, linkTab: "resumenes" },
] as const;

const CanalesTab = () => {
  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Canales de Notificación</CardTitle>
        <CardDescription className="text-xs">
          Elige cómo quieres recibir tus notificaciones. Cada evento podrá activarse o desactivarse por canal.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {CHANNELS.map(({ key, label, desc, icon: Icon, active }) => key === "push" ? (
          // Web Push de verdad, por dispositivo (ver el componente).
          <NotificacionesEnEsteDispositivo key="push" />
        ) : (
          <div
            key={key}
            className="flex items-center justify-between rounded-md px-3 py-3 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-start gap-3">
              <Icon className="h-4 w-4 mt-0.5 text-muted-foreground" />
              <div>
                <span className="text-sm font-medium">{label}</span>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </div>
            </div>
            {active ? (
              <Badge variant="default" className="text-[10px] gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Activo
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                Próximamente
              </Badge>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default CanalesTab;
