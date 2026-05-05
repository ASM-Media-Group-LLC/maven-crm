import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Pencil, Save, X, Star, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  useUpdateLead,
  useToggleLeadFavorite,
  useLeadFavoriteIds,
  type LeadPatch,
  type ScouterLead,
} from "@/hooks/useScouterLeads";

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

// ─── Country flag mapper ────────────────────────────────────────────────
const COUNTRY_FLAGS: Record<string, string> = {
  colombia: "🇨🇴", mexico: "🇲🇽", méxico: "🇲🇽", argentina: "🇦🇷",
  chile: "🇨🇱", peru: "🇵🇪", perú: "🇵🇪", ecuador: "🇪🇨",
  venezuela: "🇻🇪", "united states": "🇺🇸", usa: "🇺🇸", "estados unidos": "🇺🇸",
  spain: "🇪🇸", españa: "🇪🇸", brazil: "🇧🇷", brasil: "🇧🇷",
  "dominican republic": "🇩🇴", "república dominicana": "🇩🇴", "costa rica": "🇨🇷",
  panama: "🇵🇦", panamá: "🇵🇦", guatemala: "🇬🇹", honduras: "🇭🇳",
  "el salvador": "🇸🇻", nicaragua: "🇳🇮", uruguay: "🇺🇾", paraguay: "🇵🇾",
  bolivia: "🇧🇴", "puerto rico": "🇵🇷", cuba: "🇨🇺",
  canada: "🇨🇦", canadá: "🇨🇦", uk: "🇬🇧", "united kingdom": "🇬🇧",
  france: "🇫🇷", francia: "🇫🇷", germany: "🇩🇪", alemania: "🇩🇪",
  italy: "🇮🇹", italia: "🇮🇹", portugal: "🇵🇹", romania: "🇷🇴", rumania: "🇷🇴",
  philippines: "🇵🇭", filipinas: "🇵🇭", japan: "🇯🇵", japón: "🇯🇵",
  australia: "🇦🇺", india: "🇮🇳",
};

export const countryToFlag = (country: string | null | undefined): string => {
  if (!country) return "";
  return COUNTRY_FLAGS[country.toLowerCase().trim()] ?? "🌍";
};

// ─── Verified badge (IG-style) ──────────────────────────────────────────
export const VerifiedBadge = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path
      d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z"
      fill="#0ea5e9"
    />
    <path
      d="M10.3 15.7l-3-3 1.4-1.4 1.6 1.6 4.6-4.6 1.4 1.4-6 6z"
      fill="white"
    />
  </svg>
);

// ─── Quick-action statuses for modal footer ─────────────────────────────
const QUICK_ACTIONS: Array<{ status: string; label: string; color: string }> = [
  { status: "active",     label: "Activa",      color: "#22c55e" },
  { status: "contacting", label: "Contactando", color: "#eab308" },
  { status: "rejected",   label: "No cerró",    color: "#ef4444" },
  { status: "discarded",  label: "Descartar",   color: "#71717a" },
];

// ─── Lead modal (centered dialog, replaces old Sheet drawer) ────────────
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
  const toggleFavoriteMut = useToggleLeadFavorite();
  const favoriteIdsQ = useLeadFavoriteIds();
  const favoriteIds = favoriteIdsQ.data ?? new Set<string>();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<LeadPatch>({});

  useEffect(() => {
    if (!open) return;
    setEditing(false);
    setDraft({});
  }, [open, lead?.id]);

  if (!lead) return null;

  const isFavorite = favoriteIds.has(lead.id);
  const statusCfg = STATUS_META[lead.status] ?? STATUS_META.discovery;
  const aiScore = lead.ai_score;
  const sc = scoreColor(aiScore);

  const initial = (
    lead.name?.trim().charAt(0) ||
    lead.instagram_handle.charAt(0) ||
    "?"
  ).toUpperCase();

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

  const handleQuickStatus = async (newStatus: string) => {
    try {
      await update.mutateAsync({ id: lead.id, patch: { status: newStatus as LeadPatch["status"] } });
      toast.success(`Status → ${newStatus}`);
      onOpenChange(false);
    } catch {
      // handled by mutation
    }
  };

  // Parse AI reasons from ai_reason field (split on ; or newlines)
  const aiReasons = (lead.ai_reason ?? "")
    .split(/[;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[92vh] w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden bg-card p-0 gap-0"
      >
        {/* Accessible title (visually hidden) */}
        <DialogTitle className="sr-only">
          @{lead.instagram_handle}
        </DialogTitle>

        {/* Scrollable body */}
        <div className="overflow-y-auto max-h-[calc(92vh-80px)]">
          {/* ── Header ── */}
          <div className="flex items-center gap-3 p-4 pr-12 pb-2">
            {/* Avatar */}
            <div
              className="h-14 w-14 shrink-0 overflow-hidden rounded-full"
              style={{ background: initialsBg(lead.instagram_handle) }}
            >
              {lead.photo_data_url ? (
                <img
                  src={lead.photo_data_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-lg font-bold text-white/90">
                  {initial}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-semibold">@{lead.instagram_handle}</span>
                {lead.verified && <VerifiedBadge size={16} />}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {lead.name || "Sin nombre"}
              </div>
            </div>
            {/* Score */}
            {aiScore != null && (
              <div className="text-right shrink-0">
                <div
                  className="text-2xl font-extrabold tabular-nums leading-none"
                  style={{ color: sc }}
                >
                  {aiScore.toFixed(1)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">score</div>
              </div>
            )}
          </div>

          {/* Score bar */}
          <div className="w-full h-1 bg-muted/30">
            <div
              className="h-full transition-all"
              style={{
                width: `${Math.min((aiScore ?? 0) * 10, 100)}%`,
                backgroundColor: sc,
              }}
            />
          </div>

          {/* Status + company pills */}
          <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3">
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
              style={{
                borderColor: statusCfg.dot + "60",
                color: statusCfg.dot,
                backgroundColor: statusCfg.dot + "15",
              }}
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: statusCfg.dot }}
              />
              {statusCfg.label}
            </span>
            {lead.category && (
              <span className="rounded-full border border-amber-400/60 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-400">
                {lead.category}
              </span>
            )}
            {lead.country && (
              <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                {countryToFlag(lead.country)} {lead.country}
              </span>
            )}
          </div>

          {/* ── Bio (editable) ── */}
          <div className="px-4 pt-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
              Bio
            </div>
            {editing ? (
              <Textarea
                value={(get("bio") as string) ?? ""}
                rows={4}
                placeholder="Bio del perfil…"
                onChange={(e) => setField("bio", e.target.value || null)}
                className="text-sm"
              />
            ) : (
              <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-line min-h-[40px]">
                {lead.bio || <span className="text-muted-foreground italic">Sin bio</span>}
              </div>
            )}
          </div>

          {/* ── AI Analysis ── */}
          {aiReasons.length > 0 && (
            <div className="px-4 pt-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                Analisis IA
              </div>
              <ul className="space-y-1 rounded-md border bg-muted/20 p-3 text-sm">
                {aiReasons.map((reason, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-1.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                    <span className="text-foreground/90">{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── Pipeline fields ── */}
          <div className="px-4 pt-3 pb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Pipeline
              </div>
              {editing ? (
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => { setEditing(false); setDraft({}); }}
                    disabled={update.isPending}
                  >
                    <X className="mr-1 h-3 w-3" /> Cancelar
                  </Button>
                  <Button size="sm" className="h-7 text-xs gap-1" onClick={handleSave} disabled={update.isPending}>
                    {update.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Save className="h-3 w-3" />
                    )}
                    Guardar
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => setEditing(true)}>
                  <Pencil className="h-3 w-3" /> Editar
                </Button>
              )}
            </div>

            <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
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

                <Field label="Seguidores">
                  <span>{formatFollowers(lead.followers)}</span>
                </Field>

                <Field label="Link-in-bio">
                  <span>{lead.link_in_bio_platform ?? "—"}</span>
                </Field>

                <Field label="Fuente">
                  <span>{lead.discovery_source ?? "—"}</span>
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
          </div>
        </div>

        {/* ── Sticky footer ── */}
        <div className="border-t bg-card px-4 py-3 space-y-2">
          {/* Quick-action status buttons */}
          <div className="grid grid-cols-4 gap-1.5">
            {QUICK_ACTIONS.map((qa) => (
              <button
                key={qa.status}
                type="button"
                disabled={update.isPending}
                onClick={() => handleQuickStatus(qa.status)}
                className="rounded-lg border px-1 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-colors hover:opacity-80 disabled:opacity-50"
                style={{
                  borderColor: qa.color + "50",
                  color: qa.color,
                  backgroundColor: qa.color + "15",
                }}
              >
                {qa.label}
              </button>
            ))}
          </div>
          {/* Favorite + Guardar + IG link row */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                toggleFavoriteMut.mutate({ leadId: lead.id, isFavorite })
              }
              className="flex h-8 w-8 items-center justify-center rounded-md border transition-colors hover:bg-muted"
              aria-label={isFavorite ? "Quitar de favoritos" : "Marcar como favorito"}
            >
              <Star
                className="h-4 w-4"
                fill={isFavorite ? "rgb(251 191 36)" : "transparent"}
                stroke={isFavorite ? "rgb(251 191 36)" : "currentColor"}
                strokeWidth={2}
              />
            </button>
            <Button
              size="sm"
              className="flex-1 gap-1"
              onClick={handleSave}
              disabled={update.isPending || Object.keys(draft).length === 0}
            >
              {update.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Guardar
            </Button>
            {lead.instagram_url && (
              <a
                href={lead.instagram_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-8 w-8 items-center justify-center rounded-md border transition-colors hover:bg-muted"
                aria-label="Abrir perfil de Instagram"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
