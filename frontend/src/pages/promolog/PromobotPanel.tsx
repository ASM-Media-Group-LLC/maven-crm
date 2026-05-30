import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  AlertTriangle, Users, Zap,
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

const RUNS_LIMIT = 15;
const ACTIVE_POLL_MS = 15_000;

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

  useEffect(() => {
    fetchCreators();
    fetchRuns();
  }, [fetchCreators, fetchRuns]);

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
    setTimeout(fetchRuns, 800);
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

      {/* ── Corridas recientes ──────────────────────────────────────────── */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Corridas recientes</span>
            <Button size="sm" variant="ghost" onClick={fetchRuns} className="h-7 gap-1 text-xs">
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

export default PromobotPanel;
