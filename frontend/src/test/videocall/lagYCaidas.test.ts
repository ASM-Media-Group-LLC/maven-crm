import { describe, it, expect } from "vitest";
import { VideoQuality } from "livekit-client";
import { aplicaCalidadPorVoz, calidadDeCamara, NITIDO_TRAS_HABLAR_MS } from "@/lib/calidadPorVoz";
import { quienTraba } from "@/lib/saludDeLlamada";

// «LA PLATAFORMA SE LAGUEA, SE SALE» (Alvaro, 17/11/2026).
const fuentes = import.meta.glob(
  [
    "/frontend/src/integrations/supabase/client.ts",
    "/frontend/src/hooks/useLiveKit.ts",
    "/frontend/src/hooks/useObservadorEnVivo.ts",
    "/frontend/src/pages/cowork/CoworkRoomMonitor.tsx",
  ],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

describe("llamada estable con Maven en segundo plano", () => {
  it("⚠️ toda sala de LiveKit afirma los relojes (en un Worker) antes de crearse", () => {
    for (const f of ["/frontend/src/hooks/useLiveKit.ts", "/frontend/src/hooks/useObservadorEnVivo.ts", "/frontend/src/pages/cowork/CoworkRoomMonitor.tsx"]) {
      expect(fuentes[f], f).toMatch(/afirmarRelojesDeLiveKit\(\);\s*\n\s*const room = new Room\(/);
    }
  });
  it("⚠️ el latido de la conexión en vivo corre en un Worker", () => {
    expect(fuentes["/frontend/src/integrations/supabase/client.ts"]).toContain(`realtime: { worker: typeof window !== "undefined" && typeof Worker !== "undefined" }`);
  });
});

describe("«¿quién soy?» sin salir del computador", () => {
  it("⚠️ getUser contesta con la sesión vigente y solo si no, pregunta al servidor", () => {
    const c = fuentes["/frontend/src/integrations/supabase/client.ts"];
    expect(c).toContain("supabase.auth.getUser = (async");
    expect(c).toMatch(/expires_at \* 1000 > Date\.now\(\)/);
    expect(c).toContain("return getUserDelServidor();");
  });
});

describe("en Cowork, cámaras en baja si no habla", () => {
  const ahora = 1_000_000;
  it("solo en salas de Cowork", () => {
    expect(aplicaCalidadPorVoz("cowork_9fa8ec28_0")).toBe(true);
    expect(aplicaCalidadPorVoz("cowork_hub_x")).toBe(true);
    expect(aplicaCalidadPorVoz("dm_abc")).toBe(false);
    expect(aplicaCalidadPorVoz(null)).toBe(false);
  });
  it("callado → baja; hablando o fijado → nítida", () => {
    expect(calidadDeCamara({ fijado: false, hablando: false, ultimaVezHablo: undefined, ahora })).toBe(VideoQuality.LOW);
    expect(calidadDeCamara({ fijado: false, hablando: true, ultimaVezHablo: undefined, ahora })).toBe(VideoQuality.HIGH);
    expect(calidadDeCamara({ fijado: true, hablando: false, ultimaVezHablo: undefined, ahora })).toBe(VideoQuality.HIGH);
  });
  it("sigue nítida unos segundos después de callarse, luego baja", () => {
    expect(calidadDeCamara({ fijado: false, hablando: false, ultimaVezHablo: ahora - 2_000, ahora })).toBe(VideoQuality.HIGH);
    expect(calidadDeCamara({ fijado: false, hablando: false, ultimaVezHablo: ahora - NITIDO_TRAS_HABLAR_MS - 1, ahora })).toBe(VideoQuality.LOW);
  });
});

describe("qué congela la página", () => {
  it("anota archivo y función, sin el hash del build", () => {
    expect(quienTraba({ sourceURL: "https://app.maven-ai.me/assets/useLiveKit-Ab12Cd34.js", sourceFunctionName: "render" })).toBe("useLiveKit.js:render");
    expect(quienTraba({ invoker: "TimerHandler:setInterval" })).toBe("?:TimerHandler:setInterval");
  });
  it("⚠️ la muestra de cada minuto lleva las trabas", () => {
    expect(fuentes["/frontend/src/hooks/useLiveKit.ts"]).toContain("trabas: trabasDelMinuto");
  });
});
