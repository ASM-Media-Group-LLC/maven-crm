import { Sparkles, Lightbulb, AlertTriangle } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUserRole } from "@/hooks/useUserRole";
import { displayPhone } from "@/lib/country-utils";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type ClosersContact = Tables<"closers_contacts">;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacto: ClosersContact | null;
  onConverted: () => void;
}

const ConvertContactoModal = ({ open, onOpenChange, contacto, onConverted }: Props) => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  // OJO: este hook debe ir ANTES de cualquier return condicional. Estaba después del
  // `if (!contacto) return null` → al abrir el modal (contacto null→set) cambiaba el
  // número de hooks entre renders → React crasheaba (pantalla en blanco → dashboard).
  const { isAdmin } = useUserRole();

  const convert = useMutation({
    mutationFn: async () => {
      if (!contacto) throw new Error(t("contactos.noContact"));
      // Server-side: el RPC lee el teléfono/email REALES del contacto (que el cliente
      // ya no puede ver: están enmascarados/revocados) y crea la creadora + marca el
      // contacto como convertido en una sola transacción.
      const { error } = await supabase.rpc("convert_contact_to_creator", {
        p_contact_id: contacto.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["closers_contacts"] });
      queryClient.invalidateQueries({ queryKey: ["creators"] });
      queryClient.invalidateQueries({ queryKey: ["closer-creators-list"] });
      queryClient.invalidateQueries({ queryKey: ["closer-creators-counts"] });
      toast({ title: t("contactos.convertedToast"), description: t("contactos.convertedToastDesc") });
      onConverted();
    },
    onError: (e: unknown) => {
      toast({ title: t("contactos.convertError"), description: (e as Error)?.message ?? undefined, variant: "destructive" });
    },
  });

  if (!contacto) return null;

  // Regla nueva: ningún creator entra al sistema sin handle de IG.
  // Si el contacto está sin handle (legacy/import incompleto), bloqueamos
  // la conversión y pedimos completarlo primero. Mantiene la integridad
  // de models como fuente canónica de identidad.
  const missingHandle = !contacto.handle || !contacto.handle.trim();

  const items = [
    { label: t("common.name"), value: contacto.name },
    { label: "Handle", value: contacto.handle || "—" },
    { label: t("common.country"), value: contacto.country_code || "—" },
    { label: t("common.category"), value: contacto.physical_appearance || "—" },
    { label: t("common.phone"), value: contacto.phone ? displayPhone(`${contacto.country_code || ""}${contacto.phone}`, isAdmin) : "—" },
    { label: "Email", value: contacto.email || "—" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <DialogTitle>{t("contactos.convertTitle")}</DialogTitle>
          </div>
          <DialogDescription>
            {t("contactos.convertDesc")}
          </DialogDescription>
        </DialogHeader>

        <div className="border rounded-lg p-4 space-y-3">
          <p className="text-sm font-semibold">{t("contactos.dataToTransfer")}</p>
          <ul className="space-y-1.5">
            {items.map((item) => (
              <li key={item.label} className="flex items-start gap-2 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                <span>
                  <span className="font-medium">{item.label}:</span>{" "}
                  <span className="text-muted-foreground">{item.value}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {missingHandle ? (
          <div className="flex items-start gap-2.5 rounded-lg bg-warning/10 p-3">
            <AlertTriangle className="h-4 w-4 text-warning dark:text-warning shrink-0 mt-0.5" />
            <p className="text-xs text-warning dark:text-warning">
              <span className="font-semibold">{t("contactos.missingHandleTitle")}</span>{" "}
              {t("contactos.missingHandleBody")}
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-2.5 rounded-lg bg-primary/10 p-3">
            <Lightbulb className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              {t("contactos.convertHint")}
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={convert.isPending}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => convert.mutate()}
            disabled={convert.isPending || missingHandle}
          >
            {convert.isPending ? t("contactos.converting") : t("contactos.confirmConversion")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConvertContactoModal;
