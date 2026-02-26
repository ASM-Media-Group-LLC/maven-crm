import { useState } from "react";
import { Search, Users } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Contact } from "./types";
import { cn } from "@/lib/utils";

interface NewChatModalProps {
  open: boolean;
  onClose: () => void;
  contacts: Contact[];
  onSelectContact: (contact: Contact) => void;
  isGroup?: boolean;
  onCreateGroup?: (name: string, members: Contact[]) => void;
}

function getInitials(name: string) {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

export default function NewChatModal({ open, onClose, contacts, onSelectContact, isGroup, onCreateGroup }: NewChatModalProps) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");

  const filtered = contacts.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

  const toggleSelect = (id: string) => {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  };

  const handleCreateGroup = () => {
    if (!groupName.trim() || selected.length === 0) return;
    const members = contacts.filter(c => selected.includes(c.id));
    onCreateGroup?.(groupName.trim(), members);
    setSelected([]);
    setGroupName("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={() => { onClose(); setSearch(""); setSelected([]); setGroupName(""); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isGroup ? "Nuevo grupo" : "Nuevo chat"}</DialogTitle>
        </DialogHeader>

        {isGroup && (
          <div className="mb-2">
            <Label className="text-xs text-muted-foreground mb-1 block">Nombre del grupo</Label>
            <Input placeholder="Nombre del grupo..." value={groupName} onChange={e => setGroupName(e.target.value)} />
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar contacto..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="max-h-64 overflow-y-auto space-y-1 mt-2">
          {filtered.map(contact => (
            <button
              key={contact.id}
              onClick={() => isGroup ? toggleSelect(contact.id) : onSelectContact(contact)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-muted/50 transition-colors",
                isGroup && selected.includes(contact.id) && "bg-primary/10"
              )}
            >
              {isGroup && (
                <Checkbox checked={selected.includes(contact.id)} className="shrink-0" />
              )}
              <div className="relative shrink-0">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="text-xs bg-primary/20 text-primary">{getInitials(contact.name)}</AvatarFallback>
                </Avatar>
                {contact.status === "online" && (
                  <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-card" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{contact.name}</p>
                <p className="text-xs text-muted-foreground">
                  {contact.status === "online" ? "En línea" : contact.lastSeen || "Desconectado"}
                </p>
              </div>
            </button>
          ))}
        </div>

        {isGroup && (
          <div className="flex justify-end mt-2">
            <Button onClick={handleCreateGroup} disabled={!groupName.trim() || selected.length === 0}>
              Crear grupo ({selected.length})
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
