import { Check, ExternalLink, Facebook } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buildSocialUrl, type SocialPlatform } from "@/lib/utils";
import InstagramIcon from "@/components/icons/InstagramIcon";
import XIcon from "@/components/icons/XIcon";
import TikTokIcon from "@/components/icons/TikTokIcon";
import TelegramIcon from "@/components/icons/TelegramIcon";
import PromologStoryGallery from "./PromologStoryGallery";
import { displayPlatform } from "./promoScore";
import type { PromologEntry } from "./PromologEntryCard";
import { useCreatorDailyEarnings } from "@/hooks/useCreatorDailyEarnings";

const SOCIAL_PLATFORMS = ["instagram", "tiktok", "twitter", "x", "youtube", "linkedin", "facebook", "reddit"];

// Ícono + nombre de red para las secciones de evidencia por red del popup.
const DetailNetworkIcon = ({ network }: { network: string }) => {
  switch (network) {
    case "instagram": return <InstagramIcon className="h-4 w-4" />;
    case "telegram": return <TelegramIcon className="h-4 w-4" />;
    case "x": case "twitter": return <XIcon className="h-4 w-4" />;
    case "tiktok": return <TikTokIcon className="h-4 w-4" />;
    case "facebook": return <Facebook className="h-4 w-4" />;
    default: return <ExternalLink className="h-4 w-4" />;
  }
};
const detailNetworkLabel = (n: string): string =>
  ({ instagram: "Instagram", telegram: "Telegram", x: "X", twitter: "X", tiktok: "TikTok", facebook: "Facebook", reddit: "Reddit", youtube: "YouTube" } as Record<string, string>)[n] || n;

// Popup "Detalle de Entrada" de Promolog. Extraído de PromologContent para
// reusarlo idéntico en el subtab Promos (click en una fila) y en el subtab
// Calendario (click en un día). Muestra: header (ticket+nombre+@), grid de
// metadata, link de compra, acción/notas, análisis AI, y la galería de
// evidencia con el veredicto EDITABLE por historia (toggle Sí/No) cuando se
// pasa `onSetVerdict`. El resultado del día (`dayResult`) se recalcula afuera
// (Sí si CUALQUIER historia quedó en Sí) y se pasa como prop.

const resultToBadgeVariant = (result: string): "success-soft" | "destructive-soft" | "warning-soft" | "secondary-soft" => {
  switch (result) {
    case "Sí": return "success-soft";
    case "No": return "destructive-soft";
    case "Parcial": return "warning-soft";
    default: return "secondary-soft";
  }
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: PromologEntry | null;
  /** Todas las historias del día (galería). Vacío = mostrar evidencia única. */
  dayStories: PromologEntry[];
  /** Evidencia del día agrupada POR RED (Instagram/X/Telegram). Si se pasa, el
   *  popup muestra una sección por cada red revisada ese día. */
  dayNetworks?: Array<{ network: string; stories: PromologEntry[]; promoted: boolean }>;
  /** Resultado del día ya recalculado (Sí si cualquier historia es Sí). */
  dayResult: string;
  onSetVerdict?: (story: PromologEntry, verdict: "Sí" | "No") => void;
  savingId?: string | null;
  /** Si se pasa, muestra el botón "Editar". Sin esto, solo "Cerrar". */
  onEdit?: (entry: PromologEntry) => void;
}

const PromologEntryDetailDialog = ({
  open,
  onOpenChange,
  entry,
  dayStories,
  dayNetworks,
  dayResult,
  onSetVerdict,
  savingId,
  onEdit,
}: Props) => {
  // Redes de la modelo (para los chips clickeables). El entry solo trae la red
  // escaneada (IG); las demás salen del perfil de la creadora por creator_id.
  const { data: creatorSocials } = useQuery({
    queryKey: ["promolog-entry-socials", entry?.creator_id],
    enabled: open && !!entry?.creator_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("creators")
        .select("instagram_handle, facebook_handle, reddit_handle, twitter_handle, tiktok_handle, youtube_handle, telegram_handle, other_url")
        .eq("id", entry!.creator_id!)
        .maybeSingle();
      return data;
    },
  });

  // Ingreso (BLU) alrededor de la promo (día-1 .. día+3), con el día de la promo resaltado.
  const promoDate = (entry?.rawDate || "").slice(0, 10) || null;
  const shiftDay = (d: string, days: number) => {
    const dt = new Date(d + "T00:00:00Z");
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().slice(0, 10);
  };
  const { data: earnings = [] } = useCreatorDailyEarnings(
    entry?.creator_id,
    promoDate ? shiftDay(promoDate, -1) : null,
    promoDate ? shiftDay(promoDate, 3) : null,
    open,
  );

  if (!entry) return null;
  const showStoryGallery = dayStories.length > 0;
  const money0 = (n: number) => "$" + Math.round(n || 0).toLocaleString("en-US");
  const MESES_ABBR = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const fmtDay = (ymd: string) => { const p = ymd.split("-"); return `${Number(p[2])} ${MESES_ABBR[Number(p[1]) - 1]}`; };
  const earningChannels: Array<[string, string]> = [
    ["Subs", "subscription_gross"], ["Mensajes", "message_gross"], ["Tips", "tips_gross"],
    ["Posts", "post_gross"], ["Ref", "referral_gross"], ["Stream", "stream_gross"],
  ];

  // Nombre / @handle → IG de la cuenta escaneada en este entry.
  const igUrl = buildSocialUrl("instagram", entry.handle);
  const cleanHandleDisplay = (entry.handle ?? "").replace(/^@/, "").replace(/\/$/, "").split("/").pop();
  // "Red social" → perfil de esa red (IG en la práctica; genérico por las dudas).
  const networkKey = (entry.network || "").toLowerCase();
  const networkUrl = SOCIAL_PLATFORMS.includes(networkKey) ? buildSocialUrl(networkKey as SocialPlatform, entry.handle) : "";
  // Chips de todas sus redes seteadas en el perfil.
  const socialChips = creatorSocials
    ? [
        { label: "Instagram", icon: <InstagramIcon className="h-3.5 w-3.5" />, url: buildSocialUrl("instagram", creatorSocials.instagram_handle) },
        { label: "Telegram", icon: <TelegramIcon className="h-3.5 w-3.5" />, url: buildSocialUrl("telegram", creatorSocials.telegram_handle) },
        { label: "Facebook", icon: <Facebook className="h-3.5 w-3.5" />, url: buildSocialUrl("facebook", creatorSocials.facebook_handle) },
        { label: "Reddit", icon: <span className="text-[10px] font-bold leading-none">R</span>, url: buildSocialUrl("reddit", creatorSocials.reddit_handle) },
        { label: "X", icon: <XIcon className="h-3.5 w-3.5" />, url: buildSocialUrl("twitter", creatorSocials.twitter_handle) },
        { label: "TikTok", icon: <TikTokIcon className="h-3.5 w-3.5" />, url: buildSocialUrl("tiktok", creatorSocials.tiktok_handle) },
        { label: "YouTube", icon: <span className="text-[10px] font-bold leading-none">YT</span>, url: buildSocialUrl("youtube", creatorSocials.youtube_handle) },
        { label: "Otra", icon: <ExternalLink className="h-3.5 w-3.5" />, url: creatorSocials.other_url || "" },
      ].filter((c) => c.url)
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pr-8">
          <DialogTitle>Detalle de Entrada</DialogTitle>
          <DialogDescription className="sr-only">Detalle completo de la entrada de Promolog</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Header: ticket + nombre + handle */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="font-mono text-xs">{entry.ticketNumber || "—"}</Badge>
            {igUrl ? (
              <a
                href={igUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold text-primary hover:underline inline-flex items-center gap-1"
                title="Abrir Instagram de la modelo"
              >
                {entry.name}
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <span className="text-sm font-semibold">{entry.name}</span>
            )}
            {entry.handle && (
              igUrl ? (
                <a href={igUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-primary hover:underline">
                  @{cleanHandleDisplay}
                </a>
              ) : (
                <span className="text-sm text-muted-foreground">@{cleanHandleDisplay}</span>
              )
            )}
          </div>

          {/* Grid de metadata principal */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Red social:</span>{" "}
              {networkUrl ? (
                <a
                  href={networkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium capitalize text-primary hover:underline inline-flex items-center gap-1"
                  title="Abrir el perfil de esa red"
                >
                  {entry.network || "—"}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <span className="font-medium capitalize">{entry.network || "—"}</span>
              )}
            </div>
            <div>
              <span className="text-muted-foreground">Plataforma destino:</span>{" "}
              <span className="font-medium">{displayPlatform(entry) || entry.platform || "—"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Resultado:</span>{" "}
              <Badge variant={resultToBadgeVariant(dayResult)} className="ml-1 text-xs">
                {dayResult}
              </Badge>
            </div>
            <div>
              <span className="text-muted-foreground">Agente:</span>{" "}
              <span className="font-medium">{entry.agent}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Fecha:</span>{" "}
              <span className="font-medium">{entry.date}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Hora:</span>{" "}
              <span className="font-medium">{entry.time}</span>
            </div>
          </div>

          {/* Ingreso (BLU) alrededor de la promo — gross diario del día-1 al día+3, con el
              día de la promo resaltado + desglose por canal de ese día. Solo con datos
              (RLS de management + días con ingreso > 0). */}
          {earnings.length > 0 && (() => {
            const byDate: Record<string, (typeof earnings)[number]> = Object.fromEntries(
              earnings.map((e) => [e.date, e]),
            );
            const promo = promoDate ? byDate[promoDate] : undefined;
            return (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
                <p className="text-xs uppercase tracking-wider text-amber-400 font-semibold">
                  Ingresos (BLU) · alrededor de la promo
                </p>
                <div className="flex flex-wrap gap-2">
                  {earnings.map((e) => {
                    const isPromo = e.date === promoDate;
                    return (
                      <div
                        key={e.date}
                        className={`rounded-md px-2.5 py-1.5 text-center border ${isPromo ? "border-amber-500/60 bg-amber-500/10" : "border-border bg-muted/30"}`}
                      >
                        <div className="text-[10px] text-muted-foreground">
                          {fmtDay(e.date)}{isPromo ? " · promo" : ""}
                        </div>
                        <div className="text-sm font-semibold tabular-nums">{money0(e.total_gross)}</div>
                      </div>
                    );
                  })}
                </div>
                {promo && (
                  <div className="flex flex-wrap gap-1.5 pt-0.5 text-[10px]">
                    {earningChannels
                      .filter(([, k]) => Number((promo as any)[k]) > 0)
                      .map(([label, k]) => (
                        <span key={k} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/30 px-2 py-0.5 tabular-nums">
                          {label}: {money0(Number((promo as any)[k]))}
                        </span>
                      ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Redes de la modelo — chips clickeables a sus perfiles (IG, Facebook,
              Reddit, X, TikTok, YouTube, Otra), traídos del perfil de la creadora. */}
          {socialChips.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Redes de la modelo</p>
              <div className="flex flex-wrap gap-1.5">
                {socialChips.map((c) => (
                  <a
                    key={c.label}
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-2.5 py-1 text-xs transition-colors hover:border-primary/50 hover:text-primary"
                  >
                    {c.icon}
                    {c.label}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Buy link — sólo cuando la promo tiene link visible */}
          {entry.has_buy_link && (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-1">
              <p className="text-xs uppercase tracking-wider text-emerald-400 font-semibold flex items-center gap-1.5">
                <Check className="h-3 w-3" />
                Link de compra detectado
              </p>
              <p className="text-sm">
                Tipo:{" "}
                <Badge variant="success-soft" className="text-[10px] capitalize">
                  {entry.buy_link_type || "no especificado"}
                </Badge>
              </p>
            </div>
          )}

          {/* Acción tomada — qué hizo la creadora para promocionar. */}
          {entry.action_taken && (
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Qué hizo para promocionar</p>
              <p className="text-sm bg-muted/40 rounded-md p-3">{entry.action_taken}</p>
            </div>
          )}

          {/* Notas — viene del chatter manual o del bot ([AUTO] reasoning). */}
          {entry.notes && (
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Notas</p>
              <p className="text-sm bg-muted/40 rounded-md p-3 whitespace-pre-wrap">{entry.notes}</p>
            </div>
          )}

          {/* AI reasoning + confidence — solo si fue analizada por el pipeline
              automático y NO hay galería (la galería ya muestra el reasoning por story). */}
          {!(dayNetworks && dayNetworks.length > 0) && !showStoryGallery && entry.ai_reasoning && (
            <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wider text-blue-400 font-semibold">Análisis AI</p>
                {entry.ai_confidence != null && (
                  <Badge variant="secondary-soft" className="text-[10px] tabular-nums">
                    Confianza: {(entry.ai_confidence * 100).toFixed(0)}%
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground italic">{entry.ai_reasoning}</p>
            </div>
          )}

          {/* Evidencia — galería de TODAS las stories del día (cuando el bot
              analizó varias) o el pantallazo único (entry manual / 1 story). */}
          {dayNetworks && dayNetworks.length > 0 ? (
            <div className="space-y-4">
              {dayNetworks.map((dn) => {
                // Cuentas (handles) que promocionaron en esta red — para multi-cuenta
                // (ej. 2ª IG). Lo setean los scanners en promolog_entries.source_handle.
                const accts = [...new Set(
                  dn.stories
                    .filter((s) => s.result === "Sí" && s.source_handle)
                    .map((s) => (s.source_handle as string).replace(/^@+/, "")),
                )];
                return (
                <div key={dn.network} className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-foreground"><DetailNetworkIcon network={dn.network} /></span>
                    <span className="text-sm font-semibold">{detailNetworkLabel(dn.network)}</span>
                    {accts.length > 0 && (
                      <span className="text-xs text-muted-foreground">· {accts.map((a) => `@${a}`).join(", ")}</span>
                    )}
                    <Badge variant={dn.promoted ? "success-soft" : "secondary-soft"} className="text-[10px]">
                      {dn.promoted ? "Promocionó" : "Revisada · sin promo"}
                    </Badge>
                  </div>
                  {dn.stories.length > 0 ? (
                    <PromologStoryGallery stories={dn.stories} selectedId={entry.id} onSetVerdict={onSetVerdict} savingId={savingId} />
                  ) : (
                    <p className="px-1 text-xs italic text-muted-foreground">Revisada ese día · sin actividad.</p>
                  )}
                </div>
                );
              })}
            </div>
          ) : showStoryGallery ? (
            <PromologStoryGallery stories={dayStories} selectedId={entry.id} onSetVerdict={onSetVerdict} savingId={savingId} />
          ) : entry.evidence_url ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Evidencia</p>
                <a
                  href={entry.evidence_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                >
                  <ExternalLink className="h-3 w-3" />
                  Abrir en nueva pestaña
                </a>
              </div>
              <a
                href={entry.evidence_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-md overflow-hidden border border-border bg-muted/20 hover:border-primary/40 transition-colors"
              >
                <img
                  src={entry.evidence_url}
                  alt="Pantallazo de la promo"
                  className="w-full max-h-[400px] object-contain"
                  onError={(e) => {
                    const img = e.currentTarget;
                    img.style.display = "none";
                    const parent = img.parentElement;
                    if (parent && !parent.querySelector(".fallback")) {
                      const fb = document.createElement("div");
                      fb.className = "fallback p-6 text-center text-xs text-muted-foreground";
                      fb.textContent = "La imagen ya no está disponible (URL expirada). Hacé click en 'Abrir en nueva pestaña' para verla en su origen.";
                      parent.appendChild(fb);
                    }
                  }}
                />
              </a>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
          {onEdit && <Button onClick={() => onEdit(entry)}>Editar</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PromologEntryDetailDialog;
