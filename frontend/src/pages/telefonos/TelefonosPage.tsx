import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import KpiCard from "@/components/dashboard/KpiCard";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { Smartphone, Loader2, Play, RefreshCw, Power, Clock, LayoutDashboard, Activity, ListChecks } from "lucide-react";

// Tab "Teléfonos" (Operaciones), estilo Maven (header + Tabs + KpiCards como Panel de control).
// Subtabs Dashboard + Dispositivos (gateables por rol). El teléfono abre en una ventana flotante
// always-on-top (Picture-in-Picture, Chrome). El tamaño es ADAPTATIVO a la resolución de cada
// pantalla: el Android llena el alto disponible (clave en monitores bajos tipo 1366×768) y se
// recentra en cada resize, sin cortarse ni dejar blanco. Fallback in-page si no hay PiP. Control
// de tiempo: countdown 20min + auto-cierre + latido (timers dentro de la ventanita).

type Phone = {
  id: string;
  serial_name?: string;
  serial_no?: string;
  status?: number;
  remark?: string;
  usecase_name?: string;
  assigned_to?: string[]; // varios asignados por teléfono
  session?: { userId: string | null; secondsLeft?: number; user_name?: string | null } | null;
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

// Tamaño LÓGICO del teléfono: 420×680. Ancho 420 → geelark muestra su toolbar lateral;
// alto 680 → el Android entra COMPLETO (nav bar incluida). El iframe se renderiza SIEMPRE a
// este tamaño fijo y se ESCALA (zoom, ver fit()) para entrar en la ventana → en pantallas
// bajas (720p) se ve todo más chico pero NUNCA se corta abajo. (Antes el iframe se estiraba
// al aspecto y en pantallas bajas recortaba el Android / no se podía agrandar la ventana.)
const PHONE_W = 420;
const PHONE_H = 680;
const PHONE_BAR = 34;
const MAX_SECONDS = 20 * 60;
const fmt = (s: number) => {
  const m = Math.floor(Math.max(0, s) / 60);
  const sec = Math.max(0, s) % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
};
const cp = (action: string, extra: Record<string, unknown> = {}) =>
  supabase.functions.invoke("cloudphone", { body: { action, ...extra } });

export default function TelefonosPage() {
  const { toast } = useToast();
  const { canAccess } = usePermissions();
  const canDash = canAccess("Telefonos", "Dashboard");
  const canDevices = canAccess("Telefonos", "Dispositivos");
  const [tab, setTab] = useState<string>(canDash ? "dashboard" : "dispositivos");

  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [phones, setPhones] = useState<Phone[]>([]);
  const [users, setUsers] = useState<Usr[]>([]);
  const [opening, setOpening] = useState<string | null>(null);
  const [active, setActive] = useState<{ id: string; name: string; url: string } | null>(null);
  const [secsLeft, setSecsLeft] = useState(MAX_SECONDS);
  const [usage, setUsage] = useState<{ byUser: UsageRow[]; recent: RecentRow[] } | null>(null);

  const warnedRef = useRef(false);
  const closeRef = useRef<() => void>(() => {});
  const mountedRef = useRef(true);
  const loadRef = useRef<() => void>(() => {});
  useEffect(() => () => { mountedRef.current = false; }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await cp("list");
    if (!mountedRef.current) return;
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
      const { data: u } = await cp("users");
      const ur = u as { ok?: boolean; users?: Usr[] } | null;
      if (mountedRef.current && ur?.ok && ur.users) setUsers(ur.users);
      const { data: us } = await cp("usage");
      const usr = us as { ok?: boolean; byUser?: UsageRow[]; recent?: RecentRow[] } | null;
      if (mountedRef.current && usr?.ok) setUsage({ byUser: usr.byUser ?? [], recent: usr.recent ?? [] });
    }
  }, [toast]);
  loadRef.current = load;

  useEffect(() => {
    load();
  }, [load]);

  // ── Ventana flotante always-on-top (Document Picture-in-Picture). Timers/latido viven en la ventana PiP.
  // deno-lint-ignore no-explicit-any
  const mountPipPhone = (pip: any, id: string, name: string, url: string, initialSecs: number) => {
    const doc = pip.document;
    doc.body.replaceChildren();
    doc.body.style.cssText = "margin:0;background:#000;font-family:system-ui,-apple-system,sans-serif;overflow:hidden;display:flex;flex-direction:column;height:100vh";

    const bar = doc.createElement("div");
    bar.style.cssText =
      `display:flex;align-items:center;justify-content:space-between;gap:8px;height:${PHONE_BAR}px;padding:0 8px;background:#111;color:#fff;box-sizing:border-box`;
    const titleEl = doc.createElement("div");
    titleEl.textContent = name;
    titleEl.style.cssText = "font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
    const right = doc.createElement("div");
    right.style.cssText = "display:flex;align-items:center;gap:6px;flex:none";
    const clock = doc.createElement("span");
    clock.style.cssText = "font-size:12px;font-variant-numeric:tabular-nums;color:#9ca3af;min-width:38px;text-align:right";
    const extendBtn = doc.createElement("button");
    extendBtn.textContent = "+20";
    extendBtn.title = "Extender 20 min";
    extendBtn.style.cssText = "background:#374151;color:#fff;border:0;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:12px";
    const closeBtn = doc.createElement("button");
    closeBtn.textContent = "Cerrar";
    closeBtn.style.cssText = "background:#dc2626;color:#fff;border:0;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:12px;font-weight:600";
    right.append(clock, extendBtn, closeBtn);
    bar.append(titleEl, right);
    doc.body.append(bar);

    // Escenario: ocupa todo el alto bajo la barra y CENTRA el teléfono. El
    // iframe se dimensiona por JS (fit) con el aspecto fijo del teléfono → nunca
    // se corta ni deja blanco; si la ventana es más ancha, sobran barras negras.
    const stage = doc.createElement("div");
    stage.style.cssText =
      "flex:1 1 auto;min-height:0;display:flex;align-items:center;justify-content:center;background:#000;overflow:hidden";
    doc.body.append(stage);

    const frame = doc.createElement("iframe");
    frame.src = url;
    frame.allow = "clipboard-read; clipboard-write; microphone; camera; autoplay";
    frame.style.cssText = "display:block;border:0;background:#000";
    stage.append(frame);

    // El iframe se renderiza a un tamaño LÓGICO FIJO (PHONE_W×PHONE_H) donde geelark muestra
    // la toolbar lateral + el teléfono completo (nav bar incluida), y se ESCALA (zoom) para
    // entrar en la ventana. Así NUNCA se corta abajo: en pantallas bajas se ve todo más chico,
    // no recortado. Se recalcula en cada resize → se adapta a cualquier resolución y a que el
    // usuario arrastre la ventana.
    frame.style.height = PHONE_H + "px";
    frame.style.transformOrigin = "center center";
    const fit = () => {
      const availW = pip.innerWidth;
      const availH = pip.innerHeight - PHONE_BAR;
      if (availW <= 0 || availH <= 0) return;
      // Alto BLOQUEADO al teléfono completo (PHONE_H, nav bar incluida); ancho ELÁSTICO:
      // si la ventana es más ancha que teléfono+sidebar, geelark recibe ese ancho extra
      // (logical) para desplegar sus paneles (Upload/Export/Cámara) SIN cortarlos. Para ver
      // un panel: ENSANCHÁ la ventana arrastrando el borde. El zoom mantiene todo a escala.
      const scale = Math.min(availW / PHONE_W, availH / PHONE_H);
      frame.style.width = Math.max(PHONE_W, Math.round(availW / scale)) + "px";
      frame.style.transform = `scale(${scale})`;
    };
    fit();
    pip.addEventListener("resize", fit);

    let secs = initialSecs;
    let warned = false;
    let closed = false;
    const paint = () => {
      clock.textContent = fmt(secs);
      clock.style.color = secs <= 120 ? "#f87171" : "#9ca3af";
    };
    paint();

    const closePhone = async () => {
      if (closed) return;
      closed = true;
      try { pip.close(); } catch { /* ya cerrada */ }
      if (mountedRef.current) setPhones((prev) => prev.map((x) => (x.id === id ? { ...x, session: null } : x)));
      try { await cp("stop", { profileId: id }); } catch { /* noop */ }
      if (mountedRef.current) loadRef.current();
    };

    const tick = pip.setInterval(() => {
      secs -= 1;
      if (secs <= 120 && !warned) {
        warned = true;
        titleEl.textContent = name + " · ⚠ 2 min";
      }
      if (secs <= 0) {
        closePhone();
        return;
      }
      paint();
    }, 1000);
    const hb = pip.setInterval(() => {
      cp("heartbeat", { profileId: id }).catch(() => {});
    }, 60000);

    extendBtn.onclick = async () => {
      const { data } = await cp("extend", { profileId: id });
      const r = data as { ok?: boolean; secondsLeft?: number } | null;
      secs = r?.secondsLeft || MAX_SECONDS;
      warned = false;
      titleEl.textContent = name;
      paint();
    };
    closeBtn.onclick = closePhone;
    pip.addEventListener("pagehide", () => {
      pip.clearInterval(tick);
      pip.clearInterval(hb);
      closePhone();
    });
  };

  const open = async (p: Phone) => {
    setOpening(p.id);
    // deno-lint-ignore no-explicit-any
    const PiP = (window as any).documentPictureInPicture;
    // deno-lint-ignore no-explicit-any
    let pip: any = null;
    if (PiP) {
      try {
        // Adaptar al alto de la pantalla (CLAVE en resoluciones bajas): la ventana no puede ser más alta
        // que la pantalla (Chrome la topa), así que la achicamos manteniendo el aspecto del teléfono
        // (más angosta cuando hay menos alto) → el Android entra completo, NUNCA se corta.
        // Tamaño inicial ADAPTATIVO a la pantalla: el teléfono ocupa casi todo
        // el alto disponible (clave en pantallas bajas tipo 1366×768) y el ancho
        // acompaña el aspecto (sin blanco). Topado al alto Y ancho del monitor —
        // Chrome no deja la PiP más grande que la pantalla. Si igual no entra a
        // lo alto, achicamos el ancho para que el teléfono entre completo.
        const availH = (window.screen && window.screen.availHeight) || window.innerHeight || 800;
        const availW = (window.screen && window.screen.availWidth) || window.innerWidth || 400;
        let winH = Math.max(360, Math.min(PHONE_H + PHONE_BAR, availH - 48));
        let winW = Math.round((winH - PHONE_BAR) * (PHONE_W / PHONE_H));
        const maxW = Math.max(240, availW - 48);
        if (winW > maxW) {
          winW = maxW;
          winH = Math.round(winW / (PHONE_W / PHONE_H)) + PHONE_BAR;
        }
        pip = await PiP.requestWindow({ width: winW, height: winH });
        pip.document.body.style.cssText =
          "margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#000;color:#9ca3af;font-family:system-ui,sans-serif;font-size:14px";
        pip.document.body.textContent = "Iniciando teléfono…";
      } catch {
        pip = null;
      }
    }
    const { data, error } = await cp("start", { profileId: p.id, serial_name: p.serial_name });
    setOpening(null);
    const res = data as {
      ok?: boolean; url?: string; secondsLeft?: number; error?: string;
      inUse?: boolean; inUseBy?: string | null;
    } | null;
    // Lock de concurrencia: otro usuario lo tiene abierto → avisar y NO abrir.
    if (res?.inUse) {
      try { pip?.close(); } catch { /* noop */ }
      toast({
        title: "Teléfono en uso",
        description: `Lo está usando ${res.inUseBy ?? "otra persona"}. Esperá a que lo cierre para abrirlo.`,
        variant: "destructive",
      });
      return;
    }
    if (error || !res?.ok || !res.url) {
      try { pip?.close(); } catch { /* noop */ }
      toast({
        title: "No se pudo abrir el teléfono",
        description: error?.message || res?.error || "No llegó la URL",
        variant: "destructive",
      });
      return;
    }
    const secs = res.secondsLeft || MAX_SECONDS;
    if (pip) {
      mountPipPhone(pip, p.id, p.serial_name || p.id, res.url, secs);
      load();
    } else {
      warnedRef.current = false;
      setSecsLeft(secs);
      setActive({ id: p.id, name: p.serial_name || p.id, url: res.url });
    }
  };

  const close = useCallback(async () => {
    const a = active;
    setActive(null);
    if (a) {
      setPhones((prev) => prev.map((x) => (x.id === a.id ? { ...x, session: null } : x)));
      await cp("stop", { profileId: a.id });
      load();
    }
  }, [active, load]);
  closeRef.current = close;

  const extend = async () => {
    if (!active) return;
    const { data } = await cp("extend", { profileId: active.id });
    const res = data as { ok?: boolean; secondsLeft?: number } | null;
    warnedRef.current = false;
    setSecsLeft(res?.secondsLeft || MAX_SECONDS);
  };

  // Countdown + latido del fallback in-page.
  useEffect(() => {
    if (!active) return;
    const tick = setInterval(() => {
      setSecsLeft((s) => {
        const n = s - 1;
        if (n === 120 && !warnedRef.current) {
          warnedRef.current = true;
          toast({ title: "Te quedan 2 minutos", description: "Se cierra solo. Tocá Extender si seguís." });
        }
        if (n <= 0) {
          closeRef.current();
          return 0;
        }
        return n;
      });
    }, 1000);
    const hb = setInterval(() => {
      cp("heartbeat", { profileId: active.id }).catch(() => {});
    }, 60000);
    return () => {
      clearInterval(tick);
      clearInterval(hb);
    };
  }, [active, toast]);

  const userName = (id: string) => users.find((u) => u.id === id)?.full_name || id.slice(0, 8);

  const assign = async (p: Phone, userIds: string[]) => {
    const { data, error } = await cp("assign", {
      profileId: p.id,
      userIds,
      serial_name: p.serial_name,
      remark: p.remark,
    });
    const res = data as { ok?: boolean; error?: string } | null;
    if (error || !res?.ok) {
      toast({ title: "No se pudo asignar", description: error?.message || res?.error, variant: "destructive" });
      return;
    }
    setPhones((prev) => prev.map((x) => (x.id === p.id ? { ...x, assigned_to: userIds } : x)));
  };

  const lowTime = secsLeft <= 120;
  const inUseCount = phones.filter((p) => p.session).length;
  const totalMin = (usage?.byUser ?? []).reduce((a, u) => a + u.minutes, 0);
  const totalSessions = (usage?.byUser ?? []).reduce((a, u) => a + u.sessions, 0);

  const Devices = (
    loading ? (
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
                  <Badge className="bg-emerald-600 hover:bg-emerald-600 shrink-0">
                    En uso{p.session.user_name ? ` · ${p.session.user_name}` : ""}
                  </Badge>
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
                <div className="pt-2 border-t space-y-1.5">
                  <div className="text-xs text-muted-foreground">Asignados (varios; uno logueado a la vez)</div>
                  <div className="flex flex-wrap gap-1">
                    {(p.assigned_to ?? []).length === 0 ? (
                      <span className="text-xs italic text-muted-foreground">Sin asignar</span>
                    ) : (
                      (p.assigned_to ?? []).map((aid) => (
                        <Badge key={aid} variant="secondary" className="gap-1 pr-1">
                          {userName(aid)}
                          <button
                            type="button"
                            onClick={() => assign(p, (p.assigned_to ?? []).filter((x) => x !== aid))}
                            className="ml-0.5 rounded px-1 leading-none hover:bg-foreground/10"
                            title="Quitar"
                          >
                            ×
                          </button>
                        </Badge>
                      ))
                    )}
                  </div>
                  <Select value="" onValueChange={(v) => { if (v) assign(p, [...(p.assigned_to ?? []), v]); }}>
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder="+ Agregar persona" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.filter((u) => !(p.assigned_to ?? []).includes(u.id)).length === 0 ? (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">Todos asignados</div>
                      ) : (
                        users
                          .filter((u) => !(p.assigned_to ?? []).includes(u.id))
                          .map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.full_name || u.id.slice(0, 8)}
                            </SelectItem>
                          ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    )
  );

  const Dashboard = (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Teléfonos" value={phones.length} icon={Smartphone} color="bg-blue-500"
          subtitle="Total disponibles" onClick={canDevices ? () => setTab("dispositivos") : undefined} />
        <KpiCard label="En uso ahora" value={inUseCount} icon={Activity} color="bg-emerald-500"
          subtitle="Prendidos en este momento" onClick={canDevices ? () => setTab("dispositivos") : undefined} />
        <KpiCard label="Minutos" value={totalMin} icon={Clock} color="bg-violet-500" subtitle="Últimos 30 días" />
        <KpiCard label="Sesiones" value={totalSessions} icon={ListChecks} color="bg-amber-500" subtitle="Últimos 30 días" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardContent className="p-4">
          <div className="text-sm font-medium mb-2">Minutos por persona (30 días)</div>
          {!usage ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
          ) : usage.byUser.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay uso registrado.</p>
          ) : (
            <div className="space-y-1.5">
              {usage.byUser.map((u) => (
                <div key={u.user_id} className="flex items-center justify-between text-sm">
                  <span className="truncate">{u.full_name || u.user_id.slice(0, 8)}</span>
                  <span className="text-muted-foreground tabular-nums">{u.minutes} min · {u.sessions} ses.</span>
                </div>
              ))}
            </div>
          )}
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-sm font-medium mb-2">Sesiones recientes</div>
          {!usage || usage.recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin sesiones recientes.</p>
          ) : (
            <div className="space-y-1.5">
              {usage.recent.map((r, i) => (
                <div key={i} className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="truncate">{r.serial_name} · {r.full_name || "—"}</span>
                  <span className="tabular-nums">{r.minutes} min{r.end_reason && r.end_reason !== "manual" ? ` (${r.end_reason})` : ""}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent></Card>
      </div>
    </div>
  );

  return (
    <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Teléfonos</h1>
          <p className="text-sm text-muted-foreground">Operá tus teléfonos asignados sin salir de Maven.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {canDash && (
            <TabsTrigger value="dashboard">
              <LayoutDashboard className="h-4 w-4 mr-1.5" /> Dashboard
            </TabsTrigger>
          )}
          {canDevices && (
            <TabsTrigger value="dispositivos">
              <Smartphone className="h-4 w-4 mr-1.5" /> Dispositivos
            </TabsTrigger>
          )}
        </TabsList>
        {canDash && <TabsContent value="dashboard" className="mt-4">{Dashboard}</TabsContent>}
        {canDevices && <TabsContent value="dispositivos" className="mt-4">{Devices}</TabsContent>}
      </Tabs>

      {/* Fallback in-page (navegadores sin PiP). Mismo tamaño que la ventanita (muestra la toolbar de geelark). */}
      <Dialog open={!!active} onOpenChange={(o) => { if (!o) close(); }}>
        <DialogContent className="w-auto max-w-[95vw] p-0 gap-0 overflow-hidden [&>button]:hidden">
          <DialogHeader className="px-3 py-2 border-b">
            <DialogTitle className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{active?.name}</span>
              <span className="flex items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-mono ${
                    lowTime ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Clock className="h-3 w-3" />
                  {fmt(secsLeft)}
                </span>
                <Button variant="ghost" size="sm" onClick={extend} className="h-7 px-2" title="Extender 20 min">+20</Button>
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
              className="bg-black"
              style={{ height: `min(${PHONE_H}px, 80vh)`, aspectRatio: `${PHONE_W} / ${PHONE_H}`, border: 0, display: "block" }}
              allow="clipboard-read; clipboard-write; microphone; camera; autoplay"
            />
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
