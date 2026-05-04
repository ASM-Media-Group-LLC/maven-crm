import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { useContactHistory } from "../useContactHistory";
import { CHANNELS, RESULTS } from "../hooks/useCloserLeads";
import { format } from "date-fns";

interface Props {
  creatorId: string;
}

const ContactHistoryPanel = ({ creatorId }: Props) => {
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
        <h4 className="text-sm font-medium">Historial de Contacto</h4>
        <Badge variant="outline">{count}/6 contactos</Badge>
      </div>

      {history.map((h) => (
        <div key={h.id} className="border border-border rounded-md p-3 space-y-1">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">{format(new Date(h.contact_date), "dd/MM/yyyy HH:mm")}</span>
            <Badge variant="secondary">{h.channel}</Badge>
            {h.result && <Badge variant="outline">{h.result}</Badge>}
          </div>
          {h.notes && <p className="text-sm text-muted-foreground">{h.notes}</p>}
        </div>
      ))}

      {!maxReached && !showForm && (
        <Button variant="outline" size="sm" onClick={() => setShowForm(true)} className="w-full">
          <Plus className="h-4 w-4 mr-1" /> Agregar contacto
        </Button>
      )}

      {maxReached && (
        <p className="text-xs text-muted-foreground text-center">Máximo de contactos alcanzado</p>
      )}

      {showForm && (
        <div className="border border-border rounded-md p-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Canal *</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Resultado</Label>
              <Select value={result} onValueChange={setResult}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {RESULTS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Notas</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleAdd} disabled={!channel || addContact.isPending}>
              {addContact.isPending ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContactHistoryPanel;
