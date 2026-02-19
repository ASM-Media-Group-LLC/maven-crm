import { useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { CreatorComparison } from "../usePeriodComparison";

const fmt = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n.toFixed(0)}`;
const initials = (name: string | null) => (name ?? "?").slice(0, 2).toUpperCase();

type SortKey = "artisticName" | "currentEarnings" | "previousEarnings" | "changePercent";

interface Props {
  creators: CreatorComparison[];
}

const ComparativaTable = ({ creators }: Props) => {
  const [sortKey, setSortKey] = useState<SortKey>("currentEarnings");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const sorted = [...creators].sort((a, b) => {
    const av = sortKey === "artisticName" ? (a.artisticName ?? "") : a[sortKey];
    const bv = sortKey === "artisticName" ? (b.artisticName ?? "") : b[sortKey];
    if (typeof av === "string" && typeof bv === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });

  const TrendIcon = ({ status }: { status: string }) => {
    if (status === "rising" || status === "high_potential") return <TrendingUp className="h-3.5 w-3.5 text-success" />;
    if (status === "falling" || status === "at_risk") return <TrendingDown className="h-3.5 w-3.5 text-destructive" />;
    return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  const header = (label: string, key: SortKey) => (
    <TableHead
      className="cursor-pointer select-none text-xs hover:text-foreground"
      onClick={() => handleSort(key)}
    >
      {label} {sortKey === key ? (sortDir === "asc" ? "↑" : "↓") : ""}
    </TableHead>
  );

  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <p className="text-sm font-medium text-foreground">Tabla Comparativa</p>
        <div className="overflow-auto max-h-[calc(100vh-24rem)]">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead className="w-10 text-xs">#</TableHead>
                {header("Creadora", "artisticName")}
                {header("Actual", "currentEarnings")}
                {header("Anterior", "previousEarnings")}
                {header("Cambio %", "changePercent")}
                <TableHead className="sticky top-0 z-10 bg-card text-xs">Trend</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((c, i) => (
                <TableRow key={c.creatorKey}>
                  <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-[10px] bg-muted">{initials(c.artisticName)}</AvatarFallback>
                      </Avatar>
                      <span className="text-xs truncate max-w-[120px]">{c.artisticName || "—"}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-right font-medium">{fmt(c.currentEarnings)}</TableCell>
                  <TableCell className="text-xs text-right text-muted-foreground">{fmt(c.previousEarnings)}</TableCell>
                  <TableCell className={`text-xs text-right font-medium ${c.changePercent >= 0 ? "text-success" : "text-destructive"}`}>
                    {c.changePercent >= 0 ? "+" : ""}{c.changePercent.toFixed(1)}%
                  </TableCell>
                  <TableCell><TrendIcon status={c.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default ComparativaTable;
