import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDeleteAnnouncement } from "./useAnnouncementsAdmin";
import { useLanguage } from "@/hooks/useLanguage";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  announcementId: string | null;
}

const DeleteAnnouncementDialog = ({ open, onOpenChange, announcementId }: Props) => {
  const { t } = useLanguage();
  const del = useDeleteAnnouncement();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("hrg.ann.deleteTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("hrg.ann.deleteBody")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel />
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              if (announcementId) del.mutate(announcementId, { onSuccess: () => onOpenChange(false) });
            }}
          >
            {t("common.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteAnnouncementDialog;
