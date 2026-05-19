import { useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Phone, Trophy, TrendingUp } from "lucide-react";

// Extras del subtab Dashboard de LeadGen:
//   · Top 3 LLGs (mini ranking por phones, mismo criterio que el hero)
//   · Phones por día (área chart, 30 días default o el rango activo)
//   · Distribución por categoría (donut)

interface TopLlg {
  name: string;
  phones: number;
  nuevos: number;
}

interface PhonesDailyPoint {
  date: string;
  count: number;
  label: string;
}

interface ByQuality {
  [key: string]: number;
}

interface Props {
  topLlgs: TopLlg[]; // ya ordenados — top 3
  phonesDaily: PhonesDailyPoint[];
  byQuality: ByQuality;
  rangeLabel?: string;
  loading?: boolean;
}

// Colores para el donut — match con las KpiCards de categorías
const QUALITY_COLORS: Record<string, string> = {
  "a+": "#3b82f6",  // blue-500
  "a":  "#10b981",  // emerald-500
  "b+": "#f59e0b",  // amber-500
  "b":  "#d97706",  // amber-600
  "c":  "#64748b",  // slate-500
};
const QUALITY_LABELS: Record<string, string> = {
  "a+": "A+", "a": "A", "b+": "B+", "b": "B", "c": "C",
};
const QUALITY_ORDER = ["a+", "a", "b+", "b", "c"];

const initials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

const tooltipStyle: React.CSSProperties = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: "12px",
};

const LeadGenDashboardExtras = ({ topLlgs, phonesDaily, byQuality, rangeLabel, loading }: Props) => {
  // Datos del donut: solo categorías con count > 0 (no mostrar slices vacíos)
  const donutData = useMemo(() => {
    return QUALITY_ORDER
      .map((q) => ({ key: q, name: QUALITY_LABELS[q], value: byQuality[q] ?? 0 }))
      .filter((d) => d.value > 0);
  }, [byQuality]);

  const totalPhones = useMemo(
    () => phonesDaily.reduce((sum, p) => sum + p.count, 0),
    [phonesDaily],
  );

  // Layout: 3 visuals en una sola fila (12 cols totales).
  //   · Top 3 LLGs ........ 4 cols (ranking compacto vertical)
  //   · Chart phones/día .. 5 cols (necesita ancho para el eje X de 30 días)
  //   · Donut categorías .. 3 cols (compacto con legend abajo)
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
      {/* Top 3 LLGs — col-span 4 en lg */}
      <Card className="lg:col-span-4">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold">Top 3 LLGs</h3>
            {rangeLabel && (
              <span className="text-[10px] text-muted-foreground ml-auto uppercase tracking-wider">
                {rangeLabel}
              </span>
            )}
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : topLlgs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin actividad en el rango.</p>
          ) : (
            <ol className="space-y-2">
              {topLlgs.map((llg, idx) => {
                // Medalla visual: 1° oro, 2° plata, 3° bronce
                const medalColor = idx === 0
                  ? "bg-amber-500/20 text-amber-200 ring-amber-400/40"
                  : idx === 1
                  ? "bg-slate-400/20 text-slate-200 ring-slate-300/40"
                  : "bg-orange-700/20 text-orange-200 ring-orange-500/40";
                return (
                  <li key={llg.name} className="flex items-center gap-3">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-bold text-sm ring-1 ${medalColor}`}>
                      {idx + 1}
                    </div>
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="bg-muted text-xs">
                        {initials(llg.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" title={llg.name}>{llg.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {llg.nuevos} nuevos · <span className="font-semibold text-foreground">{llg.phones} tel</span>
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* Chart phones/día — col-span 5 en lg */}
      <Card className="lg:col-span-5">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Teléfonos obtenidos por día</h3>
            <span className="text-[10px] text-muted-foreground ml-auto uppercase tracking-wider">
              {totalPhones} total · {rangeLabel ?? "últimos 30 días"}
            </span>
          </div>
          <div className="h-[180px]">
            {phonesDaily.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                Sin datos para el rango
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={phonesDaily} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="phonesGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={{ stroke: "hsl(var(--border))" }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                    formatter={(value: number) => [`${value} teléfono${value === 1 ? "" : "s"}`, ""]}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#phonesGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Donut por categoría — col-span 3 en lg.
          Pequeño + legend abajo. Compacto para no robar espacio
          al chart de phones (que es la métrica más interactiva). */}
      <Card className="lg:col-span-3">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-500" />
            <h3 className="text-sm font-semibold">Por categoría</h3>
          </div>
          <div className="h-[180px]">
            {donutData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                Sin datos
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="45%"
                    innerRadius={32}
                    outerRadius={55}
                    paddingAngle={2}
                  >
                    {donutData.map((entry) => (
                      <Cell key={entry.key} fill={QUALITY_COLORS[entry.key]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                    formatter={(value: number, name: string) => [`${value.toLocaleString()} leads`, name]}
                  />
                  <Legend
                    verticalAlign="bottom"
                    align="center"
                    layout="horizontal"
                    iconType="circle"
                    wrapperStyle={{ fontSize: "11px" }}
                    formatter={(value) => <span className="text-[11px] text-foreground">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LeadGenDashboardExtras;
