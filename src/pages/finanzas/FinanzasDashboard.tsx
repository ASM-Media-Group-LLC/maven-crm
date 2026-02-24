import { useQuery } from "@tanstack/react-query";
import { DollarSign, FileText, Users, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import DashboardMetricCard from "@/components/dashboard/DashboardMetricCard";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(amount);
}

export default function FinanzasDashboard() {
  const { data: payroll = [], isLoading: loadingP } = useQuery({
    queryKey: ["finanzas-payroll-summary"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payroll_periods").select("status, gross_total, net_total").limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: invoices = [], isLoading: loadingI } = useQuery({
    queryKey: ["finanzas-invoices-summary"],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices").select("status, amount, fee_amount, net_amount").limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: commissions = [], isLoading: loadingC } = useQuery({
    queryKey: ["finanzas-commissions-summary"],
    queryFn: async () => {
      const { data, error } = await supabase.from("commissions").select("status, estimated_amount, final_amount").limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const isLoading = loadingP || loadingI || loadingC;

  const totalNomina = payroll.reduce((s, p) => s + (Number(p.net_total) || 0), 0);
  const totalInvoices = invoices.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const totalComisiones = commissions.reduce((s, c) => s + (Number(c.estimated_amount) || 0), 0);
  const pendingInvoices = invoices.filter(i => i.status === "enviada" || i.status === "vencida").length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="shrink-0 bg-background border-b border-border px-6 pt-6 pb-4">
        <h1 className="text-xl font-semibold text-foreground">Dashboard Financiero</h1>
        <p className="text-sm text-muted-foreground">Vista consolidada de nómina, facturación y comisiones</p>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)
          ) : (
            <>
              <DashboardMetricCard label="Nómina Total" value={formatCurrency(totalNomina)} icon={Users} subtitle={`${payroll.length} periodos`} hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-primary/15 hover:border-primary/40" />
              <DashboardMetricCard label="Facturación Total" value={formatCurrency(totalInvoices)} icon={FileText} subtitle={`${invoices.length} invoices`} hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-accent/15 hover:border-accent/40" />
              <DashboardMetricCard label="Comisiones Estimadas" value={formatCurrency(totalComisiones)} icon={TrendingUp} subtitle={`${commissions.length} registros`} hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-warning/15 hover:border-warning/40" />
              <DashboardMetricCard label="Invoices Pendientes" value={String(pendingInvoices)} icon={DollarSign} subtitle="Enviadas + vencidas" hoverClass="hover:scale-[1.03] hover:bg-gradient-to-br hover:from-destructive/15 hover:border-destructive/40" valueColor={pendingInvoices > 0 ? "text-destructive" : undefined} />
            </>
          )}
        </div>

        <div className="rounded-lg border border-border p-8 text-center text-muted-foreground">
          <p className="text-sm">Selecciona un submódulo en el sidebar para gestionar Nómina, Facturación, Comisiones, Control Financiero o Reportes.</p>
        </div>
      </div>
    </div>
  );
}
