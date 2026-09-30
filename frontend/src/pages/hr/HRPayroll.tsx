import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Wallet, DollarSign, TrendingUp, Users, Pencil, Loader2, Settings2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { HRPageHeader } from "@/components/hr/HRPageHeader";
import { cn } from "@/lib/utils";
import { useHrPayroll, useRoleCosts, useSaveRoleCost, type RoleCost } from "./useHrPayroll";
import { HR_ROLE_LABEL } from "./useHrPeople";
import { useFormato } from "@/hooks/useFormato";
import type { Formato } from "@/lib/formato";

const usd = (n: number | null | undefined, f: Formato) => (n == null ? "—" : `$${Math.round(n).toLocaleString(f.intl("es-CO"))}`);
const cop = (n: number | null | undefined, f: Formato) => (n == null || n === 0 ? "—" : `$${Math.round(n).toLocaleString(f.intl("es-CO"))}`);

export default function HRPayroll() {
  const navigate = useNavigate();
  const f = useFormato();
  const { toast } = useToast();
  const { data: rows = [], isLoading } = useHrPayroll();
  const { data: roleCosts = [] } = useRoleCosts();
  const save = useSaveRoleCost();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<RoleCost[]>([]);
  useEffect(() => { setDraft(roleCosts.map((r) => ({ ...r }))); }, [roleCosts]);

  const totals = useMemo(() => {
    const cost = rows.reduce((s, r) => s + (r.cost_usd ?? 0), 0);
    const rev = rows.reduce((s, r) => s + (r.revenue_usd ?? 0), 0);
    const margin = rows.reduce((s, r) => s + (r.margin_usd ?? 0), 0);
    return { cost, rev, margin, people: rows.length };
  }, [rows]);

  const onSave = async () => {
    try {
      await save.mutateAsync(draft);
      toast({ title: "Salarios base actualizados" });
      setEditing(false);
    } catch (e: any) {
      toast({ title: "No se pudo guardar", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 px-6 pt-6">
        <HRPageHeader
          title="Nómina y costo"
          subtitle="Costo por persona vs ingreso atribuido (Hubstaff + BLU). Chatters usan el costo modelado (base + comisión)."
          icon={Wallet}
          actions={
            <Button variant="outline" size="sm" onClick={() => setEditing((v) => !v)} className="gap-1.5">
              <Settings2 className="h-4 w-4" /> Salarios base por rol
            </Button>
          }
        />
      </div>

      <div className="flex-1 space-y-5 overflow-auto px-6 pb-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)
          ) : (
            <>
              <Kpi label="Costo mensual" value={usd(totals.cost, f)} icon={DollarSign} color="bg-blue-500" hint="Suma de costos del equipo" />
              <Kpi label="Ingreso atribuido" value={usd(totals.rev, f)} icon={TrendingUp} color="bg-violet-500" hint="Tajada agencia (chatters/BLU)" />
              <Kpi label="Margen" value={usd(totals.margin, f)} icon={Wallet} color={totals.margin >= 0 ? "bg-success" : "bg-destructive"} hint="Ingreso − costo (chatters)" tone={totals.margin >= 0 ? "ok" : "bad"} />
              <Kpi label="Personas" value={String(totals.people)} icon={Users} color="bg-slate-500" hint="En el roster" />
            </>
          )}
        </div>

        {/* Editor de base por rol */}
        {editing && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Settings2 className="h-4 w-4 text-muted-foreground" /> Salario base mensual por rol (COP)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Define el salario base por rol. <strong>Chatters</strong> usan el costo modelado (base + comisión) de Hubstaff/BLU,
                así que su base aquí es referencial. El costo de los demás roles = base ÷ tasa de cambio.
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {draft.map((rc, i) => (
                  <div key={rc.role} className="flex items-center gap-2 rounded-lg border border-border bg-card/40 p-2">
                    <span className="w-28 shrink-0 text-sm">{HR_ROLE_LABEL[rc.role] ?? rc.role}</span>
                    <Input
                      type="number"
                      value={rc.base_salary_cop || ""}
                      placeholder="0"
                      onChange={(e) => setDraft((d) => d.map((x, j) => (j === i ? { ...x, base_salary_cop: Number(e.target.value) } : x)))}
                      className="h-8"
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => { setDraft(roleCosts.map((r) => ({ ...r }))); setEditing(false); }}>Cancelar</Button>
                <Button size="sm" onClick={onSave} disabled={save.isPending}>
                  {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabla por persona */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="tabla-movil w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-4 py-3 text-left font-semibold">Persona</th>
                    <th className="px-3 py-3 text-left font-semibold">Rol</th>
                    <th className="px-3 py-3 text-right font-semibold">Base (COP)</th>
                    <th className="px-3 py-3 text-right font-semibold">Costo (USD)</th>
                    <th className="px-3 py-3 text-right font-semibold">Ingreso ag.</th>
                    <th className="px-3 py-3 text-right font-semibold">Margen</th>
                    <th className="px-4 py-3 text-left font-semibold"></th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">Cargando…</td></tr>
                  ) : rows.map((r) => (
                    <tr key={r.profile_id} onClick={() => navigate(`/hr/persona/${r.profile_id}`)}
                      className="cursor-pointer border-b border-border/60 hover:bg-muted/40">
                      <td className="px-4 py-2.5 font-medium">{r.name}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{HR_ROLE_LABEL[r.role] ?? r.role}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{cop(r.base_salary_cop, f)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          {usd(r.cost_usd, f)}
                          {r.cost_modelado && <Badge variant="secondary-soft" className="text-[9px]">modelado</Badge>}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{r.revenue_usd != null ? usd(r.revenue_usd, f) : "—"}</td>
                      <td className={cn("px-3 py-2.5 text-right font-semibold tabular-nums",
                        r.margin_usd == null ? "text-muted-foreground" : r.margin_usd >= 0 ? "text-success" : "text-destructive")}>
                        {r.margin_usd != null ? usd(r.margin_usd, f) : "—"}
                      </td>
                      <td className="px-4 py-2.5"><Pencil className="h-3.5 w-3.5 text-muted-foreground/50" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        <p className="px-1 text-[11px] text-muted-foreground">
          El costo de <strong>chatters</strong> es modelado (base + comisión, incluye la tajada de OF y el % de agencia) y trae ingreso atribuido desde BLU → margen y ROI reales.
          Para los demás roles, carga el salario base por rol (botón arriba) y el costo se calcula automáticamente; el ingreso atribuido directo aplica solo a chatters. Click en una fila abre la ficha.
        </p>
      </div>
    </div>
  );
}

function Kpi({ label, value, icon: Icon, color, hint, tone }: { label: string; value: string; icon: any; color: string; hint?: string; tone?: "ok" | "bad" }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white", color)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className={cn("text-xl font-bold leading-tight", tone === "ok" && "text-success", tone === "bad" && "text-destructive")}>{value}</div>
          {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
        </div>
      </CardContent>
    </Card>
  );
}
