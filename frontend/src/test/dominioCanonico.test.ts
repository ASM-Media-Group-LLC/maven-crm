import { describe, it, expect } from "vitest";
import { urlCanonica, esDominioHistorico } from "@/lib/dominioCanonico";

// Maven se sirve en varios dominios y el canónico es app.maven-ai.me. Dos
// orígenes sirviendo la app significan dos sesiones, dos PWA instaladas y
// notificaciones duplicadas, así que la redirección tiene que ser exacta.

describe("dominio canónico", () => {
  it("redirige el apex y el www conservando ruta, query y hash", () => {
    expect(urlCanonica("https://maven-ai.me/personalizados")).toBe("https://app.maven-ai.me/personalizados");
    expect(urlCanonica("https://www.maven-ai.me/personalizados")).toBe("https://app.maven-ai.me/personalizados");
    expect(urlCanonica("https://www.maven-ai.me/messenger?dm=u1&back=/personalizados"))
      .toBe("https://app.maven-ai.me/messenger?dm=u1&back=/personalizados");
    // El hash importa: por ahí viajan los tokens de acceso y de recuperar contraseña.
    expect(urlCanonica("https://maven-ai.me/reset-password#access_token=abc&type=recovery"))
      .toBe("https://app.maven-ai.me/reset-password#access_token=abc&type=recovery");
  });

  it("el dominio histórico ya redirige, y los links públicos siguen llegando a su pantalla", () => {
    // Interruptor encendido el 04/09/2026. Lo que hace que apagarlo sea seguro
    // es esto: la ruta se preserva, así que los links que andan por bandejas
    // ajenas —el candidato del evaluador, el invitado a una reunión— caen en la
    // misma pantalla del canónico en vez de en un 404.
    expect(urlCanonica("https://maven.asmtech.ai/chatter/sesion-123"))
      .toBe("https://app.maven-ai.me/chatter/sesion-123");
    expect(urlCanonica("https://maven.asmtech.ai/entrar/ABC123"))
      .toBe("https://app.maven-ai.me/entrar/ABC123");
    // El otro histórico, y con query + hash (ahí viajan los tokens).
    expect(urlCanonica("https://maven.asmtech.me/reset-password#access_token=abc&type=recovery"))
      .toBe("https://app.maven-ai.me/reset-password#access_token=abc&type=recovery");
    expect(urlCanonica("https://maven.asmtech.ai/call/meet_abc?mic=off"))
      .toBe("https://app.maven-ai.me/call/meet_abc?mic=off");
  });

  it("reconoce los dominios de la etapa anterior (para contar las visitas)", () => {
    expect(esDominioHistorico("maven.asmtech.ai")).toBe(true);
    expect(esDominioHistorico("maven.asmtech.me")).toBe(true);
    expect(esDominioHistorico("app.maven-ai.me")).toBe(false);
    expect(esDominioHistorico("localhost")).toBe(false);
  });

  it("no se redirige a sí mismo (nada de bucles)", () => {
    expect(urlCanonica("https://app.maven-ai.me/dashboard")).toBeNull();
  });

  it("deja en paz el desarrollo y cualquier otro host", () => {
    expect(urlCanonica("http://localhost:5173/dashboard")).toBeNull();
    expect(urlCanonica("http://localhost:4599/harness.html")).toBeNull();
    expect(urlCanonica("https://otro-dominio.com/maven")).toBeNull();
  });

  it("una URL basura no rompe el arranque de la app", () => {
    expect(urlCanonica("no-es-una-url")).toBeNull();
    expect(urlCanonica("")).toBeNull();
  });
});
