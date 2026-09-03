import { describe, it, expect } from "vitest";
import { urlCanonica } from "@/lib/dominioCanonico";

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

  it("NO toca el dominio histórico: ahí viven los links públicos ya enviados", () => {
    expect(urlCanonica("https://maven.asmtech.ai/chatter/sesion-123")).toBeNull();
    expect(urlCanonica("https://maven.asmtech.ai/entrar/ABC123")).toBeNull();
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
