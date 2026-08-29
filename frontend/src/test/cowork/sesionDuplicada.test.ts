import { describe, it, expect } from "vitest";
import { DisconnectReason } from "livekit-client";
import { debeReintentar, esOtraPestana } from "@/lib/sesionDuplicada";

// La regla que evita la pelea infinita entre dos pestañas de la misma cuenta.
//
// El bug real: el monitor trataba TODA desconexión como corte de red y volvía a
// conectar. Cuando la desconexión era "te sacaron porque entraste en otra
// pestaña", reconectar pateaba a la otra, que reconectaba y pateaba a esta.
// `disconnect from room` cada ocho segundos, para siempre.
//
// Lo que estos tests fijan es la DISTINCIÓN, que es lo único que importa acá:
// el corte de red se reintenta (si no, Cowork no sobrevive a un wifi malo) y la
// identidad duplicada no se reintenta nunca.

describe("por qué nos desconectó LiveKit", () => {
  it("identidad duplicada = nos la tomaron desde otro lado", () => {
    expect(esOtraPestana(DisconnectReason.DUPLICATE_IDENTITY)).toBe(true);
  });

  it("un corte de red NO es otra pestaña", () => {
    expect(esOtraPestana(DisconnectReason.UNKNOWN_REASON)).toBe(false);
    expect(esOtraPestana(DisconnectReason.SERVER_SHUTDOWN)).toBe(false);
    expect(esOtraPestana(undefined)).toBe(false);
  });

  it("colgar uno mismo tampoco lo es", () => {
    expect(esOtraPestana(DisconnectReason.CLIENT_INITIATED)).toBe(false);
  });
});

describe("cuándo reconectar solo", () => {
  it("NO se reintenta si nos la tomaron: reintentar ES el bucle", () => {
    expect(debeReintentar(DisconnectReason.DUPLICATE_IDENTITY)).toBe(false);
  });

  it("un corte de red sí se reintenta", () => {
    expect(debeReintentar(DisconnectReason.SERVER_SHUTDOWN)).toBe(true);
  });

  it("ante una razón desconocida se reintenta", () => {
    // Quedarse sin supervisión EN SILENCIO es peor que un reintento de más:
    // el supervisor cree que está mirando una sala vacía cuando en realidad
    // está llena y trabajando. Por eso la regla es una negación y no una lista
    // de casos permitidos.
    expect(debeReintentar(undefined)).toBe(true);
    expect(debeReintentar(999)).toBe(true);
  });

  it("es exactamente la negación de la otra: no hay un tercer camino", () => {
    for (const r of [
      DisconnectReason.UNKNOWN_REASON,
      DisconnectReason.CLIENT_INITIATED,
      DisconnectReason.DUPLICATE_IDENTITY,
      DisconnectReason.SERVER_SHUTDOWN,
      DisconnectReason.PARTICIPANT_REMOVED,
      DisconnectReason.ROOM_DELETED,
    ]) {
      expect(debeReintentar(r)).toBe(!esOtraPestana(r));
    }
  });
});
