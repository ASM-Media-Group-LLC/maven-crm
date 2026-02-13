import { useState } from "react";
import { ExternalLink, MessageCircle, Plus, Save, UserCheck } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import InstagramIcon from "@/components/icons/InstagramIcon";
import TikTokIcon from "@/components/icons/TikTokIcon";
import XIcon from "@/components/icons/XIcon";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import ConvertLeadModal from "./ConvertLeadModal";

type Lead = Tables<"leads">;

const calidadVariant: Record<string, "success-soft" | "primary-soft" | "warning-soft" | "secondary-soft" | "destructive-soft"> = {
  "a+": "success-soft",
  a: "primary-soft",
  "b+": "warning-soft",
  b: "secondary-soft",
  c: "destructive-soft",
};

const getTicketId = (id: string) => `#LG${id.slice(-7).toUpperCase()}`;

const countryToFlag = (code: string | null) => {
  if (!code || code.length < 2) return "🌍";
  const c = code.toUpperCase().slice(0, 2);
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
};

const getPlatformIcon = (plataforma: string) => {
  const p = plataforma.toLowerCase();
  if (p.includes("instagram")) return <InstagramIcon className="h-4 w-4" />;
  if (p.includes("tiktok")) return <TikTokIcon className="h-4 w-4" />;
  if (p.includes("twitter") || p.includes("x")) return <XIcon className="h-4 w-4" />;
  return <ExternalLink className="h-4 w-4 text-muted-foreground" />;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead | null;
}

const InfoCard = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="border rounded-lg p-3 space-y-1">
    <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
    <div className="text-sm font-medium">{children}</div>
  </div>
);

const ViewLeadModal = ({ open, onOpenChange, lead }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [showConvertModal, setShowConvertModal] = useState(false);

  const { data: notes = [] } = useQuery({
    queryKey: ["lead_notes", lead?.id],
    queryFn: async () => {
      if (!lead) return [];
      const { data, error } = await supabase
        .from("lead_notes" as any)
        .select("*")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ id: string; lead_id: string; note_text: string; created_at: string }>;
    },
    enabled: !!lead && open,
  });

  const addNote = useMutation({
    mutationFn: async (text: string) => {
      if (!lead) throw new Error("No lead");
      const { error } = await supabase
        .from("lead_notes" as any)
        .insert({ lead_id: lead.id, note_text: text });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead_notes", lead?.id] });
      setNoteText("");
      setShowNoteForm(false);
      toast({ title: "Nota guardada" });
    },
    onError: () => {
      toast({ title: "Error al guardar nota", variant: "destructive" });
    },
  });

  if (!lead) return null;

  const cat = lead.categoria.toLowerCase();
  const createdDate = new Date(lead.created_at);

  const handleSaveNote = () => {
    const trimmed = noteText.trim();
    if (!trimmed) return;
    addNote.mutate(trimmed);
  };

  const handleCancelNote = () => {
    setNoteText("");
    setShowNoteForm(false);
    toast({ title: "Edición cancelada" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0">
        <ScrollArea className="max-h-[80vh]">
          <div className="p-6 space-y-4">
            {/* Header */}
            <DialogHeader>
              <div className="flex items-start justify-between gap-4 pr-8">
                <DialogTitle className="text-xl">Lead</DialogTitle>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 shrink-0"
                  onClick={() => setShowConvertModal(true)}
                >
                  <UserCheck className="h-3.5 w-3.5" />
                  Convertir a Contacto
                </Button>
              </div>
              <DialogDescription className="sr-only">Detalle del lead</DialogDescription>
            </DialogHeader>

            {/* Metadata row */}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="font-mono text-xs">
                {getTicketId(lead.id)}
              </Badge>
              <Badge variant={calidadVariant[cat] ?? "secondary-soft"}>
                {lead.categoria.toUpperCase()}
              </Badge>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                {getPlatformIcon(lead.plataforma)}
                <span>{lead.plataforma}</span>
              </div>
            </div>

            {/* Info grid */}
            <div className="grid grid-cols-3 gap-3">
              <InfoCard label="Creado por">
                <span className="text-muted-foreground">—</span>
              </InfoCard>
              <InfoCard label="Fecha de entrada">
                {format(createdDate, "dd MMM yyyy", { locale: es })}
              </InfoCard>
              <InfoCard label="Hora">
                {format(createdDate, "hh:mm a", { locale: es })}
              </InfoCard>
              <InfoCard label="Ubicación">
                <span className="flex items-center gap-1.5">
                  {countryToFlag(lead.pais)}
                  <span>{lead.pais || "—"}</span>
                </span>
              </InfoCard>
              <InfoCard label="Fuente">
                <a
                  href={lead.url_perfil}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline truncate"
                >
                  Ver
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </InfoCard>
              <InfoCard label="Compañía">
                <span className="truncate block">{lead.compania || "—"}</span>
              </InfoCard>
            </div>

            <Separator />

            {/* Notas del Lead */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <MessageCircle className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Notas del Lead</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                {lead.notas || "Sin notas"}
              </p>
            </div>

            <Separator />

            {/* Notas Adicionales */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Notas Adicionales</h3>
                </div>
                {!showNoteForm && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowNoteForm(true)}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Agregar
                  </Button>
                )}
              </div>

              {showNoteForm && (
                <div className="space-y-3 mb-4">
                  <Textarea
                    placeholder="Escribe tu nota..."
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleSaveNote}
                      disabled={!noteText.trim() || addNote.isPending}
                    >
                      <Save className="h-3.5 w-3.5 mr-1" />
                      Guardar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCancelNote}
                      disabled={addNote.isPending}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}

              {notes.length > 0 ? (
                <div className="space-y-3">
                  {notes.map((note) => (
                    <div key={note.id} className="border rounded-lg p-3 space-y-1">
                      <p className="text-sm">{note.note_text}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(note.created_at), "dd MMM yyyy, hh:mm a", { locale: es })}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                !showNoteForm && (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <MessageCircle className="h-8 w-8 mb-2 opacity-40" />
                    <p className="text-sm">No hay notas adicionales</p>
                  </div>
                )
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>

      {lead && (
        <ConvertLeadModal
          open={showConvertModal}
          onOpenChange={setShowConvertModal}
          lead={lead}
          onConverted={() => {
            setShowConvertModal(false);
            onOpenChange(false);
          }}
        />
      )}
    </Dialog>
  );
};

export default ViewLeadModal;
