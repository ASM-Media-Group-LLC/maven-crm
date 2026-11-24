// Prepara el catálogo sin crear clientes ni cobros. La persistencia de los IDs vive
// en index.ts; separar la API permite probar reintentos y precios incompatibles.
import { montoDeProducto, type Precios, PRODUCTOS_MAVEN } from "./logica.ts";
import type { Json, stripe } from "./stripe.ts";

type ProductoMaven = typeof PRODUCTOS_MAVEN[number];

/** El mismo importe no basta: USD 299/año o con impuestos adicionales sería otro precio. */
export function precioCoincide(precio: Json, monto: number, mensual: boolean): boolean {
  if (!precio.active || precio.currency !== "usd" || precio.unit_amount !== monto ||
      precio.billing_scheme !== "per_unit" || precio.tax_behavior !== "inclusive" ||
      precio.transform_quantity || precio.custom_unit_amount) return false;
  return mensual
    ? precio.type === "recurring" && precio.recurring?.interval === "month" &&
      precio.recurring?.interval_count === 1 && precio.recurring?.usage_type === "licensed"
    : precio.type === "one_time" && !precio.recurring;
}

/** Los precios exclusivos no se modifican: Stripe exige un precio nuevo. */
export function parametrosPrecio(producto: ProductoMaven, productoId: string, monto: number): URLSearchParams {
  const params = new URLSearchParams({
    product: productoId, currency: "usd", unit_amount: String(monto),
    tax_behavior: "inclusive", lookup_key: producto.lookup, transfer_lookup_key: "true",
    "metadata[maven]": "1", "metadata[maven_clave]": producto.clave,
  });
  if (producto.mensual) {
    params.set("recurring[interval]", "month");
    params.set("recurring[interval_count]", "1");
    params.set("recurring[usage_type]", "licensed");
  }
  return params;
}

export async function prepararCatalogo(precios: Precios, api: typeof stripe) {
  const productos: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const hecho: Record<string, string> = {};
  for (const p of PRODUCTOS_MAVEN) {
    const monto = montoDeProducto(precios, p.clave);
    const q = new URLSearchParams({ "lookup_keys[]": p.lookup, active: "true", "expand[]": "data.product" });
    const ya = (await api("GET", "prices", q)).data?.[0] as Json | undefined;
    // Primero el producto del precio encontrado: un ID guardado de otra cuenta
    // nunca debe reemplazarlo ni provocar un segundo producto con el mismo plan.
    let producto: Json | undefined = typeof ya?.product === "object" ? ya.product : undefined;
    const productoId = typeof ya?.product === "string" ? ya.product : precios.stripe.productos?.[p.clave];
    if (!producto && productoId) producto = await api("GET", `products/${encodeURIComponent(productoId)}`);
    if (!producto) {
      const buscado = await api("GET", "products/search", new URLSearchParams({
        query: `active:'true' AND metadata['maven_clave']:'${p.clave}'`,
      }));
      producto = buscado.data?.[0];
    }
    if (producto && (producto.deleted || !producto.active)) {
      throw new Error(`producto_stripe_inactivo:${p.clave}`);
    }
    if (!producto) {
      const params = new URLSearchParams({
        name: p.nombre, "metadata[maven]": "1", "metadata[maven_clave]": p.clave,
      });
      if (p.codigoFiscal) params.set("tax_code", p.codigoFiscal);
      producto = await api("POST", "products", params, { idem: `maven-producto-fiscal-v1-${p.clave}` });
    } else if (p.codigoFiscal) {
      const codigoActual = typeof producto.tax_code === "object" ? producto.tax_code?.id : producto.tax_code;
      if (codigoActual !== p.codigoFiscal) {
        producto = await api("POST", `products/${encodeURIComponent(producto.id)}`, new URLSearchParams({ tax_code: p.codigoFiscal }));
      }
    }
    if (!producto?.id) throw new Error(`producto_stripe_invalido:${p.clave}`);
    productos[p.clave] = producto.id;
    if (p.clave === "setup") {
      // No conserva el price_id anterior de USD 3.000 ni crea uno nuevo.
      // El plan se vende solo; la implementación se acuerda y cobra aparte.
      hecho[p.clave] = "requiere_cotizacion";
      continue;
    }
    if (ya && precioCoincide(ya, monto, p.mensual)) {
      ids[p.clave] = ya.id;
      hecho[p.clave] = "ya_estaba";
      continue;
    }
    const precio = await api("POST", "prices", parametrosPrecio(p, producto.id, monto), {
      // Los reintentos del mismo reemplazo no crean otro precio. Si vuelve a
      // cambiar el importe, el precio anterior distingue una nueva operación.
      idem: `maven-precio-inclusivo-v1-${p.clave}-${producto.id}-${monto}-${ya?.id ?? "nuevo"}`,
    });
    ids[p.clave] = precio.id;
    hecho[p.clave] = ya ? "precio_nuevo" : "creado";
  }
  return { productos, precios: ids, hecho };
}
