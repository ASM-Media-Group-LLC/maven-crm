import { useState } from "react";
import { Building2, Globe } from "lucide-react";
import InstagramIcon from "@/components/icons/InstagramIcon";
import TikTokIcon from "@/components/icons/TikTokIcon";
import XIcon from "@/components/icons/XIcon";
import { Card, CardContent } from "@/components/ui/card";
import { UserAvatar } from "@/components/UserAvatar";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ViewCreadorModal from "./ViewCreadorModal";
import type { CreatorWithBusiness } from "./useCreadores";
import { buildSocialUrl } from "@/lib/utils";
import { useUserRole } from "@/hooks/useUserRole";
import { etiquetaEstado } from "./etiquetasCreadora";
import { useLanguage } from "@/hooks/useLanguage";

const statusVariant: Record<string, "success-soft" | "primary-soft" | "warning-soft" | "destructive-soft" | "secondary-soft"> = {
  active: "success-soft",
  onboarding: "primary-soft",
  leaving: "warning-soft",
  terminated: "destructive-soft",
  paused: "secondary-soft",
  pendiente_verificacion: "warning-soft",
  borrador: "secondary-soft",
};

const categoryVariant: Record<string, "success-soft" | "primary-soft" | "warning-soft" | "secondary-soft" | "destructive-soft"> = {
  Elite: "success-soft",
  "A+": "success-soft",
  A: "primary-soft",
  "B+": "warning-soft",
  B: "secondary-soft",
  "C+": "destructive-soft",
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
  creators: CreatorWithBusiness[];
}

const CreadoresGrid = ({ creators }: Props) => {
  const { t } = useLanguage();
  const [viewingCreator, setViewingCreator] = useState<CreatorWithBusiness | null>(null);
  const { isAgent, isAdmin, isManager } = useUserRole();
  const canSeeAllData = isAdmin || isManager || !isAgent;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {creators.map((c) => {
          const showRealName = canSeeAllData || (c as any).permiso_nombre_real === true;
          const showRealLocation = canSeeAllData || (c as any).permiso_ubicacion === true;
          const displayName = showRealName ? c.name : (c.artistic_name || c.name);
          const flag = showRealLocation ? getFlagEmoji(c.country_code || countryToCode[c.country ?? ""] || null) : "";
          const location = showRealLocation
            ? [c.country, c.city].filter(Boolean).join(", ")
            : ((c as any).ubicacion_artistica || "");
          const agency = c.creator_business?.company?.name ?? c.creator_business?.assigned_agency;
          const kashType = c.creator_business?.kash_type;
          const agencyLabel = [agency, kashType].filter(Boolean).join(" - ");

          return (
            <Card
              key={c.id}
              className="overflow-hidden cursor-pointer transition-shadow duration-200 hover:shadow-md hover:border-primary/30"
              onClick={() => setViewingCreator(c)}
            >
              <CardContent className="p-4 space-y-3 relative">
                
                {/* Header: Avatar + Name + Badges */}
                <div className="flex items-start gap-3">
                  <UserAvatar
                    name={displayName}
                    src={c.profile_photo_url}
                    size="lg"
                    className="h-12 w-12 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-semibold text-primary">
                      {showRealName ? (c.artistic_name || c.name) : displayName}
                    </p>
                    {showRealName && c.artistic_name && (
                      <p className="truncate text-xs text-muted-foreground">{c.name}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-1">
                      {c.category && (
                        <Badge variant={categoryVariant[c.category] ?? "secondary-soft"} className="text-[10px] px-1.5 py-0">
                          {c.category}
                        </Badge>
                      )}
                      {c.status && (
                        <Badge
                          variant={statusVariant[c.status] ?? "secondary-soft"}
                          className={`text-[10px] px-1.5 py-0 ${c.status === "pendiente_verificacion" ? "badge-pending-verification" : ""}`}
                        >
                          {etiquetaEstado(t, c.status)}
                        </Badge>
                      )}
                      {/* Indicador Blu/Infloww — read-only en grid view.
                          Toggle real con confirmación vive en la tabla. */}
                      {((c as any).blu_infloww_active ?? false) && (
                        <Badge variant="success-soft" className="text-[10px] px-1.5 py-0">
                          Blu
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                {/* Body: Location + Agency */}
                <div className="space-y-1">
                  {location && (
                    <p className="text-sm text-muted-foreground">
                      {flag && <span className="mr-1">{flag}</span>}
                      {location}
                    </p>
                  )}
                  {agencyLabel && (
                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Building2 className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{agencyLabel}</span>
                    </p>
                  )}
                </div>

                {/* Footer: Social icons */}
                <TooltipProvider>
                <div className="border-t pt-3 flex gap-3">
                  {c.instagram_handle && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <a
                          href={buildSocialUrl("instagram", c.instagram_handle)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <InstagramIcon className="h-4 w-4" />
                        </a>
                      </TooltipTrigger>
                      <TooltipContent>Instagram</TooltipContent>
                    </Tooltip>
                  )}
                  {c.tiktok_handle && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <a
                          href={buildSocialUrl("tiktok", c.tiktok_handle)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <TikTokIcon className="h-4 w-4" />
                        </a>
                      </TooltipTrigger>
                      <TooltipContent>TikTok</TooltipContent>
                    </Tooltip>
                  )}
                  {c.twitter_handle && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <a
                          href={buildSocialUrl("twitter", c.twitter_handle)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <XIcon className="h-4 w-4" />
                        </a>
                      </TooltipTrigger>
                      <TooltipContent>X</TooltipContent>
                    </Tooltip>
                  )}
                  {(() => {
                    const externalLinks = [
                      c.onlyfans_url && { label: "OnlyFans", url: c.onlyfans_url },
                      c.piclink_url && { label: "Piclink", url: c.piclink_url },
                      c.linkedin_handle && { label: "LinkedIn", url: buildSocialUrl("linkedin", c.linkedin_handle) },
                      c.youtube_handle && { label: "YouTube", url: buildSocialUrl("youtube", c.youtube_handle) },
                      c.chat_url && { label: "Chat", url: c.chat_url },
                    ].filter(Boolean) as { label: string; url: string }[];
                    if (externalLinks.length === 0) return null;
                    if (externalLinks.length === 1) {
                      return (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <a
                              href={externalLinks[0].url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-foreground"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Globe className="h-4 w-4" />
                            </a>
                          </TooltipTrigger>
                          <TooltipContent>{externalLinks[0].label}</TooltipContent>
                        </Tooltip>
                      );
                    }
                    return (
                      <DropdownMenu>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <DropdownMenuTrigger asChild>
                              <button
                                className="text-muted-foreground hover:text-foreground focus:outline-none cursor-pointer"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Globe className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                          </TooltipTrigger>
                          <TooltipContent>{t("creadores.table.viewPlatforms")}</TooltipContent>
                        </Tooltip>
                        <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
                          {externalLinks.map((link) => (
                            <DropdownMenuItem key={link.label} asChild>
                              <a href={link.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                                {link.label}
                              </a>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    );
                  })()}
                </div>
                </TooltipProvider>
              </CardContent>
            </Card>
          );
        })}
        {creators.length === 0 && (
          <p className="col-span-full py-12 text-center text-muted-foreground">
            {t("creadores.table.empty")}
          </p>
        )}
      </div>

      {viewingCreator && (
        <ViewCreadorModal
          open={!!viewingCreator}
          onOpenChange={(open) => { if (!open) setViewingCreator(null); }}
          creator={viewingCreator}
        />
      )}
    </>
  );
};

export default CreadoresGrid;
