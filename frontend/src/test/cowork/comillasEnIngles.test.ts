import { describe, it, expect } from "vitest";
import { cowork } from "@/lib/i18n/cowork";
import { getTranslation } from "@/lib/i18n";

// Las comillas «» son del español. En inglés un nombre (de sesión o de sala) va
// entre “”: «You left «Morning shift»» no es inglés de Estados Unidos.
//
// Por eso las comillas viven en el DICCIONARIO y nunca en el código: si el
// código envuelve el nombre en «» antes de pasárselo a t()/traducir(), el inglés
// las hereda aunque la columna `en` esté bien.
const fuentes = (import.meta as unknown as {
  glob: (patrones: string[], opciones: Record<string, unknown>) => Record<string, string>;
}).glob(["/frontend/src/pages/cowork/CoworkRoomMonitor.tsx"], { query: "?raw", import: "default", eager: true });
const monitor = fuentes["/frontend/src/pages/cowork/CoworkRoomMonitor.tsx"];

describe("Cowork · comillas en inglés", () => {
  it("ningún texto en inglés del diccionario de Cowork trae «»", () => {
    const conComillas = Object.entries(cowork)
      .filter(([, v]) => /[«»]/.test(v.en))
      .map(([k, v]) => `${k}: ${v.en}`);
    expect(conComillas).toEqual([]);
  });

  it("el aviso de publicación caída: «» en español, “” en inglés", () => {
    const aviso = (lang: "es" | "en") =>
      getTranslation("cowork.monitor.publishFailed.mic", lang, {
        room: getTranslation("cowork.monitor.quotedRoom", lang, { room: "Sala 1" }),
      });
    expect(aviso("es")).toBe("No se está publicando tu micrófono en «Sala 1»");
    expect(aviso("en")).toBe("Your microphone isn't reaching “Sala 1”");
  });

  it("el monitor no arma comillas en el código", () => {
    expect(monitor).toBeTruthy();
    // Fuera de los comentarios, ni un «: el nombre de la sala viaja pelado.
    const codigo = monitor.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    expect(codigo).not.toMatch(/«/);
    expect(monitor).toContain('traducir("cowork.monitor.quotedRoom", { room: roomName })');
  });
});
