import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useLanguage } from "@/hooks/useLanguage";
import { ConFormato } from "./ConFormato";

interface DeleteRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roleName: string;
  onConfirm: () => void;
  isLoading: boolean;
}

const DeleteRoleDialog = ({ open, onOpenChange, roleName, onConfirm, isLoading }: DeleteRoleDialogProps) => {
  const { t } = useLanguage();
  return (
  <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{t("admin.deleteRole.title")}</AlertDialogTitle>
        <AlertDialogDescription>
          <ConFormato texto={t("admin.deleteRole.body", { name: roleName })} />
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

export default DeleteRoleDialog;
