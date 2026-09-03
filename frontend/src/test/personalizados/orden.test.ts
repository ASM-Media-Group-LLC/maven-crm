import { describe, it, expect } from "vitest";
import { ordenarPedidos, valoresDe, etiquetaValor, CLASE, TEXTOS } from "@/pages/personalizados/orden";
import type { Pedido } from "@/pages/personalizados/types";

// Pedido de Jhon (03/09/2026): "doy click en precio y me habilita mayor precio o
// menor precio… tipo, y me va acomodando por tipos".

const base: Omit<Pedido, "id" | "price_usd" | "content_type" | "requested_on" | "creator_name" | "status"> = {
  agency: "plus", creator_id: null, chatter_id: null, chatter_name: "Vanessa Giraldo",
  fan_handle: "u1", due_on: null, sale_channel: "normal", description: "algo",
  duration_or_qty: null, fan_total_spent_usd: null, paid_usd: null, flags: [], notes: null,
  denied_reason: null, approved_by: null, approved_at: null, delivered_at: null,
  source: "maven", source_ref: null, created_at: "2026-09-01T00:00:00Z", updated_at: null,
  created_by: null,
} as unknown as Omit<Pedido, "id" | "price_usd" | "content_type" | "requested_on" | "creator_name" | "status">;

const p = (id: string, price: number | null, tipo: Pedido["content_type"], fecha: string, creadora = "Ana", estado: Pedido["status"] = "solicitado") =>
  ({ ...base, id, price_usd: price, content_type: tipo, requested_on: fecha, creator_name: creadora, status: estado }) as Pedido;

const PEDIDOS: Pedido[] = [
  p("a", 200, "video", "2026-08-01", "Zulma"),
  p("b", 50, "audio", "2026-08-10", "Ana"),
  p("c", null, "foto", "2026-07-01", "Bea"),
  p("d", 1200, "video", "2026-09-01", "carla", "entregado"),
  p("e", 200, "foto", "2026-09-02", "Ana", "aprobado"),
];

const ids = (ps: Pedido[]) => ps.map((x) => x.id).join("");

describe("ordenar por columna", () => {
  it("precio de mayor a menor, y los sin precio SIEMPRE al final", () => {
    const r = ordenarPedidos(PEDIDOS, { col: "price_usd", dir: "desc" });
    expect(ids(r)).toBe("deabc");   // 1200 · 200(2sep) · 200(1ago) · 50 · sin precio
    expect(r[0].id).toBe("d");           // 1200
    expect(r[r.length - 1].id).toBe("c"); // sin precio
  });

  it("precio de menor a mayor: los sin precio tampoco son 'los más baratos'", () => {
    const r = ordenarPedidos(PEDIDOS, { col: "price_usd", dir: "asc" });
    expect(r[0].id).toBe("b");            // 50
    expect(r[r.length - 1].id).toBe("c"); // sin precio, al final igual
  });

  it("empate de precio → el más reciente primero", () => {
    const r = ordenarPedidos(PEDIDOS, { col: "price_usd", dir: "desc" });
    const empatados = r.filter((x) => x.price_usd === 200).map((x) => x.id);
    expect(empatados).toEqual(["e", "a"]);   // 2 sep antes que 1 ago
  });

  it("tipo: agrupa por tipo en el orden del catálogo (foto, video, audio, artículo)", () => {
    const r = ordenarPedidos(PEDIDOS, { col: "content_type", dir: "asc" });
    expect(r.map((x) => x.content_type)).toEqual(["foto", "foto", "video", "video", "audio"]);
  });

  it("estado: agrupa por el ciclo de vida, no alfabéticamente", () => {
    const r = ordenarPedidos(PEDIDOS, { col: "status", dir: "asc" });
    expect(r.map((x) => x.status)).toEqual(["solicitado", "solicitado", "solicitado", "aprobado", "entregado"]);
  });

  it("creadora: A→Z sin importar mayúsculas ni tildes", () => {
    const r = ordenarPedidos(PEDIDOS, { col: "creator_name", dir: "asc" });
    expect(r.map((x) => x.creator_name)).toEqual(["Ana", "Ana", "Bea", "carla", "Zulma"]);
  });

  it("fecha: más reciente primero", () => {
    const r = ordenarPedidos(PEDIDOS, { col: "requested_on", dir: "desc" });
    expect(r[0].requested_on).toBe("2026-09-02");
    expect(r[r.length - 1].requested_on).toBe("2026-07-01");
  });

  it("no muta la lista original y sin orden devuelve la misma referencia", () => {
    const antes = ids(PEDIDOS);
    ordenarPedidos(PEDIDOS, { col: "price_usd", dir: "desc" });
    expect(ids(PEDIDOS)).toBe(antes);
    expect(ordenarPedidos(PEDIDOS, null)).toBe(PEDIDOS);
  });
});

describe("menú del encabezado", () => {
  it("los textos dependen de la clase de la columna", () => {
    expect(CLASE.price_usd).toBe("numero");
    expect(TEXTOS[CLASE.price_usd].desc).toBe("Mayor a menor");
    expect(TEXTOS[CLASE.content_type].asc).toContain("Agrupar");
    expect(TEXTOS[CLASE.requested_on].desc).toContain("reciente");
  });

  it("'ver solo' ofrece únicamente los valores que existen en la tabla", () => {
    expect(valoresDe(PEDIDOS, "content_type")).toEqual(["foto", "video", "audio"]);
    expect(valoresDe(PEDIDOS, "status")).toEqual(["solicitado", "aprobado", "entregado"]);
    expect(valoresDe(PEDIDOS, "agency")).toEqual(["plus"]);
  });

  it("los valores se muestran con su etiqueta, no con el id de la base", () => {
    expect(etiquetaValor("content_type", "video")).toContain("Video");
    expect(etiquetaValor("status", "en_produccion")).toBe("En producción");
    expect(etiquetaValor("sale_channel", "buster")).toMatch(/Buster/);
    expect(etiquetaValor("agency", "massive")).toBe("Massive");
  });
});
