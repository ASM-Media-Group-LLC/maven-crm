import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Jhon, 28/09: «en las etiquetas de correo de maven no tengo estas opciones de
// google… necesito que quede igual que en gmail». El menú ⋮ de la etiqueta:
// color (paleta y personalizado), mostrar / mostrar si no están leídas /
// ocultar, mostrar u ocultar en la lista de mensajes, modificar, eliminar y
// subetiquetas.

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));

const actualizar = vi.fn();
const borrar = vi.fn();
let etiquetasMock: EtiquetaDeCorreo[] = [];
vi.mock("@/hooks/useEtiquetasCorreo", async (original) => ({
  ...(await original<typeof import("@/hooks/useEtiquetasCorreo")>()),
  useEtiquetas: () => ({ data: etiquetasMock, isLoading: false }),
  useActualizarEtiqueta: () => ({ mutate: actualizar, isPending: false }),
  useBorrarEtiqueta: () => ({ mutate: borrar, isPending: false }),
  useCrearEtiqueta: () => ({ mutate: vi.fn(), isPending: false }),
}));

import {
  arbolDeEtiquetas, ramaDe, repartirEnColumna, type EtiquetaDeCorreo,
} from "@/hooks/useEtiquetasCorreo";
import { GRILLA_PERSONALIZADA, PALETA_RAPIDA } from "@/lib/correo/coloresEtiqueta";
import EtiquetasColumna from "@/components/correo/etiquetas/EtiquetasColumna";

const leer = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const mig = leer("supabase/migrations/20260928120000_correo_etiquetas_como_gmail.sql");

const et = (id: string, nombre: string, extra: Partial<EtiquetaDeCorreo> = {}): EtiquetaDeCorreo => ({
  id, nombre, parentId: null, color: null, enListaEtiquetas: "mostrar", enListaMensajes: true, ...extra,
});

// La lista de hex que acepta la API de Gmail (users.labels, color.*Color).
const HEX_DE_GMAIL = new Set(("#000000 #434343 #666666 #999999 #cccccc #efefef #f3f3f3 #ffffff #fb4c2f " +
  "#ffad47 #fad165 #16a766 #43d692 #4a86e8 #a479e2 #f691b3 #f6c5be #ffe6c7 #fef1d1 #b9e4d0 #c6f3de " +
  "#c9daf8 #e4d7f5 #fcdee8 #efa093 #ffd6a2 #fce8b3 #89d3b2 #a0eac9 #a4c2f4 #d0bcf1 #fbc8d9 #e66550 " +
  "#ffbc6b #fcda83 #44b984 #68dfa9 #6d9eeb #b694e8 #f7a7c0 #cc3a21 #eaa041 #f2c960 #149e60 #3dc789 " +
  "#3c78d8 #8e63ce #e07798 #ac2b16 #cf8933 #d5ae49 #0b804b #2a9c68 #285bac #653e9b #b65775 #822111 " +
  "#a46a21 #aa8831 #076239 #1a764d #1c4587 #41236d #83334c #464646 #e7e7e7 #0d3472 #b6cff5 #0d3b44 " +
  "#98d7e4 #3d188e #e3d7ff #711a36 #fbd3e0 #8a1c0a #f2b2a8 #7a2e0b #ffc8af #7a4706 #ffdeb5 #594c05 " +
  "#fbe983 #684e07 #fdedc1 #0b4f30 #b3efd3 #04502e #a2dcc1 #c2c2c2 #4986e7 #2da2bb #b99aff #994a64 " +
  "#f691b2 #ff7537 #ffad46 #662e37 #ebdbde #cca6ac #094228 #42d692 #16a765").split(" "));

describe("los colores son los de Gmail", () => {
  it("la paleta rápida y la grilla solo usan hex que Gmail acepta", () => {
    for (const par of PALETA_RAPIDA.flat()) {
      expect(HEX_DE_GMAIL.has(par.fondo), par.fondo).toBe(true);
      expect(HEX_DE_GMAIL.has(par.texto), par.texto).toBe(true);
    }
    for (const hex of GRILLA_PERSONALIZADA.flat()) expect(HEX_DE_GMAIL.has(hex), hex).toBe(true);
  });

  it("la grilla personalizada es de 8×8: grises, vivos y seis tonos", () => {
    expect(GRILLA_PERSONALIZADA).toHaveLength(8);
    for (const fila of GRILLA_PERSONALIZADA) expect(fila).toHaveLength(8);
    expect(GRILLA_PERSONALIZADA[0][0]).toBe("#000000");
    expect(GRILLA_PERSONALIZADA[0][7]).toBe("#ffffff");
  });

  it("la paleta rápida no repite combinaciones", () => {
    const claves = PALETA_RAPIDA.flat().map((p) => p.fondo + p.texto);
    expect(new Set(claves).size).toBe(claves.length);
  });
});

describe("⚠️ la migración", () => {
  it("guarda fondo y texto JUNTOS: sin color = los dos en NULL", () => {
    expect(mig).toMatch(/CHECK \(\(bg_color IS NULL\) = \(text_color IS NULL\)\)/);
  });

  it("borrar la madre borra sus subetiquetas, como Gmail", () => {
    expect(mig).toMatch(/parent_id uuid REFERENCES public\.mail_labels\(id\) ON DELETE CASCADE/);
  });

  it("el nombre es único DENTRO de su madre, y en el primer nivel también", () => {
    expect(mig).toMatch(/\(user_id, parent_id, nombre\) NULLS NOT DISTINCT/);
    expect(mig).toMatch(/DROP CONSTRAINT IF EXISTS mail_labels_user_id_nombre_key/);
  });

  it("un trigger frena los ciclos y las madres de otro buzón", () => {
    // La FK solo mira que el id exista; la RLS no mira la fila APUNTADA.
    expect(mig).toMatch(/WHERE id = NEW\.parent_id AND user_id = NEW\.user_id/);
    expect(mig).toMatch(/IF actual = NEW\.id THEN/);
    expect(mig).toMatch(/BEFORE INSERT OR UPDATE OF parent_id, user_id ON public\.mail_labels/);
  });

  it("⚠️ la columna vieja `color` NO se borra: el frontend anterior la lee mientras se despliega", () => {
    expect(mig).not.toMatch(/DROP COLUMN[^;]*\bcolor\b/);
  });

  it("las etiquetas que ya existían pasan a un color de Gmail", () => {
    expect(mig).toMatch(/UPDATE public\.mail_labels SET[\s\S]*WHERE bg_color IS NULL/);
  });
});

describe("el árbol de subetiquetas", () => {
  const todas = [
    et("p", "Pagos"), et("h", "Hubstaff"),
    et("r", "Reportes", { parentId: "h" }), et("a", "Altas", { parentId: "h" }),
    et("x", "Diario", { parentId: "r" }),
  ];

  it("cada madre seguida de sus hijas, alfabético en cada nivel, con la ruta de Gmail", () => {
    expect(arbolDeEtiquetas(todas).map((n) => [n.ruta, n.nivel])).toEqual([
      ["Hubstaff", 0], ["Hubstaff/Altas", 1], ["Hubstaff/Reportes", 1],
      ["Hubstaff/Reportes/Diario", 2], ["Pagos", 0],
    ]);
  });

  it("una hija huérfana sale en el primer nivel en vez de desaparecer", () => {
    expect(arbolDeEtiquetas([et("r", "Reportes", { parentId: "no-existe" })]).map((n) => n.ruta))
      .toEqual(["Reportes"]);
  });

  it("un ciclo no cuelga la columna", () => {
    const ciclo = [et("a", "A", { parentId: "b" }), et("b", "B", { parentId: "a" })];
    expect(() => arbolDeEtiquetas(ciclo)).not.toThrow();
  });

  it("la rama de una etiqueta incluye a sus nietas (no se ofrece anidarla ahí)", () => {
    expect([...ramaDe("h", todas)].sort()).toEqual(["a", "h", "r", "x"]);
  });
});

describe("qué se ve en la columna y qué queda oculto", () => {
  const repartir = (todas: EtiquetaDeCorreo[], o: { noLeidos?: [string, number][]; vista?: string; plegadas?: string[] } = {}) => {
    const r = repartirEnColumna(arbolDeEtiquetas(todas), {
      noLeidos: new Map(o.noLeidos ?? []),
      etiquetaVista: o.vista ?? null,
      plegadas: new Set(o.plegadas ?? []),
    });
    return { arriba: r.arriba.map((n) => n.etiqueta.id), enMas: r.enMas.map((n) => n.etiqueta.id) };
  };

  it("Ocultar la saca de la columna", () => {
    expect(repartir([et("a", "A"), et("b", "B", { enListaEtiquetas: "ocultar" })]))
      .toEqual({ arriba: ["a"], enMas: ["b"] });
  });

  it("«Mostrar si no están leídas» aparece solo con algo sin leer", () => {
    const todas = [et("a", "A", { enListaEtiquetas: "si_no_leidas" })];
    expect(repartir(todas).arriba).toEqual([]);
    expect(repartir(todas, { noLeidos: [["a", 2]] }).arriba).toEqual(["a"]);
  });

  it("⚠️ una madre «si no leídas» aparece si la que tiene correo nuevo es su HIJA", () => {
    const todas = [et("m", "M", { enListaEtiquetas: "si_no_leidas" }), et("h", "H", { parentId: "m" })];
    expect(repartir(todas).enMas).toEqual(["m", "h"]);
    expect(repartir(todas, { noLeidos: [["h", 1]] }).arriba).toEqual(["m", "h"]);
  });

  it("ocultar la madre se lleva a sus hijas", () => {
    const todas = [et("m", "M", { enListaEtiquetas: "ocultar" }), et("h", "H", { parentId: "m" })];
    expect(repartir(todas)).toEqual({ arriba: [], enMas: ["m", "h"] });
  });

  it("la etiqueta ABIERTA se ve aunque esté oculta", () => {
    expect(repartir([et("a", "A", { enListaEtiquetas: "ocultar" })], { vista: "a" }).arriba).toEqual(["a"]);
  });

  it("plegar la madre esconde a las hijas, pero no cuentan como ocultas", () => {
    const todas = [et("m", "M"), et("h", "H", { parentId: "m" })];
    expect(repartir(todas, { plegadas: ["m"] })).toEqual({ arriba: ["m"], enMas: [] });
  });
});

describe("el menú ⋮ de una etiqueta en la columna", () => {
  const montar = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={qc}>
        <EtiquetasColumna abierta etiquetaVista={null} onAbrir={vi.fn()} noLeidos={new Map()} />
      </QueryClientProvider>,
    );
  };
  const abrirMenu = async (ruta: string) => {
    fireEvent.keyDown(screen.getByRole("button", { name: `Opciones de ${ruta}` }), { key: "Enter" });
    return await screen.findByRole("menu");
  };

  beforeEach(() => {
    actualizar.mockReset();
    borrar.mockReset();
    localStorage.clear();
    etiquetasMock = [
      et("p", "Pagos", { color: { fondo: "#ffad46", texto: "#ffffff" } }),
      et("h", "Hubstaff"), et("r", "reportes", { parentId: "h" }),
    ];
  });

  it("tiene todas las opciones de Gmail, en su orden", async () => {
    montar();
    const menu = await abrirMenu("Pagos");
    const textos = Array.from(menu.querySelectorAll("[role^=menuitem]")).map((el) => el.textContent?.trim());
    expect(textos).toEqual([
      "aColor de etiqueta",
      "Mostrar", "Mostrar si no están leídas", "Ocultar",
      "Mostrar", "Ocultar",
      "Modificar", "Eliminar etiqueta", "Agregar subetiqueta",
    ]);
    expect(within(menu).getByText("En la lista de etiquetas")).toBeInTheDocument();
    expect(within(menu).getByText("En la lista de mensajes")).toBeInTheDocument();
  });

  it("«Ocultar» en la lista de etiquetas guarda en_lista_etiquetas", async () => {
    montar();
    const menu = await abrirMenu("Pagos");
    fireEvent.click(within(menu).getAllByRole("menuitemradio", { name: /Ocultar/ })[0]);
    expect(actualizar).toHaveBeenCalledWith(
      { id: "p", cambios: { enListaEtiquetas: "ocultar" } }, expect.anything(),
    );
  });

  it("«Ocultar» en la lista de mensajes guarda en_lista_mensajes = false", async () => {
    montar();
    const menu = await abrirMenu("Pagos");
    fireEvent.click(within(menu).getAllByRole("menuitemradio", { name: /Ocultar/ })[1]);
    expect(actualizar).toHaveBeenCalledWith(
      { id: "p", cambios: { enListaMensajes: false } }, expect.anything(),
    );
  });

  it("la opción elegida lleva el visto (aria-checked)", async () => {
    montar();
    const menu = await abrirMenu("Pagos");
    const radios = within(menu).getAllByRole("menuitemradio");
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["true", "false", "false", "true", "false"]);
  });

  it("la subetiqueta se ve anidada bajo su madre y el menú usa la ruta", async () => {
    montar();
    expect(screen.getByRole("button", { name: "Hubstaff/reportes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Opciones de Hubstaff/reportes" })).toBeInTheDocument();
  });

  it("«Eliminar etiqueta» pide confirmar y avisa que se van sus subetiquetas", async () => {
    montar();
    const menu = await abrirMenu("Hubstaff");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Eliminar etiqueta" }));
    const dialogo = await screen.findByRole("alertdialog");
    expect(dialogo).toHaveTextContent("Se quitará la etiqueta «Hubstaff» de todas las conversaciones");
    expect(dialogo).toHaveTextContent("También se eliminarán sus subetiquetas (1).");
    expect(borrar).not.toHaveBeenCalled();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(borrar).toHaveBeenCalledWith("h", expect.anything()));
  });

  it("⚠️ una etiqueta oculta NO se dibuja, y al pie no hay «Más» (Jhon: «quitame ese submenú»)", async () => {
    etiquetasMock = [et("p", "Pagos", { enListaEtiquetas: "ocultar" }), et("h", "HHRR")];
    montar();
    expect(screen.queryByRole("button", { name: "Pagos" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "HHRR" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Más" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Menos" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Administrar etiquetas" })).not.toBeInTheDocument();
    // Crear sigue estando: el + del encabezado.
    expect(screen.getAllByRole("button", { name: "Crear etiqueta nueva" })).toHaveLength(1);
  });
});
