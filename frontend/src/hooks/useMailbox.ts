import { useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { describeFunctionError } from "@/hooks/useMailConnection";

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

export function useMailMessages(folder: string, enabled: boolean) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["mail-messages", folder],
    enabled: enabled && !!folder,
    ...SESION_IMAP,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<{ messages: MailSummary[] }> => {
      // Caché primero.
      const { data, error } = await supabase
        .from("mail_messages")
        .select("id, uid, from_addr, to_addr, subject, date, snippet, unread, message_id")
        .eq("folder", folder)
        .order("date", { ascending: false })
        .limit(50);
      if (error) throw error;
      if (data && data.length > 0) {
        return {
          messages: data.map((m) => ({
            id: m.id as string,
            uid: m.uid as number,
            from: (m.from_addr as string) ?? "",
            to: (m.to_addr as string) ?? "",
            subject: (m.subject as string) ?? "(sin asunto)",
            date: (m.date as string) ?? "",
            snippet: (m.snippet as string) ?? "",
            messageId: (m.message_id as string) ?? undefined,
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
        messages: orden.map((m) => ({ ...m, origen: "vivo" as const })),
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
      qc.setQueryData(
        ["mail-messages", folder],
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
  attachments?: Array<{ filename: string; contentType: string; contentBase64: string }>;
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
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(
    new Blob([bytes], { type: contentType || "application/octet-stream" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "adjunto";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revocar enseguida cancelaría la descarga en algunos navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Descarga un adjunto entrante. El binario NO está en la caché de Postgres
 *  (solo su metadata): la edge lo re-baja del proveedor por IMAP y por UID.
 *  `index` es la posición del adjunto en `MailMessage.attachments`. */
export function useDownloadAttachment() {
  return useMutation({
    mutationFn: async (args: {
      folder: string;
      uid: number;
      index: number;
      filename: string;
    }) => {
      const r = await callMail<{
        filename: string;
        contentType: string;
        contentBase64: string;
      }>({
        action: "download_attachment",
        folder: args.folder,
        uid: args.uid,
        attachment_index: args.index,
      });
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
