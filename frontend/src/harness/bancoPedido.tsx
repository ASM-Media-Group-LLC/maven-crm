// /harness.html?ver=pedido[&tema=claro] → el link de un pedido de Backstage (18/11/2026).
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PedidoParaGrabar } from "@/components/aportar/PedidoParaGrabar";

const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });

export function BancoPedido() {
  return (
    <QueryClientProvider client={cliente}>
      <div className="flex min-h-[100svh] justify-center bg-background px-4 py-8 text-foreground">
        <div className="flex w-full max-w-3xl flex-col gap-5">
          <header className="flex flex-col items-center text-center">
            <h1 className="font-display text-xl font-bold tracking-tight">Hola, Mimimouse: tienes un pedido personalizado</h1>
            <p className="mt-1 text-sm text-muted-foreground">Pedido BS-1042</p>
          </header>
          <PedidoParaGrabar token="banco" carpetaId={null} pedido={{
            referencia: "BS-1042",
            que_grabar: "Video saludando a Juan por su cumpleaños, con el vestido rojo.\nQue diga su nombre dos veces.",
            fecha_limite: "2026-11-25", duracion: "5 min", tipo: "video", cancelado: false,
          }} />
        </div>
      </div>
    </QueryClientProvider>
  );
}
