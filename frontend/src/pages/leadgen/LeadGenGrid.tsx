import { ExternalLink, Eye } from "lucide-react";
import { format } from "date-fns";
import { useFormato } from "@/hooks/useFormato";
import InstagramIcon from "@/components/icons/InstagramIcon";
import TikTokIcon from "@/components/icons/TikTokIcon";
import XIcon from "@/components/icons/XIcon";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { LeadGenEntry } from "./useLeadGen";

const calidadVariant: Record<string, "success-soft" | "primary-soft" | "warning-soft" | "secondary-soft" | "destructive-soft"> = {
  "a+": "success-soft",
  a: "primary-soft",
  "b+": "warning-soft",
  b: "secondary-soft",
  c: "destructive-soft",
};

const getTicketId = (entry: LeadGenEntry) =>
  entry.ticket_number || `#LG${entry.id.slice(-7).toUpperCase()}`;

const countryToFlag = (code: string | null) => {
  if (!code || code.length < 2) return "🌍";
  const c = code.toUpperCase().slice(0, 2);
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
};

const getPlatformIcon = (platform: string) => {
  const p = platform.toLowerCase();
  if (p.includes("instagram")) return <InstagramIcon className="h-4 w-4" />;
  if (p.includes("tiktok")) return <TikTokIcon className="h-4 w-4" />;
  if (p.includes("twitter") || p.includes("x")) return <XIcon className="h-4 w-4" />;
  return <ExternalLink className="h-4 w-4 text-muted-foreground" />;
};

interface Props {
  leads: LeadGenEntry[];
  onView?: (lead: LeadGenEntry) => void;
}

const LeadGenGrid = ({ leads, onView }: Props) => {
  const f = useFormato();
  const buildProfileUrl = (entry: LeadGenEntry) => {
    if (entry.source_link) return entry.source_link;
    const p = entry.platform.toLowerCase();
    if (p.includes("instagram")) return `https://instagram.com/${entry.model_handle}`;
    if (p.includes("tiktok")) return `https://tiktok.com/@${entry.model_handle}`;
    return `https://${entry.model_handle}`;
  };

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-muted-foreground">
        Leads ({leads.length})
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {leads.map((lead) => {
          const cat = lead.quality.toLowerCase();
          const createdAt = new Date(lead.created_at);
          return (
            <Card
              key={lead.id}
              className="cursor-pointer hover:bg-muted/50 hover:border-primary/30 transition-all relative"
              onClick={() => onView?.(lead)}
            >
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs">
                      {getTicketId(lead)}
                    </Badge>
                    <a
                      href={buildProfileUrl(lead)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      {getPlatformIcon(lead.platform)}
                      <span className="truncate max-w-[100px]">Ver Perfil</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <Badge variant={calidadVariant[cat] ?? "secondary-soft"}>
                    {lead.quality.toUpperCase()}
                  </Badge>
                </div>

                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Agente:</span>
                    <span className="font-medium">{lead.agent_name || "—"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Agencia:</span>
                    <span className="font-medium">{lead.company || "—"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Fecha:</span>
                    <span className="font-medium">
                      {format(createdAt, "d MMM yyyy", { locale: f.fechas })} · {format(createdAt, "hh:mm a")}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">País:</span>
                    <span className="font-medium">
                      {countryToFlag(lead.country_code)} {lead.country_code || "—"}
                    </span>
                  </div>
                </div>

                <Button size="sm" className="w-full" onClick={(e) => { e.stopPropagation(); onView?.(lead); }}>
                  <Eye className="h-4 w-4 mr-1" />
                  Ver Detalles
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {leads.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16">
          <p className="text-muted-foreground text-sm">No hay leads para mostrar</p>
        </div>
      )}
    </div>
  );
};

export default LeadGenGrid;
