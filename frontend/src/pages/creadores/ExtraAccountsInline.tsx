// Cuentas ADICIONALES de una red, COMPACTO e INLINE (va debajo del input principal
// de cada red en el form). Vacío = solo un link "+ otra cuenta" (no ocupa). Con
// cuentas = chips (@handle ×, click para pausar/activar). Escribe directo a
// creator_social_accounts (la principal sigue en creators.<red>_handle).
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { X, Plus } from "lucide-react";

const normalizeUsername = (raw: string): string => {
  let h = (raw || "").trim();
  if (/^https?:\/\//i.test(h)) {
    try { h = new URL(h).pathname.split("/").filter(Boolean)[0] ?? ""; } catch { return ""; }
  }
  return h.replace(/^@+/, "").trim();
};

interface Props {
  creatorId?: string;
  network: string; // instagram | x | tiktok | youtube | telegram | reddit | facebook
  canManage: boolean;
}

const ExtraAccountsInline = ({ creatorId, network, canManage }: Props) => {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");
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
    const u = normalizeUsername(value);
    if (!u || !creatorId) return;
    setBusy(true);
    const { error } = await supabase
      .from("creator_social_accounts")
      .insert({ creator_id: creatorId, network, username: u });
    setBusy(false);
    if (error) {
      toast.error(/duplicate|unique/i.test(error.message) ? "Esa cuenta ya está agregada" : "No se pudo agregar");
      return;
    }
    setValue("");
    setAdding(false);
    refresh();
  };
  const remove = async (id: string) => {
    const { error } = await supabase.from("creator_social_accounts").delete().eq("id", id);
    if (error) { toast.error("No se pudo quitar"); return; }
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

  if (!creatorId) return null;
  if (accounts.length === 0 && !canManage) return null;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {accounts.map((a) => (
        <span
          key={a.id}
          className={`inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[11px] ${a.active ? "" : "opacity-50"}`}
        >
          <button
            type="button"
            onClick={() => canManage && toggle(a.id, !a.active)}
            title={a.active ? "Activa (se escanea) — click para pausar" : "Pausada — click para activar"}
            className={a.active ? "" : "line-through"}
          >
            @{a.username}
          </button>
          {canManage && (
            <button type="button" onClick={() => remove(a.id)} title="Quitar" className="text-muted-foreground hover:text-rose-400">
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}

      {canManage && (adding ? (
        <span className="inline-flex items-center gap-1">
          <Input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } if (e.key === "Escape") { setAdding(false); setValue(""); } }}
            onBlur={() => { if (!value.trim()) setAdding(false); }}
            placeholder="@otra cuenta o link"
            className="h-7 w-44 text-xs"
          />
          <button type="button" onClick={add} disabled={busy || !value.trim()} className="rounded bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground disabled:opacity-50">
            {busy ? "…" : "OK"}
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
        >
          <Plus className="h-3 w-3" /> otra cuenta
        </button>
      ))}
    </div>
  );
};

export default ExtraAccountsInline;
