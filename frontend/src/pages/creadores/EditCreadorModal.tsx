import { useState, useEffect } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUpdateCreador } from "./useCreadores";
import { toast } from "@/hooks/use-toast";
import type { CreatorWithBusiness } from "./useCreadores";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creator: CreatorWithBusiness;
}

const CATEGORIES = ["A+", "A", "B+", "B", "C"] as const;

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Editar Creador</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="grid grid-cols-2 gap-4 py-4">
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
            <div className="space-y-1.5">
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
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-medium">Redes Sociales</h4>
            <div className="grid grid-cols-2 gap-4">
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
          </div>

          <div className="space-y-1.5 mt-4">
            <Label>Biografía</Label>
            <Textarea value={form.bio} onChange={(e) => handleChange("bio", e.target.value)} placeholder="Breve descripción del creador..." rows={3} />
          </div>
        </ScrollArea>

        <DialogFooter>
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
