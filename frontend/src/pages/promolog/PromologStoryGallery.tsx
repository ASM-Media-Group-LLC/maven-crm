import { useState } from "react";
import { Check, X as XMark, ExternalLink, ImageOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PromologEntry } from "./PromologEntryCard";
import { summarizeStories } from "./storyEvidence";

// Galería de evidencia: muestra TODAS las historias del día de una creadora,
// cada una con su thumbnail, veredicto (promovió/no), confianza y razonamiento
// de la IA. Reemplaza la imagen única del modal cuando el bot analizó varias
// stories — así un manager ve el panorama completo del día en un vistazo.

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

interface Props {
  stories: PromologEntry[];
  selectedId?: string;
}

const PromologStoryGallery = ({ stories, selectedId }: Props) => {
  const summary = summarizeStories(stories);

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
          const Wrapper = s.evidence_url ? "a" : "div";
          return (
            <Wrapper
              key={s.id}
              {...(s.evidence_url
                ? { href: s.evidence_url, target: "_blank", rel: "noopener noreferrer" }
                : {})}
              className={`group relative block overflow-hidden rounded-lg border bg-card transition-colors ${
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

                {/* Confianza + abrir */}
                <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between">
                  {conf != null && (
                    <span className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] tabular-nums text-white">
                      {conf}%
                    </span>
                  )}
                  {s.evidence_url && (
                    <span className="ml-auto rounded bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100">
                      <ExternalLink className="h-3 w-3" />
                    </span>
                  )}
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
            </Wrapper>
          );
        })}
      </div>
    </div>
  );
};

export default PromologStoryGallery;
