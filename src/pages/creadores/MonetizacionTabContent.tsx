import { useQuery } from "@tanstack/react-query";
import { DollarSign } from "lucide-react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  creatorId: string;
}

const MonetizacionTabContent = ({ creatorId }: Props) => {
  const { data: records, isLoading } = useQuery({
    queryKey: ["creator_monetization", creatorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creator_monetization")
        .select("id, month_year, amount, notes")
        .eq("creator_id", creatorId)
        .order("month_year", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const formatMonth = (monthYear: string) => {
    try {
      const date = parseISO(monthYear);
      return format(date, "MMMM yyyy", { locale: es }).replace(/^\w/, (c) => c.toUpperCase());
    } catch {
      return monthYear;
    }
  };

  const formatAmount = (amount: number | null) =>
    amount != null ? `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-1" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <DollarSign className="h-5 w-5" />
          Monetización Mensual
        </CardTitle>
        <CardDescription>Histórico de monetización por mes</CardDescription>
      </CardHeader>
      <CardContent>
        {records && records.length > 0 ? (
          <div className="max-h-[400px] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead>Mes</TableHead>
                <TableHead>Monto</TableHead>
                <TableHead>Notas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{formatMonth(r.month_year)}</TableCell>
                  <TableCell>{formatAmount(r.amount)}</TableCell>
                  <TableCell className="text-muted-foreground">{r.notes || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-12">
            No hay datos de monetización registrados
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default MonetizacionTabContent;
