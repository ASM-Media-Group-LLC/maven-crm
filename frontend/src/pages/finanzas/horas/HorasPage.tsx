import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, Wallet, DollarSign, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import StatChip from "@/components/StatChip";
import { PageHeader } from "@/components/ui/page-header";
import { useFormato } from "@/hooks/useFormato";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";

const TABS = ["Horas Extra", "Banco de Horas"] as const;
type Tab = typeof TABS[number];
// El valor de la pestaña es interno; esto es lo que se lee.
const TAB_LABEL: Record<Tab, TranslationKey> = {
  "Horas Extra": "finanzas.common.overtime",
  "Banco de Horas": "finanzas.common.hourBank",
};

function fmtUsd(n: number, locale: string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);
}

export default function HorasPage() {
  const f = useFormato();
  const { t } = useLanguage();
  const fmt = (n: number) => fmtUsd(n, f.intl("es-CO"));
  const [activeTab, setActiveTab] = useState<Tab>("Horas Extra");

  const { data: details = [], isLoading } = useQuery({
    queryKey: ["payroll-details-horas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll_details")
        .select("*, employees(first_name, last_name, employee_code), payroll_periods(period_name, status)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const totalOvertimeHours = details.reduce((s, d) => s + (Number(d.overtime_hours) || 0), 0);
  const totalOvertimeAmount = details.reduce((s, d) => s + (Number(d.overtime_amount) || 0), 0);
  const totalBankHours = details.reduce((s, d) => s + (Number(d.hour_bank_hours) || 0), 0);
  const totalBankAmount = details.reduce((s, d) => s + (Number(d.hour_bank_amount) || 0), 0);
  const uniqueEmps = new Set(details.map(d => d.employee_id)).size;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="shrink-0 bg-background/30 backdrop-blur-xl border-b border-white/10 px-6 pt-6 pb-4">
        <PageHeader title={t("finanzas.hours.title")} subtitle={t("finanzas.hours.subtitle")} />
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-5">
        <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
          {TABS.map(pestana => (
            <Button key={pestana} variant={activeTab === pestana ? "secondary" : "ghost"} size="sm" onClick={() => setActiveTab(pestana)}>{t(TAB_LABEL[pestana])}</Button>
          ))}
        </div>

        {activeTab === "Horas Extra" ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {isLoading ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />) : (
                <>
                  {/* Cards estáticas — la tabla abajo ya muestra el detalle */}
                  <StatChip label={t("finanzas.hv.kpi.totalOt")} value={String(totalOvertimeHours)} icon={<Clock className="h-3.5 w-3.5" />} color="bg-primary" hint={t("finanzas.common.employeesCount", { n: uniqueEmps })} />
                  <StatChip label={t("finanzas.control.totalCost")} value={fmt(totalOvertimeAmount)} icon={<DollarSign className="h-3.5 w-3.5" />} color="bg-destructive" hint={t("finanzas.hours.accruedAmount")} />
                  <StatChip label={t("finanzas.hours.avgPerEmployee")} value={uniqueEmps > 0 ? (totalOvertimeHours / uniqueEmps).toFixed(1) + "h" : "0h"} icon={<Users className="h-3.5 w-3.5" />} color="bg-accent" hint={t("finanzas.hours.overtimeHint")} />
                </>
              )}
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-card">
                    <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.common.employee")}</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.common.hours")}</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.common.amount")}</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.common.period")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 4 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                  )) : details.filter(d => Number(d.overtime_hours) > 0).length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">{t("finanzas.hours.otEmpty")}</TableCell></TableRow>
                  ) : details.filter(d => Number(d.overtime_hours) > 0).map(d => (
                    <TableRow key={d.id} className="hover:bg-muted/30">
                      <TableCell className="text-sm">{d.employees ? `${(d as any).employees.first_name} ${(d as any).employees.last_name}` : "—"}</TableCell>
                      <TableCell className="text-sm font-medium">{Number(d.overtime_hours) || 0}h</TableCell>
                      <TableCell className="text-sm">{fmt(Number(d.overtime_amount) || 0)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{(d as any).payroll_periods?.period_name || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              {isLoading ? Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />) : (
                <>
                  <StatChip label={t("finanzas.hours.accruedHours")} value={String(totalBankHours)} icon={<Wallet className="h-3.5 w-3.5" />} color="bg-success" hint={t("finanzas.hours.bankTotal")} />
                  <StatChip label={t("finanzas.hours.totalValue")} value={fmt(totalBankAmount)} icon={<DollarSign className="h-3.5 w-3.5" />} color="bg-accent" hint={t("finanzas.hours.valuation")} />
                </>
              )}
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-card">
                    <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.common.employee")}</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.hours.accruedHours")}</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.common.value")}</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">{t("finanzas.hours.lastPeriod")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 4 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                  )) : details.filter(d => Number(d.hour_bank_hours) > 0).length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">{t("finanzas.hours.bankEmpty")}</TableCell></TableRow>
                  ) : details.filter(d => Number(d.hour_bank_hours) > 0).map(d => (
                    <TableRow key={d.id} className="hover:bg-muted/30">
                      <TableCell className="text-sm">{d.employees ? `${(d as any).employees.first_name} ${(d as any).employees.last_name}` : "—"}</TableCell>
                      <TableCell className="text-sm font-medium">{Number(d.hour_bank_hours) || 0}h</TableCell>
                      <TableCell className="text-sm">{fmt(Number(d.hour_bank_amount) || 0)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{(d as any).payroll_periods?.period_name || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
