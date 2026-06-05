import { useEffect, useState } from "react";
import { Check, X as XMark, ExternalLink, ImageOff, ChevronLeft, ChevronRight, X as CloseIcon, Maximize2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PromologEntry } from "./PromologEntryCard";
import { summarizeStories } from "./storyEvidence";

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
                <StoryThumb url={s.evidence_url} />
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
            <LightboxImage url={active.evidence_url} />
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
