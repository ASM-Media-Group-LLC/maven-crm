// Guía de conexión (/conexion, 17/11/2026): la página.
//
// Lo que se cuida:
//   · «Probar mi internet» corre la prueba REAL de la llamada (medirRed contra la
//     edge prueba-de-red, con la sesión de la persona) y una sola vez aunque se
//     toque dos veces;
//   · el resultado sale con su veredicto y el semáforo de cada medida;
//   · un fallo se dice como fallo (con reintentar), nunca como «internet malo»;
//   · los seis consejos y la salida a Cowork están siempre a la vista.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { PruebaDeRed } from "@/lib/pruebaDeRed";

const estado = vi.hoisted(() => ({
  llamadas: [] as { url: string; headers: Record<string, string> }[],
  resultado: null as PruebaDeRed | null,
  soltar: null as null | (() => void),
}));

vi.mock("@/integrations/supabase/client", () => ({
  SUPABASE_URL: "https://ejemplo.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_prueba",
  supabase: { auth: { getSession: () => Promise.resolve({ data: { session: { access_token: "token-de-prueba" } } }) } },
}));
vi.mock("@/lib/pruebaDeRed", async () => {
  const real = await vi.importActual<typeof import("@/lib/pruebaDeRed")>("@/lib/pruebaDeRed");
  return {
    ...real,
    medirRed: (o: { url: string; headers: Record<string, string> }) => {
      estado.llamadas.push(o);
      return new Promise<PruebaDeRed | null>((ok) => { estado.soltar = () => ok(estado.resultado); });
    },
  };
});
vi.mock("@/lib/llamadaActiva", () => ({ hayLlamadaActiva: () => false }));
vi.mock("@/lib/llamadaEnMaven", () => ({ estaEnLlamadaDeMaven: () => false }));
vi.mock("@/hooks/useLanguage", () => {
  const idioma = {
    language: "es",
    setLanguage: () => {},
    t: (k: string, p?: Record<string, string | number>) => (p ? `${k} ${JSON.stringify(p)}` : k),
  };
  return { useLanguage: () => idioma, useLanguageSiHay: () => idioma };
});
vi.mock("@/components/ui/page-header", () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));

import GuiaConexionPage from "@/pages/conexion/GuiaConexionPage";

const pintar = () => render(<MemoryRouter><GuiaConexionPage /></MemoryRouter>);
const prueba = (p: Partial<PruebaDeRed> = {}): PruebaDeRed => ({
  subida_mbps: 8.4, bajada_mbps: 31.4, ms: 280, at: "2026-11-17T12:00:00.000Z", ...p,
});

async function probarCon(resultado: PruebaDeRed | null) {
  estado.resultado = resultado;
  fireEvent.click(screen.getByRole("button", { name: /guiaConexion\.prueba\.boton/ }));
  await waitFor(() => expect(estado.soltar).not.toBeNull());
  estado.soltar!();
}

beforeEach(() => {
  estado.llamadas = [];
  estado.resultado = null;
  estado.soltar = null;
});

describe("Guía de conexión", () => {
  it("antes de probar: el botón, los seis consejos y la salida a Cowork", () => {
    pintar();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("guiaConexion.titulo");
    expect(screen.getByRole("button", { name: /guiaConexion\.prueba\.boton/ })).toBeTruthy();
    for (const c of ["cable", "router", "cerrar", "pestana", "reiniciar", "chrome"]) {
      expect(screen.getByText(`guiaConexion.consejo.${c}.titulo`)).toBeTruthy();
    }
    expect(screen.getByRole("link", { name: /guiaConexion\.caida\.irACowork/ }).getAttribute("href")).toBe("/cowork");
    // Sin prueba no hay veredicto ni semáforo inventado.
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText("guiaConexion.semaforo.bien")).toBeNull();
  });

  it("corre la prueba real con la sesión, una sola vez aunque se toque dos veces", async () => {
    pintar();
    const boton = screen.getByRole("button", { name: /guiaConexion\.prueba\.boton/ });
    fireEvent.click(boton);
    fireEvent.click(boton);
    await waitFor(() => expect(estado.llamadas).toHaveLength(1));
    expect(estado.llamadas[0].url).toBe("https://ejemplo.supabase.co/functions/v1/prueba-de-red");
    expect(estado.llamadas[0].headers.Authorization).toBe("Bearer token-de-prueba");
    expect((screen.getByRole("button", { name: /guiaConexion\.prueba\.probando/ }) as HTMLButtonElement).disabled).toBe(true);
    estado.resultado = prueba();
    estado.soltar!();
    await screen.findByRole("status");
    expect(estado.llamadas).toHaveLength(1);
  });

  it("buen internet: veredicto bien y las tres medidas en verde", async () => {
    pintar();
    await probarCon(prueba());
    const veredicto = await screen.findByRole("status");
    expect(within(veredicto).getByText("guiaConexion.veredicto.bien.titulo")).toBeTruthy();
    expect(screen.getAllByText("guiaConexion.semaforo.bien")).toHaveLength(3);
    expect(screen.getByText("8,4")).toBeTruthy();
    expect(screen.getByText("31")).toBeTruthy();
    expect(screen.getByText("280")).toBeTruthy();
    expect(screen.getByRole("button", { name: /guiaConexion\.prueba\.otraVez/ })).toBeTruthy();
  });

  it("subida que no alcanzó a terminar: veredicto malo y «menos de»", async () => {
    pintar();
    await probarCon(prueba({ subida_mbps: 0.4, subida_tope: true }));
    const veredicto = await screen.findByRole("status");
    expect(within(veredicto).getByText("guiaConexion.veredicto.malo.titulo")).toBeTruthy();
    expect(screen.getByText(/guiaConexion\.menosDe/)).toBeTruthy();
  });

  it("un fallo se dice como fallo y se puede reintentar, nunca como «internet malo»", async () => {
    pintar();
    await probarCon(null);
    const alerta = await screen.findByRole("alert");
    expect(within(alerta).getByText("guiaConexion.prueba.error")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText("guiaConexion.semaforo.malo")).toBeNull();
    // Reintentar vuelve a correr la prueba.
    fireEvent.click(screen.getByRole("button", { name: /guiaConexion\.prueba\.otraVez/ }));
    await waitFor(() => expect(estado.llamadas).toHaveLength(2));
  });
});
