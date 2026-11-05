import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Loader2, TrendingUp } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useTendenciaArgos } from "@/hooks/useTendenciaArgos";

// GRÁFICA de tendencia de Argos (Alvaro, 04/11): cómo viene el equipo día a día
// —pantalla%, cámara%, atención%— en los últimos N días. Así Argos deja de ser
// solo "hoy" y se ve el pasado de un vistazo. Los colores son de serie (distintos
// entre sí, legibles en claro y oscuro); el resto usa los tokens del tema.

const DIAS = 14;
const COLOR = {
  pantalla: "hsl(var(--primary))",
  camara: "hsl(199 89% 56%)",
  atencion: "hsl(262 83% 66%)",
} as const;

function fechaCorta(ymd: string): string {
  const [, m, d] = ymd.split("-").map(Number);
  return `${d}/${m}`;
}

export function ArgosTendencia() {
  const { t } = useLanguage();
  const { dias, cargando, error } = useTendenciaArgos(DIAS);

  const data = useMemo(
    () => dias.map((d) => ({ dia: fechaCorta(d.dia), pantalla: d.pantalla, camara: d.camara, atencion: d.atencion })),
    [dias],
  );

  const series: Array<{ key: "pantalla" | "camara" | "atencion"; label: string }> = [
    { key: "pantalla", label: t("hr.resumen.pantalla") },
    { key: "camara", label: t("hr.resumen.camara") },
    { key: "atencion", label: t("hr.resumen.atencion") },
  ];

  return (
    <div className="rounded-2xl border border-border/40 bg-card/20 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">{t("hr.panel.tendenciaTitulo")}</h3>
        <span className="text-xs text-muted-foreground">· {t("hr.panel.tendenciaDias", { n: DIAS })}</span>
        {/* Leyenda */}
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COLOR[s.key] }} />
              {s.label}
            </span>
          ))}
        </div>
      </div>

      {cargando && data.length === 0 ? (
        <div className="flex h-56 items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : error || data.length < 2 ? (
        <div className="flex h-56 items-center justify-center text-center text-sm text-muted-foreground">{t("hr.panel.tendenciaVacio")}</div>
      ) : (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="dia" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} />
              <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} unit="%" width={44} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12, color: "hsl(var(--popover-foreground))" }}
                labelStyle={{ color: "hsl(var(--muted-foreground))" }}
                formatter={(v: number | null, name) => [v == null ? "—" : `${v}%`, name]}
              />
              {series.map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={COLOR[s.key]}
                  strokeWidth={2}
                  dot={{ r: 2.5, strokeWidth: 0, fill: COLOR[s.key] }}
                  activeDot={{ r: 4 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
