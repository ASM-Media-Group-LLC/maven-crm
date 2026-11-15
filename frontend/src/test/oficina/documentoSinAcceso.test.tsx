// EL DUEÑO VE TODO Y «PEDIR ACCESO» (Alvaro, 14/11/2026). Le pasaron una hoja
// privada de Lorena y Maven decía «No se pudo abrir el documento». Ahora:
//   · el dueño de la agencia puede ABRIR cualquier documento de su gente (solo ver);
//   · quien no tiene acceso ve de quién es y un botón para pedírselo.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const rpc = vi.fn((f: string, _a?: unknown) => Promise.resolve(
  f === "documento_de_quien" ? { data: { existe: true, dueno: "Lorena Lozano" }, error: null }
    : { data: { avisado: true, dueno: "Lorena Lozano" }, error: null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (f: string, a?: unknown) => rpc(f, a) } }));
vi.mock("@/hooks/useLanguage", () => ({
  useLanguage: () => ({ language: "es", t: (k: string, p?: Record<string, string | number>) => (p ? `${k} ${JSON.stringify(p)}` : k) }),
}));

import SinAccesoDocumento, { esSinAcceso } from "@/components/oficina/SinAccesoDocumento";

const pintar = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <SinAccesoDocumento id="doc-1" onVolver={() => {}} />
  </QueryClientProvider>,
);

describe("sin acceso a un documento", () => {
  beforeEach(() => rpc.mockClear());

  it("«no te lo compartieron» es solo el 0 filas de PostgREST; un fallo de red no", () => {
    expect(esSinAcceso({ code: "PGRST116" })).toBe(true);
    expect(esSinAcceso({ message: "Failed to fetch" })).toBe(false);
    expect(esSinAcceso(null)).toBe(false);
  });

  it("dice de quién es y «Pedir acceso» le avisa a esa persona", async () => {
    pintar();
    expect(await screen.findByText(/oficina\.doc\.sinAcceso\.deQuien \{"nombre":"Lorena Lozano"\}/)).toBeTruthy();
    fireEvent.click(screen.getByText("oficina.doc.sinAcceso.pedir"));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("documento_pedir_acceso", { _doc: "doc-1" }));
    expect(await screen.findByText(/oficina\.doc\.sinAcceso\.avisado/)).toBeTruthy();
  });
});

describe("la regla en la base", () => {
  const fuentes = (import.meta as unknown as { glob: (p: string, o: Record<string, unknown>) => Record<string, string> })
    .glob("/supabase/migrations/20261114130000_documentos_dueno_ve_todo_y_pedir_acceso.sql", { query: "?raw", import: "default", eager: true });
  const sql = Object.values(fuentes)[0] ?? "";

  it("el dueño de la agencia solo VE (la política de ver), no la papelera ajena", () => {
    const i = sql.indexOf('alter policy "Ver documentos propios, del equipo y los compartidos conmigo"');
    expect(i).toBeGreaterThan(-1);
    const politica = sql.slice(i, sql.indexOf(");", i));
    expect(politica).toMatch(/\(deleted_at is null\) and public\.es_dueno_de_la_agencia_de\(owner_id\)/);
    // Editar no cambia: el dueño de la empresa no escribe documentos ajenos.
    expect(sql).not.toMatch(/alter policy "Editar documentos/);
  });

  it("solo dentro de su agencia y con la función como SECURITY DEFINER", () => {
    const i = sql.indexOf("function public.es_dueno_de_la_agencia_de");
    const cuerpo = sql.slice(i, sql.indexOf("$$;", i));
    expect(cuerpo).toContain("security definer");
    expect(cuerpo).toContain("join public.tenant_members m on m.tenant_id = o.tenant_id");
  });
});

describe("dónde se usa", () => {
  const fuentes = (import.meta as unknown as { glob: (p: string, o: Record<string, unknown>) => Record<string, string> })
    .glob("/frontend/src/pages/oficina/DocumentoPage.tsx", { query: "?raw", import: "default", eager: true });
  it("la página del documento muestra «sin acceso» antes del aviso de fallo", () => {
    const src = Object.values(fuentes)[0] ?? "";
    expect(src.indexOf("<SinAccesoDocumento")).toBeGreaterThan(0);
    expect(src.indexOf("esSinAcceso(doc.error)")).toBeLessThan(src.indexOf("oficina.doc.openError"));
  });
});
