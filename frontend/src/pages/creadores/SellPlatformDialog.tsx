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

// Kash = la agencia. Elegirlo NO es vender una plataforma: es mandar a la
// creadora de vuelta al pipeline como RECLUTAMIENTO (comisión % sobre su
// monetización). Es el camino nativo para ex-creadoras y para las que están
// saliendo (status leaving/paused/terminated), que antes no tenían forma de
// volver al pipeline sin insertar filas a mano.
const KASH = "Kash";

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
  // Sólo para Kash (reclutamiento): la nota del pipeline se calcula como
  // monetización × comisión, así que van los dos.
  const [monetization, setMonetization] = useState<string>("");
  const [commission, setCommission] = useState<string>("30");
  const [closerId, setCloserId] = useState<string>(POOL);
  const esKash = platform === KASH;

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
      if (!platform) throw new Error("Elige qué venderle.");
      const closer = closerId === POOL ? null : closerId;

      // ── Kash = la agencia → RECLUTAMIENTO, no venta de plataforma ──
      // Es el camino nativo para que una ex-creadora (o una que se está yendo)
      // vuelva al pipeline "de la forma normal": comisión % sobre su
      // monetización, no suscripción mensual. Decisión del owner 2026-07-29.
      if (platform === KASH) {
        const monet = Number(monetization);
        const pct = Number(commission);
        if (!monet || monet <= 0) throw new Error("Ingresa la monetización estimada (USD/mes).");
        if (!pct || pct <= 0 || pct > 100) throw new Error("Ingresa el % de comisión de la agencia (1-100).");
        const { data, error } = await (supabase as any).rpc("create_recruitment_deal_for_creator", {
          p_creator_id: creatorId,
          p_closer_id: closer,
          p_estimated_monetization: monet,
          p_agency_commission: pct,
        });
        if (error) throw error;
        return data as string;
      }

      const amt = Number(amount);
      if (!amt || amt <= 0) throw new Error("Ingresa el monto mensual de la suscripción.");
      // RPC nuevo: no está en los tipos generados de Supabase → cast.
      const { data, error } = await (supabase as any).rpc("create_platform_deal_for_creator", {
        p_creator_id: creatorId,
        p_platform: platform,
        p_subscription_amount: amt,
        p_closer_id: closer,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["closer-creators-list"] });
      queryClient.invalidateQueries({ queryKey: ["closer-creators-counts"] });
      const esKash = platform === KASH;
      toast({
        title: esKash ? "De vuelta al pipeline" : "Enviada a Closers",
        description: esKash
          ? (closerId === POOL
              ? `${creatorName} entró al pool para re-reclutarla para la agencia.`
              : `${creatorName} asignada para re-reclutarla para la agencia.`)
          : (closerId === POOL
              ? `${creatorName} entró al pool para vender ${platform}.`
              : `${creatorName} asignada para vender ${platform}.`),
      });
      onOpenChange(false);
      setPlatform("");
      setAmount("");
      setMonetization("");
      setCommission("30");
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
          <DialogTitle>{esKash ? "Volver al pipeline (Kash)" : "Vender plataforma"}</DialogTitle>
          <DialogDescription>
            {creatorName}
            {instagramHandle ? ` · @${instagramHandle.replace(/^@/, "")}` : ""}{" "}
            {esKash
              ? "vuelve al pipeline de closers como RECLUTAMIENTO para la agencia: se cierra por comisión % sobre su monetización, no por suscripción."
              : "vuelve al pipeline de closers para venderle una plataforma. Paga una suscripción mensual (sin comisión %)."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>¿Qué le vendemos?</Label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger>
                <SelectValue placeholder="Elige..." />
              </SelectTrigger>
              <SelectContent>
                {/* Kash = la agencia → dispara el flujo de RECLUTAMIENTO. Va
                    primero y con etiqueta explícita para que no se confunda con
                    las plataformas del portfolio. */}
                <SelectItem value={KASH}>Kash — la agencia (re-reclutar)</SelectItem>
                {SALE_PLATFORMS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {esKash && (
            <>
              <div className="space-y-1.5">
                <Label>Monetización estimada (USD/mes)</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={monetization}
                  onChange={(e) => setMonetization(e.target.value)}
                  placeholder="Ej. 8000 — lo que factura hoy en OF"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Comisión de la agencia (%)</Label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  value={commission}
                  onChange={(e) => setCommission(e.target.value)}
                  placeholder="Ej. 30"
                />
              </div>
              <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                Si sigue en el roster (saliendo o pausada), al cerrarla usa <strong>Reactivar</strong> en
                Creadoras — no "Convertir a Creadora", que falla porque la ficha ya existe.
              </p>
            </>
          )}

          {!esKash && (
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
          )}

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
