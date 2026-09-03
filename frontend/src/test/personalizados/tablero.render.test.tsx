import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/pages/personalizados/usePersonalizados", () => ({
  useMutacionesPedidos: () => ({ cambiarEstado: { mutateAsync: vi.fn(), isPending: false } }),
  usePermisosPersonalizados: () => ({ puedeAprobar: true, puedeGestionar: true, puedeCrear: true, cargando: false }),
}));

import PedidoTablero from "@/pages/personalizados/PedidoTablero";

describe("PedidoTablero", () => {
  it("se dibuja vacío sin explotar (es lo que se ve al aplicar un filtro sin resultados)", () => {
    const qc = new QueryClient();
    const { container } = render(<QueryClientProvider client={qc}><PedidoTablero pedidos={[]} onAbrir={() => {}} /></QueryClientProvider>);
    expect(container.textContent).toContain("Solicitado");
  });
});
