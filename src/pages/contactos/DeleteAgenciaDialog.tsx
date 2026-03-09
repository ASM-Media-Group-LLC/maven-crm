import { AlertTriangle } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Agencia } from "./agenciasUtils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agencia: Agencia | null;
}

const DeleteAgenciaDialog = ({ open, onOpenChange, agencia }: Props) => {
  const { toast } = useToast();
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      if (!agencia) return;
      const { error } = await supabase.from("agencies").delete().eq("id", agencia.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agencies"] });
      toast({ title: `"${agencia?.nombre}" eliminada` });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Error al eliminar", description: err.message, variant: "destructive" });
    },
  });

  if (!agencia) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <AlertDialogTitle>Eliminar agencia</AlertDialogTitle>
          </div>
          <AlertDialogDescription>
            Esta acción eliminará permanentemente a <strong>{agencia.nombre}</strong>. Esta acción no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => mutation.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Eliminar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteAgenciaDialog;
