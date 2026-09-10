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
import {
  useCreateChatterProfile,
  useUploadChatterAvatar,
} from "@/hooks/useChatterEvaluator";

// Same bilingual fields as the existing ProfileEditContent so admins
// see exactly the same shape they would see when editing later.
const BILINGUAL_FIELDS: { key: string; keyEn: string; label: string; type: "input" | "textarea" }[] = [
  { key: "name",        keyEn: "name_en",        label: "Nombre",            type: "input" },
  { key: "nationality", keyEn: "nationality_en", label: "Nacionalidad",      type: "input" },
  { key: "location",    keyEn: "location_en",    label: "Ubicación",         type: "input" },
  { key: "age",         keyEn: "age_en",         label: "Edad",              type: "input" },
  { key: "users_term",  keyEn: "users_term_en",  label: "Trato a usuarios",  type: "textarea" },
  { key: "greeting",    keyEn: "greeting_en",    label: "Saludo",            type: "textarea" },
  { key: "body",        keyEn: "body_en",        label: "Cuerpo",            type: "input" },
  { key: "nudity",      keyEn: "nudity_en",      label: "Desnudez",          type: "input" },
  { key: "anal",        keyEn: "anal_en",        label: "Anal",              type: "input" },
  { key: "collabs",     keyEn: "collabs_en",     label: "Colaboraciones",    type: "textarea" },
  { key: "videocall",   keyEn: "videocall_en",   label: "Videollamadas",     type: "textarea" },
  { key: "custom",      keyEn: "custom_en",      label: "Customs",           type: "textarea" },
  { key: "extra",       keyEn: "extra_en",       label: "Reglas extra",      type: "textarea" },
];

const DEFAULT_PRICE_KEYS = ["X", "XX", "XXX", "ANAL"];

interface NewProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const NewProfileDialog = ({ open, onOpenChange }: NewProfileDialogProps) => {
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
      toast.error("Pon la clave interna primero", {
        description: "Necesito una clave para guardar la imagen en el folder correcto.",
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
      toast.error("No se pudo subir el avatar", {
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
      toast.error("Ese campo ya existe");
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
      toast.error("Ese precio ya existe");
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
      toast.error("La clave interna es obligatoria");
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
      toast.success("Modelo creado");
      onOpenChange(false);
      navigate(`/chatter-evaluator/${created.key}/edit`);
    } catch (e) {
      toast.error("No se pudo crear", { description: (e as Error).message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" /> Nuevo modelo
          </DialogTitle>
          <DialogDescription>
            Crea un nuevo perfil para evaluar chatters. Después de crearlo
            podrás agregar el vault de contenido.
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
                  aria-label="Subir avatar"
                >
                  {uploadAvatar.isPending ? (
                    <>
                      <Loader2 className="h-6 w-6 animate-spin" />
                      <span className="text-xs">Subiendo…</span>
                    </>
                  ) : (
                    <>
                      <Camera className="h-7 w-7" />
                      <span className="text-xs">{avatarUrl ? "Cambiar foto" : "Subir foto"}</span>
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
                Pasa el cursor sobre la imagen para subir desde tu dispositivo.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <Label htmlFor="profile_key" className="text-xs">
                  Clave interna <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="profile_key"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="ej: katrina"
                  className="mt-1 font-mono"
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Sin espacios; se usa como identificador en URLs y en la base de datos.
                </p>
              </div>

              {/* Framing sliders — only useful once an image is loaded */}
              <div className={avatarUrl ? "" : "opacity-50 pointer-events-none"}>
                <div>
                  <Label className="text-xs">Posición X: {avatarX}%</Label>
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
                  <Label className="text-xs">Posición Y: {avatarY}%</Label>
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
            <div className="text-sm font-semibold">Personaje y reglas</div>
            {BILINGUAL_FIELDS.map((f) => {
              const Cmp = f.type === "textarea" ? Textarea : Input;
              return (
                <div key={f.key} className="space-y-1">
                  <Label className="text-xs font-medium">{f.label}</Label>
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
              Información relevante (opcional)
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
                        aria-label={`Quitar ${f.label}`}
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
                placeholder="Nombre del campo"
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addExtraField())}
              />
              <Button type="button" variant="outline" onClick={addExtraField} className="gap-1">
                <Plus className="h-4 w-4" /> Agregar
              </Button>
            </div>
          </div>

          {/* Prices */}
          <div className="rounded-md border border-warning/40 bg-warning/5 p-3">
            <div className="mb-2 text-xs font-semibold text-warning">Precios</div>
            <div className="space-y-2">
              {prices.map((p) => (
                <div key={p.key} className="flex items-center gap-2">
                  <span className="w-20 shrink-0 font-mono text-xs font-bold text-warning">
                    {p.key}
                  </span>
                  <Input
                    value={p.value}
                    onChange={(e) => updatePrice(p.key, e.target.value)}
                    placeholder="Ej: $50"
                    className="flex-1"
                  />
                  {!DEFAULT_PRICE_KEYS.includes(p.key) && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => removePrice(p.key)}
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      aria-label={`Quitar ${p.key}`}
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
                placeholder="Ej: CUSTOM"
                className="max-w-[150px] font-mono"
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addPriceRow())}
              />
              <Button type="button" variant="outline" onClick={addPriceRow} className="gap-1">
                <Plus className="h-4 w-4" /> Agregar precio
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!key.trim() || create.isPending}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700"
          >
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Crear modelo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewProfileDialog;
