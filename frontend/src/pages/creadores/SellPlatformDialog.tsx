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
  creatorId: string;
  instagramHandle: string;
  creatorName: string;
}

// Valor centinela para "dejar en el pool (sin asignar)" — Select no maneja bien "".
const POOL = "__pool__";

/**
 * Manda una creadora YA existente al pipeline de closers como un "deal" de
 * venta de plataforma (deal_type='venta_plataforma'). A diferencia del
 * reclutamiento, acá no hay % de comisión: la creadora paga una SUSCRIPCIÓN
 * MENSUAL fija. Llama al RPC create_platform_deal_for_creator (SECURITY
 * DEFINER, permiso Closers/Asignar Closer).
 */
const SellPlatformDialog = ({ open, onOpenChange, creatorId, instagramHandle, creatorName }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [platform, setPlatform] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [closerId, setCloserId] = useState<string>(POOL);

  // Lista de closers a los que asignar (mismo patrón que AssignCloserDialog).
  // RPC SECURITY DEFINER: leer user_roles directo solo andaba para admins (la RLS
  // le devolvía 0 filas a cualquier otro rol → lista vacía).
  const { data: closers = [] } = useQuery({
    queryKey: ["closers-list-only"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_assignable_closers");
      if (error) throw error;
      return (data || []) as { id: string; full_name: string }[];
    },
  });

  const sell = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (!platform) throw new Error("Elegí la plataforma a vender.");
      if (!amt || amt <= 0) throw new Error("Ingresá el monto mensual de la suscripción.");
      // RPC nuevo: no está en los tipos generados de Supabase → cast.
      const { data, error } = await (supabase as any).rpc("create_platform_deal_for_creator", {
        p_creator_id: creatorId,
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
        title: "Enviada a Closers",
        description:
          closerId === POOL
            ? `${creatorName} entró al pool para vender ${platform}.`
            : `${creatorName} asignada para vender ${platform}.`,
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
            {creatorName}
            {instagramHandle ? ` · @${instagramHandle.replace(/^@/, "")}` : ""} vuelve al pipeline de
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

export default SellPlatformDialog;
