import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

// GUARD de «Links de subida → Creadoras» (Alvaro, 10/11/2026: dejar Dropbox;
// «crear las 63 y pasarme la lista»). Cada creadora activa con su link
// personal: el mensaje y el WhatsApp salen listos para que ALVARO los mande
// (nadie publica por él); la que no tiene carpeta ofrece crearla; un fallo se
// dice como fallo.

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
vi.mock("@/hooks/useLanguage", () => {
  const idioma = {
    language: "es",
    t: (k: string, p?: Record<string, string | number>) => (p ? `${k} ${JSON.stringify(p)}` : k),
  };
  return { useLanguage: () => idioma, useLanguageSiHay: () => idioma };
});

import {
  enlaceDeWhatsapp, filtrarCreadoras, type FilaCreadora, LinksDeCreadorasVista, nombreDeCreadora, raicesDe,
} from "@/components/oficina/LinksDeCreadoras";

const fila = (artistico: string, extra: Partial<FilaCreadora> = {}): FilaCreadora => ({
  creator_id: `c-${artistico}`, nombre: `Nombre ${artistico}`, artistico, telefono: "+57 300 123 4567",
  carpeta_id: `d-${artistico}`, carpeta: artistico.toUpperCase(), raiz_id: "r-massive", raiz: "CONTENIDO MASSIVE",
  token: `tok${artistico}`, archivos: 3, bytes: 3_000_000, ultimo: "2026-11-10T12:00:00Z", usado_at: null, ...extra,
});

const envolver = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

describe("la lógica", () => {
  it("el WhatsApp va al número (solo dígitos) con el mensaje escrito; sin número no hay botón", () => {
    expect(enlaceDeWhatsapp("+57 300 123 4567", "Hola, Mimi")).toBe("https://wa.me/573001234567?text=Hola%2C%20Mimi");
    expect(enlaceDeWhatsapp(null, "x")).toBeNull();
    expect(enlaceDeWhatsapp("123", "x")).toBeNull();
  });

  it("el nombre es el artístico; si no hay, el real", () => {
    expect(nombreDeCreadora({ artistico: " Moramay ", nombre: "Athziri" })).toBe("Moramay");
    expect(nombreDeCreadora({ artistico: null, nombre: "valemartineez" })).toBe("valemartineez");
  });

  it("las carpetas donde crear una nueva son las de las demás, sin repetir", () => {
    const r = raicesDe([fila("a"), fila("b"), fila("c", { raiz_id: "r-plus", raiz: "CONTENIDO PLUS" }), fila("d", { raiz_id: null, raiz: null })]);
    expect(r).toEqual([{ id: "r-massive", nombre: "CONTENIDO MASSIVE" }, { id: "r-plus", nombre: "CONTENIDO PLUS" }]);
  });

  it("el buscador no distingue tildes ni mayúsculas", () => {
    const l = [fila("Celia Lora"), fila("Aimée", { carpeta: "MACKIIE89" })];
    expect(filtrarCreadoras(l, "aimee").map((f) => f.artistico)).toEqual(["Aimée"]);
    expect(filtrarCreadoras(l, "mackiie").map((f) => f.artistico)).toEqual(["Aimée"]);
  });
});

describe("la vista", () => {
  it("con link: «Copiar mensaje» y «Abrir WhatsApp» con el link personal adentro", () => {
    render(<LinksDeCreadorasVista filas={[fila("Mimi")]} cargando={false} fallo={false} onReintentar={() => {}} />, { wrapper: envolver });
    const li = screen.getByText("Mimi").closest("li")!;
    expect(within(li).getByRole("button", { name: /drive.creadoras.copiarMensaje/ })).toBeInTheDocument();
    const wa = within(li).getByRole("link", { name: /drive.creadoras.whatsapp/ });
    expect(wa.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/573001234567\?text=/);
    expect(decodeURIComponent(wa.getAttribute("href")!)).toContain("/aportar/tokMimi");
    expect(within(li).getByText("drive.creadoras.nuncaAbierto")).toBeInTheDocument();
  });

  it("sin carpeta: ofrece crearla en cada carpeta de contenido, y va al final", () => {
    render(
      <LinksDeCreadorasVista
        filas={[fila("SinNada", { carpeta_id: null, carpeta: null, raiz_id: null, raiz: null, token: null, archivos: 0 }), fila("Mimi")]}
        cargando={false} fallo={false} onReintentar={() => {}} />,
      { wrapper: envolver },
    );
    const filas = screen.getAllByRole("listitem");
    expect(filas[filas.length - 1]).toHaveTextContent("SinNada");
    expect(within(filas[filas.length - 1]).getByRole("button", { name: /drive.creadoras.crearEn.*CONTENIDO MASSIVE/ })).toBeInTheDocument();
  });

  it("con carpeta pero sin link: botón «Crear su link»", () => {
    render(<LinksDeCreadorasVista filas={[fila("Nueva", { token: null })]} cargando={false} fallo={false} onReintentar={() => {}} />, { wrapper: envolver });
    expect(screen.getByRole("button", { name: /drive.creadoras.crearLink/ })).toBeInTheDocument();
  });

  it("⚠️ si no carga lo DICE y ofrece reintentar (no «no hay creadoras»)", () => {
    render(<LinksDeCreadorasVista filas={undefined} cargando={false} fallo onReintentar={() => {}} />, { wrapper: envolver });
    expect(screen.getByRole("alert")).toHaveTextContent("drive.creadoras.fallo");
    expect(screen.queryByText("drive.creadoras.vacio")).not.toBeInTheDocument();
  });
});
