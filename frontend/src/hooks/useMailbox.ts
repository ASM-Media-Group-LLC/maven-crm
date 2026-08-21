import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { describeFunctionError } from "@/hooks/useMailConnection";

/**
 * Buzón del usuario: carpetas, mensajes, lectura y envío.
 *
 * Todo pasa por la edge function `mail-fetch`, que abre IMAP/SMTP con la
 * credencial cifrada del usuario. El navegador nunca ve esa credencial ni
 * habla con Zoho: solo conoce a Maven.
 *
 * Distinto de `useMailConnection`, que maneja el OAuth por usuario. Ese
 * camino quedó como plan B: obliga a pasar por una pantalla de
 * consentimiento con el logo de Zoho, y el principio del módulo es que el
 * empleado no se entere de que Zoho existe.
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
  seq: number;
  uid: string | null;
  flags: string[];
  from: string;
  to: string;
  subject: string;
  date: string;
  messageId: string;
  unread: boolean;
}

export interface MailAttachment {
  filename: string;
  contentType: string;
  sizeBytes: number;
  contentId: string | null;
}

export interface MailMessage {
  folder: string;
  seq: number;
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
  dropped: string[];
  attachments: MailAttachment[];
  /** El cuerpo se corta a 512 KB para que la función no muera por timeout. */
  truncated: boolean;
}

/** Llama a `mail-fetch` y devuelve el cuerpo ya tipado. */
async function callMail<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("mail-fetch", { body });
  // supabase-js deja "non-2xx status code" y esconde el motivo real en la
  // Response de `error.context`. Sin desenvolverlo el diagnóstico es a ciegas.
  if (error) throw new Error(await describeFunctionError(error));
  const payload = data as T & { error?: string };
  if (payload?.error) throw new Error(payload.error);
  return payload as T;
}

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

/** Nombres de carpeta que Zoho devuelve traducidos, y su orden natural.
 *  Sin esto la bandeja arranca con "Archive" y "Borrador" antes que INBOX. */
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

export function useMailFolders(enabled: boolean) {
  return useQuery({
    queryKey: ["mail-folders"],
    enabled,
    // Las carpetas casi no cambian; no tiene sentido abrir IMAP en cada render.
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const r = await callMail<{ folders: string[]; inbox_unseen?: number }>({
        action: "imap_folders",
      });
      return ordenarCarpetas(r.folders ?? []);
    },
  });
}

export function useMailMessages(folder: string, enabled: boolean) {
  return useQuery({
    queryKey: ["mail-messages", folder],
    enabled: enabled && !!folder,
    queryFn: () =>
      callMail<{ folder: string; total: number; messages: MailSummary[] }>({
        action: "imap_messages",
        folder,
        limit: 50,
      }),
  });
}

/** Cada apertura de mensaje es una sesión IMAP completa contra el
 *  proveedor (TLS + login + select + fetch ≈ 2-4 s). Estos parámetros son
 *  la mitigación: un mensaje ya bajado no cambia, así que se cachea largo
 *  y volver a él es instantáneo. */
const MENSAJE_CACHE = {
  staleTime: 30 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
} as const;

/** OJO: `mark_read: false` acá a propósito. Este mismo fetch se usa para
 *  PRE-CARGAR (hover, los más nuevos al entrar), y precargar no puede
 *  marcar leído: "leído" lo decide quien lo abre, vía `useMarkSeen`. */
function fetchMensaje(folder: string, seq: number) {
  return callMail<MailMessage>({
    action: "imap_message",
    folder,
    seq,
    mark_read: false,
  });
}

export function useMailMessage(folder: string, seq: number | null) {
  return useQuery({
    queryKey: ["mail-message", folder, seq],
    enabled: !!folder && seq != null,
    ...MENSAJE_CACHE,
    queryFn: () => fetchMensaje(folder, seq as number),
  });
}

/** Pre-carga un mensaje a la misma clave que usa `useMailMessage`: si la
 *  persona después lo abre, ya está — el clic se siente instantáneo. */
export function usePrefetchMailMessage() {
  const qc = useQueryClient();
  return (folder: string, seq: number) => {
    void qc.prefetchQuery({
      queryKey: ["mail-message", folder, seq],
      ...MENSAJE_CACHE,
      queryFn: () => fetchMensaje(folder, seq),
    });
  };
}

/** Marca leído en el servidor y apaga el punto azul al instante en la
 *  lista cacheada — sin esperar el round-trip ni refetchear la carpeta. */
export function useMarkSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ folder, seq }: { folder: string; seq: number }) =>
      callMail<{ ok: true }>({ action: "mark_seen", folder, seq }),
    onMutate: ({ folder, seq }) => {
      qc.setQueryData(
        ["mail-messages", folder],
        (prev: { messages?: MailSummary[] } | undefined) =>
          prev?.messages
            ? {
                ...prev,
                messages: prev.messages.map((m) =>
                  m.seq === seq ? { ...m, unread: false } : m,
                ),
              }
            : prev,
      );
    },
    // Si el servidor falla, el punto vuelve solo en el próximo refetch de
    // la carpeta; no vale la pena un rollback para una bandera visual.
  });
}

export interface OutgoingMail {
  to: string[];
  cc?: string[];
  subject: string;
  html?: string;
  text?: string;
  in_reply_to?: string;
  references?: string;
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

/** Saca el nombre a mostrar de un `From:` tipo `Juan Pérez <j@x.com>`. */
export function nombreDe(direccion: string): string {
  const m = direccion.match(/^\s*"?([^"<]*?)"?\s*<[^>]+>\s*$/);
  const nombre = m?.[1]?.trim();
  if (nombre) return nombre;
  return direccion.replace(/[<>]/g, "").trim() || "(sin remitente)";
}

/** Saca la dirección de un `From:`, para responder. */
export function correoDe(direccion: string): string {
  const m = direccion.match(/<([^>]+)>/);
  return (m?.[1] ?? direccion).trim();
}
