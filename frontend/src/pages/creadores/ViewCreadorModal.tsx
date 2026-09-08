import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ExternalLink, MapPin, Building2, Mail, Phone, UserCog, CalendarDays, Globe, MessageCircle, Trash2, Facebook, Link as LinkIcon, Send } from "lucide-react";
import { WaChatButton, toE164 } from "@/components/WaChatButton";
import { TgChatButton } from "@/components/TgChatButton";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import InstagramIcon from "@/components/icons/InstagramIcon";
import TikTokIcon from "@/components/icons/TikTokIcon";
import XIcon from "@/components/icons/XIcon";
import TelegramIcon from "@/components/icons/TelegramIcon";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { UserAvatar } from "@/components/UserAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import type { CreatorWithBusiness } from "./useCreadores";
import { cleanHandle, buildSocialUrl, displayHandle } from "@/lib/utils";

const statusLabel: Record<string, string> = {
  active: "Activa",
  onboarding: "Onboarding",
  leaving: "Retiro",
  terminated: "Terminada",
  paused: "Pausada",
};

const statusVariant: Record<string, "success-soft" | "primary-soft" | "warning-soft" | "destructive-soft" | "secondary-soft"> = {
  active: "success-soft",
  onboarding: "primary-soft",
  leaving: "warning-soft",
  terminated: "destructive-soft",
  paused: "secondary-soft",
};

const categoryVariant: Record<string, "success-soft" | "primary-soft" | "warning-soft" | "secondary-soft" | "destructive-soft"> = {
  "A+": "success-soft",
  A: "primary-soft",
  "B+": "warning-soft",
  B: "secondary-soft",
  C: "destructive-soft",
};

const countryToCode: Record<string, string> = {
  Argentina: "AR", Bolivia: "BO", Brasil: "BR", Chile: "CL", Colombia: "CO",
  "Costa Rica": "CR", Cuba: "CU", Ecuador: "EC", "El Salvador": "SV",
  España: "ES", "Estados Unidos": "US", Guatemala: "GT", Honduras: "HN",
  México: "MX", Nicaragua: "NI", Panamá: "PA", Paraguay: "PY", Perú: "PE",
  "Puerto Rico": "PR", "República Dominicana": "DO", Uruguay: "UY", Venezuela: "VE",
};

const getFlagEmoji = (countryCode: string | null) => {
  if (!countryCode) return "";
  return countryCode
    .toUpperCase()
    .split("")
    .map((c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
    .join("");
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creator: CreatorWithBusiness;
}

const InfoField = ({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) => (
  <div className="flex items-start gap-3 py-2">
    <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value || "—"}</p>
    </div>
  </div>
);

const PlatformIcon = ({ children }: { children: React.ReactNode }) => (
  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground shrink-0">
    {children}
  </div>
);

const SocialLink = ({ icon, handle, url, rawHandle }: { icon: React.ReactNode; handle: string | null; url: string; rawHandle?: string | null }) => {
  if (!handle) return null;
  const display = rawHandle ? displayHandle(rawHandle) : handle;
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-3">
        <PlatformIcon>{icon}</PlatformIcon>
        <span className="text-sm font-medium">{display}</span>
      </div>
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
        <ExternalLink className="h-4 w-4" />
      </a>
    </div>
  );
};

const ViewCreadorModal = ({ open, onOpenChange, creator }: Props) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAdmin } = useUserRole();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const c = creator;
  const flag = getFlagEmoji(c.country_code || countryToCode[c.country ?? ""] || null);
  const regDate = c.registration_date ? format(new Date(c.registration_date), "dd MMM yyyy", { locale: es }) : null;
  const igUrl = c.instagram_handle ? buildSocialUrl("instagram", c.instagram_handle) : null;

  const deleteCreator = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("creators").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["creators"] });
      toast.success("Creator eliminado correctamente");
      setDeleteOpen(false);
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast.error("Error al eliminar creator", { description: err.message });
    },
  });

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* En el teléfono: margen lateral, esquinas menos redondas y todo apilable.
          Antes el botón "Perfil Completo" y las 4 pestañas no cabían en 340 px y
          el pie quedaba en columna (Jhon, iPhone, 07/09/2026). */}
      <DialogContent className="max-w-[calc(100vw-1.5rem)] rounded-2xl sm:max-w-lg sm:rounded-3xl">
        <DialogHeader>
          <div className="flex flex-wrap items-start gap-4 pr-8">
            {igUrl ? (
              <a
                href={igUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded-full transition-opacity hover:opacity-80"
                title="Ver Instagram"
                aria-label="Ver Instagram"
              >
                <UserAvatar
                  name={c.name}
                  src={c.profile_photo_url}
                  size="xl"
                  className="h-16 w-16 cursor-pointer"
                />
              </a>
            ) : (
              <UserAvatar
                name={c.name}
                src={c.profile_photo_url}
                size="xl"
                className="h-16 w-16"
              />
            )}
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-xl">
                {igUrl ? (
                  <a
                    href={igUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 hover:text-primary transition-colors"
                    title="Ver Instagram"
                  >
                    {c.artistic_name || c.name}
                    <InstagramIcon className="h-4 w-4 opacity-70" />
                  </a>
                ) : (
                  c.artistic_name || c.name
                )}
              </DialogTitle>
              <DialogDescription className="mt-0.5">
                {c.artistic_name ? c.name : ""}
              </DialogDescription>
              <div className="flex gap-2 mt-2">
                {c.category && (
                  <Badge variant={categoryVariant[c.category] ?? "secondary-soft"} className="font-normal">
                    {c.category}
                  </Badge>
                )}
                {c.status && (
                  <Badge variant={statusVariant[c.status] ?? "secondary-soft"}>
                    {statusLabel[c.status] ?? c.status}
                  </Badge>
                )}
              </div>
            </div>
            <Button variant="outline" size="sm" className="order-last w-full gap-1.5 sm:order-none sm:w-auto sm:shrink-0" onClick={() => { onOpenChange(false); navigate(`/creadores/${c.id}`); }}>
              <ExternalLink className="h-3.5 w-3.5" />
              Perfil completo
            </Button>
          </div>
        </DialogHeader>

        <Tabs defaultValue="info" className="mt-2">
          <TabsList className="w-full justify-start overflow-x-auto sm:justify-center">
            <TabsTrigger value="info" className="shrink-0 sm:flex-1">Info</TabsTrigger>
            <TabsTrigger value="redes" className="shrink-0 sm:flex-1">Redes</TabsTrigger>
            <TabsTrigger value="notas" className="shrink-0 sm:flex-1">Notas (0)</TabsTrigger>
            <TabsTrigger value="monetizacion" className="shrink-0 sm:flex-1">Monetización</TabsTrigger>
          </TabsList>

          <ScrollArea className="max-h-[45vh]">
            <TabsContent value="info" className="pr-3">
              <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 [&_span]:break-words">
                <InfoField icon={MapPin} label="Ubicación" value={
                  <span>{flag && <span className="mr-1">{flag}</span>}{c.city || c.country || "—"}</span>
                } />
                <InfoField icon={Building2} label="Agencia" value={c.creator_business?.company?.name ?? c.creator_business?.assigned_agency} />
                <InfoField icon={Mail} label="Email" value={c.email} />
                <InfoField icon={Phone} label="WhatsApp" value={<WaChatButton creatorId={c.id} phone={toE164({ whatsapp: c.whatsapp_number, phone: c.phone })} name={c.name} />} />
                <InfoField icon={Send} label="Telegram" value={(c.whatsapp_number || c.phone) ? <TgChatButton creatorId={c.id} phone={toE164({ whatsapp: c.whatsapp_number, phone: c.phone })} name={c.name} /> : null} />
                <InfoField icon={UserCog} label="Tipo de Manager" value={c.creator_business?.manager_type} />
                <InfoField icon={CalendarDays} label="Fecha de Registro" value={regDate} />
              </div>
              {c.languages && c.languages.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5">
                    <Globe className="h-4 w-4" /> Idiomas
                  </p>
                  <div className="flex gap-1.5 flex-wrap">
                    {c.languages.map((lang) => (
                      <Badge key={lang} variant="secondary-soft" className="font-normal">{lang}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="redes" className="pr-3 divide-y">
              <SocialLink icon={<InstagramIcon className="h-4 w-4" />} handle={c.instagram_handle} rawHandle={c.instagram_handle} url={buildSocialUrl("instagram", c.instagram_handle)} />
              <SocialLink icon={<TikTokIcon className="h-4 w-4" />} handle={c.tiktok_handle} rawHandle={c.tiktok_handle} url={buildSocialUrl("tiktok", c.tiktok_handle)} />
              <SocialLink icon={<XIcon className="h-4 w-4" />} handle={c.twitter_handle} rawHandle={c.twitter_handle} url={buildSocialUrl("twitter", c.twitter_handle)} />
              <SocialLink icon={<span className="text-xs font-bold">YT</span>} handle={c.youtube_handle} rawHandle={c.youtube_handle} url={buildSocialUrl("youtube", c.youtube_handle)} />
              <SocialLink icon={<span className="text-xs font-bold">OF</span>} handle={c.onlyfans_url ? "Ver perfil" : null} url={c.onlyfans_url ?? ""} />
              <SocialLink icon={<TelegramIcon className="h-4 w-4" />} handle={c.telegram_handle} rawHandle={c.telegram_handle} url={buildSocialUrl("telegram", c.telegram_handle)} />
              <SocialLink icon={<span className="text-xs font-bold">R</span>} handle={c.reddit_handle} rawHandle={c.reddit_handle} url={buildSocialUrl("reddit", c.reddit_handle)} />
              <SocialLink icon={<Facebook className="h-4 w-4" />} handle={c.facebook_handle} rawHandle={c.facebook_handle} url={buildSocialUrl("facebook", c.facebook_handle)} />
              <SocialLink icon={<LinkIcon className="h-4 w-4" />} handle={c.other_url ? "Ver" : null} url={c.other_url ?? ""} />
              {c.whatsapp_number && (
                <div className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <PlatformIcon><Phone className="h-4 w-4" /></PlatformIcon>
                    <span className="text-sm font-medium">WhatsApp</span>
                  </div>
                  <WaChatButton creatorId={c.id} phone={toE164({ whatsapp: c.whatsapp_number })} name={c.name} />
                </div>
              )}
              {(c.whatsapp_number || c.phone) && (
                <div className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <PlatformIcon><TelegramIcon className="h-4 w-4" /></PlatformIcon>
                    <span className="text-sm font-medium">Telegram</span>
                  </div>
                  <TgChatButton creatorId={c.id} phone={toE164({ whatsapp: c.whatsapp_number, phone: c.phone })} name={c.name} />
                </div>
              )}
            </TabsContent>

            <TabsContent value="notas" className="pr-3">
              <p className="text-sm text-muted-foreground text-center py-8">Sin notas</p>
            </TabsContent>

            <TabsContent value="monetizacion" className="pr-3">
              <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p>
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          {isAdmin && (
            <Button variant="ghost" size="sm" className="text-destructive gap-1.5" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" /> Eliminar
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar creator?</AlertDialogTitle>
          <AlertDialogDescription>
            Estás a punto de eliminar a <strong>{c.name}</strong>. Esta acción no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => deleteCreator.mutate(c.id)}
            disabled={deleteCreator.isPending}
          >
            {deleteCreator.isPending ? "Eliminando..." : "Eliminar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
};

export default ViewCreadorModal;
