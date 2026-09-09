import { useEffect, useRef } from "react";

// Adjunta un track de audio remoto a un <audio> oculto. `muted` corta la
// reproducción sin desconectar (así el 🔊 por sala es instantáneo).
//
// ⚠️ El `muted` del elemento NO es nuestro del todo. livekit-client (2.17) lo
// pisa por su cuenta: cuando la persona de la sala desmutea su micro, el SDK
// vuelve a hacer `attachToElement` sobre este <audio> y termina con
// `element.muted = (sin pistas de audio)`, o sea `false`. Resultado (Jhon,
// 08/09): una sala "Silenciada" volvía a sonar al rato —cada vez que alguien
// prendía el micro, y desde #1711 eso pasa en cada vuelta de pausa—. React no
// se enteraba porque solo escribía `muted` cuando cambiaba la prop.
//
// Defensa doble: se reafirma tras cada attach y, además, se escucha
// `volumechange` (se dispara al cambiar `muted`) para reponer lo nuestro si
// cualquier otro lo toca.
type TrackAdjuntable = { attach: (el: HTMLMediaElement) => unknown; detach: () => unknown };

export default function AudioSink({ track, muted }: { track: TrackAdjuntable | null | undefined; muted: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  useEffect(() => {
    const el = ref.current;
    if (el && track) {
      try { track.attach(el); } catch { /* noop */ }
      el.muted = mutedRef.current;
    }
    return () => { try { track?.detach(); } catch { /* noop */ } };
  }, [track]);

  useEffect(() => { if (ref.current) ref.current.muted = muted; }, [muted]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reponer = () => {
      if (el.muted !== mutedRef.current) el.muted = mutedRef.current;
    };
    el.addEventListener("volumechange", reponer);
    return () => el.removeEventListener("volumechange", reponer);
  }, []);

  return <audio ref={ref} autoPlay data-testid="audio-sink" />;
}
