import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Save, Plus, X, Loader2, Camera, Upload, Pencil } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import {
  useChatterProfiles,
  useUpdateChatterProfile,
  useUploadChatterAvatar,
  useChatterVaultByProfile,
  type ChatterProfileUpdate,
} from "@/hooks/useChatterEvaluator";
import { VaultGallery } from "./VaultGallery";
import type { ChatterProfile } from "./types";
import { useLanguage } from "@/hooks/useLanguage";
import { getTranslation, type TranslationKey } from "@/lib/i18n";
import {
  getCustomSections,
  getLabelOverrides,
  mergeExtras,
  type CustomSection,
  type LabelOverrides,
} from "./profileExtras";

interface BilingualConfig {
  key: keyof ChatterProfile;
  keyEn: keyof ChatterProfile;
  /** Clave de i18n del nombre del campo. La columna ES muestra SIEMPRE su
   *  versión en español y la EN la inglesa, sea cual sea el idioma de la
   *  interfaz: son las etiquetas por defecto de cada idioma del personaje. */
  label: TranslationKey;
  type: "input" | "textarea";
}

const BILINGUAL_FIELDS: BilingualConfig[] = [
  { key: "name",        keyEn: "name_en",        label: "chatters.field.name",        type: "input" },
  { key: "nationality", keyEn: "nationality_en", label: "chatters.field.nationality", type: "input" },
  { key: "location",    keyEn: "location_en",    label: "chatters.field.location",    type: "input" },
  { key: "age",         keyEn: "age_en",         label: "chatters.field.age",         type: "input" },
  { key: "greeting",    keyEn: "greeting_en",    label: "chatters.field.greeting",    type: "textarea" },
  { key: "users_term",  keyEn: "users_term_en",  label: "chatters.field.usersTerm",   type: "textarea" },
  { key: "body",        keyEn: "body_en",        label: "chatters.field.body",        type: "input" },
  { key: "nudity",      keyEn: "nudity_en",      label: "chatters.field.nudity",      type: "input" },
  { key: "anal",        keyEn: "anal_en",        label: "chatters.field.anal",        type: "input" },
  { key: "collabs",     keyEn: "collabs_en",     label: "chatters.field.collabs",     type: "textarea" },
  { key: "videocall",   keyEn: "videocall_en",   label: "chatters.field.videocall",   type: "textarea" },
  { key: "custom",      keyEn: "custom_en",      label: "chatters.field.customs",     type: "textarea" },
  { key: "extra",       keyEn: "extra_en",       label: "chatters.field.extraRules",  type: "textarea" },
];

type FormState = {
  fields: Record<string, string>;
  prices: { service: string; price: string }[];
  avatar_url: string;
  avatar_x: number;
  avatar_y: number;
  avatar_zoom: number;
  labelOverrides: LabelOverrides;
  customSections: CustomSection[];
  extra_fields_raw: Record<string, unknown>;
};

const newSectionId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `sec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const buildFormState = (p: ChatterProfile): FormState => {
  const fields: Record<string, string> = {};
  for (const c of BILINGUAL_FIELDS) {
    fields[c.key] = (p[c.key] as string | null) ?? "";
    fields[c.keyEn] = (p[c.keyEn] as string | null) ?? "";
  }
  return {
    fields,
    prices: Object.entries(p.prices ?? {}).map(([service, price]) => ({
      service,
      price: String(price),
    })),
    avatar_url: p.avatar_url ?? "",
    avatar_x: p.avatar_x ?? 50,
    avatar_y: p.avatar_y ?? 50,
    avatar_zoom: p.avatar_zoom ?? 100,
    labelOverrides: getLabelOverrides(p),
    customSections: getCustomSections(p),
    extra_fields_raw: p.extra_fields ?? {},
  };
};

const buildPatch = (s: FormState): ChatterProfileUpdate => {
  const patch: Record<string, unknown> = { ...s.fields };
  // Convert empty strings to null so DB has clean nulls instead of ""
  for (const k of Object.keys(patch)) {
    if (patch[k] === "") patch[k] = null;
  }
  // prices: array of {service, price} → {service: price} dict, drop empties
  const prices: Record<string, string> = {};
  for (const { service, price } of s.prices) {
    const k = service.trim();
    if (k) prices[k] = price.trim();
  }
  patch.prices = prices;
  patch.avatar_url = s.avatar_url || null;
  patch.avatar_x = s.avatar_x;
  patch.avatar_y = s.avatar_y;
  patch.avatar_zoom = s.avatar_zoom;
  patch.extra_fields = mergeExtras(
    s.extra_fields_raw,
    s.labelOverrides,
    s.customSections,
  );
  return patch as ChatterProfileUpdate;
};

const ChatterProfileEditContent = () => {
  const { t } = useLanguage();
  const { profileKey } = useParams<{ profileKey: string }>();
  const navigate = useNavigate();
  const profilesQ = useChatterProfiles();
  const update = useUpdateChatterProfile();
  const uploadAvatar = useUploadChatterAvatar();
  const profile = useMemo(
    () => profilesQ.data?.find((p) => p.key === profileKey) ?? null,
    [profilesQ.data, profileKey]
  );
  // Vault items query for the right-bottom Vault section. Same hook the
  // ProfileDetailContent uses, so the same items show up regardless of
  // which screen the admin is on.
  const vaultQ = useChatterVaultByProfile(profile?.id);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<FormState | null>(null);
  // Tracks which label is currently being inline-edited.
  // Encoded as `${fieldKey}__${lang}` so ES and EN are independent.
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  useEffect(() => {
    if (profile) setForm(buildFormState(profile));
  }, [profile]);

  if (profilesQ.isLoading || !form) {
    return (
      <main className="flex-1 p-6">
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="flex-1 p-6">
        <Card className="p-6">
          <p className="text-sm">{t("chatters.profile.notFound")} <code>{profileKey}</code></p>
          <Button asChild variant="ghost" className="mt-4">
            <Link to="/chatter-evaluator"><ArrowLeft className="mr-2 h-4 w-4" /> {t("common.back")}</Link>
          </Button>
        </Card>
      </main>
    );
  }

  const setField = (key: string, val: string) =>
    setForm((s) => (s ? { ...s, fields: { ...s.fields, [key]: val } } : s));

  const setPrice = (idx: number, key: "service" | "price", val: string) =>
    setForm((s) => {
      if (!s) return s;
      const next = [...s.prices];
      next[idx] = { ...next[idx], [key]: val };
      return { ...s, prices: next };
    });

  const addPriceRow = () =>
    setForm((s) =>
      s ? { ...s, prices: [...s.prices, { service: "", price: "" }] } : s
    );

  const removePriceRow = (idx: number) =>
    setForm((s) =>
      s ? { ...s, prices: s.prices.filter((_, i) => i !== idx) } : s
    );

  const setLabelOverride = (
    fieldKey: string,
    lang: "es" | "en",
    val: string,
  ) =>
    setForm((s) => {
      if (!s) return s;
      const current = s.labelOverrides[fieldKey] ?? { es: "", en: "" };
      return {
        ...s,
        labelOverrides: {
          ...s.labelOverrides,
          [fieldKey]: { ...current, [lang]: val },
        },
      };
    });

  const clearLabelOverride = (fieldKey: string) =>
    setForm((s) => {
      if (!s) return s;
      const next = { ...s.labelOverrides };
      delete next[fieldKey];
      return { ...s, labelOverrides: next };
    });

  const setSectionField = (
    idx: number,
    key: keyof CustomSection,
    val: string,
  ) =>
    setForm((s) => {
      if (!s) return s;
      const next = [...s.customSections];
      next[idx] = { ...next[idx], [key]: val };
      return { ...s, customSections: next };
    });

  const addCustomSection = () =>
    setForm((s) =>
      s
        ? {
            ...s,
            customSections: [
              ...s.customSections,
              {
                id: newSectionId(),
                title: "",
                title_en: "",
                value: "",
                value_en: "",
              },
            ],
          }
        : s,
    );

  const removeCustomSection = (idx: number) =>
    setForm((s) =>
      s
        ? {
            ...s,
            customSections: s.customSections.filter((_, i) => i !== idx),
          }
        : s,
    );

  const handleSave = async () => {
    if (!form || !profile) return;
    const patch = buildPatch(form);
    try {
      await update.mutateAsync({ id: profile.id, patch });
      toast.success(t("chatters.profileEdit.saved"), {
        description: t("chatters.profileEdit.savedDesc", { name: form.fields.name || profile.name }),
      });
      navigate(`/chatter-evaluator/${profile.key}`);
    } catch (e) {
      toast.error(t("common.couldNotSave"), {
        description: (e as Error).message,
      });
    }
  };

  const handleAvatarFile = async (file: File) => {
    if (!profile) return;
    try {
      const { url } = await uploadAvatar.mutateAsync({
        profileKey: profile.key,
        file,
      });
      // Update local form state and persist immediately so the URL is saved
      // even if the user navigates away without clicking "Guardar".
      setForm((s) => (s ? { ...s, avatar_url: url } : s));
      await update.mutateAsync({ id: profile.id, patch: { avatar_url: url } });
      toast.success(t("chatters.profileEdit.avatarUpdated"));
    } catch (e) {
      toast.error(t("chatters.profileEdit.avatarUploadFailed"), {
        description: (e as Error).message,
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <main className="flex-1 overflow-y-auto p-6">
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          {/* Use the browser history so we land on whichever screen
              the user came from (admin list, profile detail, or
              elsewhere) instead of always defaulting to the profile
              detail page. Falls back to the detail page if there's
              nothing meaningful to go back to (direct URL load). */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (window.history.length > 1) {
                navigate(-1);
              } else {
                navigate(`/chatter-evaluator/${profile.key}`);
              }
            }}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> {t("common.back")}
          </Button>
          <Button onClick={handleSave} disabled={update.isPending} className="gap-2">
            {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t("chatters.profileEdit.saveChanges")}
          </Button>
        </div>

        <PageHeader
          title={t("chatters.profileEdit.titleN", { name: profile.name })}
          subtitle={t("chatters.profileEdit.subtitle")}
        />

        {/* Avatar section */}
        <Card>
          <CardContent className="space-y-4 p-6">
            <h2 className="text-lg font-semibold">Avatar</h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-[200px_1fr]">
              <div className="group relative aspect-square w-full overflow-hidden rounded-xl bg-muted">
                {form.avatar_url ? (
                  <img
                    src={form.avatar_url}
                    alt=""
                    className="h-full w-full object-cover"
                    style={{
                      objectPosition: `${form.avatar_x}% ${form.avatar_y}%`,
                      transform: `scale(${form.avatar_zoom / 100})`,
                    }}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                    {t("chatters.profileEdit.noAvatar")}
                  </div>
                )}
                {/* Hover overlay → click to upload */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadAvatar.isPending}
                  className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/70 text-white opacity-0 transition-opacity hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-100"
                  aria-label={t("chatters.profileEdit.changeAvatar")}
                >
                  {uploadAvatar.isPending ? (
                    <>
                      <Loader2 className="h-6 w-6 animate-spin" />
                      <span className="text-xs">{t("chatters.profileEdit.uploading")}</span>
                    </>
                  ) : (
                    <>
                      <Camera className="h-6 w-6" />
                      <span className="text-xs">{t("chatters.profileEdit.changePhoto")}</span>
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
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="avatar_url">URL</Label>
                    <Button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadAvatar.isPending}
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 text-xs"
                    >
                      {uploadAvatar.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Upload className="h-3 w-3" />
                      )}
                      {t("chatters.profileEdit.uploadFromDevice")}
                    </Button>
                  </div>
                  <Input
                    id="avatar_url"
                    value={form.avatar_url}
                    onChange={(e) => setForm((s) => (s ? { ...s, avatar_url: e.target.value } : s))}
                    placeholder="https://…/avatar.png"
                  />
                  {form.avatar_url.includes("roleplaychatters.imaginehub.me") && (
                    <p className="mt-1 text-[11px] text-warning/80">
                      {t("chatters.profileEdit.oldServerWarning")}
                    </p>
                  )}
                </div>
                <div>
                  <Label>{t("chatters.profileEdit.positionX", { n: form.avatar_x })}</Label>
                  <Slider
                    value={[form.avatar_x]}
                    onValueChange={([v]) => setForm((s) => (s ? { ...s, avatar_x: v } : s))}
                    min={0}
                    max={100}
                    step={1}
                  />
                </div>
                <div>
                  <Label>{t("chatters.profileEdit.positionY", { n: form.avatar_y })}</Label>
                  <Slider
                    value={[form.avatar_y]}
                    onValueChange={([v]) => setForm((s) => (s ? { ...s, avatar_y: v } : s))}
                    min={0}
                    max={100}
                    step={1}
                  />
                </div>
                <div>
                  <Label>Zoom: {form.avatar_zoom}%</Label>
                  <Slider
                    value={[form.avatar_zoom]}
                    onValueChange={([v]) => setForm((s) => (s ? { ...s, avatar_zoom: v } : s))}
                    min={50}
                    max={300}
                    step={5}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bilingual fields */}
        <Card>
          <CardContent className="space-y-4 p-6">
            <h2 className="text-lg font-semibold">{t("chatters.profile.characterAndRules")}</h2>
            <p className="text-xs text-muted-foreground">
              {t("chatters.profileEdit.renameHelp")}
            </p>
            <div className="space-y-5">
              {BILINGUAL_FIELDS.map((c) => {
                const Cmp = c.type === "textarea" ? Textarea : Input;
                const fieldKey = c.key as string;
                const ov = form.labelOverrides[fieldKey];
                // Etiqueta por defecto de CADA idioma del personaje (no de la interfaz).
                const defaultEs = getTranslation(c.label, "es");
                const defaultEn = getTranslation(c.label, "en");
                const labelEs = ov?.es?.trim() || defaultEs;
                const labelEn = ov?.en?.trim() || defaultEn;

                const renderLabel = (lang: "es" | "en", value: string, valueKey: string) => {
                  const id = `${fieldKey}__${lang}`;
                  const editing = editingLabelId === id;
                  const stopEditing = () => setEditingLabelId(null);
                  return (
                    <div className="mb-1 flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {lang}
                      </Badge>
                      {editing ? (
                        <Input
                          autoFocus
                          value={ov?.[lang] ?? value}
                          onChange={(e) => setLabelOverride(fieldKey, lang, e.target.value)}
                          onBlur={stopEditing}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === "Escape") {
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                          placeholder={lang === "en" ? defaultEn : defaultEs}
                          className="h-7 max-w-[220px] text-sm font-medium"
                        />
                      ) : (
                        <>
                          <Label
                            htmlFor={valueKey}
                            className="text-sm font-medium leading-none"
                          >
                            {value}
                          </Label>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setEditingLabelId(id)}
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            aria-label={t("chatters.profileEdit.renameLabel", { idioma: lang.toUpperCase() })}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  );
                };

                const hasOverride = !!ov;

                return (
                  <div key={c.key} className="space-y-1">
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      <div>
                        {renderLabel("es", labelEs, fieldKey)}
                        <Cmp
                          id={fieldKey}
                          value={form.fields[c.key as string] ?? ""}
                          onChange={(e) => setField(c.key as string, e.target.value)}
                          rows={c.type === "textarea" ? 3 : undefined}
                        />
                      </div>
                      <div>
                        {renderLabel("en", labelEn, c.keyEn as string)}
                        <Cmp
                          id={c.keyEn as string}
                          value={form.fields[c.keyEn as string] ?? ""}
                          onChange={(e) => setField(c.keyEn as string, e.target.value)}
                          rows={c.type === "textarea" ? 3 : undefined}
                        />
                      </div>
                    </div>
                    {hasOverride && (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => clearLabelOverride(fieldKey)}
                          className="text-[10px] text-muted-foreground hover:text-foreground"
                        >
                          {t("chatters.profileEdit.restoreLabel")}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Custom sections — same add/remove pattern as Catálogo de precios.
            Stored in extra_fields under __customSections; rendered by the
            chatter and examiner panels alongside the built-in cards. */}
        <Card>
          <CardContent className="space-y-3 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t("chatters.profileEdit.customSections")}</h2>
              <Button
                onClick={addCustomSection}
                size="sm"
                variant="outline"
                className="gap-1"
              >
                <Plus className="h-4 w-4" /> {t("chatters.profileEdit.addSection")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("chatters.profileEdit.customSectionsHelp")}
            </p>
            {form.customSections.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t("chatters.profileEdit.noCustomSections")}
              </p>
            )}
            {form.customSections.map((s, i) => (
              <div
                key={s.id}
                className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs font-semibold text-muted-foreground">
                    {t("chatters.profileEdit.sectionN", { n: i + 1 })}
                  </Label>
                  <Button
                    onClick={() => removeCustomSection(i)}
                    size="icon"
                    variant="ghost"
                    aria-label={t("chatters.profileEdit.deleteSection")}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div>
                  <div className="mb-1 text-xs text-muted-foreground">{t("common.title")}</div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <div>
                      <div className="mb-1 flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px] uppercase">ES</Badge>
                      </div>
                      <Input
                        value={s.title}
                        placeholder={t("chatters.profileEdit.titleEsPh")}
                        onChange={(e) => setSectionField(i, "title", e.target.value)}
                      />
                    </div>
                    <div>
                      <div className="mb-1 flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px] uppercase">EN</Badge>
                      </div>
                      <Input
                        value={s.title_en}
                        placeholder={t("chatters.profileEdit.titleEnPh")}
                        onChange={(e) => setSectionField(i, "title_en", e.target.value)}
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-xs text-muted-foreground">{t("chatters.profileEdit.content")}</div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <div>
                      <div className="mb-1 flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px] uppercase">ES</Badge>
                      </div>
                      <Textarea
                        value={s.value}
                        placeholder={t("chatters.profileEdit.contentEsPh")}
                        rows={3}
                        onChange={(e) => setSectionField(i, "value", e.target.value)}
                      />
                    </div>
                    <div>
                      <div className="mb-1 flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px] uppercase">EN</Badge>
                      </div>
                      <Textarea
                        value={s.value_en}
                        placeholder={t("chatters.profileEdit.contentEnPh")}
                        rows={3}
                        onChange={(e) => setSectionField(i, "value_en", e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Pricing */}
        <Card>
          <CardContent className="space-y-3 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t("chatters.profile.priceList")}</h2>
              <Button onClick={addPriceRow} size="sm" variant="outline" className="gap-1">
                <Plus className="h-4 w-4" /> {t("common.add")}
              </Button>
            </div>
            {form.prices.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("chatters.profileEdit.noPrices")}</p>
            )}
            {form.prices.map((p, i) => (
              <div key={i} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_180px_auto]">
                <Input
                  value={p.service}
                  placeholder={t("chatters.profileEdit.servicePh")}
                  onChange={(e) => setPrice(i, "service", e.target.value)}
                />
                <Input
                  value={p.price}
                  placeholder={t("chatters.profileEdit.pricePh")}
                  onChange={(e) => setPrice(i, "price", e.target.value)}
                />
                <Button
                  onClick={() => removePriceRow(i)}
                  size="icon"
                  variant="ghost"
                  aria-label={t("chatters.profileEdit.deleteRow")}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Vault — mirrors the original Roleplaychatters admin edit
            screen (index.html line 1264 "Vault - Contenido precargado").
            Drag/drop to upload, click to open lightbox, ✕ to remove. */}
        {profile && (
          <Card>
            <CardContent className="p-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  Vault ({vaultQ.isLoading ? "…" : vaultQ.data?.length ?? 0})
                </h2>
                <p className="text-xs text-muted-foreground">
                  {t("chatters.profileEdit.vaultHelp")}
                </p>
              </div>
              {vaultQ.isLoading ? (
                <p className="text-sm text-muted-foreground">{t("chatters.profile.loadingVault")}</p>
              ) : (
                <VaultGallery
                  items={vaultQ.data ?? []}
                  profileId={profile.id}
                  profileKey={profile.key}
                  editable
                />
              )}
            </CardContent>
          </Card>
        )}

        {/* Bottom save */}
        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={update.isPending} className="gap-2">
            {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t("chatters.profileEdit.saveChanges")}
          </Button>
        </div>
      </div>
    </main>
  );
};

export default ChatterProfileEditContent;
