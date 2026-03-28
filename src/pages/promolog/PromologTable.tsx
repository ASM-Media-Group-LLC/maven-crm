import { useState } from "react";
import { ArrowUpDown, Eye, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
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
}

type SortKey = "ticket" | "model" | "network" | "platform" | "result" | "agent" | "date";

const getSortValue = (entry: PromologEntry, key: SortKey): string => {
  switch (key) {
    case "ticket": return entry.ticketNumber;
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

const resultVariant: Record<string, string> = {
  "Sí": "bg-green-500/15 text-green-700 border-green-300",
  "No": "bg-red-500/15 text-red-700 border-red-300",
  "Parcial": "bg-yellow-500/15 text-yellow-700 border-yellow-300",
  "Pendiente": "bg-muted text-muted-foreground",
};

const PromologTable = ({ entries, onView, onEdit, onDelete }: Props) => {
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
              <TableHead colSpan={8} className="text-center py-16 text-muted-foreground">
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
    <Table containerClassName="overflow-visible" className="min-w-[900px]">
      <TableHeader>
        <TableRow>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="Ticket" sortKeyName="ticket" /></TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="Modelo" sortKeyName="model" /></TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="Red Social" sortKeyName="network" /></TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="Plataforma" sortKeyName="platform" /></TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="Resultado" sortKeyName="result" /></TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="Agente" sortKeyName="agent" /></TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="Creación" sortKeyName="date" /></TableHead></TableHead>
          <TableHead className="sticky top-0 right-0 z-30 bg-card shadow-[0_1px_0_0_hsl(var(--border))] text-right">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((entry) => (
          <TableRow key={entry.id} className="cursor-pointer" onClick={() => onEdit?.(entry)}>
            <TableCell>
              <Badge variant="outline" className="text-xs font-mono">{entry.ticketNumber}</Badge>
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
              <Badge variant="outline" className="gap-1 text-xs">
                <NetworkIcon network={entry.network} />
                {networkLabel[entry.network] || entry.network}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge variant="outline" className="text-xs border-orange-400 text-orange-500">
                {entry.platform}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge variant="outline" className={`text-xs ${resultVariant[entry.result] || ""}`}>
                {entry.result}
              </Badge>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">@{entry.agent}</TableCell>
            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
              <div className="flex flex-col">
                <span>{entry.date}</span>
                <span className="text-xs">{entry.time}</span>
              </div>
            </TableCell>
            <TableCell className="sticky right-0 bg-card" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-end">
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
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive" onClick={() => onDelete?.(entry)}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Eliminar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

export default PromologTable;
