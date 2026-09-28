// Parrilla de contenido en INGLÉS: todo lo que rodea a la lámina (barra de
// acciones, paneles de feedback y de excepciones, el aviso de "enviada", los
// botones y placeholders del editor) está en inglés.
//
// La LÁMINA en sí (.parrilla-sheet) queda en español a propósito: es el documento
// que se imprime a PDF y se manda al grupo Managers (ver ParrillaPage.tsx). Por
// eso sus nodos de texto se exceptúan… salvo los que no se imprimen
// (.print-hide), que son controles del editor y sí se revisan. Los atributos
// (placeholder, title) se revisan en todas partes.
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/hooks/useLanguage";
import type { ContentGrid, GridDay } from "@/pages/parrilla/useParrilla";
import { enEspanol, prepararJsdom } from "./visibles";

const hoyBogota = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const masDias = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const TEMA = { foto: "#b08d2f", video: "#d6336c", telegram: "#7048e8", urgencia: "#e8590c", base: "#faf6ef", tinta: "#1a1a1a" };
const GRID: ContentGrid = {
  id: "g1", week_start: hoyBogota, week_end: masDias(hoyBogota, 1), title: "Promo grid", status: "borrador",
  theme: TEMA, feedback: "Good week", pdf_url: null, sent_at: null, updated_at: "2026-09-01T12:00:00Z",
};
const dia = (i: number, extra: Partial<GridDay>): GridDay => ({
  id: `d${i}`, grid_id: "g1", day_index: i, date: masDias(hoyBogota, i - 1), format_badge: "flyer_foto",
  idea: "Mirror selfie", copy_sugerido: "Good morning 💙", franja: "11:00 - 13:00", franja_start: "11:00", franja_end: "13:00",
  extra_type: "custom", extra_title: "", extra_desc: "", extra_items: [], refs: [], ...extra,
});
const DIAS: GridDay[] = [
  dia(1, { extra_type: "dinamica_lanzamiento", extra_items: [{ label: "", copy: "" }] }),
  dia(2, { format_badge: "video_corto", extra_type: "reel", refs: [{ url: "", nicho: "" }, { url: "https://instagram.com/reel/abc", nicho: "fit" }] }),
];
const EXCEPCIONES = [
  { id: "x1", grid_id: "g1", creator_id: "c1", day_date: null, motivo: "sick", created_at: "2026-09-01T12:00:00Z" },
  { id: "x2", grid_id: "g1", creator_id: "gone", day_date: DIAS[1].date, motivo: "no Telegram", created_at: "2026-09-01T12:00:00Z" },
];
const CREADORAS = [{ id: "c1", name: "Sofia", artistic_name: "Sofia Model" }];
const SIN: never[] = [];

let grids: ContentGrid[] = [GRID];

vi.mock("@/pages/parrilla/useParrilla", async () => {
  const real = await vi.importActual<typeof import("@/pages/parrilla/useParrilla")>("@/pages/parrilla/useParrilla");
  const mutacion = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
  return {
    ...real,
    useGridList: () => ({ data: grids, isLoading: false }),
    useGridDays: (id: string | null) => ({ data: id ? DIAS : SIN, isLoading: false }),
    useGridExemptions: () => ({ data: EXCEPCIONES }),
    useActiveCreatorsLite: () => ({ data: CREADORAS }),
    useSaveGrid: () => mutacion,
    useCreateWeek: () => mutacion,
    useGenerateParrilla: () => mutacion,
    useEnviarParrilla: () => mutacion,
    useSetWeekStart: () => mutacion,
    useAddExemption: () => mutacion,
    useRemoveExemption: () => mutacion,
  };
});
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ explicitPermission: () => null, canAccess: () => true, isLoading: false }) }));

import ParrillaPage from "@/pages/parrilla/ParrillaPage";

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider>
        <ParrillaPage />
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

// La lámina es el documento (en español a propósito); sus controles no. Un
// rótulo de la lámina dentro de una fila que no se imprime (una referencia
// vacía) va marcado con data-lamina.
const esDocumento = (el: Element) =>
  !!el.closest(".parrilla-sheet") && (!el.closest(".print-hide") || !!el.closest("[data-lamina]"));

beforeAll(prepararJsdom);

describe("Parrilla en inglés", () => {
  beforeEach(() => {
    localStorage.setItem("app-language", "en");
    grids = [GRID];
  });

  it("un borrador: barra, editor, feedback y excepciones en inglés", async () => {
    montar();
    expect(await screen.findByText("Content Grid")).toBeTruthy();
    expect(screen.getByText("TODAY")).toBeTruthy();
    expect(screen.getByText("Generate with AI")).toBeTruthy();
    expect(screen.getByText("Exceptions · creators who aren't audited this week")).toBeTruthy();
    expect(screen.getByText("· whole week · sick")).toBeTruthy();
    expect(screen.getByText("(creator)")).toBeTruthy();
    // El menú del tipo de acción extra, traducido (la lámina guarda el español).
    expect(screen.getAllByText("Urgency promo · Launch").length).toBeGreaterThan(0);
    expect(enEspanol(document.body, esDocumento)).toEqual([]);
  });

  it("la lámina sigue en español: es el documento que se manda", async () => {
    montar();
    expect(await screen.findByText("Regla de ejecución")).toBeTruthy();
    expect(screen.getAllByText("Idea de material").length).toBe(DIAS.length);
    expect(screen.getByText("VIDEO CORTO")).toBeTruthy();
  });

  it("una parrilla ya enviada: el aviso de solo lectura", async () => {
    grids = [{ ...GRID, status: "enviada", sent_at: "2026-09-10T15:00:00Z", pdf_url: "https://files.test/g1.pdf" }];
    montar();
    expect(await screen.findByText("Grid sent to the group")).toBeTruthy();
    expect(screen.getByText("View PDF")).toBeTruthy();
    expect(screen.getAllByText("Back to draft").length).toBe(2);
    expect(enEspanol(document.body, esDocumento)).toEqual([]);
  });

  it("sin parrillas todavía", async () => {
    grids = [];
    montar();
    expect(await screen.findByText("There are no grids yet.")).toBeTruthy();
    expect(enEspanol(document.body, esDocumento)).toEqual([]);
  });
});
