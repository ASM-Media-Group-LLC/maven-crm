// AddSpammerAccountDialog — form para que un LG agregue una cuenta de IG
// nueva al sistema de "Salud de Cuentas IG".
//
// Reusa la lógica del form que vive en ScouterSettings (parser de handle
// flexible que acepta @handle, handle pelado, o URL completa de
// instagram.com). Lo encapsulamos en un dialog para no duplicar markup
// — desde el SpammerAccountsTab abrimos este modal cuando el LG clickea
// la card "+ Agregar".
//
// Una vez insertada, useInsertSpammerAccount dispara el scan IA en
// background contra la edge function scouter-spam-account-scan. El
// SpammerAccountsTab se refresca por invalidateQueries del hook.
//
// El texto sale de lib/i18n/leadgen.ts ("leadgen.igAccounts.add.*"). El nicho
// se guarda tal cual (lifestyle, fitness…): es dato y se muestra así.

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useInsertSpammerAccount, type AccountNiche } from "@/hooks/useSpammerAccounts";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/useLanguage";

const IG_HANDLE_REGEX = /^[a-zA-Z0-9_.]{1,30}$/;

const NICHES: AccountNiche[] = ["lifestyle", "fitness", "adult", "business", "mixed"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AddSpammerAccountDialog = ({ open, onOpenChange }: Props) => {
  const { t } = useLanguage();
  const insertAccount = useInsertSpammerAccount();
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [niche, setNiche] = useState<AccountNiche | "">("");

  // Parser: acepta "kash_creators", "@kash_creators",
  // "instagram.com/kash_creators", "https://www.instagram.com/kash_creators/?hl=es".
  const cleanedHandle = (() => {
    const raw = handle.trim();
    if (!raw) return "";
    const m = raw.match(
      /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9._]+)/i,
    );
    if (m && m[1]) return m[1].replace(/\/+$/, "");
    return raw.replace(/^@+/, "").replace(/\/+$/, "");
  })();

  const handleError =
    cleanedHandle.length > 0 && !IG_HANDLE_REGEX.test(cleanedHandle)
      ? t("leadgen.igAccounts.add.handleInvalid")
      : null;

  const canSave =
    cleanedHandle.length > 0 &&
    !handleError &&
    displayName.trim().length > 0 &&
    niche !== "";

  const reset = () => {
    setHandle("");
    setDisplayName("");
    setNiche("");
  };

  const submit = async () => {
    if (!canSave) return;
    try {
      await insertAccount.mutateAsync({
        instagram_handle: cleanedHandle,
        display_name: displayName.trim(),
        account_niche: niche as AccountNiche,
      });
      reset();
      onOpenChange(false);
      toast.success(t("leadgen.igAccounts.add.added"));
    } catch {
      // toast shown by mutation onError
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("leadgen.igAccounts.add.title")}</DialogTitle>
          <DialogDescription>{t("leadgen.igAccounts.add.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {/* Handle */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              {t("leadgen.igAccounts.add.handle")}
            </label>
            <div className="mt-1 flex items-center gap-0">
              <div className="flex h-9 items-center rounded-l-md border border-r-0 border-input bg-muted px-2.5 text-xs text-muted-foreground select-none">
                @
              </div>
              <Input
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder={t("leadgen.igAccounts.add.handlePlaceholder")}
                className={`h-9 text-sm rounded-l-none ${handleError ? "border-destructive" : ""}`}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoFocus
              />
            </div>
            {handleError && (
              <p className="mt-1 text-[11px] text-destructive">{handleError}</p>
            )}
            {!handleError && cleanedHandle && cleanedHandle !== handle.trim().replace(/^@+/, "") && (
              <p className="mt-1 text-[11px] text-success">
                {t("leadgen.igAccounts.add.detected", { handle: cleanedHandle })}
              </p>
            )}
          </div>

          {/* Display name */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              {t("leadgen.igAccounts.add.displayName")}
            </label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t("leadgen.igAccounts.add.displayNamePlaceholder")}
              className="mt-1 h-9 text-sm"
            />
          </div>

          {/* Niche */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              {t("leadgen.igAccounts.add.niche")}
            </label>
            <Select value={niche} onValueChange={(v) => setNiche(v as AccountNiche)}>
              <SelectTrigger className="mt-1 h-9 text-sm">
                <SelectValue placeholder={t("leadgen.igAccounts.add.nichePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {NICHES.map((n) => (
                  <SelectItem key={n} value={n} className="text-sm capitalize">
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={insertAccount.isPending}
          >
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={!canSave || insertAccount.isPending}>
            {insertAccount.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-1.5 h-4 w-4" />
            )}
            {t("leadgen.igAccounts.addAccount")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddSpammerAccountDialog;
