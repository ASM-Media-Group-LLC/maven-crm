import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const pedidos = vi.hoisted(() => [] as string[][]);
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: (_c: string, ids: string[]) => {
          pedidos.push(ids);
          return Promise.resolve({ data: ids.map((id) => ({ id, avatar_url: `foto-${id}`, avatar_seed: `semilla-${id}` })), error: null });
        },
      }),
    }),
  },
}));
import { useCaras } from "@/pages/admin/carasDePersonas";

describe("useCaras (las caras de Ajustes → API keys)", () => {
  it("pide ids únicos y ordenados, mapea foto/semilla y vuelve a pedir si cambian", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result, rerender } = renderHook(({ ids }) => useCaras(ids), { wrapper, initialProps: { ids: [] as (string | null | undefined)[] } });
    await new Promise((r) => setTimeout(r, 20));
    expect(pedidos).toEqual([]);
    rerender({ ids: ["b", null, "a", "b", undefined] });
    await waitFor(() => expect(result.current.get("a")).toEqual({ src: "foto-a", seed: "semilla-a" }));
    expect(pedidos).toEqual([["a", "b"]]);
    rerender({ ids: ["a", "b", "c"] });
    await waitFor(() => expect(result.current.get("c")).toEqual({ src: "foto-c", seed: "semilla-c" }));
    rerender({ ids: ["c", "b", "a"] });
    await new Promise((r) => setTimeout(r, 20));
    expect(pedidos).toEqual([["a", "b"], ["a", "b", "c"]]);
  });
});
