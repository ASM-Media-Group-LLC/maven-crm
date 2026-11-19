import { describe, expect, it } from "vitest";
import {
  REINTENTO_LENTO_MS, VIGILANTE_CAMARA_INICIAL, causaDeFalloDeCamara, decidirRepararCamara,
} from "@/lib/falloDeCamara";

// «Las cámaras se apagan solas y después no deja prenderlas» (Alvaro, 19/11/2026).
describe("la causa del fallo de cámara", () => {
  it("otro programa la tiene, falta permiso, no hay cámara", () => {
    expect(causaDeFalloDeCamara({ name: "NotReadableError" })).toBe("ocupada");
    expect(causaDeFalloDeCamara(new Error("Could not start video source"))).toBe("ocupada");
    expect(causaDeFalloDeCamara({ name: "NotAllowedError" })).toBe("permiso");
    expect(causaDeFalloDeCamara({ name: "NotFoundError" })).toBe("sin_camara");
    expect(causaDeFalloDeCamara(null)).toBe("otro");
  });
});

describe("el vigilante de la cámara", () => {
  const caida = { conectado: true, quiere: true, ocupado: false, caida: true };
  it("no toca nada si la persona la apagó o está bien", () => {
    expect(decidirRepararCamara({ ...caida, quiere: false }, VIGILANTE_CAMARA_INICIAL, 0).reparar).toBe(false);
    expect(decidirRepararCamara({ ...caida, caida: false }, VIGILANTE_CAMARA_INICIAL, 0).reparar).toBe(false);
  });
  it("espera dos vueltas, reintenta tres veces seguidas y después cada 30 s", () => {
    let m = VIGILANTE_CAMARA_INICIAL;
    let r = decidirRepararCamara(caida, m, 1000); m = r.memoria;
    expect(r.reparar).toBe(false); // primera vuelta caída: puede ser un cambio de perfil
    for (let i = 0; i < 3; i++) { r = decidirRepararCamara(caida, m, 2000 + i); m = r.memoria; expect(r.reparar).toBe(true); }
    r = decidirRepararCamara(caida, m, 3000); m = r.memoria;
    expect(r.reparar).toBe(false);
    r = decidirRepararCamara(caida, m, 2002 + REINTENTO_LENTO_MS + 1);
    expect(r.reparar).toBe(true);
  });
});
