import { useState } from "react";
import { ExternalLink, MessageCircle, Plus, Save, UserCheck, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MaskedPhone } from "@/components/MaskedPhone";
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
import ConvertLeadModal from "./ConvertLeadModal";
import EvidenceViewer from "@/components/leadgen/EvidenceViewer";
import type { LeadGenEntry } from "./useLeadGen";

const calidadVariant: Record<string, "success-soft" | "primary-soft" | "warning-soft" | "secondary-soft" | "destructive-soft"> = {
  "a+": "success-soft",
  a: "primary-soft",
  "b+": "warning-soft",
  b: "secondary-soft",
  c: "destructive-soft",
};

const getTicketId = (entry: LeadGenEntry) =>
  entry.ticket_number || `#LG${entry.id.slice(-7).toUpperCase()}`;

const countryToFlag = (code: string | null) => {
  if (!code || code.length < 2) return "🌍";
  const c = code.toUpperCase().slice(0, 2);
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
};

const getPlatformIcon = (platform: string) => {
  const p = platform.toLowerCase();
  if (p.includes("instagram")) return <InstagramIcon className="h-4 w-4" />;
  if (p.includes("tiktok")) return <TikTokIcon className="h-4 w-4" />;
  if (p.includes("twitter") || p.includes("x")) return <XIcon className="h-4 w-4" />;
  return <ExternalLink className="h-4 w-4 text-muted-foreground" />;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: LeadGenEntry | null;
  onDelete?: () => void;
}

const InfoCard = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="border rounded-lg p-3 space-y-1">
    <p className="text-xs text-muted-foreground">{label}</p>
    <div className="text-sm font-medium">{children}</div>
  </div>
);

const ViewLeadModal = ({ open, onOpenChange, lead, onDelete }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [showConvertModal, setShowConvertModal] = useState(false);

  const { data: notes = [] } = useQuery({
    queryKey: ["leadgen_notes", lead?.id],
    queryFn: async () => {
      if (!lead) return [];
      const { data, error } = await supabase
        .from("leadgen_notes" as any)
        .select("*")
        .eq("entry_id", lead.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ id: string; entry_id: string; note_text: string; created_at: string; user_id: string }>;
    },
    enabled: !!lead && open,
  });

  const addNote = useMutation({
    mutationFn: async (text: string) => {
      if (!lead) throw new Error("No lead");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No auth");
      const { error } = await supabase
        .from("leadgen_notes" as any)
        .insert({ entry_id: lead.id, user_id: user.id, note_text: text });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leadgen_notes", lead?.id] });
      setNoteText("");
      setShowNoteForm(false);
      toast({ title: "Nota guardada" });
    },
    onError: () => {
      toast({ title: "Error al guardar nota", variant: "destructive" });
    },
  });

  if (!lead) return null;

  const cat = lead.quality.toLowerCase();
  const createdDate = new Date(lead.created_at);

  const buildProfileUrl = () => {
    if (lead.source_link) return lead.source_link;
    const p = lead.platform.toLowerCase();
    if (p.includes("instagram")) return `https://instagram.com/${lead.model_handle}`;
    if (p.includes("tiktok")) return `https://tiktok.com/@${lead.model_handle}`;
    return `https://${lead.model_handle}`;
  };

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
            <DialogHeader>
              <div className="flex items-start justify-between gap-4 pr-8">
                <DialogTitle className="text-xl">Lead</DialogTitle>
                <div className="flex items-center gap-2 shrink-0">
                  {onDelete && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 text-destructive hover:text-destructive"
                      onClick={onDelete}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Eliminar
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => setShowConvertModal(true)}
                  >
                    <UserCheck className="h-3.5 w-3.5" />
                    Convertir a Contacto
                  </Button>
                </div>
              </div>
              <DialogDescription className="sr-only">Detalle del lead</DialogDescription>
            </DialogHeader>

            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="font-mono text-xs">
                {getTicketId(lead)}
              </Badge>
              <Badge variant={calidadVariant[cat] ?? "secondary-soft"}>
                {lead.quality.toUpperCase()}
              </Badge>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                {getPlatformIcon(lead.platform)}
                <span>{lead.platform}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <InfoCard label="Handle">
                <span>@{lead.model_handle}</span>
              </InfoCard>
              <InfoCard label="Fecha de entrada">
                {format(createdDate, "dd MMM yyyy", { locale: es })}
              </InfoCard>
              <InfoCard label="Hora">
                {format(createdDate, "hh:mm a", { locale: es })}
              </InfoCard>
              <InfoCard label="Ubicación">
                <span className="flex items-center gap-1.5">
                  {countryToFlag(lead.country_code)}
                  <span>{lead.country_code || "—"}{lead.city ? `, ${lead.city}` : ""}</span>
                </span>
              </InfoCard>
              <InfoCard label="Fuente">
                <a
                  href={buildProfileUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline truncate"
                >
                  Ver
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </InfoCard>
              <InfoCard label="Compañía">
                <span className="truncate block">{lead.company || "—"}</span>
              </InfoCard>
              {lead.phone_raw && (
                <InfoCard label="Teléfono">
                  <MaskedPhone phone={lead.phone_e164 || lead.phone_raw} />
                </InfoCard>
              )}
            </div>

            <Separator />

            <div>
              <div className="flex items-center gap-2 mb-2">
                <MessageCircle className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Notas del Lead</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                {lead.notes || "Sin notas"}
              </p>
            </div>

            <Separator />

            {/* Evidencia que el LG subió al crear el lead — antes se
                guardaba en leadgen_evidence_files pero nunca se mostraba
                en ningún componente. Ahora se ve acá. */}
            <EvidenceViewer entityType="lead" entityId={lead.id} />

            <Separator />

            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Notas Adicionales</h3>
                </div>
                {!showNoteForm && (
                  <Button variant="outline" size="sm" onClick={() => setShowNoteForm(true)}>
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
                    <Button size="sm" onClick={handleSaveNote} disabled={!noteText.trim() || addNote.isPending}>
                      <Save className="h-3.5 w-3.5 mr-1" />
                      Guardar
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleCancelNote} disabled={addNote.isPending}>
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
