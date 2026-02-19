import { Card, CardContent } from "@/components/ui/card";

interface BreakdownItem {
  label: string;
  value: number;
  percent: number;
}

interface Props {
  breakdown: BreakdownItem[];
}

const fmt = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n.toFixed(0)}`;

const DesgloseRevenueCard = ({ breakdown }: Props) => (
  <Card>
    <CardContent className="p-5 space-y-4">
      <p className="text-sm font-medium text-foreground">Desglose de Revenue</p>
      <div className="space-y-3">
        {breakdown.map((item) => (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{item.label}</span>
              <span className="font-medium text-foreground">{fmt(item.value)} ({item.percent.toFixed(1)}%)</span>
            </div>
            <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.min(item.percent, 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
);

export default DesgloseRevenueCard;
