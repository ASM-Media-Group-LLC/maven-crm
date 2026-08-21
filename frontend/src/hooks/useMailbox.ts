import { useCallback } from "react";
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

/** Semáforo: MÁXIMO 2 llamadas de correo simultáneas por pestaña.
 *
 *  Cada llamada abre una conexión IMAP/SMTP nueva contra el proveedor, y
 *  el proveedor RACIONA las conexiones concurrentes de una cuenta. Medido
 *  en producción (21/08): 2-3 a la vez responden en ~1,5 s; una ráfaga de
 *  6 se queda colgada >45 s y termina en 504. La interfaz dispara llamadas
 *  desde varios lados a la vez (carpetas, lista, hover, marcar leído):
 *  sin este tope, pasear el mouse por la bandeja tumbaba la cuenta. */
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

/** Reglas comunes de las consultas que abren una sesión IMAP.
 *
 *  - `retry: false`: cuando el proveedor está estrangulando la cuenta
 *    (pasa tras ráfagas de logins), cada reintento automático es más
 *    presión sobre lo que ya está castigado — y el castigo se alarga.
 *    Para reintentar está el botón de actualizar.
 *  - `refetchOnWindowFocus: false`: el default de react-query refetchea
 *    al volver a la pestaña. Para una API HTTP es gratis; acá cada
 *    refetch es una CONEXIÓN nueva contra el proveedor. Cambiar de
 *    pestaña y volver no puede costar sesiones IMAP. */
const SESION_IMAP = {
  retry: false,
  refetchOnWindowFocus: false,
} as const;

export function useMailFolders(enabled: boolean) {
  return useQuery({
    queryKey: ["mail-folders"],
    enabled,
    ...SESION_IMAP,
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
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["mail-messages", folder],
    enabled: enabled && !!folder,
    ...SESION_IMAP,
    // Un minuto de frescura: volver a una carpeta recién vista no abre
    // otra sesión. El botón de actualizar la fuerza cuando haga falta.
    staleTime: 60 * 1000,
    queryFn: async () => {
      const r = await callMail<{
        folder: string;
        total: number;
        messages: MailSummary[];
        bodies?: MailMessage[];
      }>({
        action: "imap_messages",
        folder,
        limit: 50,
        // Los cuerpos de los 2 más nuevos vienen EN la misma sesión IMAP:
        // el proveedor raciona conexiones, no datos. Antes esto eran dos
        // conexiones extra (precarga), y era parte de lo que lo colgaba.
        with_bodies: 2,
      });
      // Se siembran en la caché de mensaje: abrirlos es instantáneo.
      for (const b of r.bodies ?? []) {
        qc.setQueryData(["mail-message", folder, b.seq], b);
      }
      return r;
    },
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
    ...SESION_IMAP,
    ...MENSAJE_CACHE,
    queryFn: () => fetchMensaje(folder, seq as number),
  });
}

/** Pre-carga un mensaje a la misma clave que usa `useMailMessage`: si la
 *  persona después lo abre, ya está — el clic se siente instantáneo. */
export function usePrefetchMailMessage() {
  const qc = useQueryClient();
  // useCallback: esta función va en las dependencias de un useEffect del
  // llamador; si se recreara en cada render, el efecto dispararía siempre.
  return useCallback(
    (folder: string, seq: number) => {
      void qc.prefetchQuery({
        queryKey: ["mail-message", folder, seq],
        ...MENSAJE_CACHE,
        queryFn: () => fetchMensaje(folder, seq),
      });
    },
    [qc],
  );
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
