import { Instagram } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { CreatorWithBusiness } from "./useCreadores";

const statusVariant: Record<string, string> = {
  active: "bg-success/20 text-success border-success/30",
  onboarding: "bg-primary/20 text-primary border-primary/30",
  leaving: "bg-destructive/20 text-destructive border-destructive/30",
  terminated: "bg-muted text-muted-foreground border-border",
  paused: "bg-warning/20 text-warning border-warning/30",
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

      return (
        <Card key={c.id} className="overflow-hidden">
          <CardContent className="flex flex-col items-center gap-3 p-5">
            <Avatar className="h-14 w-14">
              {c.profile_photo_url && <AvatarImage src={c.profile_photo_url} />}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="text-center">
              <p className="font-medium">{c.artistic_name || c.name}</p>
              {c.artistic_name && (
                <p className="text-xs text-muted-foreground">{c.name}</p>
              )}
            </div>
            <div className="flex gap-2">
              {c.category && <Badge variant="secondary">{c.category}</Badge>}
              {c.status && (
                <Badge variant="outline" className={`capitalize ${statusVariant[c.status] ?? ""}`}>
                  {c.status}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {[c.city, c.country].filter(Boolean).join(", ")}
            </p>
            {c.instagram_handle && (
              <a
                href={`https://instagram.com/${c.instagram_handle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground"
              >
                <Instagram className="h-4 w-4" />
              </a>
            )}
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
