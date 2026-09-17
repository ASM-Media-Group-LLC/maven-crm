import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserAvatar } from "@/components/UserAvatar";
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
import { useLanguage } from "@/hooks/useLanguage";

interface Props {
  data: OnboardingCreator[];
  onManage?: (creator: OnboardingCreator) => void;
}

const statusConfig = {
  Completado: { icon: CheckCircle2, className: "bg-success/10 text-success border-success/20" },
  Pendiente: { icon: Clock, className: "bg-muted text-muted-foreground border-border" },
  "En Progreso": { icon: Loader2, className: "bg-primary/10 text-primary border-primary/20" },
};

const OnboardingTable = ({ data, onManage }: Props) => {
  const { t } = useLanguage();
  const { isAdmin } = useUserRole();
  const queryClient = useQueryClient();
  const [deletingItem, setDeletingItem] = useState<OnboardingCreator | null>(null);

  const deleteOnboarding = useMutation({
    mutationFn: async (id: string) => {
      // El onboarding NO es una tabla aparte: cada fila es un `creators` (con status
      // pendiente/onboarding/etc.). La tabla `creator_onboardings` no existe → el delete
      // tiraba "Could not find the table ... in the schema cache". Borramos el creator.
      // (Las deps son CASCADE/SET NULL; las de Promolog son NO ACTION pero una creadora
      // en onboarding no tiene entries porque Promolog solo escanea las 'active'.)
      const { error } = await supabase.from("creators").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      // La lista usa queryKey ["onboarding-creators"] (ver useOnboarding). Invalidar
      // ["onboarding"] no refetcheaba → el registro borrado quedaba hasta refrescar.
      queryClient.invalidateQueries({ queryKey: ["onboarding-creators"] });
      toast.success(t("cr.onbDeleted"));
      setDeletingItem(null);
    },
    onError: (err: any) => {
      toast.error(t("common.errorDeleting"), { description: err.message });
    },
  });

  const isPendingVerification = (item: OnboardingCreator) => item.dbStatus === "pendiente_verificacion";

  return (
    <TooltipProvider>
      <div className="rounded-lg border bg-card overflow-auto max-h-[calc(100vh-420px)]">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              <TableHead>{t("cr.creator")}</TableHead>
              <TableHead>Agencia</TableHead>
              <TableHead>{t("cr.startDate")}</TableHead>
              <TableHead>Progreso</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Docs</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item) => {
              const displayName = item.name?.trim() || "Sin nombre";
              const sc = statusConfig[item.status];
              const StatusIcon = sc.icon;
              const pending = isPendingVerification(item);
              return (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <UserAvatar
                        name={displayName}
                        src={item.profile_photo_url}
                        size="sm"
                        className="h-8 w-8"
                      />
                      <span className="font-medium text-sm">{displayName}</span>
                      {pending && (
                        <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="inline-flex shrink-0">
                              <ShieldAlert className="h-4 w-4 text-warning" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{t("cr.step3DocsPending")}</TooltipContent>
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
                            <ShieldAlert className="h-4 w-4 text-warning" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{t("cr.pendingApproval")}</TooltipContent>
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
                          <TooltipContent>{t("common.delete")}</TooltipContent>
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
            <AlertDialogTitle>{t("cr.onbDeleteQ")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("cr.onbDeleteDescA")}<strong>{deletingItem?.name}</strong>{t("cr.offDeleteDescB")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingItem && deleteOnboarding.mutate(deletingItem.id)}
              disabled={deleteOnboarding.isPending}
            >
              {deleteOnboarding.isPending ? t("cr.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
};

export default OnboardingTable;
