import { Instagram, Building2, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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

const CreadoresGrid = ({ creators }: Props) => (
  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
    {creators.map((c) => {
      const initials = c.name
        .split(" ")
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase();

      const flag = getFlagEmoji(c.country_code);
      const location = [c.country, c.city].filter(Boolean).join(", ");
      const agency = c.creator_business?.assigned_agency;
      const kashType = c.creator_business?.kash_type;
      const agencyLabel = [agency, kashType].filter(Boolean).join(" - ");

      return (
        <Card key={c.id} className="overflow-hidden">
          <CardContent className="flex gap-4 p-4">
            {/* Avatar */}
            <Avatar className="h-16 w-16 shrink-0">
              {c.profile_photo_url && <AvatarImage src={c.profile_photo_url} />}
              <AvatarFallback className="text-sm">{initials}</AvatarFallback>
            </Avatar>

            {/* Info */}
            <div className="flex flex-1 flex-col gap-1 min-w-0">
              {/* Name row */}
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-semibold text-primary">
                  {c.artistic_name || c.name}
                </p>
                <RefreshCw className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </div>

              {c.artistic_name && (
                <p className="truncate text-xs text-muted-foreground">{c.name}</p>
              )}

              {/* Badges */}
              <div className="flex flex-wrap gap-1.5 mt-0.5">
                {c.category && (
                  <Badge variant={categoryVariant[c.category] ?? "secondary-soft"} className="text-[10px] px-1.5 py-0">
                    {c.category}
                  </Badge>
                )}
                {c.status && (
                  <Badge variant={statusVariant[c.status] ?? "secondary-soft"} className="text-[10px] px-1.5 py-0">
                    {statusLabel[c.status] ?? c.status}
                  </Badge>
                )}
              </div>

              {/* Location */}
              {location && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {flag && <span className="mr-1">{flag}</span>}
                  {location}
                </p>
              )}

              {/* Agency */}
              {agencyLabel && (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Building2 className="h-3 w-3 shrink-0" />
                  <span className="truncate">{agencyLabel}</span>
                </p>
              )}

              {/* Social */}
              <div className="flex gap-2 mt-1">
                {c.instagram_handle && (
                  <a
                    href={`https://instagram.com/${c.instagram_handle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Instagram className="h-3.5 w-3.5" />
                  </a>
                )}
                {c.tiktok_handle && (
                  <a
                    href={`https://tiktok.com/@${c.tiktok_handle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground text-[10px] font-bold"
                  >
                    TT
                  </a>
                )}
                {c.twitter_handle && (
                  <a
                    href={`https://twitter.com/${c.twitter_handle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground text-[10px] font-bold"
                  >
                    𝕏
                  </a>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      );
    })}
    {creators.length === 0 && (
      <p className="col-span-full py-12 text-center text-muted-foreground">
        No se encontraron creadores.
      </p>
    )}
  </div>
);

export default CreadoresGrid;
