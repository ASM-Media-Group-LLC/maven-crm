import { useState } from "react";
import { CalendarDays, Clock, User, CheckCircle, Pencil, Check, X as XMark } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import InstagramIcon from "@/components/icons/InstagramIcon";
import TikTokIcon from "@/components/icons/TikTokIcon";
import XIcon from "@/components/icons/XIcon";
import TelegramIcon from "@/components/icons/TelegramIcon";

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

const getInitials = (name: string) => {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
};

const networkOptions = [
  { value: "instagram", label: "Instagram", icon: InstagramIcon },
  { value: "tiktok", label: "TikTok", icon: TikTokIcon },
  { value: "x", label: "X", icon: XIcon },
  { value: "telegram", label: "Telegram", icon: TelegramIcon },
] as const;

const PromologEntryCard = ({ entry }: PromologEntryCardProps) => {
  const [editOpen, setEditOpen] = useState(false);
  const [editResult, setEditResult] = useState<"si" | "no">(
    entry.result === "Si" ? "si" : "no"
  );
  const [editNetwork, setEditNetwork] = useState<string>(entry.network);

  const handleOpenEdit = () => {
    setEditResult(entry.result === "Si" ? "si" : "no");
    setEditNetwork(entry.network);
    setEditOpen(true);
  };

  return (
    <>
      <Card className="transition-colors hover:bg-muted/50">
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
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5"
              onClick={handleOpenEdit}
            >
              <Pencil className="h-3.5 w-3.5" />
              Editar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Edit Modal */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader className="pr-8">
            <DialogTitle>Editar Promoción</DialogTitle>
            <DialogDescription className="sr-only">
              Editar los detalles de promoción para este creador
            </DialogDescription>
          </DialogHeader>

          {/* Creator card */}
          <Card className="bg-muted">
            <CardContent className="p-3 flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">
                  {getInitials(entry.name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span className="text-sm font-semibold">{entry.name}</span>
                {entry.handle && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    {entry.network === "instagram" ? (
                      <InstagramIcon className="h-3 w-3" />
                    ) : (
                      <XIcon className="h-3 w-3" />
                    )}
                    @{entry.handle}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Promotion status */}
          <div className="space-y-2">
            <span className="text-sm font-medium">¿Promocionó Hoy?</span>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setEditResult("si")}
                className={`flex items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-medium transition-colors ${
                  editResult === "si"
                    ? "bg-cyan-500 text-white"
                    : "border border-input bg-background text-muted-foreground hover:bg-accent"
                }`}
              >
                <Check className="h-4 w-4" />
                Sí Promocionó
              </button>
              <button
                type="button"
                onClick={() => setEditResult("no")}
                className={`flex items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-medium transition-colors ${
                  editResult === "no"
                    ? "bg-purple-500 text-white"
                    : "border border-input bg-background text-muted-foreground hover:bg-accent"
                }`}
              >
                <XMark className="h-4 w-4" />
                No Promocionó
              </button>
            </div>
          </div>

          {/* Network selection */}
          <div className="space-y-2">
            <span className="text-sm font-medium">
              Red Social <span className="text-destructive">*</span>
            </span>
            <div className="grid grid-cols-4 gap-2">
              {networkOptions.map((opt) => {
                const Icon = opt.icon;
                const isSelected = editNetwork === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setEditNetwork(opt.value)}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-md px-2 py-3 text-xs font-medium transition-colors ${
                      isSelected
                        ? "border-2 border-primary bg-accent text-accent-foreground"
                        : "border border-input bg-background text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-cyan-500 hover:bg-cyan-600 text-white"
              onClick={() => setEditOpen(false)}
            >
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PromologEntryCard;
