import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Clock, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { OnboardingCreator } from "./useOnboarding";

interface Props {
  data: OnboardingCreator[];
}

const statusConfig = {
  Completado: { icon: CheckCircle2, className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
  Pendiente: { icon: Clock, className: "bg-muted text-muted-foreground border-border" },
  "En Progreso": { icon: Loader2, className: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
};

const OnboardingTable = ({ data }: Props) => {
  return (
    <div className="rounded-lg border bg-card overflow-auto max-h-[calc(100vh-420px)]">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow>
            <TableHead>Empleado</TableHead>
            <TableHead>Posición</TableHead>
            <TableHead>Área</TableHead>
            <TableHead>Empresa</TableHead>
            <TableHead>Fecha Inicio</TableHead>
            <TableHead>Manager</TableHead>
            <TableHead>Progreso</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((item) => {
            const initials = item.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
            const sc = statusConfig[item.status];
            const StatusIcon = sc.icon;
            return (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={item.profile_photo_url || undefined} />
                      <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                    </Avatar>
                    <span className="font-medium text-sm">{item.name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-sm">{item.position}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="bg-purple-500/10 text-purple-400 border-purple-500/20">
                    {item.area}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">{item.company}</TableCell>
                <TableCell className="text-sm">
                  {item.startDate ? format(new Date(item.startDate), "dd MMM yyyy", { locale: es }) : "—"}
                </TableCell>
                <TableCell className="text-sm">{item.manager}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 min-w-[120px]">
                    <Progress value={item.progress} className="h-2 flex-1" />
                    <span className="text-xs font-medium text-muted-foreground w-8 text-right">{item.progress}%</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={sc.className}>
                    <StatusIcon className="h-3 w-3 mr-1" />
                    {item.status}
                  </Badge>
                </TableCell>
              </TableRow>
            );
          })}
          {data.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                No hay creadores en onboarding
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default OnboardingTable;
