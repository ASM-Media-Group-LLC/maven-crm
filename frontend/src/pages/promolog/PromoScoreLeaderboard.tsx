// Leaderboard del SCORE de promo v2 (0-100, ventana móvil 7 días) para la pestaña
// Dashboard de Promolog. Misma fuente que los reportes de WhatsApp (RPC
// promo_creator_period_scores) — el day-score viejo (barrita IG 60%) queda solo
// como detalle del día en la tabla; el RANKING es esto.
//
// Ola 3 UX (#106): el ranking dejó de ser un extracto bancario — top 3 en podio
// con UserAvatar (foto o iniciales; las creadoras NO llevan muñequito), corona y
// medallas (oro=warning / plata=muted / bronce=accent), y delta ▲/▼ contra la
// ventana de 7 días ANTERIOR (mismo RPC, diff en cliente). Del 4° en adelante,
// la lista de siempre con avatar chico. Reglas que se respetan:
//   - Los parciales NUNCA suben al podio (si hay <3 con cobertura plena, el
//     podio se achica) — misma regla que el ranking oficial.
//   - Cero pérdida de datos: cada entrada conserva redes objetivo, desglose
//     frec/calidad/const, lift, % manual y el badge "parcial".
import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Crown, Info, Medal } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserAvatar, type UserAvatarSize } from "@/components/UserAvatar";
import { usePromoPeriodScores, type PromoPeriodScore } from "./usePromoPeriodScores";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";

const NET_LABEL: Record<string, string> = { instagram: "IG", x: "X", telegram: "TG", facebook: "FB" };

function scoreColor(score: number): string {
  if (score >= 70) return "text-success";
  if (score >= 40) return "text-warning";
  return "text-destructive";
}

function PartialBadge({ r }: { r: PromoPeriodScore }) {
  const { t } = useLanguage();
  return (
    <Badge variant="outline" className="h-4 px-1 text-[10px] text-warning border-warning/50" title={t("promolog.partialTitle", { pct: r.coverage_pct ?? "?" })}>
      {t("promolog.partial")}
    </Badge>
  );
}

/** Desglose completo del score — mismo contenido en filas y podio (cero pérdida de datos). */
function DetailLine({ r, center = false }: { r: PromoPeriodScore; center?: boolean }) {
  const { t } = useLanguage();
  return (
    <div className={center ? "text-[10px] leading-snug text-muted-foreground text-center" : "text-[11px] text-muted-foreground truncate"}>
      {(r.target_networks || []).map((n) => NET_LABEL[n] ?? n).join("·") || "—"}
      {" · "}{t("promolog.scoreBreakdown", { freq: Math.round(r.freq_pts), quality: Math.round(r.quality_pts), consistency: Math.round(r.consistency_pts) })}
      {r.lift_pct != null && (
        <span className={r.lift_pct >= 0 ? "text-success" : "text-destructive"} title={t("promolog.liftTitle", { promo: r.lift_n_promo, quiet: r.lift_n_quiet })}>
          {" "}· ${t("promolog.liftWithPromo", { pct: `${r.lift_pct >= 0 ? "+" : ""}${Math.round(r.lift_pct)}` })}
        </span>
      )}
      {(r.manual_share ?? 0) >= 50 && (
        <span className="text-warning" title={t("promolog.manualTitle", { pct: Math.round(r.manual_share!) })}> · ✍️ {Math.round(r.manual_share!)}% manual</span>
      )}
    </div>
  );
}

/** Delta vs la ventana de 7 días anterior. Solo se muestra si el dato previo existe. */
function Delta({ now, prev }: { now: number; prev: number | undefined }) {
  const { t } = useLanguage();
  if (prev == null) return null;
  const d = now - prev;
  if (d === 0) {
    return <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground" title={t("promolog.noChangeVsPrev7")}>=</span>;
  }
  const up = d > 0;
  return (
    <span
      className={`shrink-0 text-[10px] font-medium tabular-nums ${up ? "text-success" : "text-destructive"}`}
      title={t(up ? "promolog.upVsPrev7" : "promolog.downVsPrev7", { n: Math.abs(d), prev, now })}
    >
      {up ? "▲" : "▼"}{Math.abs(d)}
    </span>
  );
}

// Estética del podio: tamaño descendente 1° > 2° > 3°, corona de oro para la 1ª
// y medallas plata/bronce — tokens warning/muted/accent, sin animación.
const PODIUM_STYLE: Array<{ size: UserAvatarSize; iconCls: string; labelKey: TranslationKey }> = [
  { size: "xl", iconCls: "text-warning", labelKey: "promolog.rank1" },
  { size: "lg", iconCls: "text-muted-foreground", labelKey: "promolog.rank2" },
  { size: "md", iconCls: "text-accent", labelKey: "promolog.rank3" },
];

function PodiumSlot({ r, rank, photo, prev }: { r: PromoPeriodScore; rank: number; photo: string | null; prev: number | undefined }) {
  const { t } = useLanguage();
  const st = PODIUM_STYLE[rank - 1];
  const MedalIcon = rank === 1 ? Crown : Medal;
  return (
    <div className="flex min-w-0 flex-col items-center gap-1">
      <MedalIcon className={`h-4 w-4 ${st.iconCls}`} aria-hidden />
      <UserAvatar name={r.name} src={photo} size={st.size} ring={rank === 1} />
      <div className="flex w-full min-w-0 items-center justify-center gap-1">
        <span className={`shrink-0 text-[10px] font-semibold ${st.iconCls}`}>{t(st.labelKey)}</span>
        <span className="truncate text-xs font-medium" title={r.name}>{r.name}</span>
      </div>
      {r.is_partial && <PartialBadge r={r} />}
      <div className="flex items-baseline gap-1">
        <span className={`font-display text-lg font-bold tabular-nums ${scoreColor(r.score)}`}>{r.score}</span>
        <Delta now={r.score} prev={prev} />
      </div>
      <DetailLine r={r} center />
    </div>
  );
}

function Row({ r, rank, photo, prev }: { r: PromoPeriodScore; rank: number; photo: string | null; prev: number | undefined }) {
  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-border/40 last:border-0">
      <span className="w-6 text-right text-xs text-muted-foreground shrink-0">{rank}</span>
      <UserAvatar name={r.name} src={photo} size="xs" className="shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{r.name}</span>
          {r.is_partial && <PartialBadge r={r} />}
        </div>
        <DetailLine r={r} />
      </div>
      <Delta now={r.score} prev={prev} />
      <span className={`text-base font-bold tabular-nums shrink-0 ${scoreColor(r.score)}`}>{r.score}</span>
    </div>
  );
}

interface Props {
  /** Roster (id + foto) para las caras del podio/filas; sin foto → iniciales. */
  creators?: Array<{ id: string; profile_photo_url: string | null }>;
}

export default function PromoScoreLeaderboard({ creators }: Props) {
  const { t } = useLanguage();
  const { data: scores = [], isLoading } = usePromoPeriodScores(7);
  // Ventana ANTERIOR (los 7 días previos) para los deltas ▲/▼ del podio y filas.
  const { data: prevScores = [] } = usePromoPeriodScores(7, 7);
  const [expanded, setExpanded] = useState(false);

  const photoByCreator = useMemo(
    () => new Map((creators ?? []).map((c) => [c.id, c.profile_photo_url])),
    [creators],
  );
  const prevByCreator = useMemo(
    () => new Map(prevScores.filter((s) => s.covered_days > 0).map((s) => [s.creator_id, s.score])),
    [prevScores],
  );

  const conLectura = scores.filter((s) => s.covered_days > 0);
  const sinLectura = scores.length - conLectura.length;
  const ordered = [...conLectura].sort((a, b) =>
    Number(a.is_partial) - Number(b.is_partial) || b.score - a.score || a.name.localeCompare(b.name));
  // Podio SOLO con scores de cobertura plena (los parciales nunca rankean); el
  // sort ya los deja primeros, así que basta con acotar el corte.
  const podiumCount = Math.min(3, ordered.filter((s) => !s.is_partial).length);
  const podium = ordered.slice(0, podiumCount);
  const rest = ordered.slice(podiumCount);
  // Mismo total visible por defecto que antes (8): podio + primeras filas.
  const visibleRest = expanded ? rest : rest.slice(0, Math.max(0, 8 - podiumCount));
  // Orden visual clásico del podio: 2° · 1° · 3° (con 1-2 entradas, tal cual).
  const podiumOrder = podium.length === 3 ? [podium[1], podium[0], podium[2]] : podium;

  return (
    <Card>
      <CardContent className="pt-4 px-4 pb-3">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-sm font-semibold">{t("promolog.scoreTitle")}</h3>
            <p className="text-[11px] text-muted-foreground">
              {t("promolog.scoreDesc")}
            </p>
          </div>
          <span title={t("promolog.scoreInfo")}>
            <Info className="h-4 w-4 text-muted-foreground" />
          </span>
        </div>
        {isLoading ? (
          <p className="text-xs text-muted-foreground py-4 text-center">{t("promolog.calculating")}</p>
        ) : !ordered.length ? (
          <p className="text-xs text-muted-foreground py-4 text-center">{t("promolog.noReadsInWindow")}</p>
        ) : (
          <>
            {podium.length > 0 && (
              <div className={`mb-3 grid items-end gap-2 border-b border-border/40 pb-3 ${podium.length === 3 ? "grid-cols-3" : podium.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
                {podiumOrder.map((r) => (
                  <PodiumSlot
                    key={r.creator_id}
                    r={r}
                    rank={podium.indexOf(r) + 1}
                    photo={photoByCreator.get(r.creator_id) ?? null}
                    prev={prevByCreator.get(r.creator_id)}
                  />
                ))}
              </div>
            )}
            {visibleRest.map((r, i) => (
              <Row
                key={r.creator_id}
                r={r}
                rank={podiumCount + i + 1}
                photo={photoByCreator.get(r.creator_id) ?? null}
                prev={prevByCreator.get(r.creator_id)}
              />
            ))}
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                onClick={() => setExpanded((e) => !e)}
              >
                {expanded ? <><ChevronUp className="h-3 w-3" /> {t("promolog.showLess")}</> : <><ChevronDown className="h-3 w-3" /> {t("promolog.showAllN", { count: ordered.length })}</>}
              </button>
              {sinLectura > 0 && (
                <span className="text-[11px] text-muted-foreground" title={t("promolog.noReadTitle")}>
                  {t("promolog.noReadCount", { count: sinLectura })}
                </span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
