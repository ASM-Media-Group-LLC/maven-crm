// La detección de plataforma decide si se muestra la guía de instalar, si se
// pide el permiso de notificaciones al entrar y si el botón de push se ofrece.
// Un iPhone tomado por escritorio = prompt inútil quemado; un escritorio tomado
// por teléfono = banner de "instala en tu teléfono" en un monitor.
import { describe, it, expect, beforeEach } from "vitest";
import {
  detectarPlataforma,
  estaInstalada,
  esMovil,
  instalacionPospuesta,
  posponerInstalacion,
  puedeActivarPushAqui,
  POSPONER_INSTALAR_MS,
  CLAVE_INSTALAR_POSPUESTO,
} from "@/lib/plataformaPwa";

const UA = {
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1",
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
};

describe("detectarPlataforma", () => {
  it("iPhone Safari, iPhone Chrome, Android y escritorio", () => {
    expect(detectarPlataforma({ userAgent: UA.iphoneSafari })).toBe("ios-safari");
    expect(detectarPlataforma({ userAgent: UA.iphoneChrome })).toBe("ios-otro");
    expect(detectarPlataforma({ userAgent: UA.android })).toBe("android");
    expect(detectarPlataforma({ userAgent: UA.mac, platform: "MacIntel", maxTouchPoints: 0 })).toBe("escritorio");
  });
  it("iPadOS se disfraza de Mac: la pantalla táctil lo delata", () => {
    expect(detectarPlataforma({ userAgent: UA.mac, platform: "MacIntel", maxTouchPoints: 5 })).toBe("ios-safari");
  });
  it("esMovil va por plataforma, no por ancho de ventana", () => {
    expect(esMovil({ userAgent: UA.android })).toBe(true);
    expect(esMovil({ userAgent: UA.mac, platform: "MacIntel", maxTouchPoints: 0 })).toBe(false);
  });
});

describe("estaInstalada", () => {
  const win = (matches: boolean, standalone?: boolean) =>
    ({
      matchMedia: () => ({ matches }),
      navigator: { standalone },
    }) as unknown as Window;
  it("display-mode standalone o navigator.standalone (iOS)", () => {
    expect(estaInstalada(win(true))).toBe(true);
    expect(estaInstalada(win(false, true))).toBe(true);
    expect(estaInstalada(win(false, false))).toBe(false);
    expect(estaInstalada(win(false))).toBe(false);
  });
});

describe("posponer la guía de instalación", () => {
  beforeEach(() => localStorage.clear());
  it("dura 7 días exactos", () => {
    const t0 = 1_800_000_000_000;
    expect(instalacionPospuesta(t0)).toBe(false);
    posponerInstalacion(t0);
    expect(localStorage.getItem(CLAVE_INSTALAR_POSPUESTO)).toBe(String(t0 + POSPONER_INSTALAR_MS));
    expect(instalacionPospuesta(t0 + POSPONER_INSTALAR_MS - 1)).toBe(true);
    expect(instalacionPospuesta(t0 + POSPONER_INSTALAR_MS + 1)).toBe(false);
  });
  it("basura en storage = no pospuesta", () => {
    localStorage.setItem(CLAVE_INSTALAR_POSPUESTO, "hola");
    expect(instalacionPospuesta()).toBe(false);
  });
});

describe("puedeActivarPushAqui", () => {
  const conSoporte = { PushManager: {}, Notification: {}, navigator: { serviceWorker: {} } } as unknown as Window;
  const sinSoporte = { navigator: {} } as unknown as Window;
  it("iOS solo instalada; los demás si el navegador soporta push", () => {
    expect(puedeActivarPushAqui("ios-safari", false, conSoporte)).toBe(false);
    expect(puedeActivarPushAqui("ios-safari", true, conSoporte)).toBe(true);
    expect(puedeActivarPushAqui("android", false, conSoporte)).toBe(true);
    expect(puedeActivarPushAqui("escritorio", false, conSoporte)).toBe(true);
    expect(puedeActivarPushAqui("android", false, sinSoporte)).toBe(false);
  });
});
