import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/hooks/useLanguage";

interface Props {
  creatorId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CreateTicketModal = ({ creatorId, open, onOpenChange }: Props) => {
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [ticketType, setTicketType] = useState("technical");
  const [company, setCompany] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [creatorNotes, setCreatorNotes] = useState("");

  const handleCancel = () => {
    reset();
    toast({ title: t("tickets.edit.cancelled") });
    onOpenChange(false);
  };

  const reset = () => {
    setTitle("");
    setDescription("");
    setPriority("medium");
    setTicketType("technical");
    setCompany("");
    setAssignedTo("");
    setCreatorNotes("");
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast({ title: t("tickets.edit.titleRequired"), variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("tickets" as any).insert({
      creator_id: creatorId,
      title: title.trim(),
      description: description.trim() || null,
      priority,
      ticket_type: ticketType,
      company: company || null,
      assigned_to: assignedTo || null,
      creator_notes: creatorNotes.trim() || null,
    } as any);

    setSaving(false);
    if (error) {
      toast({ title: t("tickets.toast.createError"), description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: t("tickets.toast.created") });
    queryClient.invalidateQueries({ queryKey: ["tickets", creatorId] });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh]">
        <DialogHeader className="pr-8">
          <DialogTitle>{t("creadores.tickets.createTitle")}</DialogTitle>
          <DialogDescription>{t("creadores.tickets.createDesc")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2 overflow-y-auto max-h-[60vh]">
          <div className="space-y-1.5">
            <Label htmlFor="ticket-title">{t("creadores.tickets.titleReq")}</Label>
            <Input
              id="ticket-title"
              placeholder={t("tickets.column.title")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ticket-desc">{t("common.description")}</Label>
            <Textarea
              id="ticket-desc"
              placeholder={t("creadores.tickets.descPh")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t("tickets.priority")}</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{t("tickets.priority.low")}</SelectItem>
                  <SelectItem value="medium">{t("tickets.priority.medium")}</SelectItem>
                  <SelectItem value="high">{t("tickets.priority.high")}</SelectItem>
                  <SelectItem value="urgent">{t("tickets.priority.urgent")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{t("creadores.tickets.type")}</Label>
              <Select value={ticketType} onValueChange={setTicketType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="complaint">{t("tickets.type.complaint")}</SelectItem>
                  <SelectItem value="technical">{t("tickets.type.technical")}</SelectItem>
                  <SelectItem value="billing">{t("tickets.type.billing")}</SelectItem>
                  <SelectItem value="content">{t("tickets.type.content")}</SelectItem>
                  <SelectItem value="general">{t("tickets.type.general")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("creadores.tickets.company")}</Label>
            <Select value={company} onValueChange={setCompany}>
              <SelectTrigger>
                <SelectValue placeholder={t("tickets.edit.selectCompany")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ora_miami">Ora Miami</SelectItem>
                <SelectItem value="kash_agency">KASH Agency</SelectItem>
                <SelectItem value="alvaroletshoot">Alvaroletshoot</SelectItem>
                <SelectItem value="blue_app">Blue App</SelectItem>
                <SelectItem value="piclink">piclink.me</SelectItem>
                <SelectItem value="pagomundo">Pagomundo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t("tickets.edit.assignTo")}</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger>
                <SelectValue placeholder={t("common.unassigned")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alvaro">alvaro (@alvaro)</SelectItem>
                <SelectItem value="amartinez">Ana Martinez (@amartinez)</SelectItem>
                <SelectItem value="Andres.Gaviria">Andres Gaviria (@Andres.Gaviria)</SelectItem>
                <SelectItem value="Brayan123">Brayan Esneider Castaño Hoyos (@Brayan123)</SelectItem>
                <SelectItem value="carolina.jaramillo@unlok.me">Carolina Jaramillo (@carolina.jaramillo@unlok.me)</SelectItem>
                <SelectItem value="cheryl.gonzalez@unlok.me">Cheryl Gonzalez (@cheryl.gonzalez@unlok.me)</SelectItem>
                <SelectItem value="clopez">Carlos Lopez (@clopez)</SelectItem>
                <SelectItem value="cruiz">Carmen Ruiz (@cruiz)</SelectItem>
                <SelectItem value="Fabiana_Duran">Fabiana Duran (@Fabiana_Duran)</SelectItem>
                <SelectItem value="gislaineescudero">Gislaine Escudero (@gislaineescudero)</SelectItem>
                <SelectItem value="gracegelves260">Grace Gelves (@gracegelves260)</SelectItem>
                <SelectItem value="Isatuiran">Isabel Tuiran (@Isatuiran)</SelectItem>
                <SelectItem value="jmoreno">Javier Moreno (@jmoreno)</SelectItem>
                <SelectItem value="Johanna">Johanna Riano (@Johanna)</SelectItem>
                <SelectItem value="jorge">Jorge Restrepo (@jorge)</SelectItem>
                <SelectItem value="jorge.restrepo">Jorge Restrepo 3 (@jorge.restrepo)</SelectItem>
                <SelectItem value="jorge.restrepo.1">jorge.restrepo.1 (@jorge.restrepo.1)</SelectItem>
                <SelectItem value="lizeth.jerez@unlok.me">Lizeth Jerez (@lizeth.jerez@unlok.me)</SelectItem>
                <SelectItem value="lorena_lozano">Lorena Lozano (@lorena_lozano)</SelectItem>
                <SelectItem value="lrodriguez">Luis Rodriguez (@lrodriguez)</SelectItem>
                <SelectItem value="Luisroman07">Luis Carlos Ortega Roman (@Luisroman07)</SelectItem>
                <SelectItem value="marielby">Marielby Quijada (@marielby)</SelectItem>
                <SelectItem value="maritest">Marielby Testing (@maritest)</SelectItem>
                <SelectItem value="mgarcia">Maria Garcia (@mgarcia)</SelectItem>
                <SelectItem value="michel_zarate">Michel Zarate (@michel_zarate)</SelectItem>
                <SelectItem value="mitchtest">Mitch Test (@mitchtest)</SelectItem>
                <SelectItem value="monica.duque@unlok.me">Monica Duque (@monica.duque@unlok.me)</SelectItem>
                <SelectItem value="Paularomero">Paula Romero (@Paularomero)</SelectItem>
                <SelectItem value="Pepe Glaves">Grace Galvez Galvez (@Pepe Glaves)</SelectItem>
                <SelectItem value="pepeel">peo peo (@pepeel)</SelectItem>
                <SelectItem value="perez">Fernando Perez (@perez)</SelectItem>
                <SelectItem value="ptorres">Pablo Torres (@ptorres)</SelectItem>
                <SelectItem value="ruben.guzman">Ruben Guzman (@ruben.guzman)</SelectItem>
                <SelectItem value="rusin24">rusin24 (@rusin24)</SelectItem>
                <SelectItem value="sfernandez">Sofia Fernandez (@sfernandez)</SelectItem>
                <SelectItem value="william.cujar">william cujar (@william.cujar)</SelectItem>
                <SelectItem value="yeison.bello">yeison bello (@yeison.bello)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ticket-notes">{t("creadores.tickets.notesOptional")}</Label>
            <Input
              id="ticket-notes"
              placeholder={t("creadores.tickets.notesPh")}
              value={creatorNotes}
              onChange={(e) => setCreatorNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? t("creadores.tickets.creating") : t("creadores.tickets.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateTicketModal;
