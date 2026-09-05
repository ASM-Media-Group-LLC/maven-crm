import { useState, forwardRef } from "react";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { UserProfile } from "./types";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { UserStatus, useOnlinePresence } from "@/hooks/useOnlinePresence";
import { getStatusColor, getStatusLabel } from "./components/StatusPicker";

interface NewChatModalProps {
  open: boolean;
  onClose: () => void;
  profiles: Record<string, UserProfile>;
  onSelectUser: (userId: string) => void;
  isGroup?: boolean;
  onCreateGroup?: (name: string, memberIds: string[]) => void;
  isOnlineFn?: (userId: string) => boolean;
  getStatusFn?: (userId: string) => UserStatus | null;
}

const NewChatModal = forwardRef<HTMLDivElement, NewChatModalProps>(function NewChatModal(
  { open, onClose, profiles, onSelectUser, isGroup, onCreateGroup, isOnlineFn, getStatusFn },
  ref,
) {
  const { user } = useAuth();
  const isOnline = isOnlineFn || (() => false);
  const getStatus = getStatusFn || (() => null);
  const { getStatusColorPersonal } = useOnlinePresence();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");

  const allUsers = Object.values(profiles).filter(p => p.id !== user?.id);

  const sorted = [...allUsers].sort((a, b) => {
    const aOnline = isOnline(a.id);
    const bOnline = isOnline(b.id);
    if (aOnline && !bOnline) return -1;
    if (!aOnline && bOnline) return 1;
    return (a.full_name || "").localeCompare(b.full_name || "");
  });

  const filtered = sorted.filter(p =>
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

  const onlineCount = allUsers.filter(p => isOnline(p.id)).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md sm:rounded-3xl">
        <DialogHeader>
          <DialogTitle>{isGroup ? "Nuevo grupo" : "Nuevo chat"}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {onlineCount} usuario{onlineCount !== 1 ? "s" : ""} en línea
          </p>
        </DialogHeader>

        {isGroup && (
          <div className="mb-2">
            <Label className="text-xs text-muted-foreground mb-1 block">Nombre del grupo</Label>
            <Input placeholder="Nombre del grupo..." value={groupName} onChange={e => setGroupName(e.target.value)} />
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar usuario..." className="pl-9 rounded-full bg-primary/5 border-0" value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="max-h-64 overflow-y-auto space-y-1 mt-2">
          {filtered.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-4">No se encontraron usuarios</p>
          )}
          {filtered.map(profile => {
            const online = isOnline(profile.id);
            return (
              <div
                key={profile.id}
                onClick={() => isGroup ? toggleSelect(profile.id) : onSelectUser(profile.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left hover:bg-primary/5 transition-colors cursor-pointer",
                    isGroup && selected.includes(profile.id) && "bg-primary/10"
                )}
              >
                {isGroup && (
                  <Checkbox checked={selected.includes(profile.id)} className="shrink-0" />
                )}
                <div className="relative">
                  <UserAvatar
                    name={profile.full_name}
                    src={profile.avatar_url}
                    seed={profile.avatar_seed}
                    size="sm"
                    className="h-9 w-9 shrink-0"
                  />
                  <span
                    className={cn(
                      "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background",
                      getStatusColor(getStatus(profile.id), online, getStatusColorPersonal(profile.id))
                    )}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{profile.full_name || "Sin nombre"}</p>
                  <p className="text-xs text-muted-foreground">
                    {getStatusLabel(getStatus(profile.id), online)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {isGroup && (
          <div className="flex justify-end mt-2">
            <Button onClick={handleCreateGroup} disabled={!groupName.trim() || selected.length === 0} className="rounded-full">
              Crear grupo ({selected.length})
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
});

NewChatModal.displayName = "NewChatModal";
export default NewChatModal;
