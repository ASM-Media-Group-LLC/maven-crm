import { describe, it, expect } from "vitest";
import { appDe } from "@/components/hr/TarjetaArgos";

// El nombre de la app en la foto: corto y reconocible, no lo que escribió Argos.
describe("appDe", () => {
  const nombre = (a: string | null) => appDe(a).nombre;
  it("lo específico gana al navegador", () => {
    expect(nombre("Instagram / Navegador web")).toBe("Instagram");
    expect(nombre("Instagram Reels")).toBe("Instagram");
    expect(appDe("Instagram / Navegador web").icono).not.toBeNull();
  });
  it("las secciones de Maven por su nombre", () => {
    expect(nombre("CRM Maven / Cowork")).toBe("Cowork");
    expect(nombre("Maven CRM (Messenger)")).toBe("Messenger");
    expect(nombre("CRM Maven / OnlyFans CRM")).toBe("OnlyFans");
    expect(nombre("Media Vault (OnlyFans)")).toBe("Media Vault");
    expect(nombre("CRM Maven")).toBe("Maven");
    expect(appDe("CRM Maven").letra).toBe("M");
  });
  it("las IA conservan su nombre", () => {
    expect(nombre("Venice AI / Navegador web")).toBe("Venice AI");
    expect(nombre("Google Gemini")).toBe("Google Gemini");
  });
  it("lo desconocido: el primer tramo, corto", () => {
    expect(nombre("Notion (docs del equipo)")).toBe("Notion");
    expect(appDe(null).nombre).toBe("");
  });
});
