import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Loader2 } from "lucide-react";
import { useScouterLeads, type ScouterLead } from "@/hooks/useScouterLeads";
import {
  LeadDrawer,
  STATUS_META,
  STATUS_OPTIONS,
  VerifiedBadge,
  formatFollowers,
  initialsBg,
  scoreColor,
} from "./leadShared";

// Leads tab — denser table view of scouter_leads, complementing the
// photo-first grid that lives in Home / Favoritas. Same drawer on
// row-click, same data source. Different layout because closers
// managing dozens of leads day-to-day need to scan many rows at once
// without the visual weight of a 1:1 photo for each.
//
// Out of scope this slice (matches the Home limits):
//   - Pagination beyond a 200-row hard limit
//   - Multi-select bulk actions
//   - Per-column sort (only created_at DESC for now)

const ScouterLeads = () => {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ScouterLead | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const leads = useScouterLeads({ status: statusFilter, search, pageSize: 200 });
  const rows = leads.data?.leads ?? [];

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por handle, nombre, país…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {leads.isLoading ? "Cargando…" : `${rows.length} de ≤200`}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card">
        {leads.isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium">Sin leads para mostrar</p>
            <p className="text-xs text-muted-foreground">
              Cambia los filtros o espera a que el bot descubra cuentas nuevas.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[44px]"></TableHead>
                <TableHead>Handle</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Cat.</TableHead>
                <TableHead>País / Ciudad</TableHead>
                <TableHead className="text-right">AI</TableHead>
                <TableHead className="text-right">Followers</TableHead>
                <TableHead>Closer</TableHead>
                <TableHead className="text-right">Descubierto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((lead) => {
                const statusCfg = STATUS_META[lead.status] ?? STATUS_META.discovery;
                const initial = (
                  lead.name?.trim().charAt(0) ||
                  lead.instagram_handle.charAt(0) ||
                  "?"
                ).toUpperCase();
                return (
                  <TableRow
                    key={lead.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => {
                      setSelected(lead);
                      setDrawerOpen(true);
                    }}
                  >
                    <TableCell>
                      <div
                        className="relative h-9 w-9 overflow-hidden rounded-md"
                        style={{ background: initialsBg(lead.instagram_handle) }}
                      >
                        {lead.photo_data_url ? (
                          <img
                            src={lead.photo_data_url}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs font-bold text-white/90">
                            {initial}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">@{lead.instagram_handle}</span>
                        {lead.verified && (
                          <VerifiedBadge size={14} />
                        )}
                      </div>
                      {lead.name && (
                        <div className="text-xs text-muted-foreground">{lead.name}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className="gap-1.5"
                        style={{ background: `${statusCfg.dot}22`, color: statusCfg.dot }}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: statusCfg.dot }}
                        />
                        {statusCfg.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {lead.category ? (
                        <span className="font-mono text-xs font-bold text-amber-400">
                          {lead.category}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {[lead.country, lead.city].filter(Boolean).join(" · ") || (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {lead.ai_score != null ? (
                        <span style={{ color: scoreColor(lead.ai_score) }} className="font-bold">
                          {lead.ai_score.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {formatFollowers(lead.followers)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {lead.assigned_closer || (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                      {new Date(lead.created_at).toLocaleDateString("es-CO", {
                        day: "2-digit",
                        month: "short",
                      })}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <LeadDrawer lead={selected} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
};

export default ScouterLeads;
