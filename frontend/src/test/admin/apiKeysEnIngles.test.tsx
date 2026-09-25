// Ajustes → API keys en INGLÉS: nada visible en español, ni en la tabla, ni en la
// referencia del API, ni en el alta con Messenger.
//
// Pedido de Jhon (25/09): "el tema del api y la documentación asegurate que
// traduzca bien si se pone la versión inglés". El catálogo de scopes lo manda el
// SERVIDOR en español (manage-api-keys/api-scopes.ts): se usa el real, así que un
// scope nuevo que llegue sin traducción hace fallar este test.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/hooks/useLanguage";
import { esEspanol } from "../i18n/detectarEspanol";
import { SCOPE_CATALOG, SCOPE_GROUPS } from "../../../../supabase/functions/manage-api-keys/api-scopes";

const YO = "3f1c2b7a-9d4e-4a51-8c0f-2e6b7d9a1c35";
const LISTA = {
  keys: [
    {
      id: "k1", name: "Integration one", key_prefix: "mvk_live_026ca2", last_four: "c3d4",
      scopes: ["creators:read", "sales:read"], ip_whitelist: [], created_at: "2026-08-28T00:00:00Z",
      created_by_email: "admin@example.com", last_used_at: null, request_count: 3, expires_at: null, revoked_at: null,
      status: "active", acts_as: { id: YO, name: "Alvaro Mejia", active: true }, limite_por_hora: 1000,
    },
    {
      id: "k2", name: "Old integration", key_prefix: "mvk_live_94b02b", last_four: "1e79",
      scopes: ["messenger:read"], ip_whitelist: ["1.2.3.4"], created_at: "2026-09-03T00:00:00Z",
      created_by_email: "admin@example.com", last_used_at: null, request_count: 9, expires_at: "2026-11-01T00:00:00Z",
      revoked_at: null, status: "active", acts_as: { id: "otro", name: "Someone Else", active: false }, limite_por_hora: 1000,
    },
  ],
  scope_catalog: SCOPE_CATALOG,
  scope_groups: [...SCOPE_GROUPS],
  max_active_keys: 3,
  you: { id: YO, name: "Alvaro Mejia" },
};

const llamadas: Record<string, unknown>[] = [];
vi.mock("@/lib/adminInvoke", () => ({
  adminInvoke: (_fn: string, body: Record<string, unknown>) => {
    llamadas.push(body);
    return Promise.resolve(LISTA);
  },
}));

import AdminApiKeys from "@/pages/admin/AdminApiKeys";

/** Todo el texto visible (sin lo que es código: headers, campos, rutas) y los
 *  atributos que se leen en pantalla. */
function textosVisibles(raiz: HTMLElement): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.parentElement?.closest("code, pre")) continue;
    const t = (n.textContent ?? "").trim();
    if (t) out.push(t);
  }
  for (const el of Array.from(raiz.querySelectorAll("[title], [placeholder], [aria-label]"))) {
    for (const a of ["title", "placeholder", "aria-label"]) {
      const v = el.getAttribute(a);
      if (v) out.push(v);
    }
  }
  return out;
}

const enEspanol = (raiz: HTMLElement) => textosVisibles(raiz).filter((t) => esEspanol(t));

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider>
        <AdminApiKeys />
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

describe("Ajustes → API keys en inglés", () => {
  beforeEach(() => {
    localStorage.setItem("app-language", "en");
    llamadas.length = 0;
  });

  it("la tabla y el aviso no tienen nada en español", async () => {
    montar();
    await screen.findByText("Integration one");
    expect(enEspanol(document.body)).toEqual([]);
    expect(screen.getByText("Acts as")).toBeTruthy();
    expect(screen.getByText("Person offboarded")).toBeTruthy();
    // La página le pide al servidor que conteste en inglés.
    expect(llamadas[0]).toMatchObject({ action: "list", lang: "en" });
  });

  it("la referencia del API está entera en inglés", async () => {
    montar();
    await screen.findByText("Integration one");
    fireEvent.click(screen.getAllByRole("button", { name: /API reference/ })[0]);
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("Rate limit")).toBeTruthy();
    expect(within(dialogo).getByText("/messenger/feed")).toBeTruthy();
    expect(enEspanol(dialogo)).toEqual([]);
  });

  it("el alta con Messenger (scopes del servidor + aviso) está en inglés", async () => {
    montar();
    await screen.findByText("Integration one");
    fireEvent.click(screen.getByRole("button", { name: /Create API key/ }));
    const dialogo = await screen.findByRole("dialog");
    // Todos los scopes del catálogo real, traducidos.
    expect(enEspanol(dialogo)).toEqual([]);
    const casilla = within(dialogo).getByText("messenger:read").closest("label")!.querySelector("input")!;
    fireEvent.click(casilla);
    expect(await within(dialogo).findByText(/This key will read ALL of Alvaro Mejia's Messenger conversations/)).toBeTruthy();
    expect(enEspanol(dialogo)).toEqual([]);
  });

  it("en español sigue mostrando el texto del servidor", async () => {
    localStorage.setItem("app-language", "es");
    montar();
    await screen.findByText("Integration one");
    fireEvent.click(screen.getByRole("button", { name: /Crear API key/ }));
    const dialogo = await screen.findByRole("dialog");
    const deServidor = SCOPE_CATALOG.find((s) => s.key === "creators:read")!;
    expect(within(dialogo).getByText(deServidor.label)).toBeTruthy();
    expect(llamadas[0]).toMatchObject({ lang: "es" });
  });
});
