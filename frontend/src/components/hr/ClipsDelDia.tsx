import { formatUI } from "@/lib/formatoHora";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Video, Loader2, PlayCircle, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";

// Los clips de video del día de una persona (Argos — video al distraerse,
// Alvaro 08/11). Lectura de argos_clips; la RLS deja ver al dueño y a HR (que
// no sea sobre un admin). Clip = webm en bucket privado argos-clips; se pide
// URL firmada al abrir, sin bajar los videos de entrada.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

interface Clip {
  id: string;
  path: string;
  motivo: string | null;
  startedAt: string;
  endedAt: string | null;
  duracionSeg: number | null;
}

function etiquetaMotivo(motivo: string | null, t: (k: string) => string): string {
  if (!motivo) return t("hr.exp.clips.motivoDistraido");
  const m: Record<string, string> = {
    distraido: t("hr.exp.clips.motivoDistraido"),
    usando_celular: t("hr.exp.clips.motivoCelular"),
    no_mira: t("hr.exp.clips.motivoNoMira"),
    fuera_lugar: t("hr.exp.clips.motivoFueraLugar"),
  };
  return m[motivo] ?? motivo;
}

function minSeg(seg: number | null): string {
  if (!seg) return "—";
  const m = Math.floor(seg / 60); const s = seg % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}

interface Params { userId: string; fecha: string }

export function ClipsDelDia({ userId, fecha }: Params) {
  const { t } = useLanguage();
  const [verClip, setVerClip] = useState<{ url: string; nombre: string } | null>(null);
  const [cargandoId, setCargandoId] = useState<string | null>(null);

  const q = useQuery<Clip[]>({
    queryKey: ["argos-clips-dia", userId, fecha],
    staleTime: 30_000,
    queryFn: async () => {
      const inicio = `${fecha}T00:00:00-05:00`;
      const fin = `${fecha}T23:59:59-05:00`;
      const { data, error } = await sinTipar.from("argos_clips")
        .select("id, path, motivo, started_at, ended_at, duracion_seg")
        .eq("user_id", userId)
        .gte("started_at", inicio)
        .lte("started_at", fin)
        .order("started_at", { ascending: false });
      if (error) throw new Error(error.message);
      return ((data ?? []) as Array<{ id: string; path: string; motivo: string | null; started_at: string; ended_at: string | null; duracion_seg: number | null }>).map((c) => ({
        id: c.id, path: c.path, motivo: c.motivo, startedAt: c.started_at, endedAt: c.ended_at, duracionSeg: c.duracion_seg,
      }));
    },
  });

  const clips = useMemo(() => q.data ?? [], [q.data]);

  const abrir = async (clip: Clip) => {
    setCargandoId(clip.id);
    try {
      const { data, error } = await supabase.storage.from("argos-clips").createSignedUrl(clip.path, 60 * 10);
      if (error || !data?.signedUrl) return;
      setVerClip({ url: data.signedUrl, nombre: clip.path.split("/").pop() ?? "clip.webm" });
    } finally {
      setCargandoId(null);
    }
  };

  // Si NO hay clips, no mostramos el bloque (silencioso: no ensuciar el
  // expediente con "no hay nada hoy").
  if (q.isLoading) {
    return (
      <section className="vidrio sube mt-5 p-4 lg:p-5">
        <div className="v-cont flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("hr.exp.clips.cargando")}
        </div>
      </section>
    );
  }
  if (clips.length === 0) return null;

  return (
    <section className="vidrio sube mt-5 p-4 lg:p-5">
      <div className="v-cont">
        <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Video className="h-3.5 w-3.5" />{t("hr.exp.clips.titulo", { n: clips.length })}
        </p>
        <div className="grid gap-2">
          {clips.map((c) => (
            <button key={c.id} type="button" onClick={() => abrir(c)}
              className="group flex items-center gap-3 rounded-xl border border-border/40 bg-card/20 px-3 py-2 text-left transition hover:border-primary/40 hover:bg-card/40">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-panel bg-primary/10 text-primary">
                {cargandoId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-5 w-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 text-sm">
                  <span className="font-semibold">{etiquetaMotivo(c.motivo, t)}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{formatUI(new Date(c.startedAt), "HH:mm")}</span>
                  <span className="text-xs text-muted-foreground">· {minSeg(c.duracionSeg)}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">{t("hr.exp.clips.pistaReproducir")}</p>
              </div>
              <Download className="h-4 w-4 shrink-0 text-muted-foreground/60 transition group-hover:text-foreground" />
            </button>
          ))}
        </div>
      </div>

      {verClip && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4" onClick={() => setVerClip(null)}>
          <div className="relative w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <video src={verClip.url} controls autoPlay className="w-full rounded-xl bg-black" />
            <button type="button" onClick={() => setVerClip(null)}
              className="absolute -top-10 right-0 rounded-full bg-white/10 px-3 py-1 text-xs text-white hover:bg-white/20">
              {t("hr.exp.clips.cerrar")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
