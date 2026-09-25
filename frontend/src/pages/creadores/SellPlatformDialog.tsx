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
import { conNombre } from "./etiquetasCreadora";
import { useLanguage } from "@/hooks/useLanguage";

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
  const { t } = useLanguage();
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
      if (!platform) throw new Error(t("creadores.sell.pickWhat"));
      const closer = closerId === POOL ? null : closerId;

      // ── Kash = la agencia → RECLUTAMIENTO, no venta de plataforma ──
      // Es el camino nativo para que una ex-creadora (o una que se está yendo)
      // vuelva al pipeline "de la forma normal": comisión % sobre su
      // monetización, no suscripción mensual. Decisión del owner 2026-07-29.
      if (platform === KASH) {
        const monet = Number(monetization);
        const pct = Number(commission);
        if (!monet || monet <= 0) throw new Error(t("creadores.sell.enterMonetization"));
        if (!pct || pct <= 0 || pct > 100) throw new Error(t("creadores.sell.enterCommission"));
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
      if (!amt || amt <= 0) throw new Error(t("creadores.sell.enterAmount"));
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
        title: esKash ? t("creadores.sell.backToPipeline") : t("creadores.sell.sentToClosers"),
        description: esKash
          ? (closerId === POOL
              ? t("creadores.sell.kashPool", { name: creatorName })
              : t("creadores.sell.kashAssigned", { name: creatorName }))
          : (closerId === POOL
              ? t("creadores.sell.platformPool", { name: creatorName, platform })
              : t("creadores.sell.platformAssigned", { name: creatorName, platform })),
      });
      onOpenChange(false);
      setPlatform("");
      setAmount("");
      setMonetization("");
      setCommission("30");
      setCloserId(POOL);
    },
    onError: (e: Error) => {
      toast({ title: t("creadores.sell.dealError"), description: e.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{esKash ? t("creadores.sell.kashTitle") : t("creadores.table.sellPlatform")}</DialogTitle>
          <DialogDescription>
            {creatorName}
            {instagramHandle ? ` · @${instagramHandle.replace(/^@/, "")}` : ""}{" "}
            {esKash
              ? t("creadores.sell.kashDesc")
              : t("creadores.sell.platformDesc")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>{t("creadores.sell.whatToSell")}</Label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger>
                <SelectValue placeholder={t("creadores.sell.choosePh")} />
              </SelectTrigger>
              <SelectContent>
                {/* Kash = la agencia → dispara el flujo de RECLUTAMIENTO. Va
                    primero y con etiqueta explícita para que no se confunda con
                    las plataformas del portfolio. */}
                <SelectItem value={KASH}>{t("creadores.sell.kashOption")}</SelectItem>
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
                <Label>{t("creadores.sell.estMonetization")}</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={monetization}
                  onChange={(e) => setMonetization(e.target.value)}
                  placeholder={t("creadores.sell.estMonetizationPh")}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("creadores.sell.agencyCommission")}</Label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  value={commission}
                  onChange={(e) => setCommission(e.target.value)}
                  placeholder={t("creadores.sell.egPh", { n: 30 })}
                />
              </div>
              <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                {conNombre(t("creadores.sell.reactivateHint"), t("creadores.sell.reactivate"))}
              </p>
            </>
          )}

          {!esKash && (
          <div className="space-y-1.5">
            <Label>{t("creadores.sell.monthlySub")}</Label>
            <Input
              type="number"
              min="0"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={t("creadores.sell.egPh", { n: 50 })}
            />
          </div>
          )}

          <div className="space-y-1.5">
            <Label>{t("creadores.sell.closerOptional")}</Label>
            <Select value={closerId} onValueChange={setCloserId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={POOL}>{t("creadores.sell.leaveInPool")}</SelectItem>
                {closers.map((cl) => (
                  <SelectItem key={cl.id} value={cl.id}>
                    {cl.full_name || t("creadores.sell.noName")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sell.isPending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => sell.mutate()} disabled={sell.isPending}>
            {sell.isPending ? t("creadores.tickets.creating") : t("creadores.sell.createDeal")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SellPlatformDialog;
