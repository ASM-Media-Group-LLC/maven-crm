import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, Clock, Loader2, Settings2, ShieldAlert, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  const { isAdmin } = useUserRole();
  const queryClient = useQueryClient();
  const [deletingItem, setDeletingItem] = useState<OnboardingCreator | null>(null);

  const deleteOnboarding = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("creator_onboardings" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding"] });
      toast.success("Registro de onboarding eliminado");
      setDeletingItem(null);
    },
    onError: (err: any) => {
      toast.error("Error al eliminar", { description: err.message });
    },
  });

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
                            <span className="inline-flex shrink-0">
                              <ShieldAlert className="h-4 w-4 text-orange-500" />
                            </span>
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
                          <span className="inline-flex">
                            <ShieldAlert className="h-4 w-4 text-orange-500" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Pendiente de aprobación</TooltipContent>
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="secondary" size="icon" className="h-8 w-8" onClick={() => onManage?.(item)}>
                        <Settings2 className="h-4 w-4" />
                      </Button>
                      {isAdmin && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => setDeletingItem(item)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Eliminar</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
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

      <AlertDialog open={!!deletingItem} onOpenChange={(open) => { if (!open) setDeletingItem(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar registro de onboarding?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el registro de onboarding de <strong>{deletingItem?.name}</strong>. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingItem && deleteOnboarding.mutate(deletingItem.id)}
              disabled={deleteOnboarding.isPending}
            >
              {deleteOnboarding.isPending ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
};

export default OnboardingTable;
