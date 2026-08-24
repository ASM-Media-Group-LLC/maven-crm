import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import StatChip from "@/components/StatChip";
import KpiDetailDialog, { type KpiRow } from "@/components/dashboard/KpiDetailDialog";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Image as ImageIcon,
  Users,
  CheckCircle2,
  XCircle,
  Percent,
} from "lucide-react";
import {
  useChatterProfiles,
  useChatterVaultCounts,
  useChatterEvaluationStats,
  type StatsRange,
} from "@/hooks/useChatterEvaluator";
import type { ChatterProfile } from "./types";
import ChatterEvaluatorHeader from "./ChatterEvaluatorHeader";

const ProfileCard = ({
  profile,
  vaultCount,
}: {
  profile: ChatterProfile;
  vaultCount: number;
}) => {
  const initials = profile.name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <Link
      to={`/chatter-evaluator/${profile.key}`}
      className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <Card className="overflow-hidden transition-colors hover:border-primary/40">
        <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-muted">
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.name}
              className="h-full w-full object-cover"
              style={{
                objectPosition: `${profile.avatar_x ?? 50}% ${profile.avatar_y ?? 50}%`,
                transform: `scale(${(profile.avatar_zoom ?? 100) / 100})`,
              }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-3xl font-semibold text-muted-foreground">
              {initials}
            </div>
          )}
        </div>
        <CardContent className="space-y-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold">{profile.name}</h3>
              {profile.location && (
                <p className="truncate text-xs text-muted-foreground">
                  {profile.location}
                  {profile.age ? ` · ${profile.age}` : ""}
                </p>
              )}
            </div>
            <Badge variant="secondary" className="shrink-0">
              <ImageIcon className="mr-1 h-3 w-3" />
              {vaultCount}
            </Badge>
          </div>
          {profile.nationality && (
            <p className="text-xs text-muted-foreground">{profile.nationality}</p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
};

// StatCard — wrapper sobre KpiCard estándar para consistencia con
// dashboards globales.
const StatCard = ({
  icon,
  label,
  value,
  color = "bg-primary",
  onClick,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  color?: string;
  onClick?: () => void;
}) => <StatChip label={label} value={value} icon={icon} color={color} onClick={onClick} />;

const ChatterEvaluatorContent = () => {
  const profilesQ = useChatterProfiles();
  const vaultCountsQ = useChatterVaultCounts();
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  // Pasamos el rango custom al hook para que recompute el bucket `custom`
  // cuando el user elige fechas en el DateRangePicker. Si no hay rango
  // completo, el hook ignora customRange y los buckets week/month/all
  // siguen siendo los únicos válidos.
  const statsQ = useChatterEvaluationStats({
    from: dateRange.from,
    to: dateRange.to,
  });
  type KpiKey = "total" | "approved" | "rejected" | "rate";
  const [kpiPopup, setKpiPopup] = useState<KpiKey | null>(null);
  // Rango activo para los stat cards — los charts ya tienen su propia
  // ventana fija (30 días), así que el toggle solo afecta los 4 cajones
  // de arriba.
  const [statsRange, setStatsRange] = useState<StatsRange>("week");

  const profiles = profilesQ.data ?? [];
  const vaultCounts = vaultCountsQ.data ?? {};
  const totalImages = profiles.reduce((a, p) => a + (vaultCounts[p.id] ?? 0), 0);
  const stats = statsQ.data;
  const counters = stats?.byRange[statsRange];

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      <ChatterEvaluatorHeader />
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* DateRangePicker arriba de los KPIs — alineado a la derecha.
            Range filtra los stats vía statsRange (cuando hay rango
            custom usamos byRange.all). */}
        <div className="space-y-3">
          <div className="flex justify-end">
            <DateRangePicker
              from={dateRange.from}
              to={dateRange.to}
              onApply={(from, to) => {
                setDateRange({ from, to });
                // Si el user eligió un rango completo, los KPI cards lo
                // usan via bucket "custom" (computado en el hook). Si
                // limpia el picker, volvemos al default "week".
                if (from && to) setStatsRange("custom");
                else setStatsRange("week");
              }}
              placeholder="Seleccionar fechas"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              icon={<Users className="h-3.5 w-3.5" />}
              label="Personas evaluadas"
              value={statsQ.isLoading ? "…" : (counters?.total ?? 0)}
              color="bg-primary"
              onClick={() => setKpiPopup("total")}
            />
            <StatCard
              icon={<CheckCircle2 className="h-3.5 w-3.5" />}
              label="Aprobados"
              value={statsQ.isLoading ? "…" : (counters?.approved ?? 0)}
              color="bg-success"
              onClick={() => setKpiPopup("approved")}
            />
            <StatCard
              icon={<XCircle className="h-3.5 w-3.5" />}
              label="Reprobados"
              value={statsQ.isLoading ? "…" : (counters?.rejected ?? 0)}
              color="bg-destructive"
              onClick={() => setKpiPopup("rejected")}
            />
            <StatCard
              icon={<Percent className="h-3.5 w-3.5" />}
              label="Promedio de éxito"
              value={statsQ.isLoading ? "…" : `${counters?.successRatePct ?? 0}%`}
              color="bg-primary"
              onClick={() => setKpiPopup("rate")}
            />
          </div>
        </div>

        {/* Charts: tendencia diaria + top perfiles. Colores: primary
            (apto) / muted-destructive (no apto). Si stats está cargando,
            mostramos skeletons del mismo alto para evitar layout shift. */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="p-4">
              <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
                Evaluaciones últimos 30 días
              </h3>
              <div className="h-[220px]">
                {statsQ.isLoading || !stats ? (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    Cargando…
                  </div>
                ) : stats.total === 0 ? (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    Sin evaluaciones todavía
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={stats.daily}
                      margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        className="stroke-border"
                      />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10 }}
                        interval={Math.ceil(stats.daily.length / 8)}
                      />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          fontSize: 12,
                          background: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar
                        dataKey="apto"
                        name="Aprobados"
                        stackId="a"
                        fill="hsl(var(--primary))"
                        radius={[2, 2, 0, 0]}
                      />
                      <Bar
                        dataKey="noApto"
                        name="Reprobados"
                        stackId="a"
                        fill="hsl(var(--destructive) / 0.7)"
                        radius={[2, 2, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
                Personas evaluadas por mes
              </h3>
              <div className="h-[220px]">
                {statsQ.isLoading || !stats ? (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    Cargando…
                  </div>
                ) : stats.total === 0 ? (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    Sin evaluaciones todavía
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={stats.monthly}
                      margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        className="stroke-border"
                      />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          fontSize: 12,
                          background: "hsl(var(--popover))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 8,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar
                        dataKey="apto"
                        name="Aprobados"
                        stackId="a"
                        fill="hsl(var(--primary))"
                        radius={[2, 2, 0, 0]}
                      />
                      <Bar
                        dataKey="noApto"
                        name="Reprobados"
                        stackId="a"
                        fill="hsl(var(--destructive) / 0.7)"
                        radius={[2, 2, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Perfiles</h2>
            <p className="text-sm text-muted-foreground">
              {profiles.length === 0
                ? ""
                : `${profiles.length} perfiles · ${totalImages} items totales`}
            </p>
          </div>

          {profilesQ.isLoading && (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          )}

          {profilesQ.error && (
            <Card>
              <CardContent className="p-4 text-sm text-destructive">
                Error cargando perfiles: {(profilesQ.error as Error).message}
              </CardContent>
            </Card>
          )}

          {!profilesQ.isLoading && profiles.length === 0 && (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                No hay perfiles aún. La migración inicial debería haberlos
                cargado — corre <code>scripts/migrate-chatters</code> si la
                lista está vacía después del setup inicial.
              </CardContent>
            </Card>
          )}

          {profiles.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {profiles.map((p) => (
                <ProfileCard
                  key={p.id}
                  profile={p}
                  vaultCount={vaultCounts[p.id] ?? 0}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <KpiDetailDialog
        open={kpiPopup !== null}
        onOpenChange={(o) => !o && setKpiPopup(null)}
        title={(() => {
          switch (kpiPopup) {
            case "total": return `Personas Evaluadas — ${counters?.total ?? 0}`;
            case "approved": return `Aprobados — ${counters?.approved ?? 0}`;
            case "rejected": return `Reprobados — ${counters?.rejected ?? 0}`;
            case "rate": return `Tasa de éxito — ${counters?.successRatePct ?? 0}%`;
            default: return "";
          }
        })()}
        subtitle={(() => {
          if (kpiPopup === "rate") return `${counters?.approved ?? 0} aprobados de ${counters?.total ?? 0} totales`;
          if (kpiPopup === "total") return "Total de evaluaciones registradas";
          return undefined;
        })()}
        rows={(() => {
          if (!kpiPopup || !counters) return [];
          if (kpiPopup === "rate") {
            const rate = counters.successRatePct ?? 0;
            return [
              { primary: "Total evaluados", right: String(counters.total) },
              { primary: "Aprobados", right: String(counters.approved), rightTone: "success" as const },
              { primary: "Reprobados", right: String(counters.rejected), rightTone: "destructive" as const },
              { primary: "Tasa de éxito", right: `${rate}%`, rightTone: rate >= 50 ? "success" as const : "warning" as const },
            ];
          }
          const profiles = profilesQ.data ?? [];
          let list: any[] = profiles;
          if (kpiPopup === "approved") list = profiles.filter((p: any) => p.last_status === "apto" || p.status === "apto");
          else if (kpiPopup === "rejected") list = profiles.filter((p: any) => p.last_status === "no_apto" || p.status === "no_apto");
          const tone = (status?: string): KpiRow["rightTone"] =>
            status === "apto" ? "success" : status === "no_apto" ? "destructive" : "default";
          return list.slice(0, 100).map((p: any): KpiRow => ({
            primary: p.full_name ?? p.name ?? "Sin nombre",
            secondary: p.role ?? p.position ?? undefined,
            right: p.last_status ?? p.status ?? "—",
            rightTone: tone(p.last_status ?? p.status),
          }));
        })()}
      />
    </main>
  );
};

export default ChatterEvaluatorContent;
