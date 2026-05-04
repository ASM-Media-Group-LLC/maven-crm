import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMPTrafficOrganic, useMPTrafficSFS, useMPTrafficPaid, useCreateMPTrafficOrganic, useCreateMPTrafficSFS, useCreateMPTrafficPaid } from "./hooks/useMPTraffic";
import { useMPModels } from "./hooks/useMPModels";
import { Plus, Globe, ArrowLeftRight, Wallet } from "lucide-react";
import { toast } from "sonner";

const ProyectoMPTrafico = () => {
  const { data: organic } = useMPTrafficOrganic();
  const { data: sfs } = useMPTrafficSFS();
  const { data: paid } = useMPTrafficPaid();
  const { data: models } = useMPModels();
  const createOrganic = useCreateMPTrafficOrganic();
  const createSFS = useCreateMPTrafficSFS();
  const createPaid = useCreateMPTrafficPaid();

  const [tab, setTab] = useState("organic");
  const [open, setOpen] = useState(false);

  const totalSubs = (organic?.reduce((s, r) => s + (r.subs_generated || 0), 0) ?? 0) +
    (sfs?.reduce((s, r) => s + (r.subs_generated || 0), 0) ?? 0) +
    (paid?.reduce((s, r) => s + (r.subs_obtained || 0), 0) ?? 0);

  const totalInvested = paid?.reduce((s, r) => s + Number(r.amount_invested || 0), 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tracker de Tráfico</h1>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-card"><CardContent className="p-4 flex items-center gap-3"><Globe className="h-8 w-8 text-green-400" /><div><p className="text-2xl font-bold">{organic?.length ?? 0}</p><p className="text-xs text-muted-foreground">Posts orgánicos</p></div></CardContent></Card>
        <Card className="bg-card"><CardContent className="p-4 flex items-center gap-3"><ArrowLeftRight className="h-8 w-8 text-blue-400" /><div><p className="text-2xl font-bold">{sfs?.length ?? 0}</p><p className="text-xs text-muted-foreground">SFS realizados</p></div></CardContent></Card>
        <Card className="bg-card"><CardContent className="p-4 flex items-center gap-3"><Wallet className="h-8 w-8 text-amber-400" /><div><p className="text-2xl font-bold">${totalInvested.toLocaleString()}</p><p className="text-xs text-muted-foreground">Invertido en tráfico</p></div></CardContent></Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="organic">Orgánico</TabsTrigger>
          <TabsTrigger value="sfs">SFS</TabsTrigger>
          <TabsTrigger value="paid">Pagado</TabsTrigger>
        </TabsList>

        <TabsContent value="organic">
          <Card className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Tráfico Orgánico</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Cuenta</TableHead><TableHead>Plataforma</TableHead><TableHead className="text-right">Posts</TableHead><TableHead className="text-right">Subs</TableHead></TableRow></TableHeader>
                <TableBody>
                  {organic?.slice(0, 20).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.date}</TableCell>
                      <TableCell>{(r as any).mp_models?.name || "—"}</TableCell>
                      <TableCell>{r.platform}</TableCell>
                      <TableCell className="text-right">{r.posts_count}</TableCell>
                      <TableCell className="text-right">{r.subs_generated}</TableCell>
                    </TableRow>
                  ))}
                  {(!organic || organic.length === 0) && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Sin datos</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sfs">
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-sm">Intercambios SFS</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Partner</TableHead><TableHead>Handle</TableHead><TableHead>Estado</TableHead><TableHead className="text-right">Subs</TableHead></TableRow></TableHeader>
                <TableBody>
                  {sfs?.slice(0, 20).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.date}</TableCell>
                      <TableCell>{r.partner_name}</TableCell>
                      <TableCell>{r.partner_handle || "—"}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{r.status}</Badge></TableCell>
                      <TableCell className="text-right">{r.subs_generated}</TableCell>
                    </TableRow>
                  ))}
                  {(!sfs || sfs.length === 0) && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Sin datos</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="paid">
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-sm">Tráfico Pagado</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Cuenta</TableHead><TableHead>Creador</TableHead><TableHead className="text-right">Invertido</TableHead><TableHead className="text-right">Subs</TableHead><TableHead className="text-right">CPA</TableHead></TableRow></TableHeader>
                <TableBody>
                  {paid?.slice(0, 20).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.date}</TableCell>
                      <TableCell>{(r as any).mp_models?.name || "—"}</TableCell>
                      <TableCell>{r.creator_contacted || "—"}</TableCell>
                      <TableCell className="text-right">${Number(r.amount_invested).toLocaleString()}</TableCell>
                      <TableCell className="text-right">{r.subs_obtained}</TableCell>
                      <TableCell className="text-right">{r.cpa ? `$${Number(r.cpa).toFixed(2)}` : "—"}</TableCell>
                    </TableRow>
                  ))}
                  {(!paid || paid.length === 0) && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Sin datos</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ProyectoMPTrafico;
