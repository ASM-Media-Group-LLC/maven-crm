import { useState, useEffect } from "react";
import { Search, Users } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { UserProfile } from "./types";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

interface NewChatModalProps {
  open: boolean;
  onClose: () => void;
  profiles: Record<string, UserProfile>;
  onSelectUser: (userId: string) => void;
  isGroup?: boolean;
  onCreateGroup?: (name: string, memberIds: string[]) => void;
}

function getInitials(name: string) {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

export default function NewChatModal({ open, onClose, profiles, onSelectUser, isGroup, onCreateGroup }: NewChatModalProps) {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");

  const allUsers = Object.values(profiles).filter(p => p.id !== user?.id);
  const filtered = allUsers.filter(p =>
    (p.full_name || "").toLowerCase().includes(search.toLowerCase())
  );

  const toggleSelect = (id: string) => {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  };

  const handleCreateGroup = () => {
    if (!groupName.trim() || selected.length === 0) return;
    onCreateGroup?.(groupName.trim(), selected);
    setSelected([]);
    setGroupName("");
    onClose();
  };

  const handleClose = () => {
    onClose();
    setSearch("");
    setSelected([]);
    setGroupName("");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
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
          <Input placeholder="Buscar usuario..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="max-h-64 overflow-y-auto space-y-1 mt-2">
          {filtered.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-4">No se encontraron usuarios</p>
          )}
          {filtered.map(profile => (
            <button
              key={profile.id}
              onClick={() => isGroup ? toggleSelect(profile.id) : onSelectUser(profile.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-muted/50 transition-colors",
                isGroup && selected.includes(profile.id) && "bg-primary/10"
              )}
            >
              {isGroup && (
                <Checkbox checked={selected.includes(profile.id)} className="shrink-0" />
              )}
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarFallback className="text-xs bg-primary/20 text-primary">
                  {getInitials(profile.full_name || "?")}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium text-foreground">{profile.full_name || "Sin nombre"}</p>
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
