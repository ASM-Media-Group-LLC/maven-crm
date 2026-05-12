import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { ListRow } from "@/components/ui/list-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { SALE_PLATFORMS } from "../hooks/useCloserLeads";

interface Props {
  creatorId: string;
}

interface PlatformSale {
  id: string;
  platform: string;
  product: string | null;
  price: number;
  created_at: string;
}

const PlatformSalesPanel = ({ creatorId }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [platform, setPlatform] = useState("");
  const [product, setProduct] = useState("");
  const [price, setPrice] = useState("");

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
    enabled: !!creatorId,
  });

  const addSale = useMutation({
    mutationFn: async () => {
      if (!user || !platform) throw new Error("Datos incompletos");
      const { error } = await supabase.from("closer_platform_sales").insert({
        creator_id: creatorId,
        platform,
        product: product || null,
        price: Number(price) || 0,
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["closer-platform-sales", creatorId] });
      queryClient.invalidateQueries({ queryKey: ["closer-platform-revenue"] });
      setShowForm(false);
      setPlatform("");
      setProduct("");
      setPrice("");
      toast({ title: "Venta registrada" });
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
    },
  });

  const total = sales.reduce((sum, s) => sum + Number(s.price || 0), 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">Ventas por plataforma</p>
        <span className="text-xs font-semibold text-foreground">${total.toLocaleString()}</span>
      </div>

      {sales.map((s) => (
        <ListRow key={s.id} className="justify-between px-2 py-1.5">
          <div className="flex items-center gap-2">
            <span className="font-medium">{s.platform}</span>
            {s.product && <span className="text-muted-foreground">– {s.product}</span>}
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold">${Number(s.price).toLocaleString()}</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteSale.mutate(s.id)}>
              <Trash2 className="h-3 w-3 text-destructive" />
            </Button>
          </div>
        </ListRow>
      ))}

      {!showForm ? (
        <Button variant="outline" size="sm" onClick={() => setShowForm(true)} className="w-full">
          <Plus className="h-3 w-3 mr-1" /> Agregar venta
        </Button>
      ) : (
        <div className="border border-border rounded-md p-2 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Plataforma</Label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="..." /></SelectTrigger>
                <SelectContent>
                  {SALE_PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Producto</Label>
              <Input value={product} onChange={(e) => setProduct(e.target.value)} className="h-7 text-xs" placeholder="Suscripción..." />
            </div>
            <div>
              <Label className="text-xs">Precio</Label>
              <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} className="h-7 text-xs" placeholder="0" />
            </div>
          </div>
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button size="sm" className="h-7 text-xs" onClick={() => addSale.mutate()} disabled={!platform || addSale.isPending}>Guardar</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlatformSalesPanel;
