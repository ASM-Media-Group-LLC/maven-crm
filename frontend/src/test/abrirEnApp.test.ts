import { describe, it, expect } from "vitest";
import { debeOfrecerApp, enlaceDeApp } from "@/lib/abrirEnApp";

// Alvaro, 17/11/2026: «que me abran la aplicación cuando lo quiero abrir, no en
// el navegador». En un computador, con sesión, Maven ofrece abrir en la app.

const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/157 Safari/537.36";
const WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/157 Safari/537.36";
const CEL = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148";

const app = Object.values(import.meta.glob("../App.tsx", { query: "?raw", import: "default", eager: true }))[0] as string;

describe("abrir los links de Maven en la app", () => {
  it("en el navegador de Mac o Windows, con sesión, se ofrece", () => {
    expect(debeOfrecerApp({ ua: MAC, enApp: false, conSesion: true, ruta: "/call/sala-1" })).toBe(true);
    expect(debeOfrecerApp({ ua: WIN, enApp: false, conSesion: true, ruta: "/cowork" })).toBe(true);
  });

  it("no se ofrece en el teléfono, dentro de la app, sin sesión ni a invitados", () => {
    expect(debeOfrecerApp({ ua: CEL, enApp: false, conSesion: true, ruta: "/cowork" })).toBe(false);
    expect(debeOfrecerApp({ ua: MAC, enApp: true, conSesion: true, ruta: "/cowork" })).toBe(false);
    expect(debeOfrecerApp({ ua: MAC, enApp: false, conSesion: false, ruta: "/cowork" })).toBe(false);
    expect(debeOfrecerApp({ ua: MAC, enApp: false, conSesion: true, ruta: "/entrar/abc123" })).toBe(false);
    expect(debeOfrecerApp({ ua: MAC, enApp: false, conSesion: true, ruta: "/unirse/xyz" })).toBe(false);
    expect(debeOfrecerApp({ ua: MAC, enApp: false, conSesion: true, ruta: "/" })).toBe(false);
    expect(debeOfrecerApp({ ua: MAC, enApp: false, conSesion: true, ruta: "/login" })).toBe(false);
  });

  it("el link de la app lleva la ruta y nunca otro sitio", () => {
    expect(enlaceDeApp("/call/sala-1?x=1")).toBe("maven://abrir?ruta=%2Fcall%2Fsala-1%3Fx%3D1");
    expect(enlaceDeApp("//otro.com/x")).toBe("maven://abrir?ruta=%2F");
    expect(enlaceDeApp("https://otro.com")).toBe("maven://abrir?ruta=%2F");
  });

  it("está montado en toda la app", () => {
    expect(app).toMatch(/<AbrirEnApp \/>/);
  });
});
