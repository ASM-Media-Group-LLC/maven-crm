// Leaderboard del SCORE de promo v2 (0-100, ventana móvil 7 días) para la pestaña
// Dashboard de Promolog. Misma fuente que los reportes de WhatsApp (RPC
// promo_creator_period_scores) — el day-score viejo (barrita IG 60%) queda solo
// como detalle del día en la tabla; el RANKING es esto.
import { useState } from "react";
import { ChevronDown, ChevronUp, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePromoPeriodScores, type PromoPeriodScore } from "./usePromoPeriodScores";

const NET_LABEL: Record<string, string> = { instagram: "IG", x: "X", telegram: "TG", facebook: "FB" };

function scoreColor(score: number): string {
  if (score >= 70) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 40) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function Row({ r, rank }: { r: PromoPeriodScore; rank: number }) {
  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-border/40 last:border-0">
      <span className="w-6 text-right text-xs text-muted-foreground shrink-0">{rank}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{r.name}</span>
          {r.is_partial && (
            <Badge variant="outline" className="h-4 px-1 text-[10px] text-amber-600 border-amber-400/50" title={`Solo se leyó el ${r.coverage_pct ?? "?"}% de la ventana — score con poca evidencia, tomalo con pinzas`}>
              parcial
            </Badge>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground truncate">
          {(r.target_networks || []).map((n) => NET_LABEL[n] ?? n).join("·") || "—"}
          {" · "}frec {Math.round(r.freq_pts)} · calidad {Math.round(r.quality_pts)} · const {Math.round(r.consistency_pts)}
          {r.lift_pct != null && (
            <span className={r.lift_pct >= 0 ? "text-emerald-600" : "text-red-500"} title={`Ingreso del día siguiente a un día con promo vs sin promo, sobre ${r.lift_n_promo}v${r.lift_n_quiet} días liquidados`}>
              {" "}· ${r.lift_pct >= 0 ? "+" : ""}{Math.round(r.lift_pct)}% con promo
            </span>
          )}
          {(r.manual_share ?? 0) >= 50 && (
            <span className="text-amber-600" title={`El ${Math.round(r.manual_share!)}% de sus promo-días viene SOLO de registros manuales (sin lectura del bot)`}> · ✍️ {Math.round(r.manual_share!)}% manual</span>
          )}
        </div>
      </div>
      <span className={`text-base font-bold tabular-nums shrink-0 ${scoreColor(r.score)}`}>{r.score}</span>
    </div>
  );
}

export default function PromoScoreLeaderboard() {
  const { data: scores = [], isLoading } = usePromoPeriodScores(7);
  const [expanded, setExpanded] = useState(false);

  const conLectura = scores.filter((s) => s.covered_days > 0);
  const sinLectura = scores.length - conLectura.length;
  const ordered = [...conLectura].sort((a, b) =>
    Number(a.is_partial) - Number(b.is_partial) || b.score - a.score || a.name.localeCompare(b.name));
  const visible = expanded ? ordered : ordered.slice(0, 8);

  return (
    <Card>
      <CardContent className="pt-4 px-4 pb-3">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-sm font-semibold">Score de promo — últimos 7 días</h3>
            <p className="text-[11px] text-muted-foreground">
              0-100 sobre días leídos · frecuencia 40 · calidad 40 (= promedio de las barritas del día: mejor promo × creatividad IA + 2ª red + volumen) · constancia 20
            </p>
          </div>
          <span title="El score mide el cumplimiento del plan de promo de CADA creadora (sus redes objetivo). Los días que el scan no pudo leer NO castigan. '$ con promo' compara el ingreso del día siguiente a un día con promo vs sin promo (BLU liquidado) — es señal aparte, no entra al score.">
            <Info className="h-4 w-4 text-muted-foreground" />
          </span>
        </div>
        {isLoading ? (
          <p className="text-xs text-muted-foreground py-4 text-center">Calculando…</p>
        ) : !ordered.length ? (
          <p className="text-xs text-muted-foreground py-4 text-center">Sin lecturas en la ventana.</p>
        ) : (
          <>
            {visible.map((r, i) => <Row key={r.creator_id} r={r} rank={i + 1} />)}
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                onClick={() => setExpanded((e) => !e)}
              >
                {expanded ? <><ChevronUp className="h-3 w-3" /> Ver menos</> : <><ChevronDown className="h-3 w-3" /> Ver las {ordered.length}</>}
              </button>
              {sinLectura > 0 && (
                <span className="text-[11px] text-muted-foreground" title="Sin ninguna lectura del scan en la ventana — no puntúan (no se convierte 'no poder leer' en mal score)">
                  {sinLectura} sin lectura (no puntúan)
                </span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
