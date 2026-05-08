import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Search,
  Settings2,
  Download,
  ArrowRight,
  Instagram,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { EarningsRow } from "../sales-performance/types";

interface Props {
  rows: EarningsRow[];
  comparedRows?: EarningsRow[];
}

interface CreatorAgg {
  name: string;
  creatorId: string | null;
  initials: string;
  grossEarnings: number;
  netEarnings: number;
  participation: number;
  grossB?: number;
  netB?: number;
  variation?: number | null;
}

const fmt = (v: number) =>
  `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const aggregateByCreator = (rows: EarningsRow[]) => {
  // Agrupa por nombre artístico, recordando un creator_id si está disponible
  // (necesario para foto + IG + nav al perfil).
  const grouped = new Map<string, { gross: number; creatorId: string | null }>();
  let total = 0;
  for (const r of rows) {
    const name = r.artistic_name || r.pending_creator || "Sin Vincular";
    const existing = grouped.get(name);
    grouped.set(name, {
      gross: (existing?.gross ?? 0) + (r.total_earnings_gross ?? 0),
      creatorId: existing?.creatorId ?? r.creator_id ?? null,
    });
    total += r.total_earnings_gross ?? 0;
  }
  return { grouped, total };
};

// Card list estilo Pareto / Creator Reports — click abre popup ficha
// técnica con foto IG, link IG y "Ver perfil completo".
const CreatorsTable = ({ rows, comparedRows }: Props) => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [creatorDetail, setCreatorDetail] = useState<CreatorAgg | null>(null);
  const hasComparison = comparedRows && comparedRows.length > 0;

  const creators = useMemo(() => {
    const { grouped, total } = aggregateByCreator(rows);
    const compAgg = comparedRows ? aggregateByCreator(comparedRows) : null;

    return Array.from(grouped.entries())
      .map(([name, info]): CreatorAgg => {
        const compEntry = compAgg?.grouped.get(name);
        const grossB = compEntry?.gross;
        const variation = grossB !== undefined && grossB > 0
          ? ((info.gross - grossB) / grossB) * 100
          : grossB === 0 && info.gross > 0
            ? null
            : grossB !== undefined ? 0 : undefined;

        return {
          name,
          creatorId: info.creatorId,
          initials: name.slice(0, 2).toUpperCase(),
          grossEarnings: info.gross,
          netEarnings: info.gross * 0.8,
          participation: total > 0 ? (info.gross / total) * 100 : 0,
          grossB,
          netB: grossB !== undefined ? grossB * 0.8 : undefined,
          variation: hasComparison ? variation : undefined,
        };
      })
      .sort((a, b) => b.grossEarnings - a.grossEarnings);
  }, [rows, comparedRows, hasComparison]);

  const filtered = creators.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  // Fetch creator info (foto + IG + país) para todos los creator_ids
  // visibles en la lista. Una sola query batched.
  const creatorIds = useMemo(
    () => Array.from(new Set(creators.map((c) => c.creatorId).filter((id): id is string => !!id))),
    [creators]
  );

  const { data: creatorInfo = {} } = useQuery({
    queryKey: ["creators_info_for_sales_dashboard", creatorIds],
    enabled: creatorIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creators")
        .select("id, instagram_handle, profile_photo_url, country, category")
        .in("id", creatorIds);
      if (error) throw error;
      const map: Record<string, { ig: string | null; photo: string | null; country: string | null; category: string | null }> = {};
      (data ?? []).forEach((row) => {
        map[row.id] = {
          ig: row.instagram_handle ?? null,
          photo: row.profile_photo_url ?? null,
          country: row.country ?? null,
          category: row.category ?? null,
        };
      });
      return map;
    },
  });

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
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
            Configurar
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
            <Download className="h-3.5 w-3.5" />
            Exportar
          </Button>
        </div>
      </div>

      {/* Card list */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">
          Sin datos para el período seleccionado
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => {
            const info = c.creatorId ? creatorInfo[c.creatorId] : null;
            const handle = info?.ig?.replace(/^@/, "") || "";
            return (
              <button
                key={c.name}
                type="button"
                onClick={() => setCreatorDetail(c)}
                className="group w-full rounded-xl border border-border bg-card p-3 text-left transition-all duration-200 ease-out hover:scale-[1.005] hover:border-primary/40 hover:shadow-[0_0_24px_-4px_rgba(255,255,255,0.12)]"
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10 shrink-0">
                    {info?.photo && <AvatarImage src={info.photo} alt={c.name} />}
                    <AvatarFallback className="text-xs font-semibold">{c.initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{c.name}</p>
                    {handle && (
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
                        <Instagram className="h-3 w-3 shrink-0" />
                        @{handle}
                      </p>
                    )}
                  </div>
                  <div className="hidden md:flex items-center gap-4 text-right shrink-0">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Gross</p>
                      <p className="text-xs font-medium tabular-nums">{fmt(c.grossEarnings)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Net</p>
                      <p className="text-xs font-medium tabular-nums text-emerald-500">{fmt(c.netEarnings)}</p>
                    </div>
                    {hasComparison && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Variación</p>
                        <p className="text-xs font-medium tabular-nums">
                          {c.variation === null ? (
                            <span className="text-emerald-500">Nuevo</span>
                          ) : c.variation !== undefined ? (
                            <span className={cn(c.variation >= 0 ? "text-emerald-500" : "text-destructive")}>
                              {c.variation >= 0 ? "+" : ""}{c.variation.toFixed(1)}%
                            </span>
                          ) : "—"}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-right shrink-0 min-w-[90px]">
                    <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.min(c.participation * 10, 100)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground w-10 text-right tabular-nums">
                      {c.participation.toFixed(1)}%
                    </span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* CREATOR DETAIL DIALOG */}
      <Dialog open={creatorDetail !== null} onOpenChange={(o) => !o && setCreatorDetail(null)}>
        <DialogContent className="max-w-xl">
          {creatorDetail && (() => {
            const c = creatorDetail;
            const info = c.creatorId ? creatorInfo[c.creatorId] : null;
            const handle = info?.ig?.replace(/^@/, "") || "";
            const igUrl = handle ? `https://instagram.com/${handle}` : null;
            const stats: { label: string; value: string }[] = [
              { label: "Gross", value: fmt(c.grossEarnings) },
              { label: "Net (80%)", value: fmt(c.netEarnings) },
              { label: "Participación", value: `${c.participation.toFixed(1)}%` },
              ...(hasComparison
                ? [
                    { label: "Gross B", value: c.grossB !== undefined ? fmt(c.grossB) : "—" },
                    { label: "Net B", value: c.netB !== undefined ? fmt(c.netB) : "—" },
                    {
                      label: "Variación",
                      value:
                        c.variation === null
                          ? "Nuevo"
                          : c.variation !== undefined
                          ? `${c.variation >= 0 ? "+" : ""}${c.variation.toFixed(1)}%`
                          : "—",
                    },
                  ]
                : []),
              ...(info?.country ? [{ label: "País", value: info.country }] : []),
              ...(info?.category ? [{ label: "Categoría", value: info.category }] : []),
            ];
            return (
              <>
                <DialogHeader>
                  <div className="flex items-start gap-4">
                    <Avatar className="h-20 w-20 shrink-0">
                      {info?.photo && <AvatarImage src={info.photo} alt={c.name} />}
                      <AvatarFallback className="text-lg font-semibold">{c.initials}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <DialogTitle className="text-2xl mb-1 truncate">{c.name}</DialogTitle>
                      {handle && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                          <Instagram className="h-3.5 w-3.5" />
                          @{handle}
                        </p>
                      )}
                    </div>
                  </div>
                </DialogHeader>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                  {stats.map((s) => (
                    <div key={s.label} className="rounded-lg border border-border bg-card p-3">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                        {s.label}
                      </p>
                      <p className="text-sm font-medium tabular-nums truncate">{s.value}</p>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border">
                  {igUrl && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => window.open(igUrl, "_blank", "noopener,noreferrer")}
                    >
                      <Instagram className="h-3.5 w-3.5" />
                      Abrir Instagram
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  )}
                  {c.creatorId && (
                    <Button
                      size="sm"
                      className="gap-1.5"
                      onClick={() => {
                        navigate(`/creadores/${c.creatorId}`);
                        setCreatorDetail(null);
                      }}
                    >
                      Ver perfil completo
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CreatorsTable;
