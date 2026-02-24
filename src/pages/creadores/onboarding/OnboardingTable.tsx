import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, Clock, Loader2, Settings2, ShieldAlert } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { OnboardingCreator } from "./useOnboarding";

interface Props {
  data: OnboardingCreator[];
  onManage?: (creator: OnboardingCreator) => void;
}

const statusConfig = {
  Completado: { icon: CheckCircle2, className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
  Pendiente: { icon: Clock, className: "bg-muted text-muted-foreground border-border" },
  "En Progreso": { icon: Loader2, className: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
};

const OnboardingTable = ({ data, onManage }: Props) => {
  const isPendingVerification = (item: OnboardingCreator) => item.dbStatus === "pendiente_verificacion";

  return (
    <TooltipProvider>
      <div className="rounded-lg border bg-card overflow-auto max-h-[calc(100vh-420px)]">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              <TableHead>Creadora</TableHead>
              <TableHead>Agencia</TableHead>
              <TableHead>Fecha Inicio</TableHead>
              <TableHead>Progreso</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Docs</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item) => {
              const displayName = item.name?.trim() || "Sin nombre";
              const initials = displayName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
              const sc = statusConfig[item.status];
              const StatusIcon = sc.icon;
              const pending = isPendingVerification(item);
              return (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={item.profile_photo_url || undefined} />
                        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-sm">{displayName}</span>
                      {pending && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <ShieldAlert className="h-4 w-4 text-orange-500 shrink-0" />
                          </TooltipTrigger>
                          <TooltipContent>Documentos del Paso 3 pendientes de aprobación</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{item.company}</TableCell>
                  <TableCell className="text-sm">
                    {item.startDate ? format(new Date(item.startDate), "dd MMM yyyy", { locale: es }) : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 min-w-[120px]">
                      <Progress value={item.progress} className="h-2 flex-1" />
                      <span className="text-xs font-medium text-muted-foreground w-8 text-right">{item.progress}%</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`${sc.className} ${pending ? "badge-pending-verification" : ""}`}>
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {pending ? "En Revisión" : item.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {pending && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <ShieldAlert className="h-4 w-4 text-orange-500" />
                        </TooltipTrigger>
                        <TooltipContent>Pendiente de aprobación</TooltipContent>
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="secondary" size="icon" className="h-8 w-8" onClick={() => onManage?.(item)}>
                      <Settings2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {data.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No hay creadores en onboarding
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
};

export default OnboardingTable;
