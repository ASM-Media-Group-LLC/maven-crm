import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/voz", () => ({ hablar: vi.fn(() => true) }));

import { encolarVoz, alFallarLaVoz, _reiniciarColaDeVoz } from "@/lib/colaDeVoz";
import { hablar } from "@/lib/voz";

const hablarMock = hablar as unknown as ReturnType<typeof vi.fn>;

// EL BUG QUE ESTO CUIDA (31/08/2026): el motor de voz de Chromium se trababa en
// el navegador del supervisor y dejaba de hablar TODO el turno. Recargar no lo
// destraba; hay que cerrar el navegador entero.
//
// La causa no era el navegador: era cuántas veces por segundo le pedíamos
// hablar. `hablar()` empieza cortando la frase anterior (`cancel()`), y los
// tres avisos del tablero recorren a TODA la gente en el mismo ciclo — con once
// chatters, hasta 33 `cancel()+speak()` en el mismo instante.
//
// El lado del chatter nunca fallaba porque se vigila a sí mismo: una frase cada
// 90 segundos. Mismo código, carga completamente distinta.
//
// Evidencia en la consola del supervisor: dos frases seguidas de la MISMA
// persona (cámara apagada + sin compartir pantalla), las dos con "se pidió
// hablar y nunca arrancó".

/** Termina la frase que está sonando ahora. */
function terminarFrase(como: "fin" | "error" | "nunca-arranco" = "fin") {
  const ultima = hablarMock.mock.calls.at(-1);
  ultima?.[1]?.onFin?.(como);
}
function arrancarFrase() {
  hablarMock.mock.calls.at(-1)?.[1]?.onInicio?.();
}
/** Deja pasar la ventana de agrupado. */
function pasarElLote() { vi.advanceTimersByTime(1_000); }
/** Deja pasar el aire entre frases. */
function pasarElAire() { vi.advanceTimersByTime(500); }

beforeEach(() => {
  vi.useFakeTimers();
  _reiniciarColaDeVoz();
  hablarMock.mockReset();
  hablarMock.mockReturnValue(true);
});
afterEach(() => { _reiniciarColaDeVoz(); vi.useRealTimers(); });

describe("agrupar por persona", () => {
  it("dos problemas de la misma persona son UNA frase, no dos que se pisan", () => {
    // Exactamente el caso de la consola.
    encolarVoz("Daniela Lopez", "tiene la cámara apagada y no marcó pausa");
    encolarVoz("Daniela Lopez", "lleva 8 minutos sin compartir pantalla");
    pasarElLote();

    expect(hablarMock).toHaveBeenCalledTimes(1);
    const frase = hablarMock.mock.calls[0][0] as string;
    expect(frase).toContain("tiene la cámara apagada");
    expect(frase).toContain("sin compartir pantalla");
    // El nombre se dice UNA vez, no una por problema.
    expect(frase.match(/Daniela Lopez/g)).toHaveLength(1);
  });

  it("no repite el mismo problema dos veces en el mismo lote", () => {
    encolarVoz("Ana", "está fuera de cuadro");
    encolarVoz("Ana", "está fuera de cuadro");
    pasarElLote();
    const frase = hablarMock.mock.calls[0][0] as string;
    expect(frase.match(/fuera de cuadro/g)).toHaveLength(1);
  });

  it("gente distinta son frases distintas", () => {
    encolarVoz("Ana", "está fuera de cuadro");
    encolarVoz("Beto", "no tiene luz suficiente");
    pasarElLote();
    expect(hablarMock).toHaveBeenCalledTimes(1);   // de a una
    expect(hablarMock.mock.calls[0][0]).toContain("Ana");
  });
});

describe("hablar de a UNA, que es lo que evita la ráfaga", () => {
  it("con once personas NO dispara once veces de golpe", () => {
    // La ráfaga que mataba el motor.
    for (let i = 0; i < 11; i++) encolarVoz(`Persona ${i}`, "tiene la cámara apagada");
    pasarElLote();
    expect(hablarMock).toHaveBeenCalledTimes(1);
  });

  it("la siguiente frase espera a que termine la anterior", () => {
    encolarVoz("Ana", "está fuera de cuadro");
    encolarVoz("Beto", "no tiene luz suficiente");
    pasarElLote();
    expect(hablarMock).toHaveBeenCalledTimes(1);

    // Todavía sonando: no se encima nada.
    vi.advanceTimersByTime(5_000);
    expect(hablarMock).toHaveBeenCalledTimes(1);

    arrancarFrase();
    terminarFrase("fin");
    pasarElAire();
    expect(hablarMock).toHaveBeenCalledTimes(2);
    expect(hablarMock.mock.calls[1][0]).toContain("Beto");
  });
});

describe("la cola nunca se traba", () => {
  it("si una frase NUNCA arranca, igual sigue con la próxima", () => {
    // Sin esto, una sola frase trabada callaría todos los avisos siguientes —
    // exactamente el fallo que estamos arreglando, pero por dentro.
    encolarVoz("Ana", "está fuera de cuadro");
    encolarVoz("Beto", "no tiene luz suficiente");
    pasarElLote();
    terminarFrase("nunca-arranco");
    pasarElAire();
    expect(hablarMock).toHaveBeenCalledTimes(2);
  });

  it("si el navegador no tiene voz, tampoco se traba", () => {
    hablarMock.mockReturnValue(false);
    encolarVoz("Ana", "está fuera de cuadro");
    encolarVoz("Beto", "no tiene luz suficiente");
    pasarElLote();
    pasarElAire();
    expect(hablarMock).toHaveBeenCalledTimes(2);
  });

  it("un error de una frase no detiene a la siguiente", () => {
    encolarVoz("Ana", "está fuera de cuadro");
    encolarVoz("Beto", "no tiene luz suficiente");
    pasarElLote();
    terminarFrase("error");
    pasarElAire();
    expect(hablarMock).toHaveBeenCalledTimes(2);
  });
});

describe("avisar que la voz está muerta", () => {
  it("después de varias frases que no arrancan, avisa UNA vez", () => {
    const aviso = vi.fn();
    alFallarLaVoz(aviso);

    encolarVoz("Ana", "a");
    encolarVoz("Beto", "b");
    encolarVoz("Carlos", "c");
    pasarElLote();

    terminarFrase("nunca-arranco");
    expect(aviso).not.toHaveBeenCalled();      // una sola puede ser casualidad
    pasarElAire();
    terminarFrase("nunca-arranco");
    expect(aviso).toHaveBeenCalledTimes(1);    // dos ya es el motor trabado
    pasarElAire();
    terminarFrase("nunca-arranco");
    expect(aviso).toHaveBeenCalledTimes(1);    // y no se repite a cada frase
  });

  it("si una frase SÍ arranca, se perdona lo anterior", () => {
    const aviso = vi.fn();
    alFallarLaVoz(aviso);

    encolarVoz("Ana", "a");
    encolarVoz("Beto", "b");
    encolarVoz("Carlos", "c");
    pasarElLote();

    terminarFrase("nunca-arranco");            // 1 falla
    pasarElAire();
    arrancarFrase();                           // la voz revivió
    terminarFrase("fin");
    pasarElAire();
    terminarFrase("nunca-arranco");            // vuelve a fallar, pero es la 1ª
    expect(aviso).not.toHaveBeenCalled();
  });

  it("desuscribirse funciona", () => {
    const aviso = vi.fn();
    const baja = alFallarLaVoz(aviso);
    baja();
    encolarVoz("Ana", "a");
    encolarVoz("Beto", "b");
    pasarElLote();
    terminarFrase("nunca-arranco");
    pasarElAire();
    terminarFrase("nunca-arranco");
    expect(aviso).not.toHaveBeenCalled();
  });
});

describe("entradas que no deberían llegar", () => {
  it("ignora persona o problema vacíos en vez de decir una frase rota", () => {
    encolarVoz("", "algo");
    encolarVoz("Ana", "");
    pasarElLote();
    expect(hablarMock).not.toHaveBeenCalled();
  });
});
