import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link2, Search, Plus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface LinkCreatorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingCreator: string;
  earningsRowId: string;
}

const LinkCreatorModal = ({ open, onOpenChange, pendingCreator, earningsRowId }: LinkCreatorModalProps) => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"search" | "create">("search");
  const [newName, setNewName] = useState("");
  const [newArtisticName, setNewArtisticName] = useState("");

  const { data: creators = [] } = useQuery({
    queryKey: ["creators_for_linking"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creators")
        .select("id, name, artistic_name, profile_photo_url")
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return creators;
    const q = search.toLowerCase();
    return creators.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.artistic_name ?? "").toLowerCase().includes(q)
    );
  }, [creators, search]);

  const linkMutation = useMutation({
    mutationFn: async (creatorId: string) => {
      // Update all of_gross_earnings rows with this pending_creator to the selected creator_id
      const { error } = await supabase
        .from("of_gross_earnings")
        .update({ creator_id: creatorId })
        .eq("pending_creator", pendingCreator);
      if (error) throw error;

      // Update the creator's onlyfans_url with the pending_creator name
      const { error: urlError } = await supabase
        .from("creators")
        .update({ onlyfans_url: `https://onlyfans.com/${pendingCreator}` })
        .eq("id", creatorId);
      if (urlError) throw urlError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["of_gross_earnings_performance"] });
      queryClient.invalidateQueries({ queryKey: ["creators_for_linking"] });
      toast.success(`"${pendingCreator}" vinculado exitosamente`);
      onOpenChange(false);
    },
    onError: () => toast.error("Error al vincular creador"),
  });

  const createAndLinkMutation = useMutation({
    mutationFn: async () => {
      // Create new creator
      const { data: newCreator, error: createError } = await supabase
        .from("creators")
        .insert({
          name: newName.trim(),
          artistic_name: newArtisticName.trim() || pendingCreator,
          onlyfans_url: `https://onlyfans.com/${pendingCreator}`,
        })
        .select("id")
        .single();
      if (createError) throw createError;

      // Link all earnings rows with this pending_creator
      const { error: linkError } = await supabase
        .from("of_gross_earnings")
        .update({ creator_id: newCreator.id })
        .eq("pending_creator", pendingCreator);
      if (linkError) throw linkError;

      return newCreator;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["of_gross_earnings_performance"] });
      queryClient.invalidateQueries({ queryKey: ["creators_for_linking"] });
      toast.success(`Creador creado y vinculado exitosamente`);
      onOpenChange(false);
    },
    onError: () => toast.error("Error al crear y vincular creador"),
  });

  const handleClose = (o: boolean) => {
    if (!o) {
      setSearch("");
      setMode("search");
      setNewName("");
      setNewArtisticName("");
    }
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Vincular Creador
          </DialogTitle>
          <DialogDescription>
            Vincula <span className="font-medium">"{pendingCreator}"</span> a un creador existente o crea uno nuevo.
          </DialogDescription>
        </DialogHeader>

        {mode === "search" ? (
          <div className="flex flex-col gap-3 flex-1 min-h-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar creador por nombre…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="flex-1 overflow-y-auto rounded-lg border border-border divide-y divide-border max-h-[300px]">
              {filtered.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  Sin resultados
                </div>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.id}
                    className="flex items-center gap-3 w-full px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
                    onClick={() => linkMutation.mutate(c.id)}
                    disabled={linkMutation.isPending}
                  >
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium shrink-0">
                      {c.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      {c.artistic_name && (
                        <p className="text-xs text-muted-foreground truncate">{c.artistic_name}</p>
                      )}
                    </div>
                    <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                ))
              )}
            </div>

            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => {
                setMode("create");
                setNewArtisticName(pendingCreator);
              }}
            >
              <UserPlus className="h-4 w-4" />
              Crear nuevo creador
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nombre completo *</label>
              <Input
                placeholder="Nombre del creador"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Nombre artístico</label>
              <Input
                placeholder="Nombre artístico"
                value={newArtisticName}
                onChange={(e) => setNewArtisticName(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setMode("search")}>
                Volver
              </Button>
              <Button
                className="flex-1 gap-2"
                disabled={!newName.trim() || createAndLinkMutation.isPending}
                onClick={() => createAndLinkMutation.mutate()}
              >
                <Plus className="h-4 w-4" />
                {createAndLinkMutation.isPending ? "Creando…" : "Crear y vincular"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default LinkCreatorModal;
