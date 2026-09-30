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
import { useLanguage } from "@/hooks/useLanguage";
import { ConFormato } from "@/pages/admin/ConFormato";
import { rolHr } from "./etiquetasHr";
import { useFormato } from "@/hooks/useFormato";
import type { Formato } from "@/lib/formato";

const usd = (n: number | null | undefined, f: Formato) => (n == null ? "—" : `$${Math.round(n).toLocaleString(f.intl("es-CO"))}`);
const cop = (n: number | null | undefined, f: Formato) => (n == null || n === 0 ? "—" : `$${Math.round(n).toLocaleString(f.intl("es-CO"))}`);

export default function HRPayroll() {
  const navigate = useNavigate();
  const f = useFormato();
  const { t } = useLanguage();
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
      toast({ title: t("hrg.pay.saved") });
      setEditing(false);
    } catch (e: any) {
      toast({ title: t("common.couldNotSave"), description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 px-6 pt-6">
        <HRPageHeader
          title={t("hrg.pay.title")}
          subtitle={t("hrg.pay.subtitle")}
          icon={Wallet}
          actions={
            <Button variant="outline" size="sm" onClick={() => setEditing((v) => !v)} className="gap-1.5">
              <Settings2 className="h-4 w-4" /> {t("hrg.pay.baseByRole")}
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
              <Kpi label={t("hrg.pay.kpi.cost")} value={usd(totals.cost, f)} icon={DollarSign} color="bg-blue-500" hint={t("hrg.pay.kpi.costHint")} />
              <Kpi label={t("hrg.pay.kpi.revenue")} value={usd(totals.rev, f)} icon={TrendingUp} color="bg-violet-500" hint={t("hrg.pay.kpi.revenueHint")} />
              <Kpi label={t("hrg.pay.kpi.margin")} value={usd(totals.margin, f)} icon={Wallet} color={totals.margin >= 0 ? "bg-success" : "bg-destructive"} hint={t("hrg.pay.kpi.marginHint")} tone={totals.margin >= 0 ? "ok" : "bad"} />
              <Kpi label={t("hrg.pay.kpi.people")} value={String(totals.people)} icon={Users} color="bg-slate-500" hint={t("hrg.pay.kpi.peopleHint")} />
            </>
          )}
        </div>

        {/* Editor de base por rol */}
        {editing && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Settings2 className="h-4 w-4 text-muted-foreground" /> {t("hrg.pay.editorTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                <ConFormato texto={t("hrg.pay.editorHelp")} />
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {draft.map((rc, i) => (
                  <div key={rc.role} className="flex items-center gap-2 rounded-lg border border-border bg-card/40 p-2">
                    <span className="w-28 shrink-0 text-sm">{rolHr(t, rc.role)}</span>
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
                <Button variant="ghost" size="sm" onClick={() => { setDraft(roleCosts.map((r) => ({ ...r }))); setEditing(false); }}>{t("common.cancel")}</Button>
                <Button size="sm" onClick={onSave} disabled={save.isPending}>
                  {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("common.save")}
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
                    <th className="px-4 py-3 text-left font-semibold">{t("hrg.pay.col.person")}</th>
                    <th className="px-3 py-3 text-left font-semibold">{t("common.role")}</th>
                    <th className="px-3 py-3 text-right font-semibold">{t("hrg.pay.col.base")}</th>
                    <th className="px-3 py-3 text-right font-semibold">{t("hrg.pay.col.cost")}</th>
                    <th className="px-3 py-3 text-right font-semibold">{t("hrg.pay.col.revenue")}</th>
                    <th className="px-3 py-3 text-right font-semibold">{t("hrg.pay.kpi.margin")}</th>
                    <th className="px-4 py-3 text-left font-semibold"></th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">{t("common.loading")}</td></tr>
                  ) : rows.map((r) => (
                    <tr key={r.profile_id} onClick={() => navigate(`/hr/persona/${r.profile_id}`)}
                      className="cursor-pointer border-b border-border/60 hover:bg-muted/40">
                      <td className="px-4 py-2.5 font-medium">{r.name}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{rolHr(t, r.role)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{cop(r.base_salary_cop, f)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          {usd(r.cost_usd, f)}
                          {r.cost_modelado && <Badge variant="secondary-soft" className="text-[9px]">{t("hrg.pay.modeled")}</Badge>}
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
          <ConFormato texto={t("hrg.pay.footnote")} />
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
