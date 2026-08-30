// Parrilla de contenido — editor visual del plan semanal de promoción.
//
// Réplica editable del PDF "Parrilla de promoción · 8 días" que las managers armaban
// a mano: 8 columnas-día (arriba qué publica en IG, abajo su acción extra), código de
// colores por tipo de tarea (configurable), copys como burbujas, referencias de reels
// clicables. Exporta a PDF vía impresión (lámina apaisada). Los datos viven tipados
// (ver useParrilla.ts) → de cada guardado se derivan las tareas esperadas que
// Promolog usará para medir cumplimiento (fase futura).
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarRange, Copy, Loader2, Palette, Plus, Printer, Save, Sparkles, Trash2 } from "lucide-react";
import { type DateRange } from "react-day-picker";
import { es } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  type ContentGrid, type GridDay, type ExtraType, type GridTheme,
  DEFAULT_THEME, EXTRA_TYPE_META, proximoCiclo, useCreateWeek, useGenerateParrilla, useGridDays, useGridList, useSaveGrid, weekdayLabel,
} from "./useParrilla";

const fmtDia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

// El "hoy" de la agencia es el día-pared Bogotá, no el del navegador.
const hoyBogota = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

// Solo se linkean URLs http(s): texto libre guardado tipo javascript: no debe ser clicable.
const isHttpUrl = (u: string) => /^https?:\/\//i.test(u.trim());

const copiarCopy = (texto: string) => {
  if (!texto.trim()) return;
  navigator.clipboard.writeText(texto).then(
    () => toast.success("Copy copiado"),
    () => toast.error("No se pudo copiar"),
  );
};

const BADGE_LABEL: Record<GridDay["format_badge"], string> = {
  flyer_foto: "FLYER O FOTO",
  video_corto: "VIDEO CORTO",
};

function DayColumn({ day, theme, isToday, onChange }: {
  day: GridDay;
  theme: GridTheme;
  isToday: boolean;
  onChange: (d: GridDay) => void;
}) {
  const meta = EXTRA_TYPE_META[day.extra_type];
  const extraColor = theme[meta.colorKey];
  const topColor = day.format_badge === "video_corto" ? theme.video : theme.foto;
  const set = (patch: Partial<GridDay>) => onChange({ ...day, ...patch });

  return (
    <div
      className="parrilla-col flex w-[300px] shrink-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm"
      data-today={isToday || undefined}
      style={isToday ? { boxShadow: `0 0 0 2px ${topColor}` } : undefined}
    >
      {/* Cabecera del día */}
      <div className="px-3 pt-2 pb-1.5" style={{ borderTop: `4px solid ${topColor}` }}>
        <div className="flex items-baseline justify-between">
          <span className="flex items-center gap-1.5 text-sm font-black tracking-wide">
            {weekdayLabel(day.date)}
            {isToday && (
              <span className="print-hide rounded-full px-1.5 py-px text-[8px] font-bold text-white" style={{ backgroundColor: topColor }}>
                HOY
              </span>
            )}
          </span>
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
          <div className="flex items-center justify-between">
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Copy sugerido</p>
            <button type="button" className="print-hide text-muted-foreground hover:text-foreground" title="Copiar" onClick={() => copiarCopy(day.copy_sugerido)}>
              <Copy className="h-3 w-3" />
            </button>
          </div>
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
        <Textarea
          value={day.extra_title}
          onChange={(e) => set({ extra_title: e.target.value })}
          placeholder={meta.label}
          rows={1}
          className="mt-1 min-h-0 resize-none border-none bg-transparent px-0 py-0.5 text-sm font-black uppercase leading-tight"
        />
        <Textarea
          value={day.extra_desc}
          onChange={(e) => set({ extra_desc: e.target.value })}
          className="mt-1 min-h-[72px] resize-none border-dashed bg-transparent p-1.5 text-xs leading-snug"
        />

        {/* Copies de la acción (mañana/tarde/noche o sueltos) */}
        <div className="mt-2 space-y-1.5">
          {day.extra_items.map((it, i) => (
            <div key={i} className={`rounded-lg border bg-background/70 p-1.5${!it.label.trim() && !it.copy.trim() ? " print-hide" : ""}`}>
              <div className="flex items-center gap-1">
                <Input
                  value={it.label}
                  onChange={(e) => {
                    const items = [...day.extra_items]; items[i] = { ...it, label: e.target.value }; set({ extra_items: items });
                  }}
                  placeholder="etiqueta… (COPY X, MAÑANA, etc.)"
                  className="h-5 flex-1 border-none bg-transparent px-0 text-[9px] font-bold uppercase tracking-wide text-muted-foreground"
                />
                <button type="button" className="print-hide text-muted-foreground hover:text-foreground" title="Copiar" onClick={() => copiarCopy(it.copy)}>
                  <Copy className="h-3 w-3" />
                </button>
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
              <div key={i} className={`flex items-center gap-1 rounded-full border px-2 py-1${!r.url.trim() ? " print-hide" : ""}`} style={{ borderColor: `${extraColor}55` }}>
                <Input
                  value={r.url}
                  onChange={(e) => { const refs = [...day.refs]; refs[i] = { ...r, url: e.target.value }; set({ refs }); }}
                  placeholder="https://instagram.com/reel/…"
                  className="h-5 flex-1 border-none bg-transparent px-0 text-[10px]"
                />
                <Input
                  value={r.nicho ?? ""}
                  onChange={(e) => { const refs = [...day.refs]; refs[i] = { ...r, nicho: e.target.value }; set({ refs }); }}
                  placeholder="nicho"
                  className="h-5 w-14 shrink-0 border-none bg-transparent px-0 text-center text-[9px] font-bold uppercase"
                  style={{ color: extraColor }}
                />
                {isHttpUrl(r.url) ? (
                  <a href={r.url} target="_blank" rel="noreferrer" className="shrink-0 text-[9px] font-bold uppercase" style={{ color: extraColor }}>
                    Ver reel →
                  </a>
                ) : (
                  <span className="shrink-0 text-[9px] font-bold uppercase opacity-40" style={{ color: extraColor }}>
                    Ver reel →
                  </span>
                )}
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
  // Ref espejo de dirty: los listeners/efectos lo leen sin re-suscribirse.
  const dirtyRef = useRef(false);
  const markDirty = (v: boolean) => { dirtyRef.current = v; setDirty(v); };

  // Hidratar SOLO si no hay edición en curso: un refetch de react-query (p.ej.
  // al volver el foco desde WhatsApp) no debe pisar lo escrito sin guardar.
  useEffect(() => {
    if (dirtyRef.current) return;
    setDays(savedDays);
    setTheme(grid?.theme ?? DEFAULT_THEME);
    setFeedback(grid?.feedback ?? "");
  }, [grid?.id, savedDays]);

  // Cerrar/recargar la pestaña con cambios sin guardar pide confirmación.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  // Impresión: escala calculada para que la lámina completa (título + tablero +
  // regla) siempre quepa en el A3 apaisado — zoom sí colapsa el layout (Chromium),
  // a diferencia de transform: scale, que dejaba un hueco del alto original.
  useEffect(() => {
    const AVAIL_W = ((420 - 16) / 25.4) * 96; // A3 landscape - márgenes de @page
    const AVAIL_H = ((297 - 16) / 25.4) * 96;
    const sheet = () => document.querySelector<HTMLElement>(".parrilla-sheet");
    const before = () => {
      const el = sheet();
      if (!el) return;
      const scale = Math.min(AVAIL_W / el.scrollWidth, AVAIL_H / el.scrollHeight, 1);
      el.style.setProperty("zoom", String(scale));
    };
    const after = () => sheet()?.style.removeProperty("zoom");
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);

  // Si la semana visible incluye HOY, centrar su columna al cargar.
  useEffect(() => {
    if (daysLoading) return;
    document.querySelector('[data-today]')?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [grid?.id, daysLoading]);

  const save = useSaveGrid();
  const createWeek = useCreateWeek();
  const genIA = useGenerateParrilla();

  // Picker de "Nueva semana": rango elegido en el calendario (default: el
  // ciclo estándar lunes → lunes que sigue a la última parrilla).
  const [pickerOpen, setPickerOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>();
  const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const nDias = range?.from && range?.to ? Math.round((range.to.getTime() - range.from.getTime()) / 86400000) + 1 : 0;
  const rangoValido = nDias >= 2 && nDias <= 10;

  const abrirPicker = (open: boolean) => {
    if (open && dirtyRef.current) {
      toast.warning("Guarda los cambios de esta parrilla antes de crear una nueva");
      return;
    }
    if (open) {
      const { start, end } = proximoCiclo(grids[0] ?? null);
      setRange({ from: new Date(start + "T00:00:00"), to: new Date(end + "T00:00:00") });
    }
    setPickerOpen(open);
  };

  const crearSemana = () => {
    if (!range?.from || !range?.to) return;
    createWeek.mutate(
      { start: isoLocal(range.from), end: isoLocal(range.to), from: grid && days.length ? { grid, days } : null },
      {
        onSuccess: (id) => { setPickerOpen(false); setSelectedId(id); toast.success("Parrilla nueva creada (borrador)"); },
        onError: (e: any) => toast.error(e.message?.includes("duplicate") ? "Ya existe una parrilla que empieza ese día" : `No se pudo crear: ${e.message}`),
      },
    );
  };

  const generarConIA = () => {
    if (!grid) return;
    if (dirtyRef.current) { toast.warning("Guarda tus cambios antes de generar con IA"); return; }
    toast("La IA va a reescribir los textos de este borrador", {
      description: "Formato, franjas y referencias se conservan. Tarda ~30-60 segundos.",
      duration: 10000,
      action: {
        label: "Generar",
        onClick: () => genIA.mutate(grid.id, {
          onSuccess: (d) => toast.success(`Parrilla redactada por IA (${d.dias} días) — revisala y dale el toque humano ✍️`, {
            description: typeof d.usos_restantes === "number" ? `Te quedan ${d.usos_restantes} generaciones con IA hoy.` : undefined,
          }),
          onError: (e: any) => toast.error(`No se pudo generar: ${e.message}`),
        }),
      },
    });
  };

  const handleSave = (status?: ContentGrid["status"]) => {
    if (!grid) return;
    save.mutate(
      {
        grid: { id: grid.id, title: grid.title, status: status ?? grid.status, theme, feedback },
        days,
        expectedUpdatedAt: grid.updated_at ?? null,
      },
      {
        onSuccess: () => {
          markDirty(false);
          toast.success(status === "lista" ? "Parrilla marcada como lista ✅" : status === "borrador" ? "Parrilla devuelta a borrador" : "Parrilla guardada");
        },
        onError: (e: any) => {
          if (String(e.message).includes("conflict")) {
            toast.error("Otra persona guardó esta parrilla mientras la editabas", {
              description: "Recargá la página para ver su versión antes de volver a guardar.",
              duration: 10000,
            });
          } else {
            toast.error(`No se pudo guardar: ${e.message}`);
          }
        },
      },
    );
  };

  // Cambiar de semana con edición a medias: avisar en vez de descartar en silencio.
  const handleSelectWeek = (id: string) => {
    if (!dirtyRef.current) { setSelectedId(id); return; }
    toast.warning("Tienes cambios sin guardar en esta parrilla", {
      description: "Guardalos, o descartalos para cambiar de semana.",
      duration: 8000,
      action: { label: "Descartar y cambiar", onClick: () => { markDirty(false); setSelectedId(id); } },
    });
  };

  const statusBadge = grid?.status === "enviada"
    ? <Badge className="bg-emerald-600">enviada</Badge>
    : grid?.status === "lista"
      ? <Badge className="bg-blue-600">lista</Badge>
      : <Badge variant="secondary">borrador</Badge>;

  return (
    <div className="flex h-full flex-col">
      {/* El tablero es un DOCUMENTO: paleta clara propia (tokens light fijados acá)
          aunque la app esté en dark mode — igual en pantalla, impresión y Gotenberg. */}
      <style>{`
        .parrilla-print-area {
          --background: 0 0% 100%; --foreground: 240 10% 4%;
          --card: 0 0% 100%; --card-foreground: 240 10% 4%;
          --muted: 240 5% 96%; --muted-foreground: 240 4% 46%;
          --secondary: 240 5% 96%; --secondary-foreground: 240 6% 10%;
          --border: 240 6% 90%; --input: 240 6% 90%;
          color: hsl(240 10% 4%);
        }
        /* Los textos crecen con su contenido (nada queda recortado en pantalla ni en el PDF). */
        .parrilla-print-area textarea { field-sizing: content; overflow: hidden; }
        @media print {
          @page { size: A3 landscape; margin: 8mm; }
          body * { visibility: hidden !important; }
          .parrilla-print-area, .parrilla-print-area * { visibility: visible !important; }
          /* Sin print-color-adjust Chrome descarta los fondos y la lámina sale lavada. */
          .parrilla-print-area {
            position: absolute !important; inset: 0 !important; overflow: visible !important;
            -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
          }
          /* La escala de .parrilla-sheet la fija el listener de beforeprint (zoom
             calculado para que título + tablero + regla quepan en el A3). */
          .parrilla-board { flex-wrap: nowrap !important; }
          .parrilla-col { box-shadow: none !important; }
          .parrilla-print-area ::placeholder { color: transparent !important; }
          .parrilla-print-area svg { display: none !important; }
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
        <Select value={grid?.id ?? ""} onValueChange={handleSelectWeek}>
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
                    onChange={(e) => { setTheme({ ...theme, [key]: e.target.value }); markDirty(true); }}
                    className="h-7 w-12 cursor-pointer rounded border bg-transparent"
                  />
                </div>
              ))}
              <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => { setTheme(DEFAULT_THEME); markDirty(true); }}>
                Restaurar colores
              </Button>
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1 h-4 w-4" /> PDF
          </Button>
          {grid?.status === "borrador" && (
            <Button variant="outline" size="sm" disabled={genIA.isPending} onClick={generarConIA}>
              {genIA.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />} Generar con IA
            </Button>
          )}
          <Popover open={pickerOpen} onOpenChange={abrirPicker}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" disabled={createWeek.isPending}>
                <Plus className="mr-1 h-4 w-4" /> Nueva semana
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3" align="end">
              <p className="text-xs font-semibold">Elige los días de la parrilla</p>
              <p className="mb-1 text-[11px] text-muted-foreground">El ciclo estándar es lunes → lunes (8 días); puedes elegir otro rango.</p>
              <Calendar
                mode="range"
                selected={range}
                onSelect={setRange}
                defaultMonth={range?.from}
                weekStartsOn={1}
                locale={es}
              />
              <div className="mt-1 flex items-center justify-between gap-3">
                <span className="text-[11px] text-muted-foreground">
                  {range?.from && range?.to
                    ? `${nDias} días · ${fmtDia(isoLocal(range.from))} → ${fmtDia(isoLocal(range.to))}${rangoValido ? "" : " (elige de 2 a 10 días)"}`
                    : "Elige inicio y fin"}
                </span>
                <Button size="sm" disabled={!rangoValido || createWeek.isPending} onClick={crearSemana}>
                  {createWeek.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />} Crear
                </Button>
              </div>
            </PopoverContent>
          </Popover>
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
            <Button className="mt-3" size="sm" disabled={createWeek.isPending} onClick={() => createWeek.mutate({ ...proximoCiclo(null), from: null }, {
              onSuccess: (id) => setSelectedId(id),
              onError: (e: any) => toast.error(`No se pudo crear: ${e.message}`),
            })}>
              <Plus className="mr-1 h-4 w-4" /> Crear la primera semana
            </Button>
          </div>
        ) : (
          <>
            {/* La lámina completa (título + tablero + regla): es lo que se escala al imprimir. */}
            <div className="parrilla-sheet w-max min-w-full">
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
                    isToday={d.date === hoyBogota()}
                    onChange={(nd) => { setDays(days.map((x) => (x.day_index === nd.day_index ? nd : x))); markDirty(true); }}
                  />
                ))}
              </div>
              {/* Regla de ejecución (pie de la lámina, igual que el PDF) */}
              <div className="mt-1 rounded-lg border bg-background/60 px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">
                <b>Regla de ejecución</b> — <b>Instagram:</b> lenguaje limpio y no sexual, sin precios ni llamadas agresivas; el 💙 es el único código permitido. · <b>X + Telegram:</b> canal directo de venta; toda urgencia debe ser real y toda oferta activa antes de anunciarla. · <b>Sábado y domingo:</b> 3 publicaciones en Telegram (mañana, tarde y noche). · <b>Tu manager:</b> te envía el flyer y los enlaces, valida cupos y promos.
              </div>
            </div>

            {/* Revisión manual + feedback (alimenta la generación de la próxima semana) */}
            <div className="print-hide mt-4 rounded-xl border bg-card p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Revisión manual · feedback para la próxima generación</p>
              <Textarea
                value={feedback}
                onChange={(e) => { setFeedback(e.target.value); markDirty(true); }}
                placeholder="¿Qué estuvo bien y qué cambiarías de esta parrilla? (esto alimenta la generación automática de la semana siguiente)"
                className="mt-2 min-h-[64px] text-sm"
              />
              <div className="mt-2 flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">
                  {dirty ? "Cambios sin guardar" : "Sin cambios pendientes"} · el envío al grupo exige feedback (se activa en la fase de automatización)
                </p>
                {grid.status === "borrador" ? (
                  <Button size="sm" variant="secondary" disabled={save.isPending || !feedback.trim()} onClick={() => handleSave("lista")}>
                    Marcar como lista ✓
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" disabled={save.isPending} onClick={() => handleSave("borrador")}>
                    Volver a borrador
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
