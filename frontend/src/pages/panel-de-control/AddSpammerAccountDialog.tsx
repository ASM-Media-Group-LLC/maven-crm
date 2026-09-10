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

const IG_HANDLE_REGEX = /^[a-zA-Z0-9_.]{1,30}$/;

const NICHES: AccountNiche[] = ["lifestyle", "fitness", "adult", "business", "mixed"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AddSpammerAccountDialog = ({ open, onOpenChange }: Props) => {
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
      ? "Solo letras, números, puntos y guiones bajos (máx 30)."
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
      toast.success("Cuenta agregada — escaneando con IA…");
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
          <DialogTitle>Agregar cuenta IG</DialogTitle>
          <DialogDescription>
            Suma una cuenta de Instagram que uses para hacer outreach.
            La IA la escanea y te dice qué tan creíble se ve para las creadoras.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {/* Handle */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Handle de Instagram
            </label>
            <div className="mt-1 flex items-center gap-0">
              <div className="flex h-9 items-center rounded-l-md border border-r-0 border-input bg-muted px-2.5 text-xs text-muted-foreground select-none">
                @
              </div>
              <Input
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="handle o link de IG"
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
                Detectado: @{cleanedHandle}
              </p>
            )}
          </div>

          {/* Display name */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Nombre descriptivo
            </label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Ej. Cuenta principal · Kash"
              className="mt-1 h-9 text-sm"
            />
          </div>

          {/* Niche */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Nicho de la cuenta
            </label>
            <Select value={niche} onValueChange={(v) => setNiche(v as AccountNiche)}>
              <SelectTrigger className="mt-1 h-9 text-sm">
                <SelectValue placeholder="Elige un nicho…" />
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
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!canSave || insertAccount.isPending}>
            {insertAccount.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-1.5 h-4 w-4" />
            )}
            Agregar cuenta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddSpammerAccountDialog;
