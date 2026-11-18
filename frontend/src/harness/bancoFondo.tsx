// Banco de pruebas: desenfoque de fondo (fondo fino) con la cámara del equipo.
// /harness.html?ver=fondo → arranca la cámara, le pone el blur y escribe en
// window.__fondo el resultado (para probarlo en la app de computador y en Chrome).
import { useEffect, useRef, useState } from "react";
import { createLocalVideoTrack } from "livekit-client";
import { ProcesadorDeFondo, soportaProcesadorDeFondo } from "@/lib/fondoFino/procesador";

export default function BancoFondo() {
  const ref = useRef<HTMLVideoElement>(null);
  const [estado, setEstado] = useState("arrancando");
  useEffect(() => {
    const w = window as unknown as { __fondo: Record<string, unknown> };
    w.__fondo = { soporta: soportaProcesadorDeFondo(), cuadros: 0 };
    (async () => {
      try {
        const pista = await createLocalVideoTrack({ resolution: { width: 640, height: 360, frameRate: 15 } });
        w.__fondo.camara = "ok";
        const proc = ProcesadorDeFondo({ mode: "background-blur", onFrameProcessed: () => { (w.__fondo.cuadros as number)++; } });
        const t0 = performance.now();
        await pista.setProcessor(proc);
        w.__fondo.procesador = "ok";
        w.__fondo.ms_arranque = Math.round(performance.now() - t0);
        if (ref.current) pista.attach(ref.current);
        setEstado("blur puesto");
      } catch (e) {
        w.__fondo.error = String((e as Error)?.stack || e).slice(0, 600);
        setEstado("error: " + (e as Error)?.message);
      }
    })();
  }, []);
  return (
    <div style={{ padding: 16, color: "white", background: "#111", minHeight: "100vh" }}>
      <p>{estado}</p>
      <video ref={ref} autoPlay muted playsInline style={{ width: 640, height: 360, background: "#000" }} />
    </div>
  );
}
