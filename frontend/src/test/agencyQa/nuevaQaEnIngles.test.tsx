// Closers QA → Nueva QA (AgencyNewQa), en INGLÉS: el formulario, sus errores, los
// selectores (closer, soportes, país, tipo de llamada, servicio) y el aviso de que
// la modelo ya existe en otros módulos.
//
// El tipo de llamada y el servicio viajan como dato (qa_calls.call_type /
// service_sold los lee qa-analyze): solo se traduce la etiqueta, el value sigue
// siendo "reclutamiento", "Otro"… Los países son nombres propios de la lista
// canónica (lib/countries.ts) y se muestran como están.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/hooks/useLanguage";
import { CANONICAL_COUNTRIES } from "@/lib/countries";
import { enEspanol, polyfillsDeRadix } from "./enIngles";

polyfillsDeRadix();

const PAISES = new Set<string>(CANONICAL_COUNTRIES);

const { consulta, mutacion } = vi.hoisted(() => ({
  consulta: (data: unknown) => ({ data, isLoading: false, isFetching: false }),
  mutacion: () => ({ mutate: () => {}, mutateAsync: () => Promise.resolve(), isPending: false }),
}));

vi.mock("@/hooks/useAgencyQa", async () => {
  const real = await vi.importActual<typeof import("@/hooks/useAgencyQa")>("@/hooks/useAgencyQa");
  return {
    ...real,
    useAnalyzeQaCall: mutacion,
    useCreateQaCall: mutacion,
    useReprocessQaCall: mutacion,
    useCurrentTenantId: () => consulta("t1"),
    useFetchIgAvatar: mutacion,
    useFireQaWebhook: mutacion,
    useIgLookup: () => consulta({
      normalized_handle: "jane.doe",
      total: 2,
      matches: {
        qa_models: [{ id: "q1", label: "Jane Doe", detail: "2 calls" }],
        scouter_leads: [{ id: "s1", label: "@jane.doe", detail: null }],
        closer_creators: [],
        creator_prospects: [],
        leadgen_entries: [],
      },
    }),
    useQaModels: () => consulta([]),
    useSearchModelsForQa: () => consulta([]),
    useTenantProfiles: () => consulta([
      { id: "p1", full_name: "Bob Closer", avatar_url: null },
      { id: "p2", full_name: null, avatar_url: null },
    ]),
    useTranscribeAudio: mutacion,
    useUploadQaAudio: mutacion,
    useUpsertQaCloser: mutacion,
    useUpsertQaModel: mutacion,
  };
});
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1", email: "sam@example.com", user_metadata: {} } }) }));
vi.mock("@/hooks/useUserProfile", () => ({ useMyProfile: () => ({ data: { full_name: "Sam Reviewer" } }) }));
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ isAdmin: true, isManager: false, isSupervisor: false }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ insert: () => Promise.resolve({ error: null }) }) } }));

import AgencyNewQa from "@/pages/agency-qa/AgencyNewQa";

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider>
        <AgencyNewQa />
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

describe("Closers QA → Nueva QA en inglés", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("app-language", "en");
  });

  it("el formulario vacío, con sus errores y el aviso de la modelo repetida", () => {
    montar();
    expect(screen.getByText("New QA")).toBeTruthy();
    expect(screen.getAllByText("Pick a closer").length).toBe(2);
    expect(screen.getByText("Upload the call's audio")).toBeTruthy();
    expect(screen.getByText("This model already exists in the system")).toBeTruthy();
    expect(screen.getByText("Another earlier QA")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });

  it("buscar una modelo que no está: el aviso de crearla primero", () => {
    montar();
    const buscador = screen.getByPlaceholderText("Search the catalog for a model…");
    fireEvent.focus(buscador);
    fireEvent.change(buscador, { target: { value: "zz" } });
    expect(screen.getByText(/create it in/)).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });

  it("los selectores de closer, soportes y país", async () => {
    montar();
    fireEvent.click(screen.getByRole("combobox", { name: /Closer/ }));
    expect(await screen.findByPlaceholderText("Search closer…")).toBeTruthy();
    expect(enEspanol(document.body, PAISES)).toEqual([]);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    fireEvent.click(screen.getByRole("button", { name: /Support closer/ }));
    expect(await screen.findByText("(no name)")).toBeTruthy();
    expect(enEspanol(document.body, PAISES)).toEqual([]);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    // El selector de país no tiene nombre accesible: se lo busca por su texto.
    fireEvent.click(screen.getByText("Pick a country").closest("button")!);
    expect(await screen.findByText("México")).toBeTruthy();
    expect(enEspanol(document.body, PAISES)).toEqual([]);
  });

  it("el tipo de llamada y el servicio en inglés (los productos, tal cual)", async () => {
    montar();
    const tipo = screen.getByRole("combobox", { name: /Call type/ });
    fireEvent.click(tipo);
    expect(await screen.findByRole("option", { name: "Recruitment (a model new to the agency)" })).toBeTruthy();
    expect(enEspanol(document.body, PAISES)).toEqual([]);
    fireEvent.click(screen.getByRole("option", { name: "Service sale (already with the agency)" }));

    fireEvent.click(await screen.findByRole("combobox", { name: /Service offered/ }));
    expect(await screen.findByRole("option", { name: "Other" })).toBeTruthy();
    // Los demás servicios son productos: se ven igual en los dos idiomas.
    expect(screen.getByRole("option", { name: "Unlimited" })).toBeTruthy();
    expect(enEspanol(document.body, PAISES)).toEqual([]);
  });
});
