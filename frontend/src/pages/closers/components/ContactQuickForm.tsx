import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MessageSquarePlus } from "lucide-react";
import { useContactHistory } from "../useContactHistory";
import { CHANNELS, RESULTS, resultLabel } from "../hooks/useCloserLeads";
import { useLanguage } from "@/hooks/useLanguage";

interface Props {
  creatorId: string;
}

const ContactQuickForm = ({ creatorId }: Props) => {
  const { t } = useLanguage();
  const { addContact, maxReached } = useContactHistory(creatorId);
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState("");
  const [result, setResult] = useState("");
  const [notes, setNotes] = useState("");

  const handleSubmit = () => {
    if (!channel) return;
    addContact.mutate(
      { creator_id: creatorId, channel, result: result || undefined, notes: notes || undefined },
      {
        onSuccess: () => {
          setOpen(false);
          setChannel("");
          setResult("");
          setNotes("");
        },
      }
    );
  };

  if (maxReached) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" title={t("closers.contact.log")}>
          <MessageSquarePlus className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3 space-y-3" align="end">
        <p className="text-sm font-medium">{t("closers.contact.log")}</p>
        <div>
          <Label className="text-xs">{t("closers.channelRequired")}</Label>
          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={t("common.select")} /></SelectTrigger>
            <SelectContent>
              {CHANNELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">{t("closers.result")}</Label>
          <Select value={result} onValueChange={setResult}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={t("common.select")} /></SelectTrigger>
            <SelectContent>
              {RESULTS.map((r) => <SelectItem key={r} value={r}>{resultLabel(t, r)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">{t("closers.notes")}</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="text-sm" />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button size="sm" onClick={handleSubmit} disabled={!channel || addContact.isPending}>
            {addContact.isPending ? "..." : t("common.save")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default ContactQuickForm;
