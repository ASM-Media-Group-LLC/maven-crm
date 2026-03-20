import React, { useState, useCallback } from "react";
import { ArrowUpDown, ExternalLink, Eye, ChevronDown, Phone } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import InstagramIcon from "@/components/icons/InstagramIcon";
import TikTokIcon from "@/components/icons/TikTokIcon";
import XIcon from "@/components/icons/XIcon";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { useUpdateLeadQuality, useUpdateLeadField } from "./useLeadGen";
import type { LeadGenEntry } from "./useLeadGen";

const QUALITY_OPTIONS = ["a+", "a", "b+", "b", "c"] as const;

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

const cleanPhoneForWhatsApp = (phone: string) =>
  phone.replace(/[^\d]/g, "");

type SortKey = "hora" | "ticket" | "handle" | "agente" | "agencia" | "calidad" | "pais" | "contacto" | "qa";

interface Props {
  leads: LeadGenEntry[];
  onView?: (lead: LeadGenEntry) => void;
  onEdit?: (lead: LeadGenEntry) => void;
}

// Inline quality editor
const QualityCell = React.memo(({ lead }: { lead: LeadGenEntry }) => {
  const [open, setOpen] = useState(false);
  const updateQuality = useUpdateLeadQuality();
  const cat = lead.quality.toLowerCase();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="cursor-pointer hover:ring-1 hover:ring-border rounded-md px-0.5 py-0.5 transition-all flex items-center gap-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <Badge variant={calidadVariant[cat] ?? "secondary-soft"}>
            {lead.quality.toUpperCase()}
          </Badge>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-1.5" align="start" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col gap-0.5">
          {QUALITY_OPTIONS.map((q) => (
            <button
              key={q}
              className="flex items-center px-2 py-1.5 rounded-md hover:bg-muted transition-colors text-left"
              onClick={() => {
                updateQuality.mutate({ id: lead.id, quality: q });
                setOpen(false);
              }}
            >
              <Badge variant={calidadVariant[q] ?? "secondary-soft"}>{q.toUpperCase()}</Badge>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
});
QualityCell.displayName = "QualityCell";

// Inline editable company/source cell
const InlineSourceCell = React.memo(({ lead }: { lead: LeadGenEntry }) => {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(lead.company || "");
  const updateField = useUpdateLeadField();

  const save = () => {
    setEditing(false);
    const newVal = text.trim();
    if (newVal !== (lead.company || "")) {
      updateField.mutate({ id: lead.id, field: "company", value: newVal || null });
    }
  };

  if (!editing) {
    return (
      <span
        className="cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5 block max-w-[140px] truncate text-sm text-muted-foreground"
        onClick={(e) => { e.stopPropagation(); setText(lead.company || ""); setEditing(true); }}
        title={lead.company || "Click para editar"}
      >
        {lead.company || "—"}
      </span>
    );
  }

  return (
    <Input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
      onBlur={save}
      onClick={(e) => e.stopPropagation()}
      autoFocus
      className="h-7 text-sm w-36"
    />
  );
});
InlineSourceCell.displayName = "InlineSourceCell";

const buildProfileUrl = (entry: LeadGenEntry) => {
  if (entry.source_link) return entry.source_link;
  const p = entry.platform.toLowerCase();
  if (p.includes("instagram")) return `https://instagram.com/${entry.model_handle}`;
  if (p.includes("tiktok")) return `https://tiktok.com/@${entry.model_handle}`;
  if (p.includes("twitter") || p.includes("x")) return `https://x.com/${entry.model_handle}`;
  return `https://${entry.model_handle}`;
};

// Memoized row
const LeadRow = React.memo(({ lead, onView }: { lead: LeadGenEntry; onView?: (lead: LeadGenEntry) => void }) => (
  <TableRow className="cursor-pointer" onClick={() => onView?.(lead)}>
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
    <TableCell className="text-sm text-muted-foreground">{lead.agent_name || "—"}</TableCell>
    <TableCell onClick={(e) => e.stopPropagation()}>
      <InlineSourceCell lead={lead} />
    </TableCell>
    <TableCell><QualityCell lead={lead} /></TableCell>
    <TableCell className="text-center text-lg">{countryToFlag(lead.country_code)}</TableCell>
    <TableCell className="text-sm" onClick={(e) => e.stopPropagation()}>
      {lead.phone_raw ? (
        <a
          href={`https://wa.me/${cleanPhoneForWhatsApp(lead.phone_e164 || lead.phone_raw)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-primary hover:underline"
        >
          <Phone className="h-3 w-3" />
          <span className="truncate max-w-[100px]">{lead.phone_raw}</span>
        </a>
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
    </TableCell>
    <TableCell className="text-center text-sm text-muted-foreground">—</TableCell>
    <TableCell className="sticky right-0 bg-card" onClick={(e) => e.stopPropagation()}>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onView?.(lead)}>
        <Eye className="h-4 w-4" />
      </Button>
    </TableCell>
  </TableRow>
));
LeadRow.displayName = "LeadRow";

const LeadGenTable = ({ leads, onView, onEdit }: Props) => {
  const [sortKey, setSortKey] = useState<SortKey>("hora");
  const [sortAsc, setSortAsc] = useState(false);

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortAsc((a) => !a);
        return prev;
      }
      setSortAsc(true);
      return key;
    });
  }, []);

  const sorted = [...leads].sort((a, b) => {
    let va = "", vb = "";
    switch (sortKey) {
      case "hora": va = a.created_at; vb = b.created_at; break;
      case "ticket": va = a.id; vb = b.id; break;
      case "handle": va = a.model_handle; vb = b.model_handle; break;
      case "agente": va = a.agent_name ?? ""; vb = b.agent_name ?? ""; break;
      case "agencia": va = a.company ?? ""; vb = b.company ?? ""; break;
      case "calidad": va = a.quality; vb = b.quality; break;
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

  return (
    <Table containerClassName="overflow-visible" className="min-w-[900px]">
      <TableHeader>
        <TableRow>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="Hora" col="hora" /></TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="Ticket" col="ticket" /></TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="Handle" col="handle" /></TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="Agente" col="agente" /></TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="Agencia" col="agencia" /></TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="Calidad" col="calidad" /></TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="País" col="pais" /></TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="Contacto" col="contacto" /></TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="QA" col="qa" /></TableHead>
          <TableHead className="sticky top-0 right-0 z-30 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((lead) => (
          <LeadRow key={lead.id} lead={lead} onView={onView} />
        ))}
        {sorted.length === 0 && (
          <TableRow>
            <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
              No se encontraron leads.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
};

export default LeadGenTable;
