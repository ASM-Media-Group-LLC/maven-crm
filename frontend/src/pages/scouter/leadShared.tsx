import { useEffect, useState } from "react";
import { WhatsAppPhone } from "@/components/MaskedPhone";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Loader2, Pencil, Save, X, Star, ExternalLink, ArrowRight, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  useUpdateLead,
  useToggleLeadFavorite,
  useLeadFavoriteIds,
  useScouterCompanies,
  useDiscardLead,
  type LeadPatch,
  type ScouterLead,
} from "@/hooks/useScouterLeads";
import ConvertScouterLeadModal from "./ConvertScouterLeadModal";
import { COUNTRIES_ALPHA, COUNTRY_FLAGS } from "@/lib/countries";

// ─── Status palette (shared by Home grid + Leads table) ────────────────
// Nota: a partir de la simplificación del popup (2026-05), los closer
// y spammer manejan solo 3 outcomes: Descartar / Se interesó / No
// responde. Los statuses internos (discovery, candidate, contacting,
// active) los siguen usando los workflows automáticos del worker y de
// IA — no los exponemos como botones del popup.
export const STATUS_META: Record<string, { label: string; dot: string }> = {
  discovery:  { label: "Discovery",   dot: "#6366f1" },
  candidate:  { label: "Candidate",   dot: "#0ea5e9" },
  contacting: { label: "Contactando", dot: "#fbbf24" },
  confirmed:  { label: "Se interesó", dot: "#22c55e" },
  active:     { label: "Active",      dot: "#10b981" },
  rejected:   { label: "No responde", dot: "#f87171" },
  discarded:  { label: "Descarte",    dot: "#a1a1aa" },
};

export const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "discovery",  label: "Discovery" },
  { value: "candidate",  label: "Candidate" },
  { value: "contacting", label: "Contactando" },
  { value: "confirmed",  label: "Se interesó" },
  { value: "active",     label: "Active" },
  { value: "rejected",   label: "No responde" },
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

// Flag helper — usa el mapa canónico centralizado en @/lib/countries.
// Antes había un Record local con keys en lowercase, pero ahora que
// hay backfill + Select cerrado, las keys vienen ya canónicas.
export const countryToFlag = (country: string | null | undefined): string => {
  if (!country) return "";
  return COUNTRY_FLAGS[country] ?? COUNTRY_FLAGS[country.trim()] ?? "🌍";
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
// Reducido a los 3 outcomes que un closer/spammer realmente marca tras
// un intento de contacto. "Active" y "contacting" se asignan
// automáticamente y no se exponen como botón.
const QUICK_ACTIONS: Array<{ status: string; label: string; color: string }> = [
  { status: "discarded",  label: "Descartar",    color: "#71717a" },
  { status: "confirmed",  label: "Se interesó",  color: "#22c55e" },
  { status: "rejected",   label: "No responde",  color: "#f87171" },
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
  const discardLead = useDiscardLead();
  const toggleFavoriteMut = useToggleLeadFavorite();
  const favoriteIdsQ = useLeadFavoriteIds();
  const favoriteIds = favoriteIdsQ.data ?? new Set<string>();
  // Lista de compañías para el selector manual de target_companies.
  // La IA pre-asigna las companías que cree que califican, pero el user
  // puede sobrescribir desde el popup tickeando las que quiere.
  const companiesQ = useScouterCompanies();
  const companies = companiesQ.data ?? [];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<LeadPatch>({});
  // Confirmación para Descartar — los otros 2 quick actions
  // (Se interesó / No responde) no requieren confirmación porque
  // son fácilmente revertibles y se accionan mucho. Descartar es
  // más permanente y borra el lead del flujo activo, así que pide
  // que el usuario lo piense un segundo.
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);

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

  // Best-effort URL al perfil de Instagram. Preferimos la columna
  // explícita (lead.instagram_url) si está; si no, derivamos del
  // handle. Lo usamos en 3 lugares: avatar clickeable, nombre/handle
  // clickeable, y el botón "Contactar" del footer.
  const instagramUrl =
    lead.instagram_url ??
    (lead.instagram_handle
      ? `https://instagram.com/${lead.instagram_handle.replace(/^@/, "")}`
      : null);

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
      // Si el draft tocó target_companies, marcamos manual_company_assignment.
      // Eso convierte el lead en un "seed" válido para el lookalike de
      // futuras búsquedas en esa compañía — señal humana de fit.
      const patch: LeadPatch = { ...draft };
      if ("target_companies" in draft) {
        patch.manual_company_assignment = true;
        // Si el user desmarcó la company_id que vino del scouter, hay
        // que sincronizar: si target_companies tiene otras, el trigger
        // de DB ya pone company_id al primero. Si target_companies
        // queda vacío, lo seteamos a null explícito para que el lead
        // deje de pertenecer a esa compañía del scraper.
        const newTargets = (draft.target_companies ?? []) as string[];
        const currentCompanySlug = lead.company_id
          ? companies.find((c) => c.id === lead.company_id)?.slug
          : null;
        const stillHasCurrent =
          currentCompanySlug !== null && newTargets.includes(currentCompanySlug ?? "");
        if (newTargets.length === 0) {
          patch.company_id = null as unknown as string;
        } else if (currentCompanySlug && !stillHasCurrent) {
          // Reemplazo: company_id pasa a la primera de las nuevas.
          const firstId = companies.find((c) => c.slug === newTargets[0])?.id ?? null;
          patch.company_id = firstId as unknown as string;
        }
      }
      await update.mutateAsync({ id: lead.id, patch });
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
        className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-2xl border shadow-2xl overflow-hidden bg-card p-0 gap-0"
      >
        {/* Accessible title (visually hidden) */}
        <DialogTitle className="sr-only">
          @{lead.instagram_handle}
        </DialogTitle>

        {/* Scrollable body — flex-1 hace que tome todo el espacio
            disponible entre el top y el footer sticky. Antes usábamos
            max-h fijo (calc(92vh-80px)) pero el footer creció con el
            botón "Contactar" y se cortaban filas. */}
        <div className="flex-1 overflow-y-auto">
          {/* ── Header ── */}
          <div className="flex items-center gap-3 p-4 pr-12 pb-2">
            {/* Avatar — clickeable para abrir IG si hay URL */}
            {instagramUrl ? (
              <a
                href={instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="h-14 w-14 shrink-0 overflow-hidden rounded-full transition-all hover:ring-2 hover:ring-primary hover:opacity-90"
                style={{ background: initialsBg(lead.instagram_handle) }}
                title="Abrir perfil de Instagram"
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
              </a>
            ) : (
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
            )}
            <div className="flex-1 min-w-0">
              {/* Handle + nombre — también linkean a IG si hay URL */}
              {instagramUrl ? (
                <a
                  href={instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block hover:underline"
                  title="Abrir perfil de Instagram"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold">@{lead.instagram_handle}</span>
                    {lead.verified && <VerifiedBadge size={16} />}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {lead.name || "Sin nombre"}
                  </div>
                </a>
              ) : (
                <>
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold">@{lead.instagram_handle}</span>
                    {lead.verified && <VerifiedBadge size={16} />}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {lead.name || "Sin nombre"}
                  </div>
                </>
              )}
            </div>
            {/* Score + Favorite — el botón de favorito vive acá al lado del
                score (no en el footer) para liberar el "Guardar" a ancho
                completo. */}
            <div className="flex items-center gap-2 shrink-0">
              {aiScore != null && (
                <div className="text-right">
                  <div
                    className="text-2xl font-extrabold tabular-nums leading-none"
                    style={{ color: sc }}
                  >
                    {aiScore.toFixed(1)}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">score</div>
                </div>
              )}
              <button
                type="button"
                onClick={() =>
                  toggleFavoriteMut.mutate({ leadId: lead.id, isFavorite })
                }
                className="flex h-9 w-9 items-center justify-center rounded-md border transition-colors hover:bg-muted"
                aria-label={isFavorite ? "Quitar de favoritos" : "Marcar como favorito"}
              >
                <Star
                  className="h-4 w-4"
                  fill={isFavorite ? "rgb(251 191 36)" : "transparent"}
                  stroke={isFavorite ? "rgb(251 191 36)" : "currentColor"}
                  strokeWidth={2}
                />
              </button>
            </div>
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
            <div className="text-xs font-bold text-muted-foreground mb-1">
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
              <div className="text-xs font-bold text-muted-foreground mb-1">
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
              <div className="text-xs font-bold text-muted-foreground">
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

            <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-3">
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

                {/* Multi-select de compañías que califica. Antes solo
                    miraba target_companies; ahora también incluye la
                    company_id que el scouter asignó al descubrir el
                    lead (sino el chip no aparecía marcado y el user
                    no podía desmarcarla). Al guardar, sincronizamos
                    target_companies = newSet. Si el set queda vacío,
                    seteamos company_id=null para sacar el lead de
                    la compañía del scraper. */}
                <Field label="Compañías que califica" stacked>
                  {(() => {
                    // Slug de la company_id del discovery (si existe en
                    // companies). Es el "owner" original del lead.
                    const discoverySlug = lead.company_id
                      ? companies.find((c) => c.id === lead.company_id)?.slug
                      : null;
                    // Si el user ya tocó el campo (draft.target_companies
                    // definido), respetamos EXACTAMENTE lo que eligió —
                    // sino el toggle del chip scouter se deshace en el
                    // próximo render (bug previo). Solo mergeamos el slug
                    // del scouter cuando el popup recién abre.
                    const draftedTargets = get("target_companies") as string[] | undefined;
                    const current =
                      draftedTargets !== undefined
                        ? draftedTargets
                        : discoverySlug && !(lead.target_companies ?? []).includes(discoverySlug)
                          ? [discoverySlug, ...(lead.target_companies ?? [])]
                          : (lead.target_companies ?? []);
                    if (editing) {
                      return (
                        <div className="flex flex-wrap gap-1.5">
                          {companies.length === 0 ? (
                            <span className="text-xs text-muted-foreground">
                              No hay compañías cargadas.
                            </span>
                          ) : (
                            companies.map((c) => {
                              const isOn = current.includes(c.slug);
                              const isDiscovery = c.slug === discoverySlug;
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => {
                                    const next = isOn
                                      ? current.filter((s) => s !== c.slug)
                                      : [...current, c.slug];
                                    setField("target_companies", next);
                                  }}
                                  title={isDiscovery ? "Asignada por el scouter al descubrir" : undefined}
                                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                    isOn
                                      ? "border-primary bg-primary/15 text-primary"
                                      : "border-border text-muted-foreground hover:border-primary/40"
                                  }`}
                                >
                                  {c.name}
                                  {isDiscovery && isOn && (
                                    <span className="ml-1 text-[9px] opacity-70">(scouter)</span>
                                  )}
                                </button>
                              );
                            })
                          )}
                        </div>
                      );
                    }
                    if (current.length === 0) {
                      return <span className="text-xs text-muted-foreground">—</span>;
                    }
                    return (
                      <div className="flex flex-wrap gap-1.5">
                        {current.map((slug) => {
                          const c = companies.find((co) => co.slug === slug);
                          return (
                            <span
                              key={slug}
                              className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                            >
                              {c?.name ?? slug}
                            </span>
                          );
                        })}
                      </div>
                    );
                  })()}
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
                    <SearchableSelect
                      value={(get("country") as string) ?? "__none__"}
                      onValueChange={(v) =>
                        setField("country", v === "__none__" ? null : v)
                      }
                      placeholder="Seleccionar país"
                      searchPlaceholder="Buscar país…"
                      triggerClassName="w-full h-8 text-xs"
                      options={[
                        { value: "__none__", label: "— Sin país —" },
                        ...COUNTRIES_ALPHA.map((c) => ({
                          value: c,
                          label: `${COUNTRY_FLAGS[c] ?? "🌍"} ${c}`,
                          searchAdditional: c,
                        })),
                      ]}
                    />
                  ) : (
                    <span>
                      {lead.country
                        ? `${COUNTRY_FLAGS[lead.country] ?? "🌍"} ${lead.country}`
                        : "—"}
                    </span>
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

                <Field label="Teléfono">
                  {editing ? (
                    <Input
                      value={(get("phone") as string) ?? ""}
                      placeholder="+57 300 1234567"
                      onChange={(e) => setField("phone", e.target.value || null)}
                      className="h-8"
                    />
                  ) : (
                    <WhatsAppPhone phone={lead.phone} />
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
          <div className="grid grid-cols-3 gap-1.5">
            {QUICK_ACTIONS.map((qa) => (
              <button
                key={qa.status}
                type="button"
                disabled={update.isPending}
                onClick={() => {
                  if (qa.status === "discarded") {
                    // Descartar pide confirmación antes — el resto va directo.
                    setConfirmDiscard(true);
                  } else {
                    handleQuickStatus(qa.status);
                  }
                }}
                className="rounded-lg border px-1 py-1.5 text-xs font-bold transition-colors hover:opacity-80 disabled:opacity-50"
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
          {/* Pasar a Pipeline Closers — handoff scouter→equipo cerradores
              (el supervisor asigna el closer concreto después en /closers).
              source='scouter' mantiene el origen separado de leads del LG. */}
          {lead.converted_at ? (
            <div className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-success/10 text-success text-sm font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" />
              En Pipeline Closers
            </div>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              className="h-9 w-full gap-1.5 text-sm font-semibold"
              onClick={() => setConvertOpen(true)}
            >
              <ArrowRight className="h-3.5 w-3.5" />
              Pasar a Pipeline Closers
            </Button>
          )}

          {/* Contactar — full-width, lleva al perfil de Instagram en
              una pestaña nueva. Es la acción primaria que un closer
              hace después de revisar el lead. Sale arriba de Guardar
              porque es lo más usado. */}
          {instagramUrl && (
            <a
              href={instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-primary text-primary-foreground text-sm font-semibold transition-colors hover:bg-primary/90"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Contactar
            </a>
          )}
          {/* Guardar — el favorito se movió arriba al lado del score,
              así Guardar toma todo el ancho disponible y no queda
              recortado. */}
          <Button
            size="sm"
            className="w-full gap-1"
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
        </div>
      </DialogContent>

      {/* Confirmación al descartar — usamos AlertDialog (Maven UI), no
          window.confirm() del navegador. Cierra el modal del lead
          también después del descarte exitoso (mismo flujo que el
          handleQuickStatus normal). */}
      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Descartar este lead?</AlertDialogTitle>
            <AlertDialogDescription>
              @{lead.instagram_handle} se va a borrar de la lista activa y
              su handle queda en la blocklist para que el scouter NO lo
              vuelva a agregar en futuras búsquedas. Es prácticamente
              irreversible (tendrías que borrar manualmente la entrada de
              la blocklist para que reaparezca).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setConfirmDiscard(false);
                try {
                  await discardLead.mutateAsync({
                    id: lead.id,
                    handle: lead.instagram_handle,
                    tenantId: lead.tenant_id,
                  });
                  toast.success("Lead descartado");
                  onOpenChange(false);
                } catch {
                  /* el hook ya hizo el toast */
                }
              }}
            >
              Sí, descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal de conversión a Pipeline Closers — el handoff scouter→cerradores.
          Se cierra solo en onSuccess y refresca queries afectadas. */}
      <ConvertScouterLeadModal
        open={convertOpen}
        onOpenChange={setConvertOpen}
        lead={lead}
        onConverted={() => onOpenChange(false)}
      />
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
    <div className="text-xs font-semibold text-muted-foreground">
      {label}
    </div>
    <div className="text-sm text-foreground">{children}</div>
  </div>
);
