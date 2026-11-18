import { describe, expect, it } from "vitest";
import { camaraEnHD } from "@/lib/perfilDeCamara";

const fuente = import.meta.glob("../../hooks/useLiveKit.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const livekit = Object.values(fuente)[0];

describe("cámara en HD fuera de Cowork (Alvaro, 17/11/2026)", () => {
  it("Meet y llamadas del chat van en HD; Cowork no", () => {
    expect(camaraEnHD("meet_abc")).toBe(true);
    expect(camaraEnHD("call-123")).toBe(true);
    expect(camaraEnHD("cowork_xyz")).toBe(false);
    expect(camaraEnHD(null)).toBe(false);
  });

  it("la sala se crea con sus opciones y el liviano no recorta la cámara en HD", () => {
    expect(livekit).toContain("new Room(opcionesDeSala(roomName))");
    expect(livekit).toContain("VideoPresets.h1080.resolution");
    expect(livekit).toMatch(/perfil === "liviano" && !camaraEnHD\(room\.name\)/);
  });
});
