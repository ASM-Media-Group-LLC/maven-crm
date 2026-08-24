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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  // Ventas registradas por el bot (monetization_opportunities won): se muestran
  // pero no se borran desde acá.
  viaBot?: boolean;
}

// Para dedup entre las dos fuentes: "lets_shoot" y "Let's Shoot" son el mismo producto.
const normalizaProducto = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

const PlatformSalesPanel = ({ creatorId }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  // Confirmación antes de borrar: es un registro monetario, nada de borrado en un clic.
  const [saleToDelete, setSaleToDelete] = useState<PlatformSale | null>(null);
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

  // La misma venta puede vivir en DOS lugares: acá (cargada a mano) o en
  // monetization_opportunities ganada (la registra el bot desde WhatsApp). María lo
  // reportó el 04/08: su venta de Content Protector estaba ganada en Maven pero este
  // tablero no la mostraba porque solo leía closer_platform_sales. Se traen las
  // ganadas del bot por handle y se deduplican por producto.
  const { data: ventasBot = [] } = useQuery({
    queryKey: ["closer-monetization-won", creatorId],
    queryFn: async () => {
      const { data: lead } = await supabase
        .from("closer_creators")
        .select("instagram_handle")
        .eq("id", creatorId)
        .maybeSingle();
      const handle = lead?.instagram_handle?.trim();
      if (!handle) return [] as PlatformSale[];
      const { data, error } = await supabase
        .from("monetization_opportunities")
        .select("id, product, monthly_value_usd, won_at")
        .eq("stage", "won")
        .ilike("creator_handle", handle);
      if (error) throw error;
      return (data ?? []).map((o) => ({
        id: `mo-${o.id}`,
        platform: (o.product ?? "producto").replace(/_/g, " "),
        product: null,
        price: Number(o.monthly_value_usd ?? 0),
        created_at: o.won_at ?? "",
        viaBot: true,
      })) as PlatformSale[];
    },
    enabled: !!creatorId,
  });

  // Unión con dedup: si el mismo producto ya está cargado a mano, la fila del bot
  // no se repite (evita el doble conteo del total).
  const productosManuales = new Set(sales.map((s) => normalizaProducto(s.product ?? s.platform)));
  const ventasBotUnicas = ventasBot.filter((v) => !productosManuales.has(normalizaProducto(v.platform)));
  const todas = [...sales, ...ventasBotUnicas];

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
      setSaleToDelete(null);
      toast({ title: "Venta eliminada" });
    },
    onError: (e: Error) => {
      toast({ title: "Error al eliminar", description: e.message, variant: "destructive" });
    },
  });

  const total = todas.reduce((sum, s) => sum + Number(s.price || 0), 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">Ventas por plataforma</p>
        <span className="text-xs font-semibold text-foreground">${total.toLocaleString()}</span>
      </div>

      {todas.map((s) => (
        <ListRow key={s.id} className="justify-between px-2 py-1.5">
          <div className="flex items-center gap-2">
            <span className="font-medium">{s.platform}</span>
            {s.product && <span className="text-muted-foreground">– {s.product}</span>}
            {s.viaBot && (
              <span className="text-[10px] rounded bg-muted px-1 py-0.5 text-muted-foreground" title="Registrada por el bot desde WhatsApp (oportunidad ganada)">
                bot
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold">${Number(s.price).toLocaleString()}</span>
            {!s.viaBot && (
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSaleToDelete(s)}>
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            )}
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

      <AlertDialog open={!!saleToDelete} onOpenChange={(o) => { if (!o) setSaleToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta venta?</AlertDialogTitle>
            <AlertDialogDescription>
              Estás a punto de eliminar la venta de{" "}
              <strong>{saleToDelete?.platform}</strong>
              {saleToDelete?.product ? <> – {saleToDelete.product}</> : null}{" "}
              por <strong>${Number(saleToDelete?.price ?? 0).toLocaleString()}</strong>. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (saleToDelete) deleteSale.mutate(saleToDelete.id); }}
              disabled={deleteSale.isPending}
            >
              {deleteSale.isPending ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PlatformSalesPanel;
