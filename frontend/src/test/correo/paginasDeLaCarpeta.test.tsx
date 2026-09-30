import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Grace (28/09): «¿cómo hago para ver el resto de los correos? Solo me salen
// los 50 primeros y son 126 que tengo pendientes por leer». La caché tenía los
// 186 de su bandeja; la lista pedía siempre los primeros 50.

vi.mock("react-router-dom", () => ({
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));

const pedidas: [string, number][] = [];
const TOTAL = 126;
vi.mock("@/hooks/useMailbox", async (original) => ({
  ...(await original<typeof import("@/hooks/useMailbox")>()),
  useMailbox: () => ({ data: { email_address: "grace@maven-ai.me", is_active: true, has_error: false }, isLoading: false, error: null }),
  useMailFolders: () => ({ data: [{ folder: "INBOX", unread: 126 }, { folder: "Enviado", unread: 0 }], isLoading: false }),
  useMailMessages: (carpeta: string, _h: boolean, pagina = 0) => {
    pedidas.push([carpeta, pagina]);
    const total = carpeta === "INBOX" ? TOTAL : 3;
    const desde = pagina * 50;
    const n = Math.max(0, Math.min(50, total - desde));
    return {
      data: {
        total,
        messages: Array.from({ length: n }, (_, i) => ({
          id: `${carpeta}-${desde + i}`, uid: 1000 - desde - i, folder: carpeta,
          subject: `Correo ${desde + i + 1}`, from: `Persona ${desde + i} <p${desde + i}@x.com>`, to: "grace@maven-ai.me",
          date: new Date(Date.UTC(2026, 8, 28) - (desde + i) * 3600_000).toISOString(),
          unread: true, origen: "cache", inReplyTo: undefined, refs: undefined,
        })),
      },
      isLoading: false, isFetching: false, isPlaceholderData: false, error: null, refetch: vi.fn(),
    };
  },
  useMailSearch: () => ({ data: { messages: [] }, isFetching: false, error: null }),
  useMailMessage: () => ({ data: null, isLoading: false }),
  usePrefetchMailMessage: () => vi.fn(),
  useMarkSeen: () => ({ mutate: vi.fn() }),
  useDownloadAttachment: () => ({ mutate: vi.fn(), isPending: false }),
  useMailRealtime: () => {},
  useMailSignature: () => ({ data: { enabled: false, html: "" } }),
  useMailBulk: () => ({ mutate: vi.fn(), isPending: false }),
}));
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

beforeEach(() => { pedidas.length = 0; localStorage.clear(); });

describe("las páginas de la carpeta, como Gmail", () => {
  it("dice «1–50 de 126» y ‹ arranca apagada", async () => {
    montar();
    expect(await screen.findByText("1–50 de 126")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Más recientes" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Más antiguos" })).toBeEnabled();
  });

  it("› trae la página siguiente, y en la última › se apaga", async () => {
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Más antiguos" }));
    expect(await screen.findByText("51–100 de 126")).toBeInTheDocument();
    expect(screen.getByText("Correo 51")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Más antiguos" }));
    expect(await screen.findByText("101–126 de 126")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Más antiguos" })).toBeDisabled();
    expect(pedidas.some(([c, p]) => c === "INBOX" && p === 2)).toBe(true);
  });

  it("‹ vuelve a la anterior", async () => {
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Más antiguos" }));
    await screen.findByText("51–100 de 126");
    fireEvent.click(screen.getByRole("button", { name: "Más recientes" }));
    expect(await screen.findByText("1–50 de 126")).toBeInTheDocument();
  });

  it("cambiar de carpeta vuelve a la primera página", async () => {
    montar();
    fireEvent.click(await screen.findByRole("button", { name: "Más antiguos" }));
    await screen.findByText("51–100 de 126");
    fireEvent.click(screen.getAllByRole("button", { name: "Enviados" })[0]);
    expect(await screen.findByText("1–3 de 3")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Recibidos" })[0]);
    await waitFor(() => expect(screen.getByText("1–50 de 126")).toBeInTheDocument());
  });
});

describe("⚠️ el hook", () => {
  const hook = readFileSync(resolve(process.cwd(), "frontend/src/hooks/useMailbox.ts"), "utf8");
  it("pide un RANGO con el total en la misma consulta, y desempata el orden", () => {
    expect(hook).toMatch(/\.select\(cols, \{ count: "exact" \}\)/);
    expect(hook).toMatch(/\.range\(desde, desde \+ CORREOS_POR_PAGINA - 1\)/);
    expect(hook).toMatch(/\.order\("uid", \{ ascending: false \}\)/);
  });

  it("la página va en la clave, y lo que toca la lista a mano usa el PREFIJO", () => {
    expect(hook).toMatch(/queryKey: \["mail-messages", folder, pagina\]/);
    expect(hook).not.toMatch(/setQueryData\(\s*\["mail-messages", folder\]/);
    expect(hook).toMatch(/setQueriesData\(\s*\{ queryKey: \["mail-messages", folder\] \}/);
  });

  it("de la página 2 en adelante NO cae al camino en vivo", () => {
    expect(hook).toMatch(/if \(\(data && data\.length > 0\) \|\| pagina > 0\)/);
  });
});
