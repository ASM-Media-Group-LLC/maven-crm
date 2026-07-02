import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { UserPlus, MessageCircle, CheckCircle, Trophy, XCircle } from "lucide-react";

interface Props {
  creatorId: string;
  passedDate: string | null;
  confirmedDate: string | null;
  completedDate: string | null;
  stage: string;
}

interface TimelineEvent {
  date: string;
  label: string;
  type: "assigned" | "contact" | "confirmed" | "completed" | "rejected";
  detail?: string;
}

const iconMap = {
  assigned: UserPlus,
  contact: MessageCircle,
  confirmed: CheckCircle,
  completed: Trophy,
  rejected: XCircle,
};

const colorMap = {
  assigned: "text-primary",
  contact: "text-muted-foreground",
  confirmed: "text-success dark:text-success",
  completed: "text-success dark:text-success",
  rejected: "text-destructive",
};

const ActivityTimeline = ({ creatorId, passedDate, confirmedDate, completedDate, stage }: Props) => {
  const { data: contacts = [] } = useQuery({
    queryKey: ["closer-contact-history", creatorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("closer_contact_history")
        .select("*")
        .eq("creator_id", creatorId)
        .order("contact_date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!creatorId,
  });

  const events: TimelineEvent[] = [];

  if (passedDate) {
    events.push({ date: passedDate, label: "Modelo asignada", type: "assigned" });
  }

  for (const c of contacts) {
    events.push({
      date: c.contact_date,
      label: `Contacto vía ${c.channel}`,
      type: "contact",
      detail: c.result || undefined,
    });
  }

  if (confirmedDate) {
    events.push({ date: confirmedDate, label: "Confirmada", type: "confirmed" });
  }

  if (completedDate) {
    events.push({ date: completedDate, label: "Completada", type: "completed" });
  }

  if (stage === "No interesada" && !completedDate && !confirmedDate) {
    events.push({ date: contacts[contacts.length - 1]?.contact_date || passedDate || "", label: "No interesada", type: "rejected" });
  }

  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (events.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-2">Sin actividad registrada</p>;
  }

  return (
    <div className="space-y-0">
      {events.map((event, idx) => {
        const Icon = iconMap[event.type];
        return (
          <div key={idx} className="flex gap-3 relative">
            {/* Timeline line */}
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full border-2 border-border bg-background flex items-center justify-center shrink-0 ${colorMap[event.type]}`}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              {idx < events.length - 1 && (
                <div className="w-px flex-1 bg-border min-h-[20px]" />
              )}
            </div>
            {/* Content */}
            <div className="pb-4 pt-0.5">
              <p className="text-sm font-medium">{event.label}</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {format(new Date(event.date), "dd MMM yyyy, HH:mm", { locale: es })}
                </span>
                {event.detail && <Badge variant="outline" className="text-xs h-5">{event.detail}</Badge>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ActivityTimeline;
