import { useEffect, useState } from "react";
import { Check, X as XMark, ExternalLink, ImageOff, ChevronLeft, ChevronRight, X as CloseIcon, Maximize2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PromologEntry } from "./PromologEntryCard";
import { summarizeStories } from "./storyEvidence";

// Galería de evidencia: muestra TODAS las historias del día de una creadora,
// cada una con su thumbnail, veredicto (promovió/no), confianza y razonamiento
// de la IA. Al clickear una abre un LIGHTBOX: la ve en grande y puede ir
// pasando (◀▶ / flechas del teclado / Esc) por todas las del día.

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

// Thumbnail con fallback cuando la URL del CDN expiró (las URLs de IG mueren a
// las horas; una vez persistidas en Storage esto deja de pasar para entries
// nuevas, pero las viejas pueden seguir rotas).
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
    <img
      src={url}
      alt="Story"
      loading="lazy"
      className="h-full w-full object-cover"
      onError={() => setFailed(true)}
    />
  );
};

// Imagen grande del lightbox, con su propio fallback de "imagen expirada".
const LightboxImage = ({ url }: { url: string | null | undefined }) => {
  const [failed, setFailed] = useState(false);
  // Resetear el fallback cuando cambia la URL (navegación entre stories).
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
    <img
      src={url}
      alt="Story"
      className="max-h-[72vh] w-auto max-w-full rounded-lg object-contain"
      onError={() => setFailed(true)}
    />
  );
};

interface Props {
  stories: PromologEntry[];
  selectedId?: string;
}

const PromologStoryGallery = ({ stories, selectedId }: Props) => {
  const summary = summarizeStories(stories);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const go = (delta: number) =>
    setLightboxIdx((i) => (i === null ? i : (i + delta + stories.length) % stories.length));

  // Navegación con teclado mientras el lightbox está abierto.
  useEffect(() => {
    if (lightboxIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxIdx(null);
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightboxIdx, stories.length]);

  const active = lightboxIdx !== null ? stories[lightboxIdx] : null;
  const activeSlide = active ? (active.story_index != null ? active.story_index + 1 : (lightboxIdx ?? 0) + 1) : 0;
  const activeConf = active?.ai_confidence != null ? Math.round(active.ai_confidence * 100) : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Evidencia · {summary.total} {summary.total === 1 ? "historia" : "historias"}
        </p>
        <div className="flex items-center gap-1.5">
          {summary.promoted > 0 && (
            <Badge variant="success-soft" className="text-[10px]">
              {summary.promoted} promovió
            </Badge>
          )}
          {summary.notPromoted > 0 && (
            <Badge variant="destructive-soft" className="text-[10px]">
              {summary.notPromoted} no
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {stories.map((s, i) => {
          const slide = s.story_index != null ? s.story_index + 1 : i + 1;
          const isSelected = selectedId != null && s.id === selectedId;
          const conf = s.ai_confidence != null ? Math.round(s.ai_confidence * 100) : null;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setLightboxIdx(i)}
              className={`group relative block w-full overflow-hidden rounded-lg border bg-card text-left transition-colors ${
                isSelected ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/40"
              }`}
            >
              <div className="relative aspect-[9/16]">
                <StoryThumb url={s.evidence_url} />

                {/* Nº de slide */}
                <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white">
                  #{slide}
                </span>

                {/* Veredicto */}
                <Badge
                  variant={resultVariant[s.result] || "secondary-soft"}
                  className="absolute right-1.5 top-1.5 gap-0.5 text-[10px]"
                >
                  <ResultIcon result={s.result} />
                  {s.result}
                </Badge>

                {/* Confianza + expandir */}
                <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between">
                  {conf != null && (
                    <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] tabular-nums text-white">
                      {conf}%
                    </span>
                  )}
                  <span className="ml-auto rounded bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100">
                    <Maximize2 className="h-3 w-3" />
                  </span>
                </div>
              </div>

              {/* Razonamiento de la IA */}
              {s.ai_reasoning && (
                <p
                  className="line-clamp-2 px-2 py-1.5 text-[11px] leading-snug text-muted-foreground"
                  title={s.ai_reasoning}
                >
                  {s.ai_reasoning}
                </p>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Lightbox ─────────────────────────────────────────────────────── */}
      {active && lightboxIdx !== null && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightboxIdx(null)}
          role="dialog"
          aria-modal="true"
        >
          {/* Cerrar */}
          <button
            type="button"
            onClick={() => setLightboxIdx(null)}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
            aria-label="Cerrar"
          >
            <CloseIcon className="h-5 w-5" />
          </button>

          {/* Anterior / Siguiente */}
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

          {/* Imagen + info (stopPropagation: clickear acá no cierra) */}
          <div
            className="flex max-h-[90vh] w-full max-w-md flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <LightboxImage url={active.evidence_url} />
            <div className="w-full space-y-1.5 text-center">
              <div className="flex items-center justify-center gap-2">
                <span className="text-xs tabular-nums text-white/70">
                  #{activeSlide} · {(lightboxIdx ?? 0) + 1}/{stories.length}
                </span>
                <Badge variant={resultVariant[active.result] || "secondary-soft"} className="gap-0.5 text-[10px]">
                  <ResultIcon result={active.result} />
                  {active.result}
                </Badge>
                {activeConf != null && (
                  <span className="text-xs tabular-nums text-white/70">{activeConf}%</span>
                )}
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
