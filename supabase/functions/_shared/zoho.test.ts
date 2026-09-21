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
import { listAccounts, type ZohoAccount, type ZohoResult } from "./zoho.ts";

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
