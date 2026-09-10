import { useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Eye, Facebook, Flame, MoreHorizontal, Pencil, Plus, StickyNote, Trash2, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import InstagramIcon from "@/components/icons/InstagramIcon";
import TikTokIcon from "@/components/icons/TikTokIcon";
import XIcon from "@/components/icons/XIcon";
import TelegramIcon from "@/components/icons/TelegramIcon";
import { type PromologEntry } from "./PromologEntryCard";
import PromoQualityBar from "./PromoQualityBar";
import { displayPlatform } from "./promoScore";
import { streakCreatorKey, type PromoStreak } from "./promoStreaks";

interface Props {
  entries: PromologEntry[];
  onView?: (entry: PromologEntry) => void;
  onEdit?: (entry: PromologEntry) => void;
  onDelete?: (entry: PromologEntry) => void;
  onNotesChange?: (entryId: string, notes: string | null) => void;
  onAssignAgent?: (entry: PromologEntry) => void;
  isManagement?: boolean;
  viewOnly?: boolean;
  // Orden CONTROLADO por el padre: cuando se pasa `onSort`, la tabla NO ordena
  // (asume que `entries` ya viene ordenado por el padre sobre el dataset completo
  // antes de paginar) y solo refleja el sentido del orden + reporta los clicks.
  // Sin `onSort` → cae al orden interno legacy (ordena el array recibido).
  sortKey?: SortKey;
  sortAsc?: boolean;
  onSort?: (key: SortKey) => void;
  // Rachas por creadora (#109): días CONSECUTIVOS con promo dentro del
  // rango/filtros cargados, calculadas por el padre sobre el dataset COMPLETO
  // (no el slice paginado). Con ≥3 días aparece el chip junto al nombre.
  streaks?: Map<string, PromoStreak>;
}

export type SortKey = "model" | "network" | "platform" | "result" | "agent" | "date";

const getSortValue = (entry: PromologEntry, key: SortKey): string => {
  switch (key) {
    case "model": return entry.name.toLowerCase();
    case "network": return entry.network;
    case "platform": return entry.platform;
    case "result": return entry.result;
    case "agent": return entry.agent;
    case "date": return `${entry.date} ${entry.time}`;
    default: return "";
  }
};

// Orden compartido con el padre. El padre lo aplica al dataset COMPLETO antes de
// paginar (si ordenáramos solo el slice de la página, el orden no sería global —
// las filas quedarían desparramadas entre páginas).
export const sortPromologEntries = (
  entries: PromologEntry[],
  key: SortKey,
  asc: boolean,
): PromologEntry[] =>
  [...entries].sort((a, b) => {
    const cmp = getSortValue(a, key).localeCompare(getSortValue(b, key));
    return asc ? cmp : -cmp;
  });

const NetworkIcon = ({ network }: { network: string }) => {
  switch (network) {
    case "instagram": return <InstagramIcon className="h-4 w-4" />;
    case "tiktok": return <TikTokIcon className="h-4 w-4" />;
    case "x":
    case "twitter": return <XIcon className="h-4 w-4" />;
    case "telegram": return <TelegramIcon className="h-4 w-4" />;
    case "facebook": return <Facebook className="h-4 w-4" />;
    case "reddit": return <span className="text-[11px] font-bold leading-none">R</span>;
    case "youtube": return <span className="text-[9px] font-bold leading-none">YT</span>;
    default: return null;
  }
};

const networkLabel: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  x: "X / Twitter",
  twitter: "X / Twitter",
  telegram: "Telegram",
  facebook: "Facebook",
  reddit: "Reddit",
  youtube: "YouTube",
};

const resultVariant: Record<string, "success-soft" | "destructive-soft"> = {
  "Sí": "success-soft",
  "No": "destructive-soft",
};

// Chip de racha (#109) — sobrio y SIN animación: aparece recién con 3 días
// consecutivos de promo (umbral del juez, para no premiar lo trivial) y pasa
// a dorado (token warning) desde los hitos de 7/14/30 días.
const StreakBadge = ({ streak }: { streak: number }) => {
  if (streak < 3) return null;
  const gold = streak >= 7;
  return (
    <span
      title={`Racha: ${streak} días consecutivos con promo (dentro del rango y filtros cargados)`}
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-full border px-1.5 py-px text-[10px] font-medium tabular-nums ${
        gold ? "border-warning/40 text-warning" : "border-border text-muted-foreground"
      }`}
    >
      <Flame className="h-3 w-3" aria-hidden />
      {streak} días
    </span>
  );
};

// Motivo legible del fallo de scan (para el tooltip de la fila "A revisar").
const errorReasonLabel = (r?: string | null): string => {
  const map: Record<string, string> = {
    json_parse: "La IA devolvió un veredicto ilegible — revisa la evidencia a mano.",
    openrouter_timeout: "La IA tardó demasiado (timeout) — revisa la evidencia a mano.",
    refusal: "La IA no analizó la imagen — revisa la evidencia a mano.",
  };
  if (r && map[r]) return map[r];
  return r ? `Necesita revisión manual (${r}).` : "Necesita revisión manual: la IA no pudo leer la evidencia.";
};

// Celda de notas. La versión vieja se volvía un input de UNA línea al click →
// incómodo para leer/editar notas largas. Ahora, igual que en el pipeline de
// closers (InlineText de LeadTable): preview de hasta 2 líneas y al hacer clic
// abre un Popover con un Textarea cómodo (⌘/Ctrl+Enter guarda, Esc cancela).
const InlineNotes = ({ value, onSave }: { value: string; onSave: (v: string | null) => void }) => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value || "");

  const save = () => {
    const v = text.trim();
    if (v !== (value || "")) onSave(v || null);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(o) => { if (o) setText(value || ""); setOpen(o); }} modal={true}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={value || undefined}
          className="group flex w-full max-w-[220px] items-start gap-1.5 rounded px-1.5 py-1 text-left text-sm transition-colors hover:bg-muted/60"
        >
          {value ? (
            <>
              <StickyNote className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/60" />
              <span className="line-clamp-2 leading-snug text-muted-foreground">{value}</span>
            </>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/50 group-hover:text-muted-foreground">
              <Plus className="h-3 w-3" /> Nota
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" className="w-80 p-3" onClick={(e) => e.stopPropagation()}>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
            if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
          }}
          autoFocus
          rows={5}
          placeholder="Escribe una nota…"
          className="resize-none text-sm"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">⌘/Ctrl+Enter para guardar · Esc para cancelar</span>
          <div className="flex gap-1.5">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button size="sm" className="h-7 px-2 text-xs" onClick={save}>Guardar</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

const PromologTable = ({
  entries,
  onView,
  onEdit,
  onDelete,
  onNotesChange,
  onAssignAgent,
  isManagement,
  viewOnly,
  sortKey: controlledSortKey,
  sortAsc: controlledSortAsc,
  onSort,
  streaks,
}: Props) => {
  // Orden interno LEGACY (solo se usa si el padre no controla el orden via onSort).
  const [localSortKey, setLocalSortKey] = useState<SortKey>("date");
  const [localSortAsc, setLocalSortAsc] = useState(false);

  const controlled = onSort !== undefined;
  const activeKey: SortKey | null = controlled ? (controlledSortKey ?? null) : localSortKey;
  const activeAsc = controlled ? (controlledSortAsc ?? true) : localSortAsc;

  const handleSort = (key: SortKey) => {
    if (controlled) {
      onSort!(key);
      return;
    }
    if (localSortKey === key) {
      setLocalSortAsc(!localSortAsc);
    } else {
      setLocalSortKey(key);
      setLocalSortAsc(true);
    }
  };

  // Controlado → el padre ya ordenó el dataset completo y nos pasó la página; render tal cual.
  // No controlado → ordenamos el array recibido (legacy).
  const rows = controlled
    ? entries
    : sortPromologEntries(entries, localSortKey, localSortAsc);

  const SortHeader = ({ label, sortKeyName }: { label: string; sortKeyName: SortKey }) => {
    const isActive = activeKey === sortKeyName;
    const Icon = isActive ? (activeAsc ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <Button
        variant="ghost"
        size="sm"
        className={`h-8 -ml-3 text-xs font-medium ${isActive ? "text-primary" : ""}`}
        onClick={() => handleSort(sortKeyName)}
      >
        {label}
        <Icon className={`ml-1 h-3 w-3 ${isActive ? "opacity-100" : "opacity-50"}`} />
      </Button>
    );
  };

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead colSpan={10} className="text-center py-16 text-muted-foreground">
                <p className="text-lg font-medium">No hay entradas</p>
                <p className="text-sm">Registra una nueva entrada para comenzar</p>
              </TableHead>
            </TableRow>
          </TableHeader>
        </Table>
      </div>
    );
  }

  return (
    <Table containerClassName="overflow-visible" className="md:min-w-[1000px]">
      <TableHeader>
        <TableRow>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))] w-[50px]">#</TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="Creación" sortKeyName="date" /></TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="Modelo" sortKeyName="model" /></TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="Red Social" sortKeyName="network" /></TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="Plataforma" sortKeyName="platform" /></TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="Resultado" sortKeyName="result" /></TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]" title="Calidad de la promo del día (IG 60% · X/TG/FB ~13% c/u × calidad)">Calidad</TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="Agente" sortKeyName="agent" /></TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">Notas</TableHead>
          <TableHead className="sticky top-0 right-0 z-30 bg-card shadow-[0_1px_0_0_hsl(var(--border))] text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((entry, idx) => (
          // Click en la fila → SIEMPRE abre el detalle lindo (galería). Editar queda en "...".
          <TableRow key={entry.id} className="cursor-pointer" onClick={() => onView?.(entry)}>
            <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
              <div className="flex flex-col">
                <span>{entry.date}</span>
                <span className="text-xs">{entry.time}</span>
              </div>
            </TableCell>
            <TableCell className="min-w-[180px]">
              <div className="flex flex-col">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <span className="truncate">{entry.name}</span>
                  <StreakBadge streak={streaks?.get(streakCreatorKey(entry))?.streak ?? 0} />
                </span>
                {entry.handle && (
                  <span className="text-xs text-muted-foreground">@{entry.handle}</span>
                )}
              </div>
            </TableCell>
            <TableCell>
              {/* Solo los logos de las redes ANALIZADAS ese día (sin texto, para
                  no ocupar espacio). Tooltip por ícono con el nombre de la red. */}
              <div className="flex items-center gap-2">
                {(entry.networks?.length ? entry.networks : [entry.network]).filter(Boolean).map((n) => {
                  const promoted = (entry.promotedNetworks ?? []).includes(n);
                  return (
                    <span
                      key={n}
                      title={`${networkLabel[n] || n}${promoted ? " · promocionó" : " · revisada, sin promo"}`}
                      className={`inline-flex items-center justify-center ${promoted ? "text-foreground" : "text-muted-foreground/40"}`}
                    >
                      <NetworkIcon network={n} />
                    </span>
                  );
                })}
              </div>
            </TableCell>
            <TableCell>
              {displayPlatform(entry) ? (
                <Badge variant="primary-soft" className="text-xs">{displayPlatform(entry)}</Badge>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell>
              {/* Resultado SIEMPRE binario (Sí/No). "revisar" y "no verificado" son
                  marcas AL LADO, nunca reemplazan el resultado. */}
              <div className="flex items-center gap-1">
                <Badge variant={resultVariant[entry.result] || "destructive-soft"} className="text-xs">
                  {entry.result === "Sí" ? "Sí" : "No"}
                </Badge>
                {entry.needs_review ? (
                  <span title={errorReasonLabel(entry.error_reason)} className="text-warning" aria-label="Revisar manual">
                    <AlertTriangle className="h-3.5 w-3.5" />
                  </span>
                ) : entry.is_pending ? (
                  <span title="Lectura no confirmada — puede tener historias sin leer" className="text-[10px] text-muted-foreground">no verif.</span>
                ) : null}
              </div>
            </TableCell>
            <TableCell className="min-w-[150px]">
              {entry.networkScores?.length ? (
                <PromoQualityBar networks={entry.networkScores} score={entry.dayScore ?? 0} />
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {entry.agent === "AI Agent" ? (
                <Badge variant="secondary-soft" className="text-[10px] italic">AI Agent</Badge>
              ) : entry.agent}
            </TableCell>
            <TableCell onClick={(e) => e.stopPropagation()}>
              <InlineNotes
                value={entry.notes}
                onSave={(v) => onNotesChange?.(entry.id, v)}
              />
            </TableCell>
            <TableCell className="sticky right-0 bg-card" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-end">
                {viewOnly ? (
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onView?.(entry)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onView?.(entry)}>
                        <Eye className="mr-2 h-4 w-4" />
                        Ver detalle
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onEdit?.(entry)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Editar
                      </DropdownMenuItem>
                      {isManagement && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => onAssignAgent?.(entry)}>
                            <UserPlus className="mr-2 h-4 w-4" />
                            Asignar agente
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive" onClick={() => onDelete?.(entry)}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

export default PromologTable;
