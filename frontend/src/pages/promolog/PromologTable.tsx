import { useState, useRef, useEffect } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Eye, Facebook, MoreHorizontal, Pencil, Trash2, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

const resultVariant: Record<string, "success-soft" | "destructive-soft" | "warning-soft" | "secondary-soft"> = {
  "Sí": "success-soft",
  "No": "destructive-soft",
  "Parcial": "warning-soft",
  "Pendiente": "secondary-soft",
};

const InlineNotes = ({ value, onSave }: { value: string; onSave: (v: string | null) => void }) => {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setText(value); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const handleSave = () => {
    setEditing(false);
    const trimmed = text.trim();
    if (trimmed !== value) {
      onSave(trimmed || null);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") { setText(value); setEditing(false); } }}
        className="w-full min-w-[120px] bg-transparent border-b border-primary text-sm outline-none py-0.5"
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <span
      className="text-sm text-muted-foreground truncate max-w-[200px] block cursor-pointer hover:text-foreground"
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      title={value || "Click para agregar nota"}
    >
      {value || "—"}
    </span>
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
              <TableHead colSpan={9} className="text-center py-16 text-muted-foreground">
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
    <Table containerClassName="overflow-visible" className="min-w-[1000px]">
      <TableHeader>
        <TableRow>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))] w-[50px]">#</TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="Creación" sortKeyName="date" /></TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="Modelo" sortKeyName="model" /></TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="Red Social" sortKeyName="network" /></TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="Plataforma" sortKeyName="platform" /></TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="Resultado" sortKeyName="result" /></TableHead>
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
                <span className="text-sm font-medium">{entry.name}</span>
                {entry.handle && (
                  <span className="text-xs text-muted-foreground">@{entry.handle}</span>
                )}
              </div>
            </TableCell>
            <TableCell>
              {/* Solo los logos de las redes ANALIZADAS ese día (sin texto, para
                  no ocupar espacio). Tooltip por ícono con el nombre de la red. */}
              <div className="flex items-center gap-2 text-muted-foreground">
                {(entry.networks?.length ? entry.networks : [entry.network]).filter(Boolean).map((n) => (
                  <span key={n} title={networkLabel[n] || n} className="inline-flex items-center justify-center">
                    <NetworkIcon network={n} />
                  </span>
                ))}
              </div>
            </TableCell>
            <TableCell>
              <Badge variant="primary-soft" className="text-xs">
                {entry.platform}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge variant={resultVariant[entry.result] || "secondary-soft"} className="text-xs">
                {entry.result}
              </Badge>
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
