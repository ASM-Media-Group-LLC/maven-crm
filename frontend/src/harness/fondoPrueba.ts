// Banco de prueba del fondo (solo local, no se sube): compara el procesador
// viejo del paquete con el fondo fino sobre la cámara (falsa en Chrome headless).
import { BackgroundProcessor } from "@livekit/track-processors";
import { Track } from "livekit-client";
import { ProcesadorDeFondo, type ModeloDeFondo } from "@/lib/fondoFino/procesador";
import { RADIO_DE_BLUR } from "@/lib/fondoDeLlamada";

const q = new URLSearchParams(location.search);
const proc = q.get("proc") ?? "nuevo";
const efecto = q.get("efecto") ?? "blur";
const modelo = (q.get("modelo") ?? "selfie") as ModeloDeFondo;
const cada = Number(q.get("cada") ?? "1");
const info = document.getElementById("info")!;
const w = window as unknown as { __estado: Record<string, unknown> };
w.__estado = { listo: false };

async function main() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: Number(q.get("w") ?? 1280), height: Number(q.get("h") ?? 720), frameRate: 30 } });
  const track = stream.getVideoTracks()[0];
  const entrada = document.createElement("video");
  entrada.muted = true;
  entrada.srcObject = new MediaStream([track]);
  await entrada.play();

  const tiempos: number[] = [];
  let vistos = 0;
  const onFrameProcessed = (s: { processingTimeMs: number; segmentationTimeMs: number; filterTimeMs: number }) => {
    void s;
    if (tiempos.length > 300) tiempos.shift();
  };
  const viejoRadio: Record<string, number> = { blur: 20, "blur-strong": 64 };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let p: any;
  if (proc === "viejo") {
    p = BackgroundProcessor({ mode: "disabled", onFrameProcessed });
  } else {
    p = ProcesadorDeFondo({ mode: "disabled", modelo, cadaCuantos: cada, onFrameProcessed, fusion: q.get("fusion") === "1", mate: q.get("mate") !== "0" });
  }
  const salida = document.getElementById("salida") as HTMLVideoElement;
  if (efecto === "none") {
    salida.srcObject = stream;
  } else {
    const t0 = performance.now();
    await p.init({ kind: Track.Kind.Video, track, element: entrada });
    if (efecto.startsWith("blur")) {
      await p.switchTo({ mode: "background-blur", blurRadius: proc === "viejo" ? viejoRadio[efecto] : RADIO_DE_BLUR[efecto] });
    } else {
      await p.switchTo({ mode: "virtual-background", imagePath: `/backgrounds/${efecto}.jpg` });
    }
    w.__estado.initMs = Math.round(performance.now() - t0);
    // Tiempo REAL por cuadro (CPU + GPU): se espera a que la GPU termine.
    const gl = (p.canvas as OffscreenCanvas).getContext("webgl2") as WebGL2RenderingContext;
    const t = p.transformer;
    const orig = t.transform.bind(t);
    const px = new Uint8Array(4);
    t.transform = async (f: VideoFrame, c: TransformStreamDefaultController<VideoFrame>) => {
      const a = performance.now();
      await orig(f, c);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      if (++vistos > 30) tiempos.push(performance.now() - a);
      if (tiempos.length > 300) tiempos.shift();
    };
    salida.srcObject = new MediaStream([p.processedTrack]);
  }
  await salida.play();
  let cuadros = 0;
  const desde = performance.now();
  const contar = () => { cuadros++; salida.requestVideoFrameCallback(contar); };
  salida.requestVideoFrameCallback(contar);
  setInterval(() => {
    const prom = tiempos.length ? tiempos.reduce((a, b) => a + b, 0) / tiempos.length : 0;
    const ord = [...tiempos].sort((a, b) => a - b);
    const p95 = ord.length ? ord[Math.floor(ord.length * 0.95)] : 0;
    const med = ord.length ? ord[Math.floor(ord.length / 2)] : 0;
    const fps = cuadros / ((performance.now() - desde) / 1000);
    w.__estado = { ...w.__estado, listo: true, msProm: +prom.toFixed(2), msMed: +med.toFixed(2), msP95: +p95.toFixed(2), fps: +fps.toFixed(1), n: tiempos.length };
    info.textContent = `${proc} ${efecto} ${proc === "nuevo" ? modelo : ""} · ${med.toFixed(1)} ms/cuadro · ${fps.toFixed(1)} fps`;
  }, 500);
}

main().catch((e) => { w.__estado = { error: String(e?.stack ?? e) }; info.textContent = String(e); });
