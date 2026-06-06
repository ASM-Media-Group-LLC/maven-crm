import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Smartphone, Loader2, Play, RefreshCw, Power } from "lucide-react";

// Tab "Teléfonos" (Operaciones). El closer ve SOLO los teléfonos que tiene asignados; el admin
// ve todos y puede asignarlos. "Abrir" arranca el cloud phone y lo muestra embebido en un <iframe>.
// Todo pasa por la edge function `cloudphone` (que habla con el micro). Cero marca Multilogin.

type Phone = {
  id: string;
  serial_name?: string;
  serial_no?: string;
  status?: number;
  remark?: string;
  usecase_name?: string;
  assigned_to?: string | null;
};
type Usr = { id: string; full_name: string | null };

export default function TelefonosPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [phones, setPhones] = useState<Phone[]>([]);
  const [users, setUsers] = useState<Usr[]>([]);
  const [opening, setOpening] = useState<string | null>(null);
  const [active, setActive] = useState<{ id: string; name: string; url: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("cloudphone", {
      body: { action: "list" },
    });
    setLoading(false);
    const res = data as { ok?: boolean; isAdmin?: boolean; phones?: Phone[]; error?: string } | null;
    if (error || !res?.ok) {
      toast({
        title: "No se pudieron cargar los teléfonos",
        description: error?.message || res?.error || "Error desconocido",
        variant: "destructive",
      });
      return;
    }
    setIsAdmin(!!res.isAdmin);
    setPhones(res.phones ?? []);
    if (res.isAdmin) {
      const { data: u } = await supabase.functions.invoke("cloudphone", { body: { action: "users" } });
      const ur = u as { ok?: boolean; users?: Usr[] } | null;
      if (ur?.ok && ur.users) setUsers(ur.users);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const open = async (p: Phone) => {
    setOpening(p.id);
    const { data, error } = await supabase.functions.invoke("cloudphone", {
      body: { action: "start", profileId: p.id },
    });
    setOpening(null);
    const res = data as { ok?: boolean; url?: string; error?: string } | null;
    if (error || !res?.ok || !res.url) {
      toast({
        title: "No se pudo abrir el teléfono",
        description: error?.message || res?.error || "No llegó la URL",
        variant: "destructive",
      });
      return;
    }
    setActive({ id: p.id, name: p.serial_name || p.id, url: res.url });
  };

  const close = async () => {
    const a = active;
    setActive(null);
    if (a) {
      // apagar para no quemar minutos de cloud
      await supabase.functions.invoke("cloudphone", { body: { action: "stop", profileId: a.id } });
    }
  };

  const assign = async (p: Phone, userId: string | null) => {
    const { data, error } = await supabase.functions.invoke("cloudphone", {
      body: { action: "assign", profileId: p.id, userId, serial_name: p.serial_name, remark: p.remark },
    });
    const res = data as { ok?: boolean; error?: string } | null;
    if (error || !res?.ok) {
      toast({ title: "No se pudo asignar", description: error?.message || res?.error, variant: "destructive" });
      return;
    }
    setPhones((prev) => prev.map((x) => (x.id === p.id ? { ...x, assigned_to: userId } : x)));
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Smartphone className="h-5 w-5" />
          <h1 className="text-xl font-semibold">Teléfonos</h1>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </div>
      ) : phones.length === 0 ? (
        <p className="text-muted-foreground">
          {isAdmin ? "No hay teléfonos disponibles." : "No tenés teléfonos asignados todavía."}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {phones.map((p) => (
            <Card key={p.id} className="overflow-hidden">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Smartphone className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="font-medium truncate">{p.serial_name || p.id}</span>
                  </div>
                  {p.usecase_name && <Badge variant="secondary">{p.usecase_name}</Badge>}
                </div>
                {p.remark && <div className="text-sm text-muted-foreground truncate" title={p.remark}>{p.remark}</div>}
                <Button size="sm" className="w-full" onClick={() => open(p)} disabled={opening === p.id}>
                  {opening === p.id ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  Abrir
                </Button>
                {isAdmin && (
                  <div className="pt-2 border-t">
                    <div className="text-xs text-muted-foreground mb-1">Asignar a</div>
                    <Select
                      value={p.assigned_to ?? "none"}
                      onValueChange={(v) => assign(p, v === "none" ? null : v)}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Sin asignar" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin asignar</SelectItem>
                        {users.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.full_name || u.id.slice(0, 8)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!active} onOpenChange={(o) => { if (!o) close(); }}>
        <DialogContent className="max-w-[420px] p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-4 py-2 border-b">
            <DialogTitle className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{active?.name}</span>
              <Button variant="ghost" size="sm" onClick={close} className="h-7 px-2">
                <Power className="h-4 w-4 mr-1" /> Cerrar
              </Button>
            </DialogTitle>
          </DialogHeader>
          {active && (
            <iframe
              src={active.url}
              title={active.name}
              className="w-full bg-black"
              style={{ height: "72vh", border: 0 }}
              allow="clipboard-read; clipboard-write; microphone; camera; autoplay"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
