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
import { useLanguage } from "@/hooks/useLanguage";

interface DeleteChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatName: string;
  isGroup: boolean;
  onConfirm: () => void;
  isLoading?: boolean;
}

export default function DeleteChatDialog({
  open,
  onOpenChange,
  chatName,
  isGroup,
  onConfirm,
  isLoading,
}: DeleteChatDialogProps) {
  const { t } = useLanguage();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isGroup ? t("messenger.delete.tituloGrupo") : t("messenger.delete.tituloChat")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("messenger.delete.descAntes")}{" "}
            <span className="font-semibold">"{chatName}"</span>{t("messenger.delete.descDespues")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel />
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isLoading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isLoading ? t("messenger.delete.eliminando") : t("common.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
