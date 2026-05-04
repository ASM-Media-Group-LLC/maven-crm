import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, FilePlus, BellRing, UserCheck, Play, Send, AlertOctagon } from "lucide-react";
import type { CustomContentRequest } from "./useCustomRequests";

interface TrackingDrawerProps {
  request: CustomContentRequest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STEPS = [
  { label: "Pago Confirmado", icon: CreditCard },
  { label: "Solicitud Creada", icon: FilePlus },
  { label: "Notificación Manager", icon: BellRing },
  { label: "Notificación Creadora", icon: UserCheck },
  { label: "En Progreso", icon: Play },
  { label: "Contenido Enviado", icon: Send },
];

function getCompletedSteps(status: string) {
  switch (status) {
    case "completado": return 6;
    case "en_progreso": return 5;
    case "pendiente": return 2;
    case "cancelado": return 2;
    default: return 0;
  }
}

const TrackingDrawer = ({ request, open, onOpenChange }: TrackingDrawerProps) => {
  const { toast } = useToast();

  if (!request) return null;

  const completed = getCompletedSteps(request.status);
  const isOverdue =
    request.status !== "completado" &&
    !!request.due_date &&
    new Date(request.due_date) < new Date();

  const handlePush = (target: string) => {
    toast({ title: "Push enviado", description: `Notificación enviada a ${target}` });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[380px] sm:max-w-[420px] bg-card flex flex-col">
        <SheetHeader>
          <SheetTitle className="text-base">{request.title}</SheetTitle>
          <p className="text-sm text-muted-foreground">
            {request.creators?.artistic_name || request.creators?.name || "—"}
          </p>
        </SheetHeader>

        {/* Timeline */}
        <div className="flex-1 overflow-auto py-4">
          <ol className="relative ml-4 space-y-0">
            {STEPS.map((step, i) => {
              const stepNum = i + 1;
              const isDone = stepNum <= completed;
              const isLast = stepNum === 6;
              const showOverdue = isLast && isOverdue && !isDone;

              let circleClass = "border-muted-foreground/30 text-muted-foreground";
              if (isDone) circleClass = "border-green-500/40 bg-green-500/20 text-green-400";
              if (showOverdue) circleClass = "border-red-500/40 bg-red-500/20 text-red-400";

              const Icon = showOverdue ? AlertOctagon : step.icon;

              return (
                <li key={stepNum} className="relative pl-8 pb-6 last:pb-0">
                  {/* connector line */}
                  {stepNum < 6 && (
                    <span
                      className={`absolute left-[11px] top-7 h-full w-px ${
                        isDone ? "bg-green-500/40" : "bg-muted-foreground/20"
                      }`}
                    />
                  )}
                  {/* circle */}
                  <span
                    className={`absolute left-0 top-0.5 flex h-6 w-6 items-center justify-center rounded-full border ${circleClass}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <p className={`text-sm font-medium ${showOverdue ? "text-red-400" : isDone ? "text-foreground" : "text-muted-foreground"}`}>
                    {step.label}
                  </p>
                  {showOverdue && (
                    <p className="text-xs font-semibold text-red-400 mt-0.5">TIEMPO LÍMITE EXCEDIDO</p>
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        {/* Push buttons */}
        <div className="space-y-2 pt-2 border-t">
          <Button className="w-full" onClick={() => handlePush("Manager")}>
            Push a Manager
          </Button>
          <Button className="w-full" onClick={() => handlePush("Chatter")}>
            Push a Chatter
          </Button>
          <Button className="w-full" onClick={() => handlePush("Creadora")}>
            Push a Creadora
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default TrackingDrawer;
