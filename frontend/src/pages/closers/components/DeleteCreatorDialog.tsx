import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CloserCreator } from "../useCloserCreators";
import { useLanguage } from "@/hooks/useLanguage";

interface Props {
  creator: CloserCreator | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (id: string) => void;
}

const DeleteCreatorDialog = ({ creator, open, onOpenChange, onConfirm }: Props) => {
  const { t } = useLanguage();
  if (!creator) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("closers.creator.deleteTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("closers.creator.deleteA")}<span className="font-semibold">{creator.instagram_handle}</span>{t("closers.creator.deleteB")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel />
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => onConfirm(creator.id)}
          >
            {t("common.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteCreatorDialog;
