import { describe, it, expect } from "vitest";
// `?raw` alcanza: los dos archivos viven dentro de frontend/src. (Fuera de acá
// no llega, y por eso los otros guards leen con `fs`.)
import dialogo from "@/components/ui/dialog.tsx?raw";
import visor from "@/components/correo/AdjuntoVisor.tsx?raw";

// 18/09/2026: al abrir un adjunto salían DOS equis, una encima de la otra.
// `DialogContent` dibuja la suya y el visor dibujaba otra en su encabezado,
// junto a Descargar.
describe("el visor de adjuntos tiene UNA sola X", () => {
  it("el visor pide explícitamente que el diálogo no ponga la suya", () => {
    expect(visor).toMatch(/<DialogContent[\s\S]{0,400}?sinCerrar/);
  });

  it("el visor sigue dibujando la suya, en el encabezado", () => {
    expect(visor).toMatch(/aria-label="Cerrar"/);
  });

  it("⚠️ el diálogo la sigue poniendo por DEFECTO", () => {
    // Invertir el default dejaría sin X a los ~60 diálogos de Maven de una,
    // y ninguno de ellos dibuja la propia.
    expect(dialogo).toMatch(/\{!sinCerrar && <DialogPrimitive\.Close/);
    expect(dialogo).not.toMatch(/sinCerrar = true/);
  });
});
