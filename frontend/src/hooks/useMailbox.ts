import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { describeFunctionError } from "@/hooks/useMailConnection";
import { base64ABlob } from "@/lib/base64Blob";
import { adjuntosIncrustados, incrustarCids } from "@/lib/mailCid";

/**
 * Buzón del usuario: carpetas, mensajes, lectura y envío.
 *
 * DOS FUENTES, en este orden:
 *
 * 1. LA CACHÉ (mail_messages en Postgres) — el camino normal. La llena el
 *    sincronizador (infra/mail-sync), que es el único proceso que habla
 *    IMAP con el proveedor. Leer de acá es instantáneo, funciona para 60
 *    personas igual que para 5, y no depende del humor del proveedor
 *    (que raciona conexiones y castiga ráfagas — aprendido el 21/08 a
 *    fuerza de cuelgues).
 *
 * 2. EL CAMINO EN VIVO (edge function mail-fetch → IMAP) — fallback SOLO
 *    cuando la caché está vacía para ese usuario (worker aún no corre o
 *    casilla recién creada sin primer barrido). Así el correo funciona
 *    aunque el worker esté caído; lento, pero funciona.
 *
 * El envío no cambia: SMTP vía edge function, siempre.
 */

/** Buzón provisionado para el usuario. Sale de `v_my_mailbox`, no de la
 *  tabla: `secret_cipher`/`secret_nonce` están fuera del GRANT. */
export interface Mailbox {
  email_address: string;
  created_at: string;
  last_used_at: string | null;
  is_active: boolean;
  has_error: boolean;
}

export interface MailSummary {
  /** id de la fila en caché. Presente solo cuando vino de la caché. */
  id?: string;
  /** Identificador IMAP estable (caché). */
  uid?: number | string | null;
  /** Número de secuencia (solo camino en vivo). */
  seq?: number;
  from: string;
  to: string;
  subject: string;
  date: string;
  /** Primeras líneas del cuerpo — solo lo trae la caché. */
  snippet?: string;
  messageId?: string;
  /** En qué carpeta vive. Solo lo trae la vista por ETIQUETA, donde conviven
   *  correos de Recibidos, Archivados y Enviados: sin esto, abrir uno lo
   *  buscaría en la carpeta seleccionada, que no es la suya. En las vistas por
   *  carpeta sobra, porque son todos de la misma. */
  folder?: string;
  // ⚠️ OBLIGATORIAS aunque el valor pueda ser `undefined`: son lo que usa
  // `agruparEnHilos` para encadenar. Estando opcionales, un camino que se
  // olvidara de traerlas compilaba igual y dejaba esa vista sin hilos, sin
  // aviso de ningún tipo. Así, olvidarlas no compila.
  /** `In-Reply-To`. Falta en lo sincronizado antes del 18/09/2026. */
  inReplyTo: string | undefined;
  /** `References`, del más viejo al más nuevo. Ídem. */
  refs: string[] | undefined;
  cc?: string;
  unread: boolean;
  /** De dónde salió: decide cómo abrirlo y cómo marcarlo leído. */
  origen: "cache" | "vivo";
}

export interface MailAttachment {
  filename: string;
  contentType: string;
  sizeBytes: number;
  contentId: string | null;
}

export interface MailMessage {
  folder: string;
  from: string;
  to: string;
  cc: string;
  subject: string;
  date: string;
  html: string | null;
  text: string | null;
  /** Cuántas imágenes remotas trae. El lector las bloquea hasta que el
   *  usuario decida: cargarlas le confirma al remitente que abrió el
   *  correo, que es exactamente para lo que sirve un píxel de rastreo. */
  remote_images: number;
  attachments: MailAttachment[];
  truncated: boolean;
}

/** Semáforo: MÁXIMO 2 llamadas al camino EN VIVO simultáneas por pestaña.
 *  Solo aplica a la edge function (que abre IMAP/SMTP): el proveedor
 *  raciona conexiones concurrentes — medido: 2-3 a la vez ~1,5 s, una
 *  ráfaga de 6 colgada >45 s. Las lecturas de la caché no pasan por acá:
 *  son Postgres y aguantan lo que les tires. */
const MAX_SIMULTANEAS = 2;
let enVuelo = 0;
const fila: Array<() => void> = [];

async function conTurno<T>(fn: () => Promise<T>): Promise<T> {
  while (enVuelo >= MAX_SIMULTANEAS) {
    await new Promise<void>((listo) => fila.push(listo));
  }
  enVuelo++;
  try {
    return await fn();
  } finally {
    enVuelo--;
    fila.shift()?.();
  }
}

/** Llama a `mail-fetch` y devuelve el cuerpo ya tipado. */
function callMail<T>(body: Record<string, unknown>): Promise<T> {
  return conTurno(async () => {
    const { data, error } = await supabase.functions.invoke("mail-fetch", { body });
    // supabase-js deja "non-2xx status code" y esconde el motivo real en la
    // Response de `error.context`. Sin desenvolverlo el diagnóstico es a ciegas.
    if (error) throw new Error(await describeFunctionError(error));
    const payload = data as T & { error?: string };
    if (payload?.error) throw new Error(payload.error);
    return payload as T;
  });
}

/** Reglas de las consultas que PUEDEN abrir una sesión IMAP (el fallback).
 *  - retry: false — reintentar contra un proveedor que castiga alarga el castigo.
 *  - refetchOnWindowFocus: false — volver a la pestaña no puede costar conexiones. */
const SESION_IMAP = {
  retry: false,
  refetchOnWindowFocus: false,
} as const;

/** ¿Tiene buzón este usuario? Se provisiona solo al crear la cuenta. */
export function useMailbox() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["mailbox", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Mailbox | null> => {
      const { data, error } = await supabase
        .from("v_my_mailbox")
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return (data as Mailbox | null) ?? null;
    },
  });
}

/** Nombres de carpeta que el proveedor devuelve traducidos, y su orden. */
const ORDEN_CARPETAS = [
  "INBOX",
  "Enviado",
  "Borrador",
  "Correo no deseado",
  "Papelera",
  "Archive",
];

export function ordenarCarpetas(folders: string[]): string[] {
  const peso = (f: string) => {
    const i = ORDEN_CARPETAS.indexOf(f);
    return i === -1 ? ORDEN_CARPETAS.length : i;
  };
  return [...folders].sort((a, b) => peso(a) - peso(b) || a.localeCompare(b));
}

export interface CarpetaInfo {
  folder: string;
  unread: number;
}

export function useMailFolders(enabled: boolean) {
  return useQuery({
    queryKey: ["mail-folders"],
    enabled,
    ...SESION_IMAP,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<CarpetaInfo[]> => {
      // Caché primero: mantenida por el sincronizador, con no-leídos.
      const { data, error } = await supabase
        .from("mail_folders")
        .select("folder, unread");
      if (error) throw error;
      if (data && data.length > 0) {
        const orden = ordenarCarpetas(data.map((f) => f.folder as string));
        return orden.map((f) => ({
          folder: f,
          unread: (data.find((x) => x.folder === f)?.unread as number) ?? 0,
        }));
      }
      // Fallback en vivo (el worker aún no barrió esta casilla).
      const r = await callMail<{ folders: string[] }>({ action: "imap_folders" });
      return ordenarCarpetas(r.folders ?? []).map((f) => ({ folder: f, unread: 0 }));
    },
  });
}

/** Correos por página, como Gmail («1–50 de 186»). */
export const CORREOS_POR_PAGINA = 50;

/** Una PÁGINA de la carpeta, de las más nuevas a las más viejas.
 *
 *  Grace (28/09): «¿cómo hago para ver el resto de los correos? Solo me salen
 *  los 50 primeros y son 126 que tengo pendientes por leer». La caché tenía
 *  los 186 de su bandeja, pero la lista pedía siempre los primeros 50 y no
 *  había cómo pasar a los siguientes.
 *
 *  ⚠️ La página va en la CLAVE (["mail-messages", folder, pagina]): quien
 *  toque la lista de una carpeta a mano tiene que usar setQueriesData con el
 *  prefijo ["mail-messages", folder], o solo cambiaría la página 0. */
export function useMailMessages(folder: string, enabled: boolean, pagina = 0) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["mail-messages", folder, pagina],
    enabled: enabled && !!folder,
    ...SESION_IMAP,
    staleTime: 60 * 1000,
    // Al pasar de página se sigue viendo la anterior hasta que llega la nueva:
    // sin esto la lista se vacía y parpadea con cada ‹ ›.
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ messages: MailSummary[]; total?: number }> => {
      // Caché primero.
      // ⚠️ `as never` en la tabla: `types.ts` es generado y todavía no conoce
      // `in_reply_to` ni `refs`, así que el cliente tipado rechaza el select
      // entero. Mismo patrón que calendar_events y document_shares.
      const COLUMNAS_BASE =
        "id, uid, from_addr, to_addr, cc_addr, subject, date, snippet, unread, message_id";
      const desde = pagina * CORREOS_POR_PAGINA;
      const traer = (cols: string) =>
        supabase.from("mail_messages" as never)
          // El total viene en la MISMA consulta: es el «de 186» de Gmail.
          .select(cols, { count: "exact" })
          .eq("folder", folder)
          .order("date", { ascending: false })
          // Desempate estable: con dos correos a la misma hora, sin esto uno
          // podía salir en la página 1 Y en la 2 (o en ninguna).
          .order("uid", { ascending: false })
          .range(desde, desde + CORREOS_POR_PAGINA - 1);

      // ⚠️ SE DEGRADA EN VEZ DE CAERSE.
      //
      // El 18/09/2026 el frontend salió a producción pidiendo `in_reply_to` y
      // `refs` ANTES de que la migración estuviera aplicada, y PostgREST
      // rechazó el select entero: el Correo quedó con "No se pudieron traer
      // los mensajes · column mail_messages.in_reply_to does not exist" para
      // todo el mundo. Dos columnas OPCIONALES —que solo mejoran cómo se
      // agrupan los hilos— voltearon el módulo completo.
      //
      // Si faltan, se reintenta sin ellas: los hilos se agrupan por asunto,
      // que es el camino de respaldo que ya existe, y la bandeja se ve.
      let { data, error, count } = await traer(`${COLUMNAS_BASE}, in_reply_to, refs`);
      if (error && /in_reply_to|refs/.test(error.message ?? "")) {
        ({ data, error, count } = await traer(COLUMNAS_BASE));
      }
      if (error) throw error;
      // ⚠️ De la página 2 en adelante NUNCA se cae al camino en vivo: una
      // página vacía (se borraron correos y la lista se achicó) es un vacío de
      // verdad, no una caché sin sincronizar.
      if ((data && data.length > 0) || pagina > 0) {
        return {
          total: count ?? undefined,
          messages: ((data ?? []) as unknown as Record<string, unknown>[]).map((m) => ({
            id: m.id as string,
            uid: m.uid as number,
            from: (m.from_addr as string) ?? "",
            to: (m.to_addr as string) ?? "",
            subject: (m.subject as string) ?? "(sin asunto)",
            date: (m.date as string) ?? "",
            snippet: (m.snippet as string) ?? "",
            messageId: (m.message_id as string) ?? undefined,
            // Las cabeceras que encadenan la conversación. Faltan en todo lo
            // sincronizado antes del 18/09/2026: para esos, `agruparEnHilos`
            // cae al camino por asunto.
            inReplyTo: (m.in_reply_to as string) ?? undefined,
            refs: (m.refs as string[]) ?? undefined,
            cc: (m.cc_addr as string) ?? undefined,
            unread: !!m.unread,
            origen: "cache" as const,
          })),
        };
      }

      // Fallback en vivo, con los cuerpos de los 2 más nuevos en la misma
      // sesión IMAP (sembrados en la caché de react-query).
      const r = await callMail<{
        messages: Array<{
          seq: number; uid: string | null; from: string; to: string;
          subject: string; date: string; unread: boolean; messageId: string;
        }>;
        bodies?: Array<MailMessage & { seq: number }>;
      }>({ action: "imap_messages", folder, limit: 50, with_bodies: 2 });
      for (const b of r.bodies ?? []) {
        qc.setQueryData(["mail-message", folder, `seq:${b.seq}`], b);
      }
      // Orden explícito por seq descendente: no confiar en el del servidor.
      const orden = [...(r.messages ?? [])].sort((a, b) => b.seq - a.seq);
      return {
        // El camino en vivo no trae las cabeceras del hilo: es el respaldo de
        // cuando la caché está vacía y pide los encabezados mínimos. Se
        // agrupará por asunto, que es lo que puede.
        messages: orden.map((m) => ({
          ...m, inReplyTo: undefined, refs: undefined, origen: "vivo" as const,
        })),
      };
    },
  });
}

/** Clave de un mensaje para la caché de react-query, según su origen. */
export function claveDe(m: Pick<MailSummary, "id" | "seq" | "origen">): string {
  return m.origen === "cache" ? `id:${m.id}` : `seq:${m.seq}`;
}

const MENSAJE_CACHE = {
  staleTime: 30 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
} as const;

async function fetchMensajeCache(id: string): Promise<MailMessage> {
  const { data, error } = await supabase
    .from("mail_messages")
    .select(
      "folder, from_addr, to_addr, cc_addr, subject, date, html, text_body, remote_images, attachments, truncated",
    )
    .eq("id", id)
    .single();
  if (error) throw error;
  return {
    folder: data.folder as string,
    from: (data.from_addr as string) ?? "",
    to: (data.to_addr as string) ?? "",
    cc: (data.cc_addr as string) ?? "",
    subject: (data.subject as string) ?? "(sin asunto)",
    date: (data.date as string) ?? "",
    html: (data.html as string | null) ?? null,
    text: (data.text_body as string | null) ?? null,
    remote_images: (data.remote_images as number) ?? 0,
    attachments: (data.attachments as MailAttachment[]) ?? [],
    truncated: !!data.truncated,
  };
}

function fetchMensajeVivo(folder: string, seq: number): Promise<MailMessage> {
  return callMail<MailMessage>({ action: "imap_message", folder, seq, mark_read: false });
}

export function useMailMessage(folder: string, sel: MailSummary | null) {
  return useQuery({
    queryKey: ["mail-message", folder, sel ? claveDe(sel) : null],
    enabled: !!folder && !!sel,
    ...SESION_IMAP,
    ...MENSAJE_CACHE,
    queryFn: () =>
      sel!.origen === "cache"
        ? fetchMensajeCache(sel!.id!)
        : fetchMensajeVivo(folder, sel!.seq!),
  });
}

/** Pre-carga un mensaje a la misma clave que usa `useMailMessage`. Para la
 *  caché es una consulta a Postgres (gratis); el camino en vivo pasa por el
 *  semáforo como todo lo demás. */
export function usePrefetchMailMessage() {
  const qc = useQueryClient();
  return useCallback(
    (folder: string, m: MailSummary) => {
      void qc.prefetchQuery({
        queryKey: ["mail-message", folder, claveDe(m)],
        ...MENSAJE_CACHE,
        queryFn: () =>
          m.origen === "cache"
            ? fetchMensajeCache(m.id!)
            : fetchMensajeVivo(folder, m.seq!),
      });
    },
    [qc],
  );
}

/** Marca leído: apaga el punto azul al instante y lleva la bandera al
 *  proveedor en segundo plano. */
export function useMarkSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ folder, m }: { folder: string; m: MailSummary }) => {
      if (m.origen === "cache" && m.id) {
        // Directo a la fila propia (la política RLS + el GRANT de columna
        // permiten exactamente esto y nada más).
        await supabase.from("mail_messages").update({ unread: false }).eq("id", m.id);
        // Y al proveedor por UID, sin bloquear a nadie si falla: el
        // sincronizador reconcilia banderas en cada barrido igual.
        if (m.uid) {
          void callMail({ action: "mark_seen", folder, uid: Number(m.uid) }).catch(() => {});
        }
        return;
      }
      if (m.seq) await callMail({ action: "mark_seen", folder, seq: m.seq });
    },
    onMutate: ({ folder, m }) => {
      qc.setQueriesData(
        { queryKey: ["mail-messages", folder] },
        (prev: { messages?: MailSummary[] } | undefined) =>
          prev?.messages
            ? {
                ...prev,
                messages: prev.messages.map((x) =>
                  claveDe(x) === claveDe(m) ? { ...x, unread: false } : x,
                ),
              }
            : prev,
      );

      // ⚠️ Y EL CONTADOR DE LA CARPETA, al instante.
      //
      // `mail_folders.unread` es una columna GUARDADA que solo escribe
      // `mail-sync` (la RLS de esa tabla es de solo lectura para la persona),
      // así que el número de verdad se corrige recién en el próximo barrido.
      // Hasta entonces el globito decía uno de más: leías el correo y el
      // número no se movía hasta recargar la página.
      //
      // Se baja acá de a uno y el barrido reconcilia después. Nunca por debajo
      // de cero: con dos pestañas abiertas, leer el mismo correo dos veces
      // pasaría por acá dos veces.
      qc.setQueryData(
        ["mail-folders"],
        (prev: { folder: string; unread: number }[] | undefined) =>
          prev?.map((c) =>
            c.folder === folder ? { ...c, unread: Math.max(0, c.unread - 1) } : c,
          ) ?? prev,
      );
    },
  });
}

export type OperacionMasiva =
  | "seen" | "unseen" | "delete" | "archive" | "spam" | "move" | "snooze";

/** Acciones sobre VARIOS correos de una carpeta (la barra de selección).
 *  Optimista: la lista cambia al instante y se reconcilia con la respuesta.
 *  Solo aplica a mensajes con UID (los de la caché); los del camino en vivo
 *  no tienen un identificador estable. */
export function useMailBulk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      { folder, op, items, dest, volverAt }:
      {
        folder: string; op: OperacionMasiva; items: MailSummary[];
        dest?: string;
        /** Para `snooze`: cuándo tiene que reaparecer, en ISO. */
        volverAt?: string;
      },
    ) => {
      const uids = items.map((m) => Number(m.uid)).filter((u) => Number.isInteger(u) && u > 0);
      if (!uids.length) throw new Error("Estos correos no tienen identificador; abre la carpeta de nuevo e inténtalo.");
      const r = await callMail<{ ok: true; afectados: number }>({ action: "bulk", folder, op, uids, dest, volver_at: volverAt });
      return { ...r, omitidos: items.length - uids.length };
    },
    onMutate: ({ folder, op, items }) => {
      const claves = new Set(items.map(claveDe));
      qc.setQueriesData(
        { queryKey: ["mail-messages", folder] },
        (prev: { messages?: MailSummary[] } | undefined) => {
          if (!prev?.messages) return prev;
          const messages = op === "seen" || op === "unseen"
            ? prev.messages.map((x) => (claves.has(claveDe(x)) ? { ...x, unread: op === "unseen" } : x))
            : prev.messages.filter((x) => !claves.has(claveDe(x)));
          return { ...prev, messages };
        },
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["mail-messages"] });
      qc.invalidateQueries({ queryKey: ["mail-folders"] });
      qc.invalidateQueries({ queryKey: ["mail-search"] });
      qc.invalidateQueries({ queryKey: ["sidebar-badges"] });
      // Y lo que se arma desde la caché CRUZANDO carpetas: la vista de una
      // etiqueta y su contador. Un correo movido cambia de carpeta en la caché
      // (el servidor traslada la fila); sin esto la etiqueta seguía mostrando
      // la foto vieja durante su staleTime.
      qc.invalidateQueries({ queryKey: ["mail-por-etiqueta"] });
      qc.invalidateQueries({ queryKey: ["mail-labels-unread"] });
    },
  });
}

/** La bandeja se actualiza SOLA: el sincronizador inserta en mail_messages
 *  y Realtime lo empuja hasta acá — el mismo mecanismo de los ✓✓ del chat.
 *  RLS aplica también en Realtime: cada quien recibe solo sus filas. */
export function useMailRealtime(enabled: boolean) {
  const { user } = useAuth();
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled || !user?.id) return;
    const canal = supabase
      .channel(`mail-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "mail_messages",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["mail-messages"] });
          qc.invalidateQueries({ queryKey: ["mail-folders"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [enabled, user?.id, qc]);
}

export interface OutgoingMail {
  to: string[];
  cc?: string[];
  /** Copia oculta: viaja como destinatario SMTP pero jamás en los headers. */
  bcc?: string[];
  subject: string;
  html?: string;
  text?: string;
  in_reply_to?: string;
  references?: string;
  /** Adjuntos: nombre, tipo y contenido en base64 (sin el prefijo data:). */
  attachments?: Array<{
    filename: string;
    contentType: string;
    contentBase64: string;
    /** Presente = imagen PEGADA en el cuerpo: viaja con Content-ID y el HTML
     *  la referencia con `src="cid:…"`, no como archivo adjunto. */
    contentId?: string;
  }>;
  /** A quién se mencionó con @ en el cuerpo (ids de Maven). Son los que reciben
   *  el aviso dentro de la app además del correo. La edge verifica que cada uno
   *  exista y tenga casilla: mandar un id cualquiera no crea una notificación. */
  menciones?: string[];
}

export function useSendMail() {
  const qc = useQueryClient();
  return useMutation({
    // El remitente NO va en el cuerpo: la edge function lo toma siempre de
    // la credencial del usuario. Mandarlo desde acá permitiría hacerse pasar
    // por otra persona de la empresa.
    mutationFn: (mail: OutgoingMail) =>
      callMail<{ ok: true; from: string; to: string[] }>({
        action: "send",
        ...mail,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mail-messages", "Enviado"] });
      // La respuesta que acabás de mandar tiene que aparecer EN SU HILO, no
      // solo en Enviados: es lo que se ve en Gmail al segundo de darle enviar.
      // La copia de Enviados la siembra la edge en el mismo envío, así que
      // acá ya está en la base — solo falta volver a preguntar.
      qc.invalidateQueries({ queryKey: ["mail-hilo"] });
    },
  });
}

// El parseo de direcciones vive en un módulo puro (sin Supabase encima) para
// poder testearlo; se re-exporta acá para que el resto lo siga importando
// desde `useMailbox` como siempre.
export { correoDe, direccionesDe, nombreDe } from "@/lib/mailAddr";

/** base64 → Blob → descarga del navegador. La DISPARA el usuario con su click
 *  sobre el adjunto de su propio correo; acá solo materializamos el archivo. */
function dispararDescarga(filename: string, contentType: string, base64: string): void {
  const url = URL.createObjectURL(base64ABlob(base64, contentType));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "adjunto";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revocar enseguida cancelaría la descarga en algunos navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface AdjuntoBajado {
  filename: string;
  contentType: string;
  contentBase64: string;
}

/** La consulta de UN adjunto, compartida por el visor y por la descarga: las
 *  dos piden lo mismo y solo cambia qué hacen con los bytes. Al ser la misma
 *  llave, ver una hoja de vida y después descargarla NO abre dos sesiones IMAP.
 *
 *  `staleTime: Infinity` porque el adjunto de un correo ya recibido no cambia
 *  nunca: revalidarlo solo costaría otra conexión al proveedor. */
function adjuntoQuery(folder: string, uid: number, index: number) {
  return {
    queryKey: ["mail-attachment", folder, uid, index] as const,
    queryFn: () =>
      callMail<AdjuntoBajado>({
        action: "download_attachment",
        folder,
        uid,
        attachment_index: index,
      }),
    staleTime: Infinity,
  };
}

/** Trae los bytes de un adjunto SIN guardarlo, para mostrarlo dentro de Maven.
 *  El binario NO está en la caché de Postgres (solo su metadata): la edge lo
 *  re-baja del proveedor por IMAP y por UID. */
export function useAttachmentBytes(args: {
  folder: string;
  uid: number | null;
  index: number | null;
  enabled: boolean;
}) {
  const habilitada = args.enabled && args.uid != null && args.index != null;
  return useQuery({
    ...adjuntoQuery(args.folder, args.uid ?? -1, args.index ?? -1),
    enabled: habilitada,
    ...SESION_IMAP,
  });
}

/** Los adjuntos de un correo, todos, listos para volver a mandarlos.
 *
 *  Reenviar SIN los adjuntos no es reenviar: casi siempre el archivo ES el
 *  correo (una hoja de vida, un contrato). Por eso esto existe.
 *
 *  Van por `fetchQuery` con la MISMA llave que usa el visor: lo que ya se miró
 *  no se vuelve a bajar. Y `conTurno` adentro de `callMail` los pone en fila,
 *  así que trece adjuntos no abren trece sesiones IMAP a la vez.
 *
 *  ⚠️ El tope se comprueba con la metadata ANTES de bajar nada. Bajar 40 MB a
 *  memoria para después decir que no entran es castigar al navegador por un
 *  límite que ya se conocía. */
export function useAdjuntosParaReenviar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      { folder, uid, adjuntos }: {
        folder: string;
        uid: number;
        adjuntos: { filename: string; contentType: string; sizeBytes: number }[];
      },
    ) => {
      const bajados = [];
      for (const [i, meta] of adjuntos.entries()) {
        const a = await qc.fetchQuery(adjuntoQuery(folder, uid, i));
        bajados.push({
          filename: a.filename || meta.filename,
          contentType: a.contentType || meta.contentType,
          sizeBytes: meta.sizeBytes,
          contentBase64: a.contentBase64,
        });
      }
      return bajados;
    },
  });
}

/** Resuelve las imágenes PEGADAS en el cuerpo del correo.
 *
 *  El HTML las referencia con `src="cid:…"` y ningún navegador sabe pedir un
 *  `cid:` (ver `lib/mailCid.ts`): sin esto, la imagen que mandaste perfecta se
 *  ve como un ícono roto al releerla. Acá se bajan esas partes y se cambia el
 *  `src` por los bytes, en `data:`.
 *
 *  Baja SOLO las partes que el HTML nombra: un correo con una imagen pegada y
 *  un PDF de 40 MB adjunto no tiene por qué bajar el PDF para verse.
 *
 *  Va por `fetchQuery` con la MISMA llave del visor y de la descarga, así que
 *  mirar la imagen en grande después no la vuelve a bajar, y `conTurno` dentro
 *  de `callMail` las pone en fila en vez de abrir una sesión IMAP por imagen.
 *
 *  Mientras carga devuelve el HTML tal cual: el correo se lee igual y las
 *  imágenes aparecen cuando llegan. */
export function useImagenesIncrustadas(args: {
  folder: string;
  uid: number | null;
  html: string | null;
  attachments: MailAttachment[] | undefined;
}): string | null {
  const qc = useQueryClient();
  const pedidos = useMemo(
    () => adjuntosIncrustados(args.html, args.attachments),
    [args.html, args.attachments],
  );
  const llave = pedidos.map((p) => `${p.index}:${p.cid}`).join("|");

  const { data } = useQuery({
    queryKey: ["mail-inline", args.folder, args.uid, llave] as const,
    enabled: args.uid != null && pedidos.length > 0,
    staleTime: Infinity,
    ...SESION_IMAP,
    queryFn: async () => {
      const mapa = new Map<string, { contentType: string; contentBase64: string }>();
      for (const p of pedidos) {
        try {
          const a = await qc.fetchQuery(adjuntoQuery(args.folder, args.uid!, p.index));
          mapa.set(p.cid, { contentType: a.contentType, contentBase64: a.contentBase64 });
        } catch {
          // Una imagen que no se pudo bajar queda rota, como estaba. No es
          // motivo para dejar sin cuerpo al correo entero.
        }
      }
      return mapa;
    },
  });

  return useMemo(
    () => (args.html && data?.size ? incrustarCids(args.html, data) : args.html),
    [args.html, data],
  );
}

/** Deja listo el adjunto SIGUIENTE mientras se lee el actual. Con 30 hojas de
 *  vida en un correo, es la diferencia entre que «Siguiente» sea instantáneo o
 *  que cada clic espere una ida y vuelta a IMAP. */
export function usePrefetchAttachment() {
  const qc = useQueryClient();
  return (folder: string, uid: number, index: number) => {
    void qc.prefetchQuery(adjuntoQuery(folder, uid, index));
  };
}

/** Descarga un adjunto entrante. Reusa lo que el visor ya haya bajado.
 *  `index` es la posición del adjunto en `MailMessage.attachments`. */
export function useDownloadAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      folder: string;
      uid: number;
      index: number;
      filename: string;
    }) => {
      const r = await qc.fetchQuery(adjuntoQuery(args.folder, args.uid, args.index));
      dispararDescarga(r.filename || args.filename, r.contentType, r.contentBase64);
    },
  });
}

export interface MailSignature {
  /** HTML de la firma (lo produce el mismo editor del compositor). */
  html: string;
  /** Si false, la firma existe pero no se agrega sola. */
  enabled: boolean;
}

/** Firma del usuario: una fila por persona (RLS self). Si no configuró
 *  ninguna, devuelve una vacía habilitada (que no inserta nada). */
export function useMailSignature() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["mail-signature", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<MailSignature> => {
      // RLS filtra a la fila propia; no hace falta el .eq(user_id).
      const { data, error } = await supabase
        .from("mail_signatures")
        .select("html, enabled")
        .maybeSingle();
      if (error) throw error;
      return {
        html: (data?.html as string) ?? "",
        enabled: (data?.enabled as boolean) ?? true,
      };
    },
  });
}

/** Guarda (upsert) la firma del usuario. */
export function useSaveMailSignature() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (sig: MailSignature) => {
      if (!user) throw new Error("sin sesión");
      const { error } = await supabase
        .from("mail_signatures")
        .upsert(
          { user_id: user.id, html: sig.html, enabled: sig.enabled },
          { onConflict: "user_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mail-signature", user?.id] });
    },
  });
}

/** Búsqueda en el servidor (IMAP SEARCH) dentro de una carpeta: encuentra en
 *  TODO el histórico, no solo en los ~50 que tiene la caché. Pasa por la edge
 *  y abre una sesión IMAP, así que respeta el semáforo y no reintenta. */
export function useMailSearch(folder: string, query: string, enabled: boolean) {
  const q = query.trim();
  return useQuery({
    queryKey: ["mail-search", folder, q],
    enabled: enabled && q.length > 0,
    ...SESION_IMAP,
    queryFn: async (): Promise<{ messages: MailSummary[]; total: number }> => {
      const r = await callMail<{
        total?: number;
        messages?: Array<{
          uid?: number | string | null;
          seq?: number;
          from?: string;
          to?: string;
          subject?: string;
          date?: string;
          messageId?: string;
          unread?: boolean;
        }>;
      }>({ action: "imap_search", folder, query: q });
      return {
        total: r.total ?? 0,
        messages: (r.messages ?? []).map((m) => ({
          uid: m.uid ?? null,
          seq: m.seq,
          from: m.from ?? "",
          to: m.to ?? "",
          subject: m.subject ?? "(sin asunto)",
          date: m.date ?? "",
          messageId: m.messageId ?? undefined,
          // La búsqueda no agrupa (ver CorreoPage): quien busca quiere ver los
          // mensajes que coinciden, no las conversaciones que los contienen.
          inReplyTo: undefined,
          refs: undefined,
          unread: !!m.unread,
          origen: "vivo" as const,
        })),
      };
    },
  });
}

/** Guarda el borrador EN EL SERVIDOR (carpeta Borrador, vía IMAP APPEND), para
 *  verlo desde otro dispositivo. Devuelve el UID nuevo. Si se pasa `uid`, ese
 *  borrador viejo se reemplaza. Es aparte del autoguardado local, que sigue. */
export function useSaveServerDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      d: {
        to: string[];
        cc?: string[];
        subject: string;
        html?: string;
        text?: string;
        in_reply_to?: string;
        references?: string;
        /** UID del borrador anterior a reemplazar. */
        uid?: number;
        folder?: string;
      },
    ) => callMail<{ ok: true; uid: number | null }>({ action: "save_draft", ...d }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mail-messages", "Borrador"] });
      qc.invalidateQueries({ queryKey: ["mail-folders"] });
    },
  });
}

/** Borra un borrador del servidor por UID (al enviarlo o al reemplazarlo). */
export function useDeleteServerDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { uid: number; folder?: string }) =>
      callMail<{ ok: boolean }>({ action: "delete_draft", ...args }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mail-messages", "Borrador"] });
      qc.invalidateQueries({ queryKey: ["mail-folders"] });
    },
  });
}
