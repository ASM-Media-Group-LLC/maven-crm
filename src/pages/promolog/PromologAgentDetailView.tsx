import { useState, useMemo, useCallback } from "react";
import { ArrowLeft, Search, Check, Minus, X, TrendingUp, Table2, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import DataTableShell from "@/components/ui/data-table-shell";
import PromologTable from "./PromologTable";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { PromologEntry } from "./PromologEntryCard";

const networkOptions = [
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "x", label: "X" },
  { value: "telegram", label: "Telegram" },
];

const promotedToResult = (promoted: string | null): string => {
  switch (promoted) {
    case "true": return "Sí";
    case "false": return "No";
    case "partial": return "Parcial";
    case "pending": return "Pendiente";
    default: return "Pendiente";
  }
};

interface PromologAgentDetailViewProps {
  agent: { id: string; name: string };
  onBack: () => void;
}

const PromologAgentDetailView = ({ agent, onBack }: PromologAgentDetailViewProps) => {
  const { user } = useAuth();
  const { role } = useUserRole();
  const isManagement = ["admin", "manager", "supervisor"].includes(role ?? "");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState("");
  const [filterNetwork, setFilterNetwork] = useState("");
  const [filterPlatform, setFilterPlatform] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [statsCollapsed, setStatsCollapsed] = useState(false);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop > 40) setStatsCollapsed(true);
  }, []);

  // Fetch profiles for agent name resolution
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name");
      return data || [];
    },
  });

  const profilesMap = useMemo(() => {
    const map: Record<string, string> = {};
    profiles.forEach((p: any) => { if (p.id && p.full_name) map[p.id] = p.full_name; });
    return map;
  }, [profiles]);

  // Own query for this agent's entries
  const { data: rawEntries = [], isLoading } = useQuery({
    queryKey: ["promolog-agent-detail", agent.id, dateFrom?.toISOString(), dateTo?.toISOString()],
    queryFn: async () => {
      let query = supabase
        .from("promolog_entries")
        .select("*, creators(name, artistic_name, instagram_handle)")
        .or(`reviewed_by.eq.${agent.id},created_by.eq.${agent.id}`)
        .order("date", { ascending: false });

      if (dateFrom) {
        query = query.gte("date", dateFrom.toISOString().split("T")[0]);
      }
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setDate(toDate.getDate() + 1);
        query = query.lt("date", toDate.toISOString().split("T")[0]);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Deduplicate
      const map = new Map<string, any>();
      for (const e of data ?? []) {
        const dayKey = e.date?.split("T")[0] ?? e.date;
        const key = `${e.creator_id}|${dayKey}|${e.network}|${e.platform}|${e.promoted}`;
        const existing = map.get(key);
        if (!existing) {
          map.set(key, e);
        } else {
          const score = (r: any) =>
            (r.evidence_url ? 1 : 0) + (r.notes ? 1 : 0) + (r.reviewed_by ? 1 : 0) + (r.action_taken ? 1 : 0);
          if (score(e) > score(existing)) map.set(key, e);
        }
      }
      return Array.from(map.values());
    },
  });

  const entries: PromologEntry[] = useMemo(() => {
    return rawEntries.map((pe: any) => {
      const dateObj = new Date(pe.date);
      const creator = pe.creators as any;
      return {
        id: pe.id,
        ticketNumber: pe.ticket_number || "",
        name: creator?.artistic_name || creator?.name || "Sin nombre",
        handle: creator?.instagram_handle || undefined,
        network: (pe.network || "").toLowerCase(),
        platform: pe.platform || "OnlyFans",
        result: promotedToResult(pe.promoted),
        date: dateObj.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }),
        time: dateObj.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", hour12: true }),
        agent: (pe.reviewed_by && profilesMap[pe.reviewed_by]) || "—",
        notes: pe.notes || "",
        creator_id: pe.creator_id,
        reviewed_by: pe.reviewed_by || undefined,
      };
    });
  }, [rawEntries, profilesMap]);

  // KPIs
  const totalEntries = entries.length;
  const siCount = entries.filter(e => e.result === "Sí").length;
  const parcialCount = entries.filter(e => e.result === "Parcial").length;
  const noCount = entries.filter(e => e.result === "No").length;
  const successRate = totalEntries > 0 ? Math.round((siCount / totalEntries) * 100) : 0;

  // Filtered entries
  const filtered = useMemo(() => {
    return entries.filter(e => {
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        if (!e.name.toLowerCase().includes(q) && !e.ticketNumber.toLowerCase().includes(q)) return false;
      }
      if (filterNetwork && e.network !== filterNetwork) return false;
      if (filterPlatform && !(e.platform || "").toLowerCase().includes(filterPlatform)) return false;
      return true;
    });
  }, [entries, searchTerm, filterNetwork, filterPlatform]);

  const handleNotesChange = async (entryId: string, notes: string | null) => {
    const { error } = await supabase.from("promolog_entries").update({ notes }).eq("id", entryId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["promolog-agent-detail", agent.id] });
  };

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      {/* Header */}
      <header className="bg-background px-6 pt-6 pb-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{agent.name}</h1>
            <p className="text-sm text-muted-foreground">Detalle del agente — Promolog</p>
          </div>
        </div>
      </header>

      {/* KPI Cards */}
      <div className={`shrink-0 px-6 pt-4 transition-all duration-300 overflow-hidden ${statsCollapsed ? "max-h-0 opacity-0 py-0" : "max-h-[200px] opacity-100 pb-2"}`}>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Card className="border border-accent/40 bg-card/80">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/20 shrink-0">
                <Table2 className="h-4 w-4 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold text-accent">{totalEntries}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border border-success/40 bg-card/80">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-success/20 shrink-0">
                <Check className="h-4 w-4 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold text-success">{siCount}</p>
                <p className="text-xs text-muted-foreground">Sí</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border border-warning/40 bg-card/80">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-warning/20 shrink-0">
                <Minus className="h-4 w-4 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold text-warning">{parcialCount}</p>
                <p className="text-xs text-muted-foreground">Parcial</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border border-destructive/40 bg-card/80">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-destructive/20 shrink-0">
                <X className="h-4 w-4 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold text-destructive">{noCount}</p>
                <p className="text-xs text-muted-foreground">No</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border border-primary/40 bg-card/80">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 shrink-0">
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-primary">{successRate}%</p>
                <p className="text-xs text-muted-foreground">Éxito</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Filters */}
      <div className="shrink-0 px-6 pb-2">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar modelo..." className="pl-9 h-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <Select value={filterNetwork || undefined} onValueChange={(v) => setFilterNetwork(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Red Social" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas</SelectItem>
              {networkOptions.map(n => <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterPlatform || undefined} onValueChange={(v) => setFilterPlatform(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Plataforma" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas</SelectItem>
              <SelectItem value="onlyfans">OnlyFans</SelectItem>
              <SelectItem value="unlok">Unlok</SelectItem>
              <SelectItem value="otra">Otra</SelectItem>
            </SelectContent>
          </Select>
          <DateRangePicker
            from={dateFrom}
            to={dateTo}
            onApply={(from, to) => { setDateFrom(from); setDateTo(to); setStatsCollapsed(false); }}
            placeholder="Fechas"
            className="h-9"
          />
          {(searchTerm || filterNetwork || filterPlatform || dateFrom || dateTo) && (
            <Button variant="ghost" size="sm" className="h-9" onClick={() => { setSearchTerm(""); setFilterNetwork(""); setFilterPlatform(""); setDateFrom(undefined); setDateTo(undefined); }}>
              <X className="mr-1.5 h-4 w-4" />
              Limpiar
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 px-6 pb-4 flex flex-col">
        <DataTableShell
          onScroll={handleScroll}
          className="flex-1 min-h-0"
          currentPage={page}
          totalPages={Math.max(1, Math.ceil(filtered.length / pageSize))}
          totalCount={filtered.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
        >
          <PromologTable
            entries={filtered.slice((page - 1) * pageSize, page * pageSize)}
            onView={() => {}}
            onEdit={() => {}}
            onDelete={() => {}}
            onNotesChange={handleNotesChange}
            onAssignAgent={() => {}}
            isManagement={isManagement}
          />
        </DataTableShell>
      </div>
    </main>
  );
};

export default PromologAgentDetailView;
