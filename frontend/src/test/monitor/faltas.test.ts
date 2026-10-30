import { describe, it, expect } from "vitest";
import translations from "@/lib/i18n";
import {
  TIPOS_FALTA,
  TIPO_POR_CARA,
  TIPOS_IA,
  LABEL_FALTA,
  type FaltaTipo,
} from "@/lib/monitorFaltas";

// Guarda del monitor de cámara de Cowork. El defecto que evita: que se agregue
// (o renombre) un tipo de falta y quede SIN etiqueta traducida, saliendo el slug
// crudo ("camara_apagada") en el panel de RRHH; o que el mapeo del detector de
// cara apunte a un tipo que no existe. Ambas cosas rompen en silencio.

describe("catálogo de faltas del monitor", () => {
  it("cada estado de cara se mapea a un tipo que existe", () => {
    const fuera = Object.values(TIPO_POR_CARA).filter((tipo) => !TIPOS_FALTA.includes(tipo as FaltaTipo));
    expect(fuera, `tipos del detector de cara que no están en TIPOS_FALTA: ${fuera.join(", ")}`).toEqual([]);
  });

  it("cada tipo de falta tiene etiqueta traducida en el diccionario", () => {
    const sinClave = TIPOS_FALTA.filter((tipo) => {
      const clave = LABEL_FALTA[tipo];
      return !clave || !(clave in translations);
    });
    expect(sinClave, `tipos sin etiqueta en i18n: ${sinClave.join(", ")}`).toEqual([]);
  });

  it("los tipos de la IA son exactamente el contrato del edge monitor-vision", () => {
    // Si esto cambia, hay que cambiar faltaDe() en supabase/functions/monitor-vision.
    expect([...TIPOS_IA].sort()).toEqual(["celular", "distraido", "no_mira"]);
    for (const tipo of TIPOS_IA) expect(TIPOS_FALTA).toContain(tipo);
  });
});
