import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldCheck, Loader2, Pencil, Save, X } from "lucide-react";
import { toast } from "sonner";
import { useUpdateLead, type LeadPatch, type ScouterLead } from "@/hooks/useScouterLeads";

// ─── Status palette (shared by Home grid + Leads table) ────────────────
export const STATUS_META: Record<string, { label: string; dot: string }> = {
  discovery:  { label: "Discovery",       dot: "#6366f1" },
  candidate:  { label: "Candidate",       dot: "#0ea5e9" },
  contacting: { label: "Contacting",      dot: "#fbbf24" },
  confirmed:  { label: "Confirmed",       dot: "#22c55e" },
  active:     { label: "Active",          dot: "#10b981" },
  rejected:   { label: "Cierre fallido",  dot: "#f87171" },
  discarded:  { label: "Descarte",        dot: "#a1a1aa" },
};

export const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "discovery",  label: "Discovery" },
  { value: "candidate",  label: "Candidate" },
  { value: "contacting", label: "Contacting" },
  { value: "confirmed",  label: "Confirmed" },
  { value: "active",     label: "Active" },
  { value: "rejected",   label: "Cierre fallido" },
  { value: "discarded",  label: "Descarte" },
  { value: "all",        label: "Todos" },
];

// ─── Visual helpers ─────────────────────────────────────────────────────
export const formatFollowers = (n: number | null): string => {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
};

export const scoreColor = (score: number | null): string => {
  if (score == null) return "rgb(148 163 184)";
  if (score >= 8) return "rgb(34 197 94)";
  if (score >= 7) return "rgb(234 179 8)";
  if (score >= 6) return "rgb(249 115 22)";
  return "rgb(239 68 68)";
};

export const initialsBg = (seed: string): string => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return `linear-gradient(135deg, hsl(${h}, 40%, 30%) 0%, hsl(${(h + 60) % 360}, 50%, 20%) 100%)`;
};

// ─── Lead drawer (shared, editable) ─────────────────────────────────────
export const LeadDrawer = ({
  lead,
  open,
  onOpenChange,
}: {
  lead: ScouterLead | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) => {
  const update = useUpdateLead();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<LeadPatch>({});

  useEffect(() => {
    if (!open) return;
    setEditing(false);
    setDraft({});
  }, [open, lead?.id]);

  if (!lead) return null;

  const setField = <K extends keyof LeadPatch>(key: K, value: LeadPatch[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const get = <K extends keyof LeadPatch>(key: K): LeadPatch[K] | undefined =>
    (key in draft ? draft[key] : (lead[key as keyof ScouterLead] as LeadPatch[K]));

  const handleSave = async () => {
    if (Object.keys(draft).length === 0) {
      setEditing(false);
      return;
    }
    try {
      await update.mutateAsync({ id: lead.id, patch: draft });
      toast.success("Lead actualizado");
      setEditing(false);
      setDraft({});
    } catch {
      // toast already surfaced inside the mutation onError
    }
  };

  const readOnlyFields: Array<[string, React.ReactNode]> = [
    ["AI score", lead.ai_score != null ? lead.ai_score.toFixed(1) : "—"],
    ["AI status", lead.ai_status ?? "—"],
    ["AI reason", lead.ai_reason ?? "—"],
    ["Seguidores", formatFollowers(lead.followers)],
    ["Link-in-bio", lead.link_in_bio_platform ?? "—"],
    ["Fuente", lead.discovery_source ?? "—"],
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full max-w-md overflow-y-auto sm:max-w-lg">
        <SheetHeader className="space-y-1">
          <SheetTitle className="flex items-center gap-2 text-base">
            @{lead.instagram_handle}
            {lead.verified && (
              <ShieldCheck className="h-4 w-4" style={{ color: "rgb(14 165 233)" }} />
            )}
          </SheetTitle>
          <SheetDescription>{lead.name || "Sin nombre"}</SheetDescription>
        </SheetHeader>

        <div className="mt-3 flex items-center justify-end gap-2">
          {editing ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setDraft({});
                }}
                disabled={update.isPending}
              >
                <X className="mr-1 h-3.5 w-3.5" /> Cancelar
              </Button>
              <Button size="sm" onClick={handleSave} disabled={update.isPending} className="gap-1">
                {update.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Guardar
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)} className="gap-1">
              <Pencil className="h-3.5 w-3.5" /> Editar
            </Button>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4">
          {lead.photo_data_url && (
            <img src={lead.photo_data_url} alt="" className="aspect-square w-full rounded-lg object-cover" />
          )}
          {lead.bio && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-line">
              {lead.bio}
            </div>
          )}

          <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Pipeline
            </div>

            <div className="grid grid-cols-1 gap-2">
              <Field label="Status">
                {editing ? (
                  <Select
                    value={(get("status") as string) ?? "discovery"}
                    onValueChange={(v) => setField("status", v)}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.filter((o) => o.value !== "all").map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span>{STATUS_META[lead.status]?.label ?? lead.status}</span>
                )}
              </Field>

              <Field label="Categoría">
                {editing ? (
                  <Input
                    value={(get("category") as string) ?? ""}
                    placeholder="A++ / A / B+ / B / C+ / C"
                    onChange={(e) => setField("category", e.target.value || null)}
                    className="h-8"
                  />
                ) : (
                  <span>{lead.category ?? "—"}</span>
                )}
              </Field>

              <Field label="Closer asignado">
                {editing ? (
                  <Input
                    value={(get("assigned_closer") as string) ?? ""}
                    placeholder="Nombre del closer"
                    onChange={(e) => setField("assigned_closer", e.target.value || null)}
                    className="h-8"
                  />
                ) : (
                  <span>{lead.assigned_closer ?? "—"}</span>
                )}
              </Field>

              <Field label="País">
                {editing ? (
                  <Input
                    value={(get("country") as string) ?? ""}
                    onChange={(e) => setField("country", e.target.value || null)}
                    className="h-8"
                  />
                ) : (
                  <span>{lead.country ?? "—"}</span>
                )}
              </Field>

              <Field label="Ciudad">
                {editing ? (
                  <Input
                    value={(get("city") as string) ?? ""}
                    onChange={(e) => setField("city", e.target.value || null)}
                    className="h-8"
                  />
                ) : (
                  <span>{lead.city ?? "—"}</span>
                )}
              </Field>

              <Field label="OnlyFans">
                {editing ? (
                  <Input
                    value={(get("onlyfans_url") as string) ?? ""}
                    placeholder="https://onlyfans.com/…"
                    onChange={(e) => setField("onlyfans_url", e.target.value || null)}
                    className="h-8"
                  />
                ) : (
                  <span className="break-all">{lead.onlyfans_url ?? "—"}</span>
                )}
              </Field>

              <Field label="Plataforma">
                {editing ? (
                  <Input
                    value={(get("platform") as string) ?? ""}
                    onChange={(e) => setField("platform", e.target.value || null)}
                    className="h-8"
                  />
                ) : (
                  <span>{lead.platform ?? "—"}</span>
                )}
              </Field>

              <Field label="Notas" stacked>
                {editing ? (
                  <Textarea
                    value={(get("notes") as string) ?? ""}
                    rows={3}
                    onChange={(e) => setField("notes", e.target.value || null)}
                  />
                ) : (
                  <span className="whitespace-pre-line">{lead.notes ?? "—"}</span>
                )}
              </Field>
            </div>
          </div>

          <div className="space-y-1.5 rounded-lg border border-border bg-muted/20 p-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Señales (read-only)
            </div>
            <dl className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1.5 text-sm">
              {readOnlyFields.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {k}
                  </dt>
                  <dd className="text-foreground">{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <p className="text-xs text-muted-foreground">
            Para marcar / desmarcar como favorito, usa la estrella sobre la foto
            del lead.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
};

const Field = ({
  label,
  stacked,
  children,
}: {
  label: string;
  stacked?: boolean;
  children: React.ReactNode;
}) => (
  <div
    className={
      stacked
        ? "grid grid-cols-1 gap-1"
        : "grid grid-cols-[120px_1fr] items-center gap-2"
    }
  >
    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {label}
    </div>
    <div className="text-sm text-foreground">{children}</div>
  </div>
);
