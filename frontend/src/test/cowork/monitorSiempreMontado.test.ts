import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Guarda del bug del 10/09: el monitor de LiveKit es quien dice quién está en
// la sala. Si la tarjeta lo desmontaba al mostrar "Sin participantes", nadie
// podía avisar después que alguien llegó (o volvió tras un corte): la sala
// quedaba vacía y sin pantalla hasta recargar el tablero.
describe("el monitor de una sala sigue montado aunque la vea vacía", () => {
  const src = readFileSync(resolve(__dirname, "../../pages/cowork/CoworkHostDashboard.tsx"), "utf8");

  it("la rama 'Sin participantes' monta el monitor mientras haya asignados", () => {
    const i = src.indexOf("Sin participantes</span>");
    expect(i).toBeGreaterThan(0);
    expect(src.slice(i, i + 1200)).toContain("asignados.length > 0 && monitor(false)");
  });

  it("una reconexión de LiveKit no se lee como sala vacía", () => {
    const monitor = readFileSync(resolve(__dirname, "../../pages/cowork/CoworkRoomMonitor.tsx"), "utf8");
    expect(monitor).toContain("RoomEvent.Reconnecting, () => onParticipantsRef.current?.(null)");
    expect(monitor).toContain("RoomEvent.Reconnected, () => recomputeSharers()");
  });
});
