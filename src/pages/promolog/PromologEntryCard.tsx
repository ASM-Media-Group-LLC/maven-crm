import { useState, useRef } from "react";
import { CalendarDays, Clock, User, CheckCircle, Pencil, Check, X as XMark, ExternalLink, Upload } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
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

const platformOptions = [
  { value: "onlyfans", label: "OnlyFans" },
  { value: "unlok", label: "Unlok" },
  { value: "otra", label: "Otra" },
] as const;

const contactTypeOptions = [
  { value: "hablaron", label: "Hablaron" },
  { value: "textearon", label: "Textearon" },
  { value: "mensaje_voz", label: "Mensaje de Voz" },
] as const;

const PromologEntryCard = ({ entry }: PromologEntryCardProps) => {
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [editResult, setEditResult] = useState<"si" | "no">(
    entry.result === "Si" ? "si" : "no"
  );
  const [editNetwork, setEditNetwork] = useState<string>(entry.network);
  const [editPlatform, setEditPlatform] = useState<string>(entry.platform?.toLowerCase() || "");
  const [editContactType, setEditContactType] = useState<string>("");
  const [editNotes, setEditNotes] = useState<string>(entry.notes);
  const [editEvidencePreview, setEditEvidencePreview] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleOpenEdit = () => {
    setEditResult(entry.result === "Si" ? "si" : "no");
    setEditNetwork(entry.network);
    setEditPlatform(entry.platform?.toLowerCase() || "");
    setEditContactType("");
    setEditNotes(entry.notes);
    setEditEvidencePreview("");
    setEditOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setEditEvidencePreview(url);
    }
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
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
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
                    ? "bg-blue-500 text-white"
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

          {/* Conditional fields when "Sí Promocionó" */}
          {editResult === "si" && (
            <>
              {/* Platform selection */}
              <div className="space-y-2">
                <span className="text-sm font-medium">
                  Plataforma <span className="text-destructive">*</span>
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {platformOptions.map((opt) => {
                    const isSelected = editPlatform === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setEditPlatform(opt.value)}
                        className={`flex items-center justify-center rounded-md px-3 py-3 text-xs font-medium transition-colors ${
                          isSelected
                            ? "border-2 border-primary bg-accent text-accent-foreground"
                            : "border border-input bg-background text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Contact type selection */}
              <div className="space-y-2">
                <span className="text-sm font-medium">
                  Tipo de Contacto <span className="text-destructive">*</span>
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {contactTypeOptions.map((opt) => {
                    const isSelected = editContactType === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setEditContactType(opt.value)}
                        className={`flex items-center justify-center rounded-md px-3 py-3 text-xs font-medium transition-colors ${
                          isSelected
                            ? "border-2 border-primary bg-accent text-accent-foreground"
                            : "border border-input bg-background text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <span className="text-sm font-medium">Notas</span>
                <Textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Agregar notas..."
                  className="min-h-[80px]"
                />
              </div>

              {/* Evidence upload */}
              <div className="space-y-2">
                <span className="text-sm font-medium">Evidencia (Pantallazo)</span>
                <div
                  className="border-2 border-dashed border-input rounded-md p-4 text-center cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                  <span className="text-xs text-muted-foreground">Upload Evidence</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>
                {editEvidencePreview && (
                  <div className="space-y-2">
                    <img
                      src={editEvidencePreview}
                      alt="Evidencia"
                      className="w-full rounded-md border border-input max-h-48 object-contain"
                    />
                    <button
                      type="button"
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                      onClick={() => window.open(editEvidencePreview, "_blank")}
                    >
                      <ExternalLink className="h-3 w-3" />
                      Abrir en nueva pestaña
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setEditOpen(false);
              toast({ title: "Edición cancelada" });
            }}>
              Cancelar
            </Button>
            <Button
              className="bg-cyan-500 hover:bg-cyan-600 text-white"
              onClick={() => {
                setEditOpen(false);
                toast({ title: "Promoción actualizada", description: `Los cambios para ${entry.name} han sido guardados.` });
              }}
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
