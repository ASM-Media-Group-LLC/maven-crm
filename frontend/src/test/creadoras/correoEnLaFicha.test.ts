import { describe, it, expect } from "vitest";
import { cambioDeContacto, correoValido, estaEnmascarado, valorParaEditar } from "@/lib/creadoras/contacto";

// EL CORREO EN LA FICHA (Jhon, 06/10: «una vez hecho el onboarding, no veo por
// ningún lado dónde ingreso el correo del perfil»). Y de paso, que ningún
// formulario guarde la máscara que ve quien no es admin («a•••@gmail.com»,
// «••••••4567», de v_creators) encima del dato real.

const fuentes = (import.meta as unknown as {
  glob: (p: string[], o: Record<string, unknown>) => Record<string, string>;
}).glob(["/frontend/src/pages/creadores/InfoTabContent.tsx", "/frontend/src/pages/creadores/EditCreadorModal.tsx"], { query: "?raw", import: "default", eager: true });
const fuente = (n: string) => Object.entries(fuentes).find(([k]) => k.endsWith(n))?.[1] ?? "";

const MASCARA_CORREO = "a•••@gmail.com";
const MASCARA_TEL = "••••••4567";

describe("contacto enmascarado", () => {
  it("reconoce las máscaras de mask_email y mask_phone", () => {
    expect(estaEnmascarado(MASCARA_CORREO)).toBe(true);
    expect(estaEnmascarado(MASCARA_TEL)).toBe(true);
    expect(estaEnmascarado("ana@gmail.com")).toBe(false);
    expect(estaEnmascarado(null)).toBe(false);
  });

  it("al editar, lo enmascarado empieza vacío; lo real, tal cual", () => {
    expect(valorParaEditar(MASCARA_CORREO)).toBe("");
    expect(valorParaEditar("ana@gmail.com")).toBe("ana@gmail.com");
    expect(valorParaEditar(null)).toBe("");
  });

  it("solo se guarda lo que se cambió de verdad", () => {
    // Sin correo (la creadora de prueba de Jhon) → se escribe uno.
    expect(cambioDeContacto(null, "test@gmail.com")).toBe("test@gmail.com");
    expect(cambioDeContacto(null, "")).toBeUndefined();
    // Real y sin tocar → no se toca; cambiado o borrado → se guarda.
    expect(cambioDeContacto("ana@gmail.com", " ana@gmail.com ")).toBeUndefined();
    expect(cambioDeContacto("ana@gmail.com", "ana2@gmail.com")).toBe("ana2@gmail.com");
    expect(cambioDeContacto("ana@gmail.com", "")).toBeNull();
  });

  it("⚠️ nunca se guarda una máscara, y una máscara sin reemplazo no borra el dato real", () => {
    expect(cambioDeContacto(MASCARA_CORREO, "")).toBeUndefined();
    expect(cambioDeContacto(MASCARA_CORREO, MASCARA_CORREO)).toBeUndefined();
    expect(cambioDeContacto(MASCARA_TEL, "+57 300 123 4567")).toBe("+57 300 123 4567");
    expect(cambioDeContacto(null, MASCARA_TEL)).toBeUndefined();
  });

  it("correoValido", () => {
    expect(correoValido("test@gmail.com")).toBe(true);
    expect(correoValido("test@gmail")).toBe(false);
    expect(correoValido("test gmail.com")).toBe(false);
  });
});

describe("los formularios", () => {
  it("la ficha (pestaña Info) muestra y edita el correo", () => {
    const info = fuente("InfoTabContent.tsx");
    expect(info.length).toBeGreaterThan(1000);
    expect(info).toMatch(/InfoField label=\{t\("common\.email"\)\} value=\{c\.email\}/);
    expect(info).toMatch(/cambioDeContacto\(c\.email, editData\.email\)/);
  });
  it("el lápiz del listado ya no guarda lo que muestra: correo, teléfono y WhatsApp solo si cambiaron", () => {
    const lapiz = fuente("EditCreadorModal.tsx");
    expect(lapiz.length).toBeGreaterThan(1000);
    for (const campo of ["email", "phone", "whatsapp_number"]) {
      expect(lapiz, campo).not.toMatch(new RegExp(`${campo}: form\\.${campo}\\.trim\\(\\)`));
      expect(lapiz, campo).toMatch(new RegExp(`cambioDeContacto\\(creator\\.${campo}, form\\.${campo}\\)`));
    }
  });
});
