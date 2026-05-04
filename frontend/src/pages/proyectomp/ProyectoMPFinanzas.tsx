import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMPFinancials } from "./hooks/useMPFinancials";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { DollarSign, TrendingUp, TrendingDown } from "lucide-react";

const ProyectoMPFinanzas = () => {
  const { data: financials, isLoading } = useMPFinancials();

  const chartData = financials?.map((f) => {
    const totalCosts = Number(f.cost_chatters) + Number(f.cost_content) + Number(f.cost_traffic) + Number(f.cost_other);
    return {
      month: f.month,
      account: (f as any).mp_models?.name || "—",
      revenue: Number(f.revenue),
      costs: totalCosts,
      profit: Number(f.revenue) - totalCosts,
    };
  }) ?? [];

  const totalRevenue = chartData.reduce((s, d) => s + d.revenue, 0);
  const totalCosts = chartData.reduce((s, d) => s + d.costs, 0);
  const totalProfit = totalRevenue - totalCosts;

  if (isLoading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Finanzas & P&L</h1>

      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-card"><CardContent className="p-4 flex items-center gap-3"><DollarSign className="h-8 w-8 text-emerald-400" /><div><p className="text-2xl font-bold">${totalRevenue.toLocaleString()}</p><p className="text-xs text-muted-foreground">Revenue Total</p></div></CardContent></Card>
        <Card className="bg-card"><CardContent className="p-4 flex items-center gap-3"><TrendingDown className="h-8 w-8 text-red-400" /><div><p className="text-2xl font-bold">${totalCosts.toLocaleString()}</p><p className="text-xs text-muted-foreground">Costos Total</p></div></CardContent></Card>
        <Card className="bg-card"><CardContent className="p-4 flex items-center gap-3"><TrendingUp className={`h-8 w-8 ${totalProfit >= 0 ? "text-emerald-400" : "text-red-400"}`} /><div><p className="text-2xl font-bold">${totalProfit.toLocaleString()}</p><p className="text-xs text-muted-foreground">Profit</p></div></CardContent></Card>
      </div>

      {chartData.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader><CardTitle className="text-sm">P&L por Mes</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Legend />
                <Bar dataKey="revenue" name="Revenue" fill="#10B981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="costs" name="Costos" fill="#EF4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card className="bg-card border-border">
        <CardHeader><CardTitle className="text-sm">Detalle por Cuenta/Mes</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mes</TableHead>
                <TableHead>Cuenta</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Chatters</TableHead>
                <TableHead className="text-right">Contenido</TableHead>
                <TableHead className="text-right">Tráfico</TableHead>
                <TableHead className="text-right">Otros</TableHead>
                <TableHead className="text-right">Profit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {financials?.map((f) => {
                const totalC = Number(f.cost_chatters) + Number(f.cost_content) + Number(f.cost_traffic) + Number(f.cost_other);
                const profit = Number(f.revenue) - totalC;
                return (
                  <TableRow key={f.id}>
                    <TableCell>{f.month}</TableCell>
                    <TableCell>{(f as any).mp_models?.name || "—"}</TableCell>
                    <TableCell className="text-right">${Number(f.revenue).toLocaleString()}</TableCell>
                    <TableCell className="text-right">${Number(f.cost_chatters).toLocaleString()}</TableCell>
                    <TableCell className="text-right">${Number(f.cost_content).toLocaleString()}</TableCell>
                    <TableCell className="text-right">${Number(f.cost_traffic).toLocaleString()}</TableCell>
                    <TableCell className="text-right">${Number(f.cost_other).toLocaleString()}</TableCell>
                    <TableCell className={`text-right font-medium ${profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>${profit.toLocaleString()}</TableCell>
                  </TableRow>
                );
              })}
              {(!financials || financials.length === 0) && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Sin datos financieros</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProyectoMPFinanzas;
