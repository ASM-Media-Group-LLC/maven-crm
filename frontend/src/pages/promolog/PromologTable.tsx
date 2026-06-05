import { useState, useRef, useEffect } from "react";
import { ArrowUpDown, Eye, MoreHorizontal, Pencil, Trash2, UserPlus } from "lucide-react";
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
}

type SortKey = "model" | "network" | "platform" | "result" | "agent" | "date";

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

const NetworkIcon = ({ network }: { network: string }) => {
  switch (network) {
    case "instagram": return <InstagramIcon className="h-3.5 w-3.5" />;
    case "tiktok": return <TikTokIcon className="h-3.5 w-3.5" />;
    case "x": return <XIcon className="h-3.5 w-3.5" />;
    case "telegram": return <TelegramIcon className="h-3.5 w-3.5" />;
    default: return null;
  }
};

const networkLabel: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  x: "X / Twitter",
  telegram: "Telegram",
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

const PromologTable = ({ entries, onView, onEdit, onDelete, onNotesChange, onAssignAgent, isManagement, viewOnly }: Props) => {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortAsc, setSortAsc] = useState(false);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const sorted = [...entries].sort((a, b) => {
    const aVal = getSortValue(a, sortKey);
    const bVal = getSortValue(b, sortKey);
    const cmp = aVal.localeCompare(bVal);
    return sortAsc ? cmp : -cmp;
  });

  const SortHeader = ({ label, sortKeyName }: { label: string; sortKeyName: SortKey }) => (
    <Button variant="ghost" size="sm" className="h-8 -ml-3 text-xs font-medium" onClick={() => handleSort(sortKeyName)}>
      {label}
      <ArrowUpDown className="ml-1 h-3 w-3" />
    </Button>
  );

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
        {sorted.map((entry, idx) => (
          {/* Click en la fila → SIEMPRE abre el detalle lindo (galería de stories).
              Editar queda en el menú "..." para no perderlo. */}
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
              <Badge variant="secondary-soft" className="gap-1 text-xs">
                <NetworkIcon network={entry.network} />
                {networkLabel[entry.network] || entry.network}
              </Badge>
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
