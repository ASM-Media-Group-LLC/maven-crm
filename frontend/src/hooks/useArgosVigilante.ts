import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useMonitorEstado } from "@/hooks/useMonitorEstado";
import { useFaceWatch } from "@/hooks/useFaceWatch";
import { useMonitorCamara } from "@/hooks/useMonitorCamara";

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
  const [permisoNegado, setPermisoNegado] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  // Prende/apaga la cámara propia según la config. Al apagar, suelta el stream
  // (se apaga la lucecita de la cámara) — importante para la confianza de la gente.
  useEffect(() => {
    const apagar = () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setTrack(null);
    };
    if (!debeVigilar || typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      apagar();
      return;
    }
    let vivo = true;
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (!vivo) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        setTrack(stream.getVideoTracks()[0] ?? null);
        setPermisoNegado(false);
      } catch {
        if (vivo) { setPermisoNegado(true); setTrack(null); }
      }
    })();
    return () => { vivo = false; apagar(); };
  }, [debeVigilar]);

  // El detector de cara corre sobre la cámara propia; el monitor registra faltas,
  // deja el latido del rondín y pasa el ojo de IA. roomNombre "maven" = vigilancia
  // de app (no una sala de Cowork puntual).
  const faceWatch = useFaceWatch(track, debeVigilar && !!track);
  useMonitorCamara({ track, camaraRealOn: !!track, faceWatch, activo: debeVigilar, roomNombre: "maven" });

  return { vigilando: debeVigilar && !!track, permisoNegado, debeVigilar };
}
