import { useState } from "react";
import { Edit, Save, X, Phone, ExternalLink, Linkedin, Link, Facebook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { WaChatButton, toE164 } from "@/components/WaChatButton";
import { TgChatButton } from "@/components/TgChatButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import InstagramIcon from "@/components/icons/InstagramIcon";
import TikTokIcon from "@/components/icons/TikTokIcon";
import XIcon from "@/components/icons/XIcon";
import TelegramIcon from "@/components/icons/TelegramIcon";
import { displayHandle, buildSocialUrl } from "@/lib/utils";
import { maskPhone } from "@/lib/country-utils";
import { useUserRole } from "@/hooks/useUserRole";
import type { CreatorFull } from "./useCreadores";
import ExtraAccountsInline from "./ExtraAccountsInline";

interface RedesTabContentProps {
  creator: CreatorFull;
  creatorId: string;
}

// Campo principal de creators → red de creator_social_accounts (multi-cuenta).
// Las redes sin entrada acá (followers IG, LinkedIn, PicLink) no llevan multi-cuenta.
const MULTI_NET: Partial<Record<keyof EditData, string>> = {
  instagram_handle: "instagram",
  twitter_handle: "x",
  tiktok_handle: "tiktok",
  youtube_handle: "youtube",
  telegram_handle: "telegram",
  reddit_handle: "reddit",
  facebook_handle: "facebook",
  whatsapp_number: "whatsapp",
  onlyfans_url: "onlyfans",
  other_url: "other",
};

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
  facebook_handle: string;
  reddit_handle: string;
  other_url: string;
  telegram_handle: string;
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
    // WhatsApp se renderiza SIEMPRE vía <WaChatButton> (cero dígitos, abre la bandeja);
    // nunca como link wa.me crudo. Dejamos buildUrl vacío a propósito para que el patrón
    // de masking no pueda regresar a exponer el número si alguien quita el caso especial.
    buildUrl: () => "",
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
  {
    key: "facebook_handle",
    label: "Facebook",
    editLabel: "Facebook URL",
    icon: <Facebook className="h-5 w-5" />,
    placeholder: "https://facebook.com/username",
    displayValue: (c) => displayHandle(c.facebook_handle) || "—",
    buildUrl: (c) => buildSocialUrl("facebook", c.facebook_handle),
  },
  {
    key: "reddit_handle",
    label: "Reddit",
    editLabel: "Reddit URL",
    icon: <span className="text-xs font-bold">R</span>,
    placeholder: "https://reddit.com/user/username",
    displayValue: (c) => displayHandle(c.reddit_handle) || "—",
    buildUrl: (c) => buildSocialUrl("reddit", c.reddit_handle),
  },
  {
    key: "telegram_handle",
    label: "Telegram",
    editLabel: "Telegram URL",
    icon: <TelegramIcon className="h-5 w-5" />,
    placeholder: "https://t.me/usuario_o_canal",
    displayValue: (c) => displayHandle(c.telegram_handle) || "—",
    buildUrl: (c) => buildSocialUrl("telegram", c.telegram_handle),
  },
  {
    key: "other_url",
    label: "Otra",
    editLabel: "Otra red / Link",
    icon: <Link className="h-5 w-5" />,
    placeholder: "https://...",
    displayValue: (c) => c.other_url || "—",
    buildUrl: (c) => c.other_url || "",
  },
];

const RedesTabContent = ({ creator, creatorId }: RedesTabContentProps) => {
  const queryClient = useQueryClient();
  const { isAdmin, role } = useUserRole();
  const canManage = isAdmin || role === "manager";
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
    facebook_handle: "",
    reddit_handle: "",
    other_url: "",
    telegram_handle: "",
  });

  const startEditing = () => {
    setEditData({
      instagram_handle: creator.instagram_handle ?? "",
      instagram_followers: creator.instagram_followers != null ? String(creator.instagram_followers) : "",
      tiktok_handle: creator.tiktok_handle ?? "",
      twitter_handle: creator.twitter_handle ?? "",
      youtube_handle: creator.youtube_handle ?? "",
      onlyfans_url: creator.onlyfans_url ?? "",
      // No-admin: el número actual NO se precarga (no se muestra) — solo pueden CARGAR uno nuevo.
      whatsapp_number: isAdmin ? (creator.whatsapp_number ?? "") : "",
      linkedin_handle: creator.linkedin_handle ?? "",
      piclink_url: creator.piclink_url ?? "",
      facebook_handle: creator.facebook_handle ?? "",
      reddit_handle: creator.reddit_handle ?? "",
      other_url: creator.other_url ?? "",
      telegram_handle: creator.telegram_handle ?? "",
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
      let savedAny = false;
      let permBlocked = false;

      // WhatsApp: los NO-admin lo cargan write-only vía RPC set_creator_whatsapp
      // (no ven el número y no necesitan permiso de editar la creadora). Solo si
      // escribieron algo — vacío = "no tocar", para no pisar/borrar lo que no ven.
      // El admin lo maneja dentro del update normal de abajo (lo ve y puede limpiarlo).
      if (!isAdmin) {
        const wa = editData.whatsapp_number.trim();
        if (wa) {
          const { error: waErr } = await supabase.rpc("set_creator_whatsapp", {
            p_creator_id: creatorId,
            p_whatsapp: wa,
          });
          if (waErr) permBlocked = true;
          else savedAny = true;
        }
      }

      // Resto de campos (+ whatsapp si es admin): editar la creadora es manager/admin
      // por RLS. Para closers no se intenta (evita el UPDATE que matchea 0 filas y
      // antes devolvía "éxito" en falso).
      if (canManage) {
        const payload: Record<string, unknown> = {
          instagram_handle: editData.instagram_handle || null,
          instagram_followers: editData.instagram_followers ? parseInt(editData.instagram_followers, 10) : null,
          tiktok_handle: editData.tiktok_handle || null,
          twitter_handle: editData.twitter_handle || null,
          youtube_handle: editData.youtube_handle || null,
          onlyfans_url: editData.onlyfans_url || null,
          linkedin_handle: editData.linkedin_handle || null,
          piclink_url: editData.piclink_url || null,
          facebook_handle: editData.facebook_handle || null,
          reddit_handle: editData.reddit_handle || null,
          other_url: editData.other_url || null,
          telegram_handle: editData.telegram_handle || null,
        };
        // Solo el admin escribe whatsapp_number directo (lo ve). El manager no-admin
        // NO lo toca acá (lo cargó por RPC arriba) para no pisar el número que no ve.
        if (isAdmin) payload.whatsapp_number = editData.whatsapp_number || null;

        const { data, error } = await supabase
          .from("creators")
          .update(payload)
          .eq("id", creatorId)
          .select("id");
        if (error) throw error;
        // RLS puede no actualizar ninguna fila SIN tirar error → detectarlo y no mentir.
        if (!data || data.length === 0) permBlocked = true;
        else savedAny = true;
      }

      await queryClient.invalidateQueries({ queryKey: ["creator", creatorId] });

      if (savedAny && !permBlocked) {
        toast.success(canManage ? "Redes actualizadas" : "WhatsApp cargado");
        setIsEditing(false);
      } else if (savedAny && permBlocked) {
        toast.success("WhatsApp cargado · el resto de los campos solo los edita un manager/admin");
        setIsEditing(false);
      } else if (permBlocked) {
        toast.error("No se pudo guardar: no tienes permiso para editar esta creadora.");
      } else {
        toast("Sin cambios para guardar.");
      }
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
                placeholder={platform.key === "whatsapp_number" && !isAdmin ? "Cargar número (no se muestra el actual)" : platform.placeholder}
                disabled={!canManage && platform.key !== "whatsapp_number"}
              />
              {MULTI_NET[platform.key] && (
                <ExtraAccountsInline
                  creatorId={creatorId}
                  network={MULTI_NET[platform.key]!}
                  canManage={canManage}
                  primaryFilled={!!(editData[platform.key] || "").trim()}
                  onPromoteToPrimary={(v) => updateField(platform.key, v)}
                />
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {platforms.filter((p) => !p.editOnly).map((platform) => {
            const maskThis = platform.key === "whatsapp_number" && !isAdmin;
            const url = maskThis ? "" : platform.buildUrl(creator);
            const hasLink = !!url;
            const displayVal = maskThis
              ? (creator.whatsapp_number ? maskPhone(creator.whatsapp_number) : "—")
              : platform.displayValue(creator);

            // WhatsApp: sin dígitos — botón que abre la bandeja de Maven (como Closers).
            if (platform.key === "whatsapp_number") {
              return (
                <Card key={platform.key} className="group p-4 flex items-center gap-4 transition-all duration-200">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">{platform.icon}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{platform.label}</p>
                    <ExtraAccountsInline creatorId={creatorId} network="whatsapp" canManage={false} />
                  </div>
                  <WaChatButton creatorId={creatorId} phone={toE164({ whatsapp: creator.whatsapp_number })} name={creator.name} />
                  {/* Telegram por el MISMO teléfono (contacto personal, no el canal de promo). */}
                  <TgChatButton creatorId={creatorId} phone={toE164({ whatsapp: creator.whatsapp_number })} name={creator.name} />
                </Card>
              );
            }

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
                    {displayVal}
                  </p>
                  {MULTI_NET[platform.key] && (
                    <ExtraAccountsInline creatorId={creatorId} network={MULTI_NET[platform.key]!} canManage={false} />
                  )}
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
