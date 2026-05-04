import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMPTeam, useCreateMPTeamMember } from "./hooks/useMPTeam";
import { Plus, Users, UserCheck, Search } from "lucide-react";
import { toast } from "sonner";

const statusStyles: Record<string, string> = {
  hired: "bg-emerald-500/20 text-emerald-400",
  searching: "bg-amber-500/20 text-amber-400",
  pending: "bg-muted text-muted-foreground",
};

const statusLabels: Record<string, string> = {
  hired: "Contratado",
  searching: "Buscando",
  pending: "Pendiente",
};

const ProyectoMPEquipo = () => {
  const { data: team, isLoading } = useMPTeam();
  const createMember = useCreateMPTeamMember();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", role: "", salary: "", status: "searching" });

  const handleCreate = () => {
    if (!form.name.trim() || !form.role.trim()) return;
    createMember.mutate(
      { ...form, salary: form.salary ? parseFloat(form.salary) : null },
      { onSuccess: () => { toast.success("Miembro agregado"); setOpen(false); setForm({ name: "", role: "", salary: "", status: "searching" }); } }
    );
  };

  const hired = team?.filter((m) => m.status === "hired").length ?? 0;
  const searching = team?.filter((m) => m.status === "searching").length ?? 0;

  if (isLoading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Equipo del Proyecto</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Agregar</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nuevo Miembro</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nombre</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Rol</Label><Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="ej: Chatter, Manager, Traffic" /></div>
              <div><Label>Salario (mensual)</Label><Input type="number" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} /></div>
              <div>
                <Label>Estado</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hired">Contratado</SelectItem>
                    <SelectItem value="searching">Buscando</SelectItem>
                    <SelectItem value="pending">Pendiente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleCreate} className="w-full" disabled={createMember.isPending}>Agregar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card className="bg-card"><CardContent className="p-4 flex items-center gap-3"><UserCheck className="h-8 w-8 text-emerald-400" /><div><p className="text-2xl font-bold">{hired}</p><p className="text-xs text-muted-foreground">Contratados</p></div></CardContent></Card>
        <Card className="bg-card"><CardContent className="p-4 flex items-center gap-3"><Search className="h-8 w-8 text-amber-400" /><div><p className="text-2xl font-bold">{searching}</p><p className="text-xs text-muted-foreground">En búsqueda</p></div></CardContent></Card>
      </div>

      <Card className="bg-card border-border">
        <CardHeader><CardTitle className="text-sm">Miembros del Equipo</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Salario</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {team?.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell>{m.role}</TableCell>
                  <TableCell><Badge className={`text-xs ${statusStyles[m.status] || ""}`}>{statusLabels[m.status] || m.status}</Badge></TableCell>
                  <TableCell className="text-right">{m.salary ? `$${Number(m.salary).toLocaleString()}` : "—"}</TableCell>
                </TableRow>
              ))}
              {(!team || team.length === 0) && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Sin miembros</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProyectoMPEquipo;
