// GUARDAS DE LA PLATAFORMA MAVEN (paneles del dueño y del admin del cliente).
//
//  1. Los datos de ejemplo (mock) NUNCA se prenden en producción sin bandera: el
//     ?plataforma=mock solo vale en `npm run dev`; en el build de producción hace
//     falta VITE_PLATAFORMA=mock a propósito.
//  2. Nada fuera de la plataforma importa el mock, y la capa del edificio no usa
//     el cliente de Supabase de Kash (lsagslbkliprespbyhts no se toca).
//  3. Rutas: /plataforma/equipo es SOLO del dueño; el admin de un cliente nunca
//     entra a /plataforma; la plataforma necesita un cliente para /mi-empresa.
//  4. Grace (admin de plataforma) no ve precios ni cobros, ni en los datos ni en
//     la pantalla. «Mostrar a un cliente» también los esconde.
//  5. «Ver como» es solo lectura: todo lo que escribe tira «solo_lectura».
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, configure, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "@/hooks/useLanguage";
import { decidirModo, soloLectura, METODOS_QUE_ESCRIBEN, claveDeError, type PlataformaDatos } from "@/lib/plataforma";
import { crearPlataformaMock, CLAVE_IDENTIDAD_MOCK } from "@/lib/plataforma/mock";
import { destinoSinPermiso } from "@/lib/plataforma/acceso";
import { vePrecios } from "@/lib/plataforma/planes";
import { PlataformaProvider } from "@/pages/plataforma/contexto";
import PanelDueno from "@/pages/plataforma/PanelDueno";

configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 30_000 });

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) }),
    auth: { getSession: () => Promise.resolve({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  },
}));

const fuentes = (import.meta as unknown as {
  glob: (p: string, o: Record<string, unknown>) => Record<string, string>;
}).glob("/frontend/src/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true });

describe("1. el mock solo con bandera", () => {
  it("en producción el ?plataforma=mock se ignora", () => {
    expect(decidirModo({ dev: false, busqueda: "?plataforma=mock", recordado: "mock" })).toBe("apagada");
    expect(decidirModo({ dev: false, busqueda: "", recordado: null })).toBe("apagada");
  });
  it("con la bandera del build, o en dev con ?plataforma=mock, se prende", () => {
    expect(decidirModo({ bandera: "mock", dev: false, busqueda: "", recordado: null })).toBe("mock");
    expect(decidirModo({ dev: true, busqueda: "?plataforma=mock", recordado: null })).toBe("mock");
    expect(decidirModo({ dev: true, busqueda: "", recordado: "mock" })).toBe("mock");
    expect(decidirModo({ dev: true, busqueda: "?plataforma=apagada", recordado: "mock" })).toBe("apagada");
    expect(decidirModo({ dev: true, busqueda: "", recordado: null })).toBe("apagada");
  });
  it("con la plataforma apagada, la casa manda al tablero de siempre", () => {
    const raiz = fuentes["/frontend/src/pages/plataforma/PlataformaRaiz.tsx"];
    expect(raiz).toMatch(/modo === "apagada"\) return <Navigate to="\/dashboard" replace \/>/);
  });
});

describe("2. el mock y Kash, en su lugar", () => {
  it("nada fuera de la plataforma importa el mock", () => {
    const culpables = Object.entries(fuentes)
      .filter(([ruta]) => !/^\/frontend\/src\/(test\/|lib\/plataforma\/|pages\/plataforma\/)/.test(ruta))
      .filter(([, src]) => /from\s+["'][^"']*plataforma\/mock["']/.test(src))
      .map(([ruta]) => ruta);
    expect(culpables).toEqual([]);
  });
  it("la capa del edificio no usa el cliente de Supabase de Kash", () => {
    const capa = Object.entries(fuentes).filter(([ruta]) => ruta.startsWith("/frontend/src/lib/plataforma/"));
    expect(capa.length).toBeGreaterThan(3);
    for (const [ruta, src] of capa) {
      expect(src, ruta).not.toMatch(/(?:from\s+|import\()["'][^"']*integrations\/supabase\/client["']/);
    }
  });
});

describe("3. quién entra a qué pantalla", () => {
  const dueno = { tipo: "dueno" as const };
  const grace = { tipo: "admin_plataforma" as const };
  const cliente = { tipo: "admin_cliente" as const, organizacion_id: "org-nova" };
  it("Equipo de Maven: solo el dueño", () => {
    expect(destinoSinPermiso("equipo", dueno)).toBeNull();
    expect(destinoSinPermiso("equipo", grace)).toBe("/plataforma");
    expect(destinoSinPermiso("equipo", cliente)).toBe("/mi-empresa");
  });
  it("Tus clientes: dueño y Grace; el admin del cliente va a su empresa", () => {
    expect(destinoSinPermiso("clientes", dueno)).toBeNull();
    expect(destinoSinPermiso("clientes", grace)).toBeNull();
    expect(destinoSinPermiso("clientes", cliente)).toBe("/mi-empresa");
  });
  it("Mi empresa: el admin ve la suya; la plataforma necesita elegir un cliente", () => {
    expect(destinoSinPermiso("mi_empresa", cliente)).toBeNull();
    expect(destinoSinPermiso("mi_plan", cliente)).toBeNull();
    expect(destinoSinPermiso("mi_empresa", dueno)).toBe("/plataforma");
    expect(destinoSinPermiso("mi_empresa", grace, "org-nova")).toBeNull();
  });
  it("el admin de un cliente no lee otro cliente", async () => {
    const m = crearPlataformaMock({ identidad: () => "admin_cliente", latencia: 0 });
    await expect(m.resumenDeMiEmpresa("org-atlas")).rejects.toMatchObject({ clave: "sin_permiso" });
    await expect(m.organizacionesDelDueno()).rejects.toMatchObject({ clave: "sin_permiso" });
  });
});

describe("4. Grace no ve precios ni cobros", () => {
  it("en los datos", async () => {
    const m = crearPlataformaMock({ identidad: () => "admin_plataforma", latencia: 0 });
    const panel = await m.organizacionesDelDueno();
    expect(panel.ve_precios).toBe(false);
    expect(panel.clientes.length).toBeGreaterThanOrEqual(3);
    for (const c of panel.clientes) {
      expect(c.organizacion.plan?.precio_usd).toBeUndefined();
      expect(c.organizacion.plan?.setup_usd).toBeUndefined();
      expect(c.argos.argos_usd_mes ?? null).toBeNull();
    }
    const pagos = await m.planYPagos("org-nova");
    expect(pagos.ve_precios).toBe(false);
    expect(pagos.cobro).toBeNull();
    // Grace crea clientes (lo básico), pero no pone nada de dinero en la ficha.
    const nueva = await m.crearOrganizacion({ nombre: "Otra", dueno: { nombre: "Ana", correo: "ana@otra.co" }, idioma: "es", es_demo: true });
    await expect(m.guardarFicha(nueva, { precio_usd: 1 })).rejects.toMatchObject({ clave: "solo_dueno" });
    await expect(m.guardarFicha(nueva, { dias_prueba: 14 })).rejects.toMatchObject({ clave: "solo_dueno" });
    await expect(m.extenderPrueba("org-nova", 7)).rejects.toMatchObject({ clave: "solo_dueno" });
    const ficha = await m.fichaDe("org-nova");
    expect(ficha.ve_dinero).toBe(false);
    expect(ficha.ficha.dias_prueba).toBeUndefined();
    expect(ficha.plan?.precio_usd).toBeUndefined();
    await expect(m.iniciarRecarga("org-nova")).rejects.toMatchObject({ clave: "solo_dueno" });
    await expect(m.agregarAdminPlataforma("X", "x@y.co")).rejects.toMatchObject({ clave: "solo_dueno" });
  });
  it("el dueño sí", async () => {
    const m = crearPlataformaMock({ identidad: () => "dueno", latencia: 0 });
    const panel = await m.organizacionesDelDueno();
    expect(panel.ve_precios).toBe(true);
    expect(panel.clientes.find((c) => c.id === "org-nova")?.organizacion.plan?.precio_usd).toBe(599);
  });
  it("la regla de la pantalla", () => {
    expect(vePrecios({ tipo: "dueno" }, false)).toBe(true);
    expect(vePrecios({ tipo: "admin_cliente" }, false)).toBe(true);
    expect(vePrecios({ tipo: "admin_plataforma" }, false)).toBe(false);
    expect(vePrecios({ tipo: "dueno" }, true)).toBe(false);
  });

  describe("en la pantalla de Tus clientes", () => {
    beforeEach(() => { sessionStorage.clear(); });
    afterEach(() => { cleanup(); });
    const montar = async (como: string) => {
      sessionStorage.setItem(CLAVE_IDENTIDAD_MOCK, como);
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryClientProvider client={qc}>
          <LanguageProvider>
            <MemoryRouter initialEntries={["/plataforma"]}>
              <PlataformaProvider><PanelDueno /></PlataformaProvider>
            </MemoryRouter>
          </LanguageProvider>
        </QueryClientProvider>,
      );
      await screen.findAllByText("Nova Studio");
    };
    it("Grace: ni un precio", async () => {
      await montar("admin_plataforma");
      expect(document.querySelectorAll("[data-precio]").length).toBe(0);
      expect(document.body.textContent).not.toMatch(/USD (299|599)/);
    });
    it("dueño: ve el precio de cada cliente", async () => {
      await montar("dueno");
      expect(document.querySelectorAll("[data-precio]").length).toBeGreaterThan(0);
      expect(document.body.textContent).toMatch(/USD 599/);
    });
  });
});

describe("5. Ver como es solo lectura", () => {
  it("todo lo que escribe tira solo_lectura; leer sigue andando", async () => {
    const m = crearPlataformaMock({ identidad: () => "dueno", latencia: 0 });
    const ro = soloLectura(m);
    for (const metodo of METODOS_QUE_ESCRIBEN) {
      const f = ro[metodo] as (...a: unknown[]) => Promise<unknown>;
      await expect(f("org-nova", "x", "y"), metodo).rejects.toSatisfy((e: unknown) => claveDeError(e) === "solo_lectura");
    }
    expect((await ro.personas("org-nova")).length).toBe(18);
  });
  it("la lista de métodos que escriben está completa", () => {
    const lectura = new Set(["quienSoy", "organizacionesDelDueno", "pendientesDe", "fichaDe", "resumenDeMiEmpresa", "personas", "historial",
      "planYPagos", "equipoMaven", "todasLasPersonas"]);
    const m = crearPlataformaMock({ latencia: 0 }) as unknown as PlataformaDatos & { reiniciar: unknown };
    const escriben = Object.keys(m).filter((k) => k !== "reiniciar" && !lectura.has(k)).sort();
    expect(escriben).toEqual([...METODOS_QUE_ESCRIBEN].sort());
  });
});

describe("el plan lleno bloquea", () => {
  it("Atlas Dental (20/20) no deja agregar a nadie", async () => {
    const m = crearPlataformaMock({ identidad: () => "dueno", latencia: 0 });
    await expect(m.agregarPersona("org-atlas", { nombre: "Nueva Persona", correo: "nueva@atlasdental.com", rol: "empleado", idioma: "es" }))
      .rejects.toMatchObject({ clave: "plan_lleno" });
  });
  it("en preparación nadie recibe invitación hasta activar", async () => {
    const m = crearPlataformaMock({ identidad: () => "dueno", latencia: 0 });
    await expect(m.agregarPersona("org-demo", { nombre: "Ana Prueba", correo: "ana@demo.co", rol: "empleado", idioma: "es" }))
      .rejects.toMatchObject({ clave: "org_en_preparacion" });
    const r = await m.activarOrganizacion("org-demo");
    expect(r.invitado).toBe("corp@asmtech.me");
    expect((await m.pendientesDe("org-demo")).estado).toBe("activa");
  });
  it("un cliente nuevo no se activa hasta contestar la ficha y pagar o regalar el setup", async () => {
    const m = crearPlataformaMock({ identidad: () => "dueno", latencia: 0 });
    const id = await m.crearOrganizacion({ nombre: "Agencia Uno", dueno: { nombre: "Dueña Uno", correo: "duena@uno.co" }, idioma: "es", es_demo: false });
    const f0 = await m.fichaDe(id);
    expect(f0.estado).toBe("preparacion");
    expect(f0.faltan).toEqual(expect.arrayContaining(["plan", "precio", "dias_prueba", "dias_gracia", "forma_cobro", "setup", "silla_extra", "montaje", "contrato"]));
    await expect(m.activarOrganizacion(id)).rejects.toMatchObject({ clave: "faltan_pendientes" });
    await m.guardarFicha(id, { plan_nombre: "equipo", personas: 20, precio_usd: 299, dias_prueba: 14, dias_gracia: 7, forma_cobro: "link",
      setup_usd: 3000, silla_extra_usd: 15, montaje: "cliente", pide_contrato: false });
    expect((await m.fichaDe(id)).faltan).toEqual(["setup_sin_pagar"]);
    await expect(m.activarOrganizacion(id)).rejects.toMatchObject({ clave: "faltan_pendientes" });
    await m.guardarFicha(id, { setup_estado: "regalado" });
    expect((await m.fichaDe(id)).faltan).toEqual([]);
    const r = await m.activarOrganizacion(id);
    expect(r.invitado).toBe("duena@uno.co");
    expect(r.enlace).toMatch(/\/crear-contrasena#t=/);
    const f1 = await m.fichaDe(id);
    expect(f1.estado).toBe("activa");
    expect(f1.prueba_hasta).not.toBeNull();
    await m.pausarOrganizacion(id, "no pagó");
    expect((await m.fichaDe(id)).estado).toBe("pausada");
    await m.reactivarOrganizacion(id);
    expect((await m.fichaDe(id)).estado).toBe("activa");
  });
});
