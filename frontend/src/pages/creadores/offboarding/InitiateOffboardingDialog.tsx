import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, User, Loader2 } from "lucide-react";
import InstagramIcon from "@/components/icons/InstagramIcon";
import { supabase } from "@/integrations/supabase/client";
import { createOffboardingRecord } from "../useOffboarding";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/useLanguage";

interface Creator {
  id: string;
  name: string;
  artistic_name: string | null;
  instagram_handle: string | null;
  status: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export default function InitiateOffboardingDialog({ open, onOpenChange, onSuccess }: Props) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [creators, setCreators] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setSelectedId(null);
      return;
    }
    (async () => {
      setLoading(true);
      // Fetch creators that don't already have an active offboarding
      const { data: allCreators } = await supabase
        .from("creators")
        .select("id, name, artistic_name, instagram_handle, status")
        .in("status", ["active", "leaving", "paused"])
        .order("name");

      const { data: existingOffboardings } = await supabase
        .from("creator_offboardings")
        .select("creator_id")
        .in("status", ["en_proceso", "pendiente_aprobacion", "pendiente_cierre"]);

      const activeIds = new Set((existingOffboardings ?? []).map((o) => o.creator_id));
      setCreators((allCreators ?? []).filter((c) => !activeIds.has(c.id)));
      setLoading(false);
    })();
  }, [open]);

  const filtered = creators.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.artistic_name?.toLowerCase().includes(q) ||
      c.instagram_handle?.toLowerCase().includes(q)
    );
  });

  const handleSubmit = async () => {
    if (!selectedId) return;
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");

      // Update creator status to leaving
      await supabase.from("creators").update({ status: "leaving" }).eq("id", selectedId);

      // Create offboarding record
      const offboardingId = await createOffboardingRecord(selectedId, user.id);

      toast.success("Offboarding iniciado correctamente");
      onOpenChange(false);
      onSuccess?.();
      navigate(`/creadores/offboarding/${offboardingId}`);
    } catch (err: any) {
      toast.error(t("cr.errStartOffboarding", { msg: err.message ?? "" }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Iniciar Offboarding</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("cr.searchCreatorPh")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <ScrollArea className="h-[280px] -mx-2">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> {t("common.loading")}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              No hay creadoras disponibles
            </p>
          ) : (
            <div className="space-y-1 px-2">
              {filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id === selectedId ? null : c.id)}
                  className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                    selectedId === c.id
                      ? "bg-primary/10 ring-1 ring-primary/30"
                      : "hover:bg-muted/60"
                  }`}
                >
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {c.artistic_name && <span>{c.artistic_name}</span>}
                      {c.instagram_handle && (
                        <span className="flex items-center gap-0.5">
                          <InstagramIcon className="h-3 w-3" />
                          {c.instagram_handle}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!selectedId || submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Iniciar Offboarding
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
