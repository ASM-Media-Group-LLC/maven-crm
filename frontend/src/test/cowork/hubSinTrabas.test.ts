import { describe, expect, it } from "vitest";
import { conLista, mismoRelojMostrado, registroEstable } from "@/lib/presenciaEstable";
import { audioDeMonitores, prestarAudioDeMonitores } from "@/lib/audioDeMonitores";

// 19/11/2026: la medición de llamadas (llamada_salud → trabas) del Supervisor Hub
// señalaba cuatro culpables. Estas guardas evitan que vuelvan. Ninguno toca la
// calidad: el video, las salas y los recuadros son los mismos.
const presencia = Object.values(import.meta.glob("../../hooks/useCoworkMediaPresence.ts", { query: "?raw", import: "default", eager: true }))[0] as string;
const tablero = Object.values(import.meta.glob("../../pages/cowork/CoworkHostDashboard.tsx", { query: "?raw", import: "default", eager: true }))[0] as string;
const monitorDeSala = Object.values(import.meta.glob("../../pages/cowork/CoworkRoomMonitor.tsx", { query: "?raw", import: "default", eager: true }))[0] as string;
const vista = Object.values(import.meta.glob("../../pages/messenger/videocall/LiveKitCallView.tsx", { query: "?raw", import: "default", eager: true }))[0] as string;
const negra = Object.values(import.meta.glob("../../lib/pantallaNegra.ts", { query: "?raw", import: "default", eager: true }))[0] as string;
const camara = Object.values(import.meta.glob("../../hooks/useMonitorCamara.ts", { query: "?raw", import: "default", eager: true }))[0] as string;

describe("1. el motor de React («vendor-radix.js:B»): el Hub no se redibuja si nada cambió", () => {
  const persona = { micOn: true, camOn: true, relojEstado: "activo", relojSegundosHoy: 100, relojEn: 1_000_000 };

  it("la misma presencia devuelve el MISMO registro (React no redibuja)", () => {
    const antes = { a: persona, b: { ...persona, camOn: false } };
    const nuevo = { a: { ...persona }, b: { ...persona, camOn: false } };
    expect(registroEstable(antes, nuevo)).toBe(antes);
  });

  it("el reloj se compara por lo que MUESTRA: un latido que solo avanza la hora no redibuja", () => {
    // 10 s después el servidor dice 110 s: es lo mismo que ya iba a mostrar.
    const latido = { ...persona, relojSegundosHoy: 110, relojEn: 1_010_000 };
    expect(mismoRelojMostrado(persona, latido)).toBe(true);
    const antes = { a: persona };
    expect(registroEstable(antes, { a: latido })).toBe(antes);
    // Si el número cambia de verdad (le descontaron), sí se redibuja.
    expect(mismoRelojMostrado(persona, { ...latido, relojSegundosHoy: 104 })).toBe(false);
    // Detenido: la hora no importa, solo el número.
    const enPausa = { ...persona, relojEstado: "pausa" };
    expect(mismoRelojMostrado(enPausa, { ...enPausa, relojEn: 2_000_000 })).toBe(true);
    expect(mismoRelojMostrado(enPausa, { ...enPausa, relojSegundosHoy: 101 })).toBe(false);
  });

  it("lo que cambió se ve: persona nueva, persona que se va, campo distinto", () => {
    const antes = { a: persona };
    const conOtro = registroEstable(antes, { a: { ...persona }, b: persona });
    expect(conOtro).not.toBe(antes);
    expect(conOtro.a).toBe(persona); // la que no cambió conserva su objeto
    expect(registroEstable(antes, {})).not.toBe(antes);
    const cambio = registroEstable(antes, { a: { ...persona, micOn: false } });
    expect(cambio.a.micOn).toBe(false);
    // Valores sueltos (estado de supervisores).
    const sups = { x: "break" as string | null };
    expect(registroEstable(sups, { x: "break" })).toBe(sups);
    expect(registroEstable(sups, { x: null })).toEqual({ x: null });
  });

  it("la presencia usa el registro estable en los tres estados", () => {
    expect(presencia).toContain("setMediaStates((antes) => registroEstable(antes, estados))");
    expect(presencia).toContain("setSupervisores((antes) => registroEstable(antes, sups))");
    expect(presencia).toContain("setSupervisoresDesde((antes) => registroEstable(antes, desdes))");
    expect(presencia).not.toMatch(/setMediaStates\(leerEstados/);
  });

  it("quién habla / comparte / está en cada sala: la misma lista no redibuja el tablero", () => {
    const reg = { s1: ["Ana"] };
    expect(conLista(reg, "s1", ["Ana"])).toBe(reg);
    expect(conLista(reg, "s1", ["Ana", "Luis"])).toEqual({ s1: ["Ana", "Luis"] });
    expect(conLista(reg, "s2", [])).toEqual({ s1: ["Ana"], s2: [] });
    const nulo: Record<string, string[] | null> = { s1: null };
    expect(conLista(nulo, "s1", null)).toBe(nulo);
    expect(conLista(nulo, "s1", [])).toEqual({ s1: [] });
    expect(tablero).toContain("setRoomSpeakers((m) => conLista(m, roomId, names))");
    expect(tablero).toContain("setRoomSharerIds((m) => conLista(m, roomId, ids ?? []))");
    expect(tablero).toContain("setRoomConectados((m) => conLista(m, roomId, ids))");
  });

  it("la llamada no se redibuja entera por el pantallazo ni por la gracia de la pantalla", () => {
    // El pantallazo llega por un store (dibujo inmediato): vive en su componente.
    expect(vista).not.toContain("useUltimoPantallazo");
    expect(vista).toContain("<MonitoreoActivo />");
    // Nada de relojes de pocos segundos que redibujen la llamada entera.
    expect(vista).not.toMatch(/setInterval\(\(\) => setAhora\w*\(Date\.now\(\)\), \d/);
  });
});

describe("2. «index.js:o»: la pantalla en negro se mide sin bajar el cuadro entero", () => {
  it("se reduce con createImageBitmap antes de leer los píxeles", () => {
    expect(negra).toMatch(/createImageBitmap\(video, \{ resizeWidth: canvas\.width, resizeHeight: canvas\.height/);
    expect(negra).toContain("cuadro.close()");
  });
});

describe("3. «TimerHandler:setInterval»: la huella del pantallazo no baja la imagen entera", () => {
  it("la huella se saca de la imagen ya reducida (huellaSinTrabas)", () => {
    expect(camara).toContain("huellaSinTrabas(canvas)");
    expect(camara).not.toContain("huellaDeCanvas(canvas)");
  });
});

describe("4. «Response.json.then»: un solo AudioContext para todas las salas del Hub", () => {
  it("cada Room de monitor recibe el AudioContext compartido antes de conectar", () => {
    const i = monitorDeSala.indexOf("prestarAudioDeMonitores(room)");
    expect(i).toBeGreaterThan(-1);
    expect(i).toBeLessThan(monitorDeSala.indexOf("room.connect("));
  });

  it("se presta uno solo, y livekit no lo puede cerrar al colgar", async () => {
    class FalsoAudioContext {
      state = "running";
      async close() { this.state = "closed"; }
      async resume() { /* noop */ }
    }
    const w = window as unknown as { AudioContext?: unknown };
    const original = w.AudioContext;
    w.AudioContext = FalsoAudioContext;
    try {
      const a: { audioContext?: AudioContext } = {};
      const b: { audioContext?: AudioContext } = {};
      prestarAudioDeMonitores(a);
      prestarAudioDeMonitores(b);
      expect(a.audioContext).toBeDefined();
      expect(a.audioContext).toBe(b.audioContext);
      await a.audioContext!.close();
      expect(a.audioContext!.state).toBe("running");
      expect(audioDeMonitores()).toBe(a.audioContext);
    } finally {
      w.AudioContext = original;
    }
  });
});
