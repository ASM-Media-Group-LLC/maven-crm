import { useState } from "react";
import { Plus, Trash2, Infinity } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { useFormato } from "@/hooks/useFormato";
import type { Formato } from "@/lib/formato";
import { traducir } from "@/lib/i18n";
import { useLanguage } from "@/hooks/useLanguage";

export interface CommissionTier {
  min_revenue: number;
  max_revenue: number | null;
  percentage: number;
}

interface CommissionTiersEditorProps {
  commissionType: "fixed" | "tiered";
  fixedPercentage: number;
  tiers: CommissionTier[];
  onTypeChange: (type: "fixed" | "tiered") => void;
  onFixedPercentageChange: (value: number) => void;
  onTiersChange: (tiers: CommissionTier[]) => void;
}

function fmt(n: number, f: Formato) {
  return new Intl.NumberFormat(f.intl("es-CO"), { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);
}

function validateTiers(tiers: CommissionTier[]): string | null {
  if (tiers.length === 0) return traducir("creadores.tiers.errNone");
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i];
    if (t.percentage < 0 || t.percentage > 100) return traducir("creadores.tiers.errPct", { n: i + 1 });
    if (t.max_revenue !== null && t.max_revenue <= t.min_revenue) return traducir("creadores.tiers.errMax", { n: i + 1 });
    if (i > 0 && tiers[i - 1].max_revenue !== null && t.min_revenue !== tiers[i - 1].max_revenue + 1) {
      return traducir("creadores.tiers.errContiguous", { n: i + 1 });
    }
    if (i < tiers.length - 1 && t.max_revenue === null) return traducir("creadores.tiers.errOnlyLastUnlimited");
  }
  return null;
}

export { validateTiers };

export default function CommissionTiersEditor({
  commissionType,
  fixedPercentage,
  tiers,
  onTypeChange,
  onFixedPercentageChange,
  onTiersChange,
}: CommissionTiersEditorProps) {
  const f = useFormato();
  const { t } = useLanguage();
  const [error, setError] = useState<string | null>(null);

  const addTier = () => {
    const lastMax = tiers.length > 0 ? (tiers[tiers.length - 1].max_revenue ?? 0) : 0;
    const newTiers = [...tiers];
    // If last tier had null max, set it to lastMax + some value
    if (newTiers.length > 0 && newTiers[newTiers.length - 1].max_revenue === null) {
      newTiers[newTiers.length - 1] = { ...newTiers[newTiers.length - 1], max_revenue: lastMax || 10000 };
    }
    const newMin = newTiers.length > 0 ? ((newTiers[newTiers.length - 1].max_revenue ?? 0) + 1) : 0;
    newTiers.push({ min_revenue: newMin, max_revenue: null, percentage: 0 });
    onTiersChange(newTiers);
    setError(null);
  };

  const removeTier = (index: number) => {
    const newTiers = tiers.filter((_, i) => i !== index);
    // Fix continuity
    for (let i = 1; i < newTiers.length; i++) {
      newTiers[i] = { ...newTiers[i], min_revenue: newTiers[i - 1].max_revenue !== null ? newTiers[i - 1].max_revenue + 1 : newTiers[i].min_revenue };
    }
    onTiersChange(newTiers);
    setError(null);
  };

  const updateTier = (index: number, field: keyof CommissionTier, value: number | null) => {
    const newTiers = [...tiers];
    newTiers[index] = { ...newTiers[index], [field]: value };
    // Auto-update next tier's min to match this tier's max
    if (field === "max_revenue" && index < newTiers.length - 1 && value !== null) {
      newTiers[index + 1] = { ...newTiers[index + 1], min_revenue: value + 1 };
    }
    onTiersChange(newTiers);
    const err = validateTiers(newTiers);
    setError(err);
  };

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">{t("creadores.tiers.agencyPct")}</Label>
      <RadioGroup
        value={commissionType}
        onValueChange={(v) => {
          onTypeChange(v as "fixed" | "tiered");
          setError(null);
        }}
        className="flex gap-4"
      >
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <RadioGroupItem value="fixed" />
          {t("creadores.tiers.fixed")}
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <RadioGroupItem value="tiered" />
          {t("creadores.tiers.tiered")}
        </label>
      </RadioGroup>

      {commissionType === "fixed" ? (
        <div className="max-w-xs">
          <Input
            type="number"
            value={fixedPercentage}
            onChange={(e) => onFixedPercentageChange(Number(e.target.value))}
            min={0}
            max={100}
            placeholder="15"
            className="w-full"
          />
          <p className="text-xs text-muted-foreground mt-1">{t("creadores.tiers.fixedHelp")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Header */}
          {tiers.length > 0 && (
            <div className="grid grid-cols-[1fr_1fr_100px_36px] gap-2 text-xs font-medium text-muted-foreground px-1">
              <span>{t("creadores.tiers.min")}</span>
              <span>{t("creadores.tiers.max")}</span>
              <span>%</span>
              <span />
            </div>
          )}

          {/* Rows */}
          {tiers.map((tier, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_100px_36px] gap-2 items-center">
              <Input
                type="number"
                value={tier.min_revenue}
                onChange={(e) => updateTier(i, "min_revenue", Number(e.target.value))}
                min={0}
                disabled={i > 0}
                className={cn("h-9 text-sm", i > 0 && "bg-muted/50")}
              />
              {tier.max_revenue !== null ? (
                <Input
                  type="number"
                  value={tier.max_revenue}
                  onChange={(e) => updateTier(i, "max_revenue", Number(e.target.value))}
                  min={tier.min_revenue + 1}
                  className="h-9 text-sm"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => updateTier(i, "max_revenue", tier.min_revenue + 10000)}
                  className="h-9 px-3 rounded-md border border-input bg-muted/30 text-sm text-muted-foreground flex items-center gap-1 hover:bg-muted/50 transition-colors"
                >
                  <Infinity className="h-3.5 w-3.5" /> {t("creadores.tiers.noLimit")}
                </button>
              )}
              <Input
                type="number"
                value={tier.percentage}
                onChange={(e) => updateTier(i, "percentage", Number(e.target.value))}
                min={0}
                max={100}
                className="h-9 text-sm"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-destructive"
                aria-label={t("creadores.tiers.remove")}
                title={t("creadores.tiers.remove")}
                onClick={() => removeTier(i)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <Button type="button" variant="outline" size="sm" onClick={addTier} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> {t("creadores.tiers.add")}
          </Button>

          {error && <p className="text-xs text-destructive">{error}</p>}

          {tiers.length > 0 && !error && (
            <div className="rounded-md border border-border bg-muted/20 p-3 space-y-1">
              <p className="text-xs font-medium text-muted-foreground">{t("creadores.tiers.summary")}</p>
              {tiers.map((tramo, i) => (
                <p key={i} className="text-xs">
                  {fmt(tramo.min_revenue, f)} – {tramo.max_revenue !== null ? fmt(tramo.max_revenue, f) : "∞"}: <span className="font-semibold">{tramo.percentage}%</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
