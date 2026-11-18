// UNA SOLA PANTALLA (Alvaro, 16/11/2026): el supervisor (anfitrión vigilado)
// comparte UNA pantalla —la del Supervisor Hub— y el tablero la reenvía a las
// salas. Desde el 18/11 puede mandarla a una, varias o todas las salas (también
// «Pantalla a todas»); la segunda captura sigue sin abrirse si su pantalla del
// Hub es obligatoria. Ver también pantallaDeAnfitriones.test.ts.
import { describe, it, expect, vi } from "vitest";
import { fijarPantallaDelHub, pantallaDelHub, suscribirPantallaDelHub } from "@/lib/pantallaDelHub";

const fuentes = (import.meta as unknown as {
  glob: (p: string, o: Record<string, unknown>) => Record<string, string>;
}).glob("/frontend/src/pages/cowork/CoworkHostDashboard.tsx", { query: "?raw", import: "default", eager: true });
const tablero = Object.values(fuentes)[0] ?? "";
const fuentesLlamada = (import.meta as unknown as {
  glob: (p: string, o: Record<string, unknown>) => Record<string, string>;
}).glob("/frontend/src/pages/messenger/videocall/LiveKitCallView.tsx", { query: "?raw", import: "default", eager: true });
const llamada = Object.values(fuentesLlamada)[0] ?? "";

describe("la pantalla del Hub", () => {
  it("avisa a quien escucha y se olvida al soltarla", () => {
    const pista = { id: "pantalla" } as unknown as MediaStreamTrack;
    const oyente = vi.fn();
    const baja = suscribirPantallaDelHub(oyente);
    fijarPantallaDelHub(pista);
    expect(pantallaDelHub()).toBe(pista);
    expect(oyente).toHaveBeenCalledWith(pista);
    fijarPantallaDelHub(pista);
    expect(oyente).toHaveBeenCalledTimes(1);
    fijarPantallaDelHub(null);
    expect(pantallaDelHub()).toBeNull();
    baja();
    fijarPantallaDelHub(pista);
    expect(oyente).toHaveBeenCalledTimes(2);
    fijarPantallaDelHub(null);
  });
});

describe("el tablero del supervisor no abre otra pantalla", () => {
  it("se leyó el tablero", () => {
    expect(tablero.length).toBeGreaterThan(1000);
  });
  it("la captura propia del tablero no corre para el supervisor con la del Hub obligatoria", () => {
    expect(tablero).toMatch(/if \(!screenArmed \|\| !capturaAparte\) return;/);
    expect(tablero).toContain("const capturaAparte = !usaPantallaDelHub || (!pantallaHub && !pantallaObligatoria);");
  });
  it("las salas reciben la pantalla única, no una captura aparte", () => {
    expect(tablero).not.toMatch(/screenBaseTrack=\{screenBaseTrack\}/);
    expect(tablero).toMatch(/screenBaseTrack=\{baseDePantalla\}/);
  });
  it("el Hub le pasa su pantalla al tablero", () => {
    expect(tablero).toMatch(/onLocalScreenTrack: fijarPantallaDelHub/);
  });
  it("«Pantalla a todas» para todos, y dentro de la sala la del Hub en vez de un segundo compartir", () => {
    expect(tablero).not.toMatch(/\{!unaSolaPantalla && \(/);
    expect(tablero).toMatch(/hideScreenShare=\{usaPantallaDelHub && !activeMeetId\}/);
    expect(tablero).toMatch(/pantallaPrestada=\{usaPantallaDelHub && !activeMeetId/);
  });
});

// SIN HUECOS (Alvaro, 16/11/2026: «esto es el monitoreo y punto»).
describe("el supervisor no se escapa de Argos", () => {
  it("se leyó la llamada", () => {
    expect(llamada.length).toBeGreaterThan(1000);
  });
  it("en el Hub nadie ve su pantalla: solo la sala donde habla", () => {
    expect(tablero).toMatch(/pantallaSoloParaMi: vigilarAnfitrion/);
    expect(llamada).toMatch(/setTrackSubscriptionPermissions\(false,/);
  });
  it("entrar a una sala no calla a Argos", () => {
    expect(tablero).toMatch(/sinLatidoDeLlamada=\{usaPantallaDelHub\}/);
    expect(llamada).toMatch(/if \(supervisorEncuadre \|\| sinLatidoDeLlamada\) return;/);
  });
  it("no se le pide pantalla en cada sala", () => {
    expect(tablero).not.toMatch(/unaPantalla\.faltaHub/);
  });
});

// PANTALLA PARA SU TRABAJO (Alvaro, 17/11/2026): al darle «Hablar» o entrar a
// una sala, la pantalla del supervisor NO se manda sola; solo si él toca el botón.
describe("la pantalla del supervisor no se manda sola a la sala", () => {
  it("«Hablar» ya no arrastra la pantalla", () => {
    expect(tablero).not.toMatch(/setRoomScreen\(destino/);
    expect(tablero).not.toMatch(/pilaHablar/);
  });
  it("el botón de pantalla de cada sala sigue (si él quiere) y no apaga las otras", () => {
    expect(tablero).toContain("onClick={() => setRoomScreen((m) => ({ ...m, [room.id]: !(m[room.id] ?? false) }))}");
  });
});
