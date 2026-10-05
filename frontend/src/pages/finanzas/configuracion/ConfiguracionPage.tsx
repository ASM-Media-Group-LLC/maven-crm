import { useState, useEffect } from "react";
import { Plus, Trash2, Save, FileText, CreditCard, Building2, Percent, Calculator } from "lucide-react";
import StatChip from "@/components/StatChip";
import KpiDetailDialog, { type KpiRow } from "@/components/dashboard/KpiDetailDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
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
import { useFormato } from "@/hooks/useFormato";
import type { Formato } from "@/lib/formato";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";

function fmt(n: number, f: Formato) {
  return new Intl.NumberFormat(f.intl("es-CO"), { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);
}

// ─── QuickBooks Tab ───────────────────────────────────────────
function QuickBooksTab() {
  const { t } = useLanguage();
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
        <p className="text-sm text-muted-foreground">{t("finanzas.config.qb.desc")}</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={add}><Plus className="h-4 w-4 mr-1" />{t("finanzas.config.qb.add")}</Button>
          <Button size="sm" onClick={save} disabled={update.isPending}><Save className="h-4 w-4 mr-1" />{t("common.save")}</Button>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="text-sm text-muted-foreground">{t("finanzas.config.qb.empty")}</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">{t("common.category")}</TableHead>
                <TableHead className="text-xs">{t("common.type")}</TableHead>
                <TableHead className="text-xs">{t("common.code")}</TableHead>
                <TableHead className="text-xs">{t("finanzas.config.qb.accountName")}</TableHead>
                <TableHead className="text-xs w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((m, i) => (
                <TableRow key={i}>
                  <TableCell><Input value={m.category} onChange={e => set(i, "category", e.target.value)} placeholder={t("finanzas.common.commissions")} className="h-8" /></TableCell>
                  <TableCell>
                    <Select value={m.type} onValueChange={v => set(i, "type", v)}>
                      <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ingreso">{t("finanzas.config.qb.income")}</SelectItem>
                        <SelectItem value="egreso">{t("finanzas.config.qb.expense")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell><Input value={m.code} onChange={e => set(i, "code", e.target.value)} placeholder="6010" className="h-8 w-24" /></TableCell>
                  <TableCell><Input value={m.account_name} onChange={e => set(i, "account_name", e.target.value)} placeholder={t("finanzas.config.qb.accountPlaceholder")} className="h-8" /></TableCell>
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
  const { t } = useLanguage();
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
        <p className="text-sm text-muted-foreground">{t("finanzas.config.methods.desc")}</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={add}><Plus className="h-4 w-4 mr-1" />{t("finanzas.config.methods.add")}</Button>
          <Button size="sm" onClick={save} disabled={update.isPending}><Save className="h-4 w-4 mr-1" />{t("common.save")}</Button>
        </div>
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">{t("common.name")}</TableHead>
              <TableHead className="text-xs">{t("finanzas.config.methods.commissionPct")}</TableHead>
              <TableHead className="text-xs">{t("common.active")}</TableHead>
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
  const { t } = useLanguage();
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
        <p className="text-sm text-muted-foreground">{t("finanzas.config.centers.desc")}</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={add}><Plus className="h-4 w-4 mr-1" />{t("finanzas.config.centers.add")}</Button>
          <Button size="sm" onClick={save} disabled={update.isPending}><Save className="h-4 w-4 mr-1" />{t("common.save")}</Button>
        </div>
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">{t("common.name")}</TableHead>
              <TableHead className="text-xs">{t("common.code")}</TableHead>
              <TableHead className="text-xs">{t("finanzas.config.centers.budget")}</TableHead>
              <TableHead className="text-xs w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((c, i) => (
              <TableRow key={i}>
                <TableCell><Input value={c.name} onChange={e => set(i, "name", e.target.value)} placeholder={t("finanzas.cc.operations")} className="h-8" /></TableCell>
                <TableCell><Input value={c.code} onChange={e => set(i, "code", e.target.value)} placeholder="OPS" className="h-8 w-24" /></TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Input type="number" value={c.monthly_budget} onChange={e => set(i, "monthly_budget", Number(e.target.value))} className="h-8 w-32" />
                    {c.monthly_budget === 0 && <Badge variant="destructive" className="text-[10px]">{t("finanzas.config.centers.noBudget")}</Badge>}
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
  const { t } = useLanguage();
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
        <p className="text-sm text-muted-foreground">{t("finanzas.config.comm.desc")}</p>
        <Button size="sm" onClick={save} disabled={update.isPending}><Save className="h-4 w-4 mr-1" />{t("common.save")}</Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>{t("finanzas.config.comm.creatorPct")}</Label>
          <Input type="number" value={config.creator_pct} onChange={e => setConfig(prev => ({ ...prev, creator_pct: Number(e.target.value) }))} className="mt-1" />
        </div>
        <div>
          <Label>{t("finanzas.config.comm.partnerPct")}</Label>
          <Input type="number" value={config.partner_pct} onChange={e => setConfig(prev => ({ ...prev, partner_pct: Number(e.target.value) }))} className="mt-1" />
        </div>
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>{t("finanzas.config.comm.exceptions")}</Label>
          <Button size="sm" variant="outline" onClick={addException}><Plus className="h-4 w-4 mr-1" />{t("finanzas.config.comm.addException")}</Button>
        </div>
        {config.exceptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("finanzas.config.comm.noExceptions")}</p>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{t("finanzas.config.comm.creatorName")}</TableHead>
                  <TableHead className="text-xs">{t("finanzas.config.comm.specialPct")}</TableHead>
                  <TableHead className="text-xs w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {config.exceptions.map((ex, i) => (
                  <TableRow key={i}>
                    <TableCell><Input value={ex.creator_name || ""} onChange={e => setException(i, "creator_name", e.target.value)} placeholder={t("finanzas.config.comm.creatorNamePlaceholder")} className="h-8" /></TableCell>
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
  const { t } = useLanguage();
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
        <p className="text-sm text-muted-foreground">{t("finanzas.config.payroll.desc")}</p>
        <Button size="sm" onClick={save} disabled={update.isPending}><Save className="h-4 w-4 mr-1" />{t("finanzas.config.saveChanges")}</Button>
      </div>

      {/* Deducciones Legales */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <h3 className="text-sm font-medium">{t("finanzas.config.payroll.legalDeductions")}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label>{t("finanzas.config.payroll.healthPct")}</Label>
            <Input type="number" value={config.deductions.health_pct} onChange={e => setDed("health_pct", Number(e.target.value))} className="mt-1" step="0.5" />
          </div>
          <div>
            <Label>{t("finanzas.config.payroll.pensionPct")}</Label>
            <Input type="number" value={config.deductions.pension_pct} onChange={e => setDed("pension_pct", Number(e.target.value))} className="mt-1" step="0.5" />
          </div>
          <div>
            <Label>{t("finanzas.config.payroll.taxPct")}</Label>
            <Input type="number" value={config.deductions.tax_pct} onChange={e => setDed("tax_pct", Number(e.target.value))} className="mt-1" step="0.5" />
          </div>
        </div>
      </div>

      {/* Multiplicadores HE */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <h3 className="text-sm font-medium">{t("finanzas.config.payroll.otMultipliers")}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label>{t("finanzas.config.payroll.daytime")}</Label>
            <Input type="number" value={config.overtime_multipliers.daytime} onChange={e => setMult("daytime", Number(e.target.value))} className="mt-1" step="0.05" />
          </div>
          <div>
            <Label>{t("finanzas.config.payroll.nighttime")}</Label>
            <Input type="number" value={config.overtime_multipliers.nighttime} onChange={e => setMult("nighttime", Number(e.target.value))} className="mt-1" step="0.05" />
          </div>
          <div>
            <Label>{t("finanzas.config.payroll.holiday")}</Label>
            <Input type="number" value={config.overtime_multipliers.holiday} onChange={e => setMult("holiday", Number(e.target.value))} className="mt-1" step="0.05" />
          </div>
        </div>
      </div>

      {/* Banco de Horas */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <h3 className="text-sm font-medium">{t("finanzas.common.hourBank")}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>{t("finanzas.config.payroll.validityMonths")}</Label>
            <Input type="number" value={config.hour_bank.validity_months} onChange={e => setBank("validity_months", Number(e.target.value))} className="mt-1" />
          </div>
          <div>
            <Label>{t("finanzas.config.payroll.hourValue")}</Label>
            <Input type="number" value={config.hour_bank.hour_value} onChange={e => setBank("hour_value", Number(e.target.value))} className="mt-1" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Section definitions ──────────────────────────────────────
const SECTIONS: ReadonlyArray<{ key: "quickbooks" | "payment_methods" | "cost_centers" | "commissions" | "payroll"; titleKey: TranslationKey; icon: typeof FileText; descKey: TranslationKey }> = [
  { key: "quickbooks", titleKey: "finanzas.config.section.qb", icon: FileText, descKey: "finanzas.config.qb.desc" },
  { key: "payment_methods", titleKey: "finanzas.common.paymentMethods", icon: CreditCard, descKey: "finanzas.config.section.methodsDesc" },
  { key: "cost_centers", titleKey: "finanzas.config.section.centers", icon: Building2, descKey: "finanzas.config.centers.desc" },
  { key: "commissions", titleKey: "finanzas.config.section.comm", icon: Percent, descKey: "finanzas.config.section.commDesc" },
  { key: "payroll", titleKey: "finanzas.config.section.payroll", icon: Calculator, descKey: "finanzas.config.section.payrollDesc" },
];

type SectionKey = typeof SECTIONS[number]["key"];

// ─── Main Page ────────────────────────────────────────────────
export default function ConfiguracionPage() {
  const f = useFormato();
  const { t } = useLanguage();
  const [activeSection, setActiveSection] = useState<SectionKey | null>(null);
  type KpiKey = "qb" | "methods" | "centers" | "commissions" | "payroll";
  const [kpiPopup, setKpiPopup] = useState<KpiKey | null>(null);

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

  const activeTitleKey = SECTIONS.find(s => s.key === activeSection)?.titleKey;

  // ── Main view (sin redirección — secciones abren modal) ──
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="shrink-0 bg-background/30 backdrop-blur-xl border-b border-white/10 px-6 pt-6 pb-4">
        <PageHeader
          title={t("finanzas.config.title")}
          subtitle={t("finanzas.config.subtitle")}
        />
      </header>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* KPI Summary — clickeables */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <StatChip label={t("finanzas.config.kpi.qb")} value={String(mappings.length)} icon={<FileText className="h-3.5 w-3.5" />} color="bg-primary" hint={t("finanzas.config.kpi.qbHint")} onClick={() => setKpiPopup("qb")} />
          <StatChip label={t("finanzas.common.paymentMethods")} value={String(activeMethods)} icon={<CreditCard className="h-3.5 w-3.5" />} color="bg-success" hint={t("finanzas.config.kpi.methodsHint")} onClick={() => setKpiPopup("methods")} />
          <StatChip label={t("finanzas.config.section.centers")} value={String(centers.length)} icon={<Building2 className="h-3.5 w-3.5" />} color="bg-accent" hint={t("finanzas.config.kpi.budgetHint", { amount: fmt(totalBudget, f) })} onClick={() => setKpiPopup("centers")} />
          <StatChip label={t("finanzas.common.commissions")} value={`${defaults?.creator_pct ?? 0}%`} icon={<Percent className="h-3.5 w-3.5" />} color="bg-warning" hint={t("finanzas.config.exceptionsCount", { n: exceptionsCount })} onClick={() => setKpiPopup("commissions")} />
          <StatChip label={t("finanzas.config.kpi.payroll")} value={`$${params?.hour_bank?.hour_value ?? 0}/h`} icon={<Calculator className="h-3.5 w-3.5" />} color="bg-destructive" hint={`${t("finanzas.config.otShort")}: ${params?.overtime_multipliers?.daytime ?? 0}x / ${params?.overtime_multipliers?.nighttime ?? 0}x / ${params?.overtime_multipliers?.holiday ?? 0}x`} onClick={() => setKpiPopup("payroll")} />
        </div>

        {/* Section Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {SECTIONS.map(s => {
            const count =
              s.key === "quickbooks" ? t("finanzas.config.count.mappings", { n: mappings.length }) :
              s.key === "payment_methods" ? t("finanzas.config.count.active", { n: activeMethods }) :
              s.key === "cost_centers" ? t("finanzas.config.count.centers", { n: centers.length }) :
              s.key === "commissions" ? t("finanzas.config.exceptionsCount", { n: exceptionsCount }) :
              t("finanzas.config.count.validity", { n: params?.hour_bank?.validity_months ?? 0 });

            const sectionColor = (key: string) =>
              key === "quickbooks" ? "bg-primary" :
              key === "payment_methods" ? "bg-success" :
              key === "cost_centers" ? "bg-accent" :
              key === "commissions" ? "bg-warning" :
              "bg-destructive";
            return (
              <StatChip
                key={s.key}
                label={t(s.titleKey)}
                value={count}
                icon={<s.icon className="h-3.5 w-3.5" />}
                color={sectionColor(s.key)}
                hint={t(s.descKey)}
                onClick={() => setActiveSection(s.key)}
              />
            );
          })}
        </div>
      </div>

      {/* MODAL — sección activa (en lugar de re-render página completa) */}
      <Dialog open={activeSection !== null} onOpenChange={(o) => !o && setActiveSection(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{activeTitleKey ? t(activeTitleKey) : ""}</DialogTitle>
          </DialogHeader>
          {renderDetail()}
        </DialogContent>
      </Dialog>

      {/* MODAL — detalle de KPI (lista de items) */}
      <KpiDetailDialog
        open={kpiPopup !== null}
        onOpenChange={(o) => !o && setKpiPopup(null)}
        emptyText={t("finanzas.kpi.empty")}
        title={(() => {
          switch (kpiPopup) {
            case "qb": return t("finanzas.config.popup.qb", { n: mappings.length });
            case "methods": return t("finanzas.config.popup.methods", { active: activeMethods, total: methods.length });
            case "centers": return t("finanzas.config.popup.centers", { n: centers.length });
            case "commissions": return t("finanzas.config.popup.comm", { pct: defaults?.creator_pct ?? 0 });
            case "payroll": return t("finanzas.config.section.payroll");
            default: return "";
          }
        })()}
        subtitle={(() => {
          switch (kpiPopup) {
            case "qb": return t("finanzas.config.popup.qbSub");
            case "methods": return t("finanzas.config.popup.methodsSub");
            case "centers": return t("finanzas.config.popup.centersSub", { amount: fmt(totalBudget, f) });
            case "commissions": return t("finanzas.config.popup.commSub", { n: exceptionsCount, pct: defaults?.creator_pct ?? 0 });
            case "payroll": return t("finanzas.config.popup.payrollSub");
            default: return undefined;
          }
        })()}
        rows={(() => {
          if (kpiPopup === "qb") {
            return mappings.map((m): KpiRow => ({
              primary: (m as any).category ?? (m as any).name ?? t("finanzas.config.row.noCategory"),
              secondary: (m as any).qb_account ?? (m as any).account ?? t("finanzas.config.row.noAccount"),
            }));
          }
          if (kpiPopup === "methods") {
            return methods.map((m): KpiRow => ({
              primary: (m as any).name ?? t("finanzas.common.noName"),
              secondary: (m as any).fee_pct !== undefined ? t("finanzas.config.row.fee", { pct: (m as any).fee_pct }) : undefined,
              right: m.active ? t("common.active") : t("common.inactive"),
              rightTone: m.active ? "success" : "default",
            }));
          }
          if (kpiPopup === "centers") {
            return centers.map((c): KpiRow => ({
              primary: c.name,
              secondary: (c as any).code ?? undefined,
              right: fmt(c.monthly_budget, f),
            }));
          }
          if (kpiPopup === "commissions") {
            const baseRow: KpiRow = { primary: t("finanzas.config.row.defaultCreators"), right: `${defaults?.creator_pct ?? 0}%`, rightTone: "default" };
            const excRows: KpiRow[] = (defaults?.exceptions ?? []).map((e: any) => ({
              primary: e.creator_name ?? `Creator ${e.creator_id?.slice?.(0, 8) ?? "—"}`,
              secondary: t("finanzas.config.row.exception"),
              right: `${e.pct ?? 0}%`,
              rightTone: "warning",
            }));
            return [baseRow, ...excRows];
          }
          if (kpiPopup === "payroll") {
            return [
              { primary: t("finanzas.config.row.bankHour"), right: fmt(params?.hour_bank?.hour_value ?? 0, f) },
              { primary: t("finanzas.config.row.bankValidity"), right: t("finanzas.config.row.months", { n: params?.hour_bank?.validity_months ?? 0 }) },
              { primary: t("finanzas.config.row.otDay"), right: `${params?.overtime_multipliers?.daytime ?? 0}x` },
              { primary: t("finanzas.config.row.otNight"), right: `${params?.overtime_multipliers?.nighttime ?? 0}x` },
              { primary: t("finanzas.config.row.otHoliday"), right: `${params?.overtime_multipliers?.holiday ?? 0}x` },
            ];
          }
          return [];
        })()}
      />
    </div>
  );
}