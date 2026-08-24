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

/** Timbre "Clásico" (teléfono) con Web Audio, sin asset: dos ráfagas de un tono
 *  con trémolo (el "briiing briiing") que se repiten mientras suena. */
function Ringtone() {
  useEffect(() => {
    const AC = window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ac = new AC();
    // Si el navegador lo tiene suspendido (sin gesto previo), intentamos
    // reanudarlo; si igual no deja, el modal visual queda como respaldo.
    ac.resume?.().catch(() => {});
    const master = ac.createGain();
    master.gain.value = 0.9;
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 7000;
    master.connect(lp).connect(ac.destination);
    let timer: number | undefined;
    let stopped = false;

    // Una ráfaga: dos triángulos levemente detonados con un LFO de 18 Hz sobre
    // el volumen → el "warble" característico del timbre de teléfono.
    const warble = (t0: number, dur: number) => {
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.02);
      g.gain.setValueAtTime(0.22, t0 + dur - 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      const lfo = ac.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 18;
      const lg = ac.createGain();
      lg.gain.value = 0.16;
      lfo.connect(lg).connect(g.gain);
      [440, 462].forEach((f) => {
        const o = ac.createOscillator();
        o.type = "triangle";
        o.frequency.value = f;
        o.connect(g);
        o.start(t0);
        o.stop(t0 + dur + 0.03);
      });
      g.connect(master);
      lfo.start(t0);
      lfo.stop(t0 + dur + 0.03);
    };

    const cycle = () => {
      if (stopped) return;
      const t = ac.currentTime + 0.03;
      warble(t, 0.4);
      warble(t + 0.6, 0.4);
      timer = window.setTimeout(cycle, 2000);
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
