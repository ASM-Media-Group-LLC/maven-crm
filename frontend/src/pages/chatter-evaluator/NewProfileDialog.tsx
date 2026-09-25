import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Loader2, Plus, X, UserPlus, Camera } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import {
  useCreateChatterProfile,
  useUploadChatterAvatar,
} from "@/hooks/useChatterEvaluator";

// Same bilingual fields as the existing ProfileEditContent so admins
// see exactly the same shape they would see when editing later.
// `label` es la clave de i18n del NOMBRE del campo (lo que se muestra); `key`
// y `keyEn` son las columnas de chatter_profiles.
const BILINGUAL_FIELDS: { key: string; keyEn: string; label: TranslationKey; type: "input" | "textarea" }[] = [
  { key: "name",        keyEn: "name_en",        label: "chatters.field.name",        type: "input" },
  { key: "nationality", keyEn: "nationality_en", label: "chatters.field.nationality", type: "input" },
  { key: "location",    keyEn: "location_en",    label: "chatters.field.location",    type: "input" },
  { key: "age",         keyEn: "age_en",         label: "chatters.field.age",         type: "input" },
  { key: "users_term",  keyEn: "users_term_en",  label: "chatters.field.usersTerm",   type: "textarea" },
  { key: "greeting",    keyEn: "greeting_en",    label: "chatters.field.greeting",    type: "textarea" },
  { key: "body",        keyEn: "body_en",        label: "chatters.field.body",        type: "input" },
  { key: "nudity",      keyEn: "nudity_en",      label: "chatters.field.nudity",      type: "input" },
  { key: "anal",        keyEn: "anal_en",        label: "chatters.field.anal",        type: "input" },
  { key: "collabs",     keyEn: "collabs_en",     label: "chatters.field.collabs",     type: "textarea" },
  { key: "videocall",   keyEn: "videocall_en",   label: "chatters.field.videocall",   type: "textarea" },
  { key: "custom",      keyEn: "custom_en",      label: "chatters.field.customs",     type: "textarea" },
  { key: "extra",       keyEn: "extra_en",       label: "chatters.field.extraRules",  type: "textarea" },
];

const DEFAULT_PRICE_KEYS = ["X", "XX", "XXX", "ANAL"];

interface NewProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const NewProfileDialog = ({ open, onOpenChange }: NewProfileDialogProps) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const create = useCreateChatterProfile();
  const uploadAvatar = useUploadChatterAvatar();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [key, setKey] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarX, setAvatarX] = useState(50);
  const [avatarY, setAvatarY] = useState(50);
  const [avatarZoom, setAvatarZoom] = useState(100);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [prices, setPrices] = useState<{ key: string; value: string }[]>([]);
  const [newPriceKey, setNewPriceKey] = useState("");
  const [extraFieldKey, setExtraFieldKey] = useState("");
  const [extraFields, setExtraFields] = useState<{ key: string; label: string; valueEs: string; valueEn: string }[]>([]);

  // Fresh state every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setKey("");
    setAvatarUrl("");
    setAvatarX(50);
    setAvatarY(50);
    setAvatarZoom(100);
    setFields({});
    setPrices(DEFAULT_PRICE_KEYS.map((k) => ({ key: k, value: "" })));
    setNewPriceKey("");
    setExtraFieldKey("");
    setExtraFields([]);
  }, [open]);

  const updateField = (k: string, v: string) =>
    setFields((curr) => ({ ...curr, [k]: v }));

  const handleAvatarFile = async (file: File) => {
    const cleanKey = key.trim().toLowerCase().replace(/\s+/g, "");
    if (!cleanKey) {
      toast.error(t("chatters.newProfile.keyFirst"), {
        description: t("chatters.newProfile.keyFirstDesc"),
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    try {
      const { url } = await uploadAvatar.mutateAsync({
        profileKey: cleanKey,
        file,
      });
      setAvatarUrl(url);
    } catch (e) {
      toast.error(t("chatters.profileEdit.avatarUploadFailed"), {
        description: (e as Error).message,
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const addExtraField = () => {
    const k = extraFieldKey.trim();
    if (!k) return;
    const slug = k.toLowerCase().replace(/[^a-z0-9_]+/g, "_");
    if (extraFields.find((f) => f.key === slug)) {
      toast.error(t("chatters.newProfile.fieldExists"));
      return;
    }
    setExtraFields((curr) => [...curr, { key: slug, label: k, valueEs: "", valueEn: "" }]);
    setExtraFieldKey("");
  };
  const updateExtra = (slug: string, lang: "valueEs" | "valueEn", v: string) =>
    setExtraFields((curr) => curr.map((f) => (f.key === slug ? { ...f, [lang]: v } : f)));
  const removeExtra = (slug: string) =>
    setExtraFields((curr) => curr.filter((f) => f.key !== slug));

  const addPriceRow = () => {
    const k = newPriceKey.trim().toUpperCase();
    if (!k) return;
    if (prices.find((p) => p.key === k)) {
      toast.error(t("chatters.newProfile.priceExists"));
      return;
    }
    setPrices((curr) => [...curr, { key: k, value: "" }]);
    setNewPriceKey("");
  };
  const updatePrice = (k: string, v: string) =>
    setPrices((curr) => curr.map((p) => (p.key === k ? { ...p, value: v } : p)));
  const removePrice = (k: string) =>
    setPrices((curr) => curr.filter((p) => p.key !== k));

  const handleSubmit = async () => {
    const cleanKey = key.trim().toLowerCase().replace(/\s+/g, "");
    if (!cleanKey) {
      toast.error(t("chatters.newProfile.keyRequired"));
      return;
    }

    const patch: Record<string, unknown> = { key: cleanKey };
    for (const f of BILINGUAL_FIELDS) {
      const es = fields[f.key]?.trim();
      const en = fields[f.keyEn]?.trim();
      if (es) patch[f.key] = es;
      if (en) patch[f.keyEn] = en;
    }
    if (avatarUrl) {
      patch.avatar_url = avatarUrl;
      patch.avatar_x = avatarX;
      patch.avatar_y = avatarY;
      patch.avatar_zoom = avatarZoom;
    }

    const filledPrices = prices.filter((p) => p.value.trim());
    if (filledPrices.length > 0) {
      patch.prices = Object.fromEntries(
        filledPrices.map((p) => [p.key, p.value.trim()]),
      );
    }

    const filledExtras = extraFields.filter((f) => f.valueEs.trim() || f.valueEn.trim());
    if (filledExtras.length > 0) {
      patch.extra_fields = Object.fromEntries(
        filledExtras.map((f) => [
          f.key,
          {
            label: f.label,
            value: f.valueEs.trim(),
            value_en: f.valueEn.trim(),
          },
        ]),
      );
    }

    try {
      const created = await create.mutateAsync(patch as Parameters<typeof create.mutateAsync>[0]);
      toast.success(t("chatters.newProfile.created"));
      onOpenChange(false);
      navigate(`/chatter-evaluator/${created.key}/edit`);
    } catch (e) {
      toast.error(t("common.couldNotCreate"), { description: (e as Error).message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" /> {t("chatters.newProfile.title")}
          </DialogTitle>
          <DialogDescription>
            {t("chatters.newProfile.desc")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Avatar (with hover-to-upload overlay + framing sliders) */}
          <div className="grid grid-cols-1 gap-5 border-b pb-5 md:grid-cols-[180px_1fr]">
            <div>
              <div className="group relative aspect-square w-full overflow-hidden rounded-2xl bg-gradient-to-br from-purple-600/40 to-amber-500/40">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="avatar"
                    className="h-full w-full object-cover"
                    style={{
                      objectPosition: `${avatarX}% ${avatarY}%`,
                      transform: `scale(${avatarZoom / 100})`,
                    }}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-4xl font-bold text-white/80">
                    ?
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadAvatar.isPending}
                  className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/70 text-white opacity-0 transition-opacity hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-100"
                  aria-label={t("chatters.newProfile.uploadAvatar")}
                >
                  {uploadAvatar.isPending ? (
                    <>
                      <Loader2 className="h-6 w-6 animate-spin" />
                      <span className="text-xs">{t("chatters.profileEdit.uploading")}</span>
                    </>
                  ) : (
                    <>
                      <Camera className="h-7 w-7" />
                      <span className="text-xs">{avatarUrl ? t("chatters.profileEdit.changePhoto") : t("chatters.newProfile.uploadPhoto")}</span>
                    </>
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleAvatarFile(f);
                  }}
                />
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">
                {t("chatters.newProfile.hoverToUpload")}
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <Label htmlFor="profile_key" className="text-xs">
                  {t("chatters.newProfile.internalKey")} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="profile_key"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder={t("chatters.newProfile.keyPh")}
                  className="mt-1 font-mono"
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {t("chatters.newProfile.keyHelp")}
                </p>
              </div>

              {/* Framing sliders — only useful once an image is loaded */}
              <div className={avatarUrl ? "" : "opacity-50 pointer-events-none"}>
                <div>
                  <Label className="text-xs">{t("chatters.profileEdit.positionX", { n: avatarX })}</Label>
                  <Slider
                    value={[avatarX]}
                    onValueChange={([v]) => setAvatarX(v)}
                    min={0}
                    max={100}
                    step={1}
                    className="mt-1"
                  />
                </div>
                <div className="mt-2">
                  <Label className="text-xs">{t("chatters.profileEdit.positionY", { n: avatarY })}</Label>
                  <Slider
                    value={[avatarY]}
                    onValueChange={([v]) => setAvatarY(v)}
                    min={0}
                    max={100}
                    step={1}
                    className="mt-1"
                  />
                </div>
                <div className="mt-2">
                  <Label className="text-xs">Zoom: {avatarZoom}%</Label>
                  <Slider
                    value={[avatarZoom]}
                    onValueChange={([v]) => setAvatarZoom(v)}
                    min={50}
                    max={300}
                    step={5}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Bilingual fields — same ES/EN columns as ProfileEditContent */}
          <div className="space-y-4">
            <div className="text-sm font-semibold">{t("chatters.profile.characterAndRules")}</div>
            {BILINGUAL_FIELDS.map((f) => {
              const Cmp = f.type === "textarea" ? Textarea : Input;
              return (
                <div key={f.key} className="space-y-1">
                  <Label className="text-xs font-medium">{t(f.label)}</Label>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <div>
                      <div className="mb-1 flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">ES</Badge>
                      </div>
                      <Cmp
                        value={fields[f.key] ?? ""}
                        onChange={(e) => updateField(f.key, e.target.value)}
                        rows={f.type === "textarea" ? 2 : undefined}
                      />
                    </div>
                    <div>
                      <div className="mb-1 flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">EN</Badge>
                      </div>
                      <Cmp
                        value={fields[f.keyEn] ?? ""}
                        onChange={(e) => updateField(f.keyEn, e.target.value)}
                        rows={f.type === "textarea" ? 2 : undefined}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Extra fields */}
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="mb-2 text-xs font-semibold text-muted-foreground">
              {t("chatters.newProfile.relevantInfo")}
            </div>
            {extraFields.length > 0 && (
              <div className="mb-3 space-y-3">
                {extraFields.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium">{f.label}</span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => removeExtra(f.key)}
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        aria-label={t("chatters.newProfile.removeN", { name: f.label })}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[9px]">ES</Badge>
                        <Input
                          value={f.valueEs}
                          onChange={(e) => updateExtra(f.key, "valueEs", e.target.value)}
                          className="flex-1 text-sm"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[9px]">EN</Badge>
                        <Input
                          value={f.valueEn}
                          onChange={(e) => updateExtra(f.key, "valueEn", e.target.value)}
                          className="flex-1 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                value={extraFieldKey}
                onChange={(e) => setExtraFieldKey(e.target.value)}
                placeholder={t("chatters.newProfile.fieldNamePh")}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addExtraField())}
              />
              <Button type="button" variant="outline" onClick={addExtraField} className="gap-1">
                <Plus className="h-4 w-4" /> {t("common.add")}
              </Button>
            </div>
          </div>

          {/* Prices */}
          <div className="rounded-md border border-warning/40 bg-warning/5 p-3">
            <div className="mb-2 text-xs font-semibold text-warning">{t("chatters.newProfile.prices")}</div>
            <div className="space-y-2">
              {prices.map((p) => (
                <div key={p.key} className="flex items-center gap-2">
                  <span className="w-20 shrink-0 font-mono text-xs font-bold text-warning">
                    {p.key}
                  </span>
                  <Input
                    value={p.value}
                    onChange={(e) => updatePrice(p.key, e.target.value)}
                    placeholder={t("chatters.newProfile.pricePh")}
                    className="flex-1"
                  />
                  {!DEFAULT_PRICE_KEYS.includes(p.key) && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => removePrice(p.key)}
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      aria-label={t("chatters.newProfile.removeN", { name: p.key })}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Input
                value={newPriceKey}
                onChange={(e) => setNewPriceKey(e.target.value)}
                placeholder={t("chatters.newProfile.priceKeyPh")}
                className="max-w-[150px] font-mono"
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addPriceRow())}
              />
              <Button type="button" variant="outline" onClick={addPriceRow} className="gap-1">
                <Plus className="h-4 w-4" /> {t("chatters.newProfile.addPrice")}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!key.trim() || create.isPending}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700"
          >
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            {t("chatters.newProfile.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewProfileDialog;
