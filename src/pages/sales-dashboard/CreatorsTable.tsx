import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Search,
  Settings2,
  Download,
  ExternalLink,
  EyeOff,
  Flag,
  ArrowUpDown,
} from "lucide-react";
import type { EarningsRow } from "../sales-performance/types";

interface Props {
  rows: EarningsRow[];
}

interface CreatorAgg {
  name: string;
  initials: string;
  grossEarnings: number;
  netEarnings: number;
  participation: number;
}

const fmt = (v: number) =>
  `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const CreatorsTable = ({ rows }: Props) => {
  const [search, setSearch] = useState("");

  const creators = useMemo(() => {
    const grouped = new Map<string, number>();
    let total = 0;

    for (const r of rows) {
      const name = r.artistic_name || r.pending_creator || "Sin Vincular";
      grouped.set(name, (grouped.get(name) ?? 0) + (r.total_earnings_gross ?? 0));
      total += r.total_earnings_gross ?? 0;
    }

    return Array.from(grouped.entries())
      .map(([name, grossEarnings]): CreatorAgg => ({
        name,
        initials: name.slice(0, 2).toUpperCase(),
        grossEarnings,
        netEarnings: grossEarnings * 0.8,
        participation: total > 0 ? (grossEarnings / total) * 100 : 0,
      }))
      .sort((a, b) => b.grossEarnings - a.grossEarnings);
  }, [rows]);

  const filtered = creators.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border-b border-border">
        <h3 className="text-base font-semibold text-foreground">
          Estadísticas de creadoras
        </h3>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-muted-foreground">
            {filtered.length} creadoras
          </span>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar creadora..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-8 w-48 text-xs"
            />
          </div>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
            <Settings2 className="h-3.5 w-3.5" />
            Configurar tabla
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
            <Download className="h-3.5 w-3.5" />
            Exportar
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-xs">
                <span className="flex items-center gap-1">
                  Creadora <ArrowUpDown className="h-3 w-3" />
                </span>
              </TableHead>
              <TableHead className="text-xs text-right">
                <span className="flex items-center justify-end gap-1">
                  Gross Earnings <ArrowUpDown className="h-3 w-3" />
                </span>
              </TableHead>
              <TableHead className="text-xs text-right">
                <span className="flex items-center justify-end gap-1">
                  Net Earnings <ArrowUpDown className="h-3 w-3" />
                </span>
              </TableHead>
              <TableHead className="text-xs text-right">
                <span className="flex items-center justify-end gap-1">
                  Participación <ArrowUpDown className="h-3 w-3" />
                </span>
              </TableHead>
              <TableHead className="text-xs text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                  Sin datos para el período seleccionado
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((creator) => (
                <TableRow key={creator.name}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs bg-muted text-muted-foreground">
                          {creator.initials}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium text-foreground">
                        {creator.name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-sm text-foreground">
                    {fmt(creator.grossEarnings)}
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium text-success">
                    {fmt(creator.netEarnings)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.min(creator.participation * 10, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground w-10 text-right">
                        {creator.participation.toFixed(1)}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <Flag className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default CreatorsTable;
