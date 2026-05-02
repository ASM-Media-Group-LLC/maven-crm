import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Save, Plus, X, Loader2, Camera, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  useChatterProfiles,
  useUpdateChatterProfile,
  useUploadChatterAvatar,
  useChatterVaultByProfile,
  type ChatterProfileUpdate,
} from "@/hooks/useChatterEvaluator";
import { VaultGallery } from "./VaultGallery";
import type { ChatterProfile } from "./types";

interface BilingualConfig {
  key: keyof ChatterProfile;
  keyEn: keyof ChatterProfile;
  label: string;
  type: "input" | "textarea";
}

const BILINGUAL_FIELDS: BilingualConfig[] = [
  { key: "name",        keyEn: "name_en",        label: "Nombre",            type: "input" },
  { key: "nationality", keyEn: "nationality_en", label: "Nacionalidad",      type: "input" },
  { key: "location",    keyEn: "location_en",    label: "Ubicación",         type: "input" },
  { key: "age",         keyEn: "age_en",         label: "Edad",              type: "input" },
  { key: "greeting",    keyEn: "greeting_en",    label: "Saludo",            type: "textarea" },
  { key: "users_term",  keyEn: "users_term_en",  label: "Trato a usuarios",  type: "textarea" },
  { key: "body",        keyEn: "body_en",        label: "Cuerpo",            type: "input" },
  { key: "nudity",      keyEn: "nudity_en",      label: "Desnudez",          type: "input" },
  { key: "anal",        keyEn: "anal_en",        label: "Anal",              type: "input" },
  { key: "collabs",     keyEn: "collabs_en",     label: "Colaboraciones",    type: "textarea" },
  { key: "videocall",   keyEn: "videocall_en",   label: "Videollamadas",     type: "textarea" },
  { key: "custom",      keyEn: "custom_en",      label: "Customs",           type: "textarea" },
  { key: "extra",       keyEn: "extra_en",       label: "Reglas extra",      type: "textarea" },
];

type FormState = {
  fields: Record<string, string>;
  prices: { service: string; price: string }[];
  avatar_url: string;
  avatar_x: number;
  avatar_y: number;
  avatar_zoom: number;
};

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
  return patch as ChatterProfileUpdate;
};

const ChatterProfileEditContent = () => {
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
  useEffect(() => {
    if (profile) setForm(buildFormState(profile));
  }, [profile]);

  if (profilesQ.isLoading || !form) {
    return (
      <main className="flex-1 p-6">
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="flex-1 p-6">
        <Card className="p-6">
          <p className="text-sm">Perfil no encontrado: <code>{profileKey}</code></p>
          <Button asChild variant="ghost" className="mt-4">
            <Link to="/chatter-evaluator"><ArrowLeft className="mr-2 h-4 w-4" /> Volver</Link>
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

  const handleSave = async () => {
    if (!form || !profile) return;
    const patch = buildPatch(form);
    try {
      await update.mutateAsync({ id: profile.id, patch });
      toast.success("Perfil guardado", {
        description: `${form.fields.name || profile.name} actualizado correctamente.`,
      });
      navigate(`/chatter-evaluator/${profile.key}`);
    } catch (e) {
      toast.error("No se pudo guardar", {
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
      toast.success("Avatar actualizado");
    } catch (e) {
      toast.error("No se pudo subir el avatar", {
        description: (e as Error).message,
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <main className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-5xl space-y-6">
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
            <ArrowLeft className="mr-2 h-4 w-4" /> Volver
          </Button>
          <Button onClick={handleSave} disabled={update.isPending} className="gap-2">
            {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar cambios
          </Button>
        </div>

        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Editar: {profile.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            Estos cambios afectan a TODOS los examiners — perfiles son recursos compartidos.
          </p>
        </div>

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
                    sin avatar
                  </div>
                )}
                {/* Hover overlay → click to upload */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadAvatar.isPending}
                  className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/70 text-white opacity-0 transition-opacity hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-100"
                  aria-label="Cambiar avatar"
                >
                  {uploadAvatar.isPending ? (
                    <>
                      <Loader2 className="h-6 w-6 animate-spin" />
                      <span className="text-xs">Subiendo…</span>
                    </>
                  ) : (
                    <>
                      <Camera className="h-6 w-6" />
                      <span className="text-xs">Cambiar foto</span>
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
                      Subir desde dispositivo
                    </Button>
                  </div>
                  <Input
                    id="avatar_url"
                    value={form.avatar_url}
                    onChange={(e) => setForm((s) => (s ? { ...s, avatar_url: e.target.value } : s))}
                    placeholder="https://…/avatar.png"
                  />
                  {form.avatar_url.includes("roleplaychatters.imaginehub.me") && (
                    <p className="mt-1 text-[11px] text-amber-500/80">
                      ⚠ Este avatar todavía está alojado en el servidor anterior. Sube uno nuevo
                      para que pase a tu Storage propio.
                    </p>
                  )}
                </div>
                <div>
                  <Label>Posición X: {form.avatar_x}%</Label>
                  <Slider
                    value={[form.avatar_x]}
                    onValueChange={([v]) => setForm((s) => (s ? { ...s, avatar_x: v } : s))}
                    min={0}
                    max={100}
                    step={1}
                  />
                </div>
                <div>
                  <Label>Posición Y: {form.avatar_y}%</Label>
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
            <h2 className="text-lg font-semibold">Personaje y reglas</h2>
            <div className="space-y-5">
              {BILINGUAL_FIELDS.map((c) => {
                const Cmp = c.type === "textarea" ? Textarea : Input;
                return (
                  <div key={c.key} className="space-y-1">
                    <Label className="text-sm font-medium">{c.label}</Label>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      <div>
                        <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline" className="text-[10px]">ES</Badge>
                        </div>
                        <Cmp
                          value={form.fields[c.key as string] ?? ""}
                          onChange={(e) => setField(c.key as string, e.target.value)}
                          rows={c.type === "textarea" ? 3 : undefined}
                        />
                      </div>
                      <div>
                        <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline" className="text-[10px]">EN</Badge>
                        </div>
                        <Cmp
                          value={form.fields[c.keyEn as string] ?? ""}
                          onChange={(e) => setField(c.keyEn as string, e.target.value)}
                          rows={c.type === "textarea" ? 3 : undefined}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Pricing */}
        <Card>
          <CardContent className="space-y-3 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Catálogo de precios</h2>
              <Button onClick={addPriceRow} size="sm" variant="outline" className="gap-1">
                <Plus className="h-4 w-4" /> Agregar
              </Button>
            </div>
            {form.prices.length === 0 && (
              <p className="text-sm text-muted-foreground">Sin precios todavía.</p>
            )}
            {form.prices.map((p, i) => (
              <div key={i} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_180px_auto]">
                <Input
                  value={p.service}
                  placeholder="Nombre del servicio (ej. Dick Rating)"
                  onChange={(e) => setPrice(i, "service", e.target.value)}
                />
                <Input
                  value={p.price}
                  placeholder="Precio (ej. $35)"
                  onChange={(e) => setPrice(i, "price", e.target.value)}
                />
                <Button
                  onClick={() => removePriceRow(i)}
                  size="icon"
                  variant="ghost"
                  aria-label="Eliminar fila"
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
                  Contenido precargado del personaje (fotos / videos).
                </p>
              </div>
              {vaultQ.isLoading ? (
                <p className="text-sm text-muted-foreground">Cargando vault…</p>
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
            Guardar cambios
          </Button>
        </div>
      </div>
    </main>
  );
};

export default ChatterProfileEditContent;
