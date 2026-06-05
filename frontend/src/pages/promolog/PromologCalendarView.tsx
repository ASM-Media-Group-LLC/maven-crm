import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, addDays, startOfWeek, startOfMonth, isSameMonth, isToday, isAfter, startOfDay } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Check, X as XIcon, Minus, CircleDashed } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTimezone } from "@/hooks/useTimezone";
import { cn } from "@/lib/utils";
import PromologStoryGallery from "./PromologStoryGallery";
import type { PromologEntry } from "./PromologEntryCard";

// ── Calendario de promos por creadora ─────────────────────────────────
// Subtab que muestra, para UNA creadora y un mes/año elegidos, qué días
// promocionó (verde), cuáles no (rojo), cuáles fueron parciales (ámbar) y
// cuáles no tienen análisis del bot (gris). Click en un día con stories
// abre la galería de evidencia de ese día (solo lectura — la edición del
// veredicto vive en el subtab "Promos").
//
// La data NO se reusa de la query global de PromologContent (que está atada
// al date-range preset del header, default "Hoy"): este calendario hace su
// propia query acotada a creadora + mes para poder navegar a meses pasados.

interface Creator {
  id: string;
  name: string;
  artistic_name?: string | null;
  profile_photo_url?: string | null;
  instagram_handle?: string | null;
}

interface Props {
  creators: Creator[];
}

const DAY_LABELS_ES = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];
const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

type DayStatus = "promo" | "partial" | "no" | "none";

// Igual que parseAsUtcIfNaive de useTimezone: la columna `date` es un
// timestamp sin zona (UTC). Sin la "Z" el browser lo tomaría como hora
// local. Devolvemos la fecha-calendario YYYY-MM-DD en el TZ del user para
// agrupar las stories por día correctamente.
function dayKeyInTz(input: string, tz: string): string {
  const s = String(input);
  const hasZone = /Z$|[+-]\d{2}:?\d{2}$/.test(s);
  const d = new Date(hasZone ? s : s + "Z");
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d); // "2026-06-05"
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

// Estilos por estado del día (tinte de fondo + borde + color del texto).
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

const PromologCalendarView = ({ creators }: Props) => {
  const { timezone: userTz } = useTimezone();
  const [creatorId, setCreatorId] = useState<string>("");
  const [cursor, setCursor] = useState<Date>(() => startOfMonth(new Date()));
  const [dayDialog, setDayDialog] = useState<{ label: string; stories: PromologEntry[] } | null>(null);

  const year = cursor.getFullYear();
  const month = cursor.getMonth(); // 0-11

  const selectedCreator = creators.find((c) => c.id === creatorId);

  // Años disponibles en el dropdown: del 2025 hasta el año actual (el bot
  // arrancó en 2026; 2025 por las dudas). Navegar con flechas no tiene tope.
  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(() => {
    const ys: number[] = [];
    for (let y = currentYear; y >= 2025; y--) ys.push(y);
    if (!ys.includes(year)) ys.push(year); // si navegó fuera del rango, incluirlo
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
        .select("id, date, promoted, platform, network, evidence_url, ai_confidence, ai_reasoning, story_index, story_count, apify_run_id, analyzed_by_ai, creator_id")
        .eq("creator_id", creatorId)
        .gte("date", rangeStart)
        .lt("date", rangeEnd)
        .order("story_index", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Agrupar las stories por día (key YYYY-MM-DD en TZ del user).
  const dayMap = useMemo(() => {
    const map = new Map<string, { total: number; trueCount: number; partialCount: number; entries: any[] }>();
    for (const e of monthEntries as any[]) {
      const key = dayKeyInTz(e.date, userTz);
      if (!key) continue;
      const bucket = map.get(key) ?? { total: 0, trueCount: 0, partialCount: 0, entries: [] };
      bucket.total += 1;
      if (e.promoted === "true") bucket.trueCount += 1;
      else if (e.promoted === "partial") bucket.partialCount += 1;
      bucket.entries.push(e);
      map.set(key, bucket);
    }
    return map;
  }, [monthEntries, userTz]);

  const statusFor = (bucket?: { total: number; trueCount: number; partialCount: number }): DayStatus => {
    if (!bucket || bucket.total === 0) return "none";
    if (bucket.trueCount > 0) return "promo";
    if (bucket.partialCount > 0) return "partial";
    return "no";
  };

  // 6 semanas (42 celdas) arrancando el lunes de la semana del día 1.
  const gridDays = useMemo(() => {
    const first = startOfMonth(cursor);
    const gridStart = startOfWeek(first, { weekStartsOn: 1 });
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [cursor]);

  const today = startOfDay(new Date());

  // Resumen del mes (solo días del mes en curso, no futuros).
  const monthSummary = useMemo(() => {
    let promo = 0, partial = 0, no = 0, none = 0;
    for (const d of gridDays) {
      if (!isSameMonth(d, cursor)) continue;
      if (isAfter(startOfDay(d), today)) continue; // días futuros no cuentan
      const st = statusFor(dayMap.get(format(d, "yyyy-MM-dd")));
      if (st === "promo") promo++;
      else if (st === "partial") partial++;
      else if (st === "no") no++;
      else none++;
    }
    return { promo, partial, no, none };
  }, [gridDays, dayMap, cursor, today]);

  const goPrev = () => setCursor(new Date(year, month - 1, 1));
  const goNext = () => setCursor(new Date(year, month + 1, 1));

  // Abre la galería de evidencia del día clickeado (solo lectura).
  const openDay = (d: Date, bucket: { entries: any[] }) => {
    const stories: PromologEntry[] = bucket.entries
      .filter((e) => e.analyzed_by_ai === true)
      .map((e) => ({
        id: e.id,
        ticketNumber: "",
        name: selectedCreator?.artistic_name || selectedCreator?.name || "",
        network: (e.network || "").toLowerCase(),
        platform: e.platform || "OnlyFans",
        result: promotedToResult(e.promoted),
        date: format(d, "yyyy-MM-dd"),
        time: "",
        agent: "AI Agent",
        notes: "",
        creator_id: e.creator_id,
        evidence_url: e.evidence_url ?? null,
        ai_reasoning: e.ai_reasoning ?? null,
        ai_confidence: e.ai_confidence != null ? Number(e.ai_confidence) : null,
        analyzed_by_ai: e.analyzed_by_ai === true,
        story_index: e.story_index != null ? Number(e.story_index) : null,
        story_count: e.story_count != null ? Number(e.story_count) : null,
        apify_run_id: e.apify_run_id ?? null,
      })) as PromologEntry[];
    if (stories.length === 0) return;
    setDayDialog({ label: format(d, "EEEE d 'de' MMMM yyyy", { locale: es }), stories });
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
                  {MONTHS_ES[month]} {year} · {monthSummary.promo} promocionó · {monthSummary.no} no · {monthSummary.none} sin análisis
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
            {/* Cabecera de días */}
            <div className="grid grid-cols-7 border-b border-border bg-muted/30">
              {DAY_LABELS_ES.map((d) => (
                <div key={d} className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">{d}</div>
              ))}
            </div>
            {/* Celdas */}
            <div className="grid grid-cols-7">
              {gridDays.map((d, i) => {
                const inMonth = isSameMonth(d, cursor);
                const key = format(d, "yyyy-MM-dd");
                const bucket = dayMap.get(key);
                const future = isAfter(startOfDay(d), today);
                const status: DayStatus = inMonth && !future ? statusFor(bucket) : "none";
                const clickable = inMonth && !!bucket && bucket.entries.some((e) => e.analyzed_by_ai);
                return (
                  <button
                    type="button"
                    key={i}
                    disabled={!clickable}
                    onClick={() => bucket && openDay(d, bucket)}
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
                      <div className="mt-auto flex items-center justify-between gap-1">
                        <StatusDot status={status} />
                        {bucket && bucket.total > 0 && (
                          <span className="text-[10px] tabular-nums text-muted-foreground">
                            {bucket.trueCount + bucket.partialCount}/{bucket.total}
                          </span>
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

          {isLoading && (
            <p className="text-center text-xs text-muted-foreground">Cargando…</p>
          )}
        </>
      )}

      {/* Galería del día (solo lectura) */}
      <Dialog open={!!dayDialog} onOpenChange={(open) => !open && setDayDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="capitalize">{dayDialog?.label}</DialogTitle>
          </DialogHeader>
          {dayDialog && <PromologStoryGallery stories={dayDialog.stories} />}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PromologCalendarView;
