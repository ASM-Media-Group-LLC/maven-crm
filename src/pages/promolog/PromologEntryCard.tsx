import { CalendarDays, Clock, User, CheckCircle, Pencil } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import InstagramIcon from "@/components/icons/InstagramIcon";
import XIcon from "@/components/icons/XIcon";

export interface PromologEntry {
  id: string;
  ticketNumber: string;
  name: string;
  handle?: string;
  network: "instagram" | "x";
  platform: string;
  result: string;
  date: string;
  time: string;
  agent: string;
  notes: string;
}

interface PromologEntryCardProps {
  entry: PromologEntry;
}

const NetworkBadge = ({ network }: { network: "instagram" | "x" }) => {
  if (network === "instagram") {
    return (
      <Badge variant="outline" className="gap-1 text-xs">
        <InstagramIcon className="h-3 w-3" />
        Instagram
      </Badge>
    );
  }
  return (
    <Badge className="gap-1 text-xs bg-foreground text-background hover:bg-foreground/90">
      <XIcon className="h-3 w-3" />
      X / Twitter
    </Badge>
  );
};

const PromologEntryCard = ({ entry }: PromologEntryCardProps) => {
  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        {/* Line 1: ID, check, name, handle, badges */}
        <div className="flex items-center flex-wrap gap-2">
          <Badge variant="outline" className="text-xs font-mono">
            {entry.ticketNumber}
          </Badge>
          <CheckCircle className="h-4 w-4 text-green-500" />
          <span className="text-sm font-semibold">{entry.name}</span>
          {entry.handle && (
            <span className="text-sm text-muted-foreground">@{entry.handle}</span>
          )}
          <div className="flex items-center gap-1.5 ml-auto">
            <NetworkBadge network={entry.network} />
            <Badge variant="outline" className="text-xs border-orange-400 text-orange-500">
              {entry.platform}
            </Badge>
            <Badge className="text-xs bg-green-500 text-white hover:bg-green-600 border-transparent">
              {entry.result}
            </Badge>
          </div>
        </div>

        {/* Line 2: date, time, agent */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" />
            {entry.date}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {entry.time}
          </span>
          <span className="flex items-center gap-1">
            <User className="h-3.5 w-3.5" />
            {entry.agent}
          </span>
        </div>

        {/* Line 3-4: notes + edit button */}
        <div className="flex items-start justify-between gap-4">
          <div className="text-sm">
            <span className="font-semibold">Notas: </span>
            <span className="text-muted-foreground">{entry.notes}</span>
          </div>
          <Button variant="outline" size="sm" className="shrink-0 gap-1.5">
            <Pencil className="h-3.5 w-3.5" />
            Editar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default PromologEntryCard;
