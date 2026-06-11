import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, addDays, startOfWeek, startOfMonth, isSameMonth, isToday, isAfter, startOfDay } from "date-fns";
import { ChevronLeft, ChevronRight, Check, X as XIcon, Minus, CircleDashed } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useTimezone, formatDateInTz, formatTimeInTz } from "@/hooks/useTimezone";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import PromologEntryDetailDialog from "./PromologEntryDetailDialog";
import type { PromologEntry } from "./PromologEntryCard";
import { computeDayScore, type DayScore } from "./promoScore";
import PromoQualityBar from "./PromoQualityBar";

// ── Calendario de promos por creadora ─────────────────────────────────
// Subtab que muestra, para UNA creadora y un mes/año elegidos, qué días
// promocionó (verde), cuáles no (rojo), cuáles fueron parciales (ámbar) y
// cuáles no tienen análisis del bot (gris). Click en un día abre el MISMO
// popup de detalle que el subtab "Promos" (PromologEntryDetailDialog), con
// la galería de evidencia y el veredicto editable por historia.
//
// La data NO se reusa de la query global de PromologContent (atada al
// date-range del header, default "Hoy"): este calendario hace su propia
// query acotada a creadora + mes para poder navegar a meses pasados.

interface Creator {
  id: string;
  name: string;
  artistic_name?: string | null;
  profile_photo_url?: string | null;
  instagram_handle?: string | null;
}

interface Props {
  creators: Creator[];
  // Abre el modal de edición del padre (mismo flujo que "Editar" en Promos).
  onEditEntry?: (entry: PromologEntry) => void;
}

const DAY_LABELS_ES = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];
const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

type DayStatus = "promo" | "partial" | "no" | "none";

// Igual que parseAsUtcIfNaive de useTimezone: la columna `date` es un
// timestamp sin zona (UTC). Devolvemos la fecha-calendario YYYY-MM-DD en el
// TZ del user para agrupar las stories por día correctamente.
function dayKeyInTz(input: string, tz: string): string {
  const s = String(input);
  const hasZone = /Z$|[+-]\d{2}:?\d{2}$/.test(s);
  const d = new Date(hasZone ? s : s + "Z");
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

const promotedToResult = (promoted: string | null): string => {
  switch (promoted) {
    case "true": return "Sí";
    case "false": return "No";
    case "partial": return "Parcial";
    case "pending": return "Pendiente";
    default: return "Pendiente";
  }
};

const STATUS_STYLES: Record<DayStatus, string> = {
  promo: "bg-emerald-500/10 border-emerald-500/40 hover:bg-emerald-500/20",
  partial: "bg-amber-500/10 border-amber-500/40 hover:bg-amber-500/20",
  no: "bg-red-500/10 border-red-500/40 hover:bg-red-500/20",
  none: "bg-muted/20 border-border",
};

const StatusDot = ({ status }: { status: DayStatus }) => {
  if (status === "promo") return <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white"><Check className="h-3.5 w-3.5" /></span>;
  if (status === "partial") return <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white"><Minus className="h-3.5 w-3.5" /></span>;
  if (status === "no") return <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white"><XIcon className="h-3.5 w-3.5" /></span>;
  return <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-muted-foreground"><CircleDashed className="h-3.5 w-3.5" /></span>;
};

const LegendChip = ({ status, label }: { status: DayStatus; label: string }) => (
  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
    <StatusDot status={status} />
    {label}
  </div>
);

const PromologCalendarView = ({ creators, onEditEntry }: Props) => {
  const { timezone: userTz } = useTimezone();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [creatorId, setCreatorId] = useState<string>("");
  const [cursor, setCursor] = useState<Date>(() => startOfMonth(new Date()));
  const [openDayKey, setOpenDayKey] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const year = cursor.getFullYear();
  const month = cursor.getMonth(); // 0-11
  const selectedCreator = creators.find((c) => c.id === creatorId);

  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(() => {
    const ys: number[] = [];
    for (let y = currentYear; y >= 2025; y--) ys.push(y);
    if (!ys.includes(year)) ys.push(year);
    return ys.sort((a, b) => b - a);
  }, [currentYear, year]);

  // Query: todas las entries (1 por story) de la creadora en el mes elegido.
  // Padding de ±1 día para cubrir bordes de timezone al re-agrupar por día.
  const { data: monthEntries = [], isLoading } = useQuery({
    queryKey: ["promolog-calendar", creatorId, year, month, userTz],
    enabled: !!creatorId,
    queryFn: async () => {
      const rangeStart = format(addDays(new Date(year, month, 1), -1), "yyyy-MM-dd");
      const rangeEnd = format(addDays(new Date(year, month + 1, 1), 1), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("promolog_entries")
        .select("id, date, promoted, platform, network, ticket_number, notes, action_taken, has_buy_link, buy_link_type, reviewed_by, evidence_url, ai_confidence, ai_reasoning, story_index, story_count, apify_run_id, analyzed_by_ai, creator_id")
        .eq("creator_id", creatorId)
        .gte("date", rangeStart)
        .lt("date", rangeEnd)
        .order("story_index", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Mapea una entry cruda al shape PromologEntry que usa el popup/galería.
  const mapEntry = (e: any): PromologEntry => ({
    id: e.id,
    ticketNumber: e.ticket_number || "",
    name: selectedCreator?.artistic_name || selectedCreator?.name || "",
    handle: selectedCreator?.instagram_handle || undefined,
    network: (e.network || "").toLowerCase(),
    platform: e.platform || "OnlyFans",
    result: promotedToResult(e.promoted),
    date: formatDateInTz(e.date, userTz),
    time: formatTimeInTz(e.date, userTz),
    agent: "AI Agent",
    notes: e.notes || "",
    creator_id: e.creator_id,
    rawDate: e.date,
    reviewed_by: e.reviewed_by || undefined,
    action_taken: e.action_taken ?? null,
    evidence_url: e.evidence_url ?? null,
    buy_link_type: e.buy_link_type ?? null,
    has_buy_link: e.has_buy_link === true,
    ai_reasoning: e.ai_reasoning ?? null,
    ai_confidence: e.ai_confidence != null ? Number(e.ai_confidence) : null,
    analyzed_by_ai: e.analyzed_by_ai === true,
    story_index: e.story_index != null ? Number(e.story_index) : null,
    story_count: e.story_count != null ? Number(e.story_count) : null,
    apify_run_id: e.apify_run_id ?? null,
  });

  // Agrupa las stories por día (key YYYY-MM-DD en TZ del user).
  const dayMap = useMemo(() => {
    const map = new Map<string, { total: number; trueCount: number; partialCount: number; raw: any[] }>();
    for (const e of monthEntries as any[]) {
      const key = dayKeyInTz(e.date, userTz);
      if (!key) continue;
      const bucket = map.get(key) ?? { total: 0, trueCount: 0, partialCount: 0, raw: [] };
      bucket.total += 1;
      if (e.promoted === "true") bucket.trueCount += 1;
      else if (e.promoted === "partial") bucket.partialCount += 1;
      bucket.raw.push(e);
      map.set(key, bucket);
    }
    return map;
  }, [monthEntries, userTz]);

  // Score de calidad por día (peso×calidad por red) desde las entries crudas del bucket.
  const dayScores = useMemo(() => {
    const m = new Map<string, DayScore>();
    for (const [key, bucket] of dayMap.entries()) {
      m.set(
        key,
        computeDayScore(
          bucket.raw.map((e: any) => ({
            network: (e.network || "").toLowerCase(),
            promoted: e.promoted === "true",
            partial: e.promoted === "partial",
            ai_reasoning: e.ai_reasoning,
            has_buy_link: e.has_buy_link === true,
            ai_confidence: e.ai_confidence != null ? Number(e.ai_confidence) : null,
          })),
        ),
      );
    }
    return m;
  }, [dayMap]);

  const statusFor = (bucket?: { total: number; trueCount: number; partialCount: number }): DayStatus => {
    if (!bucket || bucket.total === 0) return "none";
    if (bucket.trueCount > 0) return "promo";
    if (bucket.partialCount > 0) return "partial";
    return "no";
  };

  // Datos del popup del día abierto — reactivo a `dayMap` para que al cambiar
  // un veredicto y refrescar, la galería + el resultado del día se actualicen.
  const dialogData = useMemo(() => {
    if (!openDayKey) return null;
    const bucket = dayMap.get(openDayKey);
    if (!bucket || bucket.raw.length === 0) return null;
    // La galería muestra TODAS las fotos del día (historias del bot + fotos
    // manuales JUNTAS), para que coincida con el contador X/Y de la celda. Dedup
    // seguro: bot por run+índice (un re-run del webhook puede duplicar una story);
    // manuales nunca se dedupean entre sí (cada foto = fila propia). Solo entran
    // las filas con foto.
    const all = bucket.raw.map(mapEntry);
    const seen = new Map<string, PromologEntry>();
    for (const s of all) {
      if (!s.evidence_url) continue;
      const key = s.apify_run_id && s.story_index != null ? `${s.apify_run_id}:${s.story_index}` : `id:${s.id}`;
      const prev = seen.get(key);
      if (!prev || (!prev.evidence_url && s.evidence_url)) seen.set(key, s);
    }
    const stories = [...seen.values()].sort((a, b) => (a.story_index ?? 1e9) - (b.story_index ?? 1e9));
    const rep = all.find((s) => s.result === "Sí") ?? all[0];
    // El resultado del día refleja TODAS las entries del día (no solo la galería).
    const dayResult = all.some((s) => s.result === "Sí")
      ? "Sí"
      : all.some((s) => s.result === "No")
      ? "No"
      : rep?.result ?? "Pendiente";
    // Agrupado POR RED para que el popup muestre una sección por red (igual que el
    // subtab Promos) — así queda claro de qué red es cada screenshot.
    const NET_ORDER = ["instagram", "telegram", "x", "twitter", "tiktok", "facebook", "reddit", "youtube"];
    const byNet = new Map<string, PromologEntry[]>();
    for (const s of all) {
      const net = (s.network || "otra").toLowerCase();
      const a = byNet.get(net);
      if (a) a.push(s); else byNet.set(net, [s]);
    }
    const dayNetworks = [...byNet.entries()].map(([network, netAll]) => {
      const seenN = new Map<string, PromologEntry>();
      for (const s of netAll) {
        if (!s.evidence_url) continue;
        const key = s.apify_run_id && s.story_index != null ? `${s.apify_run_id}:${s.story_index}` : `id:${s.id}`;
        const prev = seenN.get(key);
        if (!prev || (!prev.evidence_url && s.evidence_url)) seenN.set(key, s);
      }
      return {
        network,
        stories: [...seenN.values()].sort((a, b) => (a.story_index ?? 1e9) - (b.story_index ?? 1e9)),
        promoted: netAll.some((s) => s.result === "Sí"),
      };
    }).sort((a, b) => {
      const ia = NET_ORDER.indexOf(a.network), ib = NET_ORDER.indexOf(b.network);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    return { rep, stories, dayResult, dayNetworks };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openDayKey, dayMap, selectedCreator, userTz]);

  // 6 semanas (42 celdas) arrancando el lunes de la semana del día 1.
  const gridDays = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [cursor]);

  const today = startOfDay(new Date());

  const monthSummary = useMemo(() => {
    let promo = 0, partial = 0, no = 0, none = 0;
    for (const d of gridDays) {
      if (!isSameMonth(d, cursor) || isAfter(startOfDay(d), today)) continue;
      const st = statusFor(dayMap.get(format(d, "yyyy-MM-dd")));
      if (st === "promo") promo++;
      else if (st === "partial") partial++;
      else if (st === "no") no++;
      else none++;
    }
    return { promo, partial, no, none };
  }, [gridDays, dayMap, cursor, today]);

  // Promedio de calidad del mes = promedio de los scores diarios de los días ESCANEADOS
  // (los días sin análisis no diluyen el número).
  const monthAvgScore = useMemo(() => {
    let sum = 0, n = 0;
    for (const d of gridDays) {
      if (!isSameMonth(d, cursor) || isAfter(startOfDay(d), today)) continue;
      const key = format(d, "yyyy-MM-dd");
      if (!dayMap.get(key)) continue; // solo días con registro
      sum += dayScores.get(key)?.score ?? 0;
      n++;
    }
    return n > 0 ? sum / n : null;
  }, [gridDays, dayScores, dayMap, cursor, today]);

  const goPrev = () => setCursor(new Date(year, month - 1, 1));
  const goNext = () => setCursor(new Date(year, month + 1, 1));

  // Override manual del veredicto de una historia (igual que en Promos):
  // persiste `promoted`, marca review humano y refresca el calendario + la
  // query global para que ambos reflejen el cambio.
  const handleSetVerdict = async (story: PromologEntry, verdict: "Sí" | "No") => {
    if (story.result === verdict) return;
    setSavingId(story.id);
    const { error } = await supabase
      .from("promolog_entries")
      .update({ promoted: verdict === "Sí" ? "true" : "false", reviewed_by: user?.id })
      .eq("id", story.id);
    setSavingId(null);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["promolog-calendar"] });
    queryClient.invalidateQueries({ queryKey: ["promolog-entries"] });
  };

  return (
    <div className="flex-1 min-h-0 overflow-auto p-6 space-y-4">
      {/* Controles: creadora + mes/año */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={creatorId || undefined} onValueChange={setCreatorId}>
          <SelectTrigger className="w-[260px] h-10">
            <SelectValue placeholder="Seleccioná una creadora…" />
          </SelectTrigger>
          <SelectContent>
            {creators.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.artistic_name || c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={goPrev} aria-label="Mes anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Select value={String(month)} onValueChange={(v) => setCursor(new Date(year, Number(v), 1))}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTHS_ES.map((m, i) => (
                <SelectItem key={i} value={String(i)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setCursor(new Date(Number(v), month, 1))}>
            <SelectTrigger className="w-[100px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={goNext} aria-label="Mes siguiente">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!creatorId ? (
        <Card className="flex flex-col items-center justify-center gap-2 py-20 text-center">
          <CircleDashed className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Seleccioná una creadora para ver su calendario de promos.</p>
        </Card>
      ) : (
        <>
          {/* Encabezado: creadora + resumen + leyenda */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={selectedCreator?.profile_photo_url || undefined} />
                <AvatarFallback>{(selectedCreator?.artistic_name || selectedCreator?.name || "?").charAt(0)}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-semibold leading-tight">{selectedCreator?.artistic_name || selectedCreator?.name}</p>
                <p className="text-xs text-muted-foreground">
                  {MONTHS_ES[month]} {year} ·{" "}
                  <span className="font-semibold text-foreground">
                    {monthAvgScore != null ? `${Math.round(monthAvgScore * 100)}% calidad` : "— calidad"}
                  </span>{" "}
                  · {monthSummary.promo} promocionó · {monthSummary.no} no · {monthSummary.none} sin análisis
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <LegendChip status="promo" label="Promocionó" />
              <LegendChip status="partial" label="Parcial" />
              <LegendChip status="no" label="No promocionó" />
              <LegendChip status="none" label="Sin análisis" />
            </div>
          </div>

          {/* Grid del calendario */}
          <Card className="overflow-hidden p-0">
            <div className="grid grid-cols-7 border-b border-border bg-muted/30">
              {DAY_LABELS_ES.map((d) => (
                <div key={d} className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {gridDays.map((d, i) => {
                const inMonth = isSameMonth(d, cursor);
                const key = format(d, "yyyy-MM-dd");
                const bucket = dayMap.get(key);
                const future = isAfter(startOfDay(d), today);
                const status: DayStatus = inMonth && !future ? statusFor(bucket) : "none";
                // Clickeable si hay CUALQUIER entry ese día (antes exigía una de IA →
                // los días de solo promos manuales no abrían).
                const clickable = inMonth && !!bucket && bucket.total > 0;
                return (
                  <button
                    type="button"
                    key={i}
                    disabled={!clickable}
                    onClick={() => setOpenDayKey(key)}
                    className={cn(
                      "relative flex min-h-[84px] flex-col border-b border-r border-border p-2 text-left transition-colors",
                      i % 7 === 0 && "border-l",
                      !inMonth && "bg-muted/10 text-muted-foreground/40",
                      inMonth && !future && STATUS_STYLES[status],
                      inMonth && future && "bg-card",
                      clickable ? "cursor-pointer" : "cursor-default",
                      isToday(d) && "ring-2 ring-inset ring-primary/60",
                    )}
                  >
                    <span className={cn("text-sm font-medium tabular-nums", !inMonth && "opacity-50")}>
                      {d.getDate()}
                    </span>
                    {inMonth && !future && status !== "none" && (
                      <div className="mt-auto flex flex-col gap-1">
                        <div className="flex items-center justify-between gap-1">
                          <StatusDot status={status} />
                          {bucket && bucket.total > 0 && (
                            <span className="text-[10px] tabular-nums text-muted-foreground">
                              {bucket.trueCount + bucket.partialCount}/{bucket.total}
                            </span>
                          )}
                        </div>
                        {dayScores.get(key) && (
                          <PromoQualityBar
                            variant="thin"
                            networks={dayScores.get(key)!.networks}
                            score={dayScores.get(key)!.score}
                          />
                        )}
                      </div>
                    )}
                    {inMonth && !future && status === "none" && (
                      <div className="mt-auto"><StatusDot status="none" /></div>
                    )}
                  </button>
                );
              })}
            </div>
          </Card>

          {isLoading && <p className="text-center text-xs text-muted-foreground">Cargando…</p>}
        </>
      )}

      {/* Popup de detalle del día — el MISMO que el subtab Promos */}
      <PromologEntryDetailDialog
        open={!!dialogData}
        onOpenChange={(open) => !open && setOpenDayKey(null)}
        entry={dialogData?.rep ?? null}
        dayStories={dialogData?.stories ?? []}
        dayNetworks={dialogData?.dayNetworks ?? []}
        dayResult={dialogData?.dayResult ?? "Pendiente"}
        onSetVerdict={handleSetVerdict}
        savingId={savingId}
        onEdit={onEditEntry ? (e) => { setOpenDayKey(null); onEditEntry(e); } : undefined}
      />
    </div>
  );
};

export default PromologCalendarView;
