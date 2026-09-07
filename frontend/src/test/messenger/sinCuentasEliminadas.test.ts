// La regla de las bajas, en una sola prueba: una cuenta eliminada sigue
// resolviendo nombre y foto en el historial, pero NO se puede elegir.
//
// Si alguien "arregla" esto filtrando el mapa de perfiles de useChat, los
// mensajes de quien salió del equipo vuelven a quedar huérfanos — que es el
// bug que encontramos el 06/09 en Coordinadores PLUS (5 participantes sin
// perfil, todos bajas viejas).

import { describe, it, expect } from "vitest";
import { sinCuentasEliminadas } from "@/pages/messenger/sinCuentasEliminadas";

// Tipado explícito: con literales mezclados (uno sin `deleted_at`) TypeScript
// infiere el genérico como la intersección y se pierde `id`.
type Persona = { id: string; deleted_at?: string | null };

const activa: Persona = { id: "a", deleted_at: null };
const nunca: Persona = { id: "b" };
const enPapelera: Persona = { id: "c", deleted_at: "2026-09-07T18:23:49Z" };

describe("sinCuentasEliminadas", () => {
  it("deja pasar a quien está activo", () => {
    expect(sinCuentasEliminadas([activa, nunca]).map(p => p.id)).toEqual(["a", "b"]);
  });

  it("saca a quien está en la papelera", () => {
    expect(sinCuentasEliminadas([activa, enPapelera, nunca]).map(p => p.id)).toEqual(["a", "b"]);
  });

  it("una lista sin nadie eliminado queda igual", () => {
    expect(sinCuentasEliminadas([])).toEqual([]);
  });

  it("no muta la lista que recibe", () => {
    const lista = [activa, enPapelera];
    sinCuentasEliminadas(lista);
    expect(lista).toHaveLength(2);
  });
});
