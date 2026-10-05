import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { File as IconoArchivo, Folder } from "lucide-react";

// EL BUSCADOR DEL DRIVE (Jhon, 06/10: «ponle buscador»). El Drive no tenía
// dónde buscar: la búsqueda (drive_buscar) solo estaba en el diálogo «Abrir»
// de la Oficina. Ahora va arriba de la página, como en Google Drive.

vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({}) }),
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), getSession: async () => ({ data: { session: null } }) },
  },
}));

// drive_buscar simulado: qué texto se le pidió y qué devuelve.
const pedidos: string[] = [];
let respuesta: ResultadoDelDrive[] = [];
vi.mock("@/hooks/useDrive", async (original) => ({
  ...(await original<typeof import("@/hooks/useDrive")>()),
  useBuscarEnDrive: (q: string) => {
    pedidos.push(q);
    return q.trim().length >= 3
      ? { data: respuesta, isFetching: false, error: null }
      : { data: undefined, isFetching: false, error: null };
  },
}));
// Sin la espera de 250 ms: lo escrito se busca al instante.
vi.mock("@/hooks/useCommandSearch", async (original) => ({
  ...(await original<typeof import("@/hooks/useCommandSearch")>()),
  useDebouncedValue: <T,>(v: T) => v,
}));

import type { ResultadoDelDrive, UnidadConNombre } from "@/hooks/useDrive";
import BuscadorDelDrive from "@/pages/oficina/drive/BuscadorDelDrive";
import { moverMarca, vistaDeLaRaiz } from "@/lib/drive/buscador";
import { esAtajoDeBuscar } from "@/pages/oficina/drive/gestos";

const fuentes = (import.meta as unknown as {
  glob: (p: string[], o: Record<string, unknown>) => Record<string, string>;
}).glob(["/frontend/src/pages/oficina/DrivePage.tsx"], { query: "?raw", import: "default", eager: true });
const drivePage = Object.values(fuentes)[0] ?? "";

const YO = "u-yo";
const resultado = (id: string, nombre: string, tipo: "carpeta" | "archivo", ubicacion: string | null): ResultadoDelDrive => ({
  id, nombre, tipo, ubicacion, mime: null, size: 1000, estado: "listo", owner_id: null, parent_id: "p",
  created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-01T10:00:00Z", last_opened_at: null, trashed_at: null,
} as ResultadoDelDrive);
const KASH = [
  resultado("c1", "KASH 2026", "carpeta", "Unidades"),
  resultado("a1", "Kash Credentials OF.xlsx", "archivo", "michel.zarate@unlok.me"),
  resultado("a2", "Balance Kash.xlsx", "archivo", null),
];

function montar() {
  const onAbrir = vi.fn();
  render(
    <div>
      <input aria-label="otro campo" />
      <BuscadorDelDrive icono={(i) => (i.tipo === "carpeta" ? Folder : IconoArchivo)} onAbrir={onAbrir} />
    </div>,
  );
  const campo = screen.getByRole("combobox", { name: "Buscar en el Drive" });
  return { onAbrir, campo };
}
const escribir = (campo: HTMLElement, texto: string) => {
  act(() => campo.focus());
  fireEvent.change(campo, { target: { value: texto } });
};

beforeEach(() => {
  pedidos.length = 0;
  respuesta = KASH;
});

describe("la página del Drive tiene el buscador", () => {
  it("arriba, con su propio visor para los archivos encontrados", () => {
    expect(drivePage.length).toBeGreaterThan(1000);
    expect(drivePage).toMatch(/<BuscadorDelDrive\b/);
    expect(drivePage).toMatch(/<VisorArchivo items=\{encontrados\} abierto=\{viendoEncontrado\}/);
    // La carpeta encontrada se abre en la sección de su raíz.
    expect(drivePage).toMatch(/vistaDeLaRaiz\(/);
  });

  it("en la fila de «Agrupar por fecha» y la vista, a la izquierda (Jhon, 06/10: «donde te marco en rojo»)", () => {
    const buscador = drivePage.indexOf("<BuscadorDelDrive");
    expect(buscador).toBeGreaterThan(drivePage.indexOf("<SubtabNav>"));
    expect(buscador).toBeLessThan(drivePage.indexOf("<SelectorDeVista"));
    // Las migas, en su línea debajo de esa fila.
    expect(drivePage.indexOf('aria-label={t("drive.ruta")}')).toBeGreaterThan(drivePage.indexOf("<SelectorDeVista"));
  });
});

describe("qué se busca", () => {
  it("con menos de 3 letras no busca y dice cuántas faltan", () => {
    const { campo } = montar();
    escribir(campo, "ka");
    expect(screen.getByText("Escribe 3 letras o más para buscar en todo el Drive.")).toBeTruthy();
    expect(pedidos.every((q) => q === "")).toBe(true);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("desde 3 letras busca en todo el Drive y muestra dónde está cada uno", () => {
    const { campo } = montar();
    escribir(campo, "kash");
    expect(pedidos[pedidos.length - 1]).toBe("kash");
    const opciones = screen.getAllByRole("option");
    expect(opciones.map((o) => o.textContent)).toEqual([
      expect.stringContaining("KASH 2026"),
      expect.stringContaining("Kash Credentials OF.xlsx"),
      expect.stringContaining("Balance Kash.xlsx"),
    ]);
    expect(opciones[1].textContent).toContain("En «michel.zarate@unlok.me»");
    expect(campo.getAttribute("aria-expanded")).toBe("true");
  });

  it("sin resultados lo dice, con lo que se buscó", () => {
    respuesta = [];
    const { campo } = montar();
    escribir(campo, "zzzz");
    expect(screen.getByText("Nada con «zzzz» en el Drive")).toBeTruthy();
  });
});

describe("abrir lo encontrado", () => {
  it("con las flechas se marca y con Enter se abre (con los resultados, para el visor)", () => {
    const { campo, onAbrir } = montar();
    escribir(campo, "kash");
    fireEvent.keyDown(campo, { key: "ArrowDown" });
    fireEvent.keyDown(campo, { key: "ArrowDown" });
    expect(campo.getAttribute("aria-activedescendant")).toBe(screen.getAllByRole("option")[1].id);
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(onAbrir).toHaveBeenCalledWith(KASH[1], KASH);
    // Un archivo se abre encima: el texto queda para seguir buscando.
    expect((campo as HTMLInputElement).value).toBe("kash");
  });

  it("Enter sin marcar nada abre el primero", () => {
    const { campo, onAbrir } = montar();
    escribir(campo, "kash");
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(onAbrir).toHaveBeenCalledWith(KASH[0], KASH);
  });

  it("con un clic; al entrar a una carpeta el texto se limpia", () => {
    const { campo, onAbrir } = montar();
    escribir(campo, "kash");
    fireEvent.click(screen.getAllByRole("option")[0]);
    expect(onAbrir).toHaveBeenCalledWith(KASH[0], KASH);
    expect((campo as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("⚠️ el mousedown de una fila no le quita el foco al campo (si no, la lista se cierra antes del clic)", () => {
    const { campo } = montar();
    escribir(campo, "kash");
    const permitido = fireEvent.mouseDown(screen.getAllByRole("option")[1]);
    expect(permitido).toBe(false);
  });
});

describe("teclas", () => {
  it("Esc limpia; con el campo vacío, sale", () => {
    const { campo } = montar();
    escribir(campo, "kash");
    fireEvent.keyDown(campo, { key: "Escape" });
    expect((campo as HTMLInputElement).value).toBe("");
    expect(document.activeElement).toBe(campo);
    fireEvent.keyDown(campo, { key: "Escape" });
    expect(document.activeElement).not.toBe(campo);
  });

  it("«/» lo enfoca desde la página, pero no si se está escribiendo en otro campo", () => {
    const { campo } = montar();
    act(() => { fireEvent.keyDown(document.body, { key: "/" }); });
    expect(document.activeElement).toBe(campo);
    const otro = screen.getByRole("textbox", { name: "otro campo" });
    act(() => otro.focus());
    act(() => { fireEvent.keyDown(otro, { key: "/" }); });
    expect(document.activeElement).toBe(otro);
  });

  it("esAtajoDeBuscar: «/» (también con Shift, como en el teclado español), nunca con Ctrl/⌘/Alt", () => {
    const en = (target: EventTarget, init: KeyboardEventInit) => {
      let r = false;
      const f = (e: Event) => { r = esAtajoDeBuscar(e as KeyboardEvent); };
      target.addEventListener("keydown", f);
      target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, ...init }));
      target.removeEventListener("keydown", f);
      return r;
    };
    const div = document.createElement("div");
    const area = document.createElement("textarea");
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    document.body.append(div, area, editable);
    expect(en(div, { key: "/" })).toBe(true);
    expect(en(div, { key: "/", shiftKey: true })).toBe(true);
    expect(en(div, { key: "/", ctrlKey: true })).toBe(false);
    expect(en(div, { key: "/", metaKey: true })).toBe(false);
    expect(en(div, { key: "k" })).toBe(false);
    expect(en(area, { key: "/" })).toBe(false);
    // jsdom no calcula isContentEditable: se fuerza para probar la regla.
    Object.defineProperty(editable, "isContentEditable", { value: true });
    expect(en(editable, { key: "/" })).toBe(false);
    div.remove(); area.remove(); editable.remove();
  });

  it("moverMarca: da la vuelta en las puntas", () => {
    expect(moverMarca(-1, 1, 3)).toBe(0);
    expect(moverMarca(-1, -1, 3)).toBe(2);
    expect(moverMarca(2, 1, 3)).toBe(0);
    expect(moverMarca(0, -1, 3)).toBe(2);
    expect(moverMarca(1, 1, 3)).toBe(2);
    expect(moverMarca(0, 1, 0)).toBe(-1);
  });
});

describe("vistaDeLaRaiz: en qué sección se abre una carpeta encontrada", () => {
  const unidades = new Map<string, UnidadConNombre>([
    ["u-empresa", { tipo: "empresa", persona: null, nombre: "KASH" }],
    ["u-mia-google", { tipo: "personal", persona: YO, nombre: "Mi unidad · yo" }],
    ["u-de-otra", { tipo: "personal", persona: "u-otra", nombre: "Mi unidad · otra" }],
  ]);
  it("una unidad compartida → Unidades compartidas", () => {
    expect(vistaDeLaRaiz({ id: "u-empresa", owner_id: null }, unidades, YO)).toBe("unidades");
  });
  it("lo mío o mi «Mi unidad» de Google → Mi unidad", () => {
    expect(vistaDeLaRaiz({ id: "x", owner_id: YO }, unidades, YO)).toBe("mia");
    expect(vistaDeLaRaiz({ id: "u-mia-google", owner_id: null }, unidades, YO)).toBe("mia");
  });
  it("lo de otra persona → Compartido conmigo (también si todavía no cargaron las unidades)", () => {
    expect(vistaDeLaRaiz({ id: "u-de-otra", owner_id: null }, unidades, YO)).toBe("compartido");
    expect(vistaDeLaRaiz({ id: "x", owner_id: "u-otra" }, unidades, YO)).toBe("compartido");
    expect(vistaDeLaRaiz({ id: "u-empresa", owner_id: null }, undefined, YO)).toBe("compartido");
    expect(vistaDeLaRaiz({ id: "x", owner_id: null }, unidades, undefined)).toBe("compartido");
  });
});
