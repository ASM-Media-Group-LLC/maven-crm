import { AlertTriangle, AlertCircle, Info, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import type { HealthCheckDetail } from "./useAuditoriaData";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { etiquetaPermiso } from "../etiquetasPermisos";

interface Props {
  checks: { critical: number; high: number; medium: number; low: number; details: HealthCheckDetail[] };
}

const severityConfig: Record<HealthCheckDetail["priority"], { label: TranslationKey; color: string; icon: typeof Info }> = {
  critical: { label: "common.critical", color: "bg-destructive/10 text-destructive border-destructive/20", icon: AlertCircle },
  high: { label: "admin.audit.sevHigh", color: "bg-warning/10 text-warning border-warning/20", icon: AlertTriangle },
  medium: { label: "admin.audit.sevMedium", color: "bg-warning/10 text-warning border-warning/20", icon: Info },
  low: { label: "admin.audit.sevLow", color: "bg-muted text-muted-foreground border-border", icon: Info },
};

const AuditoriaHealthChecks = ({ checks }: Props) => {
  const { t } = useLanguage();
  const totalIssues = checks.critical + checks.high + checks.medium + checks.low;

  if (totalIssues === 0) {
    return (
      <div className="rounded-lg border bg-success/10 border-success/20 p-4 flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-success/20 flex items-center justify-center">
          <Info className="h-4 w-4 text-success" />
        </div>
        <p className="text-sm font-medium text-success">{t("admin.audit.noIssues")}</p>
      </div>
    );
  }

  // Group details by unique kind + data (lo que antes era categoría + mensaje)
  const grouped = checks.details.reduce<Record<string, HealthCheckDetail & { repeticiones: number }>>((acc, d) => {
    const key = `${d.kind}::${d.module ?? ""}::${d.count ?? ""}`;
    if (!acc[key]) {
      acc[key] = { ...d, repeticiones: 1 };
    } else {
      acc[key].repeticiones++;
      acc[key].affected = [...acc[key].affected, ...d.affected];
    }
    return acc;
  }, {});

  const uniqueDetails = Object.values(grouped);

  return (
    <div className="space-y-3">
      {/* Severity summary badges */}
      <div className="flex gap-2 flex-wrap">
        {(["critical", "high", "medium", "low"] as const).map((sev) => {
          if (checks[sev] === 0) return null;
          const cfg = severityConfig[sev];
          return (
            <Badge key={sev} variant="outline" className={cfg.color}>
              <cfg.icon className="h-3 w-3 mr-1" />
              {checks[sev]} {t(cfg.label)}
            </Badge>
          );
        })}
      </div>

      {/* Expandable findings */}
      <div className="space-y-2">
        {uniqueDetails.map((detail, idx) => {
          const cfg = severityConfig[detail.priority];
          return (
            <Collapsible key={idx}>
              <div className={`rounded-lg border p-3 ${cfg.color}`}>
                <CollapsibleTrigger className="flex items-center justify-between w-full text-left">
                  <div className="flex items-center gap-2">
                    <cfg.icon className="h-4 w-4 shrink-0" />
                    <div>
                      <span className="text-sm font-medium">
                        {detail.kind === "users_without_role" ? t("admin.audit.checkNoRole") : t("admin.audit.checkOrphan")}
                      </span>
                      <span className="text-xs ml-2 opacity-75">
                        {detail.kind === "users_without_role"
                          ? t("admin.audit.checkNoRoleMessage", { n: detail.count ?? 0 })
                          : t("admin.audit.checkOrphanMessage", { module: etiquetaPermiso(t, detail.module ?? "") })}
                      </span>
                      {detail.repeticiones > 1 && (
                        <Badge variant="secondary" className="ml-2 text-[10px] h-4">x{detail.repeticiones}</Badge>
                      )}
                    </div>
                  </div>
                  <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {detail.affected.map((name, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">{name || t("admin.noName")}</Badge>
                    ))}
                    {detail.affected.length === 0 && (
                      <span className="text-xs opacity-60">{t("admin.audit.noAffected")}</span>
                    )}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
};

export default AuditoriaHealthChecks;
