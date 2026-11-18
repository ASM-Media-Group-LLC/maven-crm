import { describe, it, expect } from "vitest";
import { armarTramos, minutosDe, veredictoDe } from "@/lib/cronologiaArgos";
import type { CapturaDia } from "@/hooks/useExpedienteEmpleado";

// La cronología del Expediente (Alvaro, 18/11/2026): los pantallazos sueltos se
// vuelven tramos seguidos, con la llegada tarde y los huecos sin capturas.

let n = 0;
function cap(tipo: "pantalla" | "camara", hora: string, extra: Partial<CapturaDia> = {}): CapturaDia {
  n += 1;
  return {
    id: `c${n}`, tipo, path: `p${n}`, nasPath: null, enNas: false, fueraDeLugar: false,
    veredicto: tipo === "pantalla" ? "Atiende chats" : null, caraVisible: tipo === "camara" ? true : null,
    perdonado: false, createdAt: `2026-11-18T${hora}:00-05:00`, ...extra,
  };
}
/** Pantalla + cámara cada minuto entre dos horas (HH:MM). */
function trabajando(desde: string, hasta: string, extra: { pantalla?: Partial<CapturaDia>; camara?: Partial<CapturaDia> | null } = {}): CapturaDia[] {
  const out: CapturaDia[] = [];
  const [h0, m0] = desde.split(":").map(Number);
  const [h1, m1] = hasta.split(":").map(Number);
  for (let m = h0 * 60 + m0; m < h1 * 60 + m1; m++) {
    const hh = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    out.push(cap("pantalla", hh, extra.pantalla));
    if (extra.camara !== null) out.push(cap("camara", hh, extra.camara ?? {}));
  }
  return out;
}

const base = { fecha: "2026-11-18", horarioEntrada: "08:00" };

describe("armarTramos", () => {
  it("un día bueno es un solo tramo «ok»", () => {
    const tr = armarTramos(trabajando("08:00", "09:00"), { ...base, entroAt: "2026-11-18T08:00:00-05:00" });
    expect(tr.map((x) => x.estado)).toEqual(["ok"]);
    expect(minutosDe(tr[0])).toBe(60);
    expect(veredictoDe(tr[0])).toBe("Atiende chats");
  });

  it("la llegada tarde sale primero, con sus minutos", () => {
    const tr = armarTramos(trabajando("09:20", "09:40"), { ...base, entroAt: "2026-11-18T09:20:00-05:00" });
    expect(tr[0].estado).toBe("tarde");
    expect(minutosDe(tr[0])).toBe(80);
  });

  it("dentro de la tolerancia de 5 min no es tarde", () => {
    const tr = armarTramos(trabajando("08:04", "08:30"), { ...base, entroAt: "2026-11-18T08:04:00-05:00" });
    expect(tr.some((x) => x.estado === "tarde")).toBe(false);
  });

  it("un hueco sin capturas de más de 6 min queda como «sinCapturas»", () => {
    const caps = [...trabajando("10:00", "10:20"), ...trabajando("10:57", "11:10")];
    const tr = armarTramos(caps, { ...base, entroAt: null });
    expect(tr.map((x) => x.estado)).toEqual(["ok", "sinCapturas", "ok"]);
    expect(minutosDe(tr[1])).toBe(36);
  });

  it("10 minutos sin cámara salen como su propio tramo", () => {
    const caps = [...trabajando("10:00", "10:10"), ...trabajando("10:10", "10:20", { camara: null }), ...trabajando("10:20", "10:30")];
    const tr = armarTramos(caps, { ...base, entroAt: null });
    expect(tr.map((x) => x.estado)).toEqual(["ok", "sinCamara", "ok"]);
  });

  it("un minuto suelto sin cámara es ruido y no parte el tramo", () => {
    const caps = [...trabajando("10:00", "10:10"), cap("pantalla", "10:10"), ...trabajando("10:12", "10:30")];
    const tr = armarTramos(caps, { ...base, entroAt: null });
    expect(tr.map((x) => x.estado)).toEqual(["ok"]);
  });

  it("fuera de lugar nunca se esconde, aunque sea corto; perdonado sí cuenta como bien", () => {
    const malo = [...trabajando("10:00", "10:10"), ...trabajando("10:10", "10:11", { pantalla: { fueraDeLugar: true } }), ...trabajando("10:12", "10:20")];
    expect(armarTramos(malo, { ...base, entroAt: null }).map((x) => x.estado)).toEqual(["ok", "fuera", "ok"]);
    const perdonado = [...trabajando("10:00", "10:10"), ...trabajando("10:10", "10:11", { pantalla: { fueraDeLugar: true, perdonado: true } }), ...trabajando("10:12", "10:20")];
    expect(armarTramos(perdonado, { ...base, entroAt: null }).map((x) => x.estado)).toEqual(["ok"]);
  });

  it("sin capturas no hay tramos (y no inventa nada)", () => {
    expect(armarTramos([], { ...base, entroAt: null })).toEqual([]);
  });
});
