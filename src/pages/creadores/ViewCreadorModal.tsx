import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ExternalLink, MapPin, Building2, Mail, Phone, UserCog, CalendarDays, Instagram, Globe } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { CreatorWithBusiness } from "./useCreadores";

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

const SocialLink = ({ label, handle, url }: { label: string; handle: string | null; url: string }) => (
  <div className="flex items-center justify-between py-2">
    <span className="text-sm text-muted-foreground">{label}</span>
    {handle ? (
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary hover:underline flex items-center gap-1">
        {handle} <ExternalLink className="h-3 w-3" />
      </a>
    ) : (
      <span className="text-sm text-muted-foreground">—</span>
    )}
  </div>
);

const ViewCreadorModal = ({ open, onOpenChange, creator }: Props) => {
  const c = creator;
  const initials = c.name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const flag = getFlagEmoji(c.country_code || countryToCode[c.country ?? ""] || null);
  const regDate = c.registration_date ? format(new Date(c.registration_date), "dd MMM yyyy", { locale: es }) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-start gap-4">
            <Avatar className="h-16 w-16">
              {c.profile_photo_url && <AvatarImage src={c.profile_photo_url} />}
              <AvatarFallback className="text-lg">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-xl">{c.artistic_name || c.name}</DialogTitle>
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
            <Button variant="outline" size="sm" className="shrink-0 gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" />
              Perfil Completo
            </Button>
          </div>
        </DialogHeader>

        <Tabs defaultValue="info" className="mt-2">
          <TabsList className="w-full">
            <TabsTrigger value="info" className="flex-1">Info</TabsTrigger>
            <TabsTrigger value="redes" className="flex-1">Redes</TabsTrigger>
            <TabsTrigger value="notas" className="flex-1">Notas (0)</TabsTrigger>
            <TabsTrigger value="monetizacion" className="flex-1">Monetización</TabsTrigger>
          </TabsList>

          <ScrollArea className="max-h-[45vh]">
            <TabsContent value="info" className="pr-3">
              <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                <InfoField icon={MapPin} label="Ubicación" value={
                  <span>{flag && <span className="mr-1">{flag}</span>}{c.city || c.country || "—"}</span>
                } />
                <InfoField icon={Building2} label="Agencia" value={c.creator_business?.assigned_agency} />
                <InfoField icon={Mail} label="Email" value={c.email} />
                <InfoField icon={Phone} label="Teléfono" value={c.phone} />
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

            <TabsContent value="redes" className="pr-3 space-y-1 divide-y">
              <SocialLink label="Instagram" handle={c.instagram_handle} url={`https://instagram.com/${c.instagram_handle}`} />
              <SocialLink label="TikTok" handle={c.tiktok_handle} url={`https://tiktok.com/@${c.tiktok_handle}`} />
              <SocialLink label="Twitter / X" handle={c.twitter_handle} url={`https://x.com/${c.twitter_handle}`} />
              <SocialLink label="YouTube" handle={c.youtube_handle} url={`https://youtube.com/@${c.youtube_handle}`} />
              <SocialLink label="OnlyFans" handle={c.onlyfans_url ? "Ver perfil" : null} url={c.onlyfans_url ?? ""} />
              <SocialLink label="WhatsApp" handle={c.whatsapp_number} url={`https://wa.me/${c.whatsapp_number}`} />
            </TabsContent>

            <TabsContent value="notas" className="pr-3">
              <p className="text-sm text-muted-foreground text-center py-8">Sin notas</p>
            </TabsContent>

            <TabsContent value="monetizacion" className="pr-3">
              <p className="text-sm text-muted-foreground text-center py-8">Sin datos</p>
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ViewCreadorModal;
