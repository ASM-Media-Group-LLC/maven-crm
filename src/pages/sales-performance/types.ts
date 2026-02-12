export interface EarningsRow {
  id: string;
  date: string;
  total_earnings_gross: number | null;
  subscription_gross: number | null;
  new_subscriptions_sub_gross: number | null;
  recurring_sub_gross: number | null;
  message_gross: number | null;
  tips_gross: number | null;
  active_fans: number | null;
  new_fans: number | null;
  following: number | null;
  of_ranking: number | null;
  contribution: number | null;
  fans_renew_on: number | null;
  renew_on_percentage: number | null;
  change_expired_fan_count: number | null;
  avg_spend_per_spender_gross: number | null;
  avg_spend_per_transaction_gross: number | null;
  avg_earnings_per_fan_gross: number | null;
  document_id: string | null;
  pending_creator: string | null;
  creator_id: string | null;
  artistic_name: string | null;
  report_time: string | null;
  effective_date: string;
  // Calculated fields
  net_earnings?: number | null;
  total_earnings?: number | null;
  variation_percent?: number | null;
  trend?: string | null;
  participation_percent?: number | null;
}

export type SortField = keyof EarningsRow;
export type SortDirection = "asc" | "desc";

export interface ColumnDef {
  key: SortField;
  label: string;
  defaultVisible: boolean;
  align?: "left" | "right";
  format?: "currency" | "number" | "percent" | "text" | "date" | "document" | "time" | "signed_percent" | "trend";
}

export const ALL_COLUMNS: ColumnDef[] = [
  { key: "artistic_name", label: "Artistic Name", defaultVisible: true, format: "text" },
  { key: "pending_creator", label: "Creator OF", defaultVisible: true, format: "text" },
  { key: "effective_date", label: "Fecha", defaultVisible: true, align: "right", format: "date" },
  { key: "report_time", label: "Hora", defaultVisible: true, align: "right", format: "time" },
  { key: "total_earnings_gross", label: "Gross Earnings", defaultVisible: true, align: "right", format: "currency" },
  { key: "net_earnings", label: "Net Earnings", defaultVisible: true, align: "right", format: "currency" },
  { key: "total_earnings" as SortField, label: "Total Earnings", defaultVisible: true, align: "right", format: "currency" },
  { key: "subscription_gross", label: "Subscriptions", defaultVisible: true, align: "right", format: "currency" },
  { key: "message_gross", label: "Message", defaultVisible: true, align: "right", format: "currency" },
  { key: "tips_gross", label: "Tips", defaultVisible: true, align: "right", format: "currency" },
  { key: "new_subscriptions_sub_gross", label: "New Subscriptions", defaultVisible: false, align: "right", format: "currency" },
  { key: "recurring_sub_gross", label: "Recurring Subscriptions", defaultVisible: false, align: "right", format: "currency" },
  { key: "contribution", label: "Contribution %", defaultVisible: false, align: "right", format: "percent" },
  { key: "of_ranking", label: "OF Ranking", defaultVisible: false, align: "right", format: "number" },
  { key: "following", label: "Following", defaultVisible: false, align: "right", format: "number" },
  { key: "fans_renew_on", label: "Fans Renew On", defaultVisible: false, align: "right", format: "number" },
  { key: "renew_on_percentage", label: "Renew On %", defaultVisible: false, align: "right", format: "percent" },
  { key: "new_fans", label: "New Fans", defaultVisible: false, align: "right", format: "number" },
  { key: "active_fans", label: "Active Fans", defaultVisible: false, align: "right", format: "number" },
  { key: "change_expired_fan_count", label: "Expired Fan Change", defaultVisible: false, align: "right", format: "number" },
  { key: "avg_spend_per_spender_gross", label: "Avg Spend/Spender", defaultVisible: false, align: "right", format: "currency" },
  { key: "avg_spend_per_transaction_gross", label: "Avg Spend/Transaction", defaultVisible: false, align: "right", format: "currency" },
  { key: "avg_earnings_per_fan_gross", label: "Avg Earnings/Fan", defaultVisible: false, align: "right", format: "currency" },
  { key: "variation_percent", label: "Variación", defaultVisible: true, align: "right", format: "signed_percent" },
  { key: "trend", label: "Tendencia", defaultVisible: true, format: "trend" },
  { key: "participation_percent", label: "Participación", defaultVisible: true, align: "right", format: "percent" },
  { key: "document_id", label: "Document ID", defaultVisible: true, format: "document" },
];
