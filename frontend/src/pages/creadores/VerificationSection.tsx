import { useState } from "react";
import { ShieldCheck, ShieldX, AlertTriangle, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/hooks/useLanguage";

interface Props {
  creatorId: string;
  creatorName: string;
  currentStatus: string;
}

const VerificationSection = ({ creatorId, creatorName, currentStatus }: Props) => {
  const { t } = useLanguage();
  const { role } = useUserRole();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [loading, setLoading] = useState(false);

  const isManagerOrAdmin = role === "admin" || role === "manager";
  if (!isManagerOrAdmin || currentStatus !== "pendiente_verificacion") return null;

  const handleApprove = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from("creators")
        .update({ status: "active" })
        .eq("id", creatorId);
      if (error) throw error;

      // Log history
      if (user) {
        await supabase.from("creator_history").insert({
          creator_id: creatorId,
          user_id: user.id,
          action: "Verificación aprobada",
          old_value: "pendiente_verificacion",
          new_value: "active",
        });
      }

      // La notificación se GUARDA y la leen otras personas: queda en español.
      await supabase.from("notifications").insert({
        type: "verification_approved",
        title: "Verificación aprobada",
        message: `${creatorName} ha sido verificada y activada.`,
        reference_id: creatorId,
        reference_type: "creator",
        module_origin: "creadores",
        priority: "low",
        deep_link_url: `/creadores/${creatorId}`,
        required_permission_module: "Creadores",
      });

      qc.invalidateQueries({ queryKey: ["creator", creatorId] });
      qc.invalidateQueries({ queryKey: ["creators"] });
      toast({ title: t("creadores.verify.approved"), description: t("creadores.verify.approvedDesc", { name: creatorName }) });
    } catch (err: any) {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      toast({ title: t("creadores.verify.reasonRequired"), description: t("creadores.verify.reasonRequiredDesc"), variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase
        .from("creators")
        .update({ status: "borrador" })
        .eq("id", creatorId);
      if (error) throw error;

      if (user) {
        await supabase.from("creator_history").insert({
          creator_id: creatorId,
          user_id: user.id,
          action: `Verificación rechazada: ${rejectReason}`,
          old_value: "pendiente_verificacion",
          new_value: "borrador",
        });
      }

      await supabase.from("notifications").insert({
        type: "verification_rejected",
        title: "Verificación rechazada",
        message: `${creatorName} fue rechazada: ${rejectReason}`,
        reference_id: creatorId,
        reference_type: "creator",
        module_origin: "creadores",
        priority: "high",
        deep_link_url: `/creadores/${creatorId}`,
        required_permission_module: "Creadores",
      });

      qc.invalidateQueries({ queryKey: ["creator", creatorId] });
      qc.invalidateQueries({ queryKey: ["creators"] });
      toast({ title: t("creadores.verify.rejected"), description: t("creadores.verify.rejectedDesc") });
      setRejecting(false);
      setRejectReason("");
    } catch (err: any) {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="mx-6 mt-4 border-warning/50 bg-warning/5">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-warning" />
          <h3 className="font-semibold text-sm">{t("creadores.verify.pending")}</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("creadores.verify.pendingDesc")}
        </p>

        {!rejecting ? (
          <div className="flex gap-2">
            <Button size="sm" onClick={handleApprove} disabled={loading} className="bg-success hover:bg-success/90 text-success-foreground">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
              {t("creadores.verify.approve")}
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setRejecting(true)} disabled={loading}>
              <ShieldX className="mr-2 h-4 w-4" />
              {t("creadores.verify.reject")}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Textarea
              placeholder={t("creadores.verify.reasonPh")}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={2}
            />
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={handleReject} disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("creadores.verify.confirmReject")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setRejecting(false); setRejectReason(""); }} disabled={loading}>
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default VerificationSection;
