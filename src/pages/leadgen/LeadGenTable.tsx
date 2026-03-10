import { useState } from "react";
import { ArrowUpDown, ExternalLink, Eye, MoreHorizontal, Pencil, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import InstagramIcon from "@/components/icons/InstagramIcon";
import TikTokIcon from "@/components/icons/TikTokIcon";
import XIcon from "@/components/icons/XIcon";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUpdateLeadQuality } from "./useLeadGen";
import type { LeadGenEntry } from "./useLeadGen";

const calidadVariant: Record<string, "success-soft" | "primary-soft" | "warning-soft" | "secondary-soft" | "destructive-soft"> = {
  "a+": "success-soft",
  a: "primary-soft",
  "b+": "warning-soft",
  b: "secondary-soft",
  c: "destructive-soft",
};

const statusVariant: Record<string, "primary-soft" | "warning-soft" | "success-soft" | "destructive-soft"> = {
  no_response: "primary-soft",
  contactado: "warning-soft",
  cerrado: "success-soft",
  rechazado: "destructive-soft",
};

const statusLabels: Record<string, string> = {
  no_response: "Sin resp.",
  contactado: "Contactado",
  en_llamada: "En llamada",
  cerrado: "Cerrado",
  rechazado: "Rechazado",
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

type SortKey = "hora" | "ticket" | "handle" | "agente" | "agencia" | "calidad" | "estado" | "pais" | "contacto" | "qa";

interface Props {
  leads: LeadGenEntry[];
  onView?: (lead: LeadGenEntry) => void;
  onEdit?: (lead: LeadGenEntry) => void;
}

const LeadGenTable = ({ leads, onView, onEdit }: Props) => {
  const [sortKey, setSortKey] = useState<SortKey>("hora");
  const [sortAsc, setSortAsc] = useState(false);
  const updateQuality = useUpdateLeadQuality();

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const sorted = [...leads].sort((a, b) => {
    let va = "", vb = "";
    switch (sortKey) {
      case "hora": va = a.created_at; vb = b.created_at; break;
      case "ticket": va = a.id; vb = b.id; break;
      case "handle": va = a.model_handle; vb = b.model_handle; break;
      case "agente": va = a.agent_name ?? ""; vb = b.agent_name ?? ""; break;
      case "agencia": va = a.company ?? ""; vb = b.company ?? ""; break;
      case "calidad": va = a.quality; vb = b.quality; break;
      case "estado": va = a.status; vb = b.status; break;
      case "pais": va = a.country_code ?? ""; vb = b.country_code ?? ""; break;
      case "contacto": va = ""; vb = ""; break;
      case "qa": va = ""; vb = ""; break;
    }
    return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
  });

  const SortHeader = ({ label, col }: { label: string; col: SortKey }) => (
    <Button variant="ghost" size="sm" className="-ml-3 h-8 text-xs" onClick={() => handleSort(col)}>
      {label}
      <ArrowUpDown className="ml-1 h-3 w-3" />
    </Button>
  );

  const buildProfileUrl = (entry: LeadGenEntry) => {
    if (entry.source_link) return entry.source_link;
    const p = entry.platform.toLowerCase();
    if (p.includes("instagram")) return `https://instagram.com/${entry.model_handle}`;
    if (p.includes("tiktok")) return `https://tiktok.com/@${entry.model_handle}`;
    if (p.includes("twitter") || p.includes("x")) return `https://x.com/${entry.model_handle}`;
    return `https://${entry.model_handle}`;
  };

  return (
    <div className="max-h-[calc(100vh-24rem)] overflow-auto rounded-lg border border-border">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow>
            <TableHead><SortHeader label="Hora" col="hora" /></TableHead>
            <TableHead><SortHeader label="Ticket" col="ticket" /></TableHead>
            <TableHead><SortHeader label="Handle" col="handle" /></TableHead>
            <TableHead><SortHeader label="Agente" col="agente" /></TableHead>
            <TableHead><SortHeader label="Agencia" col="agencia" /></TableHead>
            <TableHead><SortHeader label="Calidad" col="calidad" /></TableHead>
            <TableHead><SortHeader label="Estado" col="estado" /></TableHead>
            <TableHead><SortHeader label="País" col="pais" /></TableHead>
            <TableHead><SortHeader label="Contacto" col="contacto" /></TableHead>
            <TableHead><SortHeader label="QA" col="qa" /></TableHead>
            <TableHead className="sticky right-0 bg-card z-20">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((lead) => {
            const cat = lead.quality.toLowerCase();
            return (
              <TableRow key={lead.id} className="cursor-pointer" onClick={() => onView?.(lead)}>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {format(new Date(lead.created_at), "hh:mm a", { locale: es })}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-mono text-xs">
                    {getTicketId(lead)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <a
                    href={buildProfileUrl(lead)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                  >
                    {getPlatformIcon(lead.platform)}
                    <span className="truncate max-w-[140px]">@{lead.model_handle}</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{lead.company || "—"}</TableCell>
                <TableCell>
                  <Badge variant={calidadVariant[cat] ?? "secondary-soft"}>
                    {lead.quality.toUpperCase()}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" className="h-8 -ml-2" onClick={() => onView?.(lead)}>
                    <Badge variant={statusVariant[lead.status] ?? "secondary-soft"}>
                      {statusLabels[lead.status] || lead.status}
                    </Badge>
                  </Button>
                </TableCell>
                <TableCell className="text-center text-lg">
                  {countryToFlag(lead.country_code)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {lead.phone_raw ? "📞" : "—"}
                </TableCell>
                <TableCell className="text-center text-sm text-muted-foreground">—</TableCell>
                <TableCell className="sticky right-0 bg-card" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onView?.(lead)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 flex items-center gap-1">
                          <Badge variant={calidadVariant[cat] ?? "secondary-soft"}>
                            {lead.quality.toUpperCase()}
                          </Badge>
                          <ChevronDown className="h-3 w-3 text-muted-foreground" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {["a+", "a", "b+", "b", "c"].map((c) => (
                          <DropdownMenuItem
                            key={c}
                            onClick={() => updateQuality.mutate({ id: lead.id, quality: c })}
                          >
                            <Badge variant={calidadVariant[c] ?? "secondary-soft"} className="mr-2">
                              {c.toUpperCase()}
                            </Badge>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
          {sorted.length === 0 && (
            <TableRow>
              <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                No se encontraron leads.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default LeadGenTable;
