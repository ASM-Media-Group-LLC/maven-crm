import { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Search, Loader2, ExternalLink } from "lucide-react";
import {
  useQaModelsWithStats,
  scoreColor,
  OUTCOME_META,
  type CallOutcome,
  type QaModelWithStats,
} from "@/hooks/useAgencyQa";
import CallDetailDrawer from "./CallDetailDrawer";

// Modelos subtab — catálogo de modelos con stats agregados (count de
// llamadas, avg score, fecha de la última, outcome del último cierre).
// Click row → abre el detail drawer de la última call. Mismo drawer
// que ya usa el subtab Calls.
//
// Out of scope (futuras slices):
//   - ModelScoreTrend chart por modelo (kash usa recharts)
//   - Crear / editar / borrar modelos (admin)
//   - Avatar upload editor
//   - Filtro por categoría / país

const fmtDate = (iso: string | null): string => {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
};

const Avatar = ({ name, dataUrl, size = 32 }: { name: string; dataUrl: string | null; size?: number }) => {
  const initial = (name?.trim().charAt(0) || "?").toUpperCase();
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  const bg = `linear-gradient(135deg, hsl(${h}, 40%, 30%) 0%, hsl(${(h + 60) % 360}, 50%, 20%) 100%)`;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-bold text-white/90"
      style={{ width: size, height: size, background: bg }}
    >
      {dataUrl ? <img src={dataUrl} alt="" className="h-full w-full object-cover" /> : initial}
    </span>
  );
};

const OutcomeMini = ({ outcome }: { outcome: CallOutcome }) => {
  // Compacto: "Sí / No / Espera" en lugar del badge completo.
  if (outcome === "cerro") return <span className="font-bold text-green-500">Sí</span>;
  if (outcome === "no_cerro") return <span className="font-bold text-red-500">No</span>;
  if (outcome === "en_espera") return <span className="font-bold text-amber-500">Espera</span>;
  return <span className="text-muted-foreground">—</span>;
};

const AgencyModels = () => {
  const [search, setSearch] = useState("");
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const modelsQ = useQaModelsWithStats();

  const filtered = useMemo(() => {
    const all = modelsQ.data ?? [];
    if (!search.trim()) return all;
    const q = search.trim().toLowerCase();
    return all.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.country?.toLowerCase().includes(q) ?? false) ||
        (m.category?.toLowerCase().includes(q) ?? false),
    );
  }, [modelsQ.data, search]);

  const summary = useMemo(() => {
    const all = modelsQ.data ?? [];
    const totalModels = all.length;
    const totalCalls = all.reduce((a, m) => a + m.total_calls, 0);
    const withCalls = all.filter((m) => m.total_calls > 0);
    const overallAvg =
      withCalls.length > 0
        ? Math.round(withCalls.reduce((a, m) => a + m.avg_score, 0) / withCalls.length)
        : 0;
    return { totalModels, totalCalls, overallAvg, activeModels: withCalls.length };
  }, [modelsQ.data]);

  return (
    <div className="space-y-5">
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="Modelos" value={summary.totalModels} hint="en el catálogo" color="rgb(148 163 184)" />
        <Stat
          label="Activas"
          value={summary.activeModels}
          hint={summary.totalModels > 0 ? `${Math.round((summary.activeModels / summary.totalModels) * 100)}% del catálogo` : ""}
          color="rgb(34 197 94)"
        />
        <Stat label="Análisis totales" value={summary.totalCalls} hint="todas las QAs" color="rgb(99 102 241)" />
        <Stat
          label="Score promedio"
          value={summary.overallAvg || "—"}
          hint={summary.activeModels > 0 ? "/ 100 (modelos con llamadas)" : ""}
          color={scoreColor(summary.overallAvg)}
        />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, país, categoría…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="text-xs text-muted-foreground">
          {modelsQ.isLoading ? "Cargando…" : `${filtered.length} modelo${filtered.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card">
        {modelsQ.isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium">Sin modelos para mostrar</p>
            <p className="text-xs text-muted-foreground">
              Cuando subas una nueva QA y elijas un modelo, aparecerá aquí.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Modelo</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>País</TableHead>
                <TableHead>IG</TableHead>
                <TableHead className="text-right">Llamadas</TableHead>
                <TableHead>Cierre último</TableHead>
                <TableHead>Closer último</TableHead>
                <TableHead className="text-right">Score avg</TableHead>
                <TableHead className="text-right">Última</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((m: QaModelWithStats) => {
                const last = m.last_call;
                return (
                  <TableRow
                    key={m.id}
                    className={`hover:bg-muted/40 ${last ? "cursor-pointer" : ""}`}
                    onClick={() => {
                      if (!last) return;
                      setSelectedCallId(last.id);
                      setDrawerOpen(true);
                    }}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={m.name} dataUrl={m.avatar_data_url} size={32} />
                        <span className="font-medium">{m.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {m.category ? (
                        <span
                          className="inline-block rounded-full border border-amber-500/60 px-2 py-0.5 text-xs font-semibold text-amber-400"
                        >
                          {m.category}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {m.country ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {m.ig_url ? (
                        <a
                          href={m.ig_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          ver
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{m.total_calls}</TableCell>
                    <TableCell>
                      <OutcomeMini outcome={last?.outcome ?? null} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {last?.closer_name ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      {m.total_calls > 0 ? (
                        <span
                          className="inline-block min-w-10 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums text-white"
                          style={{ background: scoreColor(m.avg_score) }}
                        >
                          {m.avg_score}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                      {fmtDate(m.last_call_date)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <CallDetailDrawer
        callId={selectedCallId}
        open={drawerOpen}
        onOpenChange={(v) => {
          setDrawerOpen(v);
          if (!v) setSelectedCallId(null);
        }}
      />
    </div>
  );
};

const Stat = ({
  label,
  value,
  hint,
  color,
}: {
  label: string;
  value: string | number;
  hint?: string;
  color: string;
}) => (
  <div className="rounded-xl border border-border bg-muted/20 p-3">
    <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
      {label}
    </div>
    <div className="mt-1 text-2xl font-bold tabular-nums" style={{ color }}>
      {value}
    </div>
    {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
  </div>
);

export default AgencyModels;
