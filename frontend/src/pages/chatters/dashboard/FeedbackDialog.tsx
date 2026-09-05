import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/UserAvatar";
import { Check, Loader2, Minus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { TIPOS_FEEDBACK, feedbackDe, useFeedbackDeChatter, useMutacionesFeedback, type TipoFeedback } from "@/pages/chatters/feedbackTL";

// Popup del supervisor sobre un chatter: registra el feedback del día y lista
// lo que ya hay. Se abre desde "Hoy en turno" haciendo clic en el nombre.
//
// El feedback NO reemplaza la nota: la suma o la resta. Eso se dice en la
// pantalla, porque una nota que se mueve sin explicación es una nota en la que
// nadie confía.
export default function FeedbackDialog({
  identityId, nombre, dia, desde, hasta, onClose,
}: {
  identityId: string | null;
  nombre: string;
  /** Día al que se le carga el feedback (normalmente hoy). */
  dia: string;
  /** Rango del historial que se lista. */
  desde: string;
  hasta: string;
  onClose: () => void;
}) {
  const { feedback, cargando } = useFeedbackDeChatter(identityId, desde, hasta);
  const { registrarVarios, borrar } = useMutacionesFeedback();
  const [comentario, setComentario] = useState("");
  // Se elige y se CONFIRMA: tocar una opción ya no escribía nada en la nota
  // sin querer. Se pueden marcar varias (o una sola).
  const [seleccion, setSeleccion] = useState<TipoFeedback[]>([]);

  const alternar = (tipo: TipoFeedback) =>
    setSeleccion((s) => (s.includes(tipo) ? s.filter((t) => t !== tipo) : [...s, tipo]));

  const puntosElegidos = seleccion.reduce((s, t) => s + (feedbackDe(t)?.puntos ?? 0), 0);
  const fechaCorta = format(new Date(`${dia}T12:00:00`), "d MMM", { locale: es });

  const confirmar = async () => {
    if (!identityId || seleccion.length === 0) return;
    try {
      await registrarVarios.mutateAsync({ identityId, dia, tipos: seleccion, comentario });
      toast.success(
        seleccion.length === 1
          ? `${feedbackDe(seleccion[0])?.label} registrado`
          : `${seleccion.length} feedbacks registrados`,
        { description: `${puntosElegidos > 0 ? "+" : ""}${puntosElegidos} a la nota de ${nombre} del ${fechaCorta}` },
      );
      setSeleccion([]);
      setComentario("");
    } catch (e) {
      toast.error("No se pudo registrar", { description: (e as Error).message });
    }
  };

  const neto = feedback.reduce((s, f) => s + Number(f.puntos), 0);

  return (
    <Dialog open={!!identityId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-y-auto p-0 sm:max-w-lg">
        <header className="flex items-center gap-3 border-b border-white/5 px-5 py-4">
          <UserAvatar name={nombre} size="md" />
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-base leading-tight">{nombre}</DialogTitle>
            <p className="text-xs text-muted-foreground">
              Feedback del {format(new Date(`${dia}T12:00:00`), "EEEE d 'de' MMMM", { locale: es })}
            </p>
          </div>
          {feedback.length > 0 && (
            <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums",
              neto < 0 ? "bg-red-500/15 text-red-400" : neto > 0 ? "bg-emerald-500/15 text-emerald-500" : "bg-white/5 text-muted-foreground")}>
              {neto > 0 ? "+" : ""}{neto} en el rango
            </span>
          )}
        </header>

        <div className="space-y-4 px-5 py-4">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Registrar
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {TIPOS_FEEDBACK.map((t) => {
                const negativo = t.puntos < 0;
                const marcado = seleccion.includes(t.tipo);
                return (
                  <button
                    key={t.tipo}
                    type="button"
                    role="checkbox"
                    aria-checked={marcado}
                    disabled={registrarVarios.isPending}
                    onClick={() => alternar(t.tipo)}
                    title={t.ayuda}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-all disabled:opacity-50",
                      negativo
                        ? marcado
                          ? "border-red-500/70 bg-red-500/15 ring-1 ring-red-500/40"
                          : "border-red-500/25 bg-red-500/5 hover:bg-red-500/10"
                        : marcado
                          ? "border-emerald-500/70 bg-emerald-500/15 ring-1 ring-emerald-500/40"
                          : "border-emerald-500/25 bg-emerald-500/5 hover:bg-emerald-500/10",
                    )}
                  >
                    <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition-colors",
                      negativo
                        ? marcado ? "bg-red-500 text-white" : "bg-red-500/15 text-red-400"
                        : marcado ? "bg-emerald-500 text-white" : "bg-emerald-500/15 text-emerald-500")}>
                      {marcado
                        ? <Check className="h-3.5 w-3.5" />
                        : negativo ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium leading-tight">{t.label}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{t.ayuda}</span>
                    </span>
                    <span className={cn("shrink-0 text-xs font-bold tabular-nums",
                      negativo ? "text-red-400" : "text-emerald-500")}>
                      {t.puntos > 0 ? "+" : ""}{t.puntos}
                    </span>
                  </button>
                );
              })}
            </div>
            <Textarea
              rows={2}
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              placeholder="Comentario (opcional) — se guarda con el feedback que elijas"
              className="mt-2 resize-none rounded-xl border-white/5 bg-background/40 text-sm"
            />

            {/* Nada se escribe hasta confirmar, y antes de confirmar se ve
                exactamente cuánto se le va a mover la nota. */}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                disabled={seleccion.length === 0 || registrarVarios.isPending}
                onClick={() => void confirmar()}
                className="gap-2"
              >
                {registrarVarios.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Confirmar
                {seleccion.length > 1 && ` (${seleccion.length})`}
              </Button>
              {seleccion.length > 0 && (
                <>
                  <span className={cn("text-xs font-semibold tabular-nums",
                    puntosElegidos < 0 ? "text-red-400" : puntosElegidos > 0 ? "text-emerald-500" : "text-muted-foreground")}>
                    {puntosElegidos > 0 ? "+" : ""}{puntosElegidos} a la nota del {fechaCorta}
                  </span>
                  <button type="button" onClick={() => setSeleccion([])}
                    className="text-xs text-muted-foreground underline-offset-2 hover:underline">
                    limpiar
                  </button>
                </>
              )}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Elige una o varias opciones y confirma. No reemplaza la nota: se suma o se resta a la que ya calculó Maven para ese día.
            </p>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Historial del rango
            </p>
            {cargando ? (
              <div className="space-y-2">{Array.from({ length: 2 }, (_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}</div>
            ) : feedback.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin feedback cargado en este rango.</p>
            ) : (
              <ul className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/5">
                {feedback.map((f) => {
                  const cat = feedbackDe(f.tipo);
                  const negativo = Number(f.puntos) < 0;
                  return (
                    <li key={f.id} className="flex items-center gap-3 px-3 py-2">
                      <span className={cn("w-10 shrink-0 text-center text-xs font-bold tabular-nums",
                        negativo ? "text-red-400" : "text-emerald-500")}>
                        {Number(f.puntos) > 0 ? "+" : ""}{Number(f.puntos)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm leading-tight">{cat?.label ?? f.tipo}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {format(new Date(`${f.dia}T12:00:00`), "d MMM", { locale: es })}
                          {f.comentario ? ` · ${f.comentario}` : ""}
                        </p>
                      </div>
                      <Button
                        variant="ghost" size="icon"
                        className="h-7 w-7 shrink-0 rounded-full text-muted-foreground hover:text-destructive"
                        title="Quitar"
                        disabled={borrar.isPending}
                        onClick={async () => {
                          try { await borrar.mutateAsync(f.id); } catch (e) { toast.error("No se pudo quitar", { description: (e as Error).message }); }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
