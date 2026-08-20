import { describe, it, expect } from "vitest";
import { parseJoinInput } from "@/lib/meetJoinInput";

// El input de "entrar" es la puerta de un invitado: si no reconoce lo que la
// persona pegó, ve "no se pudo entrar" sin saber qué hizo mal. Estos casos son
// las formas reales en que llega un link de reunión por WhatsApp o por chat.
describe("parseJoinInput", () => {
  it("reconoce el link completo con protocolo y query", () => {
    expect(parseJoinInput("https://maven.asmtech.ai/call/meet_ab12cd34ef56?name=Reuni%C3%B3n"))
      .toEqual({ livekitRoom: "meet_ab12cd34ef56" });
  });

  it("reconoce el link relativo", () => {
    expect(parseJoinInput("/call/meet_ab12cd34ef56")).toEqual({ livekitRoom: "meet_ab12cd34ef56" });
  });

  it("reconoce el nombre de sala pelado", () => {
    expect(parseJoinInput("meet_ab12cd34ef56")).toEqual({ livekitRoom: "meet_ab12cd34ef56" });
  });

  it("reconoce un código de 6 caracteres", () => {
    expect(parseJoinInput("ABC234")).toEqual({ code: "ABC234" });
  });

  it("normaliza el código sucio: minúsculas, guiones, espacios", () => {
    expect(parseJoinInput(" abc-234 ")).toEqual({ code: "ABC234" });
  });

  it("saca el código de un link que lo lleva como query param", () => {
    expect(parseJoinInput("https://maven.asmtech.ai/meet?code=abc234")).toEqual({ code: "ABC234" });
  });

  it("de vacío o basura no devuelve nada (el botón queda deshabilitado)", () => {
    expect(parseJoinInput("")).toEqual({});
    expect(parseJoinInput("   ")).toEqual({});
    expect(parseJoinInput("---")).toEqual({});
  });

  it("un link de Cowork NO se confunde con una reunión de Meet", () => {
    // Cowork usa /cowork?session=…&room=…: no hay /call/ ni código de 6, así que
    // cae en el camino de código y queda incompleto en vez de resolver una sala
    // que no es de Meet.
    const parsed = parseJoinInput("https://maven.asmtech.ai/cowork?session=abc&room=def");
    expect(parsed.livekitRoom).toBeUndefined();
  });

  it("el link de una llamada que no es de Meet devuelve su sala igual", () => {
    // La edge rechaza lo que no empiece con meet_, así que la validación real es
    // del servidor; acá solo confirmamos que no se traga el input en silencio.
    expect(parseJoinInput("/call/call-123abc")).toEqual({ livekitRoom: "call-123abc" });
  });
});
