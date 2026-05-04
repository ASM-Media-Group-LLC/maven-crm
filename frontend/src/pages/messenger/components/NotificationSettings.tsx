import { useState } from "react";
import { Bell, BellOff, BellRing, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { ConversationWithDetails } from "../types";

interface NotificationSettingsProps {
  conversation: ConversationWithDetails;
  onClose: () => void;
}

export default function NotificationSettings({ conversation, onClose }: NotificationSettingsProps) {
  const { user } = useAuth();
  const myParticipation = conversation.participants.find(p => p.user_id === user?.id);
  const [mode, setMode] = useState(myParticipation?.notifications_mode || "all");
  const [isMuted, setIsMuted] = useState(myParticipation?.is_muted || false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!user || !myParticipation) return;
    setSaving(true);
    const { error } = await supabase
      .from("chat_participants")
      .update({ notifications_mode: mode, is_muted: isMuted })
      .eq("conversation_id", conversation.id)
      .eq("user_id", user.id);
    setSaving(false);
    if (error) { toast.error("Error al guardar"); return; }
    toast.success("Preferencias guardadas");
    onClose();
  };

  return (
    <div className="p-4 space-y-4 rounded-3xl">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Notificaciones</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isMuted ? <BellOff className="h-4 w-4 text-muted-foreground" /> : <Bell className="h-4 w-4 text-primary" />}
          <Label className="text-sm">Silenciar conversación</Label>
        </div>
        <Switch checked={isMuted} onCheckedChange={setIsMuted} />
      </div>

      {!isMuted && (
        <RadioGroup value={mode} onValueChange={(v) => setMode(v as "all" | "mentions" | "none")} className="space-y-2">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="all" id="notif-all" />
            <Label htmlFor="notif-all" className="text-sm flex items-center gap-2">
              <BellRing className="h-3.5 w-3.5" /> Todos los mensajes
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="mentions" id="notif-mentions" />
            <Label htmlFor="notif-mentions" className="text-sm flex items-center gap-2">
              <Bell className="h-3.5 w-3.5" /> Solo @menciones
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="none" id="notif-none" />
            <Label htmlFor="notif-none" className="text-sm flex items-center gap-2">
              <BellOff className="h-3.5 w-3.5" /> Ninguna
            </Label>
          </div>
        </RadioGroup>
      )}

      <Button onClick={handleSave} disabled={saving} size="sm" className="w-full rounded-full">
        {saving ? "Guardando..." : "Guardar"}
      </Button>
    </div>
  );
}
