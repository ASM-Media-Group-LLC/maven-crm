import { useState, useEffect } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";
import {
  PRIORITY_LABEL_KEYS,
  STATUS_LABEL_KEYS,
  TYPE_LABEL_KEYS,
  COMPANIES,
  TEAM_MEMBERS,
  type TicketWithCreator,
  useTickets,
} from "./useTickets";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: TicketWithCreator;
}

const EditTicketModal = ({ open, onOpenChange, ticket }: Props) => {
  const { toast } = useToast();
  const { t } = useLanguage();
  const { updateTicket, creatorsQuery } = useTickets();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("");
  const [ticketType, setTicketType] = useState("");
  const [status, setStatus] = useState("");
  const [company, setCompany] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [creatorNotes, setCreatorNotes] = useState("");
  const [creatorId, setCreatorId] = useState("");

  useEffect(() => {
    if (open && ticket) {
      setTitle(ticket.title);
      setDescription(ticket.description || "");
      setPriority(ticket.priority);
      setTicketType(ticket.ticket_type);
      setStatus(ticket.status);
      setCompany(ticket.company || "");
      setAssignedTo(ticket.assigned_to || "");
      setCreatorNotes(ticket.creator_notes || "");
      setCreatorId(ticket.creator_id);
    }
  }, [open, ticket]);

  const handleCancel = () => {
    toast({ title: t("tickets.edit.cancelled") });
    onOpenChange(false);
  };

  const handleSubmit = () => {
    if (!title.trim()) {
      toast({ title: t("tickets.edit.titleRequired"), variant: "destructive" });
      return;
    }

    updateTicket.mutate(
      {
        id: ticket.id,
        title: title.trim(),
        description: description.trim() || null,
        priority,
        ticket_type: ticketType,
        status,
        company: company || null,
        assigned_to: assignedTo || null,
        creator_notes: creatorNotes.trim() || null,
        creator_id: creatorId,
      },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  const creators = creatorsQuery.data || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh]">
        <DialogHeader className="pr-8">
          <DialogTitle>{t("tickets.edit.title")}</DialogTitle>
          <DialogDescription>
            {t("tickets.edit.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2 overflow-y-auto max-h-[60vh] pr-1">
          <div className="space-y-1.5">
            <Label htmlFor="et-title">{t("common.title")} *</Label>
            <Input id="et-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="et-desc">{t("common.description")}</Label>
            <Textarea id="et-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>

          <div className="space-y-1.5">
            <Label>{t("tickets.creator")} *</Label>
            <Select value={creatorId} onValueChange={setCreatorId}>
              <SelectTrigger><SelectValue placeholder={t("tickets.edit.selectCreator")} /></SelectTrigger>
              <SelectContent>
                {creators.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}{c.artistic_name ? ` (${c.artistic_name})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>{t("tickets.priority")}</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_LABEL_KEYS).map(([k, clave]) => (
                    <SelectItem key={k} value={k}>{t(clave)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.type")}</Label>
              <Select value={ticketType} onValueChange={setTicketType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABEL_KEYS).map(([k, clave]) => (
                    <SelectItem key={k} value={k}>{t(clave)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.status")}</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABEL_KEYS).map(([k, clave]) => (
                    <SelectItem key={k} value={k}>{t(clave)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("tickets.edit.companyOrigin")}</Label>
            <Select value={company || undefined} onValueChange={(v) => setCompany(v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder={t("tickets.edit.selectCompany")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t("tickets.edit.noCompany")}</SelectItem>
                {COMPANIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t("tickets.edit.assignTo")}</Label>
            <Select value={assignedTo || undefined} onValueChange={(v) => setAssignedTo(v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder={t("common.unassigned")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t("common.unassigned")}</SelectItem>
                {TEAM_MEMBERS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="et-notes">{t("tickets.creatorNotes")}</Label>
            <Input id="et-notes" value={creatorNotes} onChange={(e) => setCreatorNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={updateTicket.isPending}>{t("common.cancel")}</Button>
          <Button onClick={handleSubmit} disabled={updateTicket.isPending}>
            {updateTicket.isPending ? t("tickets.saving") : t("tickets.edit.saveChanges")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditTicketModal;
