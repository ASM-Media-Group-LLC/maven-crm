import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { startOfDay, startOfWeek, startOfMonth } from "date-fns";
import { useEarningsData } from "../sales-performance/useEarningsData";
import { usePeriodComparison } from "./usePeriodComparison";
import { ChevronRight, TrendingUp, Zap, Flame } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Period = "Hoy" | "7 días" | "Este mes";
const periods: Period[] = ["Hoy", "7 días", "Este mes"];
const getDateRange = (period: Period) => {
  const now = new Date();
  const today = startOfDay(now);
  switch (period) {
    case "Hoy": return { from: today, to: today };
    case "7 días": return { from: startOfWeek(today, { weekStartsOn: 1 }), to: today };
    case "Este mes": return { from: startOfMonth(today), to: today };
  }
};
const fmt = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n.toFixed(0)}`;
const initials = (name: string | null) => (name || "?").slice(0, 2).toUpperCase();

const SubiendoPage = () => {
  const [activePeriod, setActivePeriod] = useState<Period>("Este mes");
  const { data: allRows = [], isLoading } = useEarningsData();
  const dateRange = useMemo(() => getDateRange(activePeriod), [activePeriod]);
  const comparison = usePeriodComparison(allRows, dateRange);
  const navigate = useNavigate();

  const rising = comparison.rising;
  const avgGrowth = rising.length > 0 ? rising.reduce((s, c) => s + c.changePercent, 0) / rising.length : 0;
  const momentum = rising.filter(c => c.changePercent > 15).length;

  const kpis = [
    { title: "Creadoras subiendo", value: rising.length.toString(), icon: TrendingUp, color: "text-success", bgColor: "bg-success/10" },
    { title: "Crecimiento promedio", value: `${avgGrowth.toFixed(1)}%`, icon: Zap, color: "text-primary", bgColor: "bg-primary/10" },
    { title: "Momentum (>15%)", value: momentum.toString(), icon: Flame, color: "text-warning", bgColor: "bg-warning/10" },
  ];

  return (
    <main className="flex-1 overflow-auto p-6 space-y-6">
            {isLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Cargando datos…</div>
            ) : (
              <>
                <div className="space-y-4">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <button onClick={() => navigate("/sales-overview")} className="hover:text-foreground transition-colors">Creator Sales</button>
                    <ChevronRight className="h-3 w-3" />
                    <span className="text-foreground font-medium">Subiendo</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <h1 className="text-2xl font-bold text-foreground">Subiendo</h1>
                      <p className="text-sm text-muted-foreground">Crecimiento positivo</p>
                    </div>
                    <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
                      {periods.map((p) => (
                        <Button key={p} variant={activePeriod === p ? "secondary" : "ghost"} size="sm" onClick={() => setActivePeriod(p)} className="text-xs">{p}</Button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {kpis.map((k) => (
                    <Card key={k.title} className="transition-all duration-200 hover:scale-[1.03] hover:shadow-lg">
                      <CardContent className="p-4 space-y-2">
                        <div className="flex items-center gap-2">
                          <div className={`p-1.5 rounded-md ${k.bgColor}`}>
                            <k.icon className={`h-4 w-4 ${k.color}`} />
                          </div>
                          <span className="text-xs font-medium text-muted-foreground">{k.title}</span>
                        </div>
                        <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {rising.length > 0 ? (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Ordenadas por mayor crecimiento</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-auto max-h-[calc(100vh-28rem)]">
                        <Table>
                          <TableHeader className="sticky top-0 z-10 bg-card">
                            <TableRow>
                              <TableHead>Creadora</TableHead>
                              <TableHead className="text-right">Crecimiento %</TableHead>
                              <TableHead className="text-right">Earnings Actual</TableHead>
                              <TableHead className="text-right">Earnings Anterior</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {rising.map((c) => (
                              <TableRow key={c.creatorKey}>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <Avatar className="h-8 w-8"><AvatarFallback className="text-xs">{initials(c.artisticName)}</AvatarFallback></Avatar>
                                    <span className="text-sm font-medium">{c.artisticName || "—"}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-right text-success font-medium">+{c.changePercent.toFixed(1)}%</TableCell>
                                <TableCell className="text-right font-medium">{fmt(c.currentEarnings)}</TableCell>
                                <TableCell className="text-right text-muted-foreground">{fmt(c.previousEarnings)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 bg-muted/50 rounded-lg">
                    <TrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
                    <h4 className="text-lg font-semibold">Sin tendencias al alza</h4>
                    <p className="text-sm text-muted-foreground">No hay creadoras con tendencia al alza en este periodo</p>
                  </div>
                )}
              </>
            )}
          </main>
  );
};

export default SubiendoPage;
