// LA VENTANITA DEL SUPERVISOR HUB (Alvaro, 19/11/2026). Guardas de lo decidido:
//
//  1. «Tu internet está débil» solo cuando la llamada se cae de verdad
//     (reconectando o LOST más de 20 s). Un bajón a POOR no muestra nada.
//  2. La ventanita flotante se agranda (esquina + tres tamaños), no baja del
//     mínimo, no se sale de la pantalla y vuelve a Cowork.
//  3. Las flechas < > de cambiar de sala preguntan antes.
//  5. Quien comparte ve su propia pantalla en un cuadrito, con «Dejar de compartir».
//
// Las fuentes se leen con import.meta.glob (ruta y opciones literales).
import { describe, it, expect } from "vitest";
import { ConnectionQuality, ConnectionState } from "livekit-client";
import { DEBIL_INICIAL, DEBIL_SOSTENIDO_MS, MIRAR_DEBIL_CADA_MS, llamadaCaida, siguienteDebil } from "@/lib/internetDebil";
import { MINIMO_FLOTANTE, TAMANOS_FLOTANTE, acotarTamano, siguienteTamano } from "@/lib/ventanitaFlotante";

const fuentes = import.meta.glob([
  "/frontend/src/pages/messenger/videocall/LiveKitCallView.tsx",
  "/frontend/src/pages/messenger/videocall/MiPantallaCompartida.tsx",
  "/frontend/src/components/PersistentCallProvider.tsx",
  "/frontend/src/pages/cowork/CoworkHostDashboard.tsx",
], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const leer = (fin: string) => Object.entries(fuentes).find(([ruta]) => ruta.endsWith(fin))?.[1] ?? "";

/** Corre el vigía cada 2 s durante `ms` con la misma lectura. */
function sostener(estado: ConnectionState, calidad: ConnectionQuality, ms: number) {
  let e = DEBIL_INICIAL;
  for (let t = 0; t <= ms; t += MIRAR_DEBIL_CADA_MS) e = siguienteDebil(e, llamadaCaida(estado, calidad), t);
  return e.mostrando;
}

describe("1. internet débil: solo con la llamada caída de verdad", () => {
  it("POOR solo, aunque dure minutos, no muestra nada", () => {
    expect(llamadaCaida(ConnectionState.Connected, ConnectionQuality.Poor)).toBe(false);
    expect(sostener(ConnectionState.Connected, ConnectionQuality.Poor, 5 * 60_000)).toBe(false);
  });

  it("perdida (LOST) o reconectando más de 20 s: sí avisa", () => {
    expect(sostener(ConnectionState.Connected, ConnectionQuality.Lost, DEBIL_SOSTENIDO_MS + 2_000)).toBe(true);
    expect(sostener(ConnectionState.Reconnecting, ConnectionQuality.Unknown, DEBIL_SOSTENIDO_MS + 2_000)).toBe(true);
    expect(sostener(ConnectionState.SignalReconnecting, ConnectionQuality.Good, DEBIL_SOSTENIDO_MS + 2_000)).toBe(true);
  });

  it("un corte corto (menos de 20 s) no avisa", () => {
    expect(sostener(ConnectionState.Reconnecting, ConnectionQuality.Unknown, 10_000)).toBe(false);
    expect(DEBIL_SOSTENIDO_MS).toBeGreaterThanOrEqual(20_000);
  });

  it("en la ventanita el aviso es una línea fina, en su fila y no encima del video", () => {
    const s = leer("videocall/LiveKitCallView.tsx");
    expect(s).toContain('t("messenger.callView.internetDebilCorto")');
    const corto = s.slice(s.indexOf("{lk.internetDebil && !salaCaida && ("), s.indexOf('t("messenger.callView.internetDebilCorto")'));
    expect(corto).toContain("shrink-0");
    expect(corto).toContain("whitespace-nowrap");
    expect(corto).not.toMatch(/\babsolute\b/);
  });
});

describe("2. la ventanita flotante se agranda y vuelve a Cowork", () => {
  it("tres tamaños que van en ciclo", () => {
    expect(TAMANOS_FLOTANTE).toHaveLength(3);
    const [chica, mediana, grande] = TAMANOS_FLOTANTE;
    expect(siguienteTamano(chica)).toBe(mediana);
    expect(siguienteTamano(mediana)).toBe(grande);
    expect(siguienteTamano(grande)).toBe(chica);
  });

  it("nunca baja del mínimo ni se sale de la pantalla", () => {
    expect(acotarTamano({ w: 100, h: 100 }, 1440, 900)).toEqual(MINIMO_FLOTANTE);
    expect(acotarTamano({ w: 5000, h: 5000 }, 1440, 900)).toEqual({ w: 1424, h: 884 });
    expect(MINIMO_FLOTANTE.w).toBeGreaterThanOrEqual(320);
    expect(MINIMO_FLOTANTE.h).toBeGreaterThanOrEqual(260);
  });

  it("botón «Volver a Cowork», doble clic, esquina para estirar y tamaño recordado", () => {
    const s = leer("components/PersistentCallProvider.tsx");
    expect(s).toContain('t("shared.floatCall.backToCowork")');
    expect(s).toContain("onDoubleClick={volverA ?");
    expect(s).toContain("onPointerDown={onResizeStart}");
    expect(s).toContain("onClick={ciclarTamano}");
    expect(s).toMatch(/localStorage\.setItem\(SIZE_KEY/);
    // El Hub dice a dónde volver: a su misma sesión de Cowork.
    expect(leer("cowork/CoworkHostDashboard.tsx")).toContain("volverA: cowork.session?.id ? `/cowork?session=${cowork.session.id}` : \"/cowork\"");
  });
});

describe("3. las flechas < > de cambiar de sala preguntan antes", () => {
  it("las flechas solo abren la confirmación; el cambio va en «Cambiar de sala»", () => {
    const s = leer("videocall/LiveKitCallView.tsx");
    expect(s).toContain("onClick={() => setSalaPorConfirmar(anterior)}");
    expect(s).toContain("onClick={() => setSalaPorConfirmar(siguiente)}");
    expect(s).not.toContain("onClick={() => roomSwitcher.onSwitch(anterior.id)}");
    expect(s).not.toContain("onClick={() => roomSwitcher.onSwitch(siguiente.id)}");
    const dialogo = s.slice(s.indexOf("<AlertDialog open={!!salaPorConfirmar}"), s.indexOf("</AlertDialog>"));
    expect(dialogo).toContain('t("messenger.callView.confirmarSala.cambiar")');
    expect(dialogo).toContain("<AlertDialogCancel />");
    expect(dialogo).toContain("roomSwitcher.onSwitch(destino.id)");
  });
});

describe("5. tu propia pantalla compartida, como en Meet", () => {
  it("la vista dibuja el cuadrito cuando el participante local comparte", () => {
    const s = leer("videocall/LiveKitCallView.tsx");
    expect(s).toMatch(/\{localScreenShare && localScreenTrack && \(\s*<MiPantallaCompartida/);
    // Deja de compartir con la MISMA función que la barra de controles.
    expect(s).toContain("onDejar={() => { void alternarPantallaDesdeBoton(); }}");
    expect(s).toContain("onToggleScreenShare={salaCaida ? primeroReconectar : alternarPantallaDesdeBoton}");
  });

  it("la tarjeta: «Estás presentando a todos» SIN video (sin túnel), «Dejar de compartir», se esconde y avisa del negro", () => {
    const s = leer("videocall/MiPantallaCompartida.tsx");
    // Alvaro, 19/11/2026: como Meet pero sin la vista real (el túnel del 18/11).
    expect(s).not.toMatch(/<video/);
    expect(s).toContain('t("messenger.callView.miPantalla.presentando")');
    expect(s).toContain('t("messenger.callView.miPantalla.dejar")');
    // 26/11/2026: la pastilla dice «Estás compartiendo tu pantalla» completo.
    expect(s).toContain('t("messenger.callView.miPantalla.titulo")');
    expect(s).toContain('t("messenger.callView.miPantalla.negra")');
    expect(s).toContain("vigilarPantallaNegra(track, setNegraPropia)");
    expect(s).toMatch(/localStorage\.setItem\(CLAVE_OCULTA/);
  });
});
