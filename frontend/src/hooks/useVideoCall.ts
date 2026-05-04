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
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [calling, setCalling] = useState(false);
  const ringingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      .channel(`incoming-calls-${user.id}`)
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
          if (call.call_status !== "ringing") return;

          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", call.caller_id)
            .single();

          setIncomingCall({
            ...call,
            caller_name: profile?.full_name ?? "Usuario",
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]); // Removed incomingCall/activeCall from deps to avoid re-subscription churn

  // ── Realtime active call status tracking ───────────────────────
  useEffect(() => {
    if (!activeCall || !user) return;

    const channel = supabase
      .channel(`call-status-${activeCall.id}`)
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeCall?.id, user, clearRingingTimer]); // Use activeCall.id for stable subscription

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
