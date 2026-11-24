import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { parametrosPrecio, precioCoincide, prepararCatalogo } from "./catalogo.ts";
import { CODIGO_FISCAL_SAAS_MAVEN, montoDeProducto, PRECIOS_BASE, PRODUCTOS_MAVEN } from "./logica.ts";
import type { Json, stripe } from "./stripe.ts";

function precioValido(clave: string, cambios: Json = {}): Json {
  const p = PRODUCTOS_MAVEN.find((p) => p.clave === clave)!;
  return {
    id: `price_${clave}`, active: true, currency: "usd", unit_amount: montoDeProducto(PRECIOS_BASE, p.clave),
    billing_scheme: "per_unit", tax_behavior: "inclusive", type: p.mensual ? "recurring" : "one_time",
    recurring: p.mensual ? { interval: "month", interval_count: 1, usage_type: "licensed" } : null,
    product: { id: `prod_${clave}`, active: true, tax_code: p.codigoFiscal },
    ...cambios,
  };
}

function simulador(cambios: Record<string, Json | null> = {}) {
  const llamadas: { metodo: string; ruta: string; params: URLSearchParams; idem?: string }[] = [];
  const api: typeof stripe = async (metodo, ruta, params = new URLSearchParams(), opciones = {}) => {
    llamadas.push({ metodo, ruta, params, idem: opciones.idem });
    if (metodo === "GET" && ruta === "prices") {
      const p = PRODUCTOS_MAVEN.find((p) => p.lookup === params.get("lookup_keys[]"))!;
      const cambio = cambios[p.clave];
      return { data: cambio === null ? [] : [precioValido(p.clave, cambio)] };
    }
    if (metodo === "GET" && ruta === "products/search") return { data: [] };
    if (metodo === "POST" && ruta === "products") {
      return { id: `prod_${params.get("metadata[maven_clave]")}`, active: true, tax_code: params.get("tax_code") };
    }
    if (metodo === "POST" && ruta.startsWith("products/")) {
      return { id: ruta.slice("products/".length), active: true, tax_code: params.get("tax_code") };
    }
    if (metodo === "POST" && ruta === "prices") return { id: `nuevo_${params.get("metadata[maven_clave]")}` };
    throw new Error(`Llamada inesperada: ${metodo} ${ruta}`);
  };
  return { api, llamadas };
}

Deno.test("catálogo: rechaza la misma cifra si cambia moneda, periodicidad o tratamiento fiscal", () => {
  const valido = precioValido("equipo");
  assert(precioCoincide(valido, 29900, true));
  const incompatibles = [
    { currency: "eur" }, { unit_amount: 29901 }, { active: false },
    { tax_behavior: "exclusive" }, { tax_behavior: "unspecified" },
    { billing_scheme: "tiered" }, { transform_quantity: { divide_by: 5, round: "up" } },
    { custom_unit_amount: { enabled: true } }, { type: "one_time" }, { recurring: null },
    { recurring: { interval: "year", interval_count: 1, usage_type: "licensed" } },
    { recurring: { interval: "month", interval_count: 3, usage_type: "licensed" } },
    { recurring: { interval: "month", interval_count: 1, usage_type: "metered" } },
  ];
  for (const cambio of incompatibles) assertEquals(precioCoincide({ ...valido, ...cambio }, 29900, true), false, JSON.stringify(cambio));
  assert(precioCoincide(precioValido("setup"), 300000, false));
  assertEquals(precioCoincide(precioValido("setup", { recurring: valido.recurring }), 300000, false), false);
});

Deno.test("catálogo: reutiliza los precios del panel sin duplicarlos ni cobrar", async () => {
  const { api, llamadas } = simulador();
  const resultado = await prepararCatalogo(PRECIOS_BASE, api);
  assertEquals(resultado.precios.equipo, "price_equipo");
  assertEquals(resultado.precios.empresa, "price_empresa");
  assertEquals(resultado.precios.setup, undefined, "el antiguo precio de implementación no se publica para el alta");
  assertEquals(resultado.hecho.setup, "requiere_cotizacion");
  assertEquals(llamadas.filter((l) => l.metodo !== "GET"), []);
});

Deno.test("catálogo: corrige la categoría del producto incluso cuando el precio ya sirve", async () => {
  const { api, llamadas } = simulador({ equipo: { product: { id: "prod_equipo", active: true, tax_code: null } } });
  const resultado = await prepararCatalogo(PRECIOS_BASE, api);
  assertEquals(resultado.precios.equipo, "price_equipo");
  const escrituras = llamadas.filter((l) => l.metodo === "POST");
  assertEquals(escrituras.length, 1);
  assertEquals(escrituras[0].ruta, "products/prod_equipo");
  assertEquals(escrituras[0].params.get("tax_code"), CODIGO_FISCAL_SAAS_MAVEN);
});

Deno.test("catálogo: reemplaza un precio exclusivo sin alterar suscripciones existentes", async () => {
  const { api, llamadas } = simulador({ equipo: { tax_behavior: "exclusive" } });
  const precios = structuredClone(PRECIOS_BASE);
  precios.stripe.productos = { equipo: "prod_de_otra_cuenta" };
  const resultado = await prepararCatalogo(precios, api);
  assertEquals(resultado.precios.equipo, "nuevo_equipo");
  const escrituras = llamadas.filter((l) => l.metodo === "POST");
  assertEquals(escrituras.length, 1);
  const alta = escrituras[0];
  assertEquals(alta.ruta, "prices");
  assertEquals(alta.params.get("product"), "prod_equipo", "prevalece el producto real del precio");
  assertEquals(alta.params.get("unit_amount"), "29900");
  assertEquals(alta.params.get("tax_behavior"), "inclusive");
  assertEquals(alta.params.get("transfer_lookup_key"), "true");
  assert(alta.idem?.includes("price_equipo"));
});

Deno.test("catálogo: repetir el mismo reemplazo conserva la clave de idempotencia", async () => {
  const claves: (string | undefined)[] = [];
  for (let intento = 0; intento < 2; intento++) {
    const { api, llamadas } = simulador({ empresa: { tax_behavior: "unspecified" } });
    await prepararCatalogo(PRECIOS_BASE, api);
    claves.push(llamadas.find((l) => l.metodo === "POST" && l.ruta === "prices")?.idem);
  }
  assert(claves[0]);
  assertEquals(claves[0], claves[1]);
});

Deno.test("catálogo: no reactiva ni reutiliza un producto archivado", async () => {
  const { api, llamadas } = simulador({ equipo: { product: { id: "prod_equipo", active: false } } });
  await assertRejects(() => prepararCatalogo(PRECIOS_BASE, api), Error, "producto_stripe_inactivo:equipo");
  assertEquals(llamadas.filter((l) => l.metodo === "POST"), []);
});

Deno.test("catálogo: productos nuevos llevan solo categorías confirmadas y todos los precios incluyen impuestos", async () => {
  const { api, llamadas } = simulador({ equipo: null, empresa: null, setup: null, recarga: null });
  await prepararCatalogo(PRECIOS_BASE, api);
  const productos = llamadas.filter((l) => l.metodo === "POST" && l.ruta === "products");
  assertEquals(productos.map((p) => p.params.get("tax_code")), [CODIGO_FISCAL_SAAS_MAVEN, CODIGO_FISCAL_SAAS_MAVEN, null, null]);
  const precios = llamadas.filter((l) => l.metodo === "POST" && l.ruta === "prices");
  assertEquals(precios.map((p) => p.params.get("unit_amount")), ["29900", "59900", "2500"]);
  assert(!precios.some((p) => p.params.get("metadata[maven_clave]") === "setup"));
  assert(precios.every((p) => p.params.get("tax_behavior") === "inclusive"));
  assertEquals(parametrosPrecio(PRODUCTOS_MAVEN[2], "prod_setup", 300000).get("recurring[interval]"), null);
});
