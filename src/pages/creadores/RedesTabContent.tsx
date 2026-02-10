import { useState } from "react";
import { Edit, Save, X, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import InstagramIcon from "@/components/icons/InstagramIcon";
import TikTokIcon from "@/components/icons/TikTokIcon";
import XIcon from "@/components/icons/XIcon";
import { displayHandle } from "@/lib/utils";
import type { CreatorFull } from "./useCreadores";

interface RedesTabContentProps {
  creator: CreatorFull;
  creatorId: string;
}

interface EditData {
  instagram_handle: string;
  tiktok_handle: string;
  twitter_handle: string;
  youtube_handle: string;
  onlyfans_url: string;
  whatsapp_number: string;
}

interface PlatformConfig {
  key: keyof EditData;
  label: string;
  icon: React.ReactNode;
  placeholder: string;
  displayValue: (creator: CreatorFull) => string;
}

const platforms: PlatformConfig[] = [
  {
    key: "instagram_handle",
    label: "Instagram",
    icon: <InstagramIcon className="h-5 w-5" />,
    placeholder: "@usuario",
    displayValue: (c) => displayHandle(c.instagram_handle) || "—",
  },
  {
    key: "tiktok_handle",
    label: "TikTok",
    icon: <TikTokIcon className="h-5 w-5" />,
    placeholder: "@usuario",
    displayValue: (c) => displayHandle(c.tiktok_handle) || "—",
  },
  {
    key: "twitter_handle",
    label: "X (Twitter)",
    icon: <XIcon className="h-5 w-5" />,
    placeholder: "@usuario",
    displayValue: (c) => displayHandle(c.twitter_handle) || "—",
  },
  {
    key: "youtube_handle",
    label: "YouTube",
    icon: <span className="text-xs font-bold">YT</span>,
    placeholder: "@canal",
    displayValue: (c) => displayHandle(c.youtube_handle) || "—",
  },
  {
    key: "onlyfans_url",
    label: "OnlyFans",
    icon: <span className="text-xs font-bold">OF</span>,
    placeholder: "https://onlyfans.com/...",
    displayValue: (c) => c.onlyfans_url || "—",
  },
  {
    key: "whatsapp_number",
    label: "WhatsApp",
    icon: <Phone className="h-5 w-5" />,
    placeholder: "+1234567890",
    displayValue: (c) => c.whatsapp_number || "—",
  },
];

const RedesTabContent = ({ creator, creatorId }: RedesTabContentProps) => {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editData, setEditData] = useState<EditData>({
    instagram_handle: "",
    tiktok_handle: "",
    twitter_handle: "",
    youtube_handle: "",
    onlyfans_url: "",
    whatsapp_number: "",
  });

  const startEditing = () => {
    setEditData({
      instagram_handle: creator.instagram_handle ?? "",
      tiktok_handle: creator.tiktok_handle ?? "",
      twitter_handle: creator.twitter_handle ?? "",
      youtube_handle: creator.youtube_handle ?? "",
      onlyfans_url: creator.onlyfans_url ?? "",
      whatsapp_number: creator.whatsapp_number ?? "",
    });
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    toast("Edición cancelada");
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("creators")
        .update({
          instagram_handle: editData.instagram_handle || null,
          tiktok_handle: editData.tiktok_handle || null,
          twitter_handle: editData.twitter_handle || null,
          youtube_handle: editData.youtube_handle || null,
          onlyfans_url: editData.onlyfans_url || null,
          whatsapp_number: editData.whatsapp_number || null,
        })
        .eq("id", creatorId);

      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: ["creator", creatorId] });
      setIsEditing(false);
      toast.success("Redes actualizadas");
    } catch {
      toast.error("Error al guardar redes");
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof EditData, value: string) => {
    setEditData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <>
      <div className="flex items-center justify-between mt-4 mb-2">
        <div>
          <h2 className="text-lg font-semibold">Redes Sociales</h2>
          <p className="text-sm text-muted-foreground">Enlaces a perfiles en redes sociales</p>
        </div>
        {!isEditing ? (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={startEditing}>
            <Edit className="h-3.5 w-3.5" /> Editar
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={cancelEditing} disabled={saving}>
              <X className="h-3.5 w-3.5 mr-1" /> Cancelar
            </Button>
            <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={saving}>
              <Save className="h-3.5 w-3.5" /> {saving ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-5 space-y-1">
        {platforms.map((platform) => (
          <div key={platform.key} className="flex items-center gap-4 py-3">
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
              {platform.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{platform.label}</p>
              {isEditing ? (
                <Input
                  className="h-8 text-sm mt-1"
                  value={editData[platform.key]}
                  onChange={(e) => updateField(platform.key, e.target.value)}
                  placeholder={platform.placeholder}
                />
              ) : (
                <p className="text-sm text-muted-foreground truncate">
                  {platform.displayValue(creator)}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
};

export default RedesTabContent;
