import { useEffect, useState } from "react";
import { Check, X as XMark, ExternalLink, ImageOff, ChevronLeft, ChevronRight, X as CloseIcon, Maximize2, Loader2, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PromologEntry } from "./PromologEntryCard";
import { summarizeStories } from "./storyEvidence";
import TelegramIcon from "@/components/icons/TelegramIcon";

// Galería de evidencia: muestra las historias del día de una creadora, cada una con
// su thumbnail, veredicto (promovió/no), confianza y razonamiento de la IA. El
// veredicto de cada historia es EDITABLE (toggle Sí/No) cuando se pasa `onSetVerdict`:
// al cambiarlo se persiste y el resultado del día se recalcula (Sí si CUALQUIER
// historia es Sí). Al clickear una imagen abre un LIGHTBOX para verla en grande.

const resultVariant: Record<string, "success-soft" | "destructive-soft" | "warning-soft" | "secondary-soft"> = {
  "Sí": "success-soft",
  "No": "destructive-soft",
  "Parcial": "warning-soft",
  "Pendiente": "secondary-soft",
};

const ResultIcon = ({ result }: { result: string }) => {
  if (result === "Sí") return <Check className="h-3 w-3" />;
  if (result === "No") return <XMark className="h-3 w-3" />;
  return null;
};

// Toggle Sí/No del veredicto de una historia. Segmentado, con la opción activa
// resaltada (verde = promovió, rojo = no) y la otra apagada pero clickeable, para
// que se vea que se puede cambiar. Si no hay `onSetVerdict`, cae a un badge de solo
// lectura. `dark` = estilos para fondo oscuro (lightbox).
const VerdictToggle = ({
  story,
  onSetVerdict,
  saving,
  dark,
}: {
  story: PromologEntry;
  onSetVerdict?: (s: PromologEntry, v: "Sí" | "No") => void;
  saving?: boolean;
  dark?: boolean;
}) => {
  if (!onSetVerdict) {
    return (
      <Badge variant={resultVariant[story.result] || "secondary-soft"} className="gap-0.5 text-[10px]">
        <ResultIcon result={story.result} />
        {story.result}
      </Badge>
    );
  }
  const idle = dark ? "bg-white/10 text-white/60 hover:bg-white/20" : "bg-muted/50 text-muted-foreground hover:bg-muted";
  return (
    <div
      className={`inline-flex w-full items-stretch overflow-hidden rounded-md text-[11px] font-semibold ${dark ? "border border-white/20" : "border border-border"}`}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        disabled={saving}
        onClick={(e) => { e.stopPropagation(); onSetVerdict(story, "Sí"); }}
        className={`flex flex-1 items-center justify-center gap-1 px-2 py-1 transition-colors disabled:opacity-60 ${story.result === "Sí" ? "bg-emerald-500 text-white" : `${idle} hover:text-emerald-500`}`}
      >
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Sí
      </button>
      <button
        type="button"
        disabled={saving}
        onClick={(e) => { e.stopPropagation(); onSetVerdict(story, "No"); }}
        className={`flex flex-1 items-center justify-center gap-1 px-2 py-1 transition-colors disabled:opacity-60 ${story.result === "No" ? "bg-red-500 text-white" : `${idle} hover:text-red-500`}`}
      >
        <XMark className="h-3 w-3" /> No
      </button>
    </div>
  );
};

// Thumbnail con fallback cuando la URL del CDN expiró.
const StoryThumb = ({ url }: { url: string | null | undefined }) => {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-muted/40 p-2 text-center">
        <ImageOff className="h-5 w-5 text-muted-foreground" />
        <span className="text-[10px] leading-tight text-muted-foreground">
          {url ? "Imagen expirada" : "Sin imagen"}
        </span>
      </div>
    );
  }
  return (
    <img src={url} alt="Story" loading="lazy" className="h-full w-full object-cover" onError={() => setFailed(true)} />
  );
};

// Imagen grande del lightbox, con su propio fallback de "imagen expirada".
const LightboxImage = ({ url }: { url: string | null | undefined }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  if (!url || failed) {
    return (
      <div className="flex aspect-[9/16] max-h-[72vh] w-full max-w-[420px] flex-col items-center justify-center gap-2 rounded-lg bg-white/5 text-center">
        <ImageOff className="h-10 w-10 text-white/40" />
        <span className="text-sm text-white/60">{url ? "Imagen expirada" : "Sin imagen"}</span>
      </div>
    );
  }
  return (
    <img src={url} alt="Story" className="max-h-[72vh] w-auto max-w-full rounded-lg object-contain" onError={() => setFailed(true)} />
  );
};

// ── Telegram: la evidencia es un link t.me (no una imagen) y el contenido suele
// ser protegido (DRM) → no podemos traer la foto/video. En vez de una imagen
// rota, RECREAMOS el post como se ve en Telegram: header de canal + recuadro de
// media "protegida" + el texto del post como caption (en DRM el texto siempre
// llega) + hora. Paleta oscura de Telegram.
const isTgEvidence = (s: PromologEntry) =>
  (s.network || "").toLowerCase() === "telegram" || /^https?:\/\/t\.me\//i.test(s.evidence_url || "");

const tgChannelName = (s: PromologEntry) => s.name?.trim() || "Canal de Telegram";

// Tile chico (celda de la grilla): mini-post estilo Telegram.
const TelegramTile = ({ story }: { story: PromologEntry }) => (
  <div className="flex h-full w-full flex-col overflow-hidden bg-[#17212b] text-left">
    <div className="flex items-center gap-1.5 bg-[#202b36] px-2 py-1.5">
      <TelegramIcon className="h-3.5 w-3.5 shrink-0 text-[#5eb5f7]" />
      <span className="truncate text-[10px] font-medium text-white/90">{tgChannelName(story)}</span>
    </div>
    <div className="flex flex-1 flex-col items-center justify-center gap-1 bg-gradient-to-br from-[#0e1621] to-[#1c2733] p-1.5 text-center">
      <Lock className="h-4 w-4 shrink-0 text-[#5eb5f7]/60" />
      {story.notes
        ? <span className="line-clamp-3 text-[9px] leading-tight text-white/75">{story.notes}</span>
        : <span className="text-[9px] text-[#6d7f8f]">post sin texto</span>}
    </div>
  </div>
);

// Lightbox: recreación completa del post de Telegram.
const TelegramLightbox = ({ story }: { story: PromologEntry }) => {
  const channel = tgChannelName(story);
  const initial = (channel[0] || "T").toUpperCase();
  return (
    <div className="w-full max-w-[420px] overflow-hidden rounded-2xl bg-[#17212b] shadow-2xl ring-1 ring-white/10">
      {/* Header tipo chat de Telegram */}
      <div className="flex items-center gap-2.5 bg-[#202b36] px-4 py-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#2aabee] to-[#229ed9] text-sm font-bold text-white">{initial}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{channel}</p>
          <p className="text-[11px] text-[#6d7f8f]">canal · Telegram</p>
        </div>
        <TelegramIcon className="h-5 w-5 shrink-0 text-[#5eb5f7]" />
      </div>
      {/* Cuerpo del post */}
      <div className="p-3">
        {/* Media protegida — no se puede traer por DRM, la representamos. */}
        <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[#0e1621] to-[#1c2733] ring-1 ring-white/5">
          <ImageOff className="h-8 w-8 text-[#5eb5f7]/70" />
          <span className="inline-flex items-center gap-1 rounded-full bg-black/40 px-2.5 py-1 text-[11px] text-white/70">
            <Lock className="h-3 w-3" /> Foto/Video protegido (DRM)
          </span>
        </div>
        {/* Caption (el texto real del post) */}
        {story.notes
          ? <p className="mt-2.5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-[#e9edf0]">{story.notes}</p>
          : <p className="mt-2.5 text-[13px] italic text-[#6d7f8f]">(post sin texto)</p>}
        {/* Footer: fecha/hora del post */}
        <div className="mt-2 flex items-center justify-end gap-1 text-[11px] text-[#6d7f8f]">
          {[story.date, story.time].filter(Boolean).join(" · ")}
        </div>
      </div>
    </div>
  );
};

// ── Evidencia de Telegram: CAPTURAS de celular (formato IG) ─────────────────
// Recreamos el canal como SCREENSHOTS de celular: cada captura es un mockup de
// teléfono con los posts (bubbles) que entran en una pantalla (~5); si la
// creadora posteó más, se paginan en varias capturas (15 bubbles → 3 capturas).
// Cada captura se marca Sí si alguno de sus bubbles tiene promo. La media
// protegida (DRM) no se puede extraer → se representa. La galería muestra las
// capturas (click = ver en grande). Se usa cuando TODAS las historias son de TG.
const renderTgText = (text: string) =>
  (text || "").split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
    /^https?:\/\//.test(part)
      ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[#168acd] underline break-all">{part}</a>
      : <span key={i}>{part}</span>,
  );

const BUBBLES_PER_SHOT = 5;

// Una burbuja de mensaje (post). `mini` = versión chica para el thumbnail de la
// captura; full = lightbox (con veredicto editable por post).
const TgBubble = ({
  s, channel, onSetVerdict, savingId, mini,
}: {
  s: PromologEntry; channel: string;
  onSetVerdict?: (s: PromologEntry, v: "Sí" | "No") => void; savingId?: string | null; mini?: boolean;
}) => {
  const promo = s.result === "Sí";
  return (
    <div className="flex">
      <div className={`relative max-w-[90%] rounded-2xl rounded-tl-md bg-white shadow-sm ${mini ? "px-1.5 py-1" : "px-2.5 py-1.5"}`}>
        {promo && (
          <span className={`absolute -right-1.5 -top-1.5 flex items-center justify-center rounded-full bg-emerald-500 text-white ${mini ? "h-3 w-3" : "h-5 w-5"}`}>
            <Check className={mini ? "h-2 w-2" : "h-3 w-3"} />
          </span>
        )}
        <p className={`font-semibold text-[#3a8fd6] ${mini ? "text-[7px] leading-tight" : "text-[12px]"}`}>{channel}</p>
        {s.notes
          ? <p className={`whitespace-pre-wrap break-words text-slate-900 ${mini ? "line-clamp-3 text-[7px] leading-tight" : "text-[13.5px] leading-snug"}`}>{mini ? s.notes : renderTgText(s.notes)}</p>
          : <p className={`inline-flex items-center gap-1 italic text-slate-400 ${mini ? "text-[7px]" : "py-1 text-[12px]"}`}><Lock className={mini ? "h-2 w-2" : "h-3 w-3"} /> foto/video (protegido)</p>}
        <div className="flex items-center justify-end">
          <span className={`text-slate-400 ${mini ? "text-[6px]" : "text-[10px]"}`}>{s.time}</span>
        </div>
        {!mini && onSetVerdict && (
          <div className="mt-1 border-t border-slate-100 pt-1">
            <VerdictToggle story={s} onSetVerdict={onSetVerdict} saving={savingId === s.id} />
          </div>
        )}
      </div>
    </div>
  );
};

// Una CAPTURA = mockup de celular con un grupo de bubbles (header del canal +
// barra de estado + wallpaper + bubbles + barra inferior).
const TgScreenshotCard = ({
  channel, bubbles, onSetVerdict, savingId, mini,
}: {
  channel: string; bubbles: PromologEntry[];
  onSetVerdict?: (s: PromologEntry, v: "Sí" | "No") => void; savingId?: string | null; mini?: boolean;
}) => {
  const initial = (channel.trim()[0] || "T").toUpperCase();
  return (
    <div className={`overflow-hidden bg-black ${mini ? "rounded-lg ring-2 ring-black" : "rounded-[28px] shadow-2xl ring-[6px] ring-black"}`}>
      {/* Barra de estado (formato celular) */}
      <div className={`flex items-center justify-between bg-[#527da3] text-white/90 ${mini ? "px-2 pt-0.5 text-[6px]" : "px-4 pt-1.5 text-[10px]"}`}>
        <span>Telegram</span>
        <span>{mini ? "" : "📶 🔋"}</span>
      </div>
      {/* Header del canal */}
      <div className={`flex items-center gap-2 bg-[#527da3] text-white ${mini ? "px-2 py-1" : "px-2.5 py-2"}`}>
        <ChevronLeft className={`opacity-80 ${mini ? "h-2.5 w-2.5" : "h-4 w-4"}`} />
        <span className={`flex shrink-0 items-center justify-center rounded-full bg-white/25 font-bold ${mini ? "h-3.5 w-3.5 text-[7px]" : "h-7 w-7 text-[11px]"}`}>{initial}</span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className={`truncate font-semibold ${mini ? "text-[8px]" : "text-[13px]"}`}>{channel}</p>
          <p className={`text-white/70 ${mini ? "text-[6px]" : "text-[10px]"}`}>canal</p>
        </div>
        <span className={mini ? "text-[8px]" : "text-base"}>⋮</span>
      </div>
      {/* Chat sobre el wallpaper */}
      <div
        className={mini ? "space-y-1 px-2 py-2" : "space-y-2 px-3 py-3"}
        style={{ backgroundColor: "#c5d3dd", backgroundImage: "radial-gradient(rgba(255,255,255,0.5) 1.3px, transparent 1.3px)", backgroundSize: mini ? "10px 10px" : "20px 20px" }}
      >
        {bubbles.map((b) => (
          <TgBubble key={b.id} s={b} channel={channel} mini={mini} onSetVerdict={mini ? undefined : onSetVerdict} savingId={savingId} />
        ))}
      </div>
      {/* Barra inferior */}
      {!mini && (
        <div className="flex items-center gap-2 bg-[#17212b] px-3 py-2 text-[12px] text-[#6d7f8f]">
          <span className="flex-1">Difusión</span>
          <Lock className="h-3.5 w-3.5" />
        </div>
      )}
    </div>
  );
};

// Galería de CAPTURAS de Telegram (estilo IG): pagina los bubbles del día en
// capturas de ~BUBBLES_PER_SHOT, cada una marcada Sí si tiene algún promo.
const TelegramScreenshots = ({
  stories, onSetVerdict, savingId,
}: {
  stories: PromologEntry[]; onSetVerdict?: (s: PromologEntry, v: "Sí" | "No") => void; savingId?: string | null;
}) => {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const channel = tgChannelName(stories[0]);
  const ordered = [...stories].sort((a, b) => (a.story_index ?? 0) - (b.story_index ?? 0));
  const shots: PromologEntry[][] = [];
  for (let i = 0; i < ordered.length; i += BUBBLES_PER_SHOT) shots.push(ordered.slice(i, i + BUBBLES_PER_SHOT));
  const summary = summarizeStories(stories);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Evidencia · {shots.length} {shots.length === 1 ? "captura" : "capturas"} de Telegram
        </p>
        <div className="flex items-center gap-1.5">
          {summary.promoted > 0 && <Badge variant="success-soft" className="text-[10px]">{summary.promoted} promovió</Badge>}
          {summary.notPromoted > 0 && <Badge variant="destructive-soft" className="text-[10px]">{summary.notPromoted} no</Badge>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {shots.map((bubbles, idx) => {
          const anyPromo = bubbles.some((b) => b.result === "Sí");
          return (
            <div key={idx} className="space-y-1.5">
              <button type="button" onClick={() => setOpenIdx(idx)} className="block w-full overflow-hidden rounded-lg ring-1 ring-border transition-transform hover:scale-[1.02]">
                <TgScreenshotCard channel={channel} bubbles={bubbles} mini />
              </button>
              <div className="flex items-center justify-between gap-1 px-0.5">
                <span className="truncate text-[10px] text-muted-foreground">Captura {idx + 1} · {bubbles.length} {bubbles.length === 1 ? "post" : "posts"}</span>
                <Badge variant={anyPromo ? "success-soft" : "destructive-soft"} className="gap-0.5 text-[10px]">
                  {anyPromo ? <><Check className="h-3 w-3" /> Sí</> : <><XMark className="h-3 w-3" /> No</>}
                </Badge>
              </div>
            </div>
          );
        })}
      </div>

      {/* Lightbox: la captura en grande, con veredicto editable por post */}
      {openIdx != null && shots[openIdx] && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4" onClick={() => setOpenIdx(null)} role="dialog" aria-modal="true">
          <button type="button" onClick={() => setOpenIdx(null)} className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20" aria-label="Cerrar"><CloseIcon className="h-5 w-5" /></button>
          {shots.length > 1 && (
            <>
              <button type="button" onClick={(e) => { e.stopPropagation(); setOpenIdx((openIdx - 1 + shots.length) % shots.length); }} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20 sm:left-4" aria-label="Anterior"><ChevronLeft className="h-6 w-6" /></button>
              <button type="button" onClick={(e) => { e.stopPropagation(); setOpenIdx((openIdx + 1) % shots.length); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20 sm:right-4" aria-label="Siguiente"><ChevronRight className="h-6 w-6" /></button>
            </>
          )}
          <div className="flex max-h-[90vh] w-full max-w-[330px] flex-col items-center gap-2 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <TgScreenshotCard channel={channel} bubbles={shots[openIdx]} onSetVerdict={onSetVerdict} savingId={savingId} />
            <span className="shrink-0 text-xs text-white/60">Captura {openIdx + 1}/{shots.length}</span>
          </div>
        </div>
      )}
    </div>
  );
};

interface Props {
  stories: PromologEntry[];
  selectedId?: string;
  onSetVerdict?: (story: PromologEntry, verdict: "Sí" | "No") => void;
  savingId?: string | null;
}

const PromologStoryGallery = ({ stories, selectedId, onSetVerdict, savingId }: Props) => {
  const summary = summarizeStories(stories);
  // Lightbox referenciado por ID (no por índice): así, si al cambiar un veredicto la
  // historia se filtra fuera de la galería, no se desincroniza — se reubica por id o
  // se cierra si ya no está.
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const activeIdx = lightboxId ? stories.findIndex((s) => s.id === lightboxId) : -1;
  const active = activeIdx >= 0 ? stories[activeIdx] : null;

  const go = (delta: number) => {
    if (activeIdx < 0 || stories.length === 0) return;
    setLightboxId(stories[(activeIdx + delta + stories.length) % stories.length].id);
  };

  // Si la historia activa desapareció (se filtró tras cambiar su veredicto), cerrar.
  useEffect(() => {
    if (lightboxId && activeIdx < 0) setLightboxId(null);
  }, [lightboxId, activeIdx]);

  // Navegación con teclado mientras el lightbox está abierto.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxId(null);
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stories.length]);

  const activeSlide = active ? (active.story_index != null ? active.story_index + 1 : activeIdx + 1) : 0;
  const activeConf = active?.ai_confidence != null ? Math.round(active.ai_confidence * 100) : null;

  // Si TODAS las historias del día son de Telegram, mostramos las CAPTURAS de
  // celular paginadas (estilo IG) en vez de la grilla de miniaturas.
  if (stories.length > 0 && stories.every(isTgEvidence)) {
    return <TelegramScreenshots stories={stories} onSetVerdict={onSetVerdict} savingId={savingId} />;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Evidencia · {summary.total} {summary.total === 1 ? "historia" : "historias"}
        </p>
        <div className="flex items-center gap-1.5">
          {summary.promoted > 0 && (
            <Badge variant="success-soft" className="text-[10px]">{summary.promoted} promovió</Badge>
          )}
          {summary.notPromoted > 0 && (
            <Badge variant="destructive-soft" className="text-[10px]">{summary.notPromoted} no</Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {stories.map((s) => {
          const slide = s.story_index != null ? s.story_index + 1 : 0;
          const isSelected = selectedId != null && s.id === selectedId;
          const conf = s.ai_confidence != null ? Math.round(s.ai_confidence * 100) : null;
          return (
            <div
              key={s.id}
              className={`group relative overflow-hidden rounded-lg border bg-card transition-colors ${
                isSelected ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/40"
              }`}
            >
              {/* Imagen — al clickear abre el lightbox (verla en grande) */}
              <button type="button" onClick={() => setLightboxId(s.id)} className="relative block aspect-[9/16] w-full">
                {isTgEvidence(s) ? <TelegramTile story={s} /> : <StoryThumb url={s.evidence_url} />}
                {slide > 0 && (
                  <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white">
                    #{slide}
                  </span>
                )}
                <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between">
                  {conf != null && (
                    <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] tabular-nums text-white">{conf}%</span>
                  )}
                  <span className="ml-auto rounded bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100">
                    <Maximize2 className="h-3 w-3" />
                  </span>
                </div>
              </button>

              {/* Veredicto editable */}
              <div className="p-1.5">
                <VerdictToggle story={s} onSetVerdict={onSetVerdict} saving={savingId === s.id} />
              </div>

              {s.ai_reasoning && (
                <p className="line-clamp-2 px-2 pb-1.5 text-[11px] leading-snug text-muted-foreground" title={s.ai_reasoning}>
                  {s.ai_reasoning}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Lightbox ─────────────────────────────────────────────────────── */}
      {active && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightboxId(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={() => setLightboxId(null)}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
            aria-label="Cerrar"
          >
            <CloseIcon className="h-5 w-5" />
          </button>

          {stories.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); go(-1); }}
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20 sm:left-4"
                aria-label="Anterior"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); go(1); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20 sm:right-4"
                aria-label="Siguiente"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}

          <div className="flex max-h-[90vh] w-full max-w-md flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            {isTgEvidence(active) ? <TelegramLightbox story={active} /> : <LightboxImage url={active.evidence_url} />}
            <div className="w-full space-y-2 text-center">
              <div className="flex items-center justify-center gap-2">
                <span className="text-xs tabular-nums text-white/70">
                  #{activeSlide} · {activeIdx + 1}/{stories.length}
                </span>
                {activeConf != null && <span className="text-xs tabular-nums text-white/70">IA: {activeConf}%</span>}
              </div>
              {/* Veredicto editable (marcá si promocionó o no en esta historia) */}
              <div className="mx-auto max-w-[220px]">
                <VerdictToggle story={active} onSetVerdict={onSetVerdict} saving={savingId === active.id} dark />
              </div>
              {active.ai_reasoning && (
                <p className="mx-auto max-w-md text-xs leading-snug text-white/80">{active.ai_reasoning}</p>
              )}
              {active.evidence_url && (
                <a
                  href={active.evidence_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Abrir original <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PromologStoryGallery;
