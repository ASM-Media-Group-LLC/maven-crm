import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { LeadGenEntry } from "./useLeadGen";
import { useLanguage } from "@/hooks/useLanguage";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: LeadGenEntry | null;
}

const DeleteLeadDialog = ({ open, onOpenChange, lead }: Props) => {
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDeleting, setIsDeleting] = useState(false);

  if (!lead) return null;

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from("leadgen_entries")
        .delete()
        .eq("id", lead.id);
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["leadgen"] });
      queryClient.invalidateQueries({ queryKey: ["leadgen-by-range"] });
      queryClient.invalidateQueries({ queryKey: ["leadgen-summary"] });
      toast({ title: t("leadgen.delete.deleted", { handle: lead.model_handle }) });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: t("common.errorDeleting"), description: err.message, variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <AlertDialogTitle>{t("leadgen.delete.title")}</AlertDialogTitle>
          </div>
          <AlertDialogDescription>
            {t("leadgen.delete.descBefore")} <strong>@{lead.model_handle}</strong>{t("leadgen.delete.descAfter")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting} />
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? t("leadgen.delete.deleting") : t("common.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteLeadDialog;
