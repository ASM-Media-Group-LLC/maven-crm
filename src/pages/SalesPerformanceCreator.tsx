import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowUpDown, Filter } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Logo from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";

interface EarningsRow {
  id: string;
  date: string;
  total_earnings_gross: number | null;
  document_id: string | null;
  pending_creator: string | null;
  creator_id: string | null;
  artistic_name: string | null;
}

const fetchEarnings = async (): Promise<EarningsRow[]> => {
  // Fetch earnings
  const { data: earnings, error } = await supabase
    .from("of_gross_earnings")
    .select("id, date, total_earnings_gross, document_id, pending_creator, creator_id")
    .order("date", { ascending: false })
    .limit(1000);

  if (error) throw error;

  // Get unique creator_ids
  const creatorIds = [
    ...new Set(
      (earnings ?? [])
        .map((e) => e.creator_id)
        .filter(Boolean) as string[]
    ),
  ];

  // Fetch artistic names
  let creatorsMap: Record<string, string> = {};
  if (creatorIds.length > 0) {
    const { data: creators } = await supabase
      .from("creators")
      .select("id, artistic_name")
      .in("id", creatorIds);
    if (creators) {
      creatorsMap = Object.fromEntries(
        creators.map((c) => [c.id, c.artistic_name ?? ""])
      );
    }
  }

  return (earnings ?? []).map((e) => ({
    ...e,
    artistic_name: e.creator_id ? creatorsMap[e.creator_id] ?? null : null,
  }));
};

const SalesPerformanceCreator = () => {
  const [documentFilter, setDocumentFilter] = useState<string>("all");
  const [sortAsc, setSortAsc] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["of_gross_earnings_performance"],
    queryFn: fetchEarnings,
  });

  const documentIds = useMemo(() => {
    const ids = [...new Set(rows.map((r) => r.document_id).filter(Boolean))] as string[];
    return ids.sort();
  }, [rows]);

  const filtered = useMemo(() => {
    let result = rows;
    if (documentFilter !== "all") {
      result = result.filter((r) => r.document_id === documentFilter);
    }
    return result.sort((a, b) => {
      const da = new Date(a.date).getTime();
      const db = new Date(b.date).getTime();
      return sortAsc ? da - db : db - da;
    });
  }, [rows, documentFilter, sortAsc]);

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString("es-CL", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return d;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link to="/salesdashboard">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <Logo size="sm" />
          </div>
          <span className="text-sm text-muted-foreground">
            Rendimiento por Creadora
          </span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Filters */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Document ID:</span>
            <Select value={documentFilter} onValueChange={setDocumentFilter}>
              <SelectTrigger className="w-64 h-8 text-xs">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {documentIds.map((id) => (
                  <SelectItem key={id} value={id}>
                    {id.slice(0, 8)}…
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span className="text-xs text-muted-foreground">
            {filtered.length} registros
          </span>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              Cargando datos…
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs">Creadora</TableHead>
                  <TableHead className="text-xs text-right">
                    <button
                      className="flex items-center justify-end gap-1 w-full"
                      onClick={() => setSortAsc((v) => !v)}
                    >
                      Fecha <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead className="text-xs text-right">
                    Total Earnings Gross
                  </TableHead>
                  <TableHead className="text-xs">Document ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="space-y-0.5">
                        {row.artistic_name && (
                          <div className="text-sm font-medium text-foreground">
                            {row.artistic_name}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          {row.pending_creator ?? "—"}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-sm text-foreground">
                      {formatDate(row.date)}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium text-foreground">
                      ${(row.total_earnings_gross ?? 0).toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                      })}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">
                      {row.document_id ? `${row.document_id.slice(0, 8)}…` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground text-sm py-8">
                      Sin resultados
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </main>
    </div>
  );
};

export default SalesPerformanceCreator;
