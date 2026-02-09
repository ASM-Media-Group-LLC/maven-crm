import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

const data = [
  { date: "Feb 3", earnings: 800 },
  { date: "Feb 4", earnings: 450 },
  { date: "Feb 5", earnings: 1200 },
  { date: "Feb 6", earnings: 950 },
  { date: "Feb 7", earnings: 1800 },
  { date: "Feb 8", earnings: 2100 },
  { date: "Feb 9", earnings: 12066 },
];

const EarningsTrendChart = () => {
  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Tendencias de Ganancias
      </h3>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barSize={40}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) =>
                v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`
              }
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "0.5rem",
                color: "hsl(var(--foreground))",
                fontSize: 12,
              }}
              formatter={(value: number) => [`$${value.toLocaleString()}`, "Ganancias"]}
            />
            <Bar
              dataKey="earnings"
              fill="hsl(var(--primary))"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default EarningsTrendChart;
