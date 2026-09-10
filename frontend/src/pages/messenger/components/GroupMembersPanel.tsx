import { useState, useEffect, useMemo, useRef } from "react";
import { X, UserPlus, UserMinus, Search, Shield, ShieldOff, Crown, Loader2, LogOut, Megaphone, Eye, Pencil, Check, UserCheck } from "lucide-react";
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
import { puedeVerLaListaDeMiembros } from "../utils";
import { useCanalQueRevive } from "@/hooks/useCanalQueRevive";

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

  // Configuración del grupo (permisos estilo WhatsApp). Solo admins la ven/cambian.
  const msgPerm = conversation.msg_permission ?? "all";
  const membersVis = conversation.members_visibility ?? "all";
  const infoPerm = conversation.info_permission ?? "admins";
  const addPerm = conversation.add_permission ?? "admins";
  // Puede agregar miembros: admin, o cualquier participante si add_permission='all'.
  const canAddMembers = isAdmin || addPerm === "all";
  // Puede ver la lista de miembros: admin, o cualquiera si members_visibility='all'.
  // (Guarda extra: normalmente un no-admin sin permiso ni llega a abrir el panel.)
  const canViewMembers = puedeVerLaListaDeMiembros(conversation, user?.id);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const updateSetting = async (
    field: "msg_permission" | "members_visibility" | "info_permission" | "add_permission",
    value: "all" | "admins",
  ) => {
    setSavingKey(field);
    const { data, error } = await supabase
      .from("chat_conversations")
      .update({ [field]: value })
      .eq("id", conversation.id)
      .select("id");
    if (error || !data || data.length === 0) toast.error("No se pudo cambiar la configuración");
    else onMembersChanged();
    setSavingKey(null);
  };

  // Aprobar nuevos miembros: si está activo y un no-admin agrega a alguien, va a una cola de
  // solicitudes (chat_join_requests) que un admin aprueba/rechaza.
  const requireApproval = conversation.require_approval ?? false;
  const toggleApproval = async (value: boolean) => {
    setSavingKey("require_approval");
    const { data, error } = await supabase
      .from("chat_conversations")
      .update({ require_approval: value })
      .eq("id", conversation.id)
      .select("id");
    if (error || !data || data.length === 0) toast.error("No se pudo cambiar la configuración");
    else onMembersChanged();
    setSavingKey(null);
  };

  const [pendingReqs, setPendingReqs] = useState<{ id: string; user_id: string; requested_by: string }[]>([]);
  const [reqProfiles, setReqProfiles] = useState<Record<string, UserProfile>>({});
  const [reqActing, setReqActing] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    const load = async () => {
      const { data } = await supabase
        .from("chat_join_requests")
        .select("id, user_id, requested_by")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: true });
      const reqs = (data as { id: string; user_id: string; requested_by: string }[]) || [];
      setPendingReqs(reqs);
      const ids = [...new Set(reqs.flatMap(r => [r.user_id, r.requested_by]))];
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name, avatar_url, avatar_seed").in("id", ids);
        setReqProfiles(Object.fromEntries(((profs as UserProfile[]) || []).map(p => [p.id, p])));
      }
    };
    load();
    cargarSolicitudesRef.current = load;
  }, [isAdmin, conversation.id]);

  // Solicitudes pendientes en vivo. Solo para admins; el canal revive solo.
  const cargarSolicitudesRef = useRef<(() => Promise<void>) | null>(null);
  useCanalQueRevive({
    topic: isAdmin ? `join-reqs-${conversation.id}` : null,
    armar: (canal) => canal
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_join_requests", filter: `conversation_id=eq.${conversation.id}` }, () => { void cargarSolicitudesRef.current?.(); }),
    alRevivir: () => void cargarSolicitudesRef.current?.(),
  });

  const reqName = (uid: string) => reqProfiles[uid]?.full_name || profiles[uid]?.full_name || "Usuario";

  const approveRequest = async (req: { id: string; user_id: string }) => {
    setReqActing(req.id);
    const { error } = await supabase.from("chat_participants").insert({ conversation_id: conversation.id, user_id: req.user_id, role: "member" });
    if (error) {
      toast.error("No se pudo aprobar");
    } else {
      await supabase.from("chat_join_requests").delete().eq("id", req.id);
      await supabase.from("chat_messages").insert({
        conversation_id: conversation.id, sender_id: user!.id, type: "system",
        content: `${profiles[user!.id]?.full_name || "Admin"} aceptó a ${reqName(req.user_id)} en el grupo`,
      });
      setPendingReqs(prev => prev.filter(r => r.id !== req.id));
      onMembersChanged();
      toast.success("Solicitud aprobada");
    }
    setReqActing(null);
  };

  const rejectRequest = async (req: { id: string }) => {
    setReqActing(req.id);
    const { error } = await supabase.from("chat_join_requests").delete().eq("id", req.id);
    if (error) toast.error("No se pudo rechazar");
    else { setPendingReqs(prev => prev.filter(r => r.id !== req.id)); toast.success("Solicitud rechazada"); }
    setReqActing(null);
  };

  // Load all users when add panel opens
  useEffect(() => {
    if (!showAddPanel) return;
    const load = async () => {
      setLoadingUsers(true);
      // Selector: acá no se ofrece a nadie que esté en la papelera.
      const { data } = await supabase
        .from("profiles").select("id, full_name, avatar_url").is("deleted_at", null);
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
    const name = allUsers.find(u => u.id === userId)?.full_name || "Usuario";

    // Un no-admin en un grupo con aprobación activada NO suma directo: crea una solicitud.
    if (!isAdmin && requireApproval) {
      const { error } = await supabase.from("chat_join_requests").insert({
        conversation_id: conversation.id, user_id: userId, requested_by: user!.id,
      });
      if (error) toast.error("No se pudo enviar la solicitud");
      else toast.success(`Solicitud enviada · un admin debe aprobar a ${name}`);
      setAddingUserId(null);
      return;
    }

    const { error } = await supabase.from("chat_participants").insert({
      conversation_id: conversation.id,
      user_id: userId,
      role: "member",
    });
    if (error) {
      toast.error("Error al agregar miembro");
    } else {
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

      {/* Configuración del grupo (permisos) — solo admins */}
      {isAdmin && (
        <div className="px-4 py-3 border-b border-border space-y-3">
          <p className="text-xs font-semibold text-muted-foreground">Configuración del grupo</p>
          {([
            { field: "msg_permission" as const, value: msgPerm, icon: Megaphone, label: "Enviar mensajes", hint: 'Solo admins = grupo "anuncios"' },
            { field: "members_visibility" as const, value: membersVis, icon: Eye, label: "Ver miembros", hint: "Quién ve esta lista" },
            { field: "info_permission" as const, value: infoPerm, icon: Pencil, label: "Editar info", hint: "Nombre, foto y descripción" },
            { field: "add_permission" as const, value: addPerm, icon: UserPlus, label: "Agregar miembros", hint: "Quién puede sumar gente" },
          ]).map(({ field, value, icon: Icon, label, hint }) => (
            <div key={field} className="flex items-center gap-2.5">
              <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] leading-tight">{label}</p>
                <p className="text-[11px] text-muted-foreground leading-tight">{hint}</p>
              </div>
              <div className="flex items-center rounded-full border border-border overflow-hidden text-[11px] shrink-0">
                {(["all", "admins"] as const).map(opt => (
                  <button
                    key={opt}
                    onClick={() => value !== opt && updateSetting(field, opt)}
                    disabled={savingKey === field}
                    className={cn(
                      "px-2.5 py-1 transition-colors disabled:opacity-60",
                      value === opt ? "bg-primary/15 text-primary font-medium" : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {opt === "all" ? "Todos" : "Solo admins"}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {/* Aprobar nuevos miembros (booleano Sí/No) */}
          <div className="flex items-center gap-2.5">
            <UserCheck className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] leading-tight">Aprobar nuevos miembros</p>
              <p className="text-[11px] text-muted-foreground leading-tight">Un admin acepta a los que agrega un no-admin</p>
            </div>
            <div className="flex items-center rounded-full border border-border overflow-hidden text-[11px] shrink-0">
              {([true, false] as const).map(opt => (
                <button
                  key={String(opt)}
                  onClick={() => requireApproval !== opt && toggleApproval(opt)}
                  disabled={savingKey === "require_approval"}
                  className={cn(
                    "px-2.5 py-1 transition-colors disabled:opacity-60",
                    requireApproval === opt ? "bg-primary/15 text-primary font-medium" : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  {opt ? "Sí" : "No"}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Solicitudes pendientes de aprobación — solo admins */}
      {isAdmin && pendingReqs.length > 0 && (
        <div className="px-4 py-3 border-b border-border">
          <p className="text-xs font-semibold text-muted-foreground mb-2">
            Solicitudes pendientes ({pendingReqs.length})
          </p>
          <div className="space-y-1.5">
            {pendingReqs.map(req => (
              <div key={req.id} className="flex items-center gap-2.5">
                <UserAvatar name={reqName(req.user_id)} src={reqProfiles[req.user_id]?.avatar_url} seed={reqProfiles[req.user_id]?.avatar_seed} size="sm" className="h-7 w-7 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] truncate leading-tight">{reqName(req.user_id)}</p>
                  <p className="text-[11px] text-muted-foreground truncate leading-tight">Propuesto por {reqName(req.requested_by)}</p>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-success hover:text-success hover:bg-success/10" onClick={() => approveRequest(req)} disabled={reqActing === req.id} title="Aprobar" aria-label={`Aprobar a ${reqName(req.user_id)}`}>
                  {reqActing === req.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-4 w-4" />}
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => rejectRequest(req)} disabled={reqActing === req.id} title="Rechazar" aria-label={`Rechazar a ${reqName(req.user_id)}`}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add member button */}
      {canAddMembers && !showAddPanel && (
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
          {!canViewMembers ? (
            <div className="flex flex-col items-center justify-center text-center gap-2 py-10 px-6">
              <Eye className="h-6 w-6 text-muted-foreground/50" />
              <p className="text-xs text-muted-foreground">Solo los administradores pueden ver los miembros de este grupo.</p>
            </div>
          ) : conversation.participants.map(p => {
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
                    online ? "bg-success" : "bg-muted-foreground/30"
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

      {/* Salir del grupo — disponible para TODOS (los admins también; si eres el último admin,
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
