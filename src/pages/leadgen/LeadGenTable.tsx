import React, { useState, useCallback, useMemo } from "react";
import { ArrowUpDown, ExternalLink, Eye, ChevronDown, Phone, UserPlus, CheckCircle2, ClipboardCheck, MessageSquare, MoreHorizontal, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUpdateLeadQuality, useUpdateLeadField, useLeadGenQA, useCreateQAReview } from "./useLeadGen";
import type { LeadGenEntry } from "./useLeadGen";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/hooks/useAuth";

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

type SortKey = "hora" | "handle" | "agente" | "agencia" | "categoria" | "pais" | "contacto" | "qa" | "of";

const QA_RATING_OPTIONS = [
  { value: "bien", label: "Bien", variant: "success-soft" as const },
  { value: "regular", label: "Regular", variant: "warning-soft" as const },
  { value: "mal", label: "Mal", variant: "destructive-soft" as const },
];

interface Props {
  leads: LeadGenEntry[];
  onView?: (lead: LeadGenEntry) => void;
  onEdit?: (lead: LeadGenEntry) => void;
  profiles?: { id: string; full_name: string | null }[];
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
  const p = (entry.platform || "").toLowerCase();
  const handle = entry.model_handle || "";
  if (p.includes("instagram")) return `https://instagram.com/${handle}`;
  if (p.includes("tiktok")) return `https://tiktok.com/@${handle}`;
  if (p.includes("twitter") || p.includes("x")) return `https://x.com/${handle}`;
  return handle ? `https://${handle}` : "#";
};

// Inline agent reassignment for orphan leads
const AgentReassignCell = React.memo(({ lead, profiles }: { lead: LeadGenEntry; profiles: { id: string; full_name: string | null }[] }) => {
  const updateField = useUpdateLeadField();

  return (
    <Select
      onValueChange={(val) => {
        updateField.mutate({ id: lead.id, field: "lg_user_id", value: val });
      }}
    >
      <SelectTrigger
        className="h-7 w-[140px] text-xs border-dashed border-warning text-warning"
        onClick={(e) => e.stopPropagation()}
      >
        <UserPlus className="h-3 w-3 mr-1" />
        <SelectValue placeholder="Vincular agente" />
      </SelectTrigger>
      <SelectContent onClick={(e) => e.stopPropagation()}>
        {profiles.map((p) => (
          <SelectItem key={p.id} value={p.id} className="text-xs">
            {p.full_name || "Sin nombre"}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
});
AgentReassignCell.displayName = "AgentReassignCell";

// QA Review Cell
const QACell = React.memo(({ lead, qaMap, canReview }: { lead: LeadGenEntry; qaMap: Record<string, any>; canReview: boolean }) => {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState("");
  const [comment, setComment] = useState("");
  const createQA = useCreateQAReview();
  const { user } = useAuth();

  const existing = qaMap[lead.id];

  if (existing) {
    const opt = QA_RATING_OPTIONS.find(o => o.value === existing.rating);
    return (
      <Badge variant={opt?.variant ?? "secondary-soft"}>
        {opt?.label ?? existing.rating}
      </Badge>
    );
  }

  if (!canReview) return <span className="text-muted-foreground">—</span>;

  const handleSave = () => {
    if (!rating || !user?.id) return;
    createQA.mutate({
      entry_id: lead.id,
      supervisor_id: user.id,
      score: rating,
      rating,
      comment: comment.trim() || undefined,
    });
    setOpen(false);
    setRating("");
    setComment("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <ClipboardCheck className="h-3.5 w-3.5" />
          <span>Revisar</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start" onClick={(e) => e.stopPropagation()}>
        <p className="text-xs font-medium mb-2">Calificar lead</p>
        <div className="flex gap-1 mb-2">
          {QA_RATING_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              size="sm"
              variant={rating === opt.value ? "default" : "outline"}
              className="flex-1 h-7 text-xs"
              onClick={() => setRating(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
        <Textarea
          placeholder="Comentario (opcional)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="text-xs h-16 mb-2"
        />
        <Button size="sm" className="w-full h-7 text-xs" disabled={!rating || createQA.isPending} onClick={handleSave}>
          {createQA.isPending ? "Guardando..." : "Guardar"}
        </Button>
      </PopoverContent>
    </Popover>
  );
});
QACell.displayName = "QACell";

// Memoized row
const LeadRow = React.memo(({ lead, onView, profiles, qaMap, canReview }: { lead: LeadGenEntry; onView?: (lead: LeadGenEntry) => void; profiles?: { id: string; full_name: string | null }[]; qaMap: Record<string, any>; canReview: boolean }) => {
  const isOrphan = lead.agent_name === "—" && profiles && profiles.length > 0;

  return (
    <TableRow className="cursor-pointer" onClick={() => onView?.(lead)}>
      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
        {format(new Date(lead.created_at), "dd/MM/yyyy hh:mm a", { locale: es })}
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
      <TableCell className="text-sm" onClick={(e) => e.stopPropagation()}>
        {(lead as any).onlyfans_url ? (
          <a
            href={(lead as any).onlyfans_url.startsWith("http") ? (lead as any).onlyfans_url : `https://onlyfans.com/${(lead as any).onlyfans_url}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <span className="truncate max-w-[100px]">OF</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground" onClick={(e) => isOrphan && e.stopPropagation()}>
        {isOrphan ? (
          <AgentReassignCell lead={lead} profiles={profiles!} />
        ) : (
          lead.agent_name || "—"
        )}
      </TableCell>
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
      <TableCell className="text-center text-sm" onClick={(e) => e.stopPropagation()}>
        <QACell lead={lead} qaMap={qaMap} canReview={canReview} />
      </TableCell>
      <TableCell className="sticky right-0 bg-card" onClick={(e) => e.stopPropagation()}>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onView?.(lead)}>
          <Eye className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
});
LeadRow.displayName = "LeadRow";

const LeadGenTable = ({ leads, onView, onEdit, profiles }: Props) => {
  const [sortKey, setSortKey] = useState<SortKey>("hora");
  const [sortAsc, setSortAsc] = useState(false);
  const { isAdmin, isSupervisor } = useUserRole();
  const canReview = isAdmin || isSupervisor;

  const entryIds = useMemo(() => leads.map(l => l.id), [leads]);
  const { data: qaReviews = [] } = useLeadGenQA(entryIds);
  const qaMap = useMemo(() => {
    const map: Record<string, any> = {};
    for (const r of qaReviews) {
      if (r.entry_id && !map[r.entry_id]) map[r.entry_id] = r;
    }
    return map;
  }, [qaReviews]);

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
      
      case "handle": va = a.model_handle; vb = b.model_handle; break;
      case "of": va = (a as any).onlyfans_url ?? ""; vb = (b as any).onlyfans_url ?? ""; break;
      case "agente": va = a.agent_name ?? ""; vb = b.agent_name ?? ""; break;
      case "agencia": va = a.company ?? ""; vb = b.company ?? ""; break;
      case "categoria": va = a.quality; vb = b.quality; break;
      case "pais": va = a.country_code ?? ""; vb = b.country_code ?? ""; break;
      case "contacto": va = ""; vb = ""; break;
      case "qa": va = qaMap[a.id]?.rating ?? ""; vb = qaMap[b.id]?.rating ?? ""; break;
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
    <Table containerClassName="overflow-visible" className="min-w-[1050px]">
      <TableHeader>
        <TableRow>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="Creación" col="hora" /></TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="Handle" col="handle" /></TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="OF URL" col="of" /></TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="Agente" col="agente" /></TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="Agencia" col="agencia" /></TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="Categoría" col="categoria" /></TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="País" col="pais" /></TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="Contacto" col="contacto" /></TableHead>
          <TableHead className="sticky top-0 z-20 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><SortHeader label="QA" col="qa" /></TableHead>
          <TableHead className="sticky top-0 right-0 z-30 bg-card shadow-[0_1px_0_0_hsl(var(--border))] w-[80px]">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((lead) => (
          <LeadRow key={lead.id} lead={lead} onView={onView} profiles={profiles} qaMap={qaMap} canReview={canReview} />
        ))}
        {sorted.length === 0 && (
          <TableRow>
            <TableCell colSpan={11} className="h-24 text-center text-muted-foreground">
              No se encontraron leads.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
};

export default LeadGenTable;
