// Parrilla de contenido — editor visual del plan semanal de promoción.
//
// Réplica editable del PDF "Parrilla de promoción · 8 días" que las managers armaban
// a mano: 8 columnas-día (arriba qué publica en IG, abajo su acción extra), código de
// colores por tipo de tarea (configurable), copys como burbujas, referencias de reels
// clicables. Exporta a PDF vía impresión (lámina apaisada). Los datos viven tipados
// (ver useParrilla.ts) → de cada guardado se derivan las tareas esperadas que
// Promolog usará para medir cumplimiento (fase futura).
import { useEffect, useMemo, useState } from "react";
import { CalendarRange, Loader2, Palette, Plus, Printer, Save, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  type ContentGrid, type GridDay, type ExtraType, type GridTheme,
  DEFAULT_THEME, EXTRA_TYPE_META, useCreateNextWeek, useGridDays, useGridList, useSaveGrid, weekdayLabel,
} from "./useParrilla";

const fmtDia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const BADGE_LABEL: Record<GridDay["format_badge"], string> = {
  flyer_foto: "FLYER O FOTO",
  video_corto: "VIDEO CORTO",
};

function DayColumn({ day, theme, onChange }: {
  day: GridDay;
  theme: GridTheme;
  onChange: (d: GridDay) => void;
}) {
  const meta = EXTRA_TYPE_META[day.extra_type];
  const extraColor = theme[meta.colorKey];
  const topColor = day.format_badge === "video_corto" ? theme.video : theme.foto;
  const set = (patch: Partial<GridDay>) => onChange({ ...day, ...patch });

  return (
    <div className="parrilla-col flex w-[300px] shrink-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
      {/* Cabecera del día */}
      <div className="px-3 pt-2 pb-1.5" style={{ borderTop: `4px solid ${topColor}` }}>
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-black tracking-wide">{weekdayLabel(day.date)}</span>
          <span className="text-2xl font-black opacity-15 leading-none">{String(day.day_index).padStart(2, "0")}</span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">{fmtDia(day.date)}</span>
          <Select value={day.format_badge} onValueChange={(v) => set({ format_badge: v as GridDay["format_badge"] })}>
            <SelectTrigger className="h-6 w-auto gap-1 rounded-full border px-2 text-[10px] font-bold uppercase print-plain">
              <SelectValue>{BADGE_LABEL[day.format_badge]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="flyer_foto">FLYER O FOTO</SelectItem>
              <SelectItem value="video_corto">VIDEO CORTO</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Idea + copy + franja */}
      <div className="space-y-2 px-3 pb-3">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Idea de material</p>
          <Textarea
            value={day.idea}
            onChange={(e) => set({ idea: e.target.value })}
            className="min-h-[84px] resize-none border-dashed bg-transparent p-1.5 text-xs leading-snug"
          />
        </div>
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Copy sugerido</p>
          <Textarea
            value={day.copy_sugerido}
            onChange={(e) => set({ copy_sugerido: e.target.value })}
            className="min-h-[64px] resize-none rounded-lg p-2 text-xs italic leading-snug"
            style={{ backgroundColor: `${topColor}14` }}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Franja</span>
          <Input value={day.franja} onChange={(e) => set({ franja: e.target.value })} className="h-6 flex-1 border-dashed bg-transparent px-1.5 text-[11px]" />
        </div>
      </div>

      {/* Acción extra */}
      <div className="flex-1 border-t-2 px-3 pb-3 pt-2" style={{ borderColor: extraColor, backgroundColor: `${extraColor}0d` }}>
        <div className="flex items-center justify-between gap-1">
          <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: extraColor }}>Acción extra del día</p>
          <Select value={day.extra_type} onValueChange={(v) => {
            const t = v as ExtraType;
            set({ extra_type: t, extra_title: day.extra_title || EXTRA_TYPE_META[t].label });
          }}>
            <SelectTrigger className="h-6 w-auto border-none bg-transparent px-1 text-[10px] print-hide">
              <SelectValue placeholder="tipo" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(EXTRA_TYPE_META).map(([k, m]) => (
                <SelectItem key={k} value={k}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Input
          value={day.extra_title}
          onChange={(e) => set({ extra_title: e.target.value })}
          placeholder={meta.label}
          className="mt-1 h-7 border-none bg-transparent px-0 text-sm font-black uppercase"
        />
        <Textarea
          value={day.extra_desc}
          onChange={(e) => set({ extra_desc: e.target.value })}
          className="mt-1 min-h-[72px] resize-none border-dashed bg-transparent p-1.5 text-xs leading-snug"
        />

        {/* Copies de la acción (mañana/tarde/noche o sueltos) */}
        <div className="mt-2 space-y-1.5">
          {day.extra_items.map((it, i) => (
            <div key={i} className="rounded-lg border bg-background/70 p-1.5">
              <div className="flex items-center gap-1">
                <Input
                  value={it.label}
                  onChange={(e) => {
                    const items = [...day.extra_items]; items[i] = { ...it, label: e.target.value }; set({ extra_items: items });
                  }}
                  placeholder="MAÑANA · AUDIO DE BUENOS DÍAS"
                  className="h-5 flex-1 border-none bg-transparent px-0 text-[9px] font-bold uppercase tracking-wide text-muted-foreground"
                />
                <button type="button" className="print-hide text-muted-foreground hover:text-destructive" onClick={() => set({ extra_items: day.extra_items.filter((_, j) => j !== i) })}>
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <Textarea
                value={it.copy}
                onChange={(e) => {
                  const items = [...day.extra_items]; items[i] = { ...it, copy: e.target.value }; set({ extra_items: items });
                }}
                className="mt-0.5 min-h-[40px] resize-none border-none bg-transparent p-0 text-[11px] italic leading-snug"
              />
            </div>
          ))}
          <Button variant="ghost" size="sm" className="print-hide h-6 w-full text-[10px] text-muted-foreground" onClick={() => set({ extra_items: [...day.extra_items, { label: "", copy: "" }] })}>
            <Plus className="mr-1 h-3 w-3" /> copy
          </Button>
        </div>

        {/* Referencias de reels */}
        {(day.refs.length > 0 || day.extra_type === "reel") && (
          <div className="mt-2 space-y-1">
            {day.refs.map((r, i) => (
              <div key={i} className="flex items-center gap-1 rounded-full border px-2 py-1" style={{ borderColor: `${extraColor}55` }}>
                <Input
                  value={r.url}
                  onChange={(e) => { const refs = [...day.refs]; refs[i] = { ...r, url: e.target.value }; set({ refs }); }}
                  placeholder="https://instagram.com/reel/…"
                  className="h-5 flex-1 border-none bg-transparent px-0 text-[10px]"
                />
                <a href={r.url || "#"} target="_blank" rel="noreferrer" className="shrink-0 text-[9px] font-bold uppercase" style={{ color: extraColor }}>
                  Ver reel →
                </a>
                <button type="button" className="print-hide text-muted-foreground hover:text-destructive" onClick={() => set({ refs: day.refs.filter((_, j) => j !== i) })}>
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
            <Button variant="ghost" size="sm" className="print-hide h-6 w-full text-[10px] text-muted-foreground" onClick={() => set({ refs: [...day.refs, { url: "" }] })}>
              <Plus className="mr-1 h-3 w-3" /> referencia
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ParrillaPage() {
  const { data: grids = [], isLoading: gridsLoading } = useGridList();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const grid = useMemo(() => grids.find((g) => g.id === selectedId) ?? grids[0] ?? null, [grids, selectedId]);
  const { data: savedDays = [], isLoading: daysLoading } = useGridDays(grid?.id ?? null);

  // Estado local editable (se hidrata al cambiar de parrilla).
  const [days, setDays] = useState<GridDay[]>([]);
  const [theme, setTheme] = useState<GridTheme>(DEFAULT_THEME);
  const [feedback, setFeedback] = useState("");
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    setDays(savedDays);
    setTheme(grid?.theme ?? DEFAULT_THEME);
    setFeedback(grid?.feedback ?? "");
    setDirty(false);
  }, [grid?.id, savedDays]);

  const save = useSaveGrid();
  const createWeek = useCreateNextWeek();

  const handleSave = (status?: ContentGrid["status"]) => {
    if (!grid) return;
    save.mutate(
      { grid: { id: grid.id, title: grid.title, status: status ?? grid.status, theme, feedback }, days },
      {
        onSuccess: () => { setDirty(false); toast.success(status === "lista" ? "Parrilla marcada como lista ✅" : "Parrilla guardada"); },
        onError: (e: any) => toast.error(`No se pudo guardar: ${e.message}`),
      },
    );
  };

  const statusBadge = grid?.status === "enviada"
    ? <Badge className="bg-emerald-600">enviada</Badge>
    : grid?.status === "lista"
      ? <Badge className="bg-blue-600">lista</Badge>
      : <Badge variant="secondary">borrador</Badge>;

  return (
    <div className="flex h-full flex-col">
      {/* Print: solo el tablero, apaisado */}
      <style>{`
        @media print {
          @page { size: A3 landscape; margin: 8mm; }
          body * { visibility: hidden !important; }
          .parrilla-print-area, .parrilla-print-area * { visibility: visible !important; }
          .parrilla-print-area { position: absolute !important; inset: 0 !important; overflow: visible !important; background: white !important; }
          .parrilla-board { flex-wrap: nowrap !important; transform-origin: top left; transform: scale(0.62); }
          .print-hide { display: none !important; }
          .print-plain { border: none !important; }
          textarea, input { border: none !important; box-shadow: none !important; }
        }
      `}</style>

      {/* Header */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2 print-hide">
        <CalendarRange className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-base font-bold">Parrilla de contenido</h2>
        {statusBadge}
        <Select value={grid?.id ?? ""} onValueChange={setSelectedId}>
          <SelectTrigger className="h-8 w-[260px]"><SelectValue placeholder="Semana" /></SelectTrigger>
          <SelectContent>
            {grids.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {fmtDia(g.week_start)} → {fmtDia(g.week_end)} · {g.status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm"><Palette className="mr-1 h-4 w-4" /> Tema</Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 space-y-2">
              {([["foto", "Foto / flyer"], ["video", "Video / Reel"], ["telegram", "Telegram + audios"], ["urgencia", "Urgencia"], ["base", "Fondo"], ["tinta", "Tinta"]] as Array<[keyof GridTheme, string]>).map(([key, label]) => (
                <div key={key} className="flex items-center justify-between gap-2">
                  <span className="text-xs">{label}</span>
                  <input
                    type="color"
                    value={theme[key]}
                    onChange={(e) => { setTheme({ ...theme, [key]: e.target.value }); setDirty(true); }}
                    className="h-7 w-12 cursor-pointer rounded border bg-transparent"
                  />
                </div>
              ))}
              <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => { setTheme(DEFAULT_THEME); setDirty(true); }}>
                Restaurar colores
              </Button>
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1 h-4 w-4" /> PDF
          </Button>
          <Button variant="outline" size="sm" disabled={createWeek.isPending}
            onClick={() => createWeek.mutate(grid && days.length ? { grid, days } : null, {
              onSuccess: (id) => { setSelectedId(id); toast.success("Semana nueva creada (borrador)"); },
              onError: (e: any) => toast.error(e.message?.includes("duplicate") ? "Ya existe la parrilla de esa semana" : `No se pudo crear: ${e.message}`),
            })}>
            <Plus className="mr-1 h-4 w-4" /> Nueva semana
          </Button>
          <Button size="sm" onClick={() => handleSave()} disabled={save.isPending || !grid}>
            {save.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} Guardar
          </Button>
        </div>
      </div>

      {/* Tablero */}
      <div className="parrilla-print-area flex-1 overflow-auto p-4" style={{ backgroundColor: theme.base }}>
        {gridsLoading || daysLoading ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Cargando parrilla…</p>
        ) : !grid ? (
          <div className="py-16 text-center">
            <p className="text-sm text-muted-foreground">Todavía no hay parrillas.</p>
            <Button className="mt-3" size="sm" onClick={() => createWeek.mutate(null, { onSuccess: (id) => setSelectedId(id) })}>
              <Plus className="mr-1 h-4 w-4" /> Crear la primera semana
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-baseline gap-3">
              <h1 className="text-xl font-black tracking-tight" style={{ color: theme.tinta }}>
                PARRILLA DE <span style={{ color: theme.video }}>PROMOCIÓN</span>
              </h1>
              <span className="text-xs text-muted-foreground">
                {days.length} días · {fmtDia(grid.week_start)} → {fmtDia(grid.week_end)} · contenido diario en Instagram + acción extra en Reels, Telegram y X
              </span>
            </div>
            <div className="parrilla-board flex gap-3 pb-4" style={{ minWidth: "max-content" }}>
              {days.map((d) => (
                <DayColumn
                  key={d.day_index}
                  day={d}
                  theme={theme}
                  onChange={(nd) => { setDays(days.map((x) => (x.day_index === nd.day_index ? nd : x))); setDirty(true); }}
                />
              ))}
            </div>
            {/* Regla de ejecución (pie de la lámina, igual que el PDF) */}
            <div className="mt-1 rounded-lg border bg-background/60 px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">
              <b>Regla de ejecución</b> — <b>Instagram:</b> lenguaje limpio y no sexual, sin precios ni llamadas agresivas; el 💙 es el único código permitido. · <b>X + Telegram:</b> canal directo de venta; toda urgencia debe ser real y toda oferta activa antes de anunciarla. · <b>Sábado y domingo:</b> 3 publicaciones en Telegram (mañana, tarde y noche). · <b>Tu manager:</b> te envía el flyer y los enlaces, valida cupos y promos.
            </div>

            {/* Revisión manual + feedback (alimenta la generación de la próxima semana) */}
            <div className="print-hide mt-4 rounded-xl border bg-card p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Revisión manual · feedback para la próxima generación</p>
              <Textarea
                value={feedback}
                onChange={(e) => { setFeedback(e.target.value); setDirty(true); }}
                placeholder="¿Qué estuvo bien y qué cambiarías de esta parrilla? (esto alimenta la generación automática de la semana siguiente)"
                className="mt-2 min-h-[64px] text-sm"
              />
              <div className="mt-2 flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">
                  {dirty ? "Cambios sin guardar" : "Sin cambios pendientes"} · el envío al grupo exige feedback (se activa en la fase de automatización)
                </p>
                <Button size="sm" variant="secondary" disabled={save.isPending || !feedback.trim()} onClick={() => handleSave("lista")}>
                  Marcar como lista ✓
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
