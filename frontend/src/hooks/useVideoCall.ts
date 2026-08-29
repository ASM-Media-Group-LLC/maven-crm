import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

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
      // llamada viva (últimos 40s) en esta conversación.
      const since = new Date(Date.now() - 40_000).toISOString();
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
        window.open(`/call/${encodeURIComponent(roomId)}`, `call-${roomId}`, "noopener");
        return;
      }

      // (b) Yo ya tengo una llamada viva en esta conversación → solo reabro la
      // sala, no duplico.
      const mine = live.find((c) => c.caller_id === user.id);
      if (mine) {
        setActiveCall(mine);
        setCalling(false);
        window.open(`/call/${encodeURIComponent(roomId)}?admin=1`, `call-${roomId}`, "noopener");
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

      // Open call in new tab
      window.open(`/call/${encodeURIComponent(roomId)}?admin=1`, `call-${roomId}`, "noopener");

      // Push al receptor: si tiene Maven cerrado o en otra pestaña, igual le
      // suena. Best-effort — el modal in-app cubre "Maven abierto".
      void supabase.functions
        .invoke("web-push", { body: { action: "notify_call", callId: call.id } })
        .catch(() => {});

      // Auto-end after 30s if no answer
      clearRingingTimer();
      ringingTimerRef.current = setTimeout(async () => {
        await (supabase.from("calls") as any)
          .update({ call_status: "ended", end_time: new Date().toISOString() })
          .eq("id", call.id)
          .eq("call_status", "ringing");

        setActiveCall(null);
      }, 30_000);
    },
    [user, clearRingingTimer]
  );

  // ── Accept call ──────────────────────────────────────────────────
  const acceptCall = useCallback(async () => {
    if (!incomingCall || !user) return;

    await (supabase.from("calls") as any)
      .update({ call_status: "accepted", start_time: new Date().toISOString() })
      .eq("id", incomingCall.id);

    await (supabase.from("call_participants") as any)
      .update({ status: "accepted" })
      .eq("call_id", incomingCall.id)
      .eq("user_id", user.id);

    setActiveCall(incomingCall);
    setIncomingCall(null);

    // Open call in new tab
    window.open(
      `/call/${encodeURIComponent(incomingCall.room_id)}`,
      `call-${incomingCall.room_id}`,
      "noopener"
    );
  }, [incomingCall, user]);

  // ── Decline call ─────────────────────────────────────────────────
  const declineCall = useCallback(async () => {
    if (!incomingCall || !user) return;

    await (supabase.from("calls") as any)
      .update({ call_status: "declined", end_time: new Date().toISOString() })
      .eq("id", incomingCall.id);

    setIncomingCall(null);
  }, [incomingCall, user]);

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
    if (!user) return;

    // Initial check for any ringing calls
    const checkIncoming = async () => {
      const { data: directCalls } = await (supabase
        .from("calls") as any)
        .select("*")
        .eq("receiver_id", user.id)
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

    checkIncoming();

    // Subscribe to realtime changes on calls table for this user
    const channel = supabase
      .channel(`incoming-calls-${user.id}-${canalVersion}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "calls",
          filter: `receiver_id=eq.${user.id}`,
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
      // Si el canal no queda SUBSCRIBED, el timbre no suena y hasta ahora eso no
      // dejaba ni una linea en consola: se veia igual que "me llamaron y no me
      // llego". Un fallo silencioso en el timbre es el peor de todos, porque el
      // que no lo escucha no sabe que hubo algo que escuchar.
      .subscribe((estado) => {
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
      if (reconexionCanalRef.current) {
        clearTimeout(reconexionCanalRef.current);
        reconexionCanalRef.current = null;
      }
      supabase.removeChannel(channel);
    };
    // `canalVersion` en las dependencias es LO QUE HACE que el reintento ocurra:
    // al subirlo, el efecto se rehace y abre un canal con nombre nuevo.
  }, [user, canalVersion]);

  // ── Realtime active call status tracking ───────────────────────
  useEffect(() => {
    if (!activeCall || !user) return;

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
      if (reconexionEstadoRef.current) {
        clearTimeout(reconexionEstadoRef.current);
        reconexionEstadoRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [activeCall?.id, user, clearRingingTimer, estadoVersion]); // Use activeCall.id for stable subscription

  return {
    incomingCall,
    activeCall,
    calling,
    initiateCall,
    acceptCall,
    declineCall,
    endCall,
  };
}
