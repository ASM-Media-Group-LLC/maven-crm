import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { markMessagesDelivered } from "@/hooks/useReadReceipts";
import { useTabTitleAlert } from "@/hooks/useTabTitleAlert";
import { useNotificationSettings } from "@/hooks/useNotificationSettings";
import { useNotificationPreferences } from "@/hooks/useNotificationPreferences";
import { getChannelSoundMuted } from "@/hooks/useChannelSoundMuted";
import {
  playNotificationSound,
  useBrowserNotifications,
  useNotificationPermission,
} from "@/hooks/useBrowserNotifications";
import { tienePushEnEsteDispositivo } from "@/lib/pushDispositivo";
import { esMovil } from "@/lib/plataformaPwa";
import { avisarPersona } from "@/lib/avisoPersona";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { useReanudarAlVolver } from "@/hooks/useReanudarAlVolver";
import { registrarEnElCanalDelChat } from "@/hooks/canalDelChat";

type Traductor = (key: TranslationKey, params?: Record<string, string | number>) => string;

// Etiqueta legible cuando el mensaje no trae texto. La llave es el `type` del
// mensaje (dato); lo que se lee sale del diccionario, en el idioma de quien
// RECIBE el aviso.
const MEDIA_LABEL: Record<string, TranslationKey> = {
  image: "messenger.preview.foto",
  file: "shared.msgNotif.file",
  system: "shared.msgNotif.message",
};

function previewOf(content: string | null, type: string, fileName: string | null, t: Traductor): string {
  const texto = (content ?? "").trim();
  if (texto) return texto.length > 120 ? texto.slice(0, 120) + "…" : texto;
  if (type === "file" && fileName) return `📎 ${fileName}`;
  const clave = MEDIA_LABEL[type];
  return clave ? t(clave) : t("shared.msgNotif.newMessage");
}

// No-molestar RESPETANDO el horario. Antes dnd_enabled apagaba TODO 24/7. Sin franja
// definida = No-molestar permanente; con franja, maneja ventanas que cruzan medianoche.
function isDndActiveNow(s: { dnd_enabled?: boolean; dnd_start_time?: string | null; dnd_end_time?: string | null }): boolean {
  if (!s?.dnd_enabled) return false;
  if (!s.dnd_start_time || !s.dnd_end_time) return true;
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = s.dnd_start_time.split(":").map(Number);
  const [eh, em] = s.dnd_end_time.split(":").map(Number);
  const start = sh * 60 + (sm || 0);
  const end = eh * 60 + (em || 0);
  if (start === end) return false;
  return start < end ? cur >= start && cur < end : cur >= start || cur < end;
}

// ¿el mensaje me menciona? Mismo criterio que useMentionedConversations: @fullName o @firstName.
function mentionsMe(content: string | null, myName: string | null): boolean {
  if (!content || !myName) return false;
  const c = content.toLowerCase();
  const full = myName.toLowerCase();
  const first = full.split(" ")[0];
  return c.includes(`@${full}`) || (!!first && c.includes(`@${first}`));
}

// ─────────────────── Barrido de "entregado" (✓✓ gris) ───────────────────
//
// POR QUÉ ESTO ESTÁ ACÁ Y NO DENTRO DEL HOOK (17/09/2026, tercera caída del día).
//
// El barrido pedía SIEMPRE "los últimos 200 mensajes de toda la base" y escribía
// hasta 200 acuses. Vivía en el mismo efecto que arma el canal de realtime, con
// `version` en las dependencias, y `version` sube cada vez que el canal revive.
// O sea: la app se satura → se caen canales → cada caída dispara 200 lecturas +
// 200 escrituras → se satura más → se caen más canales. Se realimenta.
// Medido en producción: 74.846 llamadas, 189,9 ms de promedio y 7.483 ms de
// máximo; durante la crisis el barrido + su upsert eran 0,455 núcleos = 23% de
// todo el trabajo de la base (de 2 núcleos compartidos).
//
// El arreglo es pedir SOLO LO NUEVO desde el último barrido.

/** Primer barrido de este navegador (todavía no hay marca). Acotado: el resto
 *  igual queda marcado al abrir la conversación (useChat.ts:988). */
export const LOTE_PRIMERA_VEZ = 100;
/** Barridos siguientes: ya filtran por fecha, así que normalmente traen 0 filas.
 *  El tope es solo un cinturón por si alguien estuvo días sin abrir Maven. */
export const LOTE_INCREMENTAL = 200;
/** Una marca más de un día en el futuro es basura (reloj mal puesto, storage
 *  manipulado), no desfase normal entre el reloj del equipo y el del servidor. */
export const TOLERANCIA_RELOJ_MS = 24 * 60 * 60 * 1000;
/** Volver del segundo plano dispara DOS barridos (useReanudarAlVolver de este
 *  hook + alRevivir del canal del chat). El freno los junta en uno. */
export const FRENO_BARRIDO_MS = 10_000;
/** La marca se guarda unos segundos ANTES del último mensaje visto: un mensaje
 *  que se confirma en la base justo después de nuestra consulta tiene fecha
 *  anterior a ella y, sin solape, quedaría fuera del `gt` para siempre. El
 *  solape lo vuelve a traer y el upsert ignora lo repetido. */
export const MARGEN_SOLAPE_MS = 2_000;

/** Por usuario: en un equipo compartido, la marca de uno no puede servirle al otro. */
export const claveDelBarrido = (userId: string) => `messenger:ultimoBarrido:${userId}`;

// La marca vive en localStorage, no en un ref: un ref se pierde al recargar, y
// recargar (o abrir Maven por la mañana) es JUSTO cuando el barrido sirve. Que
// quede vieja no hace daño: una marca vieja hace pedir de MÁS, nunca de menos.
export function leerMarcaDeBarrido(userId: string): string | null {
  try {
    return localStorage.getItem(claveDelBarrido(userId));
  } catch {
    return null; // modo privado / storage bloqueado → se barre como la primera vez
  }
}

export function guardarMarcaDeBarrido(userId: string, iso: string): void {
  try {
    localStorage.setItem(claveDelBarrido(userId), iso);
  } catch {
    /* sin storage se sigue barriendo como la primera vez: lento, no roto */
  }
}

/** Cuántas tandas seguidas puede pedir un barrido cuando viene de muy atrás.
 *  Con tope 200 por tanda, cubre 1.000 mensajes sin marcar. Más que eso es una
 *  ausencia de días, y esos se marcan igual al abrir la conversación. */
export const MAX_TANDAS = 5;

export type PlanDeBarrido = {
  desde: string | null;
  limite: number;
  /** ⚠️ ASCENDENTE cuando hay marca, y esto NO es un detalle de estilo.
   *
   *  Con `descending` + tope, la base devuelve los N MÁS NUEVOS y la marca
   *  avanza hasta el más nuevo de todos: lo que quedó entre la marca vieja y esa
   *  tanda se salta PARA SIEMPRE. Era exactamente el agujero que se midió el
   *  17/09: el ✓ gris pasó del 73% al 39% de los mensajes.
   *
   *  Ascendente la tanda arranca en la marca y avanza pegada a ella, así que no
   *  puede quedar hueco: la marca nueva es el último que SÍ se marcó.
   *
   *  La primera vez (sin marca) sí va descendente: no se puede marcar la
   *  historia entera, y lo más útil es lo más reciente. */
  ascendente: boolean;
};

/**
 * Qué pedirle a la base en este barrido.
 *
 * ⚠️ REGLA: si la marca falta, no se entiende o apunta al futuro, el peor caso
 * tiene que ser "marco de más" (un lote acotado) y NUNCA "no marco nada" — una
 * marca en el futuro dejaría a `gt` sin devolver una sola fila para siempre, y
 * el ✓✓ gris del Messenger no volvería a aparecer en ese navegador.
 */
export function planDeBarrido(marca: string | null | undefined, ahoraMs: number): PlanDeBarrido {
  const t = marca ? Date.parse(marca) : Number.NaN;
  if (!Number.isFinite(t) || t > ahoraMs + TOLERANCIA_RELOJ_MS) {
    return { desde: null, limite: LOTE_PRIMERA_VEZ, ascendente: false };
  }
  // Normalizar a ISO con milisegundos RECORTA los microsegundos de Postgres, así
  // que el último mensaje ya marcado puede volver a caer en el lote. Es el lado
  // bueno del error: el upsert con ignoreDuplicates lo ignora.
  return { desde: new Date(t).toISOString(), limite: LOTE_INCREMENTAL, ascendente: true };
}

/** Le pone el `gt(created_at)` a la consulta cuando hay marca. Separado para
 *  poder comprobar en las pruebas que el barrido pide solo lo nuevo. */
export function aplicarFiltroDelBarrido<Q extends { gt(columna: string, valor: string): Q }>(
  consulta: Q,
  plan: PlanDeBarrido,
): Q {
  return plan.desde ? consulta.gt("created_at", plan.desde) : consulta;
}

/** Marca nueva = el mensaje más reciente que acabamos de marcar, menos el
 *  solape. Se calcula por máximo y no por el primero de la lista: si algún día
 *  cambia el `order`, la marca no puede adelantarse a mensajes que no marcamos. */
export function marcaDeLote(filas: { created_at: string }[]): string | null {
  let max: string | null = null;
  for (const f of filas) if (f.created_at && (max === null || f.created_at > max)) max = f.created_at;
  if (max === null) return null;
  const t = Date.parse(max);
  // Fecha que no se entiende → no se guarda marca: el próximo barrido repite
  // este lote (de más), en vez de saltárselo (de menos).
  return Number.isFinite(t) ? new Date(t - MARGEN_SOLAPE_MS).toISOString() : null;
}

/** Una tanda: pide, marca y avanza la marca. Devuelve cuántas filas trajo, para
 *  que quien llama sepa si vino llena (y entonces falta más). */
async function tandaDeBarrido(userId: string, plan: PlanDeBarrido): Promise<number> {
  const { data, error } = await aplicarFiltroDelBarrido(
    supabase
      .from("chat_messages")
      .select("id, created_at")
      .neq("sender_id", userId)
      .eq("is_deleted", false),
    plan,
  )
    .order("created_at", { ascending: plan.ascendente })
    .limit(plan.limite);
  const filas = (data as { id: string; created_at: string }[] | null) ?? [];
  if (error || filas.length === 0) return 0;
  // ⚠️ La marca avanza SOLO si la escritura funcionó de verdad. Antes se hacía
  // `await` y se ignoraba el resultado: un upsert rechazado por permisos o
  // cortado por tiempo pasaba por bueno, la marca saltaba igual y esos mensajes
  // se quedaban sin ✓ para siempre. Ahora, si falló, el próximo barrido vuelve a
  // traer lo mismo, que es el lado bueno del error.
  const ok = await markMessagesDelivered(userId, filas.map((f) => f.id));
  if (!ok) return 0;
  const nueva = marcaDeLote(filas);
  if (nueva) guardarMarcaDeBarrido(userId, nueva);
  return filas.length;
}

/** Marca "entregado" lo que llegó desde el último barrido. Devuelve cuántos marcó.
 *
 *  Va por tandas mientras la anterior venga LLENA: una tanda llena significa que
 *  el tope cortó, o sea que detrás quedan más mensajes sin marcar. Como las
 *  tandas van pegadas a la marca (ascendente), cada una arranca donde terminó la
 *  anterior y no puede saltarse nada.
 *
 *  Sin este bucle, quien vuelve tras una ausencia larga marcaría solo la primera
 *  tanda y el resto quedaría sin ✓ gris hasta abrir cada conversación. */
export async function barridoDeEntregados(userId: string, ahoraMs = Date.now()): Promise<number> {
  let total = 0;
  try {
    for (let tanda = 0; tanda < MAX_TANDAS; tanda++) {
      const plan = planDeBarrido(leerMarcaDeBarrido(userId), ahoraMs);
      const traidas = await tandaDeBarrido(userId, plan);
      total += traidas;
      // Vino corta → ya no queda nada detrás. Y la primera vez (sin marca) se
      // hace UNA sola tanda a propósito: no se marca la historia entera.
      if (traidas < plan.limite || !plan.ascendente) break;
    }
    return total;
  } catch {
    return total; // sin red o sin permisos: el próximo barrido reintenta desde la marca
  }
}

/**
 * Hook GLOBAL del Messenger interno (chat del staff). Montado en AppShell → activo en toda
 * Maven, no solo en /messenger. Reacciona a cada mensaje interno entrante
 * (chat_messages INSERT de otro usuario) con DOS cosas:
 *
 *  1) ACK "ENTREGADO" (delivered_at) — SIEMPRE. Para que el remitente vea ✓✓ gris apenas el
 *     navegador del destinatario recibe el mensaje, aunque no esté en /messenger. Además,
 *     backfill al montar para los mensajes que llegaron mientras Maven estaba cerrado.
 *     (Silenciar una conversación NO afecta los recibos.)
 *
 *  2) SONIDO + notificación del navegador — CONDICIONAL. Se omite si:
 *       - la conversación está SILENCIADA para mí (chat_participants.is_muted), o
 *       - los ajustes del usuario lo impiden (maestro de notificaciones, No-molestar; el
 *         sonido además respeta sound_enabled).
 *     Y si este dispositivo tiene Web Push activo (push_enabled + suscripción), la
 *     tarjeta del navegador la pone el service worker: acá queda solo el sonido.
 *
 * La RLS de chat_messages (SELECT: is_chat_participant) limita el realtime a mis
 * conversaciones, así que todo INSERT que llega es de un chat propio.
 *
 * El evento llega por el CANAL DEL CHAT (canalDelChat.ts), el mismo de la lista, el globito
 * y las menciones: UNA escucha del INSERT de chat_messages por pestaña en vez de una por
 * hook. El registro va por user.id (no el objeto `user`): un refresh de token no re-registra.
 */
export function useMessengerNotifications() {
  const { user } = useAuth();
  const { settings, isLoading: settingsCargando } = useNotificationSettings();
  const { notify } = useBrowserNotifications();
  const navigate = useNavigate();
  useNotificationPermission();
  // Parpadeo del título de la pestaña (estilo Google Chat).
  const alertTitle = useTabTitleAlert();
  const alertTitleRef = useRef(alertTitle);
  alertTitleRef.current = alertTitle;

  // La suscripción se arma una sola vez por user.id; el callback lee siempre el valor actual
  // vía refs (sin re-suscribir en cada cambio de settings/notify).
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const { isCanalActivo } = useNotificationPreferences();
  const prefRef = useRef(isCanalActivo);
  prefRef.current = isCanalActivo;
  const settingsCargandoRef = useRef(settingsCargando);
  settingsCargandoRef.current = settingsCargando;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  // Anti-spam del sonido: en ráfagas no disparamos un beep por cada mensaje.
  const lastSoundRef = useRef(0);
  // Mi nombre, para el modo "Solo @menciones".
  const myNameRef = useRef<string | null>(null);

  const userId = user?.id ?? null;
  // Textos del aviso de mención por t(); va por ref para que cambiar de idioma
  // no re-registre la escucha.
  const { t } = useLanguage();
  const tRef = useRef(t);
  tRef.current = t;
  const [version, setVersion] = useState(0);
  useReanudarAlVolver(() => setVersion((v) => v + 1));
  const ultimoBarridoRef = useRef(0);

  // EFECTO 1 — se arma UNA vez por usuario. Nada acá depende de `version`: si
  // volviera a correr en cada resurrección del canal, volveríamos a pedirle el
  // nombre a la base en cada corte de red.
  useEffect(() => {
    if (!userId) return;

    // Mi nombre (una vez) para detectar menciones en modo 'mentions'.
    void supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => { myNameRef.current = data?.full_name ?? null; });

    // Qué hacer con cada mensaje se arma aquí (cierra sobre userId y los refs);
    // el evento llega por el canal del chat, que revive solo.
    return registrarEnElCanalDelChat(userId, {
      current: {
        "chat_messages:INSERT": async (payload) => {
          const m = payload.new as {
            id?: string;
            conversation_id?: string;
            sender_id?: string;
            content?: string | null;
            type?: string;
            file_name?: string | null;
            is_deleted?: boolean;
            api_key_id?: string | null;
            api_display_name?: string | null;
          } | null;
          if (!m?.id || !m.conversation_id || !m.sender_id) return;
          if (m.sender_id === userId || m.is_deleted) return;

          // (1) Entregado — SIEMPRE (independiente de silenciar/ajustes).
          void markMessagesDelivered(userId, [m.id]);

          // (2) Notificación — condicional. Maestro apagado o No-molestar (según horario) → nada.
          const s = settingsRef.current;
          if (s.notifications_enabled === false || isDndActiveNow(s)) return;
          // Ajustes → Notificaciones → Eventos → Messenger (el push lo decide el servidor).
          if (!prefRef.current("chat_message", "in_app")) return;

          // Mute + modo de notificación de la conversación (mi fila) + tipo/nombre en 1 query.
          const { data: part } = await supabase
            .from("chat_participants")
            .select("is_muted, notifications_mode, conversation:chat_conversations(type, name)")
            .eq("conversation_id", m.conversation_id)
            .eq("user_id", userId)
            .maybeSingle();
          if (!part || (part as { is_muted?: boolean }).is_muted) return;

          // Respetar el modo por-conversación: 'none' nunca notifica; 'mentions' solo si me mencionan.
          const mode = (part as { notifications_mode?: string }).notifications_mode;
          if (mode === "none") return;
          if (mode === "mentions" && !mentionsMe(m.content ?? null, myNameRef.current)) return;

          const conv = (part as { conversation?: { type?: string; name?: string | null } | null })
            .conversation ?? null;
          const isGroup = conv?.type === "group";

          let senderName = tRef.current("shared.msgNotif.someone");
          let senderFoto: string | null = null;
          let senderSeed: string | null = null;
          if (m.api_key_id != null) {
            // Lo mandó una integración: el nombre de la key viene en la fila
            // («BLU (API)», igual que la campana y el push) y NO se pregunta a
            // profiles, que diría el nombre y la foto de la persona dueña de la
            // key. Sin foto: iniciales.
            senderName = tRef.current("shared.msgNotif.viaApi", {
              name: m.api_display_name?.trim() || tRef.current("messenger.api.etiqueta"),
            });
          } else {
            try {
              const { data: prof } = await supabase
                .from("profiles")
                .select("full_name, avatar_url, avatar_seed")
                .eq("id", m.sender_id)
                .maybeSingle();
              if (prof?.full_name) senderName = prof.full_name;
              senderFoto = (prof as { avatar_url?: string | null } | null)?.avatar_url ?? null;
              senderSeed = (prof as { avatar_seed?: string | null } | null)?.avatar_seed ?? null;
            } catch {
              /* nombre genérico */
            }
          }

          const preview = previewOf(m.content ?? null, m.type ?? "text", m.file_name ?? null, tRef.current);
          const title = isGroup ? conv?.name || tRef.current("shared.msgNotif.group") : senderName;
          const body = isGroup ? `${senderName}: ${preview}` : preview;

          // Título de la pestaña parpadeando mientras no estés mirando (Google Chat).
          alertTitleRef.current(
            isGroup
              ? tRef.current("shared.msgNotif.wroteIn", { name: senderName, title })
              : tRef.current("shared.msgNotif.wroteYou", { name: senderName })
          );

          // Sonido: respeta el ajuste global, el mute PROPIO de bandejas/chats
          // (WhatsApp+Telegram+Messenger, botón del sidebar) y se limita a 1 cada
          // 1.5s en ráfagas.
          const now = Date.now();
          const soundOk =
            s.sound_enabled !== false &&
            !getChannelSoundMuted("messenger", userId) &&
            now - lastSoundRef.current > 1500;
          if (soundOk) lastSoundRef.current = now;

          // La tarjeta del navegador (pestaña oculta) NO va:
          //  · en el teléfono, nunca: ahí manda el push del service worker. La app
          //    abierta de fondo seguía creando la suya y el primer mensaje llegaba
          //    doble (Jhon lo vio en iPhone y Android);
          //  · en escritorio, si este dispositivo tiene push y el usuario tiene el
          //    opt-in (o los ajustes aún cargan y no sabemos: mejor uno que dos).
          // En ambos casos quedan el sonido y el parpadeo del título.
          // MENCIÓN con Maven a la vista, en otra pantalla que Messenger: aviso
          // dentro de la app, pase lo que pase con el push. Las dos reglas de
          // abajo ("el push la cubre") y la del service worker ("con una ventana
          // visible no se muestra nada") juntas dejaban CERO aviso visible: Jhon
          // se mencionó desde la cuenta test y no le llegó nada (16/09). Con
          // Messenger abierto no hace falta: la lista ya lo marca.
          const esMencion = mentionsMe(m.content ?? null, myNameRef.current);
          const mirandoOtraPantalla =
            document.visibilityState === "visible" && !location.pathname.startsWith("/messenger");
          if (esMencion && mirandoOtraPantalla) {
            if (soundOk) playNotificationSound();
            const convId = m.conversation_id;
            avisarPersona({
              nombre: senderName,
              foto: senderFoto,
              seed: senderSeed,
              titulo: isGroup
                ? `${senderName} ${tRef.current("messenger.teMencionoEn")} ${title}`
                : `${senderName} ${tRef.current("messenger.teMenciono")}`,
              detalle: preview,
              tono: "ojo",
              duracion: 10_000,
              id: `mencion-${m.id}`,
              abrir: { etiqueta: tRef.current("avisos.abrir"), alTocar: () => navigateRef.current(`/messenger?c=${convId}&m=${m.id}`) },
            });
            return;
          }

          const pushCubre =
            tienePushEnEsteDispositivo(userId) && (s.push_enabled === true || settingsCargandoRef.current);
          if (esMovil() || pushCubre) {
            if (soundOk) playNotificationSound();
            return;
          }

          // Con la ruta, la tarjeta la muestra el service worker y su clic abre
          // la pestaña que YA está en el Messenger, no la que la armó (que es la
          // oculta: puede ser el Correo). Ver useBrowserNotifications.
          const ruta = `/messenger?c=${m.conversation_id}&m=${m.id}`;
          notifyRef.current(
            title,
            body,
            () => navigateRef.current(ruta),
            soundOk,
            ruta,
          );
        },
        // Mientras no hubo canal llegaron mensajes sin marcar "entregado": el
        // efecto de abajo hace ese backfill al bumpear `version`.
        alRevivir: () => setVersion((v) => v + 1),
      },
    });
  }, [userId]);

  // EFECTO 2 — el barrido, y SOLO el barrido. Sigue dependiendo de `version`
  // porque para esto existe `alRevivir`: marcar lo que llegó mientras el canal
  // estuvo muerto. Sacarlo de acá haría desaparecer el ✓✓ gris de esos mensajes.
  useEffect(() => {
    if (!userId) return;
    let cancelado = false;
    const barrer = () => {
      ultimoBarridoRef.current = Date.now();
      void barridoDeEntregados(userId);
    };
    const faltan = FRENO_BARRIDO_MS - (Date.now() - ultimoBarridoRef.current);
    if (faltan <= 0) {
      barrer();
      return;
    }
    // Frenado, NO descartado: si se descartara, los mensajes de esa ventana se
    // quedarían sin ✓✓ gris hasta la próxima caída del canal.
    const temporizador = setTimeout(() => { if (!cancelado) barrer(); }, faltan);
    return () => {
      cancelado = true;
      clearTimeout(temporizador);
    };
  }, [userId, version]);
}
