import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// DRIVE: LA PAPELERA, LOS DETALLES, LAS FECHAS Y LOS TAMAÑOS (Jhon, 03/10).
//   · «No veo el tamaño de los archivos por ningún lado; la fecha tampoco es
//     clara» → el panel de Detalles (ⓘ), el tamaño de las CARPETAS en la lista
//     y en las tarjetas, y las fechas como Google («Hoy, 17:10», «29 sep»,
//     «20 nov 2024», con la completa en el globito).
//   · Lo importado de Google (sin dueño) ya no dice «—»: la unidad compartida,
//     o «Importado de Google».
//   · ⚠️ La papelera listaba solo `owner_id = yo`: lo importado que alguien
//     tiraba no lo veía NADIE. Ahora es todo lo tirado que la persona ve, con
//     quién lo tiró y dónde estaba; y «Movido a la papelera · Deshacer».
// La base (trigger y funciones) se prueba contra Postgres en
// supabase/tests/drive_papelera_y_detalles.ts; aquí, el SQL como texto y la pantalla.

configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 30_000 });

vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "yo" } }) }));
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ isAdmin: false }) }));
vi.mock("@/hooks/useDirectorioCorreo", () => ({
  useDirectorioCorreo: () => ({ data: [{ user_id: "ana", nombre: "Ana Pérez" }] }),
  candidatosDelDirectorio: () => [],
}));
vi.mock("@/components/oficina/DriveCupos", () => ({ BarraDeUso: () => null, BarraDeUsoAgencia: () => null, CuposDialog: () => null }));
vi.mock("@/pages/oficina/drive/VisorArchivo", () => ({ default: () => null }));
type Accion = { label: string; onClick: () => void };
const toasts = vi.hoisted(() => ({ exito: [] as string[], error: [] as string[], acciones: [] as (Accion | undefined)[] }));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn((m: string, o?: { action?: Accion }) => { toasts.exito.push(m); toasts.acciones.push(o?.action); return 1; }),
    error: vi.fn((m: string) => { toasts.error.push(m); return 2; }),
    loading: vi.fn(() => 3),
  }),
}));

// ── Un Supabase falso que anota cada consulta y contesta según lo que se pide ──
type Op = [string, unknown[]];
const consultas = vi.hoisted(() => [] as { tabla: string; ops: Op[] }[]);
const llamadas = vi.hoisted(() => [] as { fn: string; args: Record<string, unknown> }[]);
const respuestas = vi.hoisted(() => ({
  tabla: (_t: string, _ops: Op[]): { data: unknown; error: unknown } => ({ data: [], error: null }),
  rpc: (_fn: string, _args: Record<string, unknown>): { data: unknown; error: unknown } => ({ data: [], error: null }),
}));
vi.mock("@/integrations/supabase/client", () => {
  const consulta = (tabla: string) => {
    const ops: Op[] = [];
    consultas.push({ tabla, ops });
    const b: Record<string, unknown> = new Proxy({}, {
      get(_o, prop: string) {
        if (prop === "then") {
          return (ok: (v: unknown) => unknown, mal: (e: unknown) => unknown) =>
            Promise.resolve().then(() => respuestas.tabla(tabla, ops)).then(ok, mal);
        }
        return (...args: unknown[]) => { ops.push([prop, args]); return b; };
      },
    });
    return b;
  };
  return {
    supabase: {
      from: (t: string) => consulta(t),
      rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => { llamadas.push({ fn, args }); return respuestas.rpc(fn, args); }),
      functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
      auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), getSession: async () => ({ data: { session: null } }) },
    },
  };
});

import DrivePage from "@/pages/oficina/DrivePage";
import { pedirTamanos, type DriveItem } from "@/hooks/useDrive";
import { fechaCompleta, fechaCorta } from "@/lib/drive/fechas";
import { formato } from "@/lib/formato";
import { tipoDeFicha } from "@/lib/drive/tipoDeArchivo";
import { conLaExtension, finDelNombreSinExtension } from "@/lib/drive/nombres";

// ── Las fuentes, como texto ──────────────────────────────────────────────────
const fuentes = (import.meta as unknown as {
  glob: (p: string[], o: Record<string, unknown>) => Record<string, string>;
}).glob([
  "/supabase/migrations/20261003140000_drive_papelera_y_detalles.sql",
  "/frontend/src/hooks/useDrive.ts",
], { query: "?raw", import: "default", eager: true });
const leer = (fin: string) => Object.entries(fuentes).find(([k]) => k.endsWith(fin))?.[1] ?? "";
const mig = leer("drive_papelera_y_detalles.sql");
const hook = leer("hooks/useDrive.ts");
function entre(texto: string, desde: string, hasta: string): string {
  const a = texto.indexOf(desde);
  const b = texto.indexOf(hasta, a + 1);
  expect(a, `no está «${desde}»`).toBeGreaterThan(-1);
  expect(b, `no está «${hasta}»`).toBeGreaterThan(a);
  return texto.slice(a, b);
}

// ── Datos ────────────────────────────────────────────────────────────────────
const hoyALas = (h: number, m: number) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };
const item = (id: string, nombre: string, extra: Partial<DriveItem> = {}): DriveItem => ({
  id, owner_id: "yo", parent_id: null, tipo: "archivo", nombre, mime: null, size: 1536, estado: "listo",
  created_at: "2026-01-05T10:00:00Z", updated_at: hoyALas(9, 30), last_opened_at: null, trashed_at: null, unidad_id: null, ...extra,
});
const carpeta = (id: string, nombre: string, extra: Partial<DriveItem> = {}) => item(id, nombre, { tipo: "carpeta", size: null, ...extra });

const MIA = [carpeta("c1", "Contabilidad"), carpeta("c2", "Shootings"), item("f1", "a.pdf", { mime: "application/pdf" })];
const PAPELERA = [
  item("t1", "Plan.docx", { owner_id: null, parent_id: "u1", unidad_id: "u1", size: 2048, trashed_at: hoyALas(10, 5), trashed_by: "ana" }),
  carpeta("t2", "Viejas", { owner_id: null, parent_id: "c9", trashed_at: "2024-11-20T15:00:00Z", trashed_by: null }),
  // Adentro de una carpeta tirada: va con ella, no aparece suelto.
  item("t3", "Adentro.pdf", { owner_id: null, parent_id: "t2", trashed_at: "2024-11-20T15:00:00Z" }),
];
const EN_LA_UNIDAD = [
  item("x1", "Brief.pdf", { owner_id: null, parent_id: "u1", unidad_id: "u1" }),
  item("x2", "Suelto.pdf", { owner_id: null, parent_id: "u1", unidad_id: null }),
];

const tiene = (ops: Op[], op: string, ...args: unknown[]) =>
  ops.some(([o, a]) => o === op && args.every((x, n) => JSON.stringify(a[n]) === JSON.stringify(x)));
const select = (ops: Op[]) => String(ops.find(([o]) => o === "select")?.[1][0] ?? "");

/** Contesta como la base: la papelera, los hijos de una carpeta, mi raíz, los
 *  nombres por id, la ruta y las unidades. */
function base({ papelera = PAPELERA, mia = MIA, unidad = EN_LA_UNIDAD, updateDevuelve = (ids: string[]) => ids.map((id) => ({ id })) } = {}) {
  return (t: string, ops: Op[]): { data: unknown; error: unknown } => {
    if (t === "drive_unidades") return { data: [{ item_id: "u1", tipo: "empresa", persona: null }], error: null };
    if (t === "drive_aperturas") return { data: { abierto_at: "2026-09-29T20:10:00Z" }, error: null };
    if (t !== "drive_items") return { data: [], error: null };
    const upd = ops.find(([o]) => o === "update");
    if (upd) {
      const ids = (ops.find(([o]) => o === "in")?.[1][1] as string[] | undefined) ?? [String(ops.find(([o]) => o === "eq")?.[1][1])];
      return { data: updateDevuelve(ids), error: null };
    }
    if (tiene(ops, "not", "trashed_at", "is", null)) return { data: papelera, error: null };
    if (tiene(ops, "maybeSingle")) {
      const id = ops.find(([o, a]) => o === "eq" && a[0] === "id")?.[1][1];
      if (id === "u1") return { data: { id: "u1", nombre: "Marketing", parent_id: null, owner_id: null }, error: null };
      return { data: null, error: null };
    }
    if (select(ops) === "id, nombre") {
      const ids = (ops.find(([o]) => o === "in")?.[1][1] as string[]) ?? [];
      return { data: ids.filter((i) => i === "u1").map((id) => ({ id, nombre: "Marketing" })), error: null };
    }
    if (tiene(ops, "eq", "parent_id", "u1")) return { data: unidad, error: null };
    if (tiene(ops, "is", "parent_id", null)) return { data: mia, error: null };
    return { data: [], error: null };
  };
}

function dibujar(url = "/oficina/drive") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes><Route path="/oficina/drive" element={<DrivePage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const fila = (nombre: string) => screen.getByRole("button", { name: nombre }).closest("li")!;
async function menuDe(nombre: string, opcion: string) {
  fireEvent.keyDown(screen.getByRole("button", { name: `Opciones de ${nombre}` }), { key: "Enter" });
  fireEvent.click(await screen.findByRole("menuitem", { name: opcion }));
}

beforeEach(() => {
  consultas.length = 0;
  llamadas.length = 0;
  toasts.exito.length = 0;
  toasts.error.length = 0;
  toasts.acciones.length = 0;
  localStorage.clear();
  respuestas.tabla = base();
  respuestas.rpc = (fn, args) => {
    if (fn === "drive_tamanos") {
      const ids = args.p_ids as string[];
      const TAM: Record<string, unknown> = {
        c1: { item_id: "c1", bytes: 3 * 1024 * 1024, archivos: 12, carpetas: 2, completo: true },
        c2: { item_id: "c2", bytes: 0, archivos: 0, carpetas: 0, completo: true },
        t2: { item_id: "t2", bytes: 5 * 1024 ** 3, archivos: 140000, carpetas: 60, completo: false },
      };
      return { data: ids.map((i) => TAM[i]).filter(Boolean), error: null };
    }
    if (fn === "drive_tamano_carpeta") return { data: [{ bytes: 3 * 1024 * 1024, archivos: 12, carpetas: 1, completo: true }], error: null };
    return { data: [], error: null };
  };
});

// ═════════════════════════════════════════════════════════════════════════════
describe("la migración (texto)", () => {
  it("se cargó (si no, todo lo de abajo pasaría en vacío)", () => {
    expect(mig.length).toBeGreaterThan(1000);
    expect(hook.length).toBeGreaterThan(1000);
  });

  it("trashed_by lo pone un trigger PROPIO que corre antes que drive_items_cuidar, y drive_items_cuidar no se toca", () => {
    expect(mig).toMatch(/ADD COLUMN trashed_by uuid REFERENCES auth\.users\(id\) ON DELETE SET NULL/);
    expect(mig).toMatch(/CREATE TRIGGER drive_items_borrado_por\s+BEFORE INSERT OR UPDATE OF trashed_at, trashed_by ON public\.drive_items/);
    // Los BEFORE corren por orden alfabético: «borrado_por» < «cuidar».
    expect("drive_items_borrado_por" < "drive_items_cuidar").toBe(true);
    expect(mig).not.toMatch(/FUNCTION public\.drive_items_cuidar/);
    const f = entre(mig, "CREATE OR REPLACE FUNCTION public.drive_items_borrado_por()", "$function$;");
    expect(f).toMatch(/IF NEW\.trashed_at IS NULL THEN\s+NEW\.trashed_by := NULL;/);
    expect(f).toMatch(/ELSIF TG_OP = 'INSERT' OR OLD\.trashed_at IS NULL THEN\s+NEW\.trashed_by := coalesce\(auth\.uid\(\), NEW\.trashed_by\);/);
    expect(f).toMatch(/ELSE\s+NEW\.trashed_by := OLD\.trashed_by;/);
  });

  it("las dos funciones públicas del tamaño exigen agencia, sesión y que se pueda ver la carpeta; anon no las llama", () => {
    const detalle = entre(mig, "CREATE FUNCTION public.drive_tamano_carpeta(", "$function$;");
    expect(detalle).toMatch(/SECURITY DEFINER/);
    expect(detalle).toMatch(/IF agencia IS NULL OR auth\.uid\(\) IS NULL OR public\.drive_mi_rol\(p_item\) IS NULL THEN/);
    const tanda = entre(mig, "CREATE FUNCTION public.drive_tamanos(", "$function$;");
    expect(tanda).toMatch(/SECURITY DEFINER/);
    expect(tanda).toMatch(/IF agencia IS NULL OR auth\.uid\(\) IS NULL OR p_ids IS NULL THEN/);
    expect(tanda).toMatch(/cardinality\(p_ids\) > 100/);
    expect(tanda).toMatch(/CONTINUE WHEN public\.drive_mi_rol\(r\.id\) IS NULL;/);
    expect(tanda).toMatch(/i\.tenant_id = agencia/);
    expect(mig).toMatch(/REVOKE ALL ON FUNCTION public\.drive_tamano_carpeta\(uuid\) FROM PUBLIC, anon;/);
    expect(mig).toMatch(/REVOKE ALL ON FUNCTION public\.drive_tamanos\(uuid\[\]\) FROM PUBLIC, anon;/);
  });

  it("la cuenta interna no mira permisos: no la puede llamar nadie de afuera; tiene tope de niveles y de tiempo", () => {
    const interna = entre(mig, "CREATE FUNCTION public.drive_sumar_carpeta(", "$function$;");
    expect(interna).not.toMatch(/SECURITY DEFINER/);
    expect(interna).toMatch(/IF vueltas >= 60 OR clock_timestamp\(\) > p_hasta THEN/);
    expect(interna).toMatch(/AND i\.trashed_at IS NULL/);
    expect(interna).toMatch(/i\.estado = 'listo'/);
    expect(mig).toMatch(/REVOKE ALL ON FUNCTION public\.drive_sumar_carpeta\(uuid, uuid, timestamptz\) FROM PUBLIC, anon, authenticated;/);
  });

  it("tiene su vuelta atrás («--|»)", () => {
    const vuelta = mig.split("\n").filter((l) => l.startsWith("--|")).join("\n");
    for (const s of ["drive_tamanos(uuid[])", "drive_tamano_carpeta(uuid)", "drive_sumar_carpeta(uuid, uuid, timestamptz)", "DROP TRIGGER IF EXISTS drive_items_borrado_por", "DROP COLUMN IF EXISTS trashed_by"]) {
      expect(vuelta).toContain(s);
    }
  });

  it("⚠️ la papelera de la pantalla ya NO filtra por dueño, y trae quién lo tiró", () => {
    const f = entre(hook, "async function papeleraQueVeo()", "\n}\n");
    expect(f).not.toMatch(/owner_id/);
    expect(f).toMatch(/\.select\(`\$\{COLUMNAS\}, trashed_by`\)/);
    expect(f).toMatch(/\.not\("trashed_at", "is", null\)/);
  });

  it("renombrar pide la fila de vuelta (sin permiso, la RLS no da error: cero filas)", () => {
    const f = entre(hook, "export function useRenombrar()", "\n}\n");
    expect(f).toMatch(/\.select\("id"\)/);
    expect(f).toMatch(/throw new Error\(SIN_PERMISO_DRIVE\)/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("fechas, tipos y nombres (sin dibujar)", () => {
  const es = formato("es"), en = formato("en");
  const ahora = new Date(2026, 9, 3, 18, 0);
  const hoy = (h: string) => `Hoy, ${h}`;
  it("hoy dice «Hoy, 17:10» (no «17:10» a secas); este año «29 sep»; otro año «20 nov 2024»", () => {
    expect(fechaCorta(new Date(2026, 9, 3, 17, 10).toISOString(), es, hoy, ahora)).toBe("Hoy, 5:10 PM");
    expect(fechaCorta(new Date(2026, 8, 29, 9, 0).toISOString(), es, hoy, ahora)).toBe("29 sep");
    expect(fechaCorta(new Date(2024, 10, 20, 9, 0).toISOString(), es, hoy, ahora)).toBe("20 nov 2024");
    expect(fechaCorta(null, es, hoy, ahora)).toBe("—");
  });
  it("en inglés: «Today, 5:10 PM», «Sep 29», «Nov 20, 2024»", () => {
    const today = (h: string) => `Today, ${h}`;
    expect(fechaCorta(new Date(2026, 9, 3, 17, 10).toISOString(), en, today, ahora)).toBe("Today, 5:10 PM");
    expect(fechaCorta(new Date(2026, 8, 29).toISOString(), en, today, ahora)).toBe("Sep 29");
    expect(fechaCorta(new Date(2024, 10, 20).toISOString(), en, today, ahora)).toBe("Nov 20, 2024");
  });
  it("la completa, para el globito y los Detalles", () => {
    expect(fechaCompleta(new Date(2026, 8, 29, 17, 10).toISOString(), es)).toBe("29 de septiembre de 2026, 5:10 PM");
    expect(fechaCompleta(new Date(2026, 8, 29, 17, 10).toISOString(), en)).toBe("September 29, 2026, 5:10 PM");
  });
  it("el tipo, como Google", () => {
    const de = (nombre: string, tipo: "archivo" | "carpeta" = "archivo", mime: string | null = null) => tipoDeFicha({ nombre, tipo, mime }).clave;
    expect(de("Contabilidad", "carpeta")).toBe("drive.tipo.carpeta");
    expect(tipoDeFicha({ nombre: "Marketing", tipo: "carpeta", mime: null }, true).clave).toBe("drive.tipo.unidad");
    expect(de("Balance.xlsx")).toBe("drive.tipo.excel");
    expect(de("Acta.docx")).toBe("drive.tipo.word");
    expect(de("Deck.pptx")).toBe("drive.tipo.powerpoint");
    expect(de("Lista.ods")).toBe("drive.tipo.hoja");
    expect(de("datos.csv")).toBe("drive.tipo.csv");
    expect(de("contrato.pdf")).toBe("drive.tipo.pdf");
    expect(de("foto.JPG")).toBe("drive.tipo.imagen");
    expect(de("notas.txt")).toBe("drive.tipo.texto");
    expect(de("respaldo.zip")).toBe("drive.tipo.comprimido");
    expect(tipoDeFicha({ nombre: "raro.xyz", tipo: "archivo", mime: null })).toEqual({ clave: "drive.tipo.otro", ext: "xyz" });
    expect(de("sin-extension")).toBe("drive.tipo.archivo");
  });
  it("cambiar el nombre conserva la extensión, como Google con un archivo de Office", () => {
    expect(finDelNombreSinExtension("Balance.xlsx")).toBe(7);
    expect(finDelNombreSinExtension(".oculto")).toBe(7);
    expect(finDelNombreSinExtension("Carpeta")).toBe(7);
    expect(conLaExtension("Balance 2026", "Balance.xlsx")).toBe("Balance 2026.xlsx");
    expect(conLaExtension("Balance 2026.XLSX", "Balance.xlsx")).toBe("Balance 2026.XLSX");
    expect(conLaExtension("Notas", "LEEME")).toBe("Notas");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("el tamaño de las carpetas, de a tandas", () => {
  it("lo que la base no alcanzó (~3 s) se pide otra vez; lo que no se puede ver corta la vuelta", async () => {
    let vuelta = 0;
    respuestas.rpc = (_fn, args) => {
      vuelta++;
      const ids = args.p_ids as string[];
      // 1.ª vuelta: solo alcanza la primera. 2.ª: la segunda. «oculta» nunca vuelve.
      return { data: ids.slice(0, 1).filter((i) => i !== "oculta").map((i) => ({ item_id: i, bytes: 10, archivos: 1, carpetas: 0, completo: true })), error: null };
    };
    const r = await pedirTamanos(["a", "b", "oculta"]);
    expect([...r.keys()]).toEqual(["a", "b"]);
    expect(vuelta).toBe(3);
    expect(llamadas.map((l) => l.args.p_ids)).toEqual([["a", "b", "oculta"], ["b", "oculta"], ["oculta"]]);
  });

  it("en la lista: UNA llamada para todas las carpetas dibujadas, y el tamaño donde va el de un archivo", async () => {
    dibujar();
    await waitFor(() => expect(within(fila("Contabilidad")).getAllByText("3.0 MB").length).toBeGreaterThan(0));
    expect(within(fila("Shootings")).getAllByText("0 B").length).toBeGreaterThan(0);
    expect(within(fila("a.pdf")).getAllByText("1.5 KB").length).toBeGreaterThan(0);
    const tandas = llamadas.filter((l) => l.fn === "drive_tamanos");
    expect(tandas).toHaveLength(1);
    expect(tandas[0].args.p_ids).toEqual(["c1", "c2"]);
    // En el globito, cuántos archivos tiene.
    expect(within(fila("Contabilidad")).getAllByText("3.0 MB")[0]).toHaveAttribute("title", "12 archivos · 2 carpetas");
  });

  it("mientras llega, una rayita («Calculando el tamaño…»); si falla, «—»", async () => {
    respuestas.rpc = (fn) => (fn === "drive_tamanos" ? { data: null, error: { message: "timeout" } } : { data: [], error: null });
    dibujar();
    const contabilidad = await waitFor(() => fila("Contabilidad"));
    expect(within(contabilidad).getAllByRole("status", { name: "Calculando el tamaño…" }).length).toBeGreaterThan(0);
    await waitFor(
      () => expect(within(fila("Contabilidad")).getAllByTitle("No se pudo calcular el tamaño")[0]).toHaveTextContent("—"),
      { timeout: 8000 },
    );
  });

  it("en la cuadrícula: el tamaño debajo del nombre (carpetas) y tamaño · fecha (archivos)", async () => {
    dibujar();
    fireEvent.click(await screen.findByRole("button", { name: "Cuadrícula" }));
    const tarjeta = await screen.findByRole("button", { name: /^Contabilidad/ });
    await waitFor(() => expect(within(tarjeta).getByText("3.0 MB")).toBeInTheDocument());
    const archivo = screen.getByText("a.pdf").closest("li")!;
    expect(within(archivo).getByText((_, el) => el?.textContent === "1.5 KB · Hoy, 9:30 AM")).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("fechas y «Propietario» en la lista", () => {
  it("hoy es «Hoy, 09:30», con la fecha completa en el globito; lo mío dice «yo»", async () => {
    dibujar();
    const f = within(await waitFor(() => fila("a.pdf")));
    const fechas = f.getAllByText("Hoy, 9:30 AM");
    for (const fecha of fechas) {
      expect(fecha.tagName).toBe("TIME");
      expect(fecha.getAttribute("title")).toMatch(/^\d{1,2} de [a-z]+ de \d{4}, 9:30 AM$/);
    }
    expect(f.getByText("yo")).toBeInTheDocument();
  });

  it("lo importado (sin dueño) dentro de una unidad compartida dice la unidad; si no se sabe, «Importado de Google»", async () => {
    dibujar("/oficina/drive?vista=unidades&carpeta=u1");
    const brief = within(await waitFor(() => fila("Brief.pdf")));
    await waitFor(() => expect(brief.getByText("Marketing")).toHaveAttribute("title", "Unidad compartida «Marketing»"));
    expect(within(fila("Suelto.pdf")).getByText("Importado de Google")).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("⚠️ la papelera, como la de Google", () => {
  it("muestra lo importado que tiró otra persona, con quién lo tiró, cuándo y dónde estaba; lo de adentro de una carpeta tirada no va suelto", async () => {
    dibujar("/oficina/drive?vista=papelera");
    const plan = within(await waitFor(() => fila("Plan.docx")));
    expect(plan.getByText("Ana Pérez")).toBeInTheDocument();
    expect(plan.getAllByText("Hoy, 10:05 AM").length).toBeGreaterThan(0);
    expect(plan.getByText("Marketing")).toBeInTheDocument();
    const viejas = within(fila("Viejas"));
    expect(viejas.getAllByText("20 nov 2024").length).toBeGreaterThan(0);
    expect(viejas.getAllByText("—").length).toBeGreaterThanOrEqual(2); // ni quién (antes del 03/10) ni dónde
    // Una carpeta tirada de 140.000 archivos: «≥» (no se terminó de contar).
    await waitFor(() => expect(viejas.getAllByText("≥ 5.0 GB").length).toBeGreaterThan(0));
    expect(screen.queryByText("Adentro.pdf")).not.toBeInTheDocument();
    for (const c of ["Eliminado por", "Fecha de eliminación", "Ubicación original"]) expect(screen.getByText(c)).toBeInTheDocument();
    // La consulta: sin «owner_id = yo».
    const q = consultas.find((c) => c.tabla === "drive_items" && tiene(c.ops, "not", "trashed_at", "is", null))!;
    expect(q.ops.some(([o, a]) => o === "eq" && a[0] === "owner_id")).toBe(false);
    expect(select(q.ops)).toMatch(/trashed_by/);
  });

  it("restaurar sin permiso de edición lo dice (la RLS no da error: cero filas)", async () => {
    respuestas.tabla = base({ updateDevuelve: () => [] });
    dibujar("/oficina/drive?vista=papelera");
    await waitFor(() => fila("Plan.docx"));
    await menuDe("Plan.docx", "Restaurar");
    await waitFor(() => expect(toasts.error).toContain("No tienes permiso de edición para restaurar «Plan.docx»"));
    expect(toasts.exito).not.toContain("Restaurado");
  });

  it("«Movido a la papelera · Deshacer»: Deshacer lo restaura", async () => {
    dibujar();
    await waitFor(() => fila("a.pdf"));
    await menuDe("a.pdf", "Mover a la papelera");
    await waitFor(() => expect(toasts.exito).toContain("Movido a la papelera"));
    const accion = toasts.acciones[toasts.exito.indexOf("Movido a la papelera")]!;
    expect(accion.label).toBe("Deshacer");
    await act(async () => { accion.onClick(); });
    await waitFor(() => expect(toasts.exito).toContain("Se deshizo el cambio"));
    const updates = consultas.filter((c) => c.tabla === "drive_items" && c.ops.some(([o]) => o === "update"));
    expect(updates.map((u) => (u.ops.find(([o]) => o === "update")![1][0] as { trashed_at: string | null }).trashed_at === null))
      .toEqual([false, true]);
    expect(updates[1].ops.find(([o]) => o === "in")?.[1]).toEqual(["id", ["f1"]]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("el panel de Detalles (ⓘ)", () => {
  it("ⓘ lo abre; sin nada elegido, dice qué hacer", async () => {
    dibujar();
    fireEvent.click(await screen.findByRole("button", { name: "Ver detalles" }));
    expect(await screen.findByText("Selecciona un archivo o una carpeta para ver sus detalles.")).toBeInTheDocument();
  });

  it("«Ver detalles» de una carpeta: tipo, lo que ocupa TODO lo de adentro, contenido y ubicación", async () => {
    dibujar();
    await waitFor(() => fila("Contabilidad"));
    await menuDe("Contabilidad", "Ver detalles");
    const panel = within(await screen.findByRole("region", { name: "Detalles" }));
    expect(panel.getByText("Carpeta")).toBeInTheDocument();
    await waitFor(() => expect(panel.getByText("3.0 MB")).toBeInTheDocument());
    expect(panel.getByText("12 archivos · 1 carpeta")).toBeInTheDocument();
    expect(panel.getByText("Mi unidad")).toBeInTheDocument();
    expect(llamadas.find((l) => l.fn === "drive_tamano_carpeta")?.args).toEqual({ p_item: "c1" });
  });

  it("«Ver detalles» de un archivo: tipo, tamaño con los bytes, propietario y cuándo lo abrí", async () => {
    dibujar();
    await waitFor(() => fila("a.pdf"));
    await menuDe("a.pdf", "Ver detalles");
    const panel = within(await screen.findByRole("region", { name: "Detalles" }));
    expect(panel.getByText("PDF")).toBeInTheDocument();
    expect(panel.getByText("1.5 KB (1.536 bytes)")).toBeInTheDocument();
    expect(panel.getByText("yo")).toBeInTheDocument();
    await waitFor(() => expect(panel.getByText(/de septiembre de 2026/)).toBeInTheDocument());
    for (const etiqueta of ["Tipo", "Tamaño", "Ubicación", "Propietario", "Modificado", "Abierto por mí", "Creado"]) {
      expect(panel.getByText(etiqueta)).toBeInTheDocument();
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Jhon, 03/10: «se tarda bastante en mostrarme el tamaño». Dos causas en la
// pantalla: de a 100 por llamada, TODAS esperaban a la carpeta más pesada; y
// nada se recordaba entre visitas.
describe("el tamaño de las carpetas, sin esperar", () => {
  it("con muchas carpetas: tandas de 8, todas a la vez (no una de 100)", async () => {
    const muchas = Array.from({ length: 20 }, (_, n) => carpeta(`k${n}`, `Carpeta ${String(n).padStart(2, "0")}`));
    respuestas.tabla = base({ mia: muchas });
    dibujar();
    await waitFor(() => expect(llamadas.filter((l) => l.fn === "drive_tamanos")).toHaveLength(3));
    const tandas = llamadas.filter((l) => l.fn === "drive_tamanos").map((l) => (l.args.p_ids as string[]).length);
    expect(tandas).toEqual([8, 8, 4]);
  });

  it("lo último conocido se ve al instante; cuando la base termina de contar, se reemplaza", async () => {
    const { recordarTamanos } = await import("@/lib/drive/tamanosRecordados");
    recordarTamanos("yo", new Map([["c1", { bytes: 7 * 1024 * 1024, archivos: 30, carpetas: 3, completo: true }]]));
    let soltar: () => void = () => {};
    const antes = respuestas.rpc;
    respuestas.rpc = (fn, args) => (fn === "drive_tamanos"
      ? new Promise((ok) => { soltar = () => ok(antes(fn, args)); }) as never
      : antes(fn, args));
    dibujar();
    // Mientras cuenta: la de antes (sin rayita) y, la que nunca se contó, la rayita.
    await waitFor(() => expect(within(fila("Contabilidad")).getAllByText("7.0 MB").length).toBeGreaterThan(0));
    expect(within(fila("Contabilidad")).queryAllByRole("status", { name: "Calculando el tamaño…" })).toHaveLength(0);
    expect(within(fila("Shootings")).getAllByRole("status", { name: "Calculando el tamaño…" }).length).toBeGreaterThan(0);
    await act(async () => { soltar(); });
    await waitFor(() => expect(within(fila("Contabilidad")).getAllByText("3.0 MB").length).toBeGreaterThan(0));
    expect(within(fila("Shootings")).getAllByText("0 B").length).toBeGreaterThan(0);
  });

  it("lo recordado es de cada persona, tiene tope y sin localStorage no rompe nada", async () => {
    const { recordarTamanos, tamanosRecordados, MAXIMO_RECORDADOS } = await import("@/lib/drive/tamanosRecordados");
    const s = { bytes: 1, archivos: 1, carpetas: 0, completo: false };
    recordarTamanos("ana", new Map([["x", s]]));
    expect(tamanosRecordados("ana").get("x")).toEqual(s);
    expect(tamanosRecordados("beto").size).toBe(0);
    expect(tamanosRecordados(undefined).size).toBe(0);

    const muchos = new Map(Array.from({ length: MAXIMO_RECORDADOS + 50 }, (_, n) => [`id${n}`, s] as const));
    recordarTamanos("ana", muchos);
    expect(tamanosRecordados("ana").size).toBe(MAXIMO_RECORDADOS);

    // Incógnito / cookies bloqueadas: localStorage LANZA al tocarlo.
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("SecurityError"); },
      setItem: () => { throw new Error("QuotaExceededError"); },
    });
    try {
      expect(tamanosRecordados("ana").size).toBe(0);
      expect(() => recordarTamanos("ana", new Map([["y", s]]))).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
