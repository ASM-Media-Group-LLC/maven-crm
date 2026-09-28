// Los avisos (toasts) que arman los HOOKS con la app en INGLÉS: Scouter
// (compañías, discovery, leads manuales, jobs), las cuentas y tareas de los
// spammers y el panel admin del bot de WhatsApp.
//
// Se dispara cada mutación de verdad —con la base de mentira— dentro del
// LanguageProvider y con el <Toaster/> de Maven montado, y se recorre el texto
// que queda en pantalla: título Y detalle de cada aviso. El detalle muchas veces
// es el mensaje de un Error que tiró el propio hook ("Enter at least one
// @handle."), así que también se prueba.
//
// Lo que NO se traduce también se prueba: el last_error que se guarda al
// cancelar un job y la resolution_note de un compromiso del bot son dato que
// lee otra persona, y siguen en español aunque quien apretó el botón use inglés.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, screen, waitFor, configure } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { LanguageProvider } from "@/hooks/useLanguage";
import { Toaster as Sonner } from "@/components/ui/sonner";
import translations from "@/lib/i18n";
import { esEspanol } from "../i18n/detectarEspanol";

configure({ asyncUtilTimeout: 5000 });

// ── La base, de mentira: cualquier cadena termina en { data, error } ────────
/** Lo que se le mandó a `.update()` / `.insert()`, por tabla. */
const escrito: Record<string, unknown[]> = {};
const FILAS: Record<string, unknown> = {
  // El lead ya estaba en LeadGen, cargado por Ana.
  leadgen_entries: { id: "e1", created_at: "2026-09-01T15:00:00Z", lg_user_id: "u2" },
  profiles: { full_name: "Ana Gomez" },
};
function cadena(tabla: string) {
  const p: unknown = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "then") return (ok: (v: unknown) => void) => ok({ data: FILAS[tabla] ?? { id: "x1" }, error: null });
      return (...args: unknown[]) => {
        if (prop === "update" || prop === "insert") (escrito[tabla] ??= []).push(args[0]);
        return p;
      };
    },
    apply: () => p,
  });
  return p;
}
const invocar = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabla: string) => cadena(tabla),
    rpc: async (fn: string) => ({ data: fn === "current_tenant_id" ? "t1" : null, error: null }),
    auth: {
      getUser: async () => ({ data: { user: { id: "u1" } }, error: null }),
      getSession: async () => ({ data: { session: null } }),
    },
    functions: { invoke: (...a: unknown[]) => invocar(...a) },
  },
}));

import {
  useCreateCompany, useEnqueueDiscoverySeed, useCreateLeadManual, useCancelScouterJob,
} from "@/hooks/useScouterLeads";
import { useUpdateSpammerAccount } from "@/hooks/useSpammerAccounts";
import { useGenerateTasks } from "@/hooks/useSpammerTasks";
import { useAskWhatsappAgent, useResolveCommitment, useLinkWhatsappMember } from "@/hooks/useWhatsappAgent";

let qc: QueryClient;
const envolver = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>
    <LanguageProvider>
      {children}
      <Sonner />
    </LanguageProvider>
  </QueryClientProvider>
);

/** Todo el texto que se ve en la página (los avisos viven fuera del hook). */
function textosVisibles(): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = (n.textContent ?? "").trim();
    if (t) out.push(t);
  }
  for (const el of Array.from(document.body.querySelectorAll("[title], [aria-label]"))) {
    for (const a of ["title", "aria-label"]) {
      const v = el.getAttribute(a);
      if (v) out.push(v);
    }
  }
  return out;
}

function montar() {
  return renderHook(() => ({
    crearCompania: useCreateCompany(),
    discovery: useEnqueueDiscoverySeed(),
    leadManual: useCreateLeadManual(),
    cancelarJob: useCancelScouterJob(),
    actualizarCuenta: useUpdateSpammerAccount(),
    generar: useGenerateTasks(),
    preguntarAlBot: useAskWhatsappAgent(),
    cerrarCompromiso: useResolveCommitment(),
    vincular: useLinkWhatsappMember(),
  }), { wrapper: envolver });
}

beforeEach(() => {
  localStorage.setItem("app-language", "en");
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  for (const k of Object.keys(escrito)) delete escrito[k];
  invocar.mockReset();
});

describe("los avisos de los hooks, en inglés", () => {
  it("Scouter, spammers y el bot: título y detalle de cada aviso", async () => {
    invocar.mockImplementation(async (fn: string) =>
      fn === "scouter-generate-tasks"
        ? { data: { assignments_created: 5 }, error: null }
        : { data: { ok: true, iterations: 2 }, error: null });
    const { result } = montar();
    // El tenant lo trae una consulta: hasta que no llega, el hook no deja encolar.
    await waitFor(() => expect(qc.getQueryData(["current-tenant-id"])).toBe("t1"));

    act(() => {
      result.current.crearCompania.mutate({ name: "Acme", slug: "acme" } as never);
      result.current.discovery.mutate({ seeds: ["", "  "] });
      result.current.leadManual.mutate({ instagram_handle: "@Sofia", company_id: "c1" });
      result.current.cancelarJob.mutate("j1");
      result.current.actualizarCuenta.mutate({ id: "a1", notes: "x" } as never);
      result.current.generar.mutate(0);
      result.current.preguntarAlBot.mutate({ groupId: "g1", question: "hi" });
      result.current.cerrarCompromiso.mutate({ id: "k1", outcome: "done" });
      result.current.vincular.mutate({ memberId: "m1", userId: "u9" });
    });

    for (const texto of [
      "Company created",
      "Couldn't queue the discovery",
      "Enter at least one @handle.",
      "Couldn't add the lead",
      "@sofia already exists in Lead Gen (added on 2026-09-01 by Ana Gomez). It can't be duplicated.",
      "Job canceled",
      "Account updated",
      "5 new tasks generated",
      "Bot replied in 2 iteration(s)",
      "Commitment closed",
      "Member linked to Maven",
    ]) {
      expect(await screen.findByText(texto), texto).toBeTruthy();
    }
    // El detector, y además el lado `es` del diccionario ("Job re-encolado" no
    // tiene acento ni una palabra de la lista del detector).
    const pares = Object.values(translations as Record<string, { es: string; en: string }>);
    const enDelDiccionario = new Set(pares.map((p) => p.en));
    const esDelDiccionario = new Set(pares.map((p) => p.es).filter((es) => !enDelDiccionario.has(es)));
    const enEspanol = textosVisibles().filter((t) => esEspanol(t) || esDelDiccionario.has(t));
    expect(enEspanol).toEqual([]);
  });

  it("lo que se GUARDA en la base sigue en español", async () => {
    const { result } = montar();
    act(() => {
      result.current.cancelarJob.mutate("j1");
      result.current.cerrarCompromiso.mutate({ id: "k1", outcome: "done" });
    });
    expect(await screen.findByText("Job canceled")).toBeTruthy();
    expect(await screen.findByText("Commitment closed")).toBeTruthy();
    expect(escrito.scouter_jobs?.[0]).toMatchObject({ last_error: "Cancelado por el usuario." });
    expect(escrito.whatsapp_commitments?.[0]).toMatchObject({ resolution_note: "Cerrado manualmente desde panel admin" });
  });

  it("en español, los avisos de siempre", async () => {
    localStorage.setItem("app-language", "es");
    invocar.mockResolvedValue({ data: { assignments_created: 3 }, error: null });
    const { result } = montar();
    await waitFor(() => expect(qc.getQueryData(["current-tenant-id"])).toBe("t1"));
    act(() => {
      result.current.crearCompania.mutate({ name: "Acme", slug: "acme" } as never);
      result.current.generar.mutate(0);
      result.current.leadManual.mutate({ instagram_handle: "@Sofia", company_id: "c1" });
    });
    expect(await screen.findByText("Compañía creada")).toBeTruthy();
    expect(await screen.findByText("Se generaron 3 tareas nuevas")).toBeTruthy();
    expect(await screen.findByText(
      "Ya existe @sofia en Lead Gen (cargado el 2026-09-01 por Ana Gomez). No se puede duplicar.",
    )).toBeTruthy();
  });
});
