import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, Wallet, DollarSign, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import KpiCard from "@/components/dashboard/KpiCard";

const TABS = ["Horas Extra", "Banco de Horas"] as const;
type Tab = typeof TABS[number];

function fmt(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);
}

export default function HorasPage() {
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
        <h1 className="text-xl font-semibold text-foreground">Horas & Banco de Horas</h1>
        <p className="text-sm text-muted-foreground">Vista financiera de horas extra y banco de horas</p>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-5">
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
          {TABS.map(t => (
            <Button key={t} variant={activeTab === t ? "secondary" : "ghost"} size="sm" onClick={() => setActiveTab(t)}>{t}</Button>
          ))}
        </div>

        {activeTab === "Horas Extra" ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {isLoading ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />) : (
                <>
                  {/* Cards estáticas — la tabla abajo ya muestra el detalle */}
                  <KpiCard label="Total Horas Extra" value={String(totalOvertimeHours)} icon={Clock} color="bg-blue-500" subtitle={`${uniqueEmps} empleados`} />
                  <KpiCard label="Costo Total" value={fmt(totalOvertimeAmount)} icon={DollarSign} color="bg-rose-500" subtitle="Monto acumulado" />
                  <KpiCard label="Promedio por Empleado" value={uniqueEmps > 0 ? (totalOvertimeHours / uniqueEmps).toFixed(1) + "h" : "0h"} icon={Users} color="bg-violet-500" subtitle="Horas extra" />
                </>
              )}
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-card">
                    <TableHead className="text-xs font-medium text-muted-foreground">Empleado</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Horas</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Monto</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Periodo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 4 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                  )) : details.filter(d => Number(d.overtime_hours) > 0).length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Sin registros de horas extra.</TableCell></TableRow>
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
              {isLoading ? Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />) : (
                <>
                  <KpiCard label="Horas Acumuladas" value={String(totalBankHours)} icon={Wallet} color="bg-emerald-500" subtitle="Banco total" />
                  <KpiCard label="Valor Total" value={fmt(totalBankAmount)} icon={DollarSign} color="bg-violet-500" subtitle="Valoración" />
                </>
              )}
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-card">
                    <TableHead className="text-xs font-medium text-muted-foreground">Empleado</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Horas Acumuladas</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Valor</TableHead>
                    <TableHead className="text-xs font-medium text-muted-foreground">Último Periodo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 4 }).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                  )) : details.filter(d => Number(d.hour_bank_hours) > 0).length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Sin registros en banco de horas.</TableCell></TableRow>
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
