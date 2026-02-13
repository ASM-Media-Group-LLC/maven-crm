import { Card, CardContent } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface Props {
  current: number;
  previous: number;
}

const fmt = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n.toFixed(0)}`;

const ComparacionDirectaChart = ({ current, previous }: Props) => {
  const data = [
    { name: "Periodo Actual", value: current },
    { name: "Periodo Anterior", value: previous },
  ];
  const colors = ["hsl(var(--primary))", "hsl(var(--muted-foreground))"];

  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <p className="text-sm font-medium text-foreground">Comparación Directa</p>
        <p className="text-xs text-muted-foreground">Periodo actual vs anterior</p>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" barSize={28}>
              <XAxis type="number" tickFormatter={fmt} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={120} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                formatter={(v: number) => [fmt(v), "Ingresos"]}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {data.map((_, i) => <Cell key={i} fill={colors[i]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

export default ComparacionDirectaChart;
