import { useMemo } from "react";
import type { EarningsRow } from "./types";

interface EarningsSummaryCardsProps {
  rows: EarningsRow[];
}

const fmt = (v: number) =>
  "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2 });

const EarningsSummaryCards = ({ rows }: EarningsSummaryCardsProps) => {
  const stats = useMemo(() => {
    const creatorCount = new Set(
      rows.map((r) => r.pending_creator || r.artistic_name).filter(Boolean)
    ).size;
    const totalEarnings = rows.reduce((s, r) => s + (r.total_earnings_gross ?? 0), 0);
    const subscriptions = rows.reduce((s, r) => s + (r.subscription_gross ?? 0), 0);
    const messages = rows.reduce((s, r) => s + (r.message_gross ?? 0), 0);
    const tips = rows.reduce((s, r) => s + (r.tips_gross ?? 0), 0);
    return { creatorCount, totalEarnings, subscriptions, messages, tips };
  }, [rows]);

  const cards = [
    { label: "Creators", value: String(stats.creatorCount) },
    { label: "Total Earnings", value: fmt(stats.totalEarnings) },
    { label: "Subscriptions", value: fmt(stats.subscriptions) },
    { label: "Message Earnings", value: fmt(stats.messages) },
    { label: "Tips", value: fmt(stats.tips) },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-lg border border-border bg-card p-4 space-y-1"
        >
          <span className="text-2xl font-bold text-foreground">{c.value}</span>
          <p className="text-xs text-muted-foreground">{c.label}</p>
        </div>
      ))}
    </div>
  );
};

export default EarningsSummaryCards;
