import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import fuenteDelBuzon from "@/hooks/useMailbox.ts?raw";
import fuenteDelHilo from "@/hooks/useHiloCompleto.ts?raw";
import fuenteDelLector from "@/pages/correo/CorreoPage.tsx?raw";

// REACCIONES CON EMOJI EN EL CORREO (Keila, 08/10: como Gmail).
//   · Debajo del mensaje, chips «👍 2» juntando por emoji; una persona cuenta
//     una vez; la mía se marca (y se ve al instante, antes de que vuelva).
//   · La carita se apaga con las mismas reglas que la edge (copia oculta, más
//     de 20 personas, sin Message-ID).
//   · Las reacciones no son correos de la lista ni de la charla.

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));
const anotar = vi.hoisted(() => vi.fn());
vi.mock("@/pages/messenger/reaccionesRecientes", () => ({
  useReaccionesRecientes: () => ({ barra: [], frecuentes: ["👍", "😂"], anotar }),
}));
vi.mock("@/lib/emojis/catalogo", async (original) => ({
  ...(await original<typeof import("@/lib/emojis/catalogo")>()),
  // El catálogo se baja de la red: en el test alcanza con «Uso frecuente».
  cargarCatalogo: () => new Promise(() => {}),
}));

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => {};
globalThis.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;

import { chipsDeReacciones, puedeReaccionar } from "@/lib/correo/reacciones";
import { BotonReaccionar, ChipsDeReacciones } from "@/components/correo/ReaccionesDelCorreo";
import type { MailSummary } from "@/hooks/useMailbox";

afterEach(() => cleanup());

const r = (from: string, emoji: string, date: string, inReplyTo = "<orig@x>"): MailSummary => ({
  id: `${from}-${emoji}-${date}`, uid: 1, from, to: "", subject: "Re: x", date, snippet: "", unread: false,
  messageId: `<${date}@x>`, inReplyTo, refs: undefined, reaccion: emoji, origen: "cache",
});
const YO = "keila@maven-ai.me";

describe("chipsDeReacciones", () => {
  const reacciones = [
    r('"Ana Gómez" <ana@gmail.com>', "👍", "2026-10-08T10:00:00Z"),
    r('"Beto" <beto@unlok.me>', "😂", "2026-10-08T10:05:00Z"),
    r('"Beto" <beto@unlok.me>', "👍", "2026-10-08T10:06:00Z"),
    r(`"Keila" <${YO}>`, "👍", "2026-10-08T10:07:00Z"),
    r('"Ana Gómez" <ana@gmail.com>', "👍", "2026-10-08T10:08:00Z"), // repetida
    r('"Otra" <o@x.co>', "🎉", "2026-10-08T10:09:00Z", "<otro@x>"), // de otro mensaje
  ];

  it("juntas por emoji, en el orden de la primera; una persona cuenta una vez; la mía marcada", () => {
    expect(chipsDeReacciones(reacciones, "<orig@x>", YO)).toEqual([
      { emoji: "👍", quienes: ["Ana Gómez", "Beto", null], mia: true },
      { emoji: "😂", quienes: ["Beto"], mia: false },
    ]);
  });

  it("la que acabo de mandar se ve al instante, y no se duplica cuando vuelve", () => {
    const chips = chipsDeReacciones(reacciones, "<orig@x>", YO, ["😂", "👍"]);
    expect(chips.find((c) => c.emoji === "😂")).toEqual({ emoji: "😂", quienes: ["Beto", null], mia: true });
    expect(chips.find((c) => c.emoji === "👍")?.quienes).toHaveLength(3);
  });

  it("sin Message-ID no hay chips", () => {
    expect(chipsDeReacciones(reacciones, undefined, YO)).toEqual([]);
  });
});

describe("puedeReaccionar (las reglas de Google, como la edge)", () => {
  const m = { from: '"Ana" <ana@gmail.com>', to: `"Keila" <${YO}>, beto@unlok.me`, cc: "", messageId: "<o@x>" };
  it("en Para: sí", () => expect(puedeReaccionar(m, YO)).toEqual({ ok: true }));
  it("con copia oculta (no estoy en Para ni Cc): no", () => {
    expect(puedeReaccionar(m, "jefa@maven-ai.me")).toEqual({ ok: false, motivo: "no_estas" });
  });
  it("con más de 20 personas: no", () => {
    const muchos = Array.from({ length: 21 }, (_, i) => `p${i}@x.co`).join(", ");
    expect(puedeReaccionar({ ...m, cc: muchos }, YO)).toEqual({ ok: false, motivo: "muchos" });
  });
  it("sin Message-ID: no", () => expect(puedeReaccionar({ ...m, messageId: undefined }, YO).ok).toBe(false));
});

describe("la carita y los chips", () => {
  it("la carita abre el selector con los usados hace poco; elegir manda ese emoji", async () => {
    const onElegir = vi.fn();
    render(<BotonReaccionar variante="pildora" puede={{ ok: true }} onElegir={onElegir} />);
    fireEvent.click(screen.getByRole("button", { name: "Reaccionar con un emoji" }));
    const pulgar = await screen.findByRole("button", { name: /👍/ });
    fireEvent.click(pulgar);
    await waitFor(() => expect(onElegir).toHaveBeenCalledWith("👍"));
    expect(anotar).toHaveBeenCalledWith("👍");
  });

  it("apagada, dice por qué", () => {
    render(<BotonReaccionar variante="icono" puede={{ ok: false, motivo: "no_estas" }} onElegir={() => {}} />);
    const b = screen.getByRole("button", { name: "Reaccionar con un emoji" }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    expect(b.title).toBe("No se puede reaccionar: no estás en Para ni en Cc de este correo");
  });

  it("un chip ajeno suma la misma reacción; el mío queda marcado y no se toca", () => {
    const onSumar = vi.fn();
    render(
      <ChipsDeReacciones
        chips={[{ emoji: "👍", quienes: ["Ana", null], mia: true }, { emoji: "😂", quienes: ["Beto"], mia: false }]}
        puede={{ ok: true }}
        onSumar={onSumar}
      />,
    );
    const [mio, ajeno] = screen.getAllByRole("button") as HTMLButtonElement[];
    expect(mio.disabled).toBe(true);
    expect(mio.title).toBe("Ana, tú (ya reaccionaste con 👍)");
    fireEvent.click(ajeno);
    expect(onSumar).toHaveBeenCalledWith("😂");
  });
});

describe("las reacciones no son correos de la lista ni de la charla", () => {
  it("la lista de la carpeta las saca, y sin la columna se sigue viendo (se degrada)", () => {
    const hook = fuenteDelBuzon;
    expect(hook).toMatch(/if \(sinReacciones\) q = q\.is\("reaccion" as never, null\)/);
    expect(hook).toMatch(/if \(error && \/reaccion\/\.test\(error\.message/);
  });
  it("la conversación las pide y sin la columna también se degrada", () => {
    const hilo = fuenteDelHilo;
    expect(hilo).toMatch(/COLUMNAS_CON_REACCION/);
    expect(hilo).toMatch(/\/reaccion\/\.test\(/);
  });
  it("el lector no las apila como mensajes", () => {
    expect(fuenteDelLector).toMatch(/!m\.reaccion && \(m\.messageId/);
  });
});
