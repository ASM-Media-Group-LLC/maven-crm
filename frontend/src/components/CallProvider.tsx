import { createContext, useContext, useEffect, useRef } from "react";
import { escritorio } from "@/lib/escritorio";
import { traducir } from "@/lib/i18n";
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

// AudioContext COMPARTIDO para el timbre. Clave del "no suena": cuando llega una
// llamada, el que llama abre la pestaña /call (le roba el foco) y la de Maven
// queda de fondo; un AudioContext creado ahí nace "suspended" y no suena. Si en
// cambio lo creamos/desbloqueamos con un gesto MIENTRAS Maven está en primer
// plano (installRingAudioUnlock), queda "running" y suena aunque la pestaña pase
// a segundo plano.
let sharedRingCtx: AudioContext | null = null;
function getRingCtx(): AudioContext | null {
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    if (!sharedRingCtx) sharedRingCtx = new AC();
    if (sharedRingCtx.state === "suspended") void sharedRingCtx.resume().catch(() => {});
    return sharedRingCtx;
  } catch {
    return null;
  }
}
/** Desbloquea/reanuda el contexto del timbre con cualquier gesto del usuario.
 *  Se instala una vez al montar el provider. */
function installRingAudioUnlock(): () => void {
  const unlock = () => {
    getRingCtx();
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
  return () => {
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("keydown", unlock, true);
  };
}

/** Timbre "Clásico" (teléfono) con Web Audio, sin asset: dos ráfagas de un tono
 *  con trémolo (el "briiing briiing") que se repiten mientras suena. */
function Ringtone() {
  useEffect(() => {
    const ac = getRingCtx();
    if (!ac) return;
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
      // No cerramos el contexto: es compartido y queremos que siga "running"
      // para el próximo timbre. Los osciladores en vuelo se auto-detienen.
    };
  }, []);
  return null;
}

/** En la app de computador, la llamada entrante sale además en una ventanita
 *  encima de todo (desktop/src/llamada.js), aunque Maven esté escondido o la
 *  persona esté en otra app. Contestar/Rechazar desde ahí hace lo mismo que el
 *  modal. Si la llamada se corta o se contesta en otro lado, la ventanita se cierra. */
function useLlamadaEnLaApp(
  entrante: ReturnType<typeof useVideoCall>["incomingCall"],
  contestar: () => unknown,
  rechazar: () => unknown,
) {
  const acciones = useRef({ contestar, rechazar });
  acciones.current = { contestar, rechazar };
  const id = entrante?.id ?? null;
  useEffect(() => {
    const app = escritorio();
    if (!app || !entrante || !id || typeof app.llamadaEntrante !== "function") return;
    const audio = entrante.call_type === "audio";
    const clave = entrante.is_group
      ? (audio ? "messenger.incoming.entranteGrupoAudio" : "messenger.incoming.entranteGrupoVideo")
      : (audio ? "messenger.incoming.entranteAudio" : "messenger.incoming.entranteVideo");
    let vigente = true;
    void app
      .llamadaEntrante({ id, nombre: entrante.caller_name ?? traducir("messenger.incoming.desconocido"), detalle: traducir(clave) })
      .then((r) => {
        if (!vigente) return;
        if (r === "contestar") void acciones.current.contestar();
        else if (r === "rechazar") void acciones.current.rechazar();
      })
      .catch(() => {});
    return () => {
      vigente = false;
      app.terminarLlamadaEntrante(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando cambia la llamada
  }, [id]);
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const call = useVideoCall();
  // Suscribe el navegador a Web Push (llamada entrante con Maven cerrado).
  usePushSubscription();
  // Pre-desbloquea el audio del timbre con el primer gesto, así suena aunque la
  // pestaña de Maven quede de fondo cuando llega la llamada.
  useEffect(() => installRingAudioUnlock(), []);
  useLlamadaEnLaApp(call.incomingCall, call.acceptCall, call.declineCall);
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
