import { useState, useEffect } from "react";
import { ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUpdateCreador } from "./useCreadores";
import { toast } from "@/hooks/use-toast";
import { buildSocialUrl } from "@/lib/utils";
import { useModelCategories } from "@/hooks/useModelCategories";
import type { CreatorWithBusiness } from "./useCreadores";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creator: CreatorWithBusiness;
}

// Fallback estático sólo si model_categories todavía no cargó.
// Fuente real: useModelCategories() → tabla canónica model_categories.
const CATEGORIES_FALLBACK = ["Elite", "A+", "A", "B+", "B", "C+", "C"] as const;

const EditCreadorModal = ({ open, onOpenChange, creator }: Props) => {
  const [form, setForm] = useState({
    name: "",
    artistic_name: "",
    email: "",
    phone: "",
    country: "",
    city: "",
    category: "",
    instagram_handle: "",
    tiktok_handle: "",
    twitter_handle: "",
    youtube_handle: "",
    onlyfans_url: "",
    whatsapp_number: "",
    bio: "",
  });
  const [nameError, setNameError] = useState(false);
  const updateMutation = useUpdateCreador();
  const { data: categories = [] } = useModelCategories();
  const CATEGORIES = categories.length > 0 ? categories.map((c) => c.code) : CATEGORIES_FALLBACK;

  useEffect(() => {
    if (open && creator) {
      setForm({
        name: creator.name ?? "",
        artistic_name: creator.artistic_name ?? "",
        email: creator.email ?? "",
        phone: creator.phone ?? "",
        country: creator.country ?? "",
        city: creator.city ?? "",
        category: creator.category ?? "",
        instagram_handle: creator.instagram_handle ?? "",
        tiktok_handle: creator.tiktok_handle ?? "",
        twitter_handle: creator.twitter_handle ?? "",
        youtube_handle: creator.youtube_handle ?? "",
        onlyfans_url: creator.onlyfans_url ?? "",
        whatsapp_number: creator.whatsapp_number ?? "",
        bio: creator.bio ?? "",
      });
      setNameError(false);
    }
  }, [open, creator]);

  const handleChange = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === "name") setNameError(false);
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      setNameError(true);
      return;
    }
    updateMutation.mutate(
      {
        id: creator.id,
        data: {
          name: form.name.trim(),
          artistic_name: form.artistic_name.trim() || null,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          country: form.country.trim() || null,
          city: form.city.trim() || null,
          category: form.category || null,
          instagram_handle: form.instagram_handle.trim() || null,
          tiktok_handle: form.tiktok_handle.trim() || null,
          twitter_handle: form.twitter_handle.trim() || null,
          youtube_handle: form.youtube_handle.trim() || null,
          onlyfans_url: form.onlyfans_url.trim() || null,
          whatsapp_number: form.whatsapp_number.trim() || null,
          bio: form.bio.trim() || null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Creador actualizado correctamente" });
          onOpenChange(false);
        },
        onError: (err) => {
          toast({ title: "Error al actualizar", description: String(err), variant: "destructive" });
        },
      }
    );
  };

  // Identity bits para el header del modal.
  const displayName = creator.artistic_name || creator.name || "Creadora";
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const igUrl = buildSocialUrl("instagram", creator.instagram_handle);

  // Sub-componente: nombre como link a IG si existe; sino texto plano.
  // External icon solo cuando el link existe.
  const NameLink = () =>
    igUrl ? (
      <a
        href={igUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-primary"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="truncate">{displayName}</span>
        <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
      </a>
    ) : (
      <span className="text-sm text-muted-foreground truncate">{displayName}</span>
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* DialogContent en flex column con max-h, scroll en el área central
          y footer pegado abajo — el cambio clave que arregla el textarea
          de Bio que antes se comía con el footer. */}
      <DialogContent className="sm:max-w-[620px] max-h-[85vh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/60 space-y-3">
          <div className="flex items-center gap-3">
            {/* Avatar — clickeable al perfil de IG (si tiene handle). */}
            {igUrl ? (
              <a
                href={igUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 group"
                onClick={(e) => e.stopPropagation()}
              >
                <Avatar className="h-14 w-14 ring-2 ring-border transition-all group-hover:ring-primary/50">
                  {creator.profile_photo_url && (
                    <AvatarImage src={creator.profile_photo_url} alt={displayName} />
                  )}
                  <AvatarFallback className="text-sm font-semibold">{initials}</AvatarFallback>
                </Avatar>
              </a>
            ) : (
              <Avatar className="h-14 w-14 shrink-0 ring-2 ring-border">
                {creator.profile_photo_url && (
                  <AvatarImage src={creator.profile_photo_url} alt={displayName} />
                )}
                <AvatarFallback className="text-sm font-semibold">{initials}</AvatarFallback>
              </Avatar>
            )}
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-lg">Editar Creador</DialogTitle>
              <div className="mt-0.5">
                <NameLink />
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Área scrollable. flex-1 lo deja consumir el espacio sobrante
            entre header y footer; overflow-y-auto activa el scroll real. */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Nombre *</Label>
              <Input
                value={form.name}
                onChange={(e) => handleChange("name", e.target.value)}
                className={nameError ? "border-destructive" : ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Nombre Artístico</Label>
              <Input value={form.artistic_name} onChange={(e) => handleChange("artistic_name", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => handleChange("email", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Teléfono</Label>
              <Input value={form.phone} onChange={(e) => handleChange("phone", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>País</Label>
              <Input value={form.country} onChange={(e) => handleChange("country", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Ciudad</Label>
              <Input value={form.city} onChange={(e) => handleChange("city", e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Categoría</Label>
              <Select value={form.category} onValueChange={(v) => handleChange("category", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          <section className="space-y-3 pt-2 border-t border-border/60">
            <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/70 pt-3">Redes Sociales</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Instagram</Label>
                <Input value={form.instagram_handle} onChange={(e) => handleChange("instagram_handle", e.target.value)} placeholder="@usuario" />
              </div>
              <div className="space-y-1.5">
                <Label>Twitter/X</Label>
                <Input value={form.twitter_handle} onChange={(e) => handleChange("twitter_handle", e.target.value)} placeholder="@usuario" />
              </div>
              <div className="space-y-1.5">
                <Label>TikTok</Label>
                <Input value={form.tiktok_handle} onChange={(e) => handleChange("tiktok_handle", e.target.value)} placeholder="@usuario" />
              </div>
              <div className="space-y-1.5">
                <Label>YouTube</Label>
                <Input value={form.youtube_handle} onChange={(e) => handleChange("youtube_handle", e.target.value)} placeholder="@canal" />
              </div>
              <div className="space-y-1.5">
                <Label>OnlyFans URL</Label>
                <Input value={form.onlyfans_url} onChange={(e) => handleChange("onlyfans_url", e.target.value)} placeholder="https://onlyfans.com/..." />
              </div>
              <div className="space-y-1.5">
                <Label>WhatsApp</Label>
                <Input value={form.whatsapp_number} onChange={(e) => handleChange("whatsapp_number", e.target.value)} placeholder="+1 234 567 8900" />
              </div>
            </div>
          </section>

          <section className="space-y-1.5 pt-2 border-t border-border/60">
            <h4 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/70 pt-3">Biografía</h4>
            <Textarea
              value={form.bio}
              onChange={(e) => handleChange("bio", e.target.value)}
              placeholder="Breve descripción del creador..."
              rows={3}
            />
          </section>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border/60 bg-card">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? "Guardando..." : "Guardar Cambios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditCreadorModal;
