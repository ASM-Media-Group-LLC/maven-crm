import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Users, UserCheck, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/hooks/useLanguage";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";

interface UserOption {
  id: string;
  // null = la persona no tiene nombre cargado. El «Sin nombre» se pone al dibujar
  // (no acá: esto queda 5 minutos en la caché de react-query y no cambiaría de idioma).
  full_name: string | null;
}

interface AssignmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: { managerId: string | null; chatterIds: string[] }) => void;
  isSubmitting: boolean;
}

function useUsersByRole(role: string) {
  return useQuery({
    queryKey: ["users-by-role", role],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", role as any);
      if (error) throw error;
      if (!data || data.length === 0) return [] as UserOption[];

      const userIds = data.map((r) => r.user_id);
      const { data: profiles, error: profError } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      if (profError) throw profError;
      return (profiles || []).map((p) => ({
        id: p.id,
        full_name: p.full_name || null,
      })) as UserOption[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export default function AssignmentModal({
  open,
  onOpenChange,
  onConfirm,
  isSubmitting,
}: AssignmentModalProps) {
  const { t } = useLanguage();
  const [selectedManager, setSelectedManager] = useState<string | null>(null);
  const [selectedChatters, setSelectedChatters] = useState<string[]>([]);
  const [managerOpen, setManagerOpen] = useState(false);
  const [chatterOpen, setChatterOpen] = useState(false);
  const { toast } = useToast();

  const { data: managers = [], isLoading: loadingManagers } = useUsersByRole("manager");
  const { data: chatters = [], isLoading: loadingChatters } = useUsersByRole("agent");

  const nombre = (u: UserOption) => u.full_name || t("creadores.sell.noName");
  const managerElegido = managers.find((m) => m.id === selectedManager);
  const selectedManagerName = managerElegido ? nombre(managerElegido) : undefined;

  const toggleChatter = (id: string) => {
    setSelectedChatters((prev) => {
      if (prev.includes(id)) return prev.filter((c) => c !== id);
      if (prev.length >= 3) {
        toast({
          title: t("cr.max3Chatters"),
          description: t("cr.max3ChattersDesc"),
          variant: "destructive",
        });
        return prev;
      }
      return [...prev, id];
    });
  };

  const removeChatter = (id: string) => {
    setSelectedChatters((prev) => prev.filter((c) => c !== id));
  };

  const handleConfirm = () => {
    onConfirm({ managerId: selectedManager, chatterIds: selectedChatters });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            {t("creadores.assign.title")}
          </DialogTitle>
          <DialogDescription>
            {t("creadores.assign.desc")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Manager Selector */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <UserCheck className="h-4 w-4 text-primary" />
              Manager <span className="text-xs text-muted-foreground">{t("creadores.assign.optional")}</span>
            </Label>
            <Popover open={managerOpen} onOpenChange={setManagerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={managerOpen}
                  className="w-full justify-between font-normal"
                  disabled={loadingManagers}
                >
                  {loadingManagers ? (
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("common.loading")}
                    </span>
                  ) : selectedManagerName ? (
                    selectedManagerName
                  ) : (
                    <span className="text-muted-foreground">{t("cr.selectManagerPh")}</span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput placeholder={t("cr.searchManagerPh")} />
                  <CommandEmpty>{t("cr.noManagersFound")}</CommandEmpty>
                  <CommandGroup className="max-h-48 overflow-y-auto">
                    {managers.map((m) => (
                      <CommandItem
                        key={m.id}
                        value={nombre(m)}
                        onSelect={() => {
                          setSelectedManager(m.id);
                          setManagerOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            selectedManager === m.id ? "opacity-100" : "opacity-0"
                          )}
                        />
                        {nombre(m)}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Chatters Multi-selector */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Users className="h-4 w-4 text-muted-foreground" />
              Chatters <span className="text-xs text-muted-foreground">{t("cr.max3Optional")}</span>
            </Label>

            {/* Selected chatters badges */}
            {selectedChatters.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedChatters.map((id) => {
                  const chatter = chatters.find((c) => c.id === id);
                  return (
                    <Badge key={id} variant="secondary" className="gap-1 pr-1">
                      {chatter ? nombre(chatter) : "..."}
                      <button
                        type="button"
                        onClick={() => removeChatter(id)}
                        aria-label={t("creadores.assign.removeChatter")}
                        className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            )}

            <Popover open={chatterOpen} onOpenChange={setChatterOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={chatterOpen}
                  className="w-full justify-between font-normal"
                  disabled={loadingChatters}
                >
                  {loadingChatters ? (
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("common.loading")}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      {selectedChatters.length > 0
                        ? t("creadores.assign.nSelected", { n: selectedChatters.length })
                        : t("creadores.assign.selectChatters")}
                    </span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput placeholder={t("cr.searchChatterPh")} />
                  <CommandEmpty>{t("cr.noChattersFound")}</CommandEmpty>
                  <CommandGroup className="max-h-48 overflow-y-auto">
                    {chatters.map((c) => {
                      const isSelected = selectedChatters.includes(c.id);
                      return (
                        <CommandItem
                          key={c.id}
                          value={nombre(c)}
                          onSelect={() => toggleChatter(c.id)}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              isSelected ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {nombre(c)}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          {t("creadores.assign.skipHint")}
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleConfirm} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("creadores.assign.complete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
