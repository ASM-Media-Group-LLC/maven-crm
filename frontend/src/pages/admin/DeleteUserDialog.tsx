import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface DeleteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userName: string;
  onConfirm: () => void;
  isLoading: boolean;
}

const DeleteUserDialog = ({ open, onOpenChange, userName, onConfirm, isLoading }: DeleteUserDialogProps) => (
  <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>¿Eliminar usuario?</AlertDialogTitle>
        <AlertDialogDescription>
          Esta acción eliminará permanentemente al usuario <strong>{userName}</strong> y todos sus datos asociados. Si tiene casilla de correo de Maven, también se elimina y se libera su puesto en Zoho. Esta acción no se puede deshacer.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel />
        <AlertDialogAction onClick={onConfirm} disabled={isLoading} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
          {isLoading ? "Eliminando..." : "Eliminar"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

export default DeleteUserDialog;
