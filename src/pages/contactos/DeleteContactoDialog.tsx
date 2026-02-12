import { AlertTriangle } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import type { Contacto } from "./ContactosContent";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacto: Contacto | null;
}

const DeleteContactoDialog = ({ open, onOpenChange, contacto }: Props) => {
  const { toast } = useToast();

  if (!contacto) return null;

  const handleDelete = () => {
    toast({ title: `"${contacto.nombre}" eliminado` });
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <AlertDialogTitle>Eliminar contacto</AlertDialogTitle>
          </div>
          <AlertDialogDescription>
            Esta acción eliminará permanentemente a <strong>{contacto.nombre}</strong> y todas sus interacciones asociadas. Esta acción no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Eliminar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteContactoDialog;
