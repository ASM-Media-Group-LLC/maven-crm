import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { startOfDay, startOfWeek, startOfMonth } from "date-fns";
import { useEarningsData } from "../sales-performance/useEarningsData";
import { usePeriodComparison } from "./usePeriodComparison";
import { ChevronRight, Trophy, Crown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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

const Top10Page = () => {
  const [activePeriod, setActivePeriod] = useState<Period>("Este mes");
  const { data: allRows = [], isLoading } = useEarningsData();
  const dateRange = useMemo(() => getDateRange(activePeriod), [activePeriod]);
  const comparison = usePeriodComparison(allRows, dateRange);
  const navigate = useNavigate();

  const top10 = comparison.top10;
  const top3 = top10.slice(0, 3);
  const rest = top10.slice(3);
  const top10Total = top10.reduce((s, c) => s + c.currentEarnings, 0);
  const concentrationPercent = comparison.totalCurrent > 0 ? (top10Total / comparison.totalCurrent) * 100 : 0;

  // Reorder for podium: 2nd, 1st, 3rd
  const podiumOrder = top3.length >= 3 ? [top3[1], top3[0], top3[2]] : top3;
  const podiumPositions = top3.length >= 3 ? [2, 1, 3] : top3.map((_, i) => i + 1);

  return (
    <main className="flex-1 overflow-auto p-6 space-y-6">
            {isLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Cargando datos…</div>
            ) : (
              <>
                {/* Header */}
                <div className="space-y-4">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <button onClick={() => navigate("/sales-overview")} className="hover:text-foreground transition-colors">Creator Sales</button>
                    <ChevronRight className="h-3 w-3" />
                    <span className="text-foreground font-medium">Top 10</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <h1 className="text-2xl font-bold text-foreground">Top 10</h1>
                      <p className="text-sm text-muted-foreground">Mejores performers</p>
                    </div>
                    <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
                      {periods.map((p) => (
                        <Button key={p} variant={activePeriod === p ? "secondary" : "ghost"} size="sm" onClick={() => setActivePeriod(p)} className="text-xs">{p}</Button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Podium */}
                {top3.length > 0 && (
                  <div className="flex items-end justify-center gap-4">
                    {podiumOrder.map((c, i) => {
                      const pos = podiumPositions[i];
                      const isFirst = pos === 1;
                      return (
                        <Card key={c.creatorKey} className={`w-48 transition-all duration-200 hover:scale-[1.03] hover:shadow-lg ${isFirst ? "border-primary/40" : ""}`}>
                          <CardContent className={`flex flex-col items-center text-center ${isFirst ? "py-8" : "py-4"} space-y-2`}>
                            <Badge variant={isFirst ? "default" : "secondary"} className={`rounded-full h-7 w-7 flex items-center justify-center text-xs font-bold ${isFirst ? "bg-primary text-primary-foreground" : ""}`}>
                              {pos}
                            </Badge>
                            {isFirst && <Crown className="h-5 w-5 text-primary" />}
                            <Avatar className={isFirst ? "h-16 w-16" : "h-12 w-12"}>
                              <AvatarFallback className="text-sm font-semibold">{initials(c.artisticName)}</AvatarFallback>
                            </Avatar>
                            <p className="text-sm font-semibold text-foreground truncate max-w-full">{c.artisticName || "—"}</p>
                            <p className={`text-lg font-bold ${isFirst ? "text-primary" : "text-foreground"}`}>{fmt(c.currentEarnings)}</p>
                            {c.changePercent !== 0 && (
                              <p className={`text-xs ${c.changePercent >= 0 ? "text-success" : "text-destructive"}`}>
                                {c.changePercent >= 0 ? "+" : ""}{c.changePercent.toFixed(1)}%
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}

                {/* Concentration */}
                <Card>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Trophy className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium text-foreground">Concentración del Top 10: {concentrationPercent.toFixed(1)}%</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{fmt(top10Total)} de {fmt(comparison.totalCurrent)} del ingreso total</span>
                    </div>
                    <Progress value={concentrationPercent} className="h-2" />
                  </CardContent>
                </Card>

                {/* Rest of top 10 */}
                {rest.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Posiciones 4 — 10</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-auto max-h-[calc(100vh-36rem)]">
                        <Table>
                          <TableHeader className="sticky top-0 z-10 bg-card">
                            <TableRow>
                              <TableHead className="w-12">#</TableHead>
                              <TableHead>Creadora</TableHead>
                              <TableHead className="text-right">Earnings</TableHead>
                              <TableHead className="text-right">Cambio %</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {rest.map((c, i) => (
                              <TableRow key={c.creatorKey}>
                                <TableCell className="font-medium text-muted-foreground">{i + 4}</TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <Avatar className="h-8 w-8">
                                      <AvatarFallback className="text-xs">{initials(c.artisticName)}</AvatarFallback>
                                    </Avatar>
                                    <span className="text-sm font-medium">{c.artisticName || "—"}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-right font-medium">{fmt(c.currentEarnings)}</TableCell>
                                <TableCell className={`text-right text-sm ${c.changePercent >= 0 ? "text-success" : "text-destructive"}`}>
                                  {c.changePercent >= 0 ? "+" : ""}{c.changePercent.toFixed(1)}%
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {top10.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 bg-muted/50 rounded-lg">
                    <Trophy className="h-12 w-12 text-muted-foreground mb-4" />
                    <h4 className="text-lg font-semibold">Sin datos</h4>
                    <p className="text-sm text-muted-foreground">No hay creadoras con datos en este periodo</p>
                  </div>
                )}
              </>
            )}
          </main>
  );
};

export default Top10Page;
