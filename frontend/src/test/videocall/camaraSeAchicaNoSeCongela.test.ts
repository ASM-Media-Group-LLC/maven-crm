import { describe, expect, it } from "vitest";
import { PUBLICACION_DE_CAMARA } from "@/lib/perfilDeCamara";
import { PUBLICACION_DE_PANTALLA_COWORK, PUBLICACION_DE_PANTALLA_HUB, PUBLICACION_DE_PANTALLA_LIVIANA } from "@/lib/perfilDePantalla";

// 19/11/2026, simulacro v2: en llamadas de 2 personas con red tipo 4G o por
// TCP/TURN el video se congelaba 66 a 100 veces en 5 minutos. La cámara en HD
// (1080p) se publicaba con «maintain-resolution» (lo elige livekit-client solo)
// y tiraba cuadros. Ahora se publica con «balanced»: se achica, no se congela.

const fuente = import.meta.glob("../../hooks/useLiveKit.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const livekit = Object.values(fuente)[0];

describe("la cámara se achica en vez de congelarse (19/11/2026)", () => {
  it("la cámara se publica con «balanced»", () => {
    expect(PUBLICACION_DE_CAMARA.degradationPreference).toBe("balanced");
  });

  it("todas las veces que se prende la cámara llevan esa preferencia", () => {
    const prendidas = livekit.match(/setCameraEnabled\(true,[^;]*;/g) ?? [];
    expect(prendidas.length).toBeGreaterThan(0);
    for (const p of prendidas) expect(p).toContain("PUBLICACION_DE_CAMARA");
  });

  it("no va en publishDefaults: la pantalla compartida guarda la suya", () => {
    const sala = livekit.slice(livekit.indexOf("const ROOM_OPTIONS"), livekit.indexOf("function opcionesDeSala"));
    expect(sala).not.toMatch(/degradationPreference/);
    expect(PUBLICACION_DE_PANTALLA_COWORK.degradationPreference).toBe("maintain-resolution");
    expect(PUBLICACION_DE_PANTALLA_HUB.degradationPreference).toBe("maintain-resolution");
    expect(PUBLICACION_DE_PANTALLA_LIVIANA.degradationPreference).toBe("maintain-resolution");
  });

  it("simulcast de tres capas, dynacast y adaptiveStream siguen prendidos", () => {
    const sala = livekit.slice(livekit.indexOf("const ROOM_OPTIONS"), livekit.indexOf("function opcionesDeSala"));
    expect(sala).toMatch(/adaptiveStream:\s*\{\s*pixelDensity:\s*"screen"\s*\}/);
    expect(sala).toMatch(/dynacast:\s*true/);
    expect(sala).toMatch(/simulcast:\s*true/);
    expect(sala).toMatch(/videoSimulcastLayers:\s*\[\s*VideoPresets\.h180,\s*VideoPresets\.h360,\s*VideoPresets\.h720,?\s*\]/);
  });
});
