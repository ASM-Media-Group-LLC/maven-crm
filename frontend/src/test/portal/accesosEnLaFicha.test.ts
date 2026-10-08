import { describe, expect, it } from "vitest";
import layout from "@/pages/portal/PortalLayout.tsx?raw";
import ficha from "@/pages/portal/PortalFicha.tsx?raw";
import app from "@/App.tsx?raw";
import { portal } from "@/lib/i18n/portal";

// «MIS ACCESOS» ES LA PRIMERA PARTE DE «MI FICHA» (Jhon, 08/10), no una pestaña
// del menú. Y a la creadora no se le dice que cada vista de su contraseña queda
// anotada: eso sigue registrándose, pero es para la agencia.

describe("Mis accesos dentro de Mi ficha", () => {
  it("no está en el menú del portal", () => {
    expect(layout).not.toMatch(/\/portal\/accesos/);
  });

  it("es la primera pestaña de la ficha, y la que se abre", () => {
    const i = ficha.indexOf('onClick={() => setSeccion("accesos")}');
    const j = ficha.indexOf("{SECCIONES.map((s) => {");
    expect(i, "no está la pestaña de accesos").toBeGreaterThan(-1);
    expect(i).toBeLessThan(j);
    expect(ficha).toMatch(/: "accesos",\n\s*\);/);
  });

  it("los enlaces viejos a /portal/accesos llevan a esa parte de la ficha", () => {
    expect(app).toMatch(/path="accesos" element=\{<Navigate to="\/portal\/ficha\?seccion=accesos" replace \/>\}/);
  });
});

describe("a ella no se le dice que queda anotado", () => {
  it("el aviso de seguridad no habla del registro", () => {
    const aviso = portal["portal.misAccesos.seguridad"];
    expect(aviso.es).not.toMatch(/anotad|registr/i);
    expect(aviso.en).not.toMatch(/logged|record/i);
  });
});
