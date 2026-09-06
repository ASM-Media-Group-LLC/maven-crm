// Lógica PURA del push de avisos (mensajes del Messenger, llamados de Cowork,
// asignaciones de bandeja): qué texto se manda y a quién NO se le manda. Sin
// Deno ni red, para poder probarla con
//   deno test supabase/functions/_shared/push-notify.test.ts
// La orquestación (leer tablas, mandar por web-push) vive en ../web-push/index.ts.
//
// Paridad DELIBERADA con el cliente (frontend/src/hooks/useMessengerNotifications.ts):
//   previewOf → previewDeMensaje · mentionsMe → meMenciona · isDndActiveNow → dndActivo
// Si cambia uno, cambia el otro: el servidor decide el push y el cliente decide
// el sonido con las mismas reglas, y si divergen alguien recibe un aviso que la
// app no le habría dado (o al revés).

export type ModoNotificacion = "all" | "mentions" | "none";
export type Prioridad = "low" | "normal" | "critical";
/** Motivos por los que un destinatario se descarta; salen en la respuesta de la
 *  edge y en net._http_response para diagnosticar "no me llegó". */
export type MotivoDescarte = "disabled" | "no_sub" | "muted" | "mode" | "dnd" | "read";

export interface AjustesUsuario {
  push_enabled: boolean;
  notifications_enabled: boolean;
  dnd_enabled: boolean;
  dnd_start_time: string | null; // "HH:MM" o "HH:MM:SS" (PostgREST devuelve `time` con segundos)
  dnd_end_time: string | null;
  dnd_allow_critical: boolean;
}

export interface Participacion {
  is_muted: boolean;
  notifications_mode: ModoNotificacion | string;
  last_read_at: string | null;
}

export interface Candidato {
  userId: string;
  /** profiles.full_name; hace falta para el modo "solo menciones". */
  nombre: string | null;
  /** null = nunca guardó ajustes → sin push (default false). */
  ajustes: AjustesUsuario | null;
  /** Solo para chat_message. null = ya no está en la conversación. */
  participacion: Participacion | null;
  suscripciones: number;
}

const ETIQUETA_MEDIA: Record<string, string> = {
  image: "📷 Foto",
  file: "📎 Archivo",
  system: "Mensaje",
};

export function previewDeMensaje(content: string | null, type: string, fileName: string | null): string {
  const t = (content ?? "").trim();
  if (t) return t.length > 120 ? t.slice(0, 120) + "…" : t;
  if (type === "file" && fileName) return `📎 ${fileName}`;
  return ETIQUETA_MEDIA[type] ?? "Nuevo mensaje";
}

/** ¿El texto menciona a esta persona? @nombre completo o @nombre de pila, sin
 *  distinguir mayúsculas. Mismo criterio que get_mentioned_conversations (SQL)
 *  y mentionsMe (cliente), con su falso positivo conocido: "@Ana" también
 *  matchea "@Anabel". */
export function meMenciona(content: string | null, fullName: string | null): boolean {
  if (!content || !fullName) return false;
  const c = content.toLowerCase();
  const completo = fullName.trim().toLowerCase();
  if (!completo) return false;
  const pila = completo.split(/\s+/)[0];
  return c.includes(`@${completo}`) || (!!pila && c.includes(`@${pila}`));
}

/** Minutos desde medianoche en hora de Colombia. El equipo vive en Bogotá y las
 *  franjas de No-molestar se guardaron pensando en esa hora; la edge corre en UTC. */
export function minutosEnBogota(d: Date): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const h = Number(partes.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(partes.find((p) => p.type === "minute")?.value ?? "0");
  return (h % 24) * 60 + m;
}

function aMinutos(hhmm: string): number | null {
  const [h, m] = hhmm.split(":");
  const hh = Number(h);
  const mm = Number(m ?? "0");
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

/** No-molestar respetando la franja. Sin franja = permanente; start === end =
 *  apagado; una franja que cruza medianoche (22:00 → 06:00) se evalúa como
 *  "después de start O antes de end". */
export function dndActivo(
  s: Pick<AjustesUsuario, "dnd_enabled" | "dnd_start_time" | "dnd_end_time">,
  ahoraMin: number,
): boolean {
  if (!s.dnd_enabled) return false;
  if (!s.dnd_start_time || !s.dnd_end_time) return true;
  const start = aMinutos(s.dnd_start_time);
  const end = aMinutos(s.dnd_end_time);
  if (start === null || end === null) return true;
  if (start === end) return false;
  return start < end ? ahoraMin >= start && ahoraMin < end : ahoraMin >= start || ahoraMin < end;
}

export function armarTituloYCuerpo(a: {
  esGrupo: boolean;
  nombreGrupo: string | null;
  emisor: string;
  preview: string;
  enHilo: boolean;
}): { title: string; body: string } {
  const preview = a.enHilo ? `en hilo · ${a.preview}` : a.preview;
  if (a.esGrupo) return { title: a.nombreGrupo || "Grupo", body: `${a.emisor}: ${preview}` };
  return { title: a.emisor, body: preview };
}

export interface DecisionArgs {
  candidatos: Candidato[];
  /** true = chat_message (aplica mute, modo, menciones y "ya lo leyó"). */
  esChat: boolean;
  mensaje: { content: string | null; created_at: string } | null;
  prioridad: Prioridad;
  ahoraMin: number;
}

/** Decide a quién SÍ se le manda. Orden de los descartes = orden de los
 *  contadores en la respuesta; el primero que aplica gana. */
export function decidirDestinatarios(a: DecisionArgs): {
  enviar: string[];
  skipped: Record<MotivoDescarte, number>;
} {
  const skipped: Record<MotivoDescarte, number> = { disabled: 0, no_sub: 0, muted: 0, mode: 0, dnd: 0, read: 0 };
  const enviar: string[] = [];
  const creado = a.mensaje ? Date.parse(a.mensaje.created_at) : NaN;

  for (const c of a.candidatos) {
    const aj = c.ajustes;
    if (!aj || !aj.push_enabled || !aj.notifications_enabled) { skipped.disabled++; continue; }
    if (c.suscripciones <= 0) { skipped.no_sub++; continue; }
    if (a.esChat) {
      const p = c.participacion;
      // Sin fila de participante = lo sacaron del chat entre el INSERT y ahora: cuenta como silenciado.
      if (!p || p.is_muted) { skipped.muted++; continue; }
      if (p.notifications_mode === "none") { skipped.mode++; continue; }
      if (p.notifications_mode === "mentions" && !meMenciona(a.mensaje?.content ?? null, c.nombre)) {
        skipped.mode++;
        continue;
      }
      // Ya lo vio: el cliente pone last_read_at = now() al recibir con el chat en foco.
      if (p.last_read_at && Number.isFinite(creado) && Date.parse(p.last_read_at) >= creado) {
        skipped.read++;
        continue;
      }
    }
    const saltaDnd = a.prioridad === "critical" && aj.dnd_allow_critical;
    if (!saltaDnd && dndActivo(aj, a.ahoraMin)) { skipped.dnd++; continue; }
    enviar.push(c.userId);
  }
  return { enviar, skipped };
}
