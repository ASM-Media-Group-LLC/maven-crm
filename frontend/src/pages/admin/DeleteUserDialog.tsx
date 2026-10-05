import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useLanguage } from "@/hooks/useLanguage";
import { ConFormato } from "./ConFormato";

// Lo que dura la papelera (DIAS_DE_PAPELERA de _shared/buzon-por-borrar.ts en las
// edges). La pestaña Eliminadas lo lee del servidor; este aviso sale antes.
const DIAS_DE_PAPELERA = 30;

interface DeleteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userName: string;
  onConfirm: () => void;
  isLoading: boolean;
}

const DeleteUserDialog = ({ open, onOpenChange, userName, onConfirm, isLoading }: DeleteUserDialogProps) => {
  const { t } = useLanguage();
  return (
  <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{t("admin.deleteUser.title")}</AlertDialogTitle>
        <AlertDialogDescription>
          <ConFormato texto={t("admin.deleteUser.body", { name: userName, days: DIAS_DE_PAPELERA })} />
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel />
        <AlertDialogAction onClick={onConfirm} disabled={isLoading} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
          {isLoading ? t("admin.deleting") : t("common.delete")}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
  );
};

export default DeleteUserDialog;
