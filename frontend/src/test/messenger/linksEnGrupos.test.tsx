import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { renderTextWithMentions, linkifyText } from "@/pages/messenger/components/MentionAutocomplete";

// EL BUG (02/09/2026): en los GRUPOS el texto entraba por el renderizador de
// menciones y se saltaba el linkify — un link de OnlyFans pegado en un grupo
// salía como texto plano. En los DMs sí era clickeable.

const html = (n: React.ReactNode) => renderToStaticMarkup(<>{n}</>);

describe("links clickeables en mensajes", () => {
  it("una URL en un grupo (con participantes) se vuelve <a> que abre en otra pestaña", () => {
    const out = html(renderTextWithMentions("mira https://onlyfans.com/2647165485/danik porfi", ["Vanessa Giraldo"]));
    expect(out).toContain('href="https://onlyfans.com/2647165485/danik"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it("mención y link en el mismo mensaje: los dos se renderizan", () => {
    const out = html(renderTextWithMentions("@Vanessa Giraldo mira https://x.com/a", ["Vanessa Giraldo"], () => {}));
    expect(out).toContain("@Vanessa Giraldo");
    expect(out).toContain('href="https://x.com/a"');
  });

  it("sin participantes, los links igual van", () => {
    expect(html(renderTextWithMentions("https://a.com y texto", []))).toContain('href="https://a.com"');
  });

  it("varias URLs seguidas: todas, no una de cada dos (regex global con lastIndex)", () => {
    const out = html(linkifyText("https://a.com https://b.com https://c.com"));
    expect(out.match(/<a /g)?.length).toBe(3);
  });

  it("texto sin URL queda igual", () => {
    expect(html(linkifyText("hola"))).toBe("<span>hola</span>");
  });
});
