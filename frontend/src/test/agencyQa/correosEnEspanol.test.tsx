// Los correos de QA NO se traducen: los lee el closer o el chatter (y sus
// supervisores), no quien apretó "Enviar" / "Reenviar". Con la interfaz en inglés,
// el correo tiene que salir igual que siempre: el veredicto, el mes y el resultado
// de la llamada en español.
//
// Es la otra mitad de la migración: la pantalla habla el idioma de quien la usa;
// lo que sale de Maven hacia otra persona, el de esa persona.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { fijarIdioma } from "@/lib/i18n";

const estado = vi.hoisted(() => ({ correos: [] as Array<{ subject: string; html: string }> }));

// Cada tabla contesta lo suyo; el correo se captura en functions.invoke.
const FILAS: Record<string, unknown> = {
  chatter_qa_config: { notification_emails: ["boss@example.com"], notify_user_ids: [] },
  qa_config: { id: 1, notification_emails: ["boss@example.com"], notify_user_ids: [], notify_on_analyzed: true, notify_on_low_score: false, low_score_threshold: 60 },
  qa_calls: {
    id: "c1", created_at: "2026-02-10T10:00:00Z", call_date: "2026-02-10", evaluator_name: "Claude AI", claude_score: 64,
    uploaded_by: "u1", model: { name: "Jane Doe", category: "A", ig_url: null }, closer: { name: "Bob Closer" },
    claude_analysis: { summary: "Solid call.", call_outcome: "no_cerro", dimensions: [], red_flags: [], key_moments: [], improvements: [] },
  },
};
vi.mock("@/integrations/supabase/client", () => {
  const cadena = (tabla: string) => {
    const c: Record<string, unknown> = {};
    c.select = () => c;
    c.eq = () => c;
    c.update = () => c;
    c.maybeSingle = () => Promise.resolve({ data: FILAS[tabla] ?? null, error: null });
    c.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(ok);
    return c;
  };
  return {
    supabase: {
      from: (tabla: string) => cadena(tabla),
      functions: {
        invoke: (_fn: string, opts: { body: { subject: string; html: string } }) => {
          estado.correos.push({ subject: opts.body.subject, html: opts.body.html });
          return Promise.resolve({ data: {}, error: null });
        },
      },
    },
  };
});

import { useSendChatterQaEmail, type ChatterQaReport } from "@/pages/agency-qa/chatters-qa/useChatterQaReports";
import { useFireQaWebhook } from "@/hooks/useAgencyQa";

const envoltorio = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

const REPORTE = {
  id: "r1", chatter_name: "Alex Chatter", company: "CM", period: "2026-02-01", blu_employee_id: 7,
  evaluated_models: [], report: { resumen: "Good pacing." }, veredicto: "requiere_mejora", sampling: {},
  evaluator_name: "Claude AI", source: "ai_draft", status: "ready", error_message: null, email_sent_at: null,
  created_at: "2026-02-09T12:00:00Z", updated_at: "2026-02-09T12:00:00Z",
} as unknown as ChatterQaReport;

describe("los correos de QA salen en español aunque la interfaz esté en inglés", () => {
  beforeEach(() => {
    estado.correos.length = 0;
    fijarIdioma("en");
  });

  it("el QA de chatters: veredicto y mes en español", async () => {
    const { result } = renderHook(() => useSendChatterQaEmail(), { wrapper: envoltorio });
    await act(() => result.current.mutateAsync(REPORTE));
    expect(estado.correos).toHaveLength(1);
    const [correo] = estado.correos;
    expect(correo.subject).toBe("[Maven · QA Chatters] Alex Chatter · Kash Massive (CM) · Febrero 2026 (Requiere Mejora)");
    expect(correo.html).toContain("Febrero 2026");
    expect(correo.html).not.toContain("February");
    expect(correo.html).not.toContain("Needs improvement");
  });

  it("el QA de closers: el resultado de la llamada en español", async () => {
    const { result } = renderHook(() => useFireQaWebhook(), { wrapper: envoltorio });
    await act(() => result.current.mutateAsync({ callId: "c1" }));
    expect(estado.correos).toHaveLength(1);
    expect(estado.correos[0].subject).toContain("(No cerró)");
    expect(estado.correos[0].subject).not.toContain("Rejected");
  });
});
