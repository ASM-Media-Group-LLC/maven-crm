import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDeleteAnnouncement } from "./useAnnouncementsAdmin";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  announcementId: string | null;
}

const DeleteAnnouncementDialog = ({ open, onOpenChange, announcementId }: Props) => {
  const del = useDeleteAnnouncement();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar anuncio?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta acción no se puede deshacer. El anuncio será eliminado permanentemente.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              if (announcementId) del.mutate(announcementId, { onSuccess: () => onOpenChange(false) });
            }}
          >
            Eliminar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteAnnouncementDialog;
