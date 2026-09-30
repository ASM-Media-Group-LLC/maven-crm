// Closers QA → el detalle de una llamada (CallDetailPage), en INGLÉS: nada visible
// en español, ni en la ficha, ni en las secciones del análisis, ni en los popups
// (reenviar el email, el 👎 con comentario).
//
// Se monta la pantalla REAL con el LanguageProvider de verdad; solo se reemplazan
// los hooks que leen la base. Lo que escribe la IA (resumen, feedback de cada
// dimensión, citas) es dato y se muestra como viene: los datos de prueba están en
// inglés para que lo que se mire sea el texto de la pantalla.
//
// Y lo que NO se traduce también se prueba: la etiqueta del red flag que se guarda
// en qa_section_feedback.section_label (la lee el re-análisis de la IA) sigue en
// español aunque en pantalla se lea en inglés.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/hooks/useLanguage";
import { enEspanol, polyfillsDeRadix, textosDeAvisos } from "./enIngles";

polyfillsDeRadix();

const estado = vi.hoisted(() => ({
  upserts: [] as Record<string, unknown>[],
  toasts: [] as unknown[][],
}));

vi.mock("sonner", () => {
  const registrar = (...args: unknown[]) => { estado.toasts.push(args); };
  const toast = Object.assign(registrar, { success: registrar, error: registrar, warning: registrar, info: registrar, loading: registrar, message: registrar, dismiss: () => {} });
  return { toast, Toaster: () => null };
});

const LLAMADA = {
  id: "call-1",
  model_id: "m1",
  closer_id: "c1",
  call_date: "2026-09-20",
  evaluator_name: "Claude AI",
  transcript: "Speaker A: hello\nSpeaker B: hi",
  audio_path: "t1/call-1.mp3",
  audio_metrics: {
    total_duration_s: 312,
    speakers: [
      { id: "A", label: "A", word_count: 820, estimated_duration_s: 190, talk_ratio: 0.61 },
      { id: "B", label: "B", word_count: 400, estimated_duration_s: 122, talk_ratio: 0.39 },
    ],
    words: [
      { text: "hello", start: 0, end: 0.5, speaker_label: "A" },
      { text: "there", start: 0.5, end: 1, speaker_label: "A" },
    ],
  },
  claude_score: 72,
  created_at: "2026-09-20T15:30:00Z",
  uploaded_by: "u1",
  status: "ready",
  error_message: null,
  call_type: "venta_externa",
  service_sold: "Unlimited",
  model: { id: "m1", name: "Jane Doe", avatar_data_url: null, ig_url: "https://instagram.com/jane", category: "A+" },
  closer: { name: "Bob Closer" },
  claude_analysis: {
    overall_score: 72,
    summary: "Solid call overall.",
    call_outcome: "en_espera",
    call_outcome_reason: "She asked for a few days to think it over.",
    call_facts: {
      ubicacion: "Bogota",
      motivo_principal: "Wants to grow her audience.",
      observaciones_clave: ["Already works with another agency", "Posts every day"],
    },
    model_signals: {
      interest_level: "medio",
      interest_reason: "Asked about payouts twice.",
      complicity_level: "alto",
      complicity_reason: "Laughed along easily.",
      objections: [{ topic: "privacy", description: "Worried about her family finding out.", quote: "My mom can't know" }],
      summary_of_model: "Curious but careful.",
    },
    dimensions: [
      { name: "Rapport", score: 88, feedback: "Warm opening." },
      { name: "Discovery", score: 70, feedback: "Could dig deeper." },
      { name: "Closing", score: 40, feedback: "No clear next step." },
    ],
    red_flags: [
      { type: "script_rigido", description: "Read the pitch word for word.", quote: "Our company offers..." },
      { type: "something_new", description: "A flag the UI doesn't know yet.", quote: "" },
    ],
    key_moments: [
      { kind: "positivo", quote: "That sounds great", why: "She warmed up here." },
      { kind: "negativo", quote: "I don't know", why: "Hesitation that went unaddressed." },
    ],
    improvements: ["Propose a concrete follow-up date."],
  },
};

const mutacion = (onCall?: (v: Record<string, unknown>) => void) => ({
  mutate: vi.fn(),
  mutateAsync: vi.fn((v: Record<string, unknown>) => {
    onCall?.(v);
    return Promise.resolve({ score: 80 });
  }),
  isPending: false,
});

vi.mock("@/hooks/useAgencyQa", async () => {
  const real = await vi.importActual<typeof import("@/hooks/useAgencyQa")>("@/hooks/useAgencyQa");
  return {
    ...real,
    useQaCall: () => ({ data: LLAMADA, isLoading: false }),
    useQaAudioSignedUrl: () => ({ data: "https://example.com/a.mp3", isLoading: false }),
    useQaHumanFeedback: () => ({
      data: { id: "f1", call_id: "call-1", evaluator_name: "Ana Supervisor", feedback_text: "Good job, but close harder.", human_score: 78, created_at: "2026-09-21T10:00:00Z" },
    }),
    useCreateQaHumanFeedback: () => mutacion(),
    useAnalyzeQaCall: () => mutacion(),
    useFireQaWebhook: () => mutacion(),
    useQaSectionFeedback: () => ({ data: [] }),
    useUpsertQaSectionFeedback: () => mutacion((v) => estado.upserts.push(v)),
    useDeleteQaSectionFeedback: () => mutacion(),
  };
});
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1", email: "sam@example.com", user_metadata: {} } }) }));
vi.mock("@/hooks/useUserProfile", () => ({ useMyProfile: () => ({ data: { full_name: "Sam Reviewer" } }) }));

import CallDetailPage from "@/pages/agency-qa/CallDetailPage";

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider>
        <CallDetailPage callId="call-1" onBack={() => {}} />
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

/** Abre todas las secciones colapsables (<details>) para que se lea su contenido. */
function abrirSecciones() {
  document.querySelectorAll("details").forEach((d) => { d.open = true; });
}

describe("Closers QA → detalle de la llamada en inglés", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("app-language", "en");
    estado.upserts.length = 0;
    estado.toasts.length = 0;
  });

  it("la ficha, el análisis y el feedback no tienen nada en español", () => {
    montar();
    abrirSecciones();
    expect(screen.getByText("History")).toBeTruthy();
    expect(screen.getByText("Quick facts")).toBeTruthy();
    expect(screen.getByText("External sale: Unlimited")).toBeTruthy();
    // El outcome sale del diccionario (OutcomeBadge), no del call_outcome de la IA.
    expect(screen.getByText("Pending")).toBeTruthy();
    expect(screen.getByText("Rigid script")).toBeTruthy();
    // Un red flag que la pantalla no conoce se muestra con su `type` tal cual.
    expect(screen.getByText("something_new")).toBeTruthy();
    expect(screen.getByText("positive")).toBeTruthy();
    expect(screen.getByText("negative")).toBeTruthy();
    expect(screen.getByText("Strengths")).toBeTruthy();
    expect(screen.getByText("Weak points")).toBeTruthy();
    expect(screen.getByText("190s · 820 words")).toBeTruthy();
    expect(enEspanol(document.body, new Set(["Bogota", "something_new"]))).toEqual([]);
  });

  it("el popup de reenviar el email está en inglés", async () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: /Resend email/ }));
    const dialogo = await screen.findByRole("alertdialog");
    expect(within(dialogo).getByText(/Jane Doe · Bob Closer/)).toBeTruthy();
    expect(enEspanol(dialogo)).toEqual([]);
  });

  it("el 👎 abre el comentario en inglés, pero la etiqueta que se GUARDA sigue en español", async () => {
    montar();
    abrirSecciones();
    const tarjeta = screen.getByText("Rigid script").closest("div.rounded-xl") as HTMLElement;
    fireEvent.click(within(tarjeta).getByTitle("Mark 👎 + comment"));
    await waitFor(() => expect(estado.upserts.length).toBe(1));
    // section_label lo lee el re-análisis de la IA: va en español siempre.
    expect(estado.upserts[0]).toMatchObject({ section_type: "red_flag", section_label: "Script rígido", thumbs: -1 });
    const popup = await screen.findByText("What would you correct in the AI?");
    expect(enEspanol(popup.closest("[role=dialog]") as HTMLElement)).toEqual([]);
  });

  it("los avisos del feedback humano salen en inglés", async () => {
    montar();
    fireEvent.change(screen.getByLabelText(/Your feedback/), { target: { value: "Missed the soft close." } });
    fireEvent.click(screen.getByRole("button", { name: /Save feedback/ }));
    await waitFor(() => expect(estado.toasts.length).toBeGreaterThan(0));
    expect(textosDeAvisos(estado.toasts)).toEqual(["Feedback saved"]);
  });

  it("en español sigue diciendo lo de siempre", () => {
    localStorage.setItem("app-language", "es");
    montar();
    abrirSecciones();
    expect(screen.getByText("Ficha rápida")).toBeTruthy();
    expect(screen.getByText("Script rígido")).toBeTruthy();
    expect(screen.getByText("En espera")).toBeTruthy();
    expect(screen.getByText("Venta externa: Unlimited")).toBeTruthy();
    expect(screen.getByText("positivo")).toBeTruthy();
    // «Closer:» y «Evaluado por» van sueltos y el nombre en su propio strong: tres
    // piezas del inline-flex (ícono, texto, nombre), con su gap, como siempre.
    for (const [rotulo, nombre] of [["Closer:", "Bob Closer"], ["Evaluado por", "Claude AI"]]) {
      const fila = screen.getAllByText(nombre, { selector: "strong" })
        .map((el) => el.parentElement!)
        .find((p) => p.textContent === `${rotulo} ${nombre}`)!;
      expect(fila, rotulo).toBeTruthy();
      expect(Array.from(fila.children).map((el) => el.tagName.toLowerCase())).toEqual(["svg", "strong"]);
    }
  });
});
