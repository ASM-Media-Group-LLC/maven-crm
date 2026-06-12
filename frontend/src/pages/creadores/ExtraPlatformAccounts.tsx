// Cuentas ADICIONALES por red social (multi-cuenta). La cuenta principal vive en
// creators.<red>_handle; las extra en creator_social_accounts (network, username).
// El bot de Promolog escanea principal + extras activas (1 fila/día → "Sí" si
// promocionó en cualquiera). Genérico: sirve para Instagram, X, Telegram, Facebook.
// Add/quitar/activar gated a admin+manager (igual que la RLS de la tabla).
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

// Normaliza a username pelado: si pegan una URL, toma el PRIMER segmento del path
// (no el último — así "instagram.com/user/reels/" → "user"), y saca @.
const normalizeUsername = (raw: string): string => {
  let h = (raw || "").trim();
  if (/^https?:\/\//i.test(h)) {
    try {
      h = new URL(h).pathname.split("/").filter(Boolean)[0] ?? "";
    } catch {
      return "";
    }
  }
  return h.replace(/^@+/, "").trim();
};

interface Props {
  creatorId: string;
  network: string; // 'instagram' | 'x' | 'telegram' | 'facebook'
  label: string; // "Instagram", "X (Twitter)", ...
  icon: React.ReactNode;
  canManage: boolean;
  placeholder?: string;
}

const ExtraPlatformAccounts = ({ creatorId, network, label, icon, canManage, placeholder }: Props) => {
  const queryClient = useQueryClient();
  const [newUsername, setNewUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const qKey = ["creator-social-accounts", creatorId, network];

  const { data: accounts = [] } = useQuery({
    queryKey: qKey,
    enabled: !!creatorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creator_social_accounts")
        .select("id, username, active")
        .eq("creator_id", creatorId)
        .eq("network", network)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; username: string; active: boolean }>;
    },
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: qKey });

  const add = async () => {
    const u = normalizeUsername(newUsername);
    if (!u) return;
    setBusy(true);
    const { error } = await supabase
      .from("creator_social_accounts")
      .insert({ creator_id: creatorId, network, username: u });
    setBusy(false);
    if (error) {
      toast.error(/duplicate|unique/i.test(error.message) ? "Esa cuenta ya está agregada" : "No se pudo agregar la cuenta");
      return;
    }
    setNewUsername("");
    refresh();
    toast.success("Cuenta agregada");
  };
  const remove = async (id: string) => {
    const { error } = await supabase.from("creator_social_accounts").delete().eq("id", id);
    if (error) { toast.error("No se pudo quitar la cuenta"); return; }
    refresh();
  };
  const toggle = async (id: string, active: boolean) => {
    const { error } = await supabase
      .from("creator_social_accounts")
      .update({ active, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) { toast.error("No se pudo cambiar el estado"); return; }
    refresh();
  };

  // Si no hay extras y no se puede gestionar, no renderiza nada (evita ruido).
  if (accounts.length === 0 && !canManage) return null;

  return (
    <Card className="mt-2 space-y-2 p-3">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">{icon}</div>
        <div className="min-w-0">
          <p className="text-xs font-medium">Cuentas de {label} adicionales</p>
          <p className="text-[11px] text-muted-foreground">El bot las escanea junto con la principal.</p>
        </div>
      </div>

      {accounts.length > 0 && (
        <div className="space-y-1.5">
          {accounts.map((a) => (
            <div key={a.id} className="flex items-center gap-2 rounded-md border border-border/60 px-2.5 py-1.5">
              <span className="shrink-0 text-muted-foreground">{icon}</span>
              <span className={`flex-1 truncate text-sm ${a.active ? "" : "text-muted-foreground line-through"}`}>@{a.username}</span>
              {canManage ? (
                <>
                  <button
                    type="button"
                    onClick={() => toggle(a.id, !a.active)}
                    className={`rounded px-2 py-0.5 text-[11px] font-medium ${a.active ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground"}`}
                    title={a.active ? "Activa (se escanea) — click para pausar" : "Inactiva — click para activar"}
                  >
                    {a.active ? "Activa" : "Inactiva"}
                  </button>
                  <button type="button" onClick={() => remove(a.id)} title="Quitar" className="text-muted-foreground transition-colors hover:text-rose-400">
                    <X className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <span className={`text-[11px] ${a.active ? "text-emerald-500" : "text-muted-foreground"}`}>{a.active ? "Activa" : "Inactiva"}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {canManage && (
        <div className="flex gap-2">
          <Input
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            placeholder={placeholder || `@otra_cuenta o link de ${label}`}
            className="h-9"
          />
          <Button size="sm" type="button" className="h-9 shrink-0" onClick={add} disabled={busy || !newUsername.trim()}>
            {busy ? "Agregando…" : "Agregar"}
          </Button>
        </div>
      )}
    </Card>
  );
};

export default ExtraPlatformAccounts;
