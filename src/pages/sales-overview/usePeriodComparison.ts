import { useMemo } from "react";
import { subDays, differenceInDays, startOfDay, endOfDay } from "date-fns";
import type { EarningsRow } from "../sales-performance/types";

export interface CreatorComparison {
  creatorKey: string;
  artisticName: string | null;
  currentEarnings: number;
  previousEarnings: number;
  change: number; // absolute
  changePercent: number; // -100 to +inf
  status: "rising" | "falling" | "at_risk" | "high_potential" | "stable";
}

export interface PeriodComparisonResult {
  totalCurrent: number;
  totalPrevious: number;
  totalChangePercent: number;
  activeCreators: number;
  creators: CreatorComparison[];
  rising: CreatorComparison[];
  falling: CreatorComparison[];
  atRisk: CreatorComparison[];
  highPotential: CreatorComparison[];
  top10: CreatorComparison[];
}

const sumByCreator = (rows: EarningsRow[]) => {
  const map = new Map<string, { earnings: number; name: string | null }>();
  for (const r of rows) {
    const key = r.creator_id || r.pending_creator || r.id;
    const existing = map.get(key);
    const val = r.total_earnings_gross ?? 0;
    if (existing) {
      existing.earnings += val;
    } else {
      map.set(key, { earnings: val, name: r.artistic_name || r.pending_creator });
    }
  }
  return map;
};

export const usePeriodComparison = (
  allRows: EarningsRow[],
  dateRange: { from: Date; to: Date }
): PeriodComparisonResult => {
  return useMemo(() => {
    const from = startOfDay(dateRange.from);
    const to = endOfDay(dateRange.to);
    const days = differenceInDays(to, from) + 1;
    const prevFrom = startOfDay(subDays(from, days));
    const prevTo = endOfDay(subDays(from, 1));

    const currentRows = allRows.filter((r) => {
      const d = new Date(r.effective_date);
      return d >= from && d <= to;
    });
    const prevRows = allRows.filter((r) => {
      const d = new Date(r.effective_date);
      return d >= prevFrom && d <= prevTo;
    });

    const currentMap = sumByCreator(currentRows);
    const prevMap = sumByCreator(prevRows);

    const allKeys = new Set([...currentMap.keys(), ...prevMap.keys()]);

    const creators: CreatorComparison[] = [];
    for (const key of allKeys) {
      const cur = currentMap.get(key)?.earnings ?? 0;
      const prev = prevMap.get(key)?.earnings ?? 0;
      const name = currentMap.get(key)?.name ?? prevMap.get(key)?.name ?? null;
      if (cur === 0 && prev === 0) continue;

      const change = cur - prev;
      const changePercent = prev > 0 ? (change / prev) * 100 : cur > 0 ? 100 : 0;

      let status: CreatorComparison["status"] = "stable";
      if (changePercent > 30) status = "high_potential";
      else if (changePercent > 0) status = "rising";
      else if (changePercent < -20) status = "at_risk";
      else if (changePercent < 0) status = "falling";

      creators.push({ creatorKey: key, artisticName: name, currentEarnings: cur, previousEarnings: prev, change, changePercent, status });
    }

    const totalCurrent = creators.reduce((s, c) => s + c.currentEarnings, 0);
    const totalPrevious = creators.reduce((s, c) => s + c.previousEarnings, 0);
    const totalChangePercent = totalPrevious > 0 ? ((totalCurrent - totalPrevious) / totalPrevious) * 100 : 0;

    const rising = creators.filter((c) => c.status === "rising" || c.status === "high_potential").sort((a, b) => b.changePercent - a.changePercent);
    const falling = creators.filter((c) => c.status === "falling").sort((a, b) => a.changePercent - b.changePercent);
    const atRisk = creators.filter((c) => c.status === "at_risk").sort((a, b) => a.changePercent - b.changePercent);
    const highPotential = creators.filter((c) => c.status === "high_potential").sort((a, b) => b.changePercent - a.changePercent);
    const top10 = [...creators].sort((a, b) => b.currentEarnings - a.currentEarnings).slice(0, 10);
    const activeCreators = creators.filter((c) => c.currentEarnings > 0).length;

    return { totalCurrent, totalPrevious, totalChangePercent, activeCreators, creators, rising, falling, atRisk, highPotential, top10 };
  }, [allRows, dateRange]);
};
