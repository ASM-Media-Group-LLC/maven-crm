// La tarjeta de WhatsApp de cada tipo de link (lib/tarjetasDeLink.ts, 11/11/2026).
import { describe, it, expect } from "vitest";
import { TARJETAS, conTarjeta } from "@/lib/tarjetasDeLink";

type Glob = { glob: (p: string, o?: Record<string, unknown>) => Record<string, unknown> };
const uno = (r: Record<string, unknown>) => String(Object.values(r)[0] ?? "");
const INDEX = uno((import.meta as unknown as Glob).glob("/frontend/index.html", { query: "?raw", import: "default", eager: true }));
const NGINX = uno((import.meta as unknown as Glob).glob("/nginx.conf", { query: "?raw", import: "default", eager: true }));
const VITE = uno((import.meta as unknown as Glob).glob("/vite.config.ts", { query: "?raw", import: "default", eager: true }));
const IMAGENES = Object.keys((import.meta as unknown as Glob).glob("/frontend/public/og-*.jpg", { query: "?url", import: "default" }));

describe("la tarjeta de WhatsApp de cada link", () => {
  it("se cargaron las fuentes", () => {
    expect(INDEX.length).toBeGreaterThan(1000);
    expect(NGINX.length).toBeGreaterThan(500);
    expect(VITE.length).toBeGreaterThan(500);
  });

  it("index.html ya trae la tarjeta de la plataforma, en inglés", () => {
    expect(conTarjeta(INDEX, TARJETAS.plataforma)).toBe(INDEX);
    expect(INDEX).toContain('content="Maven · Your whole team, in a virtual office"');
    expect(INDEX).not.toMatch(/property="og:title" content="[^"]*suscripciones/);
  });

  it("una invitación a reunión dice que es una reunión", () => {
    const html = conTarjeta(INDEX, TARJETAS.reunion);
    expect(html).toContain('property="og:title" content="Maven Meeting"');
    expect(html).toContain("og-reunion.jpg");
    expect(html).toContain('name="twitter:image" content="https://app.maven-ai.me/og-reunion.jpg?v=9"');
  });

  it("un link de Cowork dice que el equipo te llama", () => {
    const html = conTarjeta(INDEX, TARJETAS.cowork);
    expect(html).toContain('property="og:title" content="Your team is calling you"');
    expect(html).toContain("og-cowork.jpg");
  });

  it("nginx entrega cada copia en su ruta, sin caché", () => {
    expect(NGINX).toMatch(/location \^~ \/entrar\/ \{[^}]*try_files \/og-reunion\.html =404;/);
    expect(NGINX).toMatch(/location = \/cowork \{[^}]*try_files \/og-cowork\.html =404;/);
    expect(NGINX).toMatch(/location = \/cowork \{[^}]*no-store/);
  });

  it("el build escribe las copias y las tres imágenes están", () => {
    expect(VITE).toContain("pluginTarjetasDeLink()");
    for (const t of Object.values(TARJETAS)) {
      const archivo = t.imagen.replace("https://app.maven-ai.me", "/frontend/public").replace(/\?.*$/, "");
      expect(IMAGENES).toContain(archivo);
    }
  });
});
