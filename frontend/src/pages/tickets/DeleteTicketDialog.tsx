import { AlertTriangle } from "lucide-react";
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
import { type TicketWithCreator, useTickets } from "./useTickets";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: TicketWithCreator;
}

const DeleteTicketDialog = ({ open, onOpenChange, ticket }: Props) => {
  const { t } = useLanguage();
  const { deleteTicket } = useTickets();

  const handleDelete = () => {
    deleteTicket.mutate(ticket.id, {
      onSuccess: () => onOpenChange(false),
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            {t("tickets.delete.title")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("tickets.delete.confirmBefore")} <strong>"{ticket.title}"</strong>?{" "}
            {t("common.cannotBeUndone")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel />
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {t("common.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteTicketDialog;
