import { describe, it, expect } from "vitest";

// Guarda del bug del 10/09: el monitor de LiveKit es quien dice quién está en
// la sala. Si la tarjeta lo desmontaba al mostrar "Sin participantes", nadie
// podía avisar después que alguien llegó (o volvió tras un corte): la sala
// quedaba vacía y sin pantalla hasta recargar el tablero.
//
// Los fuentes se leen con el glob de Vite, como los demás tests de guarda:
// con node:fs el tsconfig del front no compila el test.
const fuentes = (import.meta as unknown as {
  glob: (patrones: string[], opciones: Record<string, unknown>) => Record<string, string>;
}).glob(["/frontend/src/pages/cowork/CoworkHostDashboard.tsx", "/frontend/src/pages/cowork/CoworkRoomMonitor.tsx"], { query: "?raw", import: "default", eager: true });
const tablero = fuentes["/frontend/src/pages/cowork/CoworkHostDashboard.tsx"];
const monitor = fuentes["/frontend/src/pages/cowork/CoworkRoomMonitor.tsx"];

describe("el monitor de una sala sigue montado aunque la vea vacía", () => {
  it("la rama 'Sin participantes' monta el monitor mientras haya asignados", () => {
    // La rama se reconoce por su texto: "Sin participantes", hoy como clave del diccionario.
    const i = tablero.indexOf('t("cowork.host.noParticipants")}</span>');
    expect(i).toBeGreaterThan(0);
    expect(tablero.slice(i, i + 1200)).toContain("asignados.length > 0 && monitor(false)");
  });

  it("una reconexión de LiveKit no se lee como sala vacía", () => {
    expect(monitor).toContain("RoomEvent.Reconnecting, () => onParticipantsRef.current?.(null)");
    expect(monitor).toContain("RoomEvent.Reconnected, () => recomputeSharers()");
  });
});
