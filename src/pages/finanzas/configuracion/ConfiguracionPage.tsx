import { useState, useEffect } from "react";
import { Plus, Trash2, Save, ArrowLeft, FileText, CreditCard, Building2, Percent, Calculator } from "lucide-react";
import DashboardMetricCard from "@/components/dashboard/DashboardMetricCard";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
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

// ─── Section definitions ──────────────────────────────────────
const SECTIONS = [
  { key: "quickbooks", title: "Templates QuickBooks", icon: FileText, description: "Mapeo de categorías a cuentas contables de QuickBooks" },
  { key: "payment_methods", title: "Métodos de Pago", icon: CreditCard, description: "Métodos de pago y comisiones aplicadas a invoices" },
  { key: "cost_centers", title: "Centros de Costo", icon: Building2, description: "Centros de costo para segmentar nómina y gastos" },
  { key: "commissions", title: "Config. Comisiones", icon: Percent, description: "Porcentajes de comisión por defecto y excepciones" },
  { key: "payroll", title: "Parámetros de Nómina", icon: Calculator, description: "Cálculo de nómina, horas extra y banco de horas" },
] as const;

type SectionKey = typeof SECTIONS[number]["key"];

// ─── Main Page ────────────────────────────────────────────────
export default function ConfiguracionPage() {
  const [activeSection, setActiveSection] = useState<SectionKey | null>(null);

  const { mappings } = useQuickBooksTemplates();
  const { methods } = usePaymentMethods();
  const { centers } = useCostCenters();
  const { defaults } = useCommissionDefaults();
  const { params } = usePayrollParams();

  const activeMethods = methods.filter(m => m.active).length;
  const totalBudget = centers.reduce((s, c) => s + c.monthly_budget, 0);
  const exceptionsCount = defaults?.exceptions?.length ?? 0;

  const renderDetail = () => {
    switch (activeSection) {
      case "quickbooks": return <QuickBooksTab />;
      case "payment_methods": return <PaymentMethodsTab />;
      case "cost_centers": return <CostCentersTab />;
      case "commissions": return <CommissionsTab />;
      case "payroll": return <PayrollParamsTab />;
      default: return null;
    }
  };

  const activeTitle = SECTIONS.find(s => s.key === activeSection)?.title;

  // ── Detail view ──
  if (activeSection) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <header className="shrink-0 bg-background border-b border-border px-6 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setActiveSection(null)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Configuración Financiera</span>
                <span>/</span>
                <span className="text-foreground font-medium">{activeTitle}</span>
              </div>
              <h1 className="text-xl font-semibold text-foreground">{activeTitle}</h1>
            </div>
          </div>
        </header>
        <div className="flex-1 overflow-auto p-6">
          {renderDetail()}
        </div>
      </div>
    );
  }

  // ── Main cards view ──
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="shrink-0 bg-background border-b border-border px-6 pt-6 pb-4">
        <h1 className="text-xl font-semibold text-foreground">Configuración Financiera</h1>
        <p className="text-sm text-muted-foreground">Parámetros y plantillas del módulo de finanzas</p>
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* KPI Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <DashboardMetricCard label="Mapeos QB" value={String(mappings.length)} icon={FileText} subtitle="cuentas configuradas" color="primary" />
          <DashboardMetricCard label="Métodos de Pago" value={String(activeMethods)} icon={CreditCard} subtitle="métodos activos" color="accent" />
          <DashboardMetricCard label="Centros de Costo" value={String(centers.length)} icon={Building2} subtitle={fmt(totalBudget) + " presupuesto"} color="primary" />
          <DashboardMetricCard label="Comisiones" value={`${defaults?.creator_pct ?? 0}%`} icon={Percent} subtitle={`${exceptionsCount} excepciones`} color="accent" />
          <DashboardMetricCard label="Parámetros Nómina" value={`$${params?.hour_bank?.hour_value ?? 0}/h`} icon={Calculator} subtitle={`HE: ${params?.overtime_multipliers?.daytime ?? 0}x / ${params?.overtime_multipliers?.nighttime ?? 0}x / ${params?.overtime_multipliers?.holiday ?? 0}x`} color="primary" />
        </div>

        {/* Section Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {SECTIONS.map(s => {
            const count =
              s.key === "quickbooks" ? `${mappings.length} mapeos` :
              s.key === "payment_methods" ? `${activeMethods} activos` :
              s.key === "cost_centers" ? `${centers.length} centros` :
              s.key === "commissions" ? `${exceptionsCount} excepciones` :
              `${params?.hour_bank?.validity_months ?? 0} meses vigencia`;

            return (
              <Card
                key={s.key}
                className="cursor-pointer transition-all duration-200 hover:translate-y-[-2px] hover:border-primary/30 hover:shadow-md"
                onClick={() => setActiveSection(s.key)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <s.icon className="h-4.5 w-4.5 text-muted-foreground" />
                    </div>
                    <CardTitle className="text-base">{s.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-2">{s.description}</p>
                  <Badge variant="secondary" className="text-xs">{count}</Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}