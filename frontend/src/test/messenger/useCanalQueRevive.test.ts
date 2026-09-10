// POR QUÉ LOS AVISOS, EL CONTADOR Y LAS REACCIONES SE CONGELABAN TRAS UN CORTE.
//
// Ocho canales de realtime suscribían sin callback de estado. En realtime-js
// CLOSED es terminal: el rejoin automático cubre `errored`, no `closed`, y es
// justo como queda un canal cuando el socket se cae. Estos casos fijan la
// política de reconexión del hook que los reemplazó.

import { describe, it, expect } from "vitest";
import {
  esperaDeReconexion,
  ESTADOS_MUERTOS,
  TOPE_ESPERA_RECONEXION_MS,
} from "@/hooks/useCanalQueRevive";

describe("esperaDeReconexion", () => {
  it("crece al doble y se frena en el tope", () => {
    expect([0, 1, 2, 3].map(esperaDeReconexion)).toEqual([1_000, 2_000, 4_000, 8_000]);
    expect(esperaDeReconexion(4)).toBe(TOPE_ESPERA_RECONEXION_MS);
    expect(esperaDeReconexion(20)).toBe(TOPE_ESPERA_RECONEXION_MS);
  });

  it("el tope es el mismo que usa useChat (15 s): dos políticas distintas confunden", () => {
    expect(TOPE_ESPERA_RECONEXION_MS).toBe(15_000);
  });
});

describe("ESTADOS_MUERTOS", () => {
  it("incluye CLOSED, que es el terminal y el que nadie miraba", () => {
    expect(ESTADOS_MUERTOS.has("CLOSED")).toBe(true);
    expect(ESTADOS_MUERTOS.has("CHANNEL_ERROR")).toBe(true);
    expect(ESTADOS_MUERTOS.has("TIMED_OUT")).toBe(true);
  });

  it("SUBSCRIBED no es muerto", () => {
    expect(ESTADOS_MUERTOS.has("SUBSCRIBED")).toBe(false);
  });
});
