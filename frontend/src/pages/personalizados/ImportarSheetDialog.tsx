import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AGENCIAS, estadoDe, usd, type Agency } from "./types";
import { useCatalogos } from "./usePersonalizados";
import { aPedido, parseFilasSheet, resolutorPorNombre } from "./importarSheet";

interface Props { open: boolean; onOpenChange: (v: boolean) => void }

// Traer el historial del sheet sin re-tipear nada: copiar las filas de la
// pestaña, pegar acá, revisar la vista previa, importar. Cada fila queda
// marcada como source='sheet' con su pestaña y número de fila.
export default function ImportarSheetDialog({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { creadoras, perfiles } = useCatalogos();
  const [texto, setTexto] = useState("");
  const [agency, setAgency] = useState<Agency>("plus");
  const [pestana, setPestana] = useState("");
  const [importando, setImportando] = useState(false);

  const filas = useMemo(() => (texto.trim() ? parseFilasSheet(texto) : []), [texto]);
  const resolutores = useMemo(() => ({
    creadoraId: resolutorPorNombre(creadoras.map((c) => ({ id: c.id, nombre: c.nombre }))),
    chatterId: resolutorPorNombre(perfiles.map((p) => ({ id: p.id, nombre: p.full_name! }))),
  }), [creadoras, perfiles]);
  const conAvisos = filas.filter((f) => f.avisos.length).length;
  const sinCreadoraEnMaven = filas.filter((f) => f.creator_name && !resolutores.creadoraId(f.creator_name)).length;

  const importar = async () => {
    if (!filas.length || !user) return;
    setImportando(true);
    try {
      const rows = filas.map((f) => ({ ...aPedido(f, agency, pestana.trim() || "sheet", resolutores), created_by: user.id }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("custom_requests").insert(rows);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["personalizados"] });
      toast.success(`${rows.length} pedidos importados`, { description: pestana ? `Pestaña ${pestana}` : undefined });
      setTexto(""); setPestana("");
      onOpenChange(false);
    } catch (e) {
      toast.error("No se pudo importar", { description: (e as Error).message });
    } finally {
      setImportando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!importando) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" /> Importar desde el sheet</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            En el sheet, seleccioná las filas de una pestaña (con o sin la fila de encabezado), copiá (⌘C) y pegá acá.
            Se entienden las columnas tal como están: Creadora, Fecha, Estado, Chatter, Usuario, Gasto del user, Cuánto pagó, Normal, Buster, Tipo, Descripción, Tiempo, Notas.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Agencia de estas filas</Label>
              <Select value={agency} onValueChange={(v) => setAgency(v as Agency)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{AGENCIAS.map((a) => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Pestaña de origen (para trazar)</Label>
              <Input value={pestana} onChange={(e) => setPestana(e.target.value)} placeholder="Julio 2026 · PLUS Aprobadas…" />
            </div>
          </div>
          <Textarea rows={6} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Pegá acá las filas copiadas del sheet…" className="font-mono text-xs" />

          {filas.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="outline" className="rounded-full">{filas.length} filas</Badge>
                {conAvisos > 0 && <Badge variant="outline" className="rounded-full bg-amber-500/15 text-amber-600 border-amber-500/30">{conAvisos} con avisos</Badge>}
                {sinCreadoraEnMaven > 0 && <Badge variant="outline" className="rounded-full">{sinCreadoraEnMaven} creadoras sin match en Maven (se guardan por nombre)</Badge>}
              </div>
              <div className="rounded-xl border border-border/60 max-h-72 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>{["#", "Creadora", "Fecha", "Estado", "Chatter", "Fan", "Precio", "Tipo", "Descripción", "Avisos"].map((h) => <th key={h} className="text-left px-2 py-1.5 font-medium">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {filas.map((f) => (
                      <tr key={f.fila} className="border-t border-border/40 align-top">
                        <td className="px-2 py-1.5 text-muted-foreground">{f.fila}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{f.creator_name || <span className="text-destructive">—</span>}{f.creator_name && !resolutores.creadoraId(f.creator_name) && <span className="text-muted-foreground"> ?</span>}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{f.requested_on ?? <span className="text-amber-500">hoy</span>}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{estadoDe(f.status).corto}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{f.chatter_name ?? "—"}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">@{f.fan_handle}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{usd(f.price_usd)}</td>
                        <td className="px-2 py-1.5">{f.content_type ?? "—"}{f.sale_channel === "buster" ? " ⚡" : ""}</td>
                        <td className="px-2 py-1.5 max-w-[260px] truncate" title={f.description}>{f.description}</td>
                        <td className="px-2 py-1.5 text-amber-600">{f.avisos.join(" · ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={importando}>Cancelar</Button>
          <Button onClick={() => void importar()} disabled={!filas.length || importando} className="gap-1.5">
            {importando && <Loader2 className="h-4 w-4 animate-spin" />} Importar {filas.length || ""} pedidos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
