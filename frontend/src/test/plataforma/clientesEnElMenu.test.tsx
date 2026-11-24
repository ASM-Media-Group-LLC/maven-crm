import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { decidirModo } from "@/lib/plataforma";
import { crearPlataformaSupabase, type ClienteDelEdificio } from "@/lib/plataforma/supabase";
import { claveDeError } from "@/lib/plataforma/tipos";
import { URL_PANEL_CLIENTES, veClientesEnKash } from "@/lib/panelDeClientes";
import diccionario from "@/lib/diccionario";

// «CLIENTES» Y EL PANEL REAL (19/11/2026).
//  1. «Clientes» en el menú de Kash: SOLO el dueño (tenant_owners); cargando o con error, no.
//     Abre app.maven-ai.me/plataforma afuera (la sesión de la plataforma es del navegador).
//  2. El panel real (supabase.ts) solo en una pestaña del edificio, y pide ser de la
//     plataforma o admin de un cliente; cualquier otro vuelve a /dashboard.
//  3. Lo que escribe sin la edge del edificio no finge: «Disponible cuando…».

const esDueno = vi.hoisted(() => ({ valor: null as boolean | null }));
vi.mock("@/hooks/useEsDueno", () => ({ useEsDueno: () => ({ esDueno: esDueno.valor, cargando: false, error: null }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" }, loading: false }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
vi.mock("@/components/ui/sidebar", () => ({
  SidebarMenuItem: ({ children }: { children: ReactNode }) => <li>{children}</li>,
  SidebarMenuButton: ({ children, asChild: _a, tooltip: _t, ...resto }: { children: ReactNode; asChild?: boolean; tooltip?: string } & Record<string, unknown>) =>
    _a ? <>{children}</> : <button type="button" {...resto}>{children}</button>,
}));
vi.mock("@/hooks/useLanguage", () => ({ useLanguage: () => ({ t: (k: string) => k }) }));

import { ClientesEnElMenu } from "@/components/dashboard/ClientesEnElMenu";

const fuentes = (import.meta as unknown as {
  glob: (p: string, o: Record<string, unknown>) => Record<string, string>;
}).glob("/frontend/src/{components/dashboard/DashboardSidebar.tsx,pages/plataforma/PlataformaRaiz.tsx,lib/i18n/navegacion.ts}", { query: "?raw", import: "default", eager: true });

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}><MemoryRouter><ul><ClientesEnElMenu /></ul></MemoryRouter></QueryClientProvider>,
  );
}

describe("1. «Clientes» en el menú de Kash: solo el dueño", () => {
  beforeEach(() => { esDueno.valor = null; });
  afterEach(cleanup);

  it("la regla: solo con la respuesta «sí, es dueño»", () => {
    expect(veClientesEnKash(true)).toBe(true);
    expect(veClientesEnKash(false)).toBe(false);
    expect(veClientesEnKash(null)).toBe(false);
  });
  it("no dueño (o sin saber): no aparece", () => {
    esDueno.valor = false;
    montar();
    expect(screen.queryByText("nav.clientes")).toBeNull();
    cleanup();
    esDueno.valor = null;
    montar();
    expect(screen.queryByText("nav.clientes")).toBeNull();
  });
  it("el dueño lo ve y abre app.maven-ai.me/plataforma en otra pestaña", async () => {
    esDueno.valor = true;
    const abrir = vi.spyOn(window, "open").mockImplementation(() => null);
    montar();
    fireEvent.click(screen.getByText("nav.clientes"));
    await vi.waitFor(() => expect(abrir).toHaveBeenCalledWith(URL_PANEL_CLIENTES, "_blank", "noopener"));
    expect(URL_PANEL_CLIENTES).toBe("https://app.maven-ai.me/plataforma");
    abrir.mockRestore();
  });
  it("en la app de computador, se abre en el navegador del equipo", async () => {
    esDueno.valor = true;
    const abrirEnNavegador = vi.fn().mockResolvedValue(true);
    const abrir = vi.spyOn(window, "open").mockImplementation(() => null);
    (window as unknown as { mavenEscritorio?: unknown }).mavenEscritorio = { esApp: true, abrirEnNavegador };
    try {
      montar();
      fireEvent.click(screen.getByText("nav.clientes"));
      await vi.waitFor(() => expect(abrirEnNavegador).toHaveBeenCalledWith(URL_PANEL_CLIENTES));
      expect(abrir).not.toHaveBeenCalled();
    } finally {
      delete (window as unknown as { mavenEscritorio?: unknown }).mavenEscritorio;
      abrir.mockRestore();
    }
  });
  it("está en el menú lateral, se llama «Clientes» y tiene su traducción", () => {
    expect(fuentes["/frontend/src/components/dashboard/DashboardSidebar.tsx"]).toContain("<ClientesEnElMenu />");
    expect(diccionario["nav.clientes"]).toEqual({ es: "Clientes", en: "Clients" });
    expect(diccionario["plataforma.nav.clientes"]?.es).toBe("Clientes");
  });
  it("la cuenta de la plataforma tiene «Clientes» en su menú de la izquierda", () => {
    const raiz = fuentes["/frontend/src/pages/plataforma/PlataformaRaiz.tsx"];
    expect(raiz).toMatch(/<aside[^>]*data-menu-plataforma/);
    expect(raiz).toMatch(/<NavLink to="\/plataforma" end className=\{enlace\}><LayoutGrid className="h-4 w-4" \/>\{t\("plataforma\.nav\.clientes"\)\}<\/NavLink>/);
  });
});

describe("2. el panel real: solo en el edificio y solo para la plataforma", () => {
  it("sin mock pedido, el modo real solo en una pestaña del edificio", () => {
    expect(decidirModo({ dev: false, busqueda: "", recordado: null, edificio: true })).toBe("edificio");
    expect(decidirModo({ dev: false, busqueda: "", recordado: null, edificio: false })).toBe("apagada");
    expect(decidirModo({ dev: false, busqueda: "", recordado: null })).toBe("apagada");
    // El mock sigue siendo solo con bandera.
    expect(decidirModo({ dev: false, busqueda: "?plataforma=mock", recordado: null, edificio: true })).toBe("edificio");
    expect(decidirModo({ bandera: "mock", dev: false, busqueda: "", recordado: null, edificio: true })).toBe("mock");
  });
  it("PlataformaRaiz: edificio → datos reales con sesión; sin permiso → /dashboard", () => {
    const raiz = fuentes["/frontend/src/pages/plataforma/PlataformaRaiz.tsx"];
    expect(raiz).toMatch(/modo === "edificio"\) return <CasaDelEdificio \/>/);
    expect(raiz).toMatch(/crearPlataformaSupabase\(supabase as unknown as ClienteDelEdificio\)/);
    expect(raiz).toMatch(/if \(!user\) return <Navigate to=\{`\/login\?returnTo=/);
    expect(raiz).toMatch(/claveDeError\(p\.errorYo\) === "sin_permiso"\) return <Navigate to="\/dashboard" replace \/>/);
  });

  function cliente(rpc: Record<string, unknown>, invoke: () => Promise<{ data: unknown; error: unknown }> = async () => ({ data: null, error: { message: "Function not found" } })) {
    return {
      rpc: async (fn: string) => (fn in rpc ? { data: rpc[fn], error: null } : { data: null, error: { message: `falta ${fn}` } }),
      from: () => { throw new Error("no"); },
      functions: { invoke },
    } as unknown as ClienteDelEdificio;
  }

  it("quién soy: dueño, Grace y admin del cliente entran; nadie más", async () => {
    const yo = (tipo: string | null, org: string | null = null) =>
      crearPlataformaSupabase(cliente({ quien_soy_en_la_plataforma: { user_id: "u", nombre: "N", correo: "c@x", tipo, organizacion_id: org } })).quienSoy();
    expect((await yo("dueno")).tipo).toBe("dueno");
    expect((await yo("admin_plataforma")).tipo).toBe("admin_plataforma");
    expect(await yo("admin_cliente", "org-1")).toMatchObject({ tipo: "admin_cliente", organizacion_id: "org-1" });
    await expect(yo(null)).rejects.toSatisfy((e: unknown) => claveDeError(e) === "sin_permiso");
  });
  it("un fallo al preguntar NO es «sin permiso» (se reintenta)", async () => {
    const p = crearPlataformaSupabase(cliente({}));
    await expect(p.quienSoy()).rejects.toSatisfy((e: unknown) => claveDeError(e) !== "sin_permiso");
  });
  it("Tus clientes: lista real + la tarjeta de Kash con lo que falte en cero", async () => {
    const p = crearPlataformaSupabase(cliente({
      organizaciones_del_dueno: {
        clientes: [], ve_precios: true,
        externas: [{ id: "k", nombre: "Kash", logo_url: null, app_url: "https://app.maven-ai.me", actualizado_at: null, solo_mirar: true, resumen: { personas: 93, en_vivo: 12 } }],
      },
    }));
    const r = await p.organizacionesDelDueno();
    expect(r.clientes).toEqual([]);
    expect(r.externas[0].resumen).toMatchObject({ personas: 93, en_vivo: 12, nota_argos_hoy: null, argos_gastado_mes_usd: 0, necesita_de_ti: 0 });
  });
  it("Equipo de Maven se lee directo; lo que escribe sin la edge dice «no disponible»", async () => {
    const p = crearPlataformaSupabase(cliente({ equipo_de_maven: [{ user_id: "u", nombre: "R", correo: "rusin24@gmail.com", nivel: "dueno", estado: "activa", ultimo_ingreso: null }] }));
    expect((await p.equipoMaven())[0].nivel).toBe("dueno");
    await expect(p.agregarAdminPlataforma("Grace", "g@x")).rejects.toSatisfy((e: unknown) => claveDeError(e) === "no_disponible");
  });
});
