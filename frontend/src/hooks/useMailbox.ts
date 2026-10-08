import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCanalQueRevive } from "@/hooks/useCanalQueRevive";
import { toast } from "sonner";
import { traducir } from "@/lib/i18n";
import { describeFunctionError } from "@/hooks/useMailConnection";
import { base64ABlob } from "@/lib/base64Blob";
import { adjuntosIncrustados, incrustarCids } from "@/lib/mailCid";
import {
  reponerEnLista, uidDe, type DestinoDelMovimiento, type FilaEnCache,
} from "@/lib/correo/deshacer";

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

/** Llama a `mail-fetch` y devuelve el cuerpo ya tipado. SIN turno: solo para
 *  acciones que no abren IMAP (traducir). */
async function invocarMailFetch<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("mail-fetch", { body });
  // supabase-js deja "non-2xx status code" y esconde el motivo real en la
  // Response de `error.context`. Sin desenvolverlo el diagnóstico es a ciegas.
  if (error) throw new Error(await describeFunctionError(error));
  const payload = data as T & { error?: string };
  if (payload?.error) throw new Error(payload.error);
  return payload as T;
}

/** Llama a `mail-fetch` haciendo fila en el semáforo (máx. 2 a la vez). */
function callMail<T>(body: Record<string, unknown>): Promise<T> {
  return conTurno(() => invocarMailFetch<T>(body));
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
export function useMailMessages(
  folder: string, enabled: boolean, pagina = 0,
  /** Solo los LEÍDOS: la sección «Todo lo demás» de «No leídos primero». Los
   *  no leídos vienen aparte, de toda la carpeta (`useMailNoLeidos`). */
  soloLeidos = false,
) {
  const qc = useQueryClient();
  return useQuery({
    // ⚠️ Sin el filtro la clave queda IGUAL que siempre; con él se le suma
    // "leidos" al final, así el prefijo ["mail-messages", folder] la sigue
    // alcanzando (lo usan las actualizaciones optimistas).
    queryKey: ["mail-messages", folder, pagina].concat(soloLeidos ? ["leidos"] : []),
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
      const traer = (cols: string) => {
        let q = supabase.from("mail_messages" as never)
          // El total viene en la MISMA consulta: es el «de 186» de Gmail.
          .select(cols, { count: "exact" })
          .eq("folder", folder);
        if (soloLeidos) q = q.eq("unread", false);
        return q
          .order("date", { ascending: false })
          // Desempate estable: con dos correos a la misma hora, sin esto uno
          // podía salir en la página 1 Y en la 2 (o en ninguna).
          .order("uid", { ascending: false })
          .range(desde, desde + CORREOS_POR_PAGINA - 1);
      };

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
      // Solo los leídos y no vino ninguno: puede ser que TODO esté sin leer
      // (un vacío de verdad) o que la caché todavía no tenga esta carpeta. Se
      // pregunta: en el segundo caso, el camino en vivo de siempre.
      if (soloLeidos && !(data && data.length > 0) && pagina === 0) {
        const { count: enLaCarpeta } = await supabase.from("mail_messages" as never)
          .select("id", { count: "exact", head: true })
          .eq("folder", folder);
        if ((enLaCarpeta ?? 0) > 0) return { total: 0, messages: [] };
      }
      if ((data && data.length > 0) || pagina > 0) {
        return {
          total: count ?? undefined,
          messages: ((data ?? []) as unknown as Record<string, unknown>[]).map(resumenDeCache),
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

/** Una fila de `mail_messages` como resumen de la lista. */
function resumenDeCache(m: Record<string, unknown>): MailSummary {
  return {
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
  };
}

/** Cuántos no leídos trae la sección de arriba, como mucho. */
export const TOPE_NO_LEIDOS = 200;

/** TODOS los no leídos de la carpeta (hasta el tope), no los de una página: la
 *  sección «No leídos» de «No leídos primero».
 *
 *  ⚠️ La clave empieza con ["mail-messages", folder] a propósito: así le llegan
 *  solas las actualizaciones optimistas de leer, archivar o mover (que tocan
 *  ese prefijo) y las invalidaciones del Realtime. */
export function useMailNoLeidos(folder: string, enabled: boolean) {
  return useQuery({
    queryKey: ["mail-messages", folder, "no-leidos"],
    enabled: enabled && !!folder,
    ...SESION_IMAP,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<{ messages: MailSummary[]; total?: number }> => {
      const COLUMNAS_BASE =
        "id, uid, from_addr, to_addr, cc_addr, subject, date, snippet, unread, message_id";
      const traer = (cols: string) =>
        supabase.from("mail_messages" as never)
          .select(cols, { count: "exact" })
          .eq("folder", folder)
          .eq("unread", true)
          .order("date", { ascending: false })
          .order("uid", { ascending: false })
          .limit(TOPE_NO_LEIDOS);
      // Mismo respaldo que la lista: sin las columnas del hilo, igual se ve.
      let { data, error, count } = await traer(`${COLUMNAS_BASE}, in_reply_to, refs`);
      if (error && /in_reply_to|refs/.test(error.message ?? "")) {
        ({ data, error, count } = await traer(COLUMNAS_BASE));
      }
      if (error) throw error;
      return {
        total: count ?? undefined,
        messages: ((data ?? []) as unknown as Record<string, unknown>[]).map(resumenDeCache),
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
    attachments: (data.attachments as unknown as MailAttachment[]) ?? [],
    truncated: !!data.truncated,
  };
}

function fetchMensajeVivo(folder: string, seq: number): Promise<MailMessage> {
  return callMail<MailMessage>({ action: "imap_message", folder, seq, mark_read: false });
}

/** La consulta del cuerpo de UN mensaje: la comparten el lector, la precarga
 *  y las acciones del ⋮ de cada mensaje. La misma llave = no se baja dos veces. */
function mensajeQuery(folder: string, m: MailSummary) {
  return {
    queryKey: ["mail-message", folder, claveDe(m)],
    ...MENSAJE_CACHE,
    queryFn: () =>
      m.origen === "cache"
        ? fetchMensajeCache(m.id!)
        : fetchMensajeVivo(folder, m.seq!),
  };
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
      void qc.prefetchQuery(mensajeQuery(folder, m));
    },
    [qc],
  );
}

/** Trae el cuerpo de un mensaje que NO es el abierto: responder o reenviar
 *  desde el ⋮ de otro mensaje de la conversación necesita su texto para la
 *  cita. Si ya se miró (o se precargó), no vuelve a pedirlo. */
export function useTraerMensaje() {
  const qc = useQueryClient();
  return useCallback(
    (folder: string, m: MailSummary): Promise<MailMessage> => qc.fetchQuery(mensajeQuery(folder, m)),
    [qc],
  );
}

/** Busca MI copia de un correo por su Message-ID: es lo que abre el enlace
 *  que llega por el chat (`/correo?mensaje=…`). Si está en varias carpetas,
 *  se prefiere Recibidos y después cualquiera que no sea Papelera ni Spam. */
export async function buscarCorreoPorMessageId(messageId: string): Promise<MailSummary | null> {
  const { data, error } = await supabase.from("mail_messages" as never)
    .select("id, uid, folder, from_addr, to_addr, cc_addr, subject, date, snippet, unread, message_id, in_reply_to, refs")
    .eq("message_id", messageId)
    .limit(10);
  if (error) throw error;
  const filas = (data ?? []) as unknown as Record<string, unknown>[];
  const peso = (f: string) => (f === "INBOX" ? 0 : f === "Papelera" || f === "Correo no deseado" ? 2 : 1);
  const elegida = [...filas].sort((a, b) => peso(a.folder as string) - peso(b.folder as string))[0];
  return elegida ? { ...resumenDeCache(elegida), folder: elegida.folder as string } : null;
}

/** Traduce el cuerpo de un correo al idioma de la pantalla (Keila, 02/10).
 *
 *  Lo hace la edge con la IA (OpenRouter): de la caché lee el cuerpo ELLA, por
 *  el id de la fila y solo si es de quien pide. Un correo del camino en vivo no
 *  tiene fila, así que su texto viaja desde acá, recortado.
 *
 *  Una sola vez por correo e idioma (`staleTime: Infinity`): ir y volver entre
 *  la traducción y el original no vuelve a pagar la IA. */
export function useTraduccionCorreo(args: {
  correo: MailSummary;
  /** El cuerpo ya cargado, para los que no tienen fila en la caché. */
  mensaje: Pick<MailMessage, "text" | "html"> | undefined;
  idioma: "es" | "en";
  habilitada: boolean;
}) {
  const { correo, mensaje, idioma, habilitada } = args;
  return useQuery({
    queryKey: ["mail-traduccion", claveDe(correo), idioma],
    enabled: habilitada,
    ...SESION_IMAP,
    staleTime: Infinity,
    // ⚠️ Sin el semáforo: traducir no abre IMAP, y la IA puede tardar decenas
    // de segundos. Con turno, una traducción lenta dejaba en fila a la lista y
    // a los adjuntos (el semáforo es de 2).
    queryFn: () =>
      invocarMailFetch<{ traduccion: string; recortado: boolean; idioma: string }>({
        action: "translate",
        idioma,
        ...(correo.origen === "cache" && correo.id
          ? { id: correo.id }
          : {
              text: (mensaje?.text ?? "").slice(0, 20_000),
              html: mensaje?.text ? undefined : (mensaje?.html ?? "").slice(0, 100_000),
            }),
      }),
  });
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
        // ⚠️ LAS OTRAS COPIAS DEL MISMO CORREO en tu buzón (Keila, 08/10): la
        // que enviaste y la que recibiste, archivadas juntas, son dos filas con
        // el mismo Message-ID. Leías una y la otra dejaba la etiqueta marcando
        // «sin leer» para siempre. Se marcan todas, acá y en el proveedor.
        if (m.messageId) {
          const { data: otras } = await supabase
            .from("mail_messages")
            .select("id, folder, uid")
            .eq("message_id", m.messageId)
            .eq("unread", true)
            .neq("id", m.id);
          const filas = (otras ?? []) as { id: string; folder: string; uid: number | null }[];
          if (filas.length) {
            await supabase.from("mail_messages").update({ unread: false }).in("id", filas.map((o) => o.id));
            for (const o of filas) {
              if (o.uid) void callMail({ action: "mark_seen", folder: o.folder, uid: Number(o.uid) }).catch(() => {});
            }
          }
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
    // Y el número de las ETIQUETAS: antes esperaba un minuto (su staleTime) o
    // al sincronizador. Ya con la fila escrita, se vuelve a contar.
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["mail-labels-unread"] });
    },
  });
}

export type OperacionMasiva =
  | "seen" | "unseen" | "delete" | "archive" | "spam" | "move" | "snooze";

/** Lo que contesta la edge a una acción masiva. */
export interface RespuestaMasiva {
  ok: true;
  afectados: number;
  /** Los que no se mandaron por no tener uid. */
  omitidos: number;
  /** Solo si se MOVIERON: adónde fue a parar cada uno. Lo usa «Deshacer». Una
   *  edge anterior no lo manda. */
  destino?: DestinoDelMovimiento;
}

/** La clave de las acciones masivas: para saber si hay alguna en vuelo. */
export const CLAVE_MASIVA = ["mail-bulk"] as const;

/** Acciones sobre VARIOS correos de una carpeta (la barra de selección).
 *  Optimista: la lista cambia al instante y se reconcilia con la respuesta.
 *  Solo aplica a mensajes con UID (los de la caché); los del camino en vivo
 *  no tienen un identificador estable.
 *
 *  ⚠️ VARIAS A LA VEZ. Zoho tarda en contestar (medido el 02/10 con los
 *  borradores de Keila: 5,2 s, 6,6 s y 6,2 s por eliminar, contra ~1,2 s de un
 *  archivar normal), y la barra quedaba deshabilitada todo ese rato: eliminar
 *  el siguiente borrador era esperar al anterior. Ahora la barra no espera, y
 *  para que una acción no le devuelva a la pantalla los correos que otra ya
 *  sacó: (1) se cancela la lectura en vuelo de esa carpeta antes de sacarlos,
 *  (2) mientras quede alguna en vuelo no se relee la lista (ni acá ni desde
 *  Realtime) y (3) relee la ÚLTIMA en terminar — o cualquiera que falle, para
 *  que lo suyo vuelva a la lista junto con el aviso del error. */
export function useMailBulk() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: CLAVE_MASIVA,
    mutationFn: async (
      { folder, op, items, dest, volverAt, cancelarPosponer }:
      {
        folder: string; op: OperacionMasiva; items: MailSummary[];
        dest?: string;
        /** Para `snooze`: cuándo tiene que reaparecer, en ISO. */
        volverAt?: string;
        /** «Deshacer» de Posponer (move desde Snoozed): borra también su
         *  despertador. Una edge anterior lo ignora. */
        cancelarPosponer?: boolean;
      },
    ): Promise<RespuestaMasiva> => {
      const uids = items.map(uidDe).filter((u): u is number => u != null);
      if (!uids.length) throw new Error("Estos correos no tienen identificador; abre la carpeta de nuevo e inténtalo.");
      const r = await callMail<{ ok: true; afectados: number; destino?: DestinoDelMovimiento }>({
        action: "bulk", folder, op, uids, dest, volver_at: volverAt,
        ...(cancelarPosponer ? { cancelar_posponer: true } : {}),
      });
      return { ...r, omitidos: items.length - uids.length };
    },
    onMutate: async ({ folder, op, items }) => {
      const claves = new Set(items.map(claveDe));
      // Una lectura de esta carpeta que salió ANTES de la acción traería los
      // correos de vuelta al llegar.
      await qc.cancelQueries({ queryKey: ["mail-messages", folder] });
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
    onSettled: (_r, error) => {
      // En `onSettled` esta acción todavía cuenta como en vuelo: 1 = soy la
      // última. Si quedan otras, relee la que termine después (salvo error).
      if (!error && qc.isMutating({ mutationKey: CLAVE_MASIVA }) > 1) return;
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
      // Y la conversación abierta: eliminar o mover UN mensaje desde su ⋮ lo
      // tiene que sacar del hilo que se está leyendo, no dentro de 30 s.
      qc.invalidateQueries({ queryKey: ["mail-hilo"] });
    },
  });
}

/** Una foto de las listas de unas carpetas (todas sus páginas y la sección
 *  «No leídos»), tomada ANTES de una acción. */
export type FotoDeListas = Array<[readonly unknown[], { messages?: MailSummary[] } | undefined]>;

/** Para «Deshacer»: la lista vuelve a mostrar lo que la acción sacó, AL
 *  INSTANTE y en el mismo lugar, sin esperar al servidor. Después el servidor
 *  confirma (o no) y la lista se vuelve a leer como siempre. */
export function useListasDelCorreo() {
  const qc = useQueryClient();
  return useMemo(() => ({
    /** ⚠️ Antes de lanzar la acción: su `onMutate` saca los correos al momento. */
    foto: (carpetas: string[]): FotoDeListas =>
      [...new Set(carpetas)].flatMap((f) =>
        qc.getQueriesData<{ messages?: MailSummary[] }>({ queryKey: ["mail-messages", f] })),
    reponer: (foto: FotoDeListas, claves: Set<string>) => {
      for (const [queryKey, antes] of foto) {
        if (!antes?.messages) continue;
        qc.setQueryData(queryKey, (ahora: { messages?: MailSummary[] } | undefined) =>
          ahora?.messages
            ? { ...ahora, messages: reponerEnLista(ahora.messages, antes.messages!, claves, claveDe) }
            : ahora);
      }
    },
  }), [qc]);
}

/** El respaldo de «Deshacer» cuando la edge no dijo el uid nuevo: dónde está
 *  HOY cada fila de la caché. La edge traslada la MISMA fila (mismo `id`) a la
 *  carpeta nueva con el uid de allá, así que se busca por `id`. */
export async function filasDeLaCache(ids: string[]): Promise<FilaEnCache[]> {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (!unicos.length) return [];
  const { data, error } = await supabase.from("mail_messages" as never)
    .select("id, folder, uid")
    .in("id", unicos);
  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((f) => ({
    id: f.id as string, folder: f.folder as string, uid: Number(f.uid),
  }));
}

/** Cuánto se espera después de un aviso de Realtime antes de releer: una
 *  tanda de correos llega como una ráfaga de INSERT, y la etiqueta heredada
 *  (mail-sync, heredarDelHilo) se escribe un momento DESPUÉS de la fila. */
export const ESPERA_REALTIME_MS = 1_000;

/** Lo que se relee cuando el sincronizador escribe: la lista de cada carpeta,
 *  sus contadores, el número del menú, las vistas por etiqueta (cruzan
 *  carpetas) y la conversación abierta. Todo sale de Postgres: nada de esto
 *  abre una sesión IMAP (la búsqueda sí, y por eso no está). */
export const CLAVES_QUE_ESCRIBE_EL_SINCRONIZADOR = [
  ["mail-messages"],
  ["mail-folders"],
  ["sidebar-badges"],
  ["mail-por-etiqueta"],
  ["mail-labels-unread"],
  ["mail-message-labels"],
  ["mail-hilo"],
] as const;

/** La bandeja se actualiza SOLA: el sincronizador inserta en mail_messages
 *  y Realtime lo empuja hasta acá — el mismo mecanismo de los ✓✓ del chat.
 *  RLS aplica también en Realtime: cada quien recibe solo sus filas.
 *
 *  ⚠️ «LLEGA EL AVISO PERO EL CORREO NO APARECE» (Keila, 02/10). La lista se
 *  entera de lo nuevo SOLO por este canal (sus consultas no se releen al
 *  volver a la pestaña ni cada tanto: pueden abrir IMAP), mientras que el
 *  número del Correo en el menú se relee solo cada 60 s. El canal se
 *  suscribía a ciegas, y en realtime-js un canal que queda CLOSED (el socket
 *  se cae: la computadora se suspende, se va la red un momento) no vuelve
 *  nunca: el número seguía subiendo y la lista quedaba congelada hasta
 *  recargar o cambiar de carpeta. Ahora pasa por useCanalQueRevive (el mismo
 *  de Messenger) y, al revivir —también al volver de un rato en segundo
 *  plano—, relee lo que se perdió mientras estuvo muerto. */
export function useMailRealtime(enabled: boolean) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const uid = user?.id ?? null;
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const releer = useCallback(() => {
    // Con una acción masiva en vuelo no se relee: la lista traería del
    // servidor los correos que la acción ya sacó de la pantalla y todavía no
    // terminó de mover. La acción relee todo al terminar.
    if (qc.isMutating({ mutationKey: CLAVE_MASIVA }) > 0) return;
    for (const queryKey of CLAVES_QUE_ESCRIBE_EL_SINCRONIZADOR) {
      void qc.invalidateQueries({ queryKey: [...queryKey] });
    }
  }, [qc]);

  const releerEnUnMomento = useCallback(() => {
    if (temporizador.current) return;
    temporizador.current = setTimeout(() => {
      temporizador.current = null;
      releer();
    }, ESPERA_REALTIME_MS);
  }, [releer]);

  useEffect(() => () => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = null;
  }, []);

  useCanalQueRevive({
    topic: enabled && uid ? `mail-${uid}` : null,
    armar: (canal) =>
      canal.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "mail_messages",
          filter: `user_id=eq.${uid}`,
        },
        releerEnUnMomento,
      ),
    // Lo que llegó mientras el canal estuvo muerto no avisó: se relee ya.
    alRevivir: releer,
  });
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
        /** Los archivos y las imágenes pegadas (con `contentId`). Sin esto el
         *  borrador se guardaba pelado y retomarlo los perdía (Keila, 08/10). */
        attachments?: Array<{
          filename: string; contentType: string; contentBase64: string; contentId?: string;
        }>;
      },
    ) => callMail<{ ok: true; uid: number | null }>({ action: "save_draft", ...d }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mail-messages", "Borrador"] });
      qc.invalidateQueries({ queryKey: ["mail-folders"] });
    },
  });
}

/** Borra un borrador del servidor por UID (al enviarlo o al reemplazarlo).
 *
 *  Optimista: sale de la lista de Borradores AL INSTANTE. Antes se esperaba a
 *  Zoho (segundos) y, peor, la edge no lo sacaba de la caché: el borrador ya
 *  enviado seguía en Borradores hasta el barrido de esa carpeta (30 min). Si el
 *  servidor falla (o contesta que no pudo), la lista se vuelve a leer, el
 *  borrador reaparece y se avisa.
 *
 *  ⚠️ El aviso va ACÁ y no en el `mutate` de quien llama: el compositor se
 *  cierra apenas sale el correo, y react-query no corre los callbacks del
 *  `mutate` de un componente que ya se desmontó. */
export function useDeleteServerDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { uid: number; folder?: string }) => {
      const r = await callMail<{ ok: boolean }>({ action: "delete_draft", ...args });
      if (!r?.ok) throw new Error(traducir("mail.draft.deleteFailed"));
      return r;
    },
    onError: (e) => {
      toast.error(traducir("mail.comp.draftNotRemoved", { error: (e as Error).message }));
    },
    onMutate: async ({ uid, folder }) => {
      const carpeta = folder ?? "Borrador";
      await qc.cancelQueries({ queryKey: ["mail-messages", carpeta] });
      qc.setQueriesData(
        { queryKey: ["mail-messages", carpeta] },
        (prev: { messages?: MailSummary[] } | undefined) =>
          prev?.messages ? { ...prev, messages: prev.messages.filter((x) => uidDe(x) !== uid) } : prev,
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["mail-messages", "Borrador"] });
      qc.invalidateQueries({ queryKey: ["mail-folders"] });
    },
  });
}
