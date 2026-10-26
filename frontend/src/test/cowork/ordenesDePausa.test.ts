// El bus de órdenes de pausa entre la página y la llamada (apagar cámara y
// micrófono al marcar pausa, reanudar al volver). Lo usan CoworkParticipantView
// y LiveKitCallView. Estas pruebas vivían en salaEnPausa.test.tsx hasta que la
// miniatura SalaEnPausa se retiró con el rediseño v5 del tablero (10/2026).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { suscribirOrdenesDePausa, pedirApagarPorPausa, pedirReanudarTrasPausa, ultimaOrdenDePausa, olvidarOrdenesDePausa } from "@/lib/ordenesDePausa";

describe("órdenes de pausa hacia la llamada", () => {
  beforeEach(() => olvidarOrdenesDePausa());
  it("la página avisa y la llamada se entera, en orden", () => {
    const visto: string[] = [];
    const baja = suscribirOrdenesDePausa((o) => visto.push(o));
    pedirApagarPorPausa();
    pedirReanudarTrasPausa();
    expect(visto).toEqual(["apagar", "reanudar"]);
    expect(ultimaOrdenDePausa()).toBe("reanudar");
    baja();
    pedirApagarPorPausa();
    expect(visto).toHaveLength(2);
  });
  it("un oyente que explota no frena a los demás", () => {
    const ok = vi.fn();
    const baja1 = suscribirOrdenesDePausa(() => { throw new Error("x"); });
    const baja2 = suscribirOrdenesDePausa(ok);
    pedirApagarPorPausa();
    expect(ok).toHaveBeenCalledWith("apagar");
    baja1(); baja2();
  });
});
