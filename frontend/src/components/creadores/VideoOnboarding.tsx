import { useRef, useState } from "react";
import { Clapperboard, Play, Upload, Trash2, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCreatorVideo, TIPOS_VIDEO } from "@/hooks/useCreatorVideo";

/**
 * Video de onboarding de la creadora: se graba una vez y lo mira el equipo
 * que le escribe, para aprender su voz y sus gestos.
 *
 * Vive en dos sitios con el MISMO componente — la pestaña Operaciones del
 * perfil (donde el chatter solo reproduce y el manager además reemplaza) y el
 * paso de Documentación del onboarding. Es el mismo widget a propósito: dos
 * subidores distintos para el mismo archivo terminan divergiendo en los
 * límites y en los mensajes de error.
 */
export default function VideoOnboarding({
  creatorId, videoKey, videoAt, puedeEditar, onCambio, compacto = false, ocultarSiVacio = false,
}: {
  creatorId: string;
  /** La LLAVE en R2, no una URL: null = todavía no hay video. */
  videoKey: string | null;
  videoAt?: string | null;
  /** Solo quien puede editar la ficha ve subir/reemplazar/quitar. */
  puedeEditar: boolean;
  onCambio?: () => void;
  /** En el wizard se muestra sin la tarjeta de encabezado. */
  compacto?: boolean;
  /** Sin video, no dibuja nada. Lo usa la vista del CHATTER: un cartel de
   *  "no hay video" es ruido sobre algo que esa persona no puede resolver.
   *  El manager sí ve el hueco, porque él es quien lo llena. */
  ocultarSiVacio?: boolean;
}) {
  const { subir, urlParaVer, quitar, subiendo, progreso } = useCreatorVideo(creatorId);
  const [url, setUrl] = useState<string | null>(null);
  const [abriendo, setAbriendo] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const elegir = () => inputRef.current?.click();

  const alElegirArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // El input se limpia SIEMPRE: sin esto, elegir el mismo archivo dos veces
    // seguidas (tras un error) no dispara el change y parece que no responde.
    e.target.value = "";
    if (!file) return;
    try {
      await subir(file);
      setUrl(null);
      toast.success("Video subido");
      onCambio?.();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const reproducir = async () => {
    setAbriendo(true);
    try {
      setUrl(await urlParaVer());
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setAbriendo(false);
    }
  };

  const borrar = async () => {
    try {
      await quitar();
      setUrl(null);
      toast.success("Video eliminado");
      onCambio?.();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const fecha = videoAt
    ? new Date(videoAt).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })
    : null;

  if (!videoKey && ocultarSiVacio && !subiendo) return null;

  return (
    <div className={cn(!compacto && "rounded-2xl border border-border bg-card p-4")}>
      <input
        ref={inputRef}
        type="file"
        accept={TIPOS_VIDEO.join(",")}
        className="hidden"
        onChange={alElegirArchivo}
      />

      <div className="mb-3 flex items-center gap-2">
        <Clapperboard className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Video de onboarding</h3>
        {fecha && <span className="text-xs text-muted-foreground">· {fecha}</span>}
      </div>

      {subiendo ? (
        <div className="flex flex-col gap-2 py-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Subiendo… {progreso}%
          </div>
          <Progress value={progreso} className="h-2" />
          <p className="text-xs text-muted-foreground">
            No cierres esta pantalla hasta que termine.
          </p>
        </div>
      ) : url ? (
        <video
          src={url}
          controls
          autoPlay
          playsInline
          controlsList="nodownload"
          className="max-h-[60vh] w-full rounded-xl bg-black"
          onError={() => toast.error("No se pudo reproducir el video")}
        />
      ) : videoKey ? (
        <button
          type="button"
          onClick={() => void reproducir()}
          disabled={abriendo}
          className="flex w-full items-center gap-3 rounded-xl border border-border bg-muted/40 px-4 py-6 transition-colors hover:bg-muted"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            {abriendo ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
          </span>
          <span className="text-left">
            <span className="block text-sm font-semibold">Reproducir</span>
            <span className="block text-xs text-muted-foreground">
              Escúchala hablar antes de escribir como ella
            </span>
          </span>
        </button>
      ) : (
        <div className="flex items-start gap-2 rounded-xl border border-dashed border-border/70 px-4 py-4 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Todavía no subió su video de onboarding.</span>
        </div>
      )}

      {puedeEditar && !subiendo && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="rounded-full" onClick={elegir}>
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            {videoKey ? "Reemplazar" : "Subir video"}
          </Button>
          {videoKey && (
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full text-destructive hover:text-destructive"
              onClick={() => void borrar()}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Quitar
            </Button>
          )}
        </div>
      )}

      {puedeEditar && !videoKey && !subiendo && (
        <p className="mt-2 text-xs text-muted-foreground">
          MP4, MOV o WEBM · hasta 2 GB
        </p>
      )}
    </div>
  );
}
