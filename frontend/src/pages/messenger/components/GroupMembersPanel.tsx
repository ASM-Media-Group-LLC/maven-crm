import { useState, useEffect, useMemo } from "react";
import { X, UserPlus, UserMinus, Search, Shield, ShieldOff, Crown, Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/UserAvatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ConversationWithDetails, UserProfile } from "../types";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOnlinePresence } from "@/hooks/useOnlinePresence";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface GroupMembersPanelProps {
  conversation: ConversationWithDetails;
  profiles: Record<string, UserProfile>;
  onClose: () => void;
  onMembersChanged: () => void;
}

export default function GroupMembersPanel({
  conversation, profiles, onClose, onMembersChanged,
}: GroupMembersPanelProps) {
  const { user } = useAuth();
  const { isOnline } = useOnlinePresence();
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [addingUserId, setAddingUserId] = useState<string | null>(null);
  const [removingUser, setRemovingUser] = useState<{ id: string; name: string } | null>(null);
  const [removing, setRemoving] = useState(false);
  const [leavingGroup, setLeavingGroup] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);

  const isAdmin = conversation.participants.find(p => p.user_id === user?.id)?.role === "admin";
  const memberIds = new Set(conversation.participants.map(p => p.user_id));

  // Load all users when add panel opens
  useEffect(() => {
    if (!showAddPanel) return;
    const load = async () => {
      setLoadingUsers(true);
      const { data } = await supabase.from("profiles").select("id, full_name, avatar_url");
      setAllUsers((data as UserProfile[]) || []);
      setLoadingUsers(false);
    };
    load();
  }, [showAddPanel]);

  const availableUsers = useMemo(() => {
    return allUsers
      .filter(u => !memberIds.has(u.id))
      .filter(u => {
        if (!searchQuery.trim()) return true;
        return u.full_name?.toLowerCase().includes(searchQuery.toLowerCase());
      });
  }, [allUsers, memberIds, searchQuery]);

  const handleAddMember = async (userId: string) => {
    setAddingUserId(userId);
    const { error } = await supabase.from("chat_participants").insert({
      conversation_id: conversation.id,
      user_id: userId,
      role: "member",
    });
    if (error) {
      toast.error("Error al agregar miembro");
    } else {
      const name = allUsers.find(u => u.id === userId)?.full_name || "Usuario";
      toast.success(`${name} agregado al grupo`);
      // Send system message
      await supabase.from("chat_messages").insert({
        conversation_id: conversation.id,
        sender_id: user!.id,
        content: `${profiles[user!.id]?.full_name || "Admin"} agregó a ${name} al grupo`,
        type: "system",
      });
      onMembersChanged();
    }
    setAddingUserId(null);
  };

  const handleRemoveMember = async () => {
    if (!removingUser) return;
    setRemoving(true);
    const { error } = await supabase
      .from("chat_participants")
      .delete()
      .eq("conversation_id", conversation.id)
      .eq("user_id", removingUser.id);
    if (error) {
      toast.error("Error al eliminar miembro");
    } else {
      toast.success(`${removingUser.name} eliminado del grupo`);
      await supabase.from("chat_messages").insert({
        conversation_id: conversation.id,
        sender_id: user!.id,
        content: `${profiles[user!.id]?.full_name || "Admin"} eliminó a ${removingUser.name} del grupo`,
        type: "system",
      });
      onMembersChanged();
    }
    setRemoving(false);
    setRemovingUser(null);
  };

  // Hacer / quitar admin (varios admins, modelo WhatsApp). La RLS permite a un admin editar
  // la fila de otros; el trigger garantiza que solo un admin cambie 'role'. Se usa .select()
  // para detectar el no-op silencioso de RLS (un UPDATE que no matchea no falla).
  const handleToggleAdmin = async (userId: string, name: string, makeAdmin: boolean) => {
    setUpdatingRole(userId);
    const { data, error } = await supabase
      .from("chat_participants")
      .update({ role: makeAdmin ? "admin" : "member" })
      .eq("conversation_id", conversation.id)
      .eq("user_id", userId)
      .select("id");
    if (error || !data || data.length === 0) {
      toast.error("No se pudo cambiar el rol");
    } else {
      toast.success(makeAdmin ? `${name} ahora es admin` : `${name} ya no es admin`);
      await supabase.from("chat_messages").insert({
        conversation_id: conversation.id,
        sender_id: user!.id,
        content: makeAdmin
          ? `${profiles[user!.id]?.full_name || "Admin"} nombró admin a ${name}`
          : `${profiles[user!.id]?.full_name || "Admin"} quitó admin a ${name}`,
        type: "system",
      });
      onMembersChanged();
    }
    setUpdatingRole(null);
  };

  const handleLeaveGroup = async () => {
    setLeavingGroup(true);
    const myName = profiles[user!.id]?.full_name || "Usuario";

    // Si soy el ÚLTIMO admin y quedan otros miembros, promuevo al más antiguo para no dejar
    // el grupo sin admin (mientras sigo siendo admin, que es cuando la RLS me deja).
    const others = conversation.participants.filter(p => p.user_id !== user!.id);
    const remainingAdmins = others.filter(p => p.role === "admin");
    if (isAdmin && remainingAdmins.length === 0 && others.length > 0) {
      const successor = [...others].sort(
        (a, b) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime()
      )[0];
      await supabase
        .from("chat_participants")
        .update({ role: "admin" })
        .eq("conversation_id", conversation.id)
        .eq("user_id", successor.user_id);
    }

    // El mensaje de sistema VA ANTES de borrar mi fila: una vez que dejo de ser participante,
    // la RLS de chat_messages rechaza el INSERT (antes fallaba en silencio y nadie se enteraba).
    await supabase.from("chat_messages").insert({
      conversation_id: conversation.id,
      sender_id: user!.id,
      content: `${myName} salió del grupo`,
      type: "system",
    });

    const { error } = await supabase
      .from("chat_participants")
      .delete()
      .eq("conversation_id", conversation.id)
      .eq("user_id", user!.id);
    if (error) {
      toast.error("Error al salir del grupo");
    } else {
      toast.success("Has salido del grupo");
      onMembersChanged();
      onClose();
    }
    setLeavingGroup(false);
    setShowLeaveConfirm(false);
  };

  return (
    <div className="absolute inset-0 sm:inset-y-0 sm:left-auto sm:right-0 z-30 w-full sm:w-[380px] bg-card sm:rounded-l-3xl sm:shadow-xl flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-primary/[0.03]">
        <Shield className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold flex-1">Miembros del grupo</h3>
        <span className="text-xs text-muted-foreground">{conversation.participants.length}</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Add member button */}
      {isAdmin && !showAddPanel && (
        <div className="px-4 py-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2 text-xs rounded-full"
            onClick={() => setShowAddPanel(true)}
          >
            <UserPlus className="h-3.5 w-3.5" />
            Agregar miembro
          </Button>
        </div>
      )}

      {/* Add member panel */}
      {showAddPanel && (
        <div className="border-b border-border">
          <div className="flex items-center gap-2 px-4 py-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <Input
              placeholder="Buscar personas..."
              className="h-7 bg-background text-sm"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              autoFocus
            />
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => { setShowAddPanel(false); setSearchQuery(""); }}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <ScrollArea className="max-h-48">
            {loadingUsers ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : availableUsers.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                {searchQuery ? "Sin resultados" : "No hay más usuarios disponibles"}
              </p>
            ) : (
              <div className="px-2 pb-2">
                {availableUsers.map(u => (
                  <button
                    key={u.id}
                    onClick={() => handleAddMember(u.id)}
                    disabled={addingUserId === u.id}
                    className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted/50 transition-colors text-left"
                  >
                    <UserAvatar
                      name={u.full_name}
                      src={u.avatar_url}
                      seed={u.avatar_seed}
                      size="sm"
                      className="h-7 w-7 shrink-0"
                    />
                    <span className="text-sm font-medium text-foreground flex-1 truncate">
                      {u.full_name || "Usuario"}
                    </span>
                    {addingUserId === u.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    ) : (
                      <UserPlus className="h-3.5 w-3.5 text-primary" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      )}

      {/* Current members */}
      <ScrollArea className="flex-1">
        <div className="py-2">
          {conversation.participants.map(p => {
            const profile = profiles[p.user_id];
            const name = profile?.full_name || "Usuario";
            const online = isOnline(p.user_id);
            const isSelf = p.user_id === user?.id;

            return (
              <div key={p.id} className="flex items-center gap-3 px-4 py-2 hover:bg-primary/5 rounded-2xl mx-1 transition-colors">
                <div className="relative">
                  <UserAvatar
                    name={name}
                    src={profile?.avatar_url}
                    seed={profile?.avatar_seed}
                    size="sm"
                  />
                  <span className={cn(
                    "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card",
                    online ? "bg-green-500" : "bg-muted-foreground/30"
                  )} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {isSelf ? `${name} (Tú)` : name}
                  </p>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                    {p.role === "admin" && (
                      <>
                        <Crown className="h-2.5 w-2.5 text-amber-500" />
                        <span className="text-amber-500 font-medium">Admin</span>
                        <span>·</span>
                      </>
                    )}
                    {online ? "En línea" : "Desconectado"}
                  </p>
                </div>
                {isAdmin && !isSelf && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-amber-500"
                      onClick={() => handleToggleAdmin(p.user_id, name, p.role !== "admin")}
                      disabled={updatingRole === p.user_id}
                      title={p.role === "admin" ? "Quitar admin" : "Hacer admin"}
                      aria-label={p.role === "admin" ? `Quitar admin a ${name}` : `Hacer admin a ${name}`}
                    >
                      {updatingRole === p.user_id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : p.role === "admin" ? (
                        <ShieldOff className="h-3.5 w-3.5" />
                      ) : (
                        <Crown className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => setRemovingUser({ id: p.user_id, name })}
                      title="Eliminar del grupo"
                      aria-label={`Eliminar a ${name} del grupo`}
                    >
                      <UserMinus className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Salir del grupo — disponible para TODOS (los admins también; si sos el último admin,
          handleLeaveGroup promueve al miembro más antiguo para no dejar el grupo sin admin). */}
      <div className="px-4 py-3 border-t border-border">
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2 text-xs text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setShowLeaveConfirm(true)}
        >
          <LogOut className="h-3.5 w-3.5" />
          Salir del grupo
        </Button>
      </div>

      {/* Remove confirmation */}
      <AlertDialog open={!!removingUser} onOpenChange={() => setRemovingUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar miembro</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de eliminar a <strong>{removingUser?.name}</strong> del grupo "{conversation.displayName}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveMember} disabled={removing} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {removing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Leave group confirmation */}
      <AlertDialog open={showLeaveConfirm} onOpenChange={() => setShowLeaveConfirm(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Salir del grupo</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que quieres salir del grupo "{conversation.displayName}"? Ya no podrás ver los mensajes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={leavingGroup}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleLeaveGroup} disabled={leavingGroup} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {leavingGroup ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
