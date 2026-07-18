import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SALE_PLATFORMS } from "@/pages/closers/hooks/useCloserLeads";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  instagramHandle: string;
  contactName: string;
}

// Valor centinela para "dejar en el pool (sin asignar)" — Select no maneja bien "".
const POOL = "__pool__";

/**
 * Gemelo de creadores/SellPlatformDialog pero para un CONTACTO (closers_contacts).
 * Manda el contacto al pipeline de closers como deal de venta de plataforma
 * (deal_type='venta_plataforma', suscripción mensual, sin comisión %). Llama al
 * RPC create_platform_deal_for_contact (SECURITY DEFINER, permiso Closers/Asignar
 * Closer, ligado por source_contact_id, idempotente por contacto+plataforma).
 */
const SellPlatformContactDialog = ({ open, onOpenChange, contactId, instagramHandle, contactName }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [platform, setPlatform] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [closerId, setCloserId] = useState<string>(POOL);

  // Lista de closers a los que asignar (mismo patrón que SellPlatformDialog).
  const { data: closers = [] } = useQuery({
    queryKey: ["closers-list-only"],
    enabled: open,
    queryFn: async () => {
      const { data: roles, error } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["closer", "Closer Supervisor", "admin"]);
      if (error) throw error;
      const ids = [...new Set((roles || []).map((r: any) => r.user_id))];
      if (ids.length === 0) return [] as { id: string; full_name: string }[];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids)
        .order("full_name", { ascending: true });
      return (profiles || []) as { id: string; full_name: string }[];
    },
  });

  const sell = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (!platform) throw new Error("Elegí la plataforma a vender.");
      if (!amt || amt <= 0) throw new Error("Ingresá el monto mensual de la suscripción.");
      const { data, error } = await (supabase as any).rpc("create_platform_deal_for_contact", {
        p_contact_id: contactId,
        p_platform: platform,
        p_subscription_amount: amt,
        p_closer_id: closerId === POOL ? null : closerId,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["closer-creators-list"] });
      queryClient.invalidateQueries({ queryKey: ["closer-creators-counts"] });
      toast({
        title: "Enviado a Closers",
        description:
          closerId === POOL
            ? `${contactName} entró al pool para vender ${platform}.`
            : `${contactName} asignado para vender ${platform}.`,
      });
      onOpenChange(false);
      setPlatform("");
      setAmount("");
      setCloserId(POOL);
    },
    onError: (e: Error) => {
      toast({ title: "No se pudo crear el deal", description: e.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Vender plataforma</DialogTitle>
          <DialogDescription>
            {contactName}
            {instagramHandle ? ` · @${instagramHandle.replace(/^@/, "")}` : ""} entra al pipeline de
            closers para venderle una plataforma. Paga una suscripción mensual (sin comisión %).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Plataforma</Label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger>
                <SelectValue placeholder="Elegí la plataforma..." />
              </SelectTrigger>
              <SelectContent>
                {SALE_PLATFORMS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Suscripción mensual (USD)</Label>
            <Input
              type="number"
              min="0"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Ej. 50"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Closer (opcional)</Label>
            <Select value={closerId} onValueChange={setCloserId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={POOL}>Dejar en el pool (sin asignar)</SelectItem>
                {closers.map((cl) => (
                  <SelectItem key={cl.id} value={cl.id}>
                    {cl.full_name || "Sin nombre"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sell.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => sell.mutate()} disabled={sell.isPending}>
            {sell.isPending ? "Creando..." : "Crear deal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SellPlatformContactDialog;
