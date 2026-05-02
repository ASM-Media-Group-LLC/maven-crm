import { useEffect, useState } from "react";
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
import { Loader2, Plus, X, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useCreateChatterProfile } from "@/hooks/useChatterEvaluator";

// Default fields the original Roleplaychatters seeds the new-model form
// with (index.html line 4887). Same keys, same labels in Spanish — admins
// who used the old tool find exactly what they expect.
const DEFAULT_FIELDS: { key: string; label: string; multiline?: boolean }[] = [
  { key: "name",        label: "Nombre" },
  { key: "nationality", label: "Nacionalidad" },
  { key: "location",    label: "Ubicación" },
  { key: "age",         label: "Edad" },
  { key: "users_term",  label: "Cómo llamar al usuario" },
  { key: "greeting",    label: "Saludo inicial", multiline: true },
  { key: "body",        label: "Cuerpo / términos", multiline: true },
  { key: "nudity",      label: "Desnudos", multiline: true },
  { key: "anal",        label: "Anal" },
  { key: "collabs",     label: "Colaboraciones" },
  { key: "videocall",   label: "Videollamadas" },
  { key: "custom",      label: "Personalizados" },
  { key: "extra",       label: "Información importante", multiline: true },
];

const DEFAULT_PRICE_KEYS = ["X", "XX", "XXX", "ANAL"];

interface NewProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const NewProfileDialog = ({ open, onOpenChange }: NewProfileDialogProps) => {
  const navigate = useNavigate();
  const create = useCreateChatterProfile();

  const [key, setKey] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  // Prices keyed by label (X, XX, ...). Order preserved via insertion.
  const [prices, setPrices] = useState<{ key: string; value: string }[]>([]);
  const [newPriceKey, setNewPriceKey] = useState("");
  const [extraFieldKey, setExtraFieldKey] = useState("");
  const [extraFields, setExtraFields] = useState<{ key: string; label: string; value: string }[]>([]);

  // Reset on open so reopening after a save shows a clean form.
  useEffect(() => {
    if (!open) return;
    setKey("");
    setAvatarUrl("");
    setFields({});
    setPrices(DEFAULT_PRICE_KEYS.map((k) => ({ key: k, value: "" })));
    setNewPriceKey("");
    setExtraFieldKey("");
    setExtraFields([]);
  }, [open]);

  const updateField = (k: string, v: string) =>
    setFields((curr) => ({ ...curr, [k]: v }));

  const addExtraField = () => {
    const k = extraFieldKey.trim();
    if (!k) return;
    const slug = k.toLowerCase().replace(/[^a-z0-9_]+/g, "_");
    if (extraFields.find((f) => f.key === slug)) {
      toast.error("Ese campo ya existe");
      return;
    }
    setExtraFields((curr) => [...curr, { key: slug, label: k, value: "" }]);
    setExtraFieldKey("");
  };
  const updateExtra = (slug: string, v: string) =>
    setExtraFields((curr) => curr.map((f) => (f.key === slug ? { ...f, value: v } : f)));
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

    // Build the final patch — only send keys that have something so we
    // don't overwrite the schema's defaults with empty strings.
    const patch: Record<string, unknown> = { key: cleanKey };
    for (const f of DEFAULT_FIELDS) {
      const v = fields[f.key]?.trim();
      if (v) patch[f.key] = v;
    }
    if (avatarUrl.trim()) patch.avatar_url = avatarUrl.trim();

    // Prices: drop blanks, fill missing with "—" so the chatter view
    // shows something when an admin set the row but left the value
    // empty (matches the original `value || '—'` behavior).
    const filledPrices = prices.filter((p) => p.value.trim());
    if (filledPrices.length > 0) {
      patch.prices = Object.fromEntries(filledPrices.map((p) => [p.key, p.value.trim()]));
    }

    // Extra fields stash inside extra_fields jsonb so they survive
    // independent of the canonical columns.
    const filledExtras = extraFields.filter((f) => f.value.trim());
    if (filledExtras.length > 0) {
      patch.extra_fields = Object.fromEntries(
        filledExtras.map((f) => [f.key, { label: f.label, value: f.value.trim() }]),
      );
    }

    try {
      const created = await create.mutateAsync(patch as Parameters<typeof create.mutateAsync>[0]);
      toast.success("Modelo creado");
      onOpenChange(false);
      // Drop the admin into the new model's edit/profile screen so
      // they can keep filling vault items, EN translations, etc.
      navigate(`/chatter-evaluator/${created.key}/edit`);
    } catch (e) {
      toast.error("No se pudo crear", { description: (e as Error).message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" /> Nuevo modelo
          </DialogTitle>
          <DialogDescription>
            Crea un nuevo perfil para evaluar chatters. Después de crearlo
            podrás agregar el vault de contenido y traducciones EN en la
            pantalla de edición.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Key + avatar */}
          <div className="flex items-start gap-4 border-b pb-4">
            <div className="aspect-square h-[70px] w-[70px] shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-purple-600 to-amber-500 ring-2 ring-card">
              {avatarUrl ? (
                <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-white">
                  ?
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <Label htmlFor="profile_key" className="text-xs">
                  Clave interna <span className="text-rose-400">*</span>
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
              <div>
                <Label htmlFor="profile_avatar" className="text-xs">Avatar URL (opcional)</Label>
                <Input
                  id="profile_avatar"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://… o pega URL"
                  className="mt-1"
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Para subir desde tu PC, crea el modelo y desde la pantalla de edición usa el botón Subir.
                </p>
              </div>
            </div>
          </div>

          {/* Default fields */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {DEFAULT_FIELDS.map((f) => (
              <div key={f.key} className={f.multiline ? "md:col-span-2" : ""}>
                <Label htmlFor={`f_${f.key}`} className="text-xs">{f.label}</Label>
                {f.multiline ? (
                  <Textarea
                    id={`f_${f.key}`}
                    value={fields[f.key] ?? ""}
                    onChange={(e) => updateField(f.key, e.target.value)}
                    rows={2}
                    className="mt-1"
                  />
                ) : (
                  <Input
                    id={`f_${f.key}`}
                    value={fields[f.key] ?? ""}
                    onChange={(e) => updateField(f.key, e.target.value)}
                    className="mt-1"
                  />
                )}
              </div>
            ))}
          </div>

          {/* Extra fields */}
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="mb-2 text-xs font-semibold text-muted-foreground">
              Información relevante (opcional)
            </div>
            {extraFields.length > 0 && (
              <div className="mb-2 space-y-2">
                {extraFields.map((f) => (
                  <div key={f.key} className="flex items-center gap-2">
                    <span className="w-32 shrink-0 truncate text-xs text-muted-foreground">{f.label}</span>
                    <Input
                      value={f.value}
                      onChange={(e) => updateExtra(f.key, e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => removeExtra(f.key)}
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      aria-label={`Quitar ${f.label}`}
                    >
                      <X className="h-3 w-3" />
                    </Button>
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
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
            <div className="mb-2 text-xs font-semibold text-amber-500">Precios</div>
            <div className="space-y-2">
              {prices.map((p) => (
                <div key={p.key} className="flex items-center gap-2">
                  <span className="w-20 shrink-0 font-mono text-xs font-bold text-amber-500">
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
