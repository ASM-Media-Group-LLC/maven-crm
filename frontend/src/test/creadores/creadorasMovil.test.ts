// Contrato de teléfono para las dos pantallas que Jhon vio rotas en el iPhone
// (07/09/2026): el popup de la creadora y su perfil. Si alguien vuelve a poner
// la cabecera en una sola fila o las pestañas sin scroll, esto lo frena.
import { describe, it, expect } from "vitest";

const fuentes = (import.meta as unknown as {
  glob: (p: string[], o: Record<string, unknown>) => Record<string, string>;
}).glob(["/frontend/src/pages/creadores/ViewCreadorModal.tsx", "/frontend/src/pages/creadores/CreadorProfileContent.tsx", "/frontend/src/pages/creadores/CreadoresHeader.tsx", "/frontend/src/pages/creadores/CreadoresSubtabs.tsx", "/frontend/src/pages/creadores/onboarding/OnboardingContent.tsx", "/frontend/src/pages/creadores/onboarding/OnboardingTable.tsx", "/frontend/src/components/ui/subtab-nav.tsx"], { query: "?raw", import: "default", eager: true });
const fuente = (nombre: string) => {
  const k = Object.keys(fuentes).find((p) => p.endsWith(nombre));
  if (!k) throw new Error(`no encontré ${nombre}`);
  return fuentes[k];
};

// ¿Hay en el fuente alguna lista de clases que tenga TODAS estas? Mira cualquier
// cadena entre comillas, así vale igual el className="..." de la página que el
// cn("...") del componente base. No le importa el orden ni el resto de las
// clases: la guarda vieja exigía el literal "max-w-full overflow-x-auto" y se
// pudría con solo reordenar. Un token puede traer alternativas con "|".
const tieneClases = (src: string, ...clases: string[]) =>
  (src.match(/"[^"\n]*"/g) ?? [])
    .map((lit) => lit.slice(1, -1).split(/\s+/))
    .some((puestas) => clases.every((c) => c.split("|").some((alt) => puestas.includes(alt))));

describe("popup de la creadora (ViewCreadorModal)", () => {
  const s = fuente("ViewCreadorModal.tsx");
  it("deja margen lateral en el teléfono y vuelve a max-w-lg en escritorio", () => {
    expect(s).toContain("max-w-[calc(100vw-1.5rem)]");
    expect(s).toContain("sm:max-w-lg");
  });
  it("las pestañas se desplazan en vez de aplastarse", () => {
    expect(s).toMatch(/TabsList className="[^"]*overflow-x-auto/);
  });
  it("el pie queda en fila (Eliminar a la izquierda, Cerrar a la derecha)", () => {
    expect(s).toMatch(/DialogFooter className="flex-row/);
  });
});

describe("perfil de la creadora (CreadorProfileContent)", () => {
  const s = fuente("CreadorProfileContent.tsx");
  it("la cabecera se apila en el teléfono", () => {
    expect(s).toContain("flex flex-col items-center gap-4 sm:flex-row");
  });
  it("el nombre largo parte en vez de tapar", () => {
    expect(s).toMatch(/<h1 className="[^"]*break-words/);
  });
  it("la edad sale del helper con guard, no de una copia local", () => {
    expect(s).toContain('from "@/lib/edad"');
    expect(s).not.toMatch(/^function computeAge/m);
  });
});

describe("encabezado de Creadoras y Onboarding", () => {
  it("la fila de subtabs + acción envuelve (el botón no se sale de la pantalla)", () => {
    expect(fuente("CreadoresHeader.tsx")).toMatch(/<div className="flex flex-wrap items-center justify-between/);
  });
  it("en Onboarding nada hace scrollear la página de lado", () => {
    const s = fuente("OnboardingContent.tsx");
    // El cuerpo recorta a lo ancho: lo que mida más que el teléfono se desplaza
    // DENTRO de su caja, sin arrastrar la página.
    expect(s).toContain("overflow-x-hidden");
    // Los filtros (buscador + etapa + vista) envuelven en vez de empujar.
    expect(s).toMatch(/<div className="flex flex-wrap items-center gap-3">/);

    // Y lo que sí es más ancho que el teléfono tiene que poder desplazarse solo,
    // porque si no ese recorte le come el final:
    // 1) la tabla, lo único ancho del cuerpo.
    expect(tieneClases(fuente("OnboardingTable.tsx"), "overflow-auto|overflow-x-auto")).toBe(true);
    // 2) los subtabs, la única fila ancha que vive FUERA del cuerpo recortado
    //    (están en el encabezado compartido). Basta con que la protección esté
    //    en alguno de los archivos del árbol: hoy la pone el <SubtabNav> base y
    //    CreadoresSubtabs la repite. Esto antes se pedía como literal dentro de
    //    OnboardingContent, donde envolvía los chips de agencia; esos chips se
    //    quitaron a propósito en ea697908 (#1697) y la guarda quedó mirando al
    //    vacío sin que la página hubiera empeorado.
    const arbol = ["OnboardingContent.tsx", "CreadoresHeader.tsx", "CreadoresSubtabs.tsx", "subtab-nav.tsx"];
    expect(arbol.some((f) => tieneClases(fuente(f), "max-w-full", "overflow-x-auto"))).toBe(true);
  });
});
