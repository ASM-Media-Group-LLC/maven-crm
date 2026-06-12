import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Play, RefreshCw, Loader2, Search, Bot, CheckCircle2, XCircle, Clock,
  AlertTriangle, Users, Zap, DollarSign, Activity, Trash2, ScanLine,
} from "lucide-react";

// PromobotPanel — control manual del pipeline de verificación de Promolog.
// El cron diario (promolog-dispatch) corre solo; acá un admin puede:
//   1. Lanzar un análisis AHORA (todas las elegibles o un subconjunto).
//   2. Ver las corridas recientes con su estado en vivo.
// (La edición del horario del cron llega en una sección aparte que necesita
// los RPC de pg_cron — ver migración promolog_cron_admin.)
//
// El dispatch valida admin/manager/owner por JWT, así que el backend es la
// fuente de verdad de permisos; acá solo mostramos el panel a management.

interface EligibleCreator {
  id: string;
  name: string | null;
  artistic_name: string | null;
  instagram_handle: string;
}

interface DispatchRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  apify_run_id: string | null;
  creators_count: number;
  creators_succeeded: number;
  creators_failed: number;
  entries_created: number;
  cost_usd: number | null;
  dispatched_by: string | null;
  error: string | null;
  // payload guardado por el dispatch: creator_ids[i] ↔ input.usernames[i]
  // (mismo chunk, mismo orden) → permite el drill-down "qué modelos entraron".
  payload: { input?: { usernames?: string[] }; creator_ids?: string[] } | null;
}

interface PipelineHealth {
  costToday: number;
  cost7d: number;
  cost30d: number;
  runs30: number;
  runsOk30: number;
  runsBad30: number;       // timeout + failed
  zeroEntryRuns30: number; // corridas terminadas con 0 entries (desperdicio)
  wastedCost30: number;    // costo de esas corridas
  lastSuccessAt: string | null;
  scannedToday: number;    // creadoras distintas con entry hoy
}

const RUNS_LIMIT = 15;
const ACTIVE_POLL_MS = 15_000;
// El cron corre 1×/día → si la última corrida exitosa fue hace más que esto, algo se cayó.
const STALE_HOURS = 26;

// Estados que cuentan como "todavía trabajando" → mientras haya uno así,
// refrescamos la tabla cada 15s para ver cuando termina.
const ACTIVE_STATUSES = new Set(["pending", "running"]);

const statusMeta: Record<string, { label: string; variant: "success-soft" | "destructive-soft" | "warning-soft" | "secondary-soft"; Icon: typeof CheckCircle2 }> = {
  pending: { label: "Pendiente", variant: "secondary-soft", Icon: Clock },
  running: { label: "Corriendo", variant: "secondary-soft", Icon: Loader2 },
  succeeded: { label: "OK", variant: "success-soft", Icon: CheckCircle2 },
  partial: { label: "Parcial", variant: "warning-soft", Icon: AlertTriangle },
  failed: { label: "Falló", variant: "destructive-soft", Icon: XCircle },
  timeout: { label: "Timeout", variant: "destructive-soft", Icon: XCircle },
};

const fmtTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso.slice(0, 16).replace("T", " ");
  }
};

const creatorLabel = (c: EligibleCreator) =>
  c.artistic_name || c.name || c.instagram_handle;

const PromobotPanel = () => {
  const { toast } = useToast();

  const [creators, setCreators] = useState<EligibleCreator[]>([]);
  const [runs, setRuns] = useState<DispatchRun[]>([]);
  const [loadingCreators, setLoadingCreators] = useState(true);
  const [loadingRuns, setLoadingRuns] = useState(true);

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set()); // por instagram_handle

  const [launching, setLaunching] = useState(false);
  // scope del diálogo de confirmación: "all" | "selected" | null
  const [confirmScope, setConfirmScope] = useState<"all" | "selected" | null>(null);
  // corrida cuyo detalle de modelos se está viendo (drill-down de "Modelos").
  const [runModels, setRunModels] = useState<DispatchRun | null>(null);

  // Salud del pipeline (agregados de los últimos 30d de corridas + cobertura de hoy).
  const [health, setHealth] = useState<PipelineHealth | null>(null);

  // ── Fetchers ──────────────────────────────────────────────────────────────
  const fetchCreators = useCallback(async () => {
    setLoadingCreators(true);
    // (supabase as any): la vista es nueva y aún no está en los tipos generados.
    const { data, error } = await (supabase as any)
      .from("v_promolog_eligible_creators")
      .select("id, name, artistic_name, instagram_handle");
    if (error) {
      toast({ title: "Error cargando modelos", description: error.message, variant: "destructive" });
    } else {
      setCreators((data ?? []) as EligibleCreator[]);
    }
    setLoadingCreators(false);
  }, [toast]);

  const fetchRuns = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from("promolog_dispatch_runs")
      .select("id, started_at, finished_at, status, apify_run_id, creators_count, creators_succeeded, creators_failed, entries_created, cost_usd, dispatched_by, error, payload")
      .order("started_at", { ascending: false })
      .limit(RUNS_LIMIT);
    if (error) {
      toast({ title: "Error cargando corridas", description: error.message, variant: "destructive" });
    } else {
      setRuns((data ?? []) as DispatchRun[]);
    }
    setLoadingRuns(false);
  }, [toast]);

  // Agregados de salud: 30d de corridas (costo, éxito, desperdicio, última OK) +
  // cobertura de hoy (creadoras distintas con entry). Solo cubre el pipeline de IG
  // (promolog_dispatch_runs); X/Telegram/Facebook corren en sus propios crons.
  const fetchHealth = useCallback(async () => {
    const now = Date.now();
    const since30 = new Date(now - 30 * 86_400_000).toISOString();
    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);

    const { data: r } = await (supabase as any)
      .from("promolog_dispatch_runs")
      .select("started_at, finished_at, status, entries_created, cost_usd")
      .gte("started_at", since30);
    const rows = (r ?? []) as Array<{ started_at: string; finished_at: string | null; status: string; entries_created: number | null; cost_usd: number | null }>;

    const ms7 = now - 7 * 86_400_000;
    const msToday = startToday.getTime();
    const costSince = (ms: number) =>
      rows.filter((x) => new Date(x.started_at).getTime() >= ms).reduce((s, x) => s + (x.cost_usd ?? 0), 0);
    const terminal = rows.filter((x) => !ACTIVE_STATUSES.has(x.status));
    const zero = terminal.filter((x) => (x.entries_created ?? 0) === 0);
    const lastSuccessAt = rows
      .filter((x) => x.status === "succeeded" && x.finished_at)
      .map((x) => x.finished_at as string)
      .sort()
      .pop() ?? null;

    const { data: e } = await (supabase as any)
      .from("promolog_entries")
      .select("creator_id")
      .gte("created_at", startToday.toISOString());
    const scannedToday = new Set((e ?? []).map((x: any) => x.creator_id).filter(Boolean)).size;

    setHealth({
      costToday: costSince(msToday),
      cost7d: costSince(ms7),
      cost30d: costSince(now - 30 * 86_400_000),
      runs30: rows.length,
      runsOk30: rows.filter((x) => x.status === "succeeded").length,
      runsBad30: rows.filter((x) => x.status === "timeout" || x.status === "failed").length,
      zeroEntryRuns30: zero.length,
      wastedCost30: zero.reduce((s, x) => s + (x.cost_usd ?? 0), 0),
      lastSuccessAt,
      scannedToday,
    });
  }, []);

  useEffect(() => {
    fetchCreators();
    fetchRuns();
    fetchHealth();
  }, [fetchCreators, fetchRuns, fetchHealth]);

  // Auto-refresh mientras haya una corrida activa.
  const hasActiveRun = useMemo(() => runs.some((r) => ACTIVE_STATUSES.has(r.status)), [runs]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (hasActiveRun && !pollRef.current) {
      pollRef.current = setInterval(fetchRuns, ACTIVE_POLL_MS);
    } else if (!hasActiveRun && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [hasActiveRun, fetchRuns]);

  // ── Selección de modelos ────────────────────────────────────────────────
  const filteredCreators = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return creators;
    return creators.filter((c) =>
      creatorLabel(c).toLowerCase().includes(q) || c.instagram_handle.toLowerCase().includes(q),
    );
  }, [creators, search]);

  // id → creador, para resolver nombres en el drill-down de una corrida.
  const creatorsById = useMemo(() => {
    const m = new Map<string, EligibleCreator>();
    for (const c of creators) m.set(c.id, c);
    return m;
  }, [creators]);

  // Lista de modelos de la corrida abierta: zip creator_ids ↔ usernames del
  // payload. Resolvemos el nombre artístico si el creador sigue cargado; sino
  // caemos al @handle que quedó guardado en el payload (creadora ya no elegible).
  const runModelsList = useMemo(() => {
    const p = runModels?.payload;
    if (!p) return [] as Array<{ key: string; label: string; handle: string; resolved: boolean }>;
    const ids = p.creator_ids ?? [];
    const handles = p.input?.usernames ?? [];
    const n = Math.max(ids.length, handles.length);
    const out: Array<{ key: string; label: string; handle: string; resolved: boolean }> = [];
    for (let i = 0; i < n; i++) {
      const id = ids[i];
      const c = id ? creatorsById.get(id) : undefined;
      const handle = (handles[i] ?? c?.instagram_handle ?? "").replace(/^@/, "");
      out.push({
        key: id || handle || String(i),
        label: c ? creatorLabel(c) : handle ? `@${handle}` : (id ?? "—"),
        handle,
        resolved: !!c,
      });
    }
    return out;
  }, [runModels, creatorsById]);

  const toggle = (handle: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(handle)) next.delete(handle);
      else next.add(handle);
      return next;
    });
  };

  // ── Lanzar dispatch ─────────────────────────────────────────────────────
  const launch = async (scope: "all" | "selected") => {
    setConfirmScope(null);
    setLaunching(true);
    const only_handles = scope === "selected" ? Array.from(selected) : undefined;
    const { data, error } = await supabase.functions.invoke("promolog-dispatch", {
      body: { force: true, ...(only_handles ? { only_handles } : {}) },
    });
    setLaunching(false);

    if (error) {
      toast({ title: "No se pudo lanzar", description: error.message, variant: "destructive" });
      return;
    }
    if (data?.skipped) {
      toast({ title: "No se lanzó", description: data.reason ?? "Sin creadoras elegibles", variant: "destructive" });
      return;
    }
    toast({
      title: "Análisis lanzado",
      description: `${data?.creators_dispatched ?? "—"} modelo(s) en cola. Las entries aparecen cuando Apify termina y el poll reconcilia.`,
    });
    if (scope === "selected") setSelected(new Set());
    // refrescamos enseguida — la corrida arranca en "running"
    setTimeout(() => { fetchRuns(); fetchHealth(); }, 800);
  };

  const selectedCount = selected.size;
  const totalEligible = creators.length;

  return (
    <div className="space-y-4 px-6 pb-8">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Bot className="h-5 w-5 text-primary" />
        <div>
          <h2 className="text-base font-semibold leading-tight">Promobot</h2>
          <p className="text-xs text-muted-foreground">
            Control manual del análisis de stories. El cron corre 1×/día automáticamente.
          </p>
        </div>
      </div>

      {/* ── Lanzar análisis ─────────────────────────────────────────────── */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-medium">Lanzar análisis ahora</span>
              <Badge variant="secondary-soft" className="text-[10px] gap-1">
                <Users className="h-3 w-3" /> {loadingCreators ? "…" : totalEligible} elegibles
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={launching || selectedCount === 0}
                onClick={() => setConfirmScope("selected")}
              >
                {launching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Analizar seleccionadas ({selectedCount})
              </Button>
              <Button
                size="sm"
                disabled={launching || loadingCreators || totalEligible === 0}
                onClick={() => setConfirmScope("all")}
              >
                {launching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Analizar todas
              </Button>
            </div>
          </div>

          {/* Buscador + lista de modelos */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar modelo por nombre o @handle…"
              className="pl-8 h-9"
            />
          </div>

          <ScrollArea className="h-56 rounded-md border">
            {loadingCreators ? (
              <div className="flex h-full items-center justify-center py-8 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando modelos…
              </div>
            ) : filteredCreators.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Sin resultados</div>
            ) : (
              <div className="divide-y">
                {filteredCreators.map((c) => (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={selected.has(c.instagram_handle)}
                      onCheckedChange={() => toggle(c.instagram_handle)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{creatorLabel(c)}</p>
                      <p className="truncate text-xs text-muted-foreground">@{c.instagram_handle.replace(/^@/, "")}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </ScrollArea>
          <p className="text-[11px] text-muted-foreground">
            Lanzar dispara un scrape real en Apify + análisis con Gemini (tiene costo). Usa <code>force</code> — saltea el límite de 1 corrida/día.
          </p>
        </CardContent>
      </Card>

      {/* ── Salud del pipeline ──────────────────────────────────────────── */}
      {health && (() => {
        const staleH = health.lastSuccessAt
          ? (Date.now() - new Date(health.lastSuccessAt).getTime()) / 3_600_000
          : Infinity;
        const stale = staleH > STALE_HOURS;
        const usd = (n: number) => `$${n.toFixed(2)}`;
        const ago = (h: number) => (h === Infinity ? "nunca" : h < 1 ? `${Math.round(h * 60)} min` : `${Math.round(h)} h`);
        const gap = totalEligible > 0 ? totalEligible - health.scannedToday : 0;
        return (
          <Card className={stale ? "border-rose-500/40" : ""}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Salud del pipeline</span>
                <Badge variant="secondary-soft" className="text-[10px]">solo IG</Badge>
                <span className="ml-auto text-[10px] text-muted-foreground">
                  última OK: {health.lastSuccessAt ? `hace ${ago(staleH)}` : "—"}
                </span>
              </div>
              {stale && (
                <div className="flex items-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>
                    El bot no completa una corrida desde hace <b>{ago(staleH)}</b> (debería correr 1×/día).
                    Revisá el cron o lanzá una corrida manual.
                  </span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <HealthStat
                  icon={<DollarSign className="h-3.5 w-3.5" />}
                  label="Costo hoy"
                  value={usd(health.costToday)}
                  sub={`7d ${usd(health.cost7d)} · 30d ${usd(health.cost30d)}`}
                />
                <HealthStat
                  icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                  label="Corridas 30d"
                  value={`${health.runsOk30} OK`}
                  sub={health.runsBad30 > 0 ? `${health.runsBad30} con error` : "sin errores"}
                  tone={health.runsBad30 > 0 ? "bad" : "ok"}
                />
                <HealthStat
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  label="Desperdicio 30d"
                  value={`${health.zeroEntryRuns30}`}
                  sub={`corridas 0-entries · ${usd(health.wastedCost30)}`}
                  tone={health.zeroEntryRuns30 > 0 ? "warn" : "ok"}
                />
                <HealthStat
                  icon={<ScanLine className="h-3.5 w-3.5" />}
                  label="Escaneadas hoy"
                  value={`${health.scannedToday}/${totalEligible || "—"}`}
                  sub={gap > 0 ? `${gap} sin escanear` : "cobertura completa"}
                  tone={gap > 0 ? "warn" : "ok"}
                />
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* ── Corridas recientes ──────────────────────────────────────────── */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Corridas recientes</span>
            <Button size="sm" variant="ghost" onClick={() => { fetchRuns(); fetchHealth(); }} className="h-7 gap-1 text-xs">
              <RefreshCw className={`h-3.5 w-3.5 ${hasActiveRun ? "animate-spin" : ""}`} /> Refrescar
            </Button>
          </div>

          {loadingRuns ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando…
            </div>
          ) : runs.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Todavía no hay corridas</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-2 py-1.5 font-medium">Inicio</th>
                    <th className="px-2 py-1.5 font-medium">Estado</th>
                    <th className="px-2 py-1.5 font-medium">Origen</th>
                    <th className="px-2 py-1.5 text-right font-medium">Modelos</th>
                    <th className="px-2 py-1.5 text-right font-medium">Entries</th>
                    <th className="px-2 py-1.5 text-right font-medium">Costo</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => {
                    const meta = statusMeta[r.status] ?? statusMeta.pending;
                    const isActive = ACTIVE_STATUSES.has(r.status);
                    return (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="px-2 py-1.5 tabular-nums text-xs">{fmtTime(r.started_at)}</td>
                        <td className="px-2 py-1.5">
                          <Badge variant={meta.variant} className="gap-1 text-[10px]">
                            <meta.Icon className={`h-3 w-3 ${isActive && r.status === "running" ? "animate-spin" : ""}`} />
                            {meta.label}
                          </Badge>
                        </td>
                        <td className="px-2 py-1.5 text-xs text-muted-foreground">
                          {r.dispatched_by ? "Manual" : "Cron"}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {r.creators_count > 0 && (r.payload?.creator_ids?.length || r.payload?.input?.usernames?.length) ? (
                            <button
                              type="button"
                              onClick={() => setRunModels(r)}
                              className="font-medium text-primary underline-offset-2 hover:underline"
                              title="Ver qué modelos entraron en esta corrida"
                            >
                              {r.creators_count}
                            </button>
                          ) : (
                            r.creators_count
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{r.entries_created}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-xs">
                          {r.cost_usd != null ? `$${r.cost_usd.toFixed(4)}` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Confirmación de lanzamiento ──────────────────────────────────── */}
      <Dialog open={confirmScope !== null} onOpenChange={(o) => !o && setConfirmScope(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar análisis</DialogTitle>
            <DialogDescription>
              {confirmScope === "all"
                ? `Vas a lanzar el análisis de las ${totalEligible} modelos elegibles.`
                : `Vas a lanzar el análisis de ${selectedCount} modelo(s) seleccionada(s).`}
              {" "}Esto dispara un scrape en Apify + análisis con Gemini (tiene costo) y saltea el límite de 1 corrida/día.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmScope(null)}>Cancelar</Button>
            <Button onClick={() => confirmScope && launch(confirmScope)} disabled={launching}>
              {launching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Lanzar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Drill-down: modelos de una corrida ───────────────────────────── */}
      <Dialog open={runModels !== null} onOpenChange={(o) => !o && setRunModels(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modelos de la corrida</DialogTitle>
            <DialogDescription>
              {runModels
                ? `${fmtTime(runModels.started_at)} · ${runModelsList.length} modelo(s)`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {runModelsList.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              Sin detalle de modelos para esta corrida.
            </p>
          ) : (
            <ScrollArea className="max-h-80 rounded-md border">
              <div className="divide-y">
                {runModelsList.map((m) => (
                  <div key={m.key} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="truncate text-sm font-medium">{m.label}</span>
                    {m.handle && (
                      <a
                        href={`https://instagram.com/${m.handle}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-xs text-muted-foreground hover:text-primary hover:underline"
                      >
                        @{m.handle}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRunModels(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const HealthStat = ({
  icon, label, value, sub, tone = "ok",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub: string;
  tone?: "ok" | "warn" | "bad";
}) => (
  <div className="rounded-lg border border-border bg-card/40 p-2.5">
    <div className="flex items-center gap-1.5 text-muted-foreground">
      {icon}
      <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
    </div>
    <p className={`mt-0.5 text-lg font-bold tabular-nums ${tone === "bad" ? "text-rose-400" : tone === "warn" ? "text-amber-400" : ""}`}>
      {value}
    </p>
    <p className="truncate text-[10px] text-muted-foreground">{sub}</p>
  </div>
);

export default PromobotPanel;
