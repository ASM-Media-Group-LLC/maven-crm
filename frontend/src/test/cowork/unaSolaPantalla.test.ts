// UNA SOLA PANTALLA (Alvaro, 16/11/2026): el supervisor (anfitrión que no es
// admin ni dueño) comparte UNA pantalla —la del Supervisor Hub— y el tablero la
// reenvía solo a la sala donde habla. Estas guardas frenan que vuelva la segunda
// captura o el «Pantalla a todas» para ellos.
import { describe, it, expect, vi } from "vitest";
import { fijarPantallaDelHub, pantallaDelHub, suscribirPantallaDelHub } from "@/lib/pantallaDelHub";

const fuentes = (import.meta as unknown as {
  glob: (p: string, o: Record<string, unknown>) => Record<string, string>;
}).glob("/frontend/src/pages/cowork/CoworkHostDashboard.tsx", { query: "?raw", import: "default", eager: true });
const tablero = Object.values(fuentes)[0] ?? "";

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
  it("la captura propia del tablero no corre para el supervisor", () => {
    expect(tablero).toMatch(/if \(!screenArmed \|\| unaSolaPantalla\) return;/);
  });
  it("las salas reciben la pantalla única, no una captura aparte", () => {
    expect(tablero).not.toMatch(/screenBaseTrack=\{screenBaseTrack\}/);
    expect(tablero).toMatch(/screenBaseTrack=\{baseDePantalla\}/);
  });
  it("el Hub le pasa su pantalla al tablero", () => {
    expect(tablero).toMatch(/onLocalScreenTrack: fijarPantallaDelHub/);
  });
  it("sin «Pantalla a todas» y sin segundo compartir dentro de la sala", () => {
    expect(tablero).toMatch(/\{!unaSolaPantalla && \(/);
    expect(tablero).toMatch(/hideScreenShare=\{unaSolaPantalla && !activeMeetId\}/);
  });
});
