import { supabase } from "@/integrations/supabase/client";

// Los correos de reporte que se piden desde el navegador (Evaluador de chatters,
// QA de closers, QA de chatters).
//
// Desde el 05/10/2026 el navegador NO arma el correo ni elige a quién va: solo
// pide «manda el reporte X». send-notification-email lee el reporte con la RLS de
// quien pide (si no lo ve, 404), arma el HTML con su plantilla en el servidor y
// lo manda a las cuentas de la agencia que dice la configuración del módulo, con
// un tope por minuto. La respuesta trae cuántos correos salieron, nunca a quién.
// Antes la edge aceptaba HTML libre y cualquier dirección: un relé abierto
// desde noreply@mail.maven-ai.me.

export type PlantillaDeCorreo = "evaluacion_chatter" | "qa_closer" | "qa_chatter";

export interface ResultadoDelCorreo {
  enviados: number;
  /** «apagado»: los avisos del módulo están apagados; «sin_destinatarios»: nadie a quien mandarlo. */
  motivo?: "apagado" | "sin_destinatarios";
  /** Destinatarios de la configuración que no son cuentas de la agencia (no se les mandó). */
  omitidos?: number;
}

export async function mandarReportePorCorreo(plantilla: PlantillaDeCorreo, id: string): Promise<ResultadoDelCorreo> {
  const { data, error } = await supabase.functions.invoke("send-notification-email", { body: { plantilla, id } });
  if (error) {
    // supabase-js da «non-2xx status code» sin el motivo; el motivo real (el
    // tope por minuto, el 404) viene en el cuerpo de la respuesta.
    let detalle: string | null = null;
    const ctx = (error as { context?: unknown }).context;
    if (ctx instanceof Response) {
      try {
        const cuerpo = (await ctx.clone().json()) as { error?: string };
        if (cuerpo?.error) detalle = String(cuerpo.error);
      } catch {
        // El cuerpo no era JSON: queda el mensaje de supabase-js.
      }
    }
    throw new Error(detalle ?? (error as Error).message);
  }
  const r = (data ?? {}) as { error?: string; enviados?: number; motivo?: ResultadoDelCorreo["motivo"]; omitidos?: number };
  if (r.error) throw new Error(String(r.error));
  return { enviados: Number(r.enviados ?? 0), motivo: r.motivo, omitidos: r.omitidos };
}
