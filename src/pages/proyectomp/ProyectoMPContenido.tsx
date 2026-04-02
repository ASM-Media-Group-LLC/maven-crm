import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMPContent, useCreateMPContent } from "./hooks/useMPContent";
import { useMPModels } from "./hooks/useMPModels";
import { Plus, Camera, Bot } from "lucide-react";
import { toast } from "sonner";

const contentTypeLabels: Record<string, string> = {
  ai_social: "AI - Social",
  ai_perfil: "AI - Perfil",
  ai_premium: "AI - Premium",
  modelo_video: "Modelo - Video",
  modelo_custom: "Modelo - Custom",
  modelo_intimo: "Modelo - Íntimo",
};

const ProyectoMPContenido = () => {
  const { data: content, isLoading } = useMPContent();
  const { data: models } = useMPModels();
  const createContent = useCreateMPContent();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ model_id: "", content_type: "ai_social" as string, source: "ai" as string, quantity: 1, date: new Date().toISOString().split("T")[0] });

  const handleCreate = () => {
    if (!form.model_id) { toast.error("Selecciona una cuenta"); return; }
    createContent.mutate(form, {
      onSuccess: () => { toast.success("Contenido registrado"); setOpen(false); },
    });
  };

  const aiCount = content?.filter((c) => c.source === "ai").reduce((sum, c) => sum + c.quantity, 0) ?? 0;
  const modeloCount = content?.filter((c) => c.source === "modelo").reduce((sum, c) => sum + c.quantity, 0) ?? 0;

  if (isLoading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tracker de Contenido</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Registrar</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Registrar Contenido</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Cuenta</Label>
                <Select value={form.model_id} onValueChange={(v) => setForm({ ...form, model_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar cuenta" /></SelectTrigger>
                  <SelectContent>{models?.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo</Label>
                  <Select value={form.content_type} onValueChange={(v) => setForm({ ...form, content_type: v, source: v.startsWith("ai") ? "ai" : "modelo" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(contentTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Cantidad</Label><Input type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: parseInt(e.target.value) || 1 })} /></div>
              </div>
              <div><Label>Fecha</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
              <Button onClick={handleCreate} className="w-full" disabled={createContent.isPending}>Registrar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <Bot className="h-8 w-8 text-purple-400" />
            <div><p className="text-2xl font-bold">{aiCount}</p><p className="text-xs text-muted-foreground">Contenido AI</p></div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <Camera className="h-8 w-8 text-pink-400" />
            <div><p className="text-2xl font-bold">{modeloCount}</p><p className="text-xs text-muted-foreground">Contenido Modelo</p></div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-border">
        <CardHeader><CardTitle className="text-sm">Historial de Contenido</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Cuenta</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Fuente</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {content?.slice(0, 20).map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="text-sm">{c.date}</TableCell>
                  <TableCell className="text-sm">{(c as any).mp_models?.name || "—"}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{contentTypeLabels[c.content_type] || c.content_type}</Badge></TableCell>
                  <TableCell><Badge className={`text-xs ${c.source === "ai" ? "bg-purple-500/20 text-purple-400" : "bg-pink-500/20 text-pink-400"}`}>{c.source}</Badge></TableCell>
                  <TableCell className="text-right font-medium">{c.quantity}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProyectoMPContenido;
