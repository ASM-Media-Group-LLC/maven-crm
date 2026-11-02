import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useMonitorEstado } from "@/hooks/useMonitorEstado";
import { useFaceWatch } from "@/hooks/useFaceWatch";
import { useMonitorCamara } from "@/hooks/useMonitorCamara";
import { useGrabadorClips } from "@/hooks/useGrabadorClips";

// ARGOS VIGILANTE — el monitor a nivel de TODA la app, independiente de LiveKit
// (modelo Hubstaff). Mientras la persona esté logueada en Maven y el admin tenga
// la vigilancia-app encendida, Argos prende SU PROPIA cámara (getUserMedia, sin
// la sala de video) y reusa toda la maquinaria que ya existe: el detector de
// cara (useFaceWatch) + el registro de faltas y el latido del rondín + el ojo de
// IA (useMonitorCamara). Así Argos vigila aunque Cowork/LiveKit esté caído.
//
// Gates (todo tiene que ser verdad): logueado · NO admin · monitor activo
// (interruptor maestro) · vigilancia-app encendida (interruptor de arranque,
// off por defecto). useMonitorCamara vuelve a validar admin/activo del lado del
// hook, así que esto queda doblemente protegido.

export interface EstadoVigilante {
  /** Está vigilando de verdad (hay cámara viva). */
  vigilando: boolean;
  /** Debe vigilar pero la persona no dio permiso de cámara. */
  permisoNegado: boolean;
  /** La config pide vigilar a esta persona (aunque falte el permiso). */
  debeVigilar: boolean;
}

export function useArgosVigilante(): EstadoVigilante {
  const { user } = useAuth();
  const { esAdmin, activo, vigilanciaApp } = useMonitorEstado(!!user);
  const debeVigilar = !!user && esAdmin === false && activo === true && vigilanciaApp === true;

  const [track, setTrack] = useState<MediaStreamTrack | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [permisoNegado, setPermisoNegado] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  // Prende/apaga la cámara propia según la config. Al apagar, suelta el stream
  // (se apaga la lucecita de la cámara) — importante para la confianza de la gente.
  // Pide también MICRÓFONO (para los clips con audio). Si lo niegan, reintenta solo
  // cámara: las fotos/faltas siguen; el clip saldría sin audio.
  useEffect(() => {
    const apagar = () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setTrack(null);
      setStream(null);
    };
    if (!debeVigilar || typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      apagar();
      return;
    }
    let vivo = true;
    const video = { width: { ideal: 640 }, height: { ideal: 480 } };
    const pedir = async (): Promise<MediaStream> => {
      try {
        return await navigator.mediaDevices.getUserMedia({ video, audio: true });
      } catch {
        // Negó el micrófono (o no hay): al menos la cámara, para no perder la vigilancia.
        return await navigator.mediaDevices.getUserMedia({ video, audio: false });
      }
    };
    void (async () => {
      try {
        const s = await pedir();
        if (!vivo) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        setStream(s);
        setTrack(s.getVideoTracks()[0] ?? null);
        setPermisoNegado(false);
      } catch {
        if (vivo) { setPermisoNegado(true); setTrack(null); setStream(null); }
      }
    })();
    return () => { vivo = false; apagar(); };
  }, [debeVigilar]);

  // El detector de cara corre sobre la cámara propia; el monitor registra faltas,
  // deja el latido del rondín y pasa el ojo de IA. roomNombre "maven" = vigilancia
  // de app (no una sala de Cowork puntual).
  const faceWatch = useFaceWatch(track, debeVigilar && !!track);
  useMonitorCamara({ track, camaraRealOn: !!track, faceWatch, activo: debeVigilar, roomNombre: "maven" });
  // Clips de video: graba cuando la persona deja de mirar la cámara (se distrae).
  useGrabadorClips({ stream, faceWatch, activo: debeVigilar, roomNombre: "maven" });

  return { vigilando: debeVigilar && !!track, permisoNegado, debeVigilar };
}
