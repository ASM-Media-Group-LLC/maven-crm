import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { asuntoNormalizado } from "@/lib/mailHilos";
import { armarHiloCruzado } from "@/lib/mailHiloCruzado";
import type { MailSummary } from "@/hooks/useMailbox";

// LA CONVERSACIÓN ENTERA, CRUZANDO CARPETAS.
//
// Lo pidió Jhon poniendo Maven al lado de Gmail: «mandé mi respuesta pero no
// queda como en Google, que queda de inmediato». En Gmail el hilo tiene los
// cuatro mensajes —los que llegaron Y los que mandó él—; en Maven tenía dos,
// porque la lista consulta UNA carpeta y sus propias respuestas viven en
// Enviados.
//
// ⚠️ Una conversación NO vive en una carpeta. Vive repartida: lo que te llegó
// está en Recibidos, lo que contestaste en Enviados, y lo viejo que archivaste
// en Archivados. Agrupar dentro de una carpeta solo puede mostrar la mitad de
// la charla — y encima la mitad en la que uno no habla.

/** Carpetas que NO entran a un hilo.
 *
 *  Un correo que mandaste a la papelera no tiene por qué reaparecer adentro de
 *  la conversación, ni el spam colarse en un hilo legítimo. Es lo mismo que
 *  hace Gmail. Borrador tampoco: no es un mensaje, es algo a medio escribir. */
const FUERA_DEL_HILO = ["Papelera", "Trash", "Spam", "Junk", "Borrador", "Drafts"];

/** Cuánto para atrás se busca por asunto. El mismo criterio que el motor. */
const VENTANA_DIAS = 30;

const COLUMNAS =
  "id, uid, folder, from_addr, to_addr, cc_addr, subject, date, snippet, unread, message_id, in_reply_to, refs";

/** `%` y `_` son comodines de LIKE: un asunto que los traiga buscaría de más. */
function escaparLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function aResumen(m: Record<string, unknown>): MailSummary {
  return {
    id: m.id as string,
    uid: m.uid as number,
    // ⚠️ La carpeta viaja con cada mensaje: acá conviven de varias, y abrir
    // uno o responderlo necesita saber en cuál está.
    folder: m.folder as string,
    from: (m.from_addr as string) ?? "",
    to: (m.to_addr as string) ?? "",
    cc: (m.cc_addr as string) ?? undefined,
    subject: (m.subject as string) ?? "(sin asunto)",
    date: (m.date as string) ?? "",
    snippet: (m.snippet as string) ?? "",
    messageId: (m.message_id as string) ?? undefined,
    inReplyTo: (m.in_reply_to as string) ?? undefined,
    refs: (m.refs as string[]) ?? undefined,
    unread: !!m.unread,
    origen: "cache" as const,
  };
}

/**
 * Trae el resto de la conversación que no está en la carpeta que se mira.
 *
 * Cuatro consultas en paralelo, que es UNA ida y vuelta de espera:
 *
 *  1-3. **Por cabeceras**: los que SON alguno de los ids conocidos, los que
 *       responden a uno, y los que lo nombran en su `References`. Es el camino
 *       exacto.
 *  4.   **Por asunto**, dentro de 30 días. Hace falta por dos motivos, los dos
 *       reales: las columnas de cabeceras existen recién desde el 18/09/2026,
 *       así que TODO el correo anterior está sin ellas; y la copia que se
 *       siembra en Enviados al mandar un correo tarda en tenerlas. Sin este
 *       camino, la respuesta que acabás de mandar no aparecería en su propio
 *       hilo, que es justo lo que se reportó.
 *
 * Lo que vuelve NO se une a mano: se le pasa entero a `agruparEnHilos`, que es
 * quien sabe las reglas (participantes en común, ventana de tiempo, asuntos
 * demasiado pobres). Acá solo se junta gente que MERECE que la miren; quién
 * termina adentro del hilo lo sigue decidiendo el motor, uno solo y testeado.
 */
export function useHiloCompleto(args: {
  /** Los mensajes del hilo que ya se conocen (los de la carpeta a la vista). */
  conocidos: MailSummary[];
  /** El asunto de la conversación, ya sin los `Re:`. */
  asunto: string;
  habilitado: boolean;
}): { hilo: MailSummary[]; cargando: boolean } {
  const { user } = useAuth();
  const ids = args.conocidos
    .flatMap((m) => [m.messageId, m.inReplyTo, ...(m.refs ?? [])])
    .filter(Boolean) as string[];
  const unicos = [...new Set(ids)].sort();
  const norm = asuntoNormalizado(args.asunto ?? "");

  const { data, isFetching } = useQuery({
    // La llave es el hilo, no la carpeta: mirarlo desde Recibidos o desde una
    // etiqueta es la misma conversación y no tiene por qué volver a pedirse.
    queryKey: ["mail-hilo", user?.id, unicos.join("|"), norm] as const,
    enabled: args.habilitado && !!user && (unicos.length > 0 || norm.length >= 4),
    staleTime: 30_000,
    queryFn: async () => {
      const base = () =>
        supabase.from("mail_messages" as never).select(COLUMNAS)
          .not("folder", "in", `(${FUERA_DEL_HILO.join(",")})`)
          .limit(100);

      const desde = new Date(Date.now() - VENTANA_DIAS * 24 * 3600_000).toISOString();
      const consultas = [];
      if (unicos.length) {
        consultas.push(base().in("message_id", unicos));
        consultas.push(base().in("in_reply_to", unicos));
        consultas.push(base().overlaps("refs", unicos));
      }
      // Un asunto de tres letras —o un «(sin asunto)»— traería media bandeja
      // para que el motor la descarte después. No vale la consulta.
      if (norm.length >= 4) {
        consultas.push(base().ilike("subject", `%${escaparLike(norm)}%`).gte("date", desde));
      }

      const respuestas = await Promise.all(consultas);
      const filas: Record<string, unknown>[] = [];
      for (const r of respuestas) {
        if (r.error) throw r.error;
        filas.push(...((r.data ?? []) as unknown as Record<string, unknown>[]));
      }
      return filas;
    },
  });

  // El armado está en `lib/mailHiloCruzado.ts`, puro y probado: es donde
  // viven las dos trampas (juntar por fila, mostrar uno por mensaje).
  return {
    hilo: armarHiloCruzado(args.conocidos, (data ?? []).map(aResumen)),
    cargando: isFetching,
  };
}
