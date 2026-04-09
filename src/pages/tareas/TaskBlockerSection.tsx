import { useState } from "react";
import { Ban, CheckCircle2, Plus, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTaskBlockers } from "./useTaskBlockers";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface Profile {
  id: string;
  full_name: string | null;
}

interface TaskBlockerSectionProps {
  taskId: string;
  profiles: Profile[];
}

const TaskBlockerSection = ({ taskId, profiles }: TaskBlockerSectionProps) => {
  const { blockers, activeBlockers, addBlocker, resolveBlocker } = useTaskBlockers(taskId);
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState("");
  const [selectedUser, setSelectedUser] = useState<string>("");

  const profileMap = Object.fromEntries(profiles.map((p) => [p.id, p]));

  const handleSubmit = () => {
    const trimmed = reason.trim();
    if (!trimmed) return;
    addBlocker.mutate(
      { reason: trimmed, blockedByUserId: selectedUser || null },
      {
        onSuccess: () => {
          setReason("");
          setSelectedUser("");
          setShowForm(false);
        },
      }
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <Ban className="h-4 w-4 text-destructive" />
          Bloqueos ({activeBlockers.length})
        </h3>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-3.5 w-3.5" /> Reportar bloqueo
        </Button>
      </div>

      {showForm && (
        <div className="space-y-2 bg-muted/30 rounded-lg p-3 border">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Describe qué te bloquea..."
            className="min-h-[60px] text-sm resize-none"
          />
          <Select value={selectedUser} onValueChange={setSelectedUser}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="¿Quién puede desbloquear?" />
            </SelectTrigger>
            <SelectContent>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.full_name || "Sin nombre"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setShowForm(false); setReason(""); setSelectedUser(""); }}>
              Cancelar
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={handleSubmit} disabled={!reason.trim() || addBlocker.isPending}>
              Reportar
            </Button>
          </div>
        </div>
      )}

      {blockers.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3">Sin bloqueos reportados.</p>
      ) : (
        <div className="space-y-2">
          {blockers.map((b) => {
            const reporter = profileMap[b.reported_by];
            const blocker = b.blocked_by_user_id ? profileMap[b.blocked_by_user_id] : null;
            const reporterInitials = reporter?.full_name?.split(" ").map((n) => n[0]).join("").slice(0, 2) || "?";

            return (
              <div
                key={b.id}
                className={`rounded-lg border p-3 space-y-1.5 ${b.resolved ? "opacity-50 bg-muted/20" : "bg-destructive/5 border-destructive/20"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm flex-1">{b.reason}</p>
                  {!b.resolved && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs gap-1 text-emerald-500 hover:text-emerald-600 shrink-0"
                      onClick={() => resolveBlocker.mutate(b.id)}
                      disabled={resolveBlocker.isPending}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Resolver
                    </Button>
                  )}
                  {b.resolved && (
                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs shrink-0">
                      Resuelto
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Avatar className="h-4 w-4">
                      <AvatarFallback className="text-[8px] bg-primary/20 text-primary">{reporterInitials}</AvatarFallback>
                    </Avatar>
                    {reporter?.full_name || "Usuario"}
                  </span>
                  {blocker && (
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      Asignado: {blocker.full_name || "Sin nombre"}
                    </span>
                  )}
                  <span>{format(new Date(b.created_at), "dd MMM, HH:mm", { locale: es })}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TaskBlockerSection;
