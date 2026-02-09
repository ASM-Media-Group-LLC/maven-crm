export interface EarningsRow {
  id: string;
  date: string;
  total_earnings_gross: number | null;
  document_id: string | null;
  pending_creator: string | null;
  creator_id: string | null;
  artistic_name: string | null;
}

export type SortField = "date" | "total_earnings_gross" | "artistic_name";
export type SortDirection = "asc" | "desc";
