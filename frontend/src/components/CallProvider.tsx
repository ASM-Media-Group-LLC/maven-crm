import { createContext, useContext, useEffect } from "react";
import { useVideoCall } from "@/hooks/useVideoCall";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import IncomingCallModal from "@/pages/messenger/components/IncomingCallModal";

// Sistema de llamadas GLOBAL. Antes vivía dentro de MessengerPage, así que una
// llamada entrante solo sonaba si el otro estaba parado en el tab de Messenger.
// Montado acá (envuelve todo el AppShell) el timbre y el modal aparecen estés
// en la sección de Maven que estés — como WhatsApp.
//
// (La notificación con Maven CERRADO o en otra pestaña del navegador es otra
// etapa: necesita push por service worker.)

type CallCtx = ReturnType<typeof useVideoCall>;
const CallContext = createContext<CallCtx | null>(null);

/** Timbre tipo WhatsApp con Web Audio (sin asset): un par de tonos que se
 *  repite mientras suena. */
function Ringtone() {
  useEffect(() => {
    const AC = window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ac = new AC();
    // Si el navegador lo tiene suspendido (sin gesto previo), intentamos
    // reanudarlo; si igual no deja, el modal visual queda como respaldo.
    ac.resume?.().catch(() => {});
    let timer: number | undefined;
    let stopped = false;

    const beep = (freq: number, at: number, dur: number) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.connect(gain).connect(ac.destination);
      osc.start(at);
      osc.stop(at + dur);
    };

    const cycle = () => {
      if (stopped) return;
      const t = ac.currentTime;
      beep(480, t, 0.4);
      beep(620, t + 0.5, 0.4);
      timer = window.setTimeout(cycle, 2400);
    };
    cycle();

    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      ac.close().catch(() => {});
    };
  }, []);
  return null;
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const call = useVideoCall();
  // Suscribe el navegador a Web Push (llamada entrante con Maven cerrado).
  usePushSubscription();
  return (
    <CallContext.Provider value={call}>
      {children}
      {call.incomingCall && (
        <>
          <IncomingCallModal
            call={call.incomingCall}
            onAccept={call.acceptCall}
            onDecline={call.declineCall}
          />
          <Ringtone />
        </>
      )}
    </CallContext.Provider>
  );
}

export function useCall(): CallCtx {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall debe usarse dentro de <CallProvider>");
  return ctx;
}
