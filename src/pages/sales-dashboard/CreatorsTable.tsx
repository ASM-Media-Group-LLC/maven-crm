import { useState } from "react";
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
  TrendingDown,
  ArrowUpDown,
} from "lucide-react";

interface Creator {
  name: string;
  initials: string;
  grossEarnings: number;
  netEarnings: number;
  variation: number;
  trend: string;
  participation: number;
}

const creatorsData: Creator[] = [
  { name: "Alemiarojas", initials: "AL", grossEarnings: 1050.52, netEarnings: 840.42, variation: -88.6, trend: "Cayendo", participation: 8.7 },
  { name: "franundurraga", initials: "FR", grossEarnings: 942.87, netEarnings: 754.30, variation: -86.7, trend: "Cayendo", participation: 7.8 },
  { name: "Sin Vincular", initials: "SI", grossEarnings: 912.72, netEarnings: 730.18, variation: -88.9, trend: "Cayendo", participation: 7.6 },
  { name: "Martina Smith", initials: "MS", grossEarnings: 825.54, netEarnings: 660.43, variation: -85.1, trend: "Cayendo", participation: 6.8 },
  { name: "GiselleMontes18", initials: "GM", grossEarnings: 619.13, netEarnings: 495.30, variation: -86.0, trend: "Cayendo", participation: 5.1 },
  { name: "Heidygarcia1111", initials: "HG", grossEarnings: 562.60, netEarnings: 450.08, variation: -68.3, trend: "Cayendo", participation: 4.7 },
  { name: "Dayoranmx", initials: "DA", grossEarnings: 409.67, netEarnings: 327.74, variation: -85.1, trend: "Cayendo", participation: 3.4 },
];

const CreatorsTable = () => {
  const [search, setSearch] = useState("");

  const filtered = creatorsData.filter((c) =>
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
                  Variación <ArrowUpDown className="h-3 w-3" />
                </span>
              </TableHead>
              <TableHead className="text-xs">Tendencia</TableHead>
              <TableHead className="text-xs text-right">
                <span className="flex items-center justify-end gap-1">
                  Participación <ArrowUpDown className="h-3 w-3" />
                </span>
              </TableHead>
              <TableHead className="text-xs text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((creator) => (
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
                  ${creator.grossEarnings.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell className="text-right text-sm font-medium text-success">
                  ${creator.netEarnings.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell className="text-right text-sm text-destructive">
                  {creator.variation}%
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5 text-destructive">
                    <TrendingDown className="h-3.5 w-3.5" />
                    <span className="text-xs">{creator.trend}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${creator.participation * 10}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-10 text-right">
                      {creator.participation}%
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
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default CreatorsTable;
