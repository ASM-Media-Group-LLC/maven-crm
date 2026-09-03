import { describe, it, expect } from "vitest";
import { debeMostrarAviso } from "@/components/AvisoMudanzaDominio";

const VIEJO = "maven.asmtech.ai";
const NUEVO = "app.maven-ai.me";
const AHORA = 1_800_000_000_000;

describe("aviso de mudanza de dominio", () => {
  it("aparece en el dominio anterior", () => {
    expect(debeMostrarAviso(VIEJO, "/dashboard", null, AHORA)).toBe(true);
    expect(debeMostrarAviso(VIEJO, "/personalizados", null, AHORA)).toBe(true);
    expect(debeMostrarAviso(VIEJO, "/login", null, AHORA)).toBe(true);   // buen momento: antes de entrar
  });

  it("NO aparece en el dominio nuevo ni en desarrollo", () => {
    expect(debeMostrarAviso(NUEVO, "/dashboard", null, AHORA)).toBe(false);
    expect(debeMostrarAviso("localhost", "/dashboard", null, AHORA)).toBe(false);
  });

  it("NUNCA en las rutas de gente de afuera", () => {
    // Un candidato o un invitado a una reunión no tiene por qué ver un aviso
    // interno de mudanza: no le dice nada y lo confunde.
    expect(debeMostrarAviso(VIEJO, "/chatter/sesion-123", null, AHORA)).toBe(false);
    expect(debeMostrarAviso(VIEJO, "/entrar/ABC123", null, AHORA)).toBe(false);
    expect(debeMostrarAviso(VIEJO, "/reset-password", null, AHORA)).toBe(false);
    expect(debeMostrarAviso(VIEJO, "/forgot-password", null, AHORA)).toBe(false);
  });

  it("al cerrarlo se calla 10 minutos y después vuelve", () => {
    expect(debeMostrarAviso(VIEJO, "/dashboard", AHORA, AHORA)).toBe(false);              // recién cerrado
    expect(debeMostrarAviso(VIEJO, "/dashboard", AHORA - 5 * 60_000, AHORA)).toBe(false); // 5 min
    expect(debeMostrarAviso(VIEJO, "/dashboard", AHORA - 11 * 60_000, AHORA)).toBe(true); // 11 min
  });
});
