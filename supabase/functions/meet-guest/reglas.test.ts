import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  MAX_INTENTOS_POR_10MIN, MAX_RECHAZOS_POR_REUNION, SOLICITUD_VENCE_MS,
  estadoDelClaim, mismoNombre, solicitudVencida,
} from "./reglas.ts";

const AHORA = Date.parse("2026-10-05T15:00:00Z");
const hace = (ms: number) => new Date(AHORA - ms).toISOString();

Deno.test("la reunión terminada gana: un pendiente ya no espera, se le dice que terminó", () => {
  assertEquals(
    estadoDelClaim({ status: "pending", left_at: null, created_at: hace(60_000) }, { status: "ended" }, AHORA),
    "ended",
  );
  // Y también a quien ya estaba admitido pero todavía no había entrado.
  assertEquals(
    estadoDelClaim({ status: "admitted", left_at: null, created_at: hace(60_000) }, { status: "ended" }, AHORA),
    "ended",
  );
});

Deno.test("quien colgó o canceló recibe `left`, pase lo que pase con la reunión", () => {
  assertEquals(
    estadoDelClaim({ status: "admitted", left_at: hace(1000), created_at: hace(60_000) }, { status: "active" }, AHORA),
    "left",
  );
  assertEquals(
    estadoDelClaim({ status: "pending", left_at: hace(1000), created_at: hace(60_000) }, { status: "ended" }, AHORA),
    "left",
  );
});

Deno.test("sin reunión (borrada) la solicitud no existe para nadie", () => {
  assertEquals(estadoDelClaim({ status: "pending", left_at: null, created_at: hace(1000) }, null, AHORA), "sin_reunion");
});

Deno.test("un pendiente reciente sigue pendiente; uno de hace más de dos horas venció", () => {
  assertEquals(
    estadoDelClaim({ status: "pending", left_at: null, created_at: hace(SOLICITUD_VENCE_MS - 1000) }, { status: "active" }, AHORA),
    "pending",
  );
  assertEquals(
    estadoDelClaim({ status: "pending", left_at: null, created_at: hace(SOLICITUD_VENCE_MS) }, { status: "active" }, AHORA),
    "vencida",
  );
});

Deno.test("rechazado y admitido se contestan como siempre con la reunión viva", () => {
  assertEquals(estadoDelClaim({ status: "denied", left_at: null, created_at: hace(1000) }, { status: "active" }, AHORA), "denied");
  assertEquals(estadoDelClaim({ status: "admitted", left_at: null, created_at: hace(1000) }, { status: "active" }, AHORA), "admitir");
});

Deno.test("solicitudVencida tolera una fecha rota sin tirar ni vencer", () => {
  assertEquals(solicitudVencida("no es fecha", AHORA), false);
  assertEquals(solicitudVencida(hace(SOLICITUD_VENCE_MS + 1), AHORA), true);
});

Deno.test("mismoNombre: mayúsculas, acentos y espacios no distinguen personas; letras sí", () => {
  assert(mismoNombre("José  Pérez", "jose perez"));
  assert(mismoNombre(" Ana ", "ana"));
  assert(!mismoNombre("Ana", "Ana María"));
  assert(!mismoNombre("Luis", "Luisa"));
});

Deno.test("los topes son los decididos el 05/10/2026", () => {
  assertEquals(MAX_INTENTOS_POR_10MIN, 20);
  assertEquals(MAX_RECHAZOS_POR_REUNION, 2);
  assertEquals(SOLICITUD_VENCE_MS, 2 * 60 * 60 * 1000);
});
