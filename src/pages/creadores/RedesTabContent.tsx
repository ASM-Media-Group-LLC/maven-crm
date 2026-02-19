import { useState } from "react";
import { Edit, Save, X, Phone, ExternalLink, Linkedin, Link } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import InstagramIcon from "@/components/icons/InstagramIcon";
import TikTokIcon from "@/components/icons/TikTokIcon";
import XIcon from "@/components/icons/XIcon";
import { displayHandle, buildSocialUrl } from "@/lib/utils";
import type { CreatorFull } from "./useCreadores";

interface RedesTabContentProps {
  creator: CreatorFull;
  creatorId: string;
}

interface EditData {
  instagram_handle: string;
  instagram_followers: string;
  tiktok_handle: string;
  twitter_handle: string;
  youtube_handle: string;
  onlyfans_url: string;
  whatsapp_number: string;
  linkedin_handle: string;
  piclink_url: string;
}

interface PlatformConfig {
  key: keyof EditData;
  label: string;
  editLabel: string;
  icon: React.ReactNode;
  placeholder: string;
  displayValue: (creator: CreatorFull) => string;
  buildUrl: (creator: CreatorFull) => string;
  editOnly?: boolean;
  inputType?: string;
}

const platforms: PlatformConfig[] = [
  {
    key: "instagram_handle",
    label: "Instagram",
    editLabel: "Instagram URL",
    icon: <InstagramIcon className="h-5 w-5" />,
    placeholder: "https://instagram.com/username",
    displayValue: (c) => displayHandle(c.instagram_handle) || "—",
    buildUrl: (c) => buildSocialUrl("instagram", c.instagram_handle),
  },
  {
    key: "instagram_followers",
    label: "Seguidores Instagram",
    editLabel: "Seguidores Instagram",
    icon: <InstagramIcon className="h-5 w-5" />,
    placeholder: "Ej: 150000",
    displayValue: (c) => c.instagram_followers ? c.instagram_followers.toLocaleString() : "—",
    buildUrl: () => "",
    editOnly: true,
    inputType: "number",
  },
  {
    key: "whatsapp_number",
    label: "WhatsApp",
    editLabel: "WhatsApp (Número o Link API)",
    icon: <Phone className="h-5 w-5" />,
    placeholder: "+1234567890 o https://wa.me/...",
    displayValue: (c) => c.whatsapp_number || "—",
    buildUrl: (c) => c.whatsapp_number ? `https://wa.me/${c.whatsapp_number.replace(/[^0-9]/g, "")}` : "",
  },
  {
    key: "twitter_handle",
    label: "X (Twitter)",
    editLabel: "Twitter/X URL",
    icon: <XIcon className="h-5 w-5" />,
    placeholder: "https://x.com/username",
    displayValue: (c) => displayHandle(c.twitter_handle) || "—",
    buildUrl: (c) => buildSocialUrl("twitter", c.twitter_handle),
  },
  {
    key: "youtube_handle",
    label: "YouTube",
    editLabel: "YouTube URL",
    icon: <span className="text-xs font-bold">YT</span>,
    placeholder: "https://youtube.com/@channel",
    displayValue: (c) => displayHandle(c.youtube_handle) || "—",
    buildUrl: (c) => buildSocialUrl("youtube", c.youtube_handle),
  },
  {
    key: "tiktok_handle",
    label: "TikTok",
    editLabel: "TikTok URL",
    icon: <TikTokIcon className="h-5 w-5" />,
    placeholder: "https://tiktok.com/@username",
    displayValue: (c) => displayHandle(c.tiktok_handle) || "—",
    buildUrl: (c) => buildSocialUrl("tiktok", c.tiktok_handle),
  },
  {
    key: "linkedin_handle",
    label: "LinkedIn",
    editLabel: "LinkedIn URL",
    icon: <Linkedin className="h-5 w-5" />,
    placeholder: "https://linkedin.com/in/...",
    displayValue: (c) => displayHandle(c.linkedin_handle) || "—",
    buildUrl: (c) => buildSocialUrl("linkedin", c.linkedin_handle),
  },
  {
    key: "onlyfans_url",
    label: "OnlyFans",
    editLabel: "OnlyFans URL",
    icon: <span className="text-xs font-bold">OF</span>,
    placeholder: "https://onlyfans.com/...",
    displayValue: (c) => c.onlyfans_url || "—",
    buildUrl: (c) => c.onlyfans_url || "",
  },
  {
    key: "piclink_url",
    label: "PicLink",
    editLabel: "PicLink URL",
    icon: <Link className="h-5 w-5" />,
    placeholder: "https://piclink.com/...",
    displayValue: (c) => c.piclink_url || "—",
    buildUrl: (c) => c.piclink_url || "",
  },
];

const RedesTabContent = ({ creator, creatorId }: RedesTabContentProps) => {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editData, setEditData] = useState<EditData>({
    instagram_handle: "",
    instagram_followers: "",
    tiktok_handle: "",
    twitter_handle: "",
    youtube_handle: "",
    onlyfans_url: "",
    whatsapp_number: "",
    linkedin_handle: "",
    piclink_url: "",
  });

  const startEditing = () => {
    setEditData({
      instagram_handle: creator.instagram_handle ?? "",
      instagram_followers: creator.instagram_followers != null ? String(creator.instagram_followers) : "",
      tiktok_handle: creator.tiktok_handle ?? "",
      twitter_handle: creator.twitter_handle ?? "",
      youtube_handle: creator.youtube_handle ?? "",
      onlyfans_url: creator.onlyfans_url ?? "",
      whatsapp_number: creator.whatsapp_number ?? "",
      linkedin_handle: creator.linkedin_handle ?? "",
      piclink_url: creator.piclink_url ?? "",
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
          instagram_followers: editData.instagram_followers ? parseInt(editData.instagram_followers, 10) : null,
          tiktok_handle: editData.tiktok_handle || null,
          twitter_handle: editData.twitter_handle || null,
          youtube_handle: editData.youtube_handle || null,
          onlyfans_url: editData.onlyfans_url || null,
          whatsapp_number: editData.whatsapp_number || null,
          linkedin_handle: editData.linkedin_handle || null,
          piclink_url: editData.piclink_url || null,
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

      {isEditing ? (
        <div className="space-y-4">
          {platforms.map((platform) => (
            <div key={platform.key} className="space-y-1.5">
              <Label htmlFor={platform.key}>{platform.editLabel}</Label>
              <Input
                id={platform.key}
                type={platform.inputType || "text"}
                value={editData[platform.key]}
                onChange={(e) => updateField(platform.key, e.target.value)}
                placeholder={platform.placeholder}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {platforms.filter((p) => !p.editOnly).map((platform) => {
            const url = platform.buildUrl(creator);
            const hasLink = !!url;

            return (
              <Card
                key={platform.key}
                className="group p-4 flex items-center gap-4 cursor-pointer transition-all duration-200 hover:scale-[1.03] hover:bg-gradient-to-br hover:from-primary/15 hover:to-transparent hover:border-primary/40"
              >
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                  {platform.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{platform.label}</p>
                  <p className="text-sm text-muted-foreground truncate">
                    {platform.displayValue(creator)}
                  </p>
                </div>
                {hasLink && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
};

export default RedesTabContent;
