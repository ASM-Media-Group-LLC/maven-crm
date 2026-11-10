import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// Drive de Oficina (Jhon, 28/09): los archivos van y vienen DIRECTO del NAS
// por el túnel; la edge `drive` solo da permisos. Acá se prueba el camino de
// una subida entera y por partes, y el orden de la lista.

const invocaciones: { action: string; body: Record<string, unknown> }[] = [];
let plan: Record<string, unknown> = {};
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: vi.fn(async (_fn: string, { body }: { body: Record<string, unknown> }) => {
        invocaciones.push({ action: String(body.action), body });
        if (body.action === "subir_iniciar") return { data: plan, error: null };
        return { data: { ok: true }, error: null };
      }),
    },
    from: () => ({ select: () => ({}) }),
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), getSession: async () => ({ data: { session: null } }) },
  },
}));

// XMLHttpRequest falso: registra cada envío y contesta como el NAS.
const envios: { metodo: string; url: string; tamano: number | null }[] = [];
class XhrFalso {
  metodo = ""; url = ""; status = 0; responseText = "";
  upload: { onprogress: ((e: { loaded: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null; onerror: (() => void) | null = null;
  open(m: string, u: string) { this.metodo = m; this.url = u; }
  send(cuerpo: Blob | null) {
    envios.push({ metodo: this.metodo, url: this.url, tamano: cuerpo ? cuerpo.size : null });
    setTimeout(() => {
      this.upload.onprogress?.({ loaded: cuerpo?.size ?? 0 });
      this.status = 200;
      const esFinal = this.url.includes("completar") || this.url.includes("entero");
      this.responseText = JSON.stringify(esFinal ? { recibo: "recibo-firmado", size: 1 } : { i: 0 });
      this.onload?.();
    }, 0);
  }
}
vi.stubGlobal("XMLHttpRequest", XhrFalso);

import { ordenar, useSubidasDrive, type DriveItem } from "@/hooks/useDrive";
import { tamano, iconoDe } from "@/pages/oficina/DrivePage";

const envolver = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

beforeEach(() => { invocaciones.length = 0; envios.length = 0; });

describe("la subida, del navegador al NAS", () => {
  it("un archivo chico va ENTERO y se confirma con el recibo del NAS", async () => {
    plan = { id: "f1", url: "https://nas/o?t=entero" };
    const { result } = renderHook(() => useSubidasDrive(), { wrapper: envolver });
    const archivo = new File([new Uint8Array(1000)], "Balance.pdf", { type: "application/pdf" });
    await act(async () => { await result.current.subir([archivo], "carpeta-1"); });
    expect(invocaciones[0]).toMatchObject({ action: "subir_iniciar", body: { parent_id: "carpeta-1", nombre: "Balance.pdf", size: 1000, mime: "application/pdf" } });
    expect(envios).toEqual([{ metodo: "PUT", url: "https://nas/o?t=entero", tamano: 1000 }]);
    expect(invocaciones[1]).toMatchObject({ action: "subir_confirmar", body: { id: "f1", recibo: "recibo-firmado" } });
    await waitFor(() => expect(result.current.subidas[0].estado).toBe("lista"));
  });

  it("uno grande va POR PARTES, en orden y del tamaño justo, y después se completa", async () => {
    plan = { id: "f2", tamano_parte: 400, partes: ["https://nas/o?t=p0", "https://nas/o?t=p1", "https://nas/o?t=p2"], completar: "https://nas/o?t=completar" };
    const { result } = renderHook(() => useSubidasDrive(), { wrapper: envolver });
    await act(async () => { await result.current.subir([new File([new Uint8Array(1000)], "video.mp4")], null); });
    expect(envios).toEqual([
      { metodo: "PUT", url: "https://nas/o?t=p0", tamano: 400 },
      { metodo: "PUT", url: "https://nas/o?t=p1", tamano: 400 },
      { metodo: "PUT", url: "https://nas/o?t=p2", tamano: 200 },
      { metodo: "POST", url: "https://nas/o?t=completar", tamano: null },
    ]);
    expect(invocaciones[invocaciones.length - 1]).toMatchObject({ action: "subir_confirmar", body: { id: "f2" } });
  });

  it("⚠️ si el NAS RECHAZA el archivo (4xx), queda en error y NO se confirma ni reintenta", async () => {
    plan = { id: "f3", url: "https://nas/o?t=rechazo" };
    class XhrRechaza extends XhrFalso {
      send() { setTimeout(() => { this.status = 413; this.responseText = JSON.stringify({ error: "muy grande" }); this.onload?.(); }, 0); }
    }
    vi.stubGlobal("XMLHttpRequest", XhrRechaza);
    const { result } = renderHook(() => useSubidasDrive(), { wrapper: envolver });
    await act(async () => { await result.current.subir([new File(["x"], "a.txt")], null); });
    expect(invocaciones.map((i) => i.action)).toEqual(["subir_iniciar"]);
    expect(result.current.subidas[0]).toMatchObject({ estado: "error", error: "nas_rechazo" });
    vi.stubGlobal("XMLHttpRequest", XhrFalso);
  });

  it("✅ si un envío se CORTA y luego vuelve, REINTENTA solo y la subida termina bien", async () => {
    vi.useFakeTimers();
    plan = { id: "f3", url: "https://nas/o?t=entero" };
    let intentos = 0;
    class XhrInestable extends XhrFalso {
      send(cuerpo: Blob | null) {
        intentos += 1;
        if (intentos === 1) { setTimeout(() => this.onerror?.(), 0); return; } // el primer envío se corta
        super.send(cuerpo); // al reintentar, pasa
      }
    }
    vi.stubGlobal("XMLHttpRequest", XhrInestable);
    const { result } = renderHook(() => useSubidasDrive(), { wrapper: envolver });
    await act(async () => {
      const p = result.current.subir([new File([new Uint8Array(10)], "a.txt")], null);
      await vi.runAllTimersAsync(); // salta la espera del reintento
      await p;
    });
    expect(intentos).toBe(2); // se cortó una vez, reintentó y la segunda pasó
    expect(invocaciones.map((i) => i.action)).toEqual(["subir_iniciar", "subir_confirmar"]);
    expect(result.current.subidas[0].estado).toBe("lista");
    vi.useRealTimers();
    vi.stubGlobal("XMLHttpRequest", XhrFalso);
  });
});

describe("la lista", () => {
  const it0 = (nombre: string, tipo: "carpeta" | "archivo"): DriveItem => ({
    id: nombre, owner_id: "u", parent_id: null, tipo, nombre, mime: null, size: 1, estado: "listo",
    created_at: "", updated_at: "", last_opened_at: null, trashed_at: null,
  });
  it("carpetas primero, y los números en orden humano (2 antes que 10)", () => {
    const r = ordenar([it0("Informe 10.pdf", "archivo"), it0("Zeta", "carpeta"), it0("Informe 2.pdf", "archivo"), it0("Alfa", "carpeta")]);
    expect(r.map((x) => x.nombre)).toEqual(["Alfa", "Zeta", "Informe 2.pdf", "Informe 10.pdf"]);
  });
  it("tamaños legibles", () => {
    expect(tamano(512)).toBe("512 B");
    expect(tamano(1536)).toBe("1.5 KB");
    expect(tamano(250 * 1024 * 1024)).toBe("250 MB");
    expect(tamano(null)).toBe("—");
  });
  it("el ícono sale del tipo", () => {
    expect(iconoDe({ tipo: "carpeta", mime: null, nombre: "x" }).displayName).toMatch(/Folder/);
    expect(iconoDe({ tipo: "archivo", mime: "video/mp4", nombre: "x.mp4" }).displayName).toMatch(/Video/);
  });
});
