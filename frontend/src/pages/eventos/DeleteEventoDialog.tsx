import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useDeleteEvento, type EventRow } from "./useEventos";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: EventRow;
}

const DeleteEventoDialog = ({ open, onOpenChange, event }: Props) => {
  const { toast } = useToast();
  const deleteEvento = useDeleteEvento();

  const handleDelete = () => {
    deleteEvento.mutate(event.id, {
      onSuccess: () => {
        toast({ title: `"${event.name}" eliminado` });
        onOpenChange(false);
      },
      onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminar evento</AlertDialogTitle>
          <AlertDialogDescription>
            ¿Estás seguro de que deseas eliminar "{event.name}"? Esta acción no se puede deshacer.
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

export default DeleteEventoDialog;
