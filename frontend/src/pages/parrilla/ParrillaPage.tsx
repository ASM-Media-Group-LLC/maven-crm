// Parrilla de contenido — editor visual del plan semanal de promoción.
//
// Réplica editable del PDF "Parrilla de promoción · 8 días" que las managers armaban
// a mano: 8 columnas-día (arriba qué publica en IG, abajo su acción extra), código de
// colores por tipo de tarea (configurable), copys como burbujas, referencias de reels
// clicables. Exporta a PDF vía impresión (lámina apaisada). Los datos viven tipados
// (ver useParrilla.ts) → de cada guardado se derivan las tareas esperadas que
// Promolog usará para medir cumplimiento (fase futura).
//
// IDIOMA: la LÁMINA (.parrilla-sheet: días, formato, "Idea de material", "Copy
// sugerido", "Franja", "Acción extra del día", título y "Regla de ejecución") es
// el documento que se imprime a PDF y se manda al grupo Managers; lo leen las
// creadoras, en español. Es la misma que arma parrilla-weekly/html.ts para el
// envío automático. Por eso esos rótulos quedan en español aunque la app esté en
// inglés. Lo que NO se imprime (botones, placeholders, el badge HOY, toasts y los
// paneles de feedback y excepciones) sí va por t().
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, CalendarRange, Copy, Loader2, Palette, Plus, Printer, Save, Send, Sparkles, Trash2 } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { type DateRange } from "react-day-picker";
import { useFormato } from "@/hooks/useFormato";
import { useLanguage } from "@/hooks/useLanguage";
import { traducir, type TranslationKey } from "@/lib/i18n";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/ui/page-header";
import { toast } from "sonner";
import { useGridExemptions, useAddExemption, useRemoveExemption, useActiveCreatorsLite, useEnviarParrilla } from "./useParrilla";
import {
  type ContentGrid, type GridDay, type ExtraType, type GridTheme,
  DEFAULT_THEME, EXTRA_TYPE_META, proximoCiclo, useCreateWeek, useGenerateParrilla, useGridDays, useGridList, useSaveGrid, useSetWeekStart, weekdayLabel,
} from "./useParrilla";

const fmtDia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

// El "hoy" de la agencia es el día-pared Bogotá, no el del navegador.
const hoyBogota = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

// Solo se linkean URLs http(s): texto libre guardado tipo javascript: no debe ser clicable.
const isHttpUrl = (u: string) => /^https?:\/\//i.test(u.trim());

// Fuera de un componente: el aviso se arma en el momento, con traducir().
const copiarCopy = (texto: string) => {
  if (!texto.trim()) return;
  navigator.clipboard.writeText(texto).then(
    () => toast.success(traducir("grid.copied")),
    () => toast.error(traducir("common.couldNotCopy")),
  );
};

// Estado de la parrilla: la llave es el valor guardado en content_grids.status.
const ETIQUETA_ESTADO: Record<ContentGrid["status"], TranslationKey> = {
  borrador: "grid.status.borrador",
  lista: "grid.status.lista",
  enviada: "grid.status.enviada",
};

// El formato del día como se imprime en la lámina (documento: en español).
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
  const { t } = useLanguage();
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
                {t("grid.today")}
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
            <button type="button" className="print-hide text-muted-foreground hover:text-foreground" title={t("common.copy")} onClick={() => copiarCopy(day.copy_sugerido)}>
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
        {/* Franja ESTRUCTURADA (inicio/fin): es lo que Promolog verificará (F4) con
            ±2 h de tolerancia. El texto "HH:MM - HH:MM" se regenera al guardar. */}
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Franja</span>
          <Input
            type="time"
            value={day.franja_start ?? ""}
            onChange={(e) => set({ franja_start: e.target.value || null, franja: e.target.value && day.franja_end ? `${e.target.value} - ${day.franja_end}` : day.franja })}
            className="h-6 w-[82px] border-dashed bg-transparent px-1 text-[11px] print-hide"
          />
          <span className="text-[10px] text-muted-foreground print-hide">{t("grid.timeTo")}</span>
          <Input
            type="time"
            value={day.franja_end ?? ""}
            onChange={(e) => set({ franja_end: e.target.value || null, franja: day.franja_start && e.target.value ? `${day.franja_start} - ${e.target.value}` : day.franja })}
            className="h-6 w-[82px] border-dashed bg-transparent px-1 text-[11px] print-hide"
          />
          {/* Solo impresión: el texto plano de la franja */}
          <span className="hidden print:inline text-[11px]">{day.franja}</span>
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
              <SelectValue placeholder={t("grid.extraTypePh")} />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(EXTRA_TYPE_META).map(([k, m]) => (
                <SelectItem key={k} value={k}>{t(m.clave)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Textarea
          value={day.extra_title}
          onChange={(e) => set({ extra_title: e.target.value })}
          placeholder={t(meta.clave)}
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
                  placeholder={t("grid.itemLabelPh")}
                  className="h-5 flex-1 border-none bg-transparent px-0 text-[9px] font-bold uppercase tracking-wide text-muted-foreground"
                />
                <button type="button" className="print-hide text-muted-foreground hover:text-foreground" title={t("common.copy")} onClick={() => copiarCopy(it.copy)}>
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
            <Plus className="mr-1 h-3 w-3" /> {t("grid.addCopy")}
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
                  placeholder={t("grid.nichePh")}
                  className="h-5 w-14 shrink-0 border-none bg-transparent px-0 text-center text-[9px] font-bold uppercase"
                  style={{ color: extraColor }}
                />
                {/* "Ver reel" es rótulo de la lámina (va impreso), aunque la fila
                    vacía no se imprima: data-lamina lo marca como documento. */}
                {isHttpUrl(r.url) ? (
                  <a href={r.url} target="_blank" rel="noreferrer" data-lamina className="shrink-0 text-[9px] font-bold uppercase" style={{ color: extraColor }}>
                    Ver reel →
                  </a>
                ) : (
                  <span data-lamina className="shrink-0 text-[9px] font-bold uppercase opacity-40" style={{ color: extraColor }}>
                    Ver reel →
                  </span>
                )}
                <button type="button" className="print-hide text-muted-foreground hover:text-destructive" onClick={() => set({ refs: day.refs.filter((_, j) => j !== i) })}>
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
            <Button variant="ghost" size="sm" className="print-hide h-6 w-full text-[10px] text-muted-foreground" onClick={() => set({ refs: [...day.refs, { url: "" }] })}>
              <Plus className="mr-1 h-3 w-3" /> {t("grid.addRef")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ParrillaPage() {
  const f = useFormato();
  const { t } = useLanguage();
  // El día de la semana FUERA de la lámina (selector de excepciones): en el idioma
  // de la pantalla. En español, el mismo de la lámina ("LUNES").
  const diaSemana = (iso: string) =>
    f.idioma === "en" ? format(new Date(iso + "T12:00:00Z"), "EEEE", { locale: f.fechas }).toUpperCase() : weekdayLabel(iso);
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

  // Excepciones por creadora (Ola 2 del compliance): quién NO se audita esta
  // semana (o un día) y por qué. Las lee F4 para no marcar incumplimientos falsos.
  const { data: exemptions = [] } = useGridExemptions(grid?.id ?? null);
  const addEx = useAddExemption();
  const removeEx = useRemoveExemption();
  const { data: activeCreators = [] } = useActiveCreatorsLite();
  const [exCreator, setExCreator] = useState("");
  const [exDay, setExDay] = useState("__all__");
  const [exMotivo, setExMotivo] = useState("");
  const agregarExcepcion = () => {
    if (!grid || !exCreator || !exMotivo.trim()) return;
    addEx.mutate(
      { grid_id: grid.id, creator_id: exCreator, day_date: exDay === "__all__" ? null : exDay, motivo: exMotivo.trim() },
      {
        onSuccess: () => { setExCreator(""); setExDay("__all__"); setExMotivo(""); toast.success(t("grid.exAdded")); },
        onError: (e: any) => toast.error(t("grid.exError", { msg: e.message })),
      },
    );
  };
  const soloLectura = grid?.status === "enviada";

  // Enviar al grupo (F2): PDF con Gotenberg + WhatsApp al grupo Managers. El permiso
  // real lo decide el servidor; acá solo se esconde si el rol lo tiene en false.
  const { explicitPermission } = usePermissions();
  const puedeEnviar = explicitPermission("Parrilla", "Enviar al grupo") !== false;
  const enviar = useEnviarParrilla();
  const enviarAlGrupo = () => {
    if (!grid) return;
    if (dirtyRef.current) { toast.warning(t("grid.saveBeforeSend")); return; }
    toast(t("grid.sendConfirm"), {
      description: t("grid.sendConfirmDesc"),
      duration: 10000,
      action: {
        label: t("common.send"),
        onClick: () => enviar.mutate(grid.id, {
          onSuccess: (d) => toast.success(d.enviado ? t("grid.sent") : t("grid.pdfOnly"), {
            description: d.pdf_url ? t("grid.pdfSaved") : undefined,
          }),
          onError: (e: any) => toast.error(t("grid.sendError", { msg: e.message })),
        }),
      },
    });
  };
  const setStart = useSetWeekStart();
  const [startPickerOpen, setStartPickerOpen] = useState(false);

  // Picker de "Nueva semana": rango elegido en el calendario (default: el
  // ciclo estándar jueves → jueves que sigue a la última parrilla).
  const [pickerOpen, setPickerOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>();
  const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const nDias = range?.from && range?.to ? Math.round((range.to.getTime() - range.from.getTime()) / 86400000) + 1 : 0;
  const rangoValido = nDias >= 2 && nDias <= 10;

  const abrirPicker = (open: boolean) => {
    if (open && dirtyRef.current) {
      toast.warning(t("grid.saveBeforeNew"));
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
        onSuccess: (id) => { setPickerOpen(false); setSelectedId(id); toast.success(t("grid.created")); },
        onError: (e: any) => toast.error(e.message?.includes("duplicate") ? t("grid.duplicate") : t("grid.createError", { msg: e.message })),
      },
    );
  };

  // Cambiar el día de inicio de la parrilla ACTUAL (solo borradores). Conserva la
  // cantidad de días; el trigger de BD corre las fechas y el contenido se mantiene.
  const abrirStartPicker = (open: boolean) => {
    if (open && dirtyRef.current) {
      toast.warning(t("grid.saveBeforeStart"));
      return;
    }
    setStartPickerOpen(open);
  };

  const cambiarInicio = (d: Date | undefined) => {
    if (!d || !grid) return;
    const start = isoLocal(d);
    if (start === grid.week_start) { setStartPickerOpen(false); return; }
    // Conservar el span (week_end - week_start) para no cambiar la cantidad de días.
    const spanDias = Math.round(
      (new Date(grid.week_end + "T12:00:00Z").getTime() - new Date(grid.week_start + "T12:00:00Z").getTime()) / 86400000,
    );
    const endD = new Date(d); endD.setDate(endD.getDate() + spanDias);
    setStart.mutate(
      { gridId: grid.id, start, end: isoLocal(endD) },
      {
        onSuccess: () => { setStartPickerOpen(false); toast.success(t("grid.startUpdated")); },
        onError: (e: any) => toast.error(
          (e?.code === "23505" || /duplicate/i.test(e?.message ?? ""))
            ? t("grid.duplicate")
            : t("grid.startError", { msg: e?.message ?? "error" }),
        ),
      },
    );
  };

  const generarConIA = () => {
    if (!grid) return;
    if (dirtyRef.current) { toast.warning(t("grid.saveBeforeAi")); return; }
    toast(t("grid.aiConfirm"), {
      description: t("grid.aiConfirmDesc"),
      duration: 10000,
      action: {
        label: t("grid.generate"),
        onClick: () => genIA.mutate(grid.id, {
          onSuccess: (d) => toast.success(t("grid.aiDone", { days: d.dias }), {
            description: typeof d.usos_restantes === "number" ? t("grid.aiLeft", { n: d.usos_restantes }) : undefined,
          }),
          onError: (e: any) => toast.error(t("grid.aiError", { msg: e.message })),
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
          toast.success(status === "lista" ? t("grid.markedReady") : status === "borrador" ? t("grid.backToDraftDone") : t("grid.saved"));
        },
        onError: (e: any) => {
          if (String(e.message).includes("conflict")) {
            toast.error(t("grid.conflict"), {
              description: t("grid.conflictDesc"),
              duration: 10000,
            });
          } else {
            toast.error(t("grid.saveError", { msg: e.message }));
          }
        },
      },
    );
  };

  // Cambiar de semana con edición a medias: avisar en vez de descartar en silencio.
  const handleSelectWeek = (id: string) => {
    if (!dirtyRef.current) { setSelectedId(id); return; }
    toast.warning(t("grid.unsaved"), {
      description: t("grid.unsavedDesc"),
      duration: 8000,
      action: { label: t("grid.discardSwitch"), onClick: () => { markDirty(false); setSelectedId(id); } },
    });
  };

  const statusBadge = grid?.status === "enviada"
    ? <Badge className="bg-emerald-600">{t(ETIQUETA_ESTADO.enviada)}</Badge>
    : grid?.status === "lista"
      ? <Badge className="bg-blue-600">{t(ETIQUETA_ESTADO.lista)}</Badge>
      : <Badge variant="secondary">{t(ETIQUETA_ESTADO.borrador)}</Badge>;

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* flex-1 min-h-0 (no h-full): la pantalla toma lo que queda debajo de la
          barra superior en vez del 100 % de la columna, que empujaba la barra. */}
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
      {/* Encabezado: el mismo aire que las demás pantallas (antes heredaba el
          py-2 de la barra compacta y quedaba pegado a la barra superior). La
          semana y su estado son el CONTEXTO de la pantalla, así que van bajo el
          título; a la derecha quedan solo los botones, en una fila. */}
      <PageHeader
        className="shrink-0 border-b px-6 pt-5 pb-4 print-hide"
        icon={<CalendarRange />}
        title={t("grid.title")}
        subtitle={
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Select value={grid?.id ?? ""} onValueChange={handleSelectWeek}>
              <SelectTrigger className="h-8 w-[260px]"><SelectValue placeholder={t("common.week")} /></SelectTrigger>
              <SelectContent>
                {grids.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {fmtDia(g.week_start)} → {fmtDia(g.week_end)} · {ETIQUETA_ESTADO[g.status] ? t(ETIQUETA_ESTADO[g.status]) : g.status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {statusBadge}
          </div>
        }
        actions={
          <>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm"><Palette className="mr-1 h-4 w-4" /> {t("grid.theme")}</Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 space-y-2">
              {([["foto", "grid.theme.foto"], ["video", "grid.theme.video"], ["telegram", "grid.theme.telegram"], ["urgencia", "grid.theme.urgencia"], ["base", "grid.theme.base"], ["tinta", "grid.theme.tinta"]] as Array<[keyof GridTheme, TranslationKey]>).map(([key, label]) => (
                <div key={key} className="flex items-center justify-between gap-2">
                  <span className="text-xs">{t(label)}</span>
                  <input
                    type="color"
                    value={theme[key]}
                    onChange={(e) => { setTheme({ ...theme, [key]: e.target.value }); markDirty(true); }}
                    className="h-7 w-12 cursor-pointer rounded border bg-transparent"
                  />
                </div>
              ))}
              <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => { setTheme(DEFAULT_THEME); markDirty(true); }}>
                {t("grid.resetColors")}
              </Button>
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1 h-4 w-4" /> PDF
          </Button>
          {grid?.status === "borrador" && (
            <Button variant="outline" size="sm" disabled={genIA.isPending} onClick={generarConIA}>
              {genIA.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />} {t("grid.generateAi")}
            </Button>
          )}
          {grid?.status === "borrador" && (
            <Popover open={startPickerOpen} onOpenChange={abrirStartPicker}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" disabled={setStart.isPending}>
                  {setStart.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CalendarClock className="mr-1 h-4 w-4" />} {t("grid.startDay")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-3" align="end">
                <p className="text-xs font-semibold">{t("grid.changeStart")}</p>
                <p className="mb-1 text-[11px] text-muted-foreground">
                  {t("grid.changeStartHint", { n: days.length })}
                </p>
                <Calendar
                  mode="single"
                  selected={grid ? new Date(grid.week_start + "T00:00:00") : undefined}
                  onSelect={cambiarInicio}
                  defaultMonth={grid ? new Date(grid.week_start + "T00:00:00") : undefined}
                  weekStartsOn={1}
                  locale={f.fechas}
                />
              </PopoverContent>
            </Popover>
          )}
          <Popover open={pickerOpen} onOpenChange={abrirPicker}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" disabled={createWeek.isPending}>
                <Plus className="mr-1 h-4 w-4" /> {t("grid.newWeek")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3" align="end">
              <p className="text-xs font-semibold">{t("grid.pickDays")}</p>
              <p className="mb-1 text-[11px] text-muted-foreground">{t("grid.pickDaysHint")}</p>
              <Calendar
                mode="range"
                selected={range}
                onSelect={setRange}
                defaultMonth={range?.from}
                weekStartsOn={1}
                locale={f.fechas}
              />
              <div className="mt-1 flex items-center justify-between gap-3">
                <span className="text-[11px] text-muted-foreground">
                  {range?.from && range?.to
                    ? `${t("grid.rangeSummary", { n: nDias, from: fmtDia(isoLocal(range.from)), to: fmtDia(isoLocal(range.to)) })}${rangoValido ? "" : ` ${t("grid.rangeInvalid")}`}`
                    : t("grid.pickStartEnd")}
                </span>
                <Button size="sm" disabled={!rangoValido || createWeek.isPending} onClick={crearSemana}>
                  {createWeek.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />} {t("common.create")}
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          {grid && !soloLectura && puedeEnviar && (
            <Button variant="outline" size="sm" disabled={enviar.isPending} onClick={enviarAlGrupo} title={t("grid.sendTitle")}>
              {enviar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />} {t("grid.sendToGroup")}
            </Button>
          )}
          <Button size="sm" onClick={() => handleSave()} disabled={save.isPending || !grid || soloLectura} title={soloLectura ? t("grid.sentReadonly") : undefined}>
            {save.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} {t("common.save")}
          </Button>
          </>
        }
      />

      {/* Tablero */}
      <div className="parrilla-print-area flex-1 overflow-auto p-4" style={{ backgroundColor: theme.base }}>
        {gridsLoading || daysLoading ? (
          <p className="py-16 text-center text-sm text-muted-foreground">{t("grid.loading")}</p>
        ) : !grid ? (
          <div className="py-16 text-center">
            <p className="text-sm text-muted-foreground">{t("grid.empty")}</p>
            <Button className="mt-3" size="sm" disabled={createWeek.isPending} onClick={() => createWeek.mutate({ ...proximoCiclo(null), from: null }, {
              onSuccess: (id) => setSelectedId(id),
              onError: (e: any) => toast.error(t("grid.createError", { msg: e.message })),
            })}>
              <Plus className="mr-1 h-4 w-4" /> {t("grid.createFirst")}
            </Button>
          </div>
        ) : (
          <>
            {soloLectura && (
              <div className="print-hide mb-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-900">
                <b>{t("grid.sentBanner.title")}</b>{grid.sent_at ? ` ${t("grid.sentBanner.on", { date: new Date(grid.sent_at).toLocaleString(f.intl("es-CO"), { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" }) })}` : ""} {t("grid.sentBanner.body")} <b>{t("grid.backToDraft")}</b> {t("grid.sentBanner.end")}
                {grid.pdf_url && <> · <a href={grid.pdf_url} target="_blank" rel="noreferrer" className="font-semibold underline">{t("grid.viewPdf")}</a></>}
              </div>
            )}
            {/* La lámina completa (título + tablero + regla): es lo que se escala al imprimir.
                Enviada = solo lectura (la base también lo bloquea con un trigger). */}
            <div className={`parrilla-sheet w-max min-w-full${soloLectura ? " pointer-events-none select-text" : ""}`}>
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
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("grid.feedbackTitle")}</p>
              <Textarea
                value={feedback}
                onChange={(e) => { setFeedback(e.target.value); markDirty(true); }}
                placeholder={t("grid.feedbackPh")}
                className="mt-2 min-h-[64px] text-sm"
              />
              <div className="mt-2 flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">
                  {dirty ? t("grid.unsavedShort") : t("grid.noPending")} · {t("grid.feedbackRequired")}
                </p>
                {grid.status === "borrador" ? (
                  <Button size="sm" variant="secondary" disabled={save.isPending || !feedback.trim()} onClick={() => handleSave("lista")}>
                    {t("grid.markReady")}
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" disabled={save.isPending} onClick={() => handleSave("borrador")}>
                    {t("grid.backToDraft")}
                  </Button>
                )}
              </div>
            </div>

            {/* Excepciones por creadora: quién NO se audita esta semana y por qué */}
            <div className="print-hide mt-4 rounded-xl border bg-card p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("grid.exTitle")}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t("grid.exHint")}
              </p>
              {exemptions.length > 0 && (
                <ul className="mt-2 divide-y rounded-lg border">
                  {exemptions.map((ex) => {
                    const cr = activeCreators.find((c) => c.id === ex.creator_id);
                    return (
                      <li key={ex.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                        <span className="font-medium">{cr ? (cr.artistic_name || cr.name) : t("grid.exUnknownCreator")}</span>
                        <span className="text-muted-foreground">· {ex.day_date ? fmtDia(ex.day_date) : t("grid.exWholeWeek")} · {ex.motivo}</span>
                        {!soloLectura && (
                          <button type="button" className="ml-auto text-muted-foreground hover:text-destructive" onClick={() => removeEx.mutate({ id: ex.id, grid_id: ex.grid_id })} title={t("grid.exRemove")}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {!soloLectura && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Select value={exCreator || undefined} onValueChange={setExCreator}>
                    <SelectTrigger className="h-8 w-[220px] text-xs"><SelectValue placeholder={t("sales.creator")} /></SelectTrigger>
                    <SelectContent>
                      {activeCreators.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.artistic_name || c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={exDay} onValueChange={setExDay}>
                    <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">{t("grid.exWholeWeekCap")}</SelectItem>
                      {days.map((d) => (
                        <SelectItem key={d.day_index} value={d.date}>{diaSemana(d.date)} {fmtDia(d.date)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input value={exMotivo} onChange={(e) => setExMotivo(e.target.value)} placeholder={t("grid.exReasonPh")} className="h-8 w-[260px] text-xs" />
                  <Button size="sm" variant="secondary" className="h-8" disabled={!exCreator || !exMotivo.trim() || addEx.isPending} onClick={agregarExcepcion}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> {t("common.add")}
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
