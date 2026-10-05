import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { UserAvatar } from "@/components/UserAvatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, Clock, Loader2, Settings2, ShieldAlert } from "lucide-react";
import { ETIQUETA_ESTADO_ONBOARDING, type OnboardingCreator } from "./useOnboarding";
import { useLanguage } from "@/hooks/useLanguage";

interface Props {
  data: OnboardingCreator[];
  onManage?: (creator: OnboardingCreator) => void;
}

const statusConfig = {
  Completado: { icon: CheckCircle2, className: "bg-success/10 text-success border-success/20" },
  Pendiente: { icon: Clock, className: "bg-muted text-muted-foreground border-border" },
  "En Progreso": { icon: Loader2, className: "bg-primary/10 text-primary border-primary/20" },
};

const OnboardingGrid = ({ data, onManage }: Props) => {
  const { t } = useLanguage();
  if (data.length === 0) {
    return <EmptyState seed="onboarding-creadores" title={t("cr.noCreatorsOnboarding")} />;
  }

  return (
    <TooltipProvider>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {data.map((item) => {
          const displayName = item.name?.trim() || t("creadores.sell.noName");
          const sc = statusConfig[item.status];
          const StatusIcon = sc.icon;
          const pending = item.dbStatus === "pendiente_verificacion";
          return (
            <Card key={item.id} className="hover:border-primary/30 transition-colors">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <UserAvatar
                    name={displayName}
                    src={item.profile_photo_url}
                    className="h-10 w-10"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium text-sm truncate">{displayName}</p>
                      {pending && (
                        <Tooltip>
                        <TooltipTrigger asChild>
                            <span className="inline-flex shrink-0">
                              <ShieldAlert className="h-4 w-4 text-warning" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{t("cr.step3DocsPending")}</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{item.company || t("creadores.onb.noCompany")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={`${sc.className} text-xs ${pending ? "badge-pending-verification" : ""}`}>
                    <StatusIcon className="h-3 w-3 mr-1" />
                    {pending ? t("creadores.status.pendingVerification") : t(ETIQUETA_ESTADO_ONBOARDING[item.status])}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{t("creadores.onb.progress")}</span>
                    <span>{item.progress}%</span>
                  </div>
                  <Progress value={item.progress} className="h-2" />
                </div>
                <Button variant="secondary" size="icon" className="h-8 w-8 ml-auto" onClick={() => onManage?.(item)} aria-label={t("creadores.onb.manage")} title={t("creadores.onb.manage")}>
                  <Settings2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </TooltipProvider>
  );
};

export default OnboardingGrid;
