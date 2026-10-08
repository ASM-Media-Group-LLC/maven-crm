// La carpeta «Programados» del Correo (Keila, 08/10: como la de Gmail).
//
// No es una carpeta del servidor: lee la tabla mail_programados. Cada fila
// empieza por CUÁNDO sale —en esta carpeta es lo primero que se busca— y
// tiene una sola acción: «Cancelar envío», que lo vuelve a abrir en el
// compositor para editarlo (como Gmail). Uno que falló dice por qué y se abre
// igual, para corregirlo.

import { AlertTriangle, ArrowLeft, CalendarClock, Loader2, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";
import {
  type CorreoProgramado, useCancelarProgramado, useCorreosProgramados,
} from "@/hooks/useMailbox";
import type { BorradorInicial } from "@/components/correo/MailComposer";
import { borradorDeProgramado } from "@/lib/correo/programados";
import { fechaCorta, horaCorta } from "@/lib/programarEnvio";

export function VistaProgramados({ onEditar, onVolver }: {
  onEditar: (inicial: BorradorInicial) => void;
  /** Solo en pantalla chica, donde no está la columna de carpetas. */
  onVolver: () => void;
}) {
  const { t } = useLanguage();
  const programados = useCorreosProgramados(true);
  const cancelar = useCancelarProgramado();

  const cancelarYEditar = async (p: CorreoProgramado) => {
    try {
      const cancelado = await cancelar.mutateAsync(p.id);
      if (!cancelado) {
        toast.error(t("mail.sched.tooLate"));
        return;
      }
      onEditar(borradorDeProgramado(cancelado));
      toast.success(t("mail.sched.canceled"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const filas = programados.data ?? [];

  return (
    <section className="flex min-w-0 flex-1 flex-col" aria-labelledby="titulo-programados">
      <header className="flex items-start gap-3 border-b border-border/60 px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={onVolver}
          className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
          aria-label={t("mail.sched.back")}
          title={t("mail.sched.back")}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <h2 id="titulo-programados" className="text-base font-semibold">{t("mail.sched.title")}</h2>
          <p className="mt-0.5 max-w-[65ch] text-sm text-muted-foreground">{t("mail.sched.subtitle")}</p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {programados.isLoading && (
          <div className="space-y-3 p-4 sm:p-6">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}
          </div>
        )}

        {programados.isError && (
          <p className="p-6 text-sm text-destructive">{t("mail.sched.loadError")}</p>
        )}

        {!programados.isLoading && !programados.isError && filas.length === 0 && (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <CalendarClock className="h-8 w-8 text-muted-foreground/60" aria-hidden />
            <p className="mt-3 text-sm font-medium">{t("mail.sched.empty")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("mail.sched.emptyHint")}</p>
          </div>
        )}

        <ul className="divide-y divide-border/60">
          {filas.map((p) => (
            <FilaProgramado
              key={p.id}
              p={p}
              ocupado={cancelar.isPending && cancelar.variables === p.id}
              onCancelar={() => void cancelarYEditar(p)}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}

function FilaProgramado({ p, ocupado, onCancelar }: {
  p: CorreoProgramado;
  ocupado: boolean;
  onCancelar: () => void;
}) {
  const { t, language } = useLanguage();
  const cuando = new Date(p.enviar_en);
  const fallo = p.estado === "fallido";
  const saliendo = p.estado === "enviando";
  const destinatarios = [...p.para, ...p.cc].join(", ");

  return (
    <li
      data-testid="fila-programado"
      className="grid grid-cols-[5.5rem_1fr] gap-x-4 gap-y-2 px-4 py-3.5 sm:grid-cols-[7rem_1fr_auto] sm:items-center sm:px-6"
    >
      {/* Cuándo sale: lo primero que se busca en esta carpeta. */}
      <div className={cn("tabular-nums", fallo && "text-destructive")}>
        {/* Solo la primera letra: `capitalize` dejaba «Vie, 9 De Oct». */}
        <p className="text-sm font-semibold first-letter:uppercase">{fechaCorta(cuando, language)}</p>
        <p className={cn("text-xs", fallo ? "text-destructive/80" : "text-muted-foreground")}>
          {horaCorta(cuando, language)}
        </p>
      </div>

      <div className="min-w-0">
        <p className="truncate text-sm text-muted-foreground">{t("mail.sched.to", { quien: destinatarios })}</p>
        <p className="truncate text-sm">
          <span className="font-medium">{!p.asunto || p.asunto === "(sin asunto)" ? t("mail.noSubject") : p.asunto}</span>
          {p.resumen && <span className="text-muted-foreground"> — {p.resumen}</span>}
        </p>
        {fallo && (
          <p className="mt-1 flex items-start gap-1.5 text-xs text-destructive">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{t("mail.sched.failed")}{p.ultimo_error ? `: ${p.ultimo_error}` : ""}</span>
          </p>
        )}
      </div>

      <div className="col-start-2 flex items-center gap-3 sm:col-start-auto sm:justify-end">
        {p.adjuntos_meta.length > 0 && (
          <span
            className="inline-flex items-center gap-1 text-xs text-muted-foreground"
            title={p.adjuntos_meta.map((a) => a.filename).join("\n")}
          >
            <Paperclip className="h-3.5 w-3.5" aria-hidden />
            {p.adjuntos_meta.length}
          </span>
        )}
        {saliendo ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            {t("mail.sched.sending")}
          </span>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={onCancelar}
            disabled={ocupado}
          >
            {ocupado && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
            {fallo ? t("mail.sched.editFailed") : t("mail.sched.cancel")}
          </Button>
        )}
      </div>
    </li>
  );
}
