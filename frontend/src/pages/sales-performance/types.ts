import type { TranslationKey } from "@/lib/i18n";

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
  /** Clave del diccionario: se muestra con `t(col.label)`. */
  label: TranslationKey;
  defaultVisible: boolean;
  align?: "left" | "right";
  format?: "currency" | "number" | "percent" | "text" | "date" | "document" | "time" | "signed_percent" | "trend";
}

export const ALL_COLUMNS: ColumnDef[] = [
  { key: "artistic_name", label: "sales.col.artisticName", defaultVisible: true, format: "text" },
  { key: "pending_creator", label: "sales.col.creatorOf", defaultVisible: true, format: "text" },
  { key: "effective_date", label: "common.date", defaultVisible: true, align: "right", format: "date" },
  { key: "report_time", label: "sales.col.time", defaultVisible: true, align: "right", format: "time" },
  { key: "total_earnings_gross", label: "sales.col.gross", defaultVisible: true, align: "right", format: "currency" },
  { key: "net_earnings", label: "sales.col.net", defaultVisible: true, align: "right", format: "currency" },
  { key: "total_earnings" as SortField, label: "sales.col.total", defaultVisible: true, align: "right", format: "currency" },
  { key: "subscription_gross", label: "sales.col.subscriptions", defaultVisible: true, align: "right", format: "currency" },
  { key: "message_gross", label: "sales.col.message", defaultVisible: true, align: "right", format: "currency" },
  { key: "tips_gross", label: "sales.col.tips", defaultVisible: true, align: "right", format: "currency" },
  { key: "new_subscriptions_sub_gross", label: "sales.col.newSubs", defaultVisible: false, align: "right", format: "currency" },
  { key: "recurring_sub_gross", label: "sales.col.recurringSubs", defaultVisible: false, align: "right", format: "currency" },
  { key: "contribution", label: "sales.col.contribution", defaultVisible: false, align: "right", format: "percent" },
  { key: "of_ranking", label: "sales.col.ofRanking", defaultVisible: false, align: "right", format: "number" },
  { key: "following", label: "sales.col.following", defaultVisible: false, align: "right", format: "number" },
  { key: "fans_renew_on", label: "sales.col.fansRenewOn", defaultVisible: false, align: "right", format: "number" },
  { key: "renew_on_percentage", label: "sales.col.renewOnPct", defaultVisible: false, align: "right", format: "percent" },
  { key: "new_fans", label: "sales.col.newFans", defaultVisible: false, align: "right", format: "number" },
  { key: "active_fans", label: "sales.col.activeFans", defaultVisible: false, align: "right", format: "number" },
  { key: "change_expired_fan_count", label: "sales.col.expiredChange", defaultVisible: false, align: "right", format: "number" },
  { key: "avg_spend_per_spender_gross", label: "sales.col.avgPerSpender", defaultVisible: false, align: "right", format: "currency" },
  { key: "avg_spend_per_transaction_gross", label: "sales.col.avgPerTransaction", defaultVisible: false, align: "right", format: "currency" },
  { key: "avg_earnings_per_fan_gross", label: "sales.col.avgPerFan", defaultVisible: false, align: "right", format: "currency" },
  { key: "variation_percent", label: "sales.col.variation", defaultVisible: true, align: "right", format: "signed_percent" },
  { key: "trend", label: "sales.col.trend", defaultVisible: true, format: "trend" },
  { key: "participation_percent", label: "sales.col.share", defaultVisible: true, align: "right", format: "percent" },
  { key: "document_id", label: "sales.col.documentId", defaultVisible: true, format: "document" },
];
