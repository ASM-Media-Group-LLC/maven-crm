import { useCallback, useEffect, useRef, useState } from "react";
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
import { Smartphone, Loader2, Play, RefreshCw, Power, Clock, Plus, BarChart3 } from "lucide-react";

// Tab "Teléfonos" (Operaciones). El closer ve SOLO los teléfonos asignados; el admin ve todos y asigna.
// "Abrir" arranca el cloud phone y lo muestra en un <iframe>. Control de tiempo: countdown de 20 min con
// auto-cierre, latido cada 60s (para el reaper del micro) y botón Extender. Cero marca Multilogin.

type Phone = {
  id: string;
  serial_name?: string;
  serial_no?: string;
  status?: number;
  remark?: string;
  usecase_name?: string;
  assigned_to?: string | null;
  session?: { userId: string | null; secondsLeft?: number } | null;
};
type Usr = { id: string; full_name: string | null };
type UsageRow = { user_id: string; full_name: string | null; minutes: number; sessions: number };
type RecentRow = {
  serial_name: string | null;
  full_name: string | null;
  started_at: string;
  ended_at: string;
  end_reason: string | null;
  minutes: number;
};

const MAX_SECONDS = 20 * 60;
const fmt = (s: number) => {
  const m = Math.floor(Math.max(0, s) / 60);
  const sec = Math.max(0, s) % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
};

export default function TelefonosPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [phones, setPhones] = useState<Phone[]>([]);
  const [users, setUsers] = useState<Usr[]>([]);
  const [opening, setOpening] = useState<string | null>(null);
  const [active, setActive] = useState<{ id: string; name: string; url: string } | null>(null);
  const [secsLeft, setSecsLeft] = useState(MAX_SECONDS);
  const [usageOpen, setUsageOpen] = useState(false);
  const [usage, setUsage] = useState<{ byUser: UsageRow[]; recent: RecentRow[] } | null>(null);

  const warnedRef = useRef(false);
  const closeRef = useRef<() => void>(() => {});

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("cloudphone", { body: { action: "list" } });
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
      body: { action: "start", profileId: p.id, serial_name: p.serial_name },
    });
    setOpening(null);
    const res = data as { ok?: boolean; url?: string; secondsLeft?: number; error?: string } | null;
    if (error || !res?.ok || !res.url) {
      toast({
        title: "No se pudo abrir el teléfono",
        description: error?.message || res?.error || "No llegó la URL",
        variant: "destructive",
      });
      return;
    }
    warnedRef.current = false;
    setSecsLeft(res.secondsLeft || MAX_SECONDS);
    setActive({ id: p.id, name: p.serial_name || p.id, url: res.url });
  };

  const close = useCallback(async () => {
    const a = active;
    setActive(null);
    if (a) {
      await supabase.functions.invoke("cloudphone", { body: { action: "stop", profileId: a.id } });
      load(); // refrescar estados
    }
  }, [active, load]);
  closeRef.current = close;

  const extend = async () => {
    if (!active) return;
    const { data } = await supabase.functions.invoke("cloudphone", {
      body: { action: "extend", profileId: active.id },
    });
    const res = data as { ok?: boolean; secondsLeft?: number } | null;
    warnedRef.current = false;
    setSecsLeft(res?.secondsLeft || MAX_SECONDS);
    toast({ title: "Sesión extendida", description: "Se reinició el reloj." });
  };

  // Countdown + latido mientras el iframe está abierto.
  useEffect(() => {
    if (!active) return;
    const tick = setInterval(() => {
      setSecsLeft((s) => {
        const n = s - 1;
        if (n === 120 && !warnedRef.current) {
          warnedRef.current = true;
          toast({ title: "Te quedan 2 minutos", description: "Se va a cerrar solo. Tocá Extender si seguís." });
        }
        if (n <= 0) {
          closeRef.current();
          toast({ title: "Sesión cerrada por tiempo" });
          return 0;
        }
        return n;
      });
    }, 1000);
    const hb = setInterval(() => {
      supabase.functions.invoke("cloudphone", { body: { action: "heartbeat", profileId: active.id } });
    }, 60000);
    return () => {
      clearInterval(tick);
      clearInterval(hb);
    };
  }, [active, toast]);

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

  const openUsage = async () => {
    setUsageOpen(true);
    const { data } = await supabase.functions.invoke("cloudphone", { body: { action: "usage" } });
    const res = data as { ok?: boolean; byUser?: UsageRow[]; recent?: RecentRow[] } | null;
    if (res?.ok) setUsage({ byUser: res.byUser ?? [], recent: res.recent ?? [] });
  };

  const lowTime = secsLeft <= 120;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Smartphone className="h-5 w-5" />
          <h1 className="text-xl font-semibold">Teléfonos</h1>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={openUsage}>
              <BarChart3 className="h-4 w-4 mr-2" />
              Uso
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
        </div>
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
                  {p.session ? (
                    <Badge className="bg-emerald-600 hover:bg-emerald-600 shrink-0">En uso</Badge>
                  ) : (
                    p.usecase_name && <Badge variant="secondary" className="shrink-0">{p.usecase_name}</Badge>
                  )}
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

      {/* Iframe del teléfono. Ocultamos la ✕ default del diálogo ([&>button]:hidden) para no pisar "Cerrar". */}
      <Dialog open={!!active} onOpenChange={(o) => { if (!o) close(); }}>
        <DialogContent className="max-w-[420px] p-0 gap-0 overflow-hidden [&>button]:hidden">
          <DialogHeader className="px-3 py-2 border-b">
            <DialogTitle className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{active?.name}</span>
              <span className="flex items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-mono ${
                    lowTime ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" : "bg-muted text-muted-foreground"
                  }`}
                  title="Tiempo restante de la sesión"
                >
                  <Clock className="h-3 w-3" />
                  {fmt(secsLeft)}
                </span>
                <Button variant="ghost" size="sm" onClick={extend} className="h-7 px-2" title="Extender +20 min">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" onClick={close} className="h-7 px-2">
                  <Power className="h-4 w-4 mr-1" /> Cerrar
                </Button>
              </span>
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

      {/* Reporte de uso (admin) */}
      <Dialog open={usageOpen} onOpenChange={setUsageOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Uso de teléfonos (últimos 30 días)</DialogTitle>
          </DialogHeader>
          {!usage ? (
            <div className="flex items-center gap-2 text-muted-foreground py-6">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
            </div>
          ) : (
            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              <div>
                <div className="text-sm font-medium mb-2">Minutos por persona</div>
                {usage.byUser.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Todavía no hay uso registrado.</p>
                ) : (
                  <div className="space-y-1">
                    {usage.byUser.map((u) => (
                      <div key={u.user_id} className="flex items-center justify-between text-sm">
                        <span className="truncate">{u.full_name || u.user_id.slice(0, 8)}</span>
                        <span className="text-muted-foreground">{u.minutes} min · {u.sessions} sesiones</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <div className="text-sm font-medium mb-2">Sesiones recientes</div>
                <div className="space-y-1">
                  {usage.recent.map((r, i) => (
                    <div key={i} className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="truncate">
                        {r.serial_name} · {r.full_name || "—"}
                      </span>
                      <span>{r.minutes} min{r.end_reason && r.end_reason !== "manual" ? ` (${r.end_reason})` : ""}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
