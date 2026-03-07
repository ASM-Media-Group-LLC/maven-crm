import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, AlertCircle, Info } from "lucide-react";

const PRIORITY_LEVELS = [
  { key: "high", label: "Crítica", desc: "Errores, vencimientos, acciones urgentes", icon: AlertTriangle, color: "text-destructive" },
  { key: "medium", label: "Importante", desc: "Asignaciones, aprobaciones, cambios relevantes", icon: AlertCircle, color: "text-warning" },
  { key: "low", label: "Informativa", desc: "Actualizaciones generales, recordatorios suaves", icon: Info, color: "text-muted-foreground" },
] as const;

const DELIVERY_OPTIONS = [
  { value: "all", label: "Popup + Banner + Centro" },
  { value: "popup", label: "Solo Popup automático" },
  { value: "banner", label: "Solo Banner en dashboard" },
  { value: "center_only", label: "Solo Notification Center" },
];

const PrioridadTab = () => {
  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Prioridad de Notificaciones</CardTitle>
        <CardDescription className="text-xs">
          Configura cómo se muestran las notificaciones según su nivel de prioridad.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {PRIORITY_LEVELS.map(({ key, label, desc, icon: Icon, color }) => (
          <div
            key={key}
            className="flex items-center justify-between rounded-md border border-border px-4 py-3"
          >
            <div className="flex items-start gap-3">
              <Icon className={`h-4 w-4 mt-0.5 ${color}`} />
              <div>
                <span className="text-sm font-medium">{label}</span>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </div>
            </div>
            <Select defaultValue={key === "high" ? "all" : key === "medium" ? "banner" : "center_only"}>
              <SelectTrigger className="w-[200px] text-xs h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DELIVERY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
        <p className="text-[11px] text-muted-foreground px-1">
          Nota: Los modos Popup y Banner estarán disponibles en futuras versiones. Actualmente todas las notificaciones se entregan al Notification Center.
        </p>
      </CardContent>
    </Card>
  );
};

export default PrioridadTab;
