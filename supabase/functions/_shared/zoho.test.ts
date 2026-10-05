// Tests de la paginación de listAccounts.
//
// POR QUÉ EXISTEN: el 21/09/2026 se descubrió que `listAccounts()` pedía
// `/accounts` sin parámetros y Zoho devolvía 10 casillas de 68, porque su
// default de página es 10. Nadie lo vio en meses. El resto del módulo usa
// esa lista para DECIDIR —si una casilla existe antes de borrarla, cuántos
// puestos quedan, si una dirección está ocupada— así que una lista corta
// daba respuestas equivocadas en silencio. Nueve bajas de usuario seguidas
// dejaron la casilla de correo viva.
//
// Lo que estos tests protegen no es "que pagine": es que **nunca más se
// devuelva una lista incompleta como si estuviera completa**. Por eso el
// tercero es el importante: ante una página que falla, preferimos el error
// a una respuesta a medias.

import { assert, assertEquals } from "jsr:@std/assert";
import { hayPuestoDeCorreo, licenciasDelPlan, listAccounts, type ZohoAccount, type ZohoResult } from "./zoho.ts";

/** Fabrica N cuentas con emails distintos a partir de un desplazamiento. */
function cuentas(desde: number, cantidad: number): ZohoAccount[] {
  return Array.from({ length: cantidad }, (_, i) => ({
    accountId: `acc-${desde + i}`,
    zuid: desde + i,
    primaryEmailAddress: `persona${desde + i}@maven-ai.me`,
  }));
}

Deno.test("trae TODAS las páginas, no solo la primera", async () => {
  const pedidos: Array<{ start: number; limit: number }> = [];
  const res = await listAccounts((start, limit) => {
    pedidos.push({ start, limit });
    // Primera página llena, segunda parcial => hay que parar en la segunda.
    const lote = start === 0 ? cuentas(0, limit) : cuentas(limit, 68);
    return Promise.resolve({ ok: true, data: lote } as ZohoResult<ZohoAccount[]>);
  });

  assert(res.ok);
  assertEquals(res.data?.length, pedidos[0].limit + 68);
  assertEquals(pedidos.length, 2);
  assertEquals(pedidos[1].start, pedidos[0].limit);
});

Deno.test("pide un limit explícito y grande: nunca se apoya en el default de Zoho", async () => {
  // Éste es el guard del bug original. El default de Zoho es 10; si alguien
  // vuelve a dejar que la API decida el tamaño, esto se cae.
  let limitPedido = -1;
  await listAccounts((_start, limit) => {
    limitPedido = limit;
    return Promise.resolve({ ok: true, data: [] } as ZohoResult<ZohoAccount[]>);
  });
  assert(
    limitPedido >= 200,
    `listAccounts pidió limit=${limitPedido}; tiene que pedir uno explícito y holgado`,
  );
});

Deno.test("si una página falla, falla TODO (nada de listas a medias)", async () => {
  const res = await listAccounts((start, limit) =>
    Promise.resolve(
      start === 0
        ? ({ ok: true, data: cuentas(0, limit) } as ZohoResult<ZohoAccount[]>)
        : ({ ok: false, error: "TOKEN_EXPIRED", status: 401 } as ZohoResult<ZohoAccount[]>),
    )
  );

  assertEquals(res.ok, false);
  assertEquals(res.error, "TOKEN_EXPIRED");
  // Lo que NO puede pasar: devolver la primera página como si fuera todo.
  assertEquals(res.data, undefined);
});

Deno.test("deduplica y termina si `start` resulta ser 1-based (páginas solapadas)", async () => {
  // Zoho no documenta si `start` es desplazamiento o índice. Si fuera índice,
  // la segunda página repite la última fila de la primera. Sin dedup el
  // recorrido no terminaría de contar bien; con dedup, termina solo.
  let llamadas = 0;
  const res = await listAccounts((start, limit) => {
    llamadas++;
    // Siempre devuelve la MISMA página: el peor caso del solape total.
    return Promise.resolve({ ok: true, data: cuentas(0, limit) } as ZohoResult<ZohoAccount[]>);
  });

  assert(res.ok);
  const emails = new Set((res.data ?? []).map((a) => a.primaryEmailAddress));
  assertEquals(emails.size, res.data?.length, "no puede haber cuentas repetidas");
  assert(llamadas <= 2, `tenía que cortar al no ver nada nuevo; hizo ${llamadas} llamadas`);
});

Deno.test("una organización que entra en una sola página hace una sola llamada", async () => {
  let llamadas = 0;
  const res = await listAccounts((_start, _limit) => {
    llamadas++;
    return Promise.resolve({ ok: true, data: cuentas(0, 68) } as ZohoResult<ZohoAccount[]>);
  });
  assert(res.ok);
  assertEquals(res.data?.length, 68);
  assertEquals(llamadas, 1);
});

// ─── Licencias (Jhon, 06/10) ──────────────────────────────────────────────────
// El alta de Ana Escobar frenó con «No quedan puestos de correo en Zoho
// (63/10)»: el tope estaba fijo en 10 y el plan ya tenía 70 licencias. Ahora
// el tope lo dice Zoho (subscriptionInfo).

Deno.test("licencias: las del plan base; los extras de almacenamiento no son puestos (ejemplo de la doc de Zoho)", () => {
  assertEquals(licenciasDelPlan([
    { PLANNAME: "Mail Lite", PROPVALUE: 291, ALLOTEDUSER: 285 },
    { ADDONNAME: "10 gb", PROPVALUE: 1000, ALLOTEDUSER: 3 },
    { ADDONNAME: "15 gb", PROPVALUE: 1000, ALLOTEDUSER: 4 },
  ]), { compradas: 291, usadas: 285 });
});

Deno.test("licencias: números como texto, y un plan mixto suma sus planes base", () => {
  assertEquals(licenciasDelPlan([
    { PLANNAME: "Mail Lite", PROPVALUE: "60", ALLOTEDUSER: "55" },
    { PLANNAME: "Mail Premium", PROPVALUE: "10", ALLOTEDUSER: "8" },
  ]), { compradas: 70, usadas: 63 });
});

Deno.test("licencias: sin plan base, o con números ilegibles, no se sabe (null), no se inventa", () => {
  assertEquals(licenciasDelPlan([]), null);
  assertEquals(licenciasDelPlan(undefined), null);
  assertEquals(licenciasDelPlan([{ ADDONNAME: "10 gb", PROPVALUE: 1000, ALLOTEDUSER: 3 }]), null);
  assertEquals(licenciasDelPlan([{ PLANNAME: "Mail Lite", PROPVALUE: "muchas", ALLOTEDUSER: 3 }]), null);
  assertEquals(licenciasDelPlan([{ PLANNAME: "Mail Lite", ALLOTEDUSER: 3 }]), null);
});

Deno.test("hay puesto: 63 de 70 sí (el caso de Ana), 70 de 70 no, y si Zoho no lo dijo, no se frena", () => {
  assertEquals(hayPuestoDeCorreo({ compradas: 70, usadas: 63 }), true);
  assertEquals(hayPuestoDeCorreo({ compradas: 70, usadas: 70 }), false);
  assertEquals(hayPuestoDeCorreo({ compradas: 70, usadas: 71 }), false);
  assertEquals(hayPuestoDeCorreo(null), true);
});

Deno.test("⚠️ el alta ya no trae un tope fijo: los puestos salen de Zoho", () => {
  const alta = Deno.readTextFileSync(new URL("../admin-user-actions/index.ts", import.meta.url));
  assert(!/ZOHO_SEAT_LIMIT"\)\s*\?\?/.test(alta), "volvió el tope fijo (ZOHO_SEAT_LIMIT con un valor por defecto)");
  assert(!/Deno\.env\.get\("ZOHO_SEAT_LIMIT"\)/.test(alta), "volvió a leer ZOHO_SEAT_LIMIT");
  assert(/licenciasDeZoho\(\)/.test(alta) && /hayPuestoDeCorreo\(/.test(alta), "la guarda no consulta las licencias de Zoho");
});
