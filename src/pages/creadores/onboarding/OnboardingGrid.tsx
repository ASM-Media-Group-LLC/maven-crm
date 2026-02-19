import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Clock, Loader2 } from "lucide-react";
import type { OnboardingCreator } from "./useOnboarding";

interface Props {
  data: OnboardingCreator[];
}

const statusConfig = {
  Completado: { icon: CheckCircle2, className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
  Pendiente: { icon: Clock, className: "bg-muted text-muted-foreground border-border" },
  "En Progreso": { icon: Loader2, className: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
};

const OnboardingGrid = ({ data }: Props) => {
  if (data.length === 0) {
    return <p className="text-center text-muted-foreground py-8">No hay creadores en onboarding</p>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {data.map((item) => {
        const initials = item.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
        const sc = statusConfig[item.status];
        const StatusIcon = sc.icon;
        return (
          <Card key={item.id} className="hover:border-primary/30 transition-colors">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={item.profile_photo_url || undefined} />
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.position}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="bg-purple-500/10 text-purple-400 border-purple-500/20 text-xs">
                  {item.area}
                </Badge>
                <Badge variant="outline" className={`${sc.className} text-xs`}>
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {item.status}
                </Badge>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Progreso</span>
                  <span>{item.progress}%</span>
                </div>
                <Progress value={item.progress} className="h-2" />
              </div>
              <p className="text-xs text-muted-foreground">{item.company}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default OnboardingGrid;
