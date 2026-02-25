import { useState, useEffect } from "react";
import { Plus, Trash2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useQuickBooksTemplates,
  usePaymentMethods,
  useCostCenters,
  useCommissionDefaults,
  usePayrollParams,
  useUpdateFinancialConfig,
  type QBMapping,
  type PaymentMethod,
  type CostCenter,
  type CommissionDefaults,
  type PayrollParams,
} from "@/hooks/useFinancialConfig";

const TABS = ["Templates QuickBooks", "Métodos de Pago", "Centros de Costo", "Config. Comisiones", "Parámetros de Nómina"] as const;
type Tab = typeof TABS[number];

function fmt(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);
}

// ─── QuickBooks Tab ───────────────────────────────────────────
function QuickBooksTab() {
  const { mappings, isLoading } = useQuickBooksTemplates();
  const update = useUpdateFinancialConfig();
  const [items, setItems] = useState<QBMapping[]>([]);

  useEffect(() => { if (mappings) setItems([...mappings]); }, [mappings]);

  const add = () => setItems(prev => [...prev, { category: "", type: "ingreso", code: "", account_name: "" }]);
  const remove = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i));
  const set = (i: number, field: keyof QBMapping, val: string) => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it));
  const save = () => update.mutate({ configKey: "quickbooks_templates", value: { mappings: items } });

  if (isLoading) return <Skeleton className="h-40 rounded-lg" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Mapeo de categorías a cuentas contables de QuickBooks</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={add}><Plus className="h-4 w-4 mr-1" />Agregar Mapeo</Button>
          <Button size="sm" onClick={save} disabled={update.isPending}><Save className="h-4 w-4 mr-1" />Guardar</Button>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="text-sm text-muted-foreground">Sin mapeos configurados. Agrega uno para comenzar.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Categoría</TableHead>
                <TableHead className="text-xs">Tipo</TableHead>
                <TableHead className="text-xs">Código</TableHead>
                <TableHead className="text-xs">Nombre Cuenta</TableHead>
                <TableHead className="text-xs w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((m, i) => (
                <TableRow key={i}>
                  <TableCell><Input value={m.category} onChange={e => set(i, "category", e.target.value)} placeholder="Comisiones" className="h-8" /></TableCell>
                  <TableCell>
                    <Select value={m.type} onValueChange={v => set(i, "type", v)}>
                      <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ingreso">Ingreso</SelectItem>
                        <SelectItem value="egreso">Egreso</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell><Input value={m.code} onChange={e => set(i, "code", e.target.value)} placeholder="6010" className="h-8 w-24" /></TableCell>
                  <TableCell><Input value={m.account_name} onChange={e => set(i, "account_name", e.target.value)} placeholder="Gastos Operativos" className="h-8" /></TableCell>
                  <TableCell><Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => remove(i)}><Trash2 className="h-3.5 w-3.5" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ─── Payment Methods Tab ──────────────────────────────────────
function PaymentMethodsTab() {
  const { methods, isLoading } = usePaymentMethods();
  const update = useUpdateFinancialConfig();
  const [items, setItems] = useState<PaymentMethod[]>([]);

  useEffect(() => { if (methods) setItems([...methods]); }, [methods]);

  const add = () => setItems(prev => [...prev, { name: "", commission_pct: 0, active: true }]);
  const remove = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i));
  const set = (i: number, field: keyof PaymentMethod, val: any) => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it));
  const save = () => update.mutate({ configKey: "payment_methods", value: { methods: items } });

  if (isLoading) return <Skeleton className="h-40 rounded-lg" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Métodos de pago y sus comisiones aplicadas a invoices</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={add}><Plus className="h-4 w-4 mr-1" />Agregar Método</Button>
          <Button size="sm" onClick={save} disabled={update.isPending}><Save className="h-4 w-4 mr-1" />Guardar</Button>
        </div>
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Nombre</TableHead>
              <TableHead className="text-xs">Comisión %</TableHead>
              <TableHead className="text-xs">Activo</TableHead>
              <TableHead className="text-xs w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((m, i) => (
              <TableRow key={i}>
                <TableCell><Input value={m.name} onChange={e => set(i, "name", e.target.value)} placeholder="PayPal" className="h-8" /></TableCell>
                <TableCell><Input type="number" value={m.commission_pct} onChange={e => set(i, "commission_pct", Number(e.target.value))} className="h-8 w-24" step="0.1" /></TableCell>
                <TableCell><Switch checked={m.active} onCheckedChange={v => set(i, "active", v)} /></TableCell>
                <TableCell><Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => remove(i)}><Trash2 className="h-3.5 w-3.5" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Cost Centers Tab ─────────────────────────────────────────
function CostCentersTab() {
  const { centers, isLoading } = useCostCenters();
  const update = useUpdateFinancialConfig();
  const [items, setItems] = useState<CostCenter[]>([]);

  useEffect(() => { if (centers) setItems([...centers]); }, [centers]);

  const add = () => setItems(prev => [...prev, { name: "", code: "", monthly_budget: 0 }]);
  const remove = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i));
  const set = (i: number, field: keyof CostCenter, val: any) => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it));
  const save = () => update.mutate({ configKey: "cost_centers", value: { centers: items } });

  if (isLoading) return <Skeleton className="h-40 rounded-lg" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Centros de costo para segmentar nómina y gastos</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={add}><Plus className="h-4 w-4 mr-1" />Agregar CC</Button>
          <Button size="sm" onClick={save} disabled={update.isPending}><Save className="h-4 w-4 mr-1" />Guardar</Button>
        </div>
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Nombre</TableHead>
              <TableHead className="text-xs">Código</TableHead>
              <TableHead className="text-xs">Presupuesto Mensual</TableHead>
              <TableHead className="text-xs w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((c, i) => (
              <TableRow key={i}>
                <TableCell><Input value={c.name} onChange={e => set(i, "name", e.target.value)} placeholder="Operaciones" className="h-8" /></TableCell>
                <TableCell><Input value={c.code} onChange={e => set(i, "code", e.target.value)} placeholder="OPS" className="h-8 w-24" /></TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Input type="number" value={c.monthly_budget} onChange={e => set(i, "monthly_budget", Number(e.target.value))} className="h-8 w-32" />
                    {c.monthly_budget === 0 && <Badge variant="destructive" className="text-[10px]">Sin presupuesto</Badge>}
                  </div>
                </TableCell>
                <TableCell><Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => remove(i)}><Trash2 className="h-3.5 w-3.5" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Commissions Tab ──────────────────────────────────────────
function CommissionsTab() {
  const { defaults, isLoading } = useCommissionDefaults();
  const update = useUpdateFinancialConfig();
  const [config, setConfig] = useState<CommissionDefaults>({ creator_pct: 50, partner_pct: 20, exceptions: [] });

  useEffect(() => { if (defaults) setConfig({ ...defaults }); }, [defaults]);

  const addException = () => setConfig(prev => ({ ...prev, exceptions: [...prev.exceptions, { creator_id: "", creator_name: "", pct: 0 }] }));
  const removeException = (i: number) => setConfig(prev => ({ ...prev, exceptions: prev.exceptions.filter((_, idx) => idx !== i) }));
  const setException = (i: number, field: string, val: any) => setConfig(prev => ({
    ...prev,
    exceptions: prev.exceptions.map((e, idx) => idx === i ? { ...e, [field]: val } : e),
  }));
  const save = () => update.mutate({ configKey: "commission_defaults", value: config });

  if (isLoading) return <Skeleton className="h-40 rounded-lg" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Porcentajes de comisión por defecto y excepciones por creador</p>
        <Button size="sm" onClick={save} disabled={update.isPending}><Save className="h-4 w-4 mr-1" />Guardar</Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>% Comisión Creadoras</Label>
          <Input type="number" value={config.creator_pct} onChange={e => setConfig(prev => ({ ...prev, creator_pct: Number(e.target.value) }))} className="mt-1" />
        </div>
        <div>
          <Label>% Comisión Socios</Label>
          <Input type="number" value={config.partner_pct} onChange={e => setConfig(prev => ({ ...prev, partner_pct: Number(e.target.value) }))} className="mt-1" />
        </div>
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Excepciones por Creador</Label>
          <Button size="sm" variant="outline" onClick={addException}><Plus className="h-4 w-4 mr-1" />Agregar Excepción</Button>
        </div>
        {config.exceptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin excepciones configuradas.</p>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Nombre Creador</TableHead>
                  <TableHead className="text-xs">% Especial</TableHead>
                  <TableHead className="text-xs w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {config.exceptions.map((ex, i) => (
                  <TableRow key={i}>
                    <TableCell><Input value={ex.creator_name || ""} onChange={e => setException(i, "creator_name", e.target.value)} placeholder="Nombre del creador" className="h-8" /></TableCell>
                    <TableCell><Input type="number" value={ex.pct} onChange={e => setException(i, "pct", Number(e.target.value))} className="h-8 w-24" /></TableCell>
                    <TableCell><Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => removeException(i)}><Trash2 className="h-3.5 w-3.5" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Payroll Params Tab ───────────────────────────────────────
function PayrollParamsTab() {
  const { params, isLoading } = usePayrollParams();
  const update = useUpdateFinancialConfig();
  const [config, setConfig] = useState<PayrollParams>({
    deductions: { health_pct: 4, pension_pct: 4, tax_pct: 0 },
    overtime_multipliers: { daytime: 1.25, nighttime: 1.75, holiday: 2.0 },
    hour_bank: { validity_months: 6, hour_value: 15 },
  });

  useEffect(() => { if (params) setConfig({ ...params }); }, [params]);

  const setDed = (field: string, val: number) => setConfig(prev => ({ ...prev, deductions: { ...prev.deductions, [field]: val } }));
  const setMult = (field: string, val: number) => setConfig(prev => ({ ...prev, overtime_multipliers: { ...prev.overtime_multipliers, [field]: val } }));
  const setBank = (field: string, val: number) => setConfig(prev => ({ ...prev, hour_bank: { ...prev.hour_bank, [field]: val } }));
  const save = () => update.mutate({ configKey: "payroll_params", value: config });

  if (isLoading) return <Skeleton className="h-40 rounded-lg" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Parámetros para el cálculo de nómina, horas extra y banco de horas</p>
        <Button size="sm" onClick={save} disabled={update.isPending}><Save className="h-4 w-4 mr-1" />Guardar Cambios</Button>
      </div>

      {/* Deducciones Legales */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <h3 className="text-sm font-medium">Deducciones Legales</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label>Salud %</Label>
            <Input type="number" value={config.deductions.health_pct} onChange={e => setDed("health_pct", Number(e.target.value))} className="mt-1" step="0.5" />
          </div>
          <div>
            <Label>Pensión %</Label>
            <Input type="number" value={config.deductions.pension_pct} onChange={e => setDed("pension_pct", Number(e.target.value))} className="mt-1" step="0.5" />
          </div>
          <div>
            <Label>Impuestos %</Label>
            <Input type="number" value={config.deductions.tax_pct} onChange={e => setDed("tax_pct", Number(e.target.value))} className="mt-1" step="0.5" />
          </div>
        </div>
      </div>

      {/* Multiplicadores HE */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <h3 className="text-sm font-medium">Multiplicadores Horas Extra</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label>Diurno</Label>
            <Input type="number" value={config.overtime_multipliers.daytime} onChange={e => setMult("daytime", Number(e.target.value))} className="mt-1" step="0.05" />
          </div>
          <div>
            <Label>Nocturno</Label>
            <Input type="number" value={config.overtime_multipliers.nighttime} onChange={e => setMult("nighttime", Number(e.target.value))} className="mt-1" step="0.05" />
          </div>
          <div>
            <Label>Festivo</Label>
            <Input type="number" value={config.overtime_multipliers.holiday} onChange={e => setMult("holiday", Number(e.target.value))} className="mt-1" step="0.05" />
          </div>
        </div>
      </div>

      {/* Banco de Horas */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <h3 className="text-sm font-medium">Banco de Horas</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Vigencia (meses)</Label>
            <Input type="number" value={config.hour_bank.validity_months} onChange={e => setBank("validity_months", Number(e.target.value))} className="mt-1" />
          </div>
          <div>
            <Label>Valor por Hora ($)</Label>
            <Input type="number" value={config.hour_bank.hour_value} onChange={e => setBank("hour_value", Number(e.target.value))} className="mt-1" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────
export default function ConfiguracionPage() {
  const [activeTab, setActiveTab] = useState<Tab>("Templates QuickBooks");

  const renderTab = () => {
    switch (activeTab) {
      case "Templates QuickBooks": return <QuickBooksTab />;
      case "Métodos de Pago": return <PaymentMethodsTab />;
      case "Centros de Costo": return <CostCentersTab />;
      case "Config. Comisiones": return <CommissionsTab />;
      case "Parámetros de Nómina": return <PayrollParamsTab />;
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="shrink-0 bg-background border-b border-border px-6 pt-6 pb-4">
        <h1 className="text-xl font-semibold text-foreground">Configuración Financiera</h1>
        <p className="text-sm text-muted-foreground">Parámetros y plantillas del módulo de finanzas</p>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-5">
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1 flex-wrap">
          {TABS.map(t => (
            <Button key={t} variant={activeTab === t ? "secondary" : "ghost"} size="sm" onClick={() => setActiveTab(t)}>{t}</Button>
          ))}
        </div>

        {renderTab()}
      </div>
    </div>
  );
}
