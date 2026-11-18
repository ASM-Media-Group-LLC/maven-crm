import { formatUI } from "@/lib/formatoHora";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { useContactHistory } from "../useContactHistory";
import { CHANNELS, RESULTS, resultLabel } from "../hooks/useCloserLeads";
import { useLanguage } from "@/hooks/useLanguage";
import { format } from "date-fns";

interface Props {
  creatorId: string;
}

const ContactHistoryPanel = ({ creatorId }: Props) => {
  const { t } = useLanguage();
  const { history, count, maxReached, addContact } = useContactHistory(creatorId);
  const [showForm, setShowForm] = useState(false);
  const [channel, setChannel] = useState("");
  const [result, setResult] = useState("");
  const [notes, setNotes] = useState("");

  const handleAdd = () => {
    if (!channel) return;
    addContact.mutate(
      { creator_id: creatorId, channel, result: result || undefined, notes: notes || undefined },
      { onSuccess: () => { setShowForm(false); setChannel(""); setResult(""); setNotes(""); } }
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">{t("closers.contact.history")}</h4>
        <Badge variant="outline">{t("closers.contact.countSlash6", { n: count })}</Badge>
      </div>

      {history.map((h) => (
        <div key={h.id} className="border border-border rounded-xl p-3 space-y-1">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">{formatUI(new Date(h.contact_date), "dd/MM/yyyy HH:mm")}</span>
            <Badge variant="secondary">{h.channel}</Badge>
            {h.result && <Badge variant="outline">{resultLabel(t, h.result)}</Badge>}
          </div>
          {h.notes && <p className="text-sm text-muted-foreground">{h.notes}</p>}
        </div>
      ))}

      {!maxReached && !showForm && (
        <Button variant="outline" size="sm" onClick={() => setShowForm(true)} className="w-full">
          <Plus className="h-4 w-4 mr-1" /> {t("closers.contact.add")}
        </Button>
      )}

      {maxReached && (
        <p className="text-xs text-muted-foreground text-center">{t("closers.contact.maxReached")}</p>
      )}

      {showForm && (
        <div className="border border-border rounded-xl p-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{t("closers.channelRequired")}</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger><SelectValue placeholder={t("common.select")} /></SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t("closers.result")}</Label>
              <Select value={result} onValueChange={setResult}>
                <SelectTrigger><SelectValue placeholder={t("common.select")} /></SelectTrigger>
                <SelectContent>
                  {RESULTS.map((r) => <SelectItem key={r} value={r}>{resultLabel(t, r)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">{t("closers.notes")}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>{t("common.cancel")}</Button>
            <Button size="sm" onClick={handleAdd} disabled={!channel || addContact.isPending}>
              {addContact.isPending ? t("closers.saving") : t("common.save")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContactHistoryPanel;
