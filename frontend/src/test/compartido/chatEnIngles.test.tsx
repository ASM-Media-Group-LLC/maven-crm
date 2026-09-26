// Los avisos del Messenger que arma hooks/useChat.ts —crear un grupo, borrar una
// conversación, no poder silenciarla— con la app en INGLÉS.
//
// La pantalla del Messenger ya estaba traducida, pero estos avisos salen del
// hook, que la traducción de la pantalla no tocó: con la interfaz en inglés,
// crear un grupo decía «Grupo "X" creado».
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { fijarIdioma } from "@/lib/i18n";

// Una base que contesta "todo bien, sin filas" a cualquier cadena de llamadas
// (from().select().eq()…, insert, rpc, channel().on().subscribe()). Lo que se
// prueba es qué dice el aviso, no la consulta.
const { base, fallar } = vi.hoisted(() => {
  const estado = { error: null as null | { message: string } };
  const cadena: unknown = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "then") {
        return (ok: (v: unknown) => void) => ok({ data: estado.error ? null : [], error: estado.error, count: 0 });
      }
      return cadena;
    },
    apply() {
      return cadena;
    },
  });
  return { base: cadena, fallar: (e: null | { message: string }) => { estado.error = e; } };
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: base }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "yo-1" }, session: null, loading: false }) }));

const avisos = vi.hoisted(() => ({ exito: [] as string[], error: [] as string[] }));
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, {
    success: (m: string) => { avisos.exito.push(m); },
    error: (m: string) => { avisos.error.push(m); },
    info: () => {},
    warning: () => {},
    dismiss: () => {},
  }),
}));

import { useChat } from "@/hooks/useChat";

beforeEach(() => {
  fijarIdioma("en");
  fallar(null);
  avisos.exito.length = 0;
  avisos.error.length = 0;
});
afterEach(() => fijarIdioma("es"));

describe("los avisos del Messenger en inglés", () => {
  it("crear un grupo avisa en inglés", async () => {
    const { result } = renderHook(() => useChat());
    act(() => {
      result.current.createGroupChat("Design", ["otro-1"]);
    });
    await waitFor(() => expect(avisos.exito).toContain('Group "Design" created'));
  });

  it("borrar una conversación avisa en inglés, y también si falla", async () => {
    const { result } = renderHook(() => useChat());
    act(() => {
      void result.current.deleteConversation("c1");
    });
    await waitFor(() => expect(avisos.exito).toContain("Conversation deleted"));

    fallar({ message: "boom" });
    act(() => {
      void result.current.deleteConversation("c2");
    });
    await waitFor(() => expect(avisos.error).toContain("Couldn't delete the conversation"));
  });

  it("si crear el grupo falla, el error también sale en inglés", async () => {
    fallar({ message: "boom" });
    const { result } = renderHook(() => useChat());
    act(() => {
      result.current.createGroupChat("Design", []);
    });
    await waitFor(() => expect(avisos.error).toContain("Couldn't create the group"));
  });
});

describe("y en español siguen diciendo lo de siempre", () => {
  it("crear un grupo", async () => {
    fijarIdioma("es");
    const { result } = renderHook(() => useChat());
    act(() => {
      result.current.createGroupChat("Diseño", []);
    });
    await waitFor(() => expect(avisos.exito).toContain('Grupo "Diseño" creado'));
  });
});
