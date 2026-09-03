import { describe, it, expect } from "vitest";
import { parseTsv, parseFilasSheet, parseDinero, parseFecha, parseEstado, parseFan, resolutorPorNombre, aPedido } from "@/pages/personalizados/importarSheet";

// Filas TAL COMO las pega Google Sheets (TSV; celdas multilínea entre comillas).
const ENCABEZADO = "CREADORA\tFECHA DE SOLICITUD\tESTADO\tCHATTER\tUSUARIO\t¿Cuánto ha gastado el user? (USD)\tCuanto Pago?\tNormal\tBuster\tTIPO DE CONTENIDO\tDESCRIPCIÓN\tTIEMPO O CANTIDAD\tNOTAS";
const F1 = "Julirodriguezok\t14/06/2026\tEntregado\tBreyner Garzon\t@u85422765\t $ 5,850.00 \t $ 200.00 \tTRUE\tFALSE\tFoto\tEl usuario ha pedido este personalizado en esta ocasión por 4ta vez\t\t";
const F2 = 'carocancino\t07/04/2026\tSolicitado\tLuisa Gonzalez\t"Beto dCG\n@u160764328"\t $ 2,770.00 \t $ 300.00 \tFALSE\tTRUE\tArticulo\t"QUIERE UN CUADRO DE LOS QUE CARO DIBUJA CON ESTO (Mira, en el libro…\nMargarita está totalmente desnuda)"\t\t';
const F3 = "Martinasmith\tSIN INFO\tEntregado\tVanessa Giraldo\tAoh@u393404489\t $ 520.00 \t $ 250.00 \tTRUE\tFALSE\tVideo\tTú eres mi tía Marti\tA discreción de la cc\tEL CUSTOM SE VENDIÓ ANTES DE LLEGAR A LA AGENCIA";
const F4 = "ErandiEstevez\t02/02/2026\tDENEGADO\tDiego Martinez\tAlex Gur @u55915092\t643,25\t $ 300.00 \tFALSE\tFALSE\tVideo\tvideo personalizado sin censura\tA discreción de la cc\t";

describe("parseTsv — lo que pega Google Sheets", () => {
  it("celda multilínea entre comillas se conserva como UNA celda", () => {
    const filas = parseTsv(F2);
    expect(filas).toHaveLength(1);
    expect(filas[0][4]).toBe("Beto dCG\n@u160764328");
    expect(filas[0][10]).toContain("\n");
  });
  it("comillas escapadas y filas vacías", () => {
    expect(parseTsv('a\t"di ""hola"""\n\n\t\n')).toEqual([["a", 'di "hola"']]);
  });
});

describe("celdas sueltas", () => {
  it("dinero: $ 5,850.00 · 643,25 · $ -", () => {
    expect(parseDinero(" $ 5,850.00 ")).toBe(5850);
    expect(parseDinero("643,25")).toBe(643.25);
    expect(parseDinero(" $ - ")).toBeNull();
    expect(parseDinero("")).toBeNull();
  });
  it("fechas: dd/mm/yyyy · d/m/yy · SIN INFO", () => {
    expect(parseFecha("14/06/2026")).toBe("2026-06-14");
    expect(parseFecha("7/01/26")).toBe("2026-01-07");
    expect(parseFecha("SIN INFO")).toBeNull();
    expect(parseFecha("1/10/2025")).toBe("2025-10-01");
  });
  it("estados del sheet → ciclo de vida", () => {
    expect(parseEstado("Entregado")).toBe("entregado");
    expect(parseEstado("Pendiente")).toBe("en_produccion");
    expect(parseEstado("Solicitado")).toBe("solicitado");
    expect(parseEstado("DENEGADO")).toBe("denegado");
    expect(parseEstado("")).toBe("solicitado");
  });
  it("usuario: saca el handle aunque venga con nombre o pegado", () => {
    expect(parseFan("Beto dCG\n@u160764328")).toBe("u160764328");
    expect(parseFan("Aoh@u393404489")).toBe("u393404489");
    expect(parseFan("@alexsexo")).toBe("alexsexo");
    expect(parseFan("Karl")).toBe("Karl");
  });
});

describe("parseFilasSheet — filas completas", () => {
  const filas = parseFilasSheet([ENCABEZADO, F1, F2, F3, F4].join("\n"));
  it("salta el encabezado y lee las 4 filas", () => {
    expect(filas).toHaveLength(4);
  });
  it("Normal/Buster → canal; tipo; precio", () => {
    expect(filas[0]).toMatchObject({ creator_name: "Julirodriguezok", status: "entregado", sale_channel: "normal", content_type: "foto", price_usd: 200, fan_total_spent_usd: 5850, fan_handle: "u85422765", requested_on: "2026-06-14" });
    expect(filas[1]).toMatchObject({ sale_channel: "buster", content_type: "articulo", fan_handle: "u160764328", chatter_name: "Luisa Gonzalez" });
    expect(filas[1].description.startsWith("QUIERE UN CUADRO")).toBe(true);
  });
  it("SIN INFO deja la fecha en null y lo avisa", () => {
    expect(filas[2].requested_on).toBeNull();
    expect(filas[2].avisos.join()).toMatch(/Fecha/);
    expect(filas[2].notes).toMatch(/SE VENDIÓ ANTES/);
  });
  it("sin Normal ni Buster → canal null; 643,25 se lee como decimal", () => {
    expect(filas[3].sale_channel).toBeNull();
    expect(filas[3].fan_total_spent_usd).toBe(643.25);
    expect(filas[3].status).toBe("denegado");
  });
});

describe("aPedido + resolutores", () => {
  const creadoraId = resolutorPorNombre([{ id: "c1", nombre: "Carocancino" }, { id: "c2", nombre: "Martina Smith" }]);
  const chatterId = resolutorPorNombre([{ id: "p1", nombre: "Luisa González Pérez" }, { id: "p2", nombre: "Vanessa Giraldo" }]);
  it("matchea nombres sin tildes/mayúsculas y por prefijo", () => {
    expect(creadoraId("carocancino")).toBe("c1");
    expect(chatterId("Luisa Gonzalez")).toBe("p1");   // sin tilde, prefijo del nombre completo
    expect(chatterId("Nadie")).toBeNull();
  });
  it("arma la fila para custom_requests con source=sheet y fecha de hoy si faltaba", () => {
    const f = parseFilasSheet(F3)[0];
    const p = aPedido(f, "plus", "PLUS Aprobadas", { creadoraId, chatterId });
    expect(p.source).toBe("sheet");
    expect(p.source_ref).toMatch(/PLUS Aprobadas · fila/);
    expect(p.requested_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(p.chatter_id).toBe("p2");
    expect(p.paid_usd).toBe(250);   // entregado ⇒ cobrado
  });
});

// EL BUG (03/09/2026): el sheet traía "$ 5,500,000.00" como precio de un
// personalizado (mediana real: $150) y entraba tal cual → el tablero mostraba
// "En juego $5.5 millones". Un monto imposible ya no entra como plata.
describe("montos imposibles del sheet", () => {
  const FILA = [
    "Danycatgaming\t28/07/26\tSolicitado\tBrayan Hernandez\tMats @matatert\t$ 12,250.00\t$ 5,500,000.00\tFALSE\tTRUE\tVideo\tMontando el dildo\t\t",
    "Carocancino\t14/08/2026\tEntregado\tCamila Sogamoso\t@u116524439\t$1,038,970\t$1,000\tFALSE\tTRUE\tVideo\tVideo específico\t\t",
    "Martinasmith\t29/04/2026\tEntregado\tVanessa Giraldo\t@u1\t$ 78,920.00\t$ 2,000.00\tTRUE\tFALSE\tVideo\tTres videos\t\t",
  ].join("\n");
  const filas = parseFilasSheet(FILA);
  const ids = { creadoraId: () => null, chatterId: () => null };

  it("avisa del precio imposible antes de importar", () => {
    expect(filas[0].avisos.some((a) => /Precio imposible/.test(a))).toBe(true);
    expect(filas[0].avisos.join(" ")).toContain("$5,500,000");
  });

  it("el precio imposible entra en blanco, marcado y con el valor original en las notas", () => {
    const p = aPedido(filas[0], "plus", "Agosto 2026", ids);
    expect(p.price_usd).toBeNull();
    expect(p.paid_usd).toBeNull();
    expect(p.flags).toContain("revisar_monto");
    expect(p.notes).toContain("5,500,000");
    // el gasto del fan de esa fila era plausible: se conserva
    expect(p.fan_total_spent_usd).toBe(12250);
  });

  it("un gasto de fan imposible tampoco pasa, pero el precio bueno queda", () => {
    const p = aPedido(filas[1], "massive", "Massive Aprobadas", ids);
    expect(p.fan_total_spent_usd).toBeNull();
    expect(p.price_usd).toBe(1000);
    expect(p.paid_usd).toBe(1000);
    expect(p.flags).toContain("revisar_monto");
  });

  it("montos altos pero reales (ballenas) pasan sin marca", () => {
    const p = aPedido(filas[2], "plus", "PLUS Aprobadas", ids);
    expect(p.fan_total_spent_usd).toBe(78920);
    expect(p.price_usd).toBe(2000);
    expect(p.flags).toEqual([]);
    expect(p.notes).toBeNull();
  });
});
