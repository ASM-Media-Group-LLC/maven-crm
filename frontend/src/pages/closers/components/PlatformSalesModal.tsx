import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ListRow } from "@/components/ui/list-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2 } from "lucide-react";
import { SALE_PLATFORMS } from "../hooks/useCloserLeads";

interface PlatformSale {
  id: string;
  platform: string;
  product: string | null;
  price: number;
  created_at: string;
}

interface Props {
  creatorId: string;
  instagramHandle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PlatformSalesModal = ({ creatorId, instagramHandle, open, onOpenChange }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPlatforms, setSelectedPlatforms] = useState<Record<string, string>>({});

  const { data: sales = [] } = useQuery({
    queryKey: ["closer-platform-sales", creatorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("closer_platform_sales")
        .select("*")
        .eq("creator_id", creatorId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as PlatformSale[];
    },
    enabled: !!creatorId && open,
  });

  const existingPlatforms = new Set(sales.map((s) => s.platform));
  const availablePlatforms = SALE_PLATFORMS.filter((p) => !existingPlatforms.has(p));
  const selectedCount = Object.keys(selectedPlatforms).length;

  const addSales = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("No autenticado");
      const entries = Object.entries(selectedPlatforms).map(([platform, price]) => ({
        creator_id: creatorId,
        platform,
        price: Number(price) || 0,
        created_by: user.id,
      }));
      if (entries.length === 0) throw new Error("Sin plataformas seleccionadas");
      const { error } = await supabase.from("closer_platform_sales").insert(entries);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["closer-platform-sales", creatorId] });
      queryClient.invalidateQueries({ queryKey: ["closer-platform-revenue"] });
      queryClient.invalidateQueries({ queryKey: ["closer-platform-sales-all"] });
      setSelectedPlatforms({});
      toast({ title: "Ventas registradas" });
      onOpenChange(false);
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const deleteSale = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("closer_platform_sales").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["closer-platform-sales", creatorId] });
      queryClient.invalidateQueries({ queryKey: ["closer-platform-revenue"] });
      queryClient.invalidateQueries({ queryKey: ["closer-platform-sales-all"] });
    },
  });

  const togglePlatform = (platform: string, checked: boolean) => {
    setSelectedPlatforms((prev) => {
      if (checked) return { ...prev, [platform]: "" };
      const next = { ...prev };
      delete next[platform];
      return next;
    });
  };

  const total = sales.reduce((sum, s) => sum + Number(s.price || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">
            Ventas por plataforma — @{instagramHandle}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {sales.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Registradas</p>
              {sales.map((s) => (
                <ListRow key={s.id} className="justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">{s.platform}</Badge>
                    {s.product && <span className="text-muted-foreground text-xs">– {s.product}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">${Number(s.price).toLocaleString()}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteSale.mutate(s.id)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </ListRow>
              ))}
            </div>
          )}

          {availablePlatforms.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Agregar plataformas</p>
              {availablePlatforms.map((p) => {
                const isSelected = p in selectedPlatforms;
                return (
                  <div key={p} className="flex items-center gap-3 py-1">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(checked) => togglePlatform(p, !!checked)}
                      id={`plat-${p}`}
                    />
                    <label htmlFor={`plat-${p}`} className="text-sm flex-1 cursor-pointer">{p}</label>
                    {isSelected && (
                      <Input
                        type="number"
                        placeholder="$0"
                        value={selectedPlatforms[p]}
                        onChange={(e) => setSelectedPlatforms((prev) => ({ ...prev, [p]: e.target.value }))}
                        className="h-7 w-24 text-xs"
                        autoFocus
                      />
                    )}
                  </div>
                );
              })}

              {selectedCount > 0 && (
                <div className="flex justify-end pt-1">
                  <Button size="sm" className="h-7 text-xs" onClick={() => addSales.mutate()} disabled={addSales.isPending}>
                    Guardar ({selectedCount})
                  </Button>
                </div>
              )}
            </div>
          )}

          {sales.length === 0 && availablePlatforms.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Todas las plataformas ya registradas</p>
          )}
        </div>

        {sales.length > 0 && (
          <div className="flex items-center justify-between border-t border-border pt-3 mt-2">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-sm font-bold">${total.toLocaleString()}</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PlatformSalesModal;
