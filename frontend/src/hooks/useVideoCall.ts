import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SUENA_MS, invitarALaLlamada } from "@/lib/llamadaInvitar";
import { urlDeLaLlamada } from "@/lib/urlDeLaLlamada";

export type CallStatus = "idle" | "ringing" | "accepted" | "ended" | "declined";
export type CallType = "audio" | "video";

export interface Call {
  id: string;
  caller_id: string;
  receiver_id: string | null;
  call_status: CallStatus;
  room_id: string;
  start_time: string | null;
  end_time: string | null;
  caller_name?: string;
  /** Para el título de la llamada: el nombre del chat o de quien llama. */
  titulo?: string;
  conversation_id: string | null;
  call_type?: CallType;
  is_group?: boolean;
}

/**
 * Video call signaling hook — manages call state via Supabase DB.
 * Opens calls in new tabs via the /call/:roomName route.
 */
export function useVideoCall() {
  const { user } = useAuth();
  // ── Por que existe `uid` y no se usa `user` en los efectos de realtime ──────
  //
  // `useAuth` llama a setUser desde DOS fuentes async distintas
  // (onAuthStateChange y getSession), y auth-js re-parsea la sesion en cada
  // lectura: cada emision trae un objeto `user` NUEVO por referencia, con el
  // mismo id. React compara con Object.is, asi que un efecto que depende de
  // `user` se re-corre dos o tres veces al arrancar.
  //
  // Eso, por si solo, seria ruido. Lo que lo volvia fatal es un detalle de
  // supabase-js 2.95.3: `removeChannel` es ASINCRONO (espera el unsubscribe) y
  // su `_remove` filtra por NOMBRE DE TOPIC, no por instancia
  // (RealtimeClient.js:451). Entonces la limpieza de la corrida anterior se
  // ejecuta DESPUES de que la nueva ya creo su canal con el mismo nombre… y
  // borra el canal NUEVO de la tabla de ruteo. El servidor contesta ok al join
  // y el cliente ya no tiene a quien entregarselo: a los 10 s, TIMED_OUT.
  //
  // Por eso Messenger andaba y las llamadas no: sus canales llevan nombre
  // aleatorio, asi que el borrado por topic no los alcanzaba.
  //
  // La cura es depender del ID (un string estable) en vez del objeto. Se
  // verifico que esto NO rompe el refresco del JWT: supabase-js empuja el token
  // nuevo a los canales con realtime.setAuth, sin re-suscribir.
  const uid = user?.id;
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);
  // ── Por que el canal de llamadas lleva version y reintento ──────────────────
  //
  // Se suscribia UNA vez y listo. Si ese join fallaba —y fallaba— el canal
  // quedaba muerto para siempre: sin timbre, sin modal y sin un solo error.
  // Confirmado en produccion: `CLOSED`, `CLOSED`, `TIMED_OUT`, y despues nada.
  //
  // Messenger no se salvaba por suerte: `useChat` ya hacia exactamente esto
  // (ver scheduleChannelReconnect, useChat.ts:223) — detectar que el canal no
  // quedo suscrito, esperar con espera creciente, y volver a suscribirse CON UN
  // NOMBRE NUEVO. Por eso los mensajes llegaban en vivo y las llamadas no.
  //
  // El nombre nuevo importa: reusar el mismo topic cuando el anterior quedo a
  // medio morir es justo lo que deja el join colgado. Acá se puede cambiar sin
  // consecuencias porque este canal es de `postgres_changes` y el nombre es una
  // etiqueta local. OJO: en un canal de PRESENCIA el nombre es la sala
  // compartida y cambiarlo dejaria a cada uno en un cuarto distinto.
  const [canalVersion, setCanalVersion] = useState(0);
  const reintentoCanalRef = useRef(0);
  const reconexionCanalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Lo mismo para el canal que sigue el estado de la llamada YA activa. Si ese
  // se cae, quien llama nunca se entera de que le contestaron o le cortaron:
  // se queda mirando "llamando…" para siempre.
  const [estadoVersion, setEstadoVersion] = useState(0);
  const reintentoEstadoRef = useRef(0);
  const reconexionEstadoRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [calling, setCalling] = useState(false);
  const ringingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Espejo de activeCall para leerlo dentro del callback de realtime sin
  // re-suscribir el canal (sus deps son [user]).
  const activeCallRef = useRef<Call | null>(null);
  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  // ── Cleanup ringing timer helper ────────────────────────────────
  const clearRingingTimer = useCallback(() => {
    if (ringingTimerRef.current) {
      clearTimeout(ringingTimerRef.current);
      ringingTimerRef.current = null;
    }
  }, []);

  // ── Initiate a call ─────────────────────────────────────────────
  const initiateCall = useCallback(
    async (conversationId: string, receiverId: string, receiverName: string, callType: CallType = "video") => {
      if (!user || !conversationId) return;
      setCalling(true);

      const roomId = `call-${conversationId}`;

      // ── Anti-"glare" ────────────────────────────────────────────────
      // Si los dos se llaman casi a la vez, NO creamos dos llamadas para la
      // misma sala (room_id es determinístico por conversación). Buscamos una
      // llamada viva (lo que dura el timbre) en esta conversación.
      const since = new Date(Date.now() - SUENA_MS - 10_000).toISOString();
      const { data: liveRows } = await (supabase.from("calls") as any)
        .select("*")
        .eq("conversation_id", conversationId)
        .in("call_status", ["ringing", "accepted"])
        .gte("created_at", since)
        .order("created_at", { ascending: false });
      const live = (liveRows ?? []) as Call[];

      // (a) El OTRO ya me está llamando → me UNO a su llamada (no creo otra).
      const fromOther = live.find(
        (c) => c.receiver_id === user.id && c.caller_id === receiverId,
      );
      if (fromOther) {
        clearRingingTimer();
        await (supabase.from("calls") as any)
          .update({ call_status: "accepted", start_time: new Date().toISOString() })
          .eq("id", fromOther.id)
          .eq("call_status", "ringing");
        await (supabase.from("call_participants") as any)
          .update({ status: "accepted" })
          .eq("call_id", fromOther.id)
          .eq("user_id", user.id);
        setIncomingCall(null);
        setActiveCall({ ...fromOther, call_status: "accepted" });
        setCalling(false);
        window.open(urlDeLaLlamada(roomId, { nombre: receiverName, directo: true, audio: callType === "audio" }), `call-${roomId}`, "noopener");
        return;
      }

      // (b) Yo ya tengo una llamada viva en esta conversación → solo reabro la
      // sala, no duplico.
      const mine = live.find((c) => c.caller_id === user.id);
      if (mine) {
        setActiveCall(mine);
        setCalling(false);
        window.open(urlDeLaLlamada(roomId, { nombre: receiverName, admin: true, directo: true, audio: callType === "audio" }), `call-${roomId}`, "noopener");
        return;
      }

      // (c) Normal: creo la llamada.
      const { data: call, error } = await (supabase
        .from("calls") as any)
        .insert({
          caller_id: user.id,
          receiver_id: receiverId,
          call_status: "ringing",
          room_id: roomId,
          conversation_id: conversationId,
          call_type: callType,
          is_group: false,
        })
        .select()
        .single();

      if (error || !call) {
        console.error("Failed to create call:", error);
        setCalling(false);
        return;
      }

      // Insert participants
      await (supabase.from("call_participants") as any).insert([
        { call_id: call.id, user_id: user.id, status: "accepted" },
        { call_id: call.id, user_id: receiverId, status: "ringing" },
      ]);

      setActiveCall({ ...call, caller_name: "Yo", call_type: callType } as Call);
      setCalling(false);

      // Quien llama entra directo (sin sala previa) y ve el nombre de a quién llama.
      window.open(urlDeLaLlamada(roomId, { nombre: receiverName, admin: true, directo: true, audio: callType === "audio" }), `call-${roomId}`, "noopener");

      // Push al receptor: si tiene Maven cerrado o en otra pestaña, igual le
      // suena. Best-effort — el modal in-app cubre "Maven abierto".
      void supabase.functions
        .invoke("web-push", { body: { action: "notify_call", callId: call.id } })
        .catch(() => {});

      // Auto-end after 30s if no answer
      clearRingingTimer();
      ringingTimerRef.current = setTimeout(async () => {
        // Quien no contestó queda «no contestó» (la pestaña de quien llama lo muestra).
        await (supabase.from("call_participants") as any)
          .update({ status: "missed", actualizado: new Date().toISOString() })
          .eq("call_id", call.id)
          .eq("status", "ringing");
        await (supabase.from("calls") as any)
          .update({ call_status: "ended", end_time: new Date().toISOString() })
          .eq("id", call.id)
          .eq("call_status", "ringing");

        setActiveCall(null);
      }, SUENA_MS);
    },
    [user, clearRingingTimer]
  );

  // ── Llamada de grupo: le suena a todos (Alvaro, 18/11/2026) ─────────
  // Antes se pegaba un link en el chat y nadie recibía timbre. Ahora la llamada
  // nace en curso (quien llama ya está adentro) y cada miembro es una fila
  // 'ringing': rechazar o no contestar es solo de cada uno.
  const initiateGroupCall = useCallback(
    async (conversationId: string, memberIds: string[], groupName: string, callType: CallType = "video") => {
      if (!user || !conversationId) return;
      setCalling(true);
      const roomId = `call-${conversationId}`;
      try {
        const desde = new Date(Date.now() - 12 * 3600_000).toISOString();
        const { data: vivas } = await (supabase.from("calls") as any)
          .select("*")
          .eq("room_id", roomId)
          .in("call_status", ["ringing", "accepted"])
          .gte("created_at", desde)
          .order("created_at", { ascending: false })
          .limit(1);
        let call = ((vivas ?? [])[0] as Call | undefined) ?? null;
        if (!call) {
          const { data, error } = await (supabase.from("calls") as any)
            .insert({
              caller_id: user.id,
              receiver_id: null,
              call_status: "accepted",
              start_time: new Date().toISOString(),
              room_id: roomId,
              conversation_id: conversationId,
              call_type: callType,
              is_group: true,
            })
            .select()
            .single();
          if (error || !data) throw error ?? new Error("calls insert");
          call = data as Call;
          await (supabase.from("call_participants") as any).insert({ call_id: call.id, user_id: user.id, status: "accepted" });
        }
        window.open(urlDeLaLlamada(roomId, { nombre: groupName, admin: true, directo: true, audio: callType === "audio" }), `call-${roomId}`, "noopener");
        // Tope de 20 timbres a la vez: un grupo de 60 no se llama entero de golpe.
        await invitarALaLlamada(
          { id: call.id, caller_id: call.caller_id, room_id: roomId, conversation_id: conversationId, call_status: call.call_status, call_type: callType, is_group: true },
          user.id,
          memberIds.filter((m) => m !== user.id).slice(0, 20),
        );
      } catch (e) {
        console.error("[Llamadas] No se pudo iniciar la llamada de grupo:", e);
        throw e;
      } finally {
        setCalling(false);
      }
    },
    [user],
  );

  // ── Accept call ──────────────────────────────────────────────────
  const acceptCall = useCallback(async () => {
    if (!incomingCall || !user) return;

    // Solo si seguía sonando: a una llamada de grupo ya en curso no se le pisa
    // la hora de inicio.
    await (supabase.from("calls") as any)
      .update({ call_status: "accepted", start_time: new Date().toISOString() })
      .eq("id", incomingCall.id)
      .eq("call_status", "ringing");

    await (supabase.from("call_participants") as any)
      .update({ status: "accepted", actualizado: new Date().toISOString() })
      .eq("call_id", incomingCall.id)
      .eq("user_id", user.id);

    setActiveCall(incomingCall);
    setIncomingCall(null);

    // Contestar = entrar ya a la llamada (sin sala previa), con el nombre de
    // quien llama arriba.
    window.open(
      urlDeLaLlamada(incomingCall.room_id, {
        nombre: incomingCall.titulo || incomingCall.caller_name,
        directo: true,
        audio: incomingCall.call_type === "audio",
      }),
      `call-${incomingCall.room_id}`,
      "noopener"
    );
  }, [incomingCall, user]);

  // ── Decline call ─────────────────────────────────────────────────
  const declineCall = useCallback(async () => {
    if (!incomingCall || !user) return;

    await (supabase.from("call_participants") as any)
      .update({ status: "declined", actualizado: new Date().toISOString() })
      .eq("call_id", incomingCall.id)
      .eq("user_id", user.id);

    // En el 1 a 1, rechazar corta la llamada. En grupo (o si ya estaba en curso)
    // solo te sacas tú: los demás siguen hablando.
    if (!incomingCall.is_group) {
      await (supabase.from("calls") as any)
        .update({ call_status: "declined", end_time: new Date().toISOString() })
        .eq("id", incomingCall.id)
        .eq("call_status", "ringing");
    }

    setIncomingCall(null);
  }, [incomingCall, user]);

  // ── Que el timbre se calle en TODAS las pestanas ─────────────────
  //
  // Rechazar una llamada la marca como 'declined' en la base, pero las OTRAS
  // pestanas de la misma persona no se enteraban: solo escuchan los INSERT de
  // llamadas nuevas, nunca el desenlace de la que ya estan mostrando. Resultado:
  // rechazabas en una y las demas seguian sonando hasta el auto-corte. Hubo que
  // colgar en cada una, a mano.
  //
  // Tener Maven en dos pestanas no es raro: es lo normal. Y el sintoma es de los
  // que dan mas bronca, porque el ruido sigue despues de que ya dijiste que no.
  //
  // Dos caminos, a proposito:
  //   1. El evento en vivo, que cierra al instante.
  //   2. Un plazo maximo, por si el evento no llega. La llamada se auto-corta a
  //      SUENA_MS (45 s desde el 18/11/2026) del lado de quien llama, asi que
  //      10 s despues ya no hay nada que contestar: seguir sonando es puro
  //      ruido. Esta red NO depende de realtime, que es justo lo que fallo toda
  //      la noche.
  const MAX_TIMBRE_MS = SUENA_MS + 10_000;
  useEffect(() => {
    if (!incomingCall || !uid) return;
    const id = incomingCall.id;
    const esDeGrupo = !!incomingCall.is_group;
    const cerrarSiEsEsta = () =>
      setIncomingCall((prev) => (prev && prev.id === id ? null : prev));

    const canal = supabase
      .channel(`entrante-${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "calls", filter: `id=eq.${id}` },
        (payload) => {
          const c = payload.new as Call;
          // Terminada o rechazada: no hay nada que contestar. Una llamada de
          // grupo ya en curso ('accepted') sigue sonándote hasta que contestes:
          // lo que cierra el modal es TU fila (abajo).
          if (c.call_status === "ended" || c.call_status === "declined") cerrarSiEsEsta();
          else if (c.call_status !== "ringing" && !c.is_group && !esDeGrupo) cerrarSiEsEsta();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "call_participants", filter: `call_id=eq.${id}` },
        (payload) => {
          const f = payload.new as { user_id: string; status: string };
          // La atendiste o rechazaste en otra pestaña, o ya pasó el tiempo.
          if (f.user_id === uid && f.status !== "ringing") cerrarSiEsEsta();
        },
      )
      .subscribe((estado) => {
        // Sin este aviso, este canal fallaba igual de mudo que los otros dos.
        // Si no queda suscrito, el modal se cierra igual por el plazo de abajo
        // — pero conviene saber cual de los dos caminos nos salvo.
        if (estado !== "SUBSCRIBED") {
          console.warn("[Llamadas] El canal de esta llamada entrante esta en:", estado,
            "— el modal se va a cerrar por tiempo, no por evento.");
        }
      });

    const plazo = setTimeout(cerrarSiEsEsta, MAX_TIMBRE_MS);

    return () => {
      clearTimeout(plazo);
      supabase.removeChannel(canal);
    };
  }, [incomingCall?.id, uid]);

  // ── End call ─────────────────────────────────────────────────────
  const endCall = useCallback(async () => {
    if (!activeCall || !user) return;

    clearRingingTimer();

    await (supabase.from("calls") as any)
      .update({ call_status: "ended", end_time: new Date().toISOString() })
      .eq("id", activeCall.id);

    await (supabase.from("call_participants") as any)
      .update({ status: "ended" })
      .eq("call_id", activeCall.id);

    setActiveCall(null);
  }, [activeCall, user, clearRingingTimer]);

  // ── Cleanup ringing timer on unmount ────────────────────────────
  useEffect(() => {
    return () => {
      clearRingingTimer();
    };
  }, [clearRingingTimer]);

  // ── Realtime listener for incoming calls (stable deps) ─────────
  useEffect(() => {
    if (!uid) return;

    // Este efecto se rehace en cada reintento, y su limpieza llama a
    // removeChannel — que dispara el callback de estado con 'CLOSED'. Sin esta
    // bandera, ese 'CLOSED' PROPIO programaba otro reintento, que rehacia el
    // efecto, que volvia a limpiar… un bucle de dos segundos que llenaba la
    // consola y agitaba el socket sin parar. Es el mismo error que ya habiamos
    // arreglado en el vigilante de presencia: un reintento que se dispara a si
    // mismo no es resiliencia, es ruido.
    let desmontando = false;

    // Initial check for any ringing calls
    const checkIncoming = async () => {
      const { data: directCalls } = await (supabase
        .from("calls") as any)
        .select("*")
        .eq("receiver_id", uid)
        .eq("call_status", "ringing")
        .order("created_at", { ascending: false })
        .limit(1);

      if (directCalls && directCalls.length > 0) {
        const call = directCalls[0] as Call;
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", call.caller_id)
          .single();

        setIncomingCall((prev) => {
          // Don't overwrite if we already have this call or any active call
          if (prev?.id === call.id) return prev;
          return {
            ...call,
            caller_name: profile?.full_name ?? "Usuario",
          };
        });
      }
    };

    // Invitación a una llamada (grupo o «Agregar»): se muestra igual que el 1 a 1.
    const mostrarInvitacion = async (callId: string, invitadoPor: string | null) => {
      const { data: call } = await (supabase.from("calls") as any)
        .select("*").eq("id", callId).maybeSingle();
      if (!call || (call.call_status !== "ringing" && call.call_status !== "accepted")) return;
      const c = call as Call;
      // La llamada 1 a 1 de siempre ya la muestra el canal de `calls`.
      if (!c.is_group && c.receiver_id === uid && c.call_status === "ringing") return;
      const quien = invitadoPor || c.caller_id;
      const [{ data: profile }, { data: conv }] = await Promise.all([
        supabase.from("profiles").select("full_name").eq("id", quien).maybeSingle(),
        c.conversation_id
          ? (supabase.from("chat_conversations") as any).select("name, type").eq("id", c.conversation_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      setIncomingCall((prev) => {
        if (prev?.id === c.id) return prev;
        return {
          ...c,
          is_group: true,
          caller_name: profile?.full_name ?? "Usuario",
          titulo: (conv?.type === "group" && conv?.name) ? conv.name : profile?.full_name ?? undefined,
        };
      });
    };

    checkIncoming();
    void (async () => {
      const desde = new Date(Date.now() - SUENA_MS - 10_000).toISOString();
      const { data: filas } = await (supabase.from("call_participants") as any)
        .select("call_id, invitado_por, actualizado")
        .eq("user_id", uid)
        .eq("status", "ringing")
        .gte("actualizado", desde)
        .order("actualizado", { ascending: false })
        .limit(1);
      const f = (filas ?? [])[0] as { call_id: string; invitado_por: string | null } | undefined;
      if (f) await mostrarInvitacion(f.call_id, f.invitado_por);
    })();

    // Subscribe to realtime changes on calls table for this user
    const channel = supabase
      .channel(`incoming-calls-${uid}-${canalVersion}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "calls",
          filter: `receiver_id=eq.${uid}`,
        },
        async (payload) => {
          const call = payload.new as Call;
          console.info("[Llamadas] Entrante recibida:", call.id, "estado:", call.call_status);
          if (call.call_status !== "ringing") {
            console.info("[Llamadas] Descartada: no viene en 'ringing'.");
            return;
          }

          // Glare simultáneo (sub-segundo, cuando el query de initiateCall corrió
          // antes de ver la fila del otro): si YO también estoy llamando en esta
          // misma conversación, ya compartimos la sala determinística. No muestro
          // otro modal y marco mi llamada como aceptada para cortar el auto-corte.
          const mineActive = activeCallRef.current;
          // `call_status === "ringing"` NO es un detalle: es lo que limita esta
          // rama al caso para el que fue escrita. El choque simultaneo es "los
          // dos estamos LLAMANDO a la vez", y ahi mi llamada esta en 'ringing'.
          //
          // Sin esa condicion, cualquier `activeCall` que quedara colgado de una
          // llamada YA ACEPTADA de la misma conversacion se tragaba todas las
          // entrantes siguientes: no sonaba, no aparecia el modal, no habia
          // error. Y encima la rama no hacia nada util en ese caso — el UPDATE
          // de abajo filtra por `.eq("call_status", "ringing")`, asi que sobre
          // una llamada aceptada no actualiza nada. Solo silenciaba.
          if (mineActive && mineActive.conversation_id === call.conversation_id
              && mineActive.call_status === "ringing") {
            // Esta rama existe para el choque simultaneo (los dos se llaman a la
            // vez). Pero si `activeCall` quedo colgado de una llamada anterior de
            // la MISMA conversacion, se traga todas las entrantes siguientes sin
            // decir nada: no suena, no aparece el modal, no hay error.
            console.warn("[Llamadas] Descartada por choque: ya tengo una llamada activa en esta conversacion",
              mineActive.id, "estado:", mineActive.call_status);
            void (supabase.from("calls") as any)
              .update({ call_status: "accepted", start_time: new Date().toISOString() })
              .eq("id", mineActive.id)
              .eq("call_status", "ringing");
            return;
          }

          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", call.caller_id)
            .single();

          console.info("[Llamadas] Mostrando el modal de llamada entrante.");
          setIncomingCall({
            ...call,
            caller_name: profile?.full_name ?? "Usuario",
          });
        }
      )
      // Timbre por persona (grupos y «Agregar a la llamada»): cada invitado es
      // una fila 'ringing' en call_participants.
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "call_participants",
          filter: `user_id=eq.${uid}`,
        },
        async (payload) => {
          const fila = payload.new as { call_id?: string; status?: string; invitado_por?: string | null };
          if (!fila?.call_id || fila.status !== "ringing") return;
          await mostrarInvitacion(fila.call_id, fila.invitado_por ?? null);
        },
      )
      // Si el canal no queda SUBSCRIBED, el timbre no suena y hasta ahora eso no
      // dejaba ni una linea en consola: se veia igual que "me llamaron y no me
      // llego". Un fallo silencioso en el timbre es el peor de todos, porque el
      // que no lo escucha no sabe que hubo algo que escuchar.
      .subscribe((estado) => {
        // Nos estamos yendo: cualquier 'CLOSED' de acá en adelante lo causamos
        // nosotros al limpiar, y reaccionar a el es morderse la cola.
        if (desmontando) return;
        if (estado === "SUBSCRIBED") {
          reintentoCanalRef.current = 0;
          console.info("[Llamadas] Escuchando llamadas entrantes.");
          return;
        }
        console.warn("[Llamadas] El canal de llamadas entrantes esta en:", estado, "— reintentando.");
        // Espera creciente con techo de 15s, igual que Messenger. Sin techo, un
        // corte largo mandaria el proximo intento a media hora; sin espera, el
        // reintento se vuelve el problema (nos paso con la presencia de Cowork).
        if (reconexionCanalRef.current) return;
        reintentoCanalRef.current += 1;
        const espera = Math.min(1000 * 2 ** reintentoCanalRef.current, 15000);
        reconexionCanalRef.current = setTimeout(() => {
          reconexionCanalRef.current = null;
          setCanalVersion((v) => v + 1);   // nombre nuevo -> canal nuevo
        }, espera);
      });

    return () => {
      desmontando = true;
      if (reconexionCanalRef.current) {
        clearTimeout(reconexionCanalRef.current);
        reconexionCanalRef.current = null;
      }
      supabase.removeChannel(channel);
    };
    // `canalVersion` en las dependencias es LO QUE HACE que el reintento ocurra:
    // al subirlo, el efecto se rehace y abre un canal con nombre nuevo.
  }, [uid, canalVersion]);

  // ── Realtime active call status tracking ───────────────────────
  useEffect(() => {
    if (!activeCall || !uid) return;
    let desmontandoEstado = false;

    const channel = supabase
      .channel(`call-status-${activeCall.id}-${estadoVersion}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "calls",
          filter: `id=eq.${activeCall.id}`,
        },
        (payload) => {
          const call = payload.new as Call;

          if (call.call_status === "accepted") {
            clearRingingTimer();
            setActiveCall((prev) => prev ? { ...prev, call_status: "accepted" } : prev);
          } else if (call.call_status === "declined" || call.call_status === "ended") {
            clearRingingTimer();
            setActiveCall(null);
          }
        }
      )
      .subscribe((estado) => {
        if (desmontandoEstado) return;
        if (estado === "SUBSCRIBED") { reintentoEstadoRef.current = 0; return; }
        console.warn("[Llamadas] El canal de estado de la llamada esta en:", estado, "— reintentando.");
        if (reconexionEstadoRef.current) return;
        reintentoEstadoRef.current += 1;
        const espera = Math.min(1000 * 2 ** reintentoEstadoRef.current, 15000);
        reconexionEstadoRef.current = setTimeout(() => {
          reconexionEstadoRef.current = null;
          setEstadoVersion((v) => v + 1);
        }, espera);
      });

    return () => {
      desmontandoEstado = true;
      if (reconexionEstadoRef.current) {
        clearTimeout(reconexionEstadoRef.current);
        reconexionEstadoRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [activeCall?.id, uid, clearRingingTimer, estadoVersion]); // Use activeCall.id for stable subscription

  return {
    incomingCall,
    activeCall,
    calling,
    initiateCall,
    initiateGroupCall,
    acceptCall,
    declineCall,
    endCall,
  };
}
