import { describe, it, expect, beforeEach } from "vitest";
import { loadNCPreference, saveNCPreference } from "@/lib/noise-suppression-processor";

// La cancelación de ruido arranca ACTIVADA, pero respeta a quien la apagó.
// Esto cuida las tres situaciones que importan: nunca eligió (activada), la
// apagó (apagada, y se queda así), la volvió a prender (activada).
describe("cancelación de ruido por defecto", () => {
  beforeEach(() => localStorage.clear());

  it("quien nunca eligió la tiene activada", () => {
    expect(loadNCPreference()).toBe(true);
  });

  it("quien la apagó queda apagado en ese navegador", () => {
    saveNCPreference(false);
    expect(loadNCPreference()).toBe(false);
  });

  it("y quien la vuelve a prender, prendida", () => {
    saveNCPreference(false);
    saveNCPreference(true);
    expect(loadNCPreference()).toBe(true);
  });
});
