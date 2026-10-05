// Los correos de reporte que se piden desde el navegador (QA de chatters, QA de
// closers, Evaluador de chatters): desde el 05/10/2026 el navegador solo pide
// «manda el reporte X» ({ plantilla, id }). Nunca manda HTML, asunto, direcciones
// ni user_ids: send-notification-email arma el correo en el servidor y elige a
// quién va (cuentas de la agencia). Que salgan en español aunque la interfaz esté
// en inglés lo prueba ahora supabase/functions/send-notification-email/logica.test.ts.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { fijarIdioma } from "@/lib/i18n";

const estado = vi.hoisted(() => ({
  pedidos: [] as Array<{ fn: string; body: Record<string, unknown> }>,
  respuesta: { data: { success: true, enviados: 2 } as Record<string, unknown> | null, error: null as unknown },
  actualizados: [] as string[],
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));

vi.mock("@/integrations/supabase/client", () => {
  const cadena = (tabla: string) => {
    const c: Record<string, unknown> = {};
    c.select = () => c;
    c.eq = () => c;
    c.order = () => c;
    c.limit = () => c;
    c.update = () => {
      estado.actualizados.push(tabla);
      return c;
    };
    c.maybeSingle = () => Promise.resolve({ data: null, error: null });
    c.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(ok);
    return c;
  };
  return {
    supabase: {
      from: (tabla: string) => cadena(tabla),
      auth: { getUser: () => Promise.resolve({ data: { user: { id: "u1" } }, error: null }) },
      functions: {
        invoke: (fn: string, opts: { body: Record<string, unknown> }) => {
          estado.pedidos.push({ fn, body: opts.body });
          return Promise.resolve(estado.respuesta);
        },
      },
    },
  };
});

import { useSendChatterQaEmail, type ChatterQaReport } from "@/pages/agency-qa/chatters-qa/useChatterQaReports";
import { useFireQaWebhook } from "@/hooks/useAgencyQa";
import { mandarReportePorCorreo } from "@/lib/correoDeReporte";

const envoltorio = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

const REPORTE = {
  id: "r1", chatter_name: "Alex Chatter", company: "CM", period: "2026-02-01", blu_employee_id: 7,
  evaluated_models: [], report: { resumen: "Good pacing." }, veredicto: "requiere_mejora", sampling: {},
  evaluator_name: "Claude AI", source: "ai_draft", status: "ready", error_message: null, email_sent_at: null,
  created_at: "2026-02-09T12:00:00Z", updated_at: "2026-02-09T12:00:00Z",
} as unknown as ChatterQaReport;

describe("los correos de reporte: el navegador solo pide la plantilla", () => {
  beforeEach(() => {
    estado.pedidos.length = 0;
    estado.actualizados.length = 0;
    estado.respuesta = { data: { success: true, enviados: 2 }, error: null };
    fijarIdioma("en");
  });

  it("el QA de chatters: { plantilla: qa_chatter, id } y marca email_sent_at", async () => {
    const { result } = renderHook(() => useSendChatterQaEmail(), { wrapper: envoltorio });
    await act(() => result.current.mutateAsync(REPORTE));
    expect(estado.pedidos).toEqual([{ fn: "send-notification-email", body: { plantilla: "qa_chatter", id: "r1" } }]);
    expect(estado.actualizados).toEqual(["chatter_qa_reports"]);
  });

  it("el QA de chatters sin destinatarios: error y no marca email_sent_at", async () => {
    estado.respuesta = { data: { success: true, enviados: 0, motivo: "sin_destinatarios" }, error: null };
    const { result } = renderHook(() => useSendChatterQaEmail(), { wrapper: envoltorio });
    await expect(act(() => result.current.mutateAsync(REPORTE))).rejects.toThrow();
    expect(estado.actualizados).toEqual([]);
  });

  it("el QA de closers: { plantilla: qa_closer, id } — sin HTML, sin direcciones", async () => {
    const { result } = renderHook(() => useFireQaWebhook(), { wrapper: envoltorio });
    await act(() => result.current.mutateAsync({ callId: "c1" }));
    expect(estado.pedidos).toEqual([{ fn: "send-notification-email", body: { plantilla: "qa_closer", id: "c1" } }]);
  });

  it("ningún pedido lleva html, subject, to ni also_include_user_ids", async () => {
    await mandarReportePorCorreo("evaluacion_chatter", "e1");
    for (const p of estado.pedidos) {
      for (const campo of ["html", "subject", "to", "also_include_user_ids"]) expect(p.body).not.toHaveProperty(campo);
    }
  });

  it("el motivo de la edge (el tope por minuto) llega como mensaje del error", async () => {
    const res = new Response(JSON.stringify({ error: "Pediste demasiados correos en el último minuto." }), { status: 429 });
    estado.respuesta = { data: null, error: Object.assign(new Error("Edge Function returned a non-2xx status code"), { context: res }) };
    await expect(mandarReportePorCorreo("qa_closer", "c1")).rejects.toThrow("Pediste demasiados correos en el último minuto.");
  });
});
