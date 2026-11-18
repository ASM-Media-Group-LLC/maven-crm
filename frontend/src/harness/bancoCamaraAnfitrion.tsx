// Banco de pruebas: la cámara del ANFITRIÓN de Cowork con el fondo difuminado
// (18/11/2026). /harness.html?ver=camara-anfitrion
//
// Recorre el mismo camino que el tablero (CoworkHostDashboard):
//   1. guarda «blur» como fondo elegido y lo lee con leerFondoGuardado();
//   2. toma la cámara cruda con getUserMedia (960×540 a 15, como el tablero);
//   3. la pasa por crearCamaraDelAnfitrion y le aplica el fondo;
//   4. hace un CLON de la salida, como cada sala en CoworkRoomMonitor, y lo mira;
//   5. quita y vuelve a poner el difuminado en vivo (la salida no cambia);
//   6. apaga todo y revisa que las pistas queden paradas.
// Escribe el resultado en window.__camaraAnfitrion. La nitidez mide cuánto
// detalle tiene el clon: con el fondo difuminado baja mucho.
import { useEffect, useRef, useState } from "react";
import { crearCamaraDelAnfitrion } from "@/lib/camaraDelAnfitrion";
import { guardarFondo, leerFondoGuardado } from "@/lib/fondoDeLlamada";
import { soportaProcesadorDeFondo } from "@/lib/fondoFino/procesador";

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Píxeles con borde marcado, por cada mil (más alto = más detalle). El
 *  desenfoque borra los bordes: con el fondo difuminado este número cae. */
function nitidez(video: HTMLVideoElement, lienzo: HTMLCanvasElement): number {
  const ctx = lienzo.getContext("2d", { willReadFrequently: true });
  if (!ctx || !video.videoWidth) return -1;
  lienzo.width = 320;
  lienzo.height = 180;
  ctx.drawImage(video, 0, 0, 320, 180);
  const { data } = ctx.getImageData(0, 0, 320, 180);
  let bordes = 0;
  for (let y = 0; y < 180; y++) {
    for (let x = 1; x < 320; x++) {
      const i = (y * 320 + x) * 4;
      const d = Math.abs(data[i] - data[i - 4]) + Math.abs(data[i + 1] - data[i - 3]) + Math.abs(data[i + 2] - data[i - 2]);
      if (d > 40) bordes++;
    }
  }
  return Math.round((bordes / (320 * 180)) * 1000);
}

export default function BancoCamaraAnfitrion() {
  const crudaRef = useRef<HTMLVideoElement>(null);
  const salaRef = useRef<HTMLVideoElement>(null);
  const lienzoRef = useRef<HTMLCanvasElement>(null);
  const [estado, setEstado] = useState("arrancando");

  useEffect(() => {
    const w = window as unknown as { __camaraAnfitrion: Record<string, unknown> };
    const r: Record<string, unknown> = { soporta: soportaProcesadorDeFondo(), cuadrosProcesados: 0, cuadrosEnLaSala: 0 };
    w.__camaraAnfitrion = r;
    let vivo = true;
    (async () => {
      try {
        guardarFondo("blur");
        const efecto = leerFondoGuardado();
        r.efectoGuardado = efecto;
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 960 }, height: { ideal: 540 }, frameRate: { ideal: 15, max: 15 } },
        });
        const cruda = stream.getVideoTracks()[0];
        if (crudaRef.current) crudaRef.current.srcObject = new MediaStream([cruda]);
        const camara = crearCamaraDelAnfitrion(cruda, {
          alPrimeraCarga: () => { r.primeraCarga = true; },
          alCaerse: () => { r.seCayo = true; },
          alProcesarCuadro: () => { (r.cuadrosProcesados as number)++; },
        });
        const t0 = performance.now();
        r.resultado = await camara.aplicar(efecto);
        r.msEnganche = Math.round(performance.now() - t0);
        const salida = camara.salida();
        r.salidaEsProcesada = salida !== cruda;

        // Lo que hace cada sala: publicar un clon de la pista base.
        const clon = salida.clone();
        const sala = salaRef.current!;
        sala.srcObject = new MediaStream([clon]);
        await sala.play().catch(() => undefined);
        const contar = () => {
          if (!vivo) return;
          (r.cuadrosEnLaSala as number)++;
          sala.requestVideoFrameCallback(contar);
        };
        sala.requestVideoFrameCallback(contar);
        setEstado(`fondo: ${String(r.resultado)}`);

        r.fase = "blur";
        await espera(3000);
        r.nitidezCruda = nitidez(crudaRef.current!, lienzoRef.current!);
        r.nitidezConBlur = nitidez(sala, lienzoRef.current!);
        r.cuadrosAntesDeQuitar = r.cuadrosProcesados;

        // Quitar en vivo: la salida es la MISMA pista (las salas no re-publican).
        r.resultadoQuitar = await camara.aplicar("none");
        r.mismaSalidaAlQuitar = camara.salida() === salida;
        r.fase = "sin-blur";
        await espera(3000);
        r.nitidezSinBlur = nitidez(sala, lienzoRef.current!);
        r.cuadrosSalaSinBlur = r.cuadrosEnLaSala;

        // Volver a poner en vivo.
        r.resultadoVolver = await camara.aplicar("blur");
        r.mismaSalidaAlVolver = camara.salida() === salida;
        r.fase = "blur-otra-vez";
        await espera(3000);
        r.nitidezOtraVezBlur = nitidez(sala, lienzoRef.current!);

        // Apagar: todo parado.
        r.fase = "apagado";
        await camara.destruir();
        clon.stop();
        r.crudaTrasApagar = cruda.readyState;
        r.procesadaTrasApagar = salida.readyState;
        r.listo = true;
        setEstado("listo");
      } catch (e) {
        r.error = String((e as Error)?.stack || e).slice(0, 600);
        setEstado("error: " + (e as Error)?.message);
      }
    })();
    return () => { vivo = false; };
  }, []);

  return (
    <div style={{ padding: 16, color: "white", background: "#111", minHeight: "100vh" }}>
      <p>{estado}</p>
      <div style={{ display: "flex", gap: 8 }}>
        <video ref={crudaRef} autoPlay muted playsInline style={{ width: 480, height: 270, background: "#000" }} />
        <video ref={salaRef} autoPlay muted playsInline style={{ width: 480, height: 270, background: "#000" }} />
      </div>
      <canvas ref={lienzoRef} style={{ display: "none" }} />
    </div>
  );
}
