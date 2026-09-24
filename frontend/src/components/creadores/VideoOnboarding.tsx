import { useRef, useState } from "react";
import { Clapperboard, Play, Upload, Trash2, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCreatorVideo, TIPOS_VIDEO, TOPE_VIDEOS } from "@/hooks/useCreatorVideo";
import { useFormato } from "@/hooks/useFormato";

/**
 * Videos de onboarding de la creadora (hasta 3): se graban una vez y los mira
 * el equipo que le escribe, para aprender su voz y sus gestos.
 *
 * El MISMO componente en tres sitios — la pestaña Operaciones del perfil
 * (donde el chatter solo reproduce y el manager además sube), y el paso de
 * Documentación del onboarding. A propósito: dos subidores distintos para el
 * mismo archivo terminan divergiendo en los límites y en los mensajes de error.
 */
export default function VideoOnboarding({
  creatorId, puedeEditar, compacto = false, ocultarSiVacio = false,
}: {
  creatorId: string;
  /** Solo quien puede editar la ficha ve subir/quitar. */
  puedeEditar: boolean;
  /** En el wizard se muestra sin la tarjeta de encabezado. */
  compacto?: boolean;
  /** Sin videos, no dibuja nada. Lo usa la vista del CHATTER: un cartel de
   *  "no hay video" es ruido sobre algo que esa persona no puede resolver.
   *  El manager sí ve el hueco, porque él es quien lo llena. */
  ocultarSiVacio?: boolean;
}) {
  const f = useFormato();
  const { videos, cargando, subir, urlParaVer, quitar, subiendo, progreso } = useCreatorVideo(creatorId);
  // Qué video está abierto y con qué URL firmada. Uno a la vez: dos <video>
  // reproduciendo en paralelo es ruido y ancho de banda tirado.
  const [abierto, setAbierto] = useState<{ id: string; url: string } | null>(null);
  const [cargandoId, setCargandoId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const lleno = videos.length >= TOPE_VIDEOS;

  const alElegirArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // El input se limpia SIEMPRE: sin esto, elegir el mismo archivo dos veces
    // seguidas (tras un error) no dispara el change y parece que no responde.
    e.target.value = "";
    if (!file) return;
    try {
      await subir(file);
      toast.success("Video subido");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const reproducir = async (id: string) => {
    if (abierto?.id === id) { setAbierto(null); return; }
    setCargandoId(id);
    try {
      setAbierto({ id, url: await urlParaVer(id) });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCargandoId(null);
    }
  };

  const borrar = async (id: string) => {
    try {
      if (abierto?.id === id) setAbierto(null);
      await quitar(id);
      toast.success("Video eliminado");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const fechaDe = (iso: string) =>
    new Date(iso).toLocaleDateString(f.intl("es-CO"), { day: "numeric", month: "short", year: "numeric" });

  if (!cargando && videos.length === 0 && ocultarSiVacio && !subiendo) return null;

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
        <h3 className="text-sm font-semibold">
          {videos.length > 1 ? "Videos de onboarding" : "Video de onboarding"}
        </h3>
        {videos.length > 0 && (
          <span className="text-xs text-muted-foreground">
            · {videos.length} de {TOPE_VIDEOS}
          </span>
        )}
      </div>

      {videos.length > 0 && (
        <div className="flex flex-col gap-2">
          {videos.map((v, i) => (
            <div key={v.id} className="rounded-xl border border-border bg-muted/30">
              <div className="flex items-center gap-3 px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => void reproducir(v.id)}
                  disabled={cargandoId === v.id}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    {cargandoId === v.id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Play className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">
                      {v.titulo || `Video ${i + 1}`}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {fechaDe(v.created_at)}
                    </span>
                  </span>
                </button>
                {puedeEditar && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    title="Quitar este video"
                    onClick={() => void borrar(v.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {abierto?.id === v.id && (
                <video
                  src={abierto.url}
                  controls
                  autoPlay
                  playsInline
                  controlsList="nodownload"
                  className="max-h-[60vh] w-full rounded-b-xl bg-black"
                  onError={() => toast.error("No se pudo reproducir el video")}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {subiendo && (
        <div className="mt-2 flex flex-col gap-2 py-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Subiendo… {progreso}%
          </div>
          <Progress value={progreso} className="h-2" />
          <p className="text-xs text-muted-foreground">
            No cierres esta pantalla hasta que termine.
          </p>
        </div>
      )}

      {!cargando && videos.length === 0 && !subiendo && (
        <div className="flex items-start gap-2 rounded-xl border border-dashed border-border/70 px-4 py-4 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Todavía no subió su video de onboarding.</span>
        </div>
      )}

      {puedeEditar && !subiendo && (
        <div className="mt-3">
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => inputRef.current?.click()}
            disabled={lleno}
          >
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            {videos.length === 0 ? "Subir video" : "Agregar otro"}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            {lleno
              ? `Llegaste al máximo de ${TOPE_VIDEOS}. Quita uno para subir otro.`
              : `MP4, MOV o WEBM · hasta 2 GB · máximo ${TOPE_VIDEOS} videos`}
          </p>
        </div>
      )}
    </div>
  );
}
