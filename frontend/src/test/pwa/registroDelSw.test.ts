// La versión nueva de Maven ya no tumba llamadas (11/11/2026).
//
// El registro del plugin de PWA recargaba toda pestaña abierta en cuanto una
// versión nueva tomaba el control (skipWaiting + clientsClaim), con llamada o
// sin ella: cada deploy podía cortar las llamadas de Cowork una por una. Estas
// pruebas fijan el arreglo de lib/registroDelSw.ts y que pwa.ts lo use.
import { describe, it, expect, vi } from "vitest";
import { registrarSw, type EventoSw, type WorkboxMinimo } from "@/lib/registroDelSw";

type Glob = { glob: (p: string, o: Record<string, unknown>) => Record<string, string> };
const FUENTE_PWA = Object.values((import.meta as unknown as Glob).glob("/frontend/src/pwa.ts", { query: "?raw", import: "default", eager: true }))[0] ?? "";

function workboxFalso() {
  const oyentes: Record<string, ((e: EventoSw) => void)[]> = {};
  const wb: WorkboxMinimo & { emitir: (tipo: string, e: EventoSw) => void; saltos: number } = {
    saltos: 0,
    addEventListener(tipo, fn) { (oyentes[tipo] ??= []).push(fn); },
    messageSkipWaiting() { this.saltos++; },
    register: async () => undefined,
    emitir(tipo, e) { for (const fn of oyentes[tipo] ?? []) fn(e); },
  };
  return wb;
}

async function armar(enLlamada: boolean) {
  const wb = workboxFalso();
  const o = {
    alNecesitarRecarga: vi.fn(),
    alQuedarPendiente: vi.fn(),
    recargar: vi.fn(),
    enLlamada: () => enLlamada,
    crearWorkbox: async () => wb,
  };
  const actualizar = registrarSw(o);
  await actualizar(false); // espera a que quede registrado
  wb.saltos = 0;
  return { wb, o, actualizar };
}

describe("una versión nueva de Maven y la llamada", () => {
  it("CON llamada: la versión nueva toma el control y la pestaña NO se recarga; queda el aviso", async () => {
    const { wb, o } = await armar(true);
    // Otra pestaña (o el chequeo de cada hora) instaló la versión nueva.
    wb.emitir("installed", { isExternal: true });
    expect(o.alNecesitarRecarga).toHaveBeenCalledTimes(1);
    // skipWaiting + clientsClaim: el SW nuevo toma esta pestaña.
    wb.emitir("controlling", { isUpdate: true });
    expect(o.recargar).not.toHaveBeenCalled();
    expect(o.alQuedarPendiente).toHaveBeenCalledTimes(1);
  });

  it("SIN llamada: se recarga a la versión nueva, como siempre", async () => {
    const { wb, o } = await armar(false);
    wb.emitir("waiting", {});
    wb.emitir("controlling", { isUpdate: true });
    expect(o.recargar).toHaveBeenCalledTimes(1);
    expect(o.alQuedarPendiente).not.toHaveBeenCalled();
  });

  it("la primera instalación (no es una actualización) no recarga ni avisa", async () => {
    const { wb, o } = await armar(false);
    wb.emitir("installed", { isUpdate: undefined, isExternal: false });
    wb.emitir("controlling", { isUpdate: false });
    expect(o.alNecesitarRecarga).not.toHaveBeenCalled();
    expect(o.recargar).not.toHaveBeenCalled();
  });

  it("el botón Recargar manda skipWaiting al SW en espera", async () => {
    const { wb, actualizar } = await armar(false);
    await actualizar(true);
    expect(wb.saltos).toBe(1);
  });

  it("dos avisos de versión nueva no enganchan dos recargas", async () => {
    const { wb, o } = await armar(false);
    wb.emitir("waiting", {});
    wb.emitir("installed", { isExternal: true });
    wb.emitir("controlling", { isUpdate: true });
    expect(o.alNecesitarRecarga).toHaveBeenCalledTimes(1);
    expect(o.recargar).toHaveBeenCalledTimes(1);
  });
});

describe("pwa.ts usa el registro que respeta la llamada", () => {
  it("se cargó la fuente", () => {
    expect(FUENTE_PWA.length).toBeGreaterThan(1000);
  });
  it("no vuelve el registro del plugin, que recargaba con llamada", () => {
    expect(FUENTE_PWA).not.toContain('import("virtual:pwa-register")');
    expect(FUENTE_PWA).toMatch(/registrarSw\(\{[\s\S]*enLlamada: hayLlamadaActiva,/);
  });
});
