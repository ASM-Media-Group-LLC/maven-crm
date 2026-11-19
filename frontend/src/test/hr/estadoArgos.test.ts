import { describe, expect, it } from "vitest";
import {
  agruparEventos, armarEstado, categoriaDe, contarPorCategoria, faltasYTardes, fotosDe, isoDeHoraBogota, normalizarEvento,
  type EventoArgos,
} from "@/lib/estadoArgos";
import { fraseDe } from "@/components/hr/EstadoPanel";

// ESTADO (Alvaro, 18/11/2026): «todo lo que reporte Argos de cada persona, ahí
// va llegando, uno por uno». Estas pruebas cuidan que cada cosa caiga en su
// lugar, que lo repetido se junte y que las faltas salgan del horario.

const ev = (o: Partial<EventoArgos>): EventoArgos => ({
  userId: "u1", creado: "2026-11-18T15:00:00.000Z", clase: "corte", tipo: "internet", detalle: null, duracionS: null,
  volvio: true, escalado: null, llamados: null, reportado: null, porCorte: null, estado: null, foto: null, ...o,
});

const t = (k: string, p?: Record<string, string | number>) => `${k}${p ? ` ${JSON.stringify(p)}` : ""}`;

describe("categoriaDe", () => {
  it("un parpadeo corto es un corte; uno largo o sin vuelta es «sin luz o internet»", () => {
    expect(categoriaDe(ev({ tipo: "internet", duracionS: 8 }))).toBe("corte");
    expect(categoriaDe(ev({ tipo: "caida", duracionS: 300 }))).toBe("luz");
    expect(categoriaDe(ev({ tipo: "no_volvio" }))).toBe("luz");
  });
  it("salir de Cowork por un corte de conexión cuenta como sin luz o internet", () => {
    expect(categoriaDe(ev({ clase: "fuera", tipo: "volvio", porCorte: true }))).toBe("luz");
    expect(categoriaDe(ev({ clase: "fuera", tipo: "volvio", porCorte: false }))).toBe("fuera");
  });
  it("llamados e IA van a su lugar", () => {
    expect(categoriaDe(ev({ clase: "llamado", tipo: "camara_apagada" }))).toBe("llamado");
    expect(categoriaDe(ev({ clase: "ia", tipo: "distraido" }))).toBe("ia");
  });
});

describe("agruparEventos", () => {
  it("junta la IA repetida de la misma persona en la misma hora, y no los llamados", () => {
    const items = agruparEventos([
      ev({ clase: "ia", tipo: "distraido", creado: "2026-11-18T15:00:00Z" }),
      ev({ clase: "ia", tipo: "distraido", creado: "2026-11-18T15:20:00Z" }),
      ev({ clase: "ia", tipo: "distraido", creado: "2026-11-18T15:40:00Z" }),
      ev({ clase: "llamado", tipo: "camara_apagada", creado: "2026-11-18T15:10:00Z" }),
      ev({ clase: "llamado", tipo: "camara_apagada", creado: "2026-11-18T15:30:00Z" }),
    ]);
    const ia = items.filter((i) => i.categoria === "ia");
    expect(ia).toHaveLength(1);
    expect(ia[0].eventos).toHaveLength(3);
    expect(ia[0].cuando).toBe("2026-11-18T15:40:00Z");
    expect(ia[0].desde).toBe("2026-11-18T15:00:00Z");
    expect(items.filter((i) => i.categoria === "llamado")).toHaveLength(2);
  });
  it("si pasa más de una hora, arranca otro renglón", () => {
    const items = agruparEventos([
      ev({ clase: "ia", tipo: "distraido", creado: "2026-11-18T13:00:00Z" }),
      ev({ clase: "ia", tipo: "distraido", creado: "2026-11-18T15:00:00Z" }),
    ]);
    expect(items).toHaveLength(2);
  });
  it("personas distintas nunca se juntan", () => {
    const items = agruparEventos([
      ev({ userId: "a", clase: "ia", tipo: "distraido" }),
      ev({ userId: "b", clase: "ia", tipo: "distraido" }),
    ]);
    expect(items).toHaveLength(2);
  });
});

describe("faltas y llegadas tarde", () => {
  it("la hora de Bogotá pasa a ISO (UTC-5)", () => {
    expect(isoDeHoraBogota("2026-11-18", "08:00:00")).toBe("2026-11-18T13:00:00.000Z");
  });
  it("falta solo si su hora de entrada ya pasó; tarde con sus minutos", () => {
    const ahora = Date.parse("2026-11-18T14:00:00Z"); // 9:00 AM Bogotá
    const items = faltasYTardes([
      { userId: "f", entradaCruda: "08:00:00", entrada: "8:00 AM", llegoAt: null, tardeMin: null, estado: "no_ha_entrado" },
      { userId: "luego", entradaCruda: "10:00:00", entrada: "10:00 AM", llegoAt: null, tardeMin: null, estado: "no_ha_entrado" },
      { userId: "t", entradaCruda: "08:00:00", entrada: "8:00 AM", llegoAt: "2026-11-18T13:20:00Z", tardeMin: 20, estado: "trabajando" },
    ], "2026-11-18", ahora);
    expect(items.map((i) => `${i.userId}:${i.categoria}`).sort()).toEqual(["f:falta", "t:tarde"]);
  });
});

describe("armarEstado y fraseDe", () => {
  it("todo junto, del más nuevo al más viejo, con su conteo", () => {
    const items = armarEstado(
      [ev({ creado: "2026-11-18T15:00:00Z" }), ev({ clase: "llamado", tipo: "sin_pantalla", creado: "2026-11-18T16:00:00Z", volvio: false })],
      [{ clave: "x", userId: "z", cuando: "2026-11-18T13:00:00Z", desde: "2026-11-18T13:00:00Z", categoria: "falta", tipo: "falta", eventos: [], entrada: "8:00 AM" }],
    );
    expect(items.map((i) => i.categoria)).toEqual(["llamado", "corte", "falta"]);
    expect(contarPorCategoria(items)).toMatchObject({ llamado: 1, corte: 1, falta: 1, ia: 0 });
    expect(fraseDe(items[0], t)).toContain("hr.estado.llamado.sigue");
    expect(fraseDe(items[2], t)).toContain("8:00 AM");
  });
  it("las fotos de un grupo no se repiten", () => {
    const foto = { path: "a.jpg", nasPath: null, enNas: false };
    const [item] = agruparEventos([
      ev({ clase: "ia", tipo: "distraido", creado: "2026-11-18T15:00:00Z", foto }),
      ev({ clase: "ia", tipo: "distraido", creado: "2026-11-18T15:01:00Z", foto }),
    ]);
    expect(fotosDe(item)).toHaveLength(1);
  });
  it("normaliza la fila de la base con su foto", () => {
    const e = normalizarEvento({ user_id: "u", creado: "2026-11-18T15:00:00Z", clase: "llamado", tipo: "camara_apagada", captura_path: "p.jpg", captura_en_nas: true, captura_nas_path: "n.jpg", duracion_s: "40" });
    expect(e.duracionS).toBe(40);
    expect(e.foto).toEqual({ path: "p.jpg", nasPath: "n.jpg", enNas: true });
  });
});
