// Los mensajes programados de la conversación abierta (Jhon, 08/10: «Programar
// envío» como Google Chat).
//
// Una franja fina ENTRE la lista y el cajón, solo si hay alguno: dice cuándo
// sale el próximo y, al tocarla, los muestra con «Enviar ahora», «Editar» y
// «Eliminar». No toca el cajón ni su barra de envío rápido (innegociable).

import { useState } from "react";
import { CalendarClock, Loader2, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";
import {
  type ChatProgramado, useCancelarProgramado, useChatProgramados, useProgramarMensajes,
} from "@/hooks/useChatProgramados";
import { fechaCorta, horaCorta } from "@/lib/programarEnvio";
import {
  argsDeMensaje, docDelMensaje, sePuedeEditar, type MensajeAProgramar,
} from "../programados";
import type { JSONContent } from "@tiptap/react";

type Enviar = (...args: ReturnType<typeof argsDeMensaje>) => void;

/** Lo que el cajón llama al elegir una hora: programa y avisa. */
export function useProgramarEnChat(conversationId: string) {
  const { t, language } = useLanguage();
  const programar = useProgramarMensajes(conversationId);
  return async (mensajes: MensajeAProgramar[], cuando: Date): Promise<boolean> => {
    try {
      await programar.mutateAsync({ mensajes, cuando });
      toast.success(t("messenger.prog.programado", { cuando: `${fechaCorta(cuando, language)}, ${horaCorta(cuando, language)}` }));
      return true;
    } catch (e) {
      // El motivo lo dice la base, en palabras («ya no estás en esta conversación»).
      toast.error((e as Error).message);
      return false;
    }
  };
}

export function ProgramadosDelChat({ conversationId, onEnviar, onEditar, compacto = false }: {
  conversationId: string;
  onEnviar: Enviar;
  onEditar: (doc: JSONContent) => void;
  compacto?: boolean;
}) {
  const { t, language } = useLanguage();
  const programados = useChatProgramados(conversationId);
  const cancelar = useCancelarProgramado(conversationId);
  const [abierto, setAbierto] = useState(false);
  const filas = programados.data ?? [];
  if (filas.length === 0) return null;

  const cuandoDe = (p: ChatProgramado) => {
    const d = new Date(p.enviar_en);
    return `${fechaCorta(d, language)}, ${horaCorta(d, language)}`;
  };
  const proximo = filas.find((f) => f.estado === "pendiente") ?? filas[0];
  const fallidos = filas.filter((f) => f.estado === "fallido").length;

  /** Cancela y, si todavía se podía, hace algo con los mensajes. */
  const tomar = async (p: ChatProgramado, luego: (mensajes: MensajeAProgramar[]) => void) => {
    try {
      const mensajes = await cancelar.mutateAsync(p.id);
      if (!mensajes) {
        toast.error(t("messenger.prog.yaSalio"));
        return;
      }
      luego(mensajes);
      if (filas.length === 1) setAbierto(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className={cn("shrink-0 border-t border-border/60 bg-primary/[0.04]", compacto ? "px-2 py-1" : "px-3 py-1.5")}>
      <Popover open={abierto} onOpenChange={setAbierto}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-xs transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CalendarClock className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-foreground/90">
              {filas.length === 1
                ? t("messenger.prog.uno", { cuando: cuandoDe(proximo) })
                : t("messenger.prog.varios", { n: filas.length, cuando: cuandoDe(proximo) })}
            </span>
            {fallidos > 0 && (
              <span className="shrink-0 font-medium text-destructive">{t("messenger.prog.hayFallidos")}</span>
            )}
            <span className="shrink-0 font-medium text-primary">{t("messenger.prog.ver")}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" align="start" className="w-[min(92vw,23rem)] p-0">
          <p className="border-b border-border/60 px-3 py-2 text-xs font-semibold">{t("messenger.prog.titulo")}</p>
          <ul className="max-h-80 divide-y divide-border/60 overflow-y-auto">
            {filas.map((p) => {
              const fallo = p.estado === "fallido";
              const archivos = p.mensajes.filter((m) => m.type !== "text").length;
              const ocupado = cancelar.isPending && cancelar.variables === p.id;
              return (
                <li key={p.id} className="space-y-1.5 px-3 py-2.5" data-testid="programado-del-chat">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={cn("text-xs font-semibold tabular-nums first-letter:uppercase", fallo && "text-destructive")}>
                      {cuandoDe(p)}
                    </span>
                    {archivos > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Paperclip className="h-3 w-3" aria-hidden />
                        {t(archivos === 1 ? "messenger.prog.unArchivo" : "messenger.prog.archivos", { n: archivos })}
                      </span>
                    )}
                  </div>
                  {p.resumen && <p className="line-clamp-2 break-words text-sm">{p.resumen}</p>}
                  {fallo && (
                    <p className="text-xs text-destructive">
                      {t("messenger.prog.noSeEnvio")}{p.ultimo_error ? `: ${p.ultimo_error}` : ""}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 rounded-full px-3 text-xs"
                      disabled={ocupado}
                      onClick={() => void tomar(p, (ms) => ms.forEach((m) => onEnviar(...argsDeMensaje(m))))}
                    >
                      {ocupado && <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />}
                      {t("messenger.prog.enviarAhora")}
                    </Button>
                    {sePuedeEditar(p.mensajes) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 rounded-full px-3 text-xs"
                        disabled={ocupado}
                        onClick={() => void tomar(p, (ms) => {
                          onEditar(docDelMensaje(ms[0]));
                          setAbierto(false);
                          toast.success(t("messenger.prog.enElCajon"));
                        })}
                      >
                        {t("messenger.prog.editar")}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 rounded-full px-3 text-xs text-muted-foreground hover:text-destructive"
                      disabled={ocupado}
                      onClick={() => void tomar(p, () => toast.success(t("messenger.prog.eliminado")))}
                    >
                      {t("messenger.prog.eliminar")}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}
