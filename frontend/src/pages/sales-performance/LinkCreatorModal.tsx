import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link2, Search, Plus, UserPlus, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/useLanguage";

interface LinkCreatorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingCreator: string;
  earningsRowId: string;
}

interface CreatorWithAccounts {
  id: string;
  name: string;
  artistic_name: string | null;
  profile_photo_url: string | null;
  accountCount: number;
  accounts: string[];
}

const LinkCreatorModal = ({ open, onOpenChange, pendingCreator, earningsRowId }: LinkCreatorModalProps) => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"search" | "create" | "confirm">("search");
  const [newName, setNewName] = useState("");
  const [newArtisticName, setNewArtisticName] = useState("");
  const [selectedCreator, setSelectedCreator] = useState<CreatorWithAccounts | null>(null);

  // Fetch creators with their OF account counts
  const { data: creators = [] } = useQuery({
    queryKey: ["creators_for_linking_with_accounts"],
    queryFn: async () => {
      const [creatorsRes, accountsRes] = await Promise.all([
        supabase
          .from("creators")
          .select("id, name, artistic_name, profile_photo_url")
          .order("name"),
        supabase
          .from("creator_of_accounts" as any)
          .select("creator_id, account_handle"),
      ]);
      if (creatorsRes.error) throw creatorsRes.error;

      // Group accounts by creator_id
      const accountsByCreator = new Map<string, string[]>();
      if (accountsRes.data) {
        for (const acc of accountsRes.data as any[]) {
          const list = accountsByCreator.get(acc.creator_id) || [];
          list.push(acc.account_handle);
          accountsByCreator.set(acc.creator_id, list);
        }
      }

      return creatorsRes.data.map((c): CreatorWithAccounts => ({
        ...c,
        accountCount: accountsByCreator.get(c.id)?.length ?? 0,
        accounts: accountsByCreator.get(c.id) ?? [],
      }));
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

      // Register the account in creator_of_accounts
      const { error: accountError } = await supabase
        .from("creator_of_accounts" as any)
        .upsert(
          {
            creator_id: creatorId,
            account_handle: pendingCreator,
            onlyfans_url: `https://onlyfans.com/${pendingCreator}`,
          } as any,
          { onConflict: "account_handle" }
        );
      if (accountError) throw accountError;

      // Also keep onlyfans_url on creators table for backwards compat (only if first account)
      const creator = creators.find(c => c.id === creatorId);
      if (!creator || creator.accountCount === 0) {
        await supabase
          .from("creators")
          .update({ onlyfans_url: `https://onlyfans.com/${pendingCreator}` })
          .eq("id", creatorId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["of_gross_earnings_performance"] });
      queryClient.invalidateQueries({ queryKey: ["creators_for_linking_with_accounts"] });
      const creator = selectedCreator;
      const isAdditional = creator && creator.accountCount > 0;
      toast.success(
        isAdditional
          ? t("sales.link.linkedExtra", { handle: pendingCreator, name: creator.name })
          : t("sales.link.linked", { handle: pendingCreator })
      );
      onOpenChange(false);
    },
    onError: () => toast.error(t("sales.link.linkError")),
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

      // Register account
      await supabase
        .from("creator_of_accounts" as any)
        .insert({
          creator_id: newCreator.id,
          account_handle: pendingCreator,
          onlyfans_url: `https://onlyfans.com/${pendingCreator}`,
        } as any);

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
      queryClient.invalidateQueries({ queryKey: ["creators_for_linking_with_accounts"] });
      toast.success(t("sales.link.createdLinked"));
      onOpenChange(false);
    },
    onError: () => toast.error(t("sales.link.createError")),
  });

  const handleCreatorClick = (creator: CreatorWithAccounts) => {
    setSelectedCreator(creator);
    if (creator.accountCount > 0) {
      setMode("confirm");
    } else {
      linkMutation.mutate(creator.id);
    }
  };

  const handleClose = (o: boolean) => {
    if (!o) {
      setSearch("");
      setMode("search");
      setNewName("");
      setNewArtisticName("");
      setSelectedCreator(null);
    }
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            {t("sales.link.title")}
          </DialogTitle>
          <DialogDescription>
            {t("sales.link.desc1")} <span className="font-medium">"{pendingCreator}"</span> {t("sales.link.desc2")}
          </DialogDescription>
        </DialogHeader>

        {mode === "search" ? (
          <div className="flex flex-col gap-3 flex-1 min-h-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("sales.link.searchPh")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="flex-1 overflow-y-auto rounded-lg border border-border divide-y divide-border max-h-[300px]">
              {filtered.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  {t("common.noResultsShort")}
                </div>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.id}
                    className="flex items-center gap-3 w-full px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
                    onClick={() => handleCreatorClick(c)}
                    disabled={linkMutation.isPending}
                  >
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium shrink-0">
                      {c.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{c.name}</p>
                        {c.accountCount > 0 && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                            {t(c.accountCount === 1 ? "sales.link.account1" : "sales.link.accountN", { n: c.accountCount })}
                          </Badge>
                        )}
                      </div>
                      {c.artistic_name && (
                        <p className="text-xs text-muted-foreground truncate">{c.artistic_name}</p>
                      )}
                      {c.accountCount > 0 && (
                        <p className="text-[10px] text-muted-foreground truncate">
                          {c.accounts.join(", ")}
                        </p>
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
              {t("sales.link.createNew")}
            </Button>
          </div>
        ) : mode === "confirm" && selectedCreator ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-4 space-y-2">
              <div className="flex items-center gap-2 text-warning">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span className="text-sm font-medium">{t("sales.link.extraAccount")}</span>
              </div>
              <p className="text-sm text-warning">
                <span className="font-medium">{selectedCreator.name}</span>{" "}
                {t(selectedCreator.accountCount === 1 ? "sales.link.alreadyHas1" : "sales.link.alreadyHasN", { n: selectedCreator.accountCount })}
              </p>
              <ul className="text-xs text-warning list-disc list-inside">
                {selectedCreator.accounts.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
              <p className="text-sm text-warning">
                {t("sales.link.confirmQ1")} <span className="font-medium">"{pendingCreator}"</span> {t("sales.link.confirmQ2")}
              </p>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => {
                setSelectedCreator(null);
                setMode("search");
              }}>
                {t("common.back")}
              </Button>
              <Button
                className="flex-1 gap-2"
                disabled={linkMutation.isPending}
                onClick={() => linkMutation.mutate(selectedCreator.id)}
              >
                <Plus className="h-4 w-4" />
                {linkMutation.isPending ? t("sales.link.linking") : t("sales.link.linkExtra")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("sales.link.fullNameReq")}</label>
              <Input
                placeholder={t("sales.link.namePh")}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("sales.link.artisticName")}</label>
              <Input
                placeholder={t("sales.link.artisticName")}
                value={newArtisticName}
                onChange={(e) => setNewArtisticName(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setMode("search")}>
                {t("common.back")}
              </Button>
              <Button
                className="flex-1 gap-2"
                disabled={!newName.trim() || createAndLinkMutation.isPending}
                onClick={() => createAndLinkMutation.mutate()}
              >
                <Plus className="h-4 w-4" />
                {createAndLinkMutation.isPending ? t("sales.link.creating") : t("sales.link.createAndLink")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default LinkCreatorModal;
