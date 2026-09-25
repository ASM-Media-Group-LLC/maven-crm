// En los grupos el ✓✓ era imposible por diseño.
//
// El indicador exigía que TODOS los destinatarios recibieran el mensaje para
// dejar de decir "aún no le llegó". En un grupo de 21 eso es exigir que las 20
// personas estén conectadas a la vez, y no pasa nunca.
//
// Medido en producción el 17/09: de 49 mensajes de grupo, CERO llegaron a ✓✓
// —ni gris— con un promedio de 7,7 entregados y 3,2 leídos, y picos de 8. A los
// 49 les decía "aún no le llegó" mientras ocho personas ya lo habían leído. Eso
// era lo que Jhon veía "bastante impreciso".
//
// La regla nueva: en grupos basta con que le haya llegado a ALGUIEN para dejar
// de mentir. En chats directos NO cambia nada, y eso también se comprueba acá.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ReadReceiptIndicator from "@/pages/messenger/components/ReadReceiptIndicator";

vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));

vi.mock("lucide-react", () => ({
  Check: (p: Record<string, unknown>) => <span data-testid="check-simple" {...p} />,
  CheckCheck: (p: Record<string, unknown>) => <span data-testid="check-doble" {...p} />,
}));

const perfiles = { a: { full_name: "Ana" }, b: { full_name: "Beto" } } as never;

const pintar = (props: Partial<Parameters<typeof ReadReceiptIndicator>[0]>) =>
  render(
    <ReadReceiptIndicator
      isMe
      deliveredByUsers={[]}
      readByUsers={[]}
      profiles={perfiles}
      totalParticipants={2}
      {...props}
    />
  );

describe("vistos en GRUPOS", () => {
  it("con 1 entregado de 20 ya NO dice 'aún no le llegó'", () => {
    pintar({ totalParticipants: 21, deliveredByUsers: ["a"] });
    expect(screen.queryByTestId("check-simple")).toBeNull();
    expect(screen.getByTestId("check-doble")).toBeInTheDocument();
  });

  it("sin nadie que lo reciba sí sigue en ✓ simple", () => {
    pintar({ totalParticipants: 21, deliveredByUsers: [] });
    expect(screen.getByTestId("check-simple")).toBeInTheDocument();
  });

  it("ocho entregados de veinte dejan de mentir", () => {
    pintar({ totalParticipants: 21, deliveredByUsers: ["a", "b", "c", "d", "e", "f", "g", "h"] as string[] });
    expect(screen.queryByTestId("check-simple")).toBeNull();
  });
});

describe("vistos en chats DIRECTOS (no deben cambiar)", () => {
  it("sin entregar sigue en ✓ simple", () => {
    pintar({ totalParticipants: 2, deliveredByUsers: [] });
    expect(screen.getByTestId("check-simple")).toBeInTheDocument();
  });

  it("entregado a la única otra persona pasa a ✓✓", () => {
    pintar({ totalParticipants: 2, deliveredByUsers: ["a"] });
    expect(screen.queryByTestId("check-simple")).toBeNull();
    expect(screen.getByTestId("check-doble")).toBeInTheDocument();
  });

  it("leído por la otra persona se dibuja a plena intensidad, no atenuado", () => {
    pintar({ totalParticipants: 2, deliveredByUsers: ["a"], readByUsers: ["a"] });
    const leido = screen.getByTestId("check-doble").className;
    pintar({ totalParticipants: 2, deliveredByUsers: ["a"], readByUsers: [] });
    const todos = screen.getAllByTestId("check-doble");
    const soloEntregado = todos[todos.length - 1]?.className;
    // Entregado va atenuado y leído a plena intensidad: tienen que diferenciarse.
    expect(leido).not.toEqual(soloEntregado);
  });
});
