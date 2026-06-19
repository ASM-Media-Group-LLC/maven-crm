import type { CreatorDailyEarning } from "@/hooks/useCreatorDailyEarnings";

interface Props {
  daily: CreatorDailyEarning[];
  year: number;
  month: number; // 0-11
}

const money0 = (n: number) => "$" + Math.round(n || 0).toLocaleString("en-US");
const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"]; // semana arranca lunes

// Calendario mensual del ingreso diario (BLU) de una creadora. Marca:
//   🔥 el mejor día de ingresos de cada bloque de 5 (1-5, 6-10, 11-15, …)
//   👑 el mejor día del mes (pisa el 🔥 de ese día)
const CreatorEarningsCalendar = ({ daily, year, month }: Props) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = new Date(year, month + 1, 0).getDate();
  const dayKey = (d: number) => `${year}-${pad(month + 1)}-${pad(d)}`;

  const byDate: Record<string, number> = {};
  for (const e of daily) byDate[e.date] = e.total_gross;

  // 🔥 por bloque de 5; 👑 mejor del mes.
  const markers: Record<string, "fire" | "crown"> = {};
  for (let start = 1; start <= lastDay; start += 5) {
    const end = Math.min(start + 4, lastDay);
    let bestDay = 0, bestVal = 0;
    for (let d = start; d <= end; d++) {
      const v = byDate[dayKey(d)] || 0;
      if (v > bestVal) { bestVal = v; bestDay = d; }
    }
    if (bestDay > 0) markers[dayKey(bestDay)] = "fire";
  }
  let crownDay = 0, crownVal = 0;
  for (let d = 1; d <= lastDay; d++) {
    const v = byDate[dayKey(d)] || 0;
    if (v > crownVal) { crownVal = v; crownDay = d; }
  }
  if (crownDay > 0) markers[dayKey(crownDay)] = "crown";

  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // 0 = lunes
  const cells: Array<number | null> = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: lastDay }, (_, i) => i + 1),
  ];
  const now = new Date();
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() === month;

  return (
    <div className="space-y-2">
      <div className="text-[11px] text-muted-foreground">
        🔥 mejor día de cada 5 · 👑 mejor del mes
      </div>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="text-center text-[10px] font-medium text-muted-foreground">{w}</div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={`b${i}`} />;
          const k = dayKey(d);
          const val = byDate[k] || 0;
          const marker = markers[k];
          const isToday = isCurrentMonth && d === now.getDate();
          return (
            <div
              key={k}
              className={`min-h-[46px] rounded-md border p-1 ${
                marker === "crown" ? "border-amber-400/70 bg-amber-400/10"
                  : marker === "fire" ? "border-orange-500/50 bg-orange-500/5"
                  : val > 0 ? "border-border bg-muted/20"
                  : "border-transparent"
              } ${isToday ? "ring-1 ring-primary/50" : ""}`}
            >
              <div className="flex items-start justify-between leading-none">
                <span className="text-xs">{marker === "crown" ? "👑" : marker === "fire" ? "🔥" : ""}</span>
                <span className={`text-[10px] ${val > 0 ? "text-foreground" : "text-muted-foreground/60"}`}>{d}</span>
              </div>
              {val > 0 && (
                <div className="mt-1 text-right text-[10px] font-semibold leading-tight tabular-nums">{money0(val)}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CreatorEarningsCalendar;
