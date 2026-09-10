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

const NET_LABEL: Record<string, string> = { instagram: "IG", x: "X", telegram: "TG", facebook: "FB" };

function scoreColor(score: number): string {
  if (score >= 70) return "text-success";
  if (score >= 40) return "text-warning";
  return "text-destructive";
}

function PartialBadge({ r }: { r: PromoPeriodScore }) {
  return (
    <Badge variant="outline" className="h-4 px-1 text-[10px] text-warning border-warning/50" title={`Solo se leyó el ${r.coverage_pct ?? "?"}% de la ventana — score con poca evidencia, tomalo con pinzas`}>
      parcial
    </Badge>
  );
}

/** Desglose completo del score — mismo contenido en filas y podio (cero pérdida de datos). */
function DetailLine({ r, center = false }: { r: PromoPeriodScore; center?: boolean }) {
  return (
    <div className={center ? "text-[10px] leading-snug text-muted-foreground text-center" : "text-[11px] text-muted-foreground truncate"}>
      {(r.target_networks || []).map((n) => NET_LABEL[n] ?? n).join("·") || "—"}
      {" · "}frec {Math.round(r.freq_pts)} · calidad {Math.round(r.quality_pts)} · const {Math.round(r.consistency_pts)}
      {r.lift_pct != null && (
        <span className={r.lift_pct >= 0 ? "text-success" : "text-destructive"} title={`Ingreso del día siguiente a un día con promo vs sin promo, sobre ${r.lift_n_promo}v${r.lift_n_quiet} días liquidados`}>
          {" "}· ${r.lift_pct >= 0 ? "+" : ""}{Math.round(r.lift_pct)}% con promo
        </span>
      )}
      {(r.manual_share ?? 0) >= 50 && (
        <span className="text-warning" title={`El ${Math.round(r.manual_share!)}% de sus promo-días viene SOLO de registros manuales (sin lectura del bot)`}> · ✍️ {Math.round(r.manual_share!)}% manual</span>
      )}
    </div>
  );
}

/** Delta vs la ventana de 7 días anterior. Solo se muestra si el dato previo existe. */
function Delta({ now, prev }: { now: number; prev: number | undefined }) {
  if (prev == null) return null;
  const d = now - prev;
  if (d === 0) {
    return <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground" title="Sin cambio vs los 7 días anteriores">=</span>;
  }
  const up = d > 0;
  return (
    <span
      className={`shrink-0 text-[10px] font-medium tabular-nums ${up ? "text-success" : "text-destructive"}`}
      title={`${up ? "Subió" : "Bajó"} ${Math.abs(d)} pts vs los 7 días anteriores (${prev} → ${now})`}
    >
      {up ? "▲" : "▼"}{Math.abs(d)}
    </span>
  );
}

// Estética del podio: tamaño descendente 1° > 2° > 3°, corona de oro para la 1ª
// y medallas plata/bronce — tokens warning/muted/accent, sin animación.
const PODIUM_STYLE: Array<{ size: UserAvatarSize; iconCls: string; label: string }> = [
  { size: "xl", iconCls: "text-warning", label: "1°" },
  { size: "lg", iconCls: "text-muted-foreground", label: "2°" },
  { size: "md", iconCls: "text-accent", label: "3°" },
];

function PodiumSlot({ r, rank, photo, prev }: { r: PromoPeriodScore; rank: number; photo: string | null; prev: number | undefined }) {
  const st = PODIUM_STYLE[rank - 1];
  const MedalIcon = rank === 1 ? Crown : Medal;
  return (
    <div className="flex min-w-0 flex-col items-center gap-1">
      <MedalIcon className={`h-4 w-4 ${st.iconCls}`} aria-hidden />
      <UserAvatar name={r.name} src={photo} size={st.size} ring={rank === 1} />
      <div className="flex w-full min-w-0 items-center justify-center gap-1">
        <span className={`shrink-0 text-[10px] font-semibold ${st.iconCls}`}>{st.label}</span>
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
            <h3 className="text-sm font-semibold">Score de promo — últimos 7 días</h3>
            <p className="text-[11px] text-muted-foreground">
              0-100 sobre días leídos · frecuencia 40 · calidad 40 (= promedio de las barritas del día: mejor promo × creatividad IA + 2ª red + volumen) · constancia 20
            </p>
          </div>
          <span title="El score mide el cumplimiento del plan de promo de CADA creadora (sus redes objetivo). Los días que el scan no pudo leer NO castigan. '$ con promo' compara el ingreso del día siguiente a un día con promo vs sin promo (BLU liquidado) — es señal aparte, no entra al score. ▲/▼ compara contra los 7 días anteriores.">
            <Info className="h-4 w-4 text-muted-foreground" />
          </span>
        </div>
        {isLoading ? (
          <p className="text-xs text-muted-foreground py-4 text-center">Calculando…</p>
        ) : !ordered.length ? (
          <p className="text-xs text-muted-foreground py-4 text-center">Sin lecturas en la ventana.</p>
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
