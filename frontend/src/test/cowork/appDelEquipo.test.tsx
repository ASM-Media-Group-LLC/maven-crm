import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, renderHook, screen, within } from "@testing-library/react";

// ¿QUIÉN YA TIENE LA APP? (Alvaro, 18/11/2026). Desde el viernes 20/11 Cowork en
// el computador va solo en la app de Maven; el supervisor ve en el Hub quién ya
// trabaja con la app y quién sigue en el navegador.
//
// Lo que se cuida:
//   · cada Maven publica SOLO (en `enviar`) si está en la app y en qué equipo,
//     en cada publicación (presence reemplaza el payload entero);
//   · un Maven de antes, que no manda nada, sale «sin dato» y NUNCA «navegador»
//     (una falta de dato no es un no) — y no rompe nada;
//   · el celular no cuenta: ahí Cowork sigue igual;
//   · el Hub muestra «Con la app 2/4», quién falta y deja escribirle.

type Payload = Record<string, unknown>;
const enviados: Payload[] = [];
let estadoPresencia: Record<string, Payload[]> = {};

function canalFalso() {
  const c = {
    state: "closed", oyentes: {} as Record<string, Array<() => void>>,
    on(_t: string, f: { event: string }, cb: () => void) { (c.oyentes[f.event] ??= []).push(cb); return c; },
    subscribe(cb?: (e: string) => void) { c.state = "joining"; setTimeout(() => { c.state = "joined"; cb?.("SUBSCRIBED"); }, 5); return c; },
    track: vi.fn(async (p: Payload) => { enviados.push(p); return "ok"; }),
    presenceState: () => estadoPresencia,
  };
  return c;
}
let canal = canalFalso();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { channel: () => canal, removeChannel: async () => "ok" },
}));
const avisos = vi.hoisted(() => ({ ok: [] as unknown[], error: [] as unknown[] }));
vi.mock("sonner", () => ({ toast: { success: (m: unknown) => avisos.ok.push(m), error: (m: unknown) => avisos.error.push(m) } }));
vi.mock("@/hooks/useLanguage", () => {
  const idioma = {
    language: "es",
    setLanguage: () => {},
    t: (k: string, p?: Record<string, string | number>) => (p ? `${k} ${JSON.stringify(p)}` : k),
  };
  return { useLanguage: () => idioma, useLanguageSiHay: () => idioma };
});

const { useCoworkMediaPresence, salirDePresencia, leerEquipo } = await import("@/hooks/useCoworkMediaPresence");
const { adopcionDe, equipoDeTrabajo, resumenAdopcion } = await import("@/lib/coworkSoloApp");
const { MarcaApp, ResumenAppDelEquipo } = await import("@/pages/cowork/AppDelEquipo");

const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/157 Safari/537.36";
const WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/157 Safari/537.36";
const CEL = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148";

const fuentes = (import.meta as unknown as {
  glob: (p: string[], o: Record<string, unknown>) => Record<string, string>;
}).glob([
  "/frontend/src/pages/cowork/CoworkHostDashboard.tsx",
  "/frontend/src/hooks/useCoworkMediaPresence.ts",
], { query: "?raw", import: "default", eager: true });

describe("qué publica cada Maven sobre su equipo", () => {
  it("en la app: enApp y la plataforma de la app (aunque el navegador diga otra cosa)", () => {
    expect(equipoDeTrabajo({ ua: MAC, tactil: false, plataformaApp: "mac" })).toEqual({ enApp: true, equipo: "mac" });
    expect(equipoDeTrabajo({ ua: MAC, tactil: false, plataformaApp: "windows" })).toEqual({ enApp: true, equipo: "windows" });
    expect(equipoDeTrabajo({ ua: WIN, tactil: false, plataformaApp: "algo-nuevo" })).toEqual({ enApp: true, equipo: "otro" });
  });

  it("en el navegador: Mac, Windows o celular (el iPad que se hace pasar por Mac es celular)", () => {
    expect(equipoDeTrabajo({ ua: MAC, tactil: false, plataformaApp: null })).toEqual({ enApp: false, equipo: "mac" });
    expect(equipoDeTrabajo({ ua: WIN, tactil: false, plataformaApp: undefined })).toEqual({ enApp: false, equipo: "windows" });
    expect(equipoDeTrabajo({ ua: CEL, tactil: true, plataformaApp: null })).toEqual({ enApp: false, equipo: "celular" });
    expect(equipoDeTrabajo({ ua: MAC, tactil: true, plataformaApp: null })).toEqual({ enApp: false, equipo: "celular" });
  });
});

describe("cómo lo lee el supervisor", () => {
  it("⚠️ un Maven viejo (sin el campo) es «sin dato», nunca «navegador»", () => {
    expect(adopcionDe(undefined)).toBe("sinDato");
    expect(adopcionDe({})).toBe("sinDato");
    expect(adopcionDe({ enApp: null })).toBe("sinDato");
    expect(adopcionDe({ enApp: "true" })).toBe("sinDato");
    expect(adopcionDe({ enApp: true, equipo: "mac" })).toBe("app");
    expect(adopcionDe({ enApp: false, equipo: "windows" })).toBe("navegador");
    expect(adopcionDe({ enApp: false, equipo: "celular" })).toBe("celular");
  });

  it("la presencia se lee sin confiar en la forma", () => {
    expect(leerEquipo({})).toEqual({ enApp: null, equipo: null });
    expect(leerEquipo({ enApp: "si", equipo: "toaster" })).toEqual({ enApp: null, equipo: null });
    expect(leerEquipo({ enApp: true, equipo: "windows" })).toEqual({ enApp: true, equipo: "windows" });
  });

  it("el resumen: cada uno una vez y el celular fuera de la cuenta", () => {
    const r = resumenAdopcion(["a", "b", "c", "d", "e", "a"], {
      a: { enApp: true, equipo: "mac" },
      b: { enApp: true, equipo: "windows" },
      c: { enApp: false, equipo: "windows" },
      d: undefined,
      e: { enApp: false, equipo: "celular" },
    });
    expect(r).toEqual({ conApp: ["a", "b"], navegador: ["c"], sinDato: ["d"], celular: ["e"], total: 4 });
  });
});

describe("la presencia lleva el equipo en cada publicación", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    salirDePresencia();
    canal = canalFalso();
    enviados.length = 0;
    estadoPresencia = {};
  });
  afterEach(() => {
    delete (window as unknown as { mavenEscritorio?: unknown }).mavenEscritorio;
    vi.useRealTimers();
  });

  it("sin que nadie lo pase: en el navegador enApp=false; en la app, true y su plataforma", async () => {
    const { result } = renderHook(() => useCoworkMediaPresence("s1", "yo", { persistente: true }));
    await act(async () => { await vi.advanceTimersByTimeAsync(20); });
    await act(async () => { result.current.trackMediaState({ micOn: true, camOn: true, screenShareOn: true }); await vi.advanceTimersByTimeAsync(2_100); });
    expect(enviados[enviados.length - 1]).toMatchObject({ enApp: false });
    expect(typeof enviados[enviados.length - 1].equipo).toBe("string");

    (window as unknown as { mavenEscritorio: unknown }).mavenEscritorio = { esApp: true, plataforma: "windows" };
    await act(async () => { result.current.trackMediaState({ micOn: true, camOn: false, screenShareOn: true }); await vi.advanceTimersByTimeAsync(2_100); });
    expect(enviados[enviados.length - 1]).toMatchObject({ enApp: true, equipo: "windows", camOn: false });
  });

  it("⚠️ al leer: el Maven viejo queda en null y no rompe a nadie", async () => {
    estadoPresencia = {
      viejo: [{ user_id: "viejo", micOn: true, camOn: true, screenShareOn: true }],
      nuevo: [{ user_id: "nuevo", micOn: true, camOn: true, screenShareOn: true, enApp: true, equipo: "mac" }],
    };
    const { result } = renderHook(() => useCoworkMediaPresence("s1", "supervisor"));
    await act(async () => { await vi.advanceTimersByTimeAsync(20); });
    await act(async () => { canal.oyentes.sync?.forEach((cb) => cb()); });
    expect(result.current.mediaStates.viejo).toMatchObject({ camOn: true, enApp: null, equipo: null });
    expect(result.current.mediaStates.nuevo).toMatchObject({ enApp: true, equipo: "mac" });
    expect(adopcionDe(result.current.mediaStates.viejo)).toBe("sinDato");
  });
});

describe("el Hub: «Con la app» y quién falta", () => {
  const estados = {
    ana: { micOn: true, camOn: true, screenShareOn: true, enApp: true, equipo: "mac" as const },
    beto: { micOn: true, camOn: true, screenShareOn: true, enApp: true, equipo: "windows" as const },
    caro: { micOn: true, camOn: true, screenShareOn: true, enApp: false, equipo: "windows" as const },
    dani: { micOn: true, camOn: true, screenShareOn: true }, // Maven viejo
    eva: { micOn: true, camOn: true, screenShareOn: false, enApp: false, equipo: "celular" as const },
  };
  const nombres: Record<string, string> = { ana: "Ana Ríos", beto: "Beto Paz", caro: "Caro Gil", dani: "Dani Sol", eva: "Eva Luz" };

  it("cuenta 2/4, dice el detalle y al abrir lista navegador y sin dato, con Escribir", () => {
    const onEscribir = vi.fn();
    render(
      <ResumenAppDelEquipo
        uids={Object.keys(estados)}
        mediaStates={estados}
        nombreDe={(u) => nombres[u]}
        avatares={{}}
        onEscribir={onEscribir}
      />,
    );
    expect(screen.getByTestId("app-del-equipo-cuenta").textContent).toBe("2/4");
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("2");
    expect(screen.getByText(/cowork\.host\.app\.enNavegadorN/).textContent).toContain("cowork.host.app.sinDatoN");
    expect(screen.queryByText("Caro Gil")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /cowork\.host\.app\.verFaltan/ }));
    expect(screen.getByText("Caro Gil")).toBeTruthy();
    expect(screen.getByText("Dani Sol")).toBeTruthy();
    // Los que tienen la app y el del celular no están en la lista de pendientes.
    expect(screen.queryByText("Ana Ríos")).toBeNull();
    expect(screen.queryByText("Eva Luz")).toBeNull();
    const fila = screen.getByText("Caro Gil").closest("li")!;
    expect(within(fila).getByRole("img").getAttribute("data-adopcion")).toBe("navegador");
    expect(within(screen.getByText("Dani Sol").closest("li")!).getByRole("img").getAttribute("data-adopcion")).toBe("sinDato");
    fireEvent.click(within(fila).getByRole("button", { name: "cowork.host.messageOnMessenger" }));
    expect(onEscribir).toHaveBeenCalledWith("caro");
  });

  it("copia el link de la guía (/app) para pasárselo", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<ResumenAppDelEquipo uids={["caro"]} mediaStates={estados} nombreDe={(u) => nombres[u]} avatares={{}} onEscribir={() => {}} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "cowork.host.app.copiarGuia" })); });
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/app`);
    expect(avisos.ok).toContain("cowork.host.app.guiaCopiada");
  });

  it("todos con la app: lo dice y no hay lista; nadie en un computador: no se muestra", () => {
    const { unmount } = render(<ResumenAppDelEquipo uids={["ana", "beto", "eva"]} mediaStates={estados} nombreDe={(u) => nombres[u]} avatares={{}} onEscribir={() => {}} />);
    expect(screen.getByTestId("app-del-equipo-cuenta").textContent).toBe("2/2");
    expect(screen.getByText("cowork.host.app.todos")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /verFaltan/ })).toBeNull();
    unmount();
    const { container } = render(<ResumenAppDelEquipo uids={["eva"]} mediaStates={estados} nombreDe={(u) => nombres[u]} avatares={{}} onEscribir={() => {}} />);
    expect(container.textContent).toBe("");
  });

  it("la marquita junto al nombre dice app y su sistema", () => {
    render(<MarcaApp estado={estados.ana} />);
    const marca = screen.getByRole("img");
    expect(marca.getAttribute("data-adopcion")).toBe("app");
    expect(marca.getAttribute("title")).toBe("cowork.host.app.estado.app · Mac");
  });

  it("está montado en el Hub y la presencia lo publica sola", () => {
    const hub = fuentes["/frontend/src/pages/cowork/CoworkHostDashboard.tsx"] ?? "";
    const hook = fuentes["/frontend/src/hooks/useCoworkMediaPresence.ts"] ?? "";
    expect(hub.length).toBeGreaterThan(1000);
    expect(hub).toContain("<ResumenAppDelEquipo");
    expect(hub).toContain("<MarcaApp estado={mediaStates[f.uid]} />");
    // En `enviar`, el único lugar por donde sale la presencia de cada persona.
    expect(hook).toMatch(/function enviar\([\s\S]*?\.\.\.miEquipo\(\),[\s\S]*?\}\);/);
  });
});
