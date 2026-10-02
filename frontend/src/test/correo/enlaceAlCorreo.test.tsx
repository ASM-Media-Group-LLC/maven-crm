import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, configure } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// El enlace que viaja con «Compartir en el chat»: /correo?mensaje=<Message-ID>.
// Quien lo toca abre SU copia de ese correo, en la carpeta donde la tenga. Si no
// lo recibió, se le dice; no se abre otro.

configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 60_000 });

const e = vi.hoisted(() => ({
  params: new URLSearchParams(),
  setParams: (() => {}) as (p: URLSearchParams) => void,
  carpetasPedidas: [] as string[],
  buscados: [] as string[],
  encontrado: null as Record<string, unknown> | null,
  errores: [] as string[],
}));

vi.mock("react-router-dom", () => ({ useSearchParams: () => [e.params, e.setParams] }));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: (m: string) => e.errores.push(m), info: vi.fn(), warning: vi.fn() },
}));
vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));

vi.mock("@/hooks/useMailbox", async (original) => ({
  ...(await original<typeof import("@/hooks/useMailbox")>()),
  useMailbox: () => ({ data: { email_address: "yo@maven-ai.me", is_active: true, has_error: false }, isLoading: false, error: null }),
  useMailFolders: () => ({ data: [{ folder: "INBOX", unread: 0 }, { folder: "Archive", unread: 0 }], isLoading: false }),
  useMailMessages: (carpeta: string) => {
    e.carpetasPedidas.push(carpeta);
    return { data: { total: 0, messages: [] }, isLoading: false, isFetching: false, isPlaceholderData: false, error: null, refetch: vi.fn() };
  },
  buscarCorreoPorMessageId: (id: string) => { e.buscados.push(id); return Promise.resolve(e.encontrado); },
  useMailSearch: () => ({ data: { messages: [] }, isFetching: false, error: null }),
  useMailMessage: (_f: string, sel: { subject: string } | null) => ({
    data: sel
      ? { folder: "Archive", from: "Ana <ana@x.com>", to: "yo@maven-ai.me", cc: "", subject: sel.subject, date: "2026-09-30T10:00:00Z", html: null, text: "Hola", remote_images: 0, attachments: [], truncated: false }
      : null,
    isLoading: false, error: null,
  }),
  useImagenesIncrustadas: () => null,
  usePrefetchMailMessage: () => vi.fn(),
  useMarkSeen: () => ({ mutate: vi.fn() }),
  useDownloadAttachment: () => ({ mutate: vi.fn(), isPending: false }),
  useMailRealtime: () => {},
  useMailSignature: () => ({ data: { enabled: false, html: "" } }),
  useMailBulk: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useHiloCompleto", () => ({ useHiloCompleto: () => ({ hilo: [], cargando: false }) }));
vi.mock("@/hooks/useEtiquetasCorreo", async (original) => ({
  ...(await original<typeof import("@/hooks/useEtiquetasCorreo")>()),
  useEtiquetas: () => ({ data: [], isLoading: false }),
  useEtiquetasPorCorreo: () => ({ data: new Map() }),
  useNoLeidosPorEtiqueta: () => ({ data: new Map() }),
  useEtiquetarCorreos: () => ({ mutate: vi.fn(), isPending: false }),
  useCorreosDeEtiqueta: () => ({ data: [], isLoading: false, error: null }),
}));

import CorreoPage from "@/pages/correo/CorreoPage";

const montar = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><CorreoPage /></QueryClientProvider>);
};

beforeEach(() => {
  e.params = new URLSearchParams({ mensaje: "<m1@x.com>" });
  // Como react-router: la URL limpia reemplaza a la anterior.
  e.setParams = (p) => { e.params = p; };
  e.carpetasPedidas.length = 0;
  e.buscados.length = 0;
  e.errores.length = 0;
  e.encontrado = null;
  localStorage.clear();
});

describe("el enlace /correo?mensaje=…", () => {
  it("abre MI copia en SU carpeta (aunque no sea Recibidos) y limpia la URL", async () => {
    e.encontrado = {
      id: "fila-9", uid: 9, folder: "Archive", from: "Ana <ana@x.com>", to: "yo@maven-ai.me",
      subject: "Contrato firmado", date: "2026-09-30T10:00:00Z", messageId: "<m1@x.com>",
      inReplyTo: undefined, refs: undefined, unread: false, origen: "cache",
    };
    montar();
    await waitFor(() => expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toContain("Contrato firmado"));
    expect(e.buscados).toEqual(["<m1@x.com>"]);
    expect(e.carpetasPedidas).toContain("Archive");
    expect(e.params.get("mensaje")).toBeNull();
  });

  it("si ese correo no está en mi casilla, lo dice y no abre nada", async () => {
    montar();
    await waitFor(() => expect(e.errores).toEqual(["Ese correo no está en tu casilla."]));
    expect(screen.queryAllByRole("heading", { level: 2 })).toHaveLength(0);
  });
});
