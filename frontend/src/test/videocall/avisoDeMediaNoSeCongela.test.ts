// LA INVARIANTE DEL AVISO QUE MUEVE TIEMPO PAGO.
//
// El reloj de jornada de Cowork —el que reemplazó a Hubstaff— decide
// "trabajando" vs "cámara apagada" con el aviso que LiveKitCallView manda cada
// 10 s. Si ese aviso se congela, se mueve plata: pegado en false le roba horas
// a la persona, pegado en true se las regala a la empresa.
//
// Maria Villegas, 28/09/2026: cara visible en la grilla y el reloj diciendo
// "cámara apagada" 5 minutos. El efecto REPORTABA `camaraRealOn` pero sus
// DEPENDENCIAS miraban `localCamOn`, que es otra variable —y que queda clavada
// en false mientras se comparte pantalla, porque el primer recuadro que
// devuelve `tilesDeParticipante` es el de la PANTALLA, con `isCameraOff: true`
// escrito a mano—. La dependencia nunca cambiaba, el efecto no se re-ejecutaba,
// y el `setInterval` re-mandaba cada 10 s el valor atrapado en el closure.
//
// ⚠️ POR QUÉ ESTA GUARDA Y NO UNA PRUEBA DE COMPORTAMIENTO: se comprobó a mano
// que no alcanza. Sacando el ref y dejando las dependencias buenas, las dos
// pruebas de LiveKitCallView.test.tsx pasan igual (15/15): el ref no lo fijaba
// nada. Y dejando el ref con las dependencias rotas, solo falla una de las dos.
// Ninguna prueba de comportamiento puede distinguir las dos mitades mientras
// TODOS los datos reportados estén en las dependencias — que es justamente la
// condición que esta guarda existe para sostener hacia adelante.
import { describe, it, expect } from "vitest";

const fuentes = import.meta.glob(
  ["/frontend/src/pages/messenger/videocall/LiveKitCallView.tsx"],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

const leer = (final: string): string => {
  const clave = Object.keys(fuentes).find((k) => k.endsWith(final));
  if (!clave) throw new Error(`no se cargó el fuente ${final} (glob vacío)`);
  return fuentes[clave];
};

// Sin esto, una guarda que no carga nada pasa en verde sin comprobar nada.
// Ya nos pasó el 16/09 con otra.
describe("el fuente se cargó de verdad", () => {
  it("está y tiene cuerpo", () => {
    expect(Object.keys(fuentes)).toHaveLength(1);
    expect(leer("LiveKitCallView.tsx").length).toBeGreaterThan(5000);
    expect(leer("LiveKitCallView.tsx")).toContain("onMediaStateChangeRef");
  });
});

const s = leer("LiveKitCallView.tsx");

/** El bloque del efecto que reporta el estado de media, desde la asignación del
 *  ref hasta el cierre con su lista de dependencias. Devuelve "" si no está,
 *  en vez de tirar: tirar acá deja el archivo sin CARGAR, y un archivo que no
 *  carga reporta "Tests: no tests" —que se lee como verde si uno mira el
 *  renglón equivocado—. Cada prueba falla por su cuenta y con su nombre. */
const bloque = (() => {
  const desde = s.indexOf("mediaReportadaRef");
  if (desde < 0) return "";
  const hasta = s.indexOf("]);", s.indexOf("window.setInterval(avisar", desde));
  return hasta < 0 ? "" : s.slice(desde, hasta + 3);
})();

describe("⚠️ el aviso que mueve tiempo pago no se puede congelar", () => {
  it("el repetidor de 10 s lee el ref, NO un objeto del closure", () => {
    // Esta es la mitad que NINGUNA prueba de comportamiento fija hoy. Si alguien
    // la borra y vuelve a poner el objeto en línea, el repetidor queda otra vez
    // a merced de que la lista de dependencias esté completa.
    expect(bloque, "no está `mediaReportadaRef`: el repetidor volvió al closure").not.toBe("");
    expect(bloque).toMatch(
      /const avisar = \(\) => onMediaStateChangeRef\.current\?\.\(mediaReportadaRef\.current\)/,
    );
    const avisar = bloque.slice(bloque.indexOf("const avisar"));
    expect(avisar.slice(0, avisar.indexOf("\n"))).not.toContain("micOn:");
  });

  it("TODO dato que se reporta está en las dependencias", () => {
    // La invariante de verdad, y la que habría atajado el bug de Maria.
    const asignacion = bloque.match(/mediaReportadaRef\.current = \{([^}]*)\}/);
    expect(asignacion, "no se encontró la asignación del ref").toBeTruthy();
    const reportados = asignacion![1]
      .split(",")
      .map((p) => p.split(":")[1]?.trim())
      .filter(Boolean) as string[];
    // Que PUEDA fallar: si la extracción devuelve vacío, esto no probaría nada.
    expect(reportados.length).toBe(4);

    const deps = bloque.slice(bloque.lastIndexOf("}, ["));
    for (const valor of reportados) {
      expect(deps, `se reporta ${valor} pero no está en las dependencias`).toContain(valor);
    }
  });

  it("⚠️ se depende de `camaraRealOn`, nunca de `localCamOn`", () => {
    // El bug exacto, nombrado: `localCamOn` sale del primer recuadro, que al
    // compartir pantalla es el de la PANTALLA y trae `isCameraOff: true` fijo.
    const deps = bloque.slice(bloque.lastIndexOf("}, ["));
    expect(deps).toContain("camaraRealOn");
    expect(deps).not.toContain("localCamOn");
  });
});
