import { describe, expect, it, vi } from "vitest";
import { analizarCuadro, recorteDelZoom } from "@/lib/detectorDeCaras";
import { lienzoAJpegBase64 } from "@/lib/jpegSinTrabas";

// 18/11/2026: la medición de llamadas (llamada_salud → trabas) señalaba tres
// culpables propios. Estas guardas evitan que vuelvan.
const vista = Object.values(import.meta.glob("../../pages/messenger/videocall/LiveKitCallView.tsx", { query: "?raw", import: "default", eager: true }))[0] as string;
const caras = Object.values(import.meta.glob("../../hooks/useFaceWatch.ts", { query: "?raw", import: "default", eager: true }))[0] as string;
const hilo = Object.values(import.meta.glob("../../workers/detectorDeCaras.worker.ts", { query: "?raw", import: "default", eager: true }))[0] as string;
const monitor = Object.values(import.meta.glob("../../hooks/useMonitorCamara.ts", { query: "?raw", import: "default", eager: true }))[0] as string;
const escalera = Object.values(import.meta.glob("../../hooks/useArgosEscaleraClip.ts", { query: "?raw", import: "default", eager: true }))[0] as string;

describe("la vista de la llamada no rehace sus efectos en cada dibujo", () => {
  it("ninguna lista de dependencias lleva `lk` entero (es un objeto nuevo en cada dibujo)", () => {
    const listas = vista.match(/\}, \[[^\]]*\]\);/g) ?? [];
    expect(listas.length).toBeGreaterThan(10);
    const conLk = listas.filter((l) => /[[,\s]lk(?![.\w])/.test(l));
    expect(conLk).toEqual([]);
  });
  it("los permisos de la pantalla y la pantalla prestada dependen de getRoom, no de `lk`", () => {
    expect(vista).toContain("}, [pantallaSoloParaMi, salaLista, lk.getRoom, quienesVen]);");
    expect(vista).toContain("}, [pantallaPrestada, salaLista, lk.getRoom]);");
  });
});

describe("el detector de encuadre corre en un hilo aparte", () => {
  it("useFaceWatch abre un worker clásico y deja el detector aquí solo de respaldo", () => {
    expect(caras).toContain('new Worker(new URL("../workers/detectorDeCaras.worker.ts", import.meta.url))');
    expect(caras).not.toMatch(/type:\s*"module"/);
    // El detector no se llama a mano en el hilo principal: solo por analizarCuadro.
    expect(caras).not.toMatch(/detector\.detect\(/);
    expect(caras).toMatch(/createImageBitmap\(video, opciones\)/);
    expect(caras).not.toMatch(/toDataURL\(/);
  });
  it("el worker importa MediaPipe directo (un worker clásico no se parte en pedazos)", () => {
    expect(hilo).toContain('import * as vision from "@mediapipe/tasks-vision";');
    expect(hilo).not.toMatch(/import\(/);
    expect(hilo).toMatch(/completo\.close\(\)/);
  });

  const lienzo = (brillo: number) => ({
    drawImage: vi.fn(),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4).fill(brillo) }) as unknown as ImageData,
  });
  const cara = (w: number, h: number) => ({ detections: [{ boundingBox: { width: w, height: h } }] });

  it("con cara en el cuadro entero no hace la segunda pasada", () => {
    const detect = vi.fn(() => cara(40, 40));
    const r = analizarCuadro({ detect }, "completo" as never, "zoom" as never, lienzo(200), 192, 108);
    expect(detect).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ oscuro: false, hayCara: true, ratio: (40 * 40) / (192 * 108) });
  });
  it("sin cara, prueba con el zoom al centro; a oscuras lo dice", () => {
    const detect = vi.fn().mockReturnValueOnce({ detections: [] }).mockReturnValueOnce(cara(10, 10));
    const r = analizarCuadro({ detect }, "completo" as never, "zoom" as never, lienzo(5), 192, 108);
    expect(detect).toHaveBeenNthCalledWith(2, "zoom");
    expect(r.hayCara).toBe(true);
    expect(r.oscuro).toBe(true);
  });
  it("el zoom es el mismo recorte de siempre (60 % del centro)", () => {
    expect(recorteDelZoom(1000, 500)).toEqual([200, 50, 600, 300]);
  });
});

describe("las capturas de Argos no codifican el JPEG en el hilo principal", () => {
  it("toBlob en vez de toDataURL", async () => {
    const toDataURL = vi.fn(() => "data:image/jpeg;base64,xxx");
    const falso = {
      toDataURL,
      toBlob: (cb: (b: Blob | null) => void) => cb(new Blob(["hola"], { type: "image/jpeg" })),
    } as unknown as HTMLCanvasElement;
    expect(await lienzoAJpegBase64(falso, 0.6)).toBe("aG9sYQ==");
    expect(toDataURL).not.toHaveBeenCalled();
  });
  it("si toBlob no da nada, devuelve null (la ronda siguiente reintenta)", async () => {
    const falso = { toDataURL: vi.fn(), toBlob: (cb: (b: Blob | null) => void) => cb(null) } as unknown as HTMLCanvasElement;
    expect(await lienzoAJpegBase64(falso, 0.6)).toBeNull();
  });
  it("los dos capturadores usan lienzoAJpegBase64", () => {
    for (const fuente of [monitor, escalera]) {
      expect(fuente).toContain("lienzoAJpegBase64(canvas, calidad)");
      expect(fuente).not.toMatch(/toDataURL\(/);
    }
  });
});
