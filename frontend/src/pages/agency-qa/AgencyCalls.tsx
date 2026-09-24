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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import {
  useQaCalls,
  useQaClosers,
  useQaModels,
  useFireQaWebhook,
  scoreColor,
  type QaCallRow,
  type CallOutcome,
} from "@/hooks/useAgencyQa";
import OutcomeBadge from "@/components/agency-qa/OutcomeBadge";
import { useFormato } from "@/hooks/useFormato";
import type { Formato } from "@/lib/formato";

// Calls subtab — Kash-style table with model avatar, closer, evaluator,
// outcome badge, score pill, and resend email button.
// Click a row → opens full-page CallDetailPage (via onOpenDetail callback).

const OUTCOME_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "Todos los resultados" },
  { value: "cerro", label: "Exitoso" },
  { value: "no_cerro", label: "Rechazado" },
  { value: "en_espera", label: "En espera" },
];

const fmtDate = (iso: string, f: Formato) => {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(f.intl("es-ES"), {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const Avatar = ({
  name,
  dataUrl,
  size = 32,
}: {
  name: string;
  dataUrl: string | null;
  size?: number;
}) => {
  const initial = (name?.trim().charAt(0) || "?").toUpperCase();
  let h = 0;
  for (let i = 0; i < name.length; i++)
    h = (h * 31 + name.charCodeAt(i)) % 360;
  const bg = `linear-gradient(135deg, hsl(${h}, 40%, 30%) 0%, hsl(${(h + 60) % 360}, 50%, 20%) 100%)`;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-bold text-white/90"
      style={{ width: size, height: size, background: bg }}
    >
      {dataUrl ? (
        <img src={dataUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        initial
      )}
    </span>
  );
};

const OutcomeBadgeWithFallback = ({ outcome }: { outcome: CallOutcome }) => {
  const badge = <OutcomeBadge outcome={outcome} size="sm" />;
  if (badge) return badge;
  return (
    <span className="inline-flex h-6 items-center rounded-full bg-muted/40 px-2 text-[11px] font-semibold text-muted-foreground">
      —
    </span>
  );
};

const ScorePill = ({ score }: { score: number }) => (
  <span
    className="inline-flex min-w-[40px] items-center justify-center rounded-full px-2.5 py-1 text-xs font-bold tabular-nums text-white"
    style={{ background: scoreColor(score) }}
  >
    {score}
  </span>
);

interface AgencyCallsProps {
  onOpenDetail?: (callId: string) => void;
}

const AgencyCalls = ({ onOpenDetail }: AgencyCallsProps) => {
  const f = useFormato();
  const [search, setSearch] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");
  const [closerFilter, setCloserFilter] = useState<string>("all");
  const [modelFilter, setModelFilter] = useState<string>("all");

  const callsQ = useQaCalls({
    search,
    outcome:
      outcomeFilter === "all"
        ? undefined
        : (outcomeFilter as CallOutcome),
    closerId: closerFilter === "all" ? undefined : closerFilter,
    modelId: modelFilter === "all" ? undefined : modelFilter,
  });
  const closersQ = useQaClosers();
  const modelsQ = useQaModels();
  const fireWebhook = useFireQaWebhook();

  const rows = callsQ.data ?? [];

  const stats = useMemo(() => {
    const total = rows.length;
    let cerro = 0;
    let noCerro = 0;
    let scoreSum = 0;
    for (const r of rows) {
      const o = r.claude_analysis?.call_outcome;
      if (o === "cerro") cerro++;
      else if (o === "no_cerro") noCerro++;
      scoreSum += r.claude_score;
    }
    const avgScore = total > 0 ? scoreSum / total : 0;
    const closeRate = total > 0 ? cerro / total : 0;
    return { total, cerro, noCerro, avgScore, closeRate };
  }, [rows]);

  const handleResendEmail = async (
    e: React.MouseEvent,
    callId: string
  ) => {
    e.stopPropagation();
    try {
      await fireWebhook.mutateAsync({ callId });
      toast.success("Email reenviado");
    } catch (err) {
      toast.error("No se pudo reenviar el email", {
        description: (err as Error).message,
      });
    }
  };

  return (
    <div className="space-y-5">
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Análisis"
          value={stats.total}
          hint="cargados"
          color="rgb(148 163 184)"
        />
        <Stat
          label="Exitosos"
          value={stats.cerro}
          hint={
            stats.total
              ? `${(stats.closeRate * 100).toFixed(0)}% close rate`
              : ""
          }
          color="rgb(22 163 74)"
        />
        <Stat
          label="Rechazados"
          value={stats.noCerro}
          hint="no cerraron"
          color="rgb(220 38 38)"
        />
        <Stat
          label="Score promedio"
          value={stats.total ? stats.avgScore.toFixed(0) : "—"}
          hint={stats.total ? "/ 100" : ""}
          color={scoreColor(stats.avgScore)}
        />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por evaluador…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OUTCOME_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={closerFilter} onValueChange={setCloserFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Closer" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los closers</SelectItem>
            {closersQ.data?.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={modelFilter} onValueChange={setModelFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Modelo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las modelos</SelectItem>
            {modelsQ.data?.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {callsQ.isLoading ? "Cargando…" : `${rows.length} de ≤200`}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {callsQ.isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium">Sin análisis para mostrar</p>
            <p className="text-xs text-muted-foreground">
              Sube una nueva grabación desde &ldquo;Nueva QA&rdquo; o ajusta los
              filtros.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="text-xs font-bold">
                  Fecha
                </TableHead>
                <TableHead className="text-xs font-bold">
                  Modelo
                </TableHead>
                <TableHead className="text-xs font-bold">
                  Closer
                </TableHead>
                <TableHead className="text-xs font-bold">
                  Evaluador
                </TableHead>
                <TableHead className="text-xs font-bold">
                  Resultado
                </TableHead>
                <TableHead className="text-right text-xs font-bold">
                  Score
                </TableHead>
                <TableHead className="w-[80px] text-center text-xs font-bold">
                  Reenviar
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row: QaCallRow) => {
                const outcome = row.claude_analysis?.call_outcome ?? null;
                return (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer transition-colors hover:bg-muted/30"
                    onClick={() => onOpenDetail?.(row.id)}
                  >
                    <TableCell className="tabular-nums text-sm">
                      {fmtDate(row.call_date, f)}
                    </TableCell>
                    <TableCell>
                      {row.model ? (
                        <div className="flex items-center gap-2.5">
                          <Avatar
                            name={row.model.name}
                            dataUrl={row.model.avatar_data_url}
                            size={32}
                          />
                          <span className="text-sm font-medium">
                            {row.model.name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.closer?.name ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.evaluator_name}
                    </TableCell>
                    <TableCell>
                      <OutcomeBadgeWithFallback outcome={outcome} />
                    </TableCell>
                    <TableCell className="text-right">
                      <ScorePill score={row.claude_score} />
                    </TableCell>
                    <TableCell className="text-center">
                      <button
                        type="button"
                        onClick={(e) => handleResendEmail(e, row.id)}
                        disabled={fireWebhook.isPending}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-50"
                        title="Reenviar email"
                      >
                        <Mail className="h-4 w-4" />
                      </button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
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
  <div className="rounded-xl border border-border/60 bg-card p-4">
    <div className="text-xs font-bold text-muted-foreground">
      {label}
    </div>
    <div className="mt-1 text-2xl font-bold tabular-nums" style={{ color }}>
      {value}
    </div>
    {hint && (
      <div className="text-[11px] text-muted-foreground">{hint}</div>
    )}
  </div>
);

export default AgencyCalls;
