// El cartel de main.tsx cuando un deploy deja la pestaña pidiendo archivos que
// ya no existen (`vite:preloadError`), con la app en INGLÉS. Es DOM pelado —corre
// fuera de React—, así que el idioma es el que el LanguageProvider ya fijó con
// fijarIdioma() para cuando la persona navega y salta el error.
//
// Dos carteles: "actualizando…" (y recarga sola) y, si hay una llamada en curso,
// el que NO recarga y deja el botón para cuando cuelgue.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { fijarIdioma } from "@/lib/i18n";
import { marcarLlamadaActiva, olvidarLlamadasActivas } from "@/lib/llamadaActiva";
import { esEspanol } from "../i18n/detectarEspanol";

// main.tsx monta la app entera al importarse: acá solo interesa su manejador.
vi.mock("@/App", () => ({ default: () => null }));
vi.mock("@/index.css", () => ({}));
vi.mock("@/lib/promptDeInstalacion", () => ({}));
vi.mock("@/lib/altoDeLaApp", () => ({}));
vi.mock("@/lib/sinZoomAlEnfocar", () => ({}));
vi.mock("@/lib/dominioCanonico", () => ({ irAlDominioCanonico: () => {} }));
vi.mock("@/hooks/useSkin", () => ({ applyStoredSkin: () => {}, applyStoredAppearance: () => {} }));

beforeAll(async () => {
  const raiz = document.createElement("div");
  raiz.id = "root";
  document.body.appendChild(raiz);
  await import("@/main");
});

/** Lo que se lee del cartel: su texto y los aria-label de sus botones. */
const textosDelCartel = (id: string) => {
  const el = document.getElementById(id);
  if (!el) return [];
  return [
    ...Array.from(el.querySelectorAll("span, button")).map((n) => (n.textContent ?? "").trim()).filter(Boolean),
    ...Array.from(el.querySelectorAll("[aria-label]")).map((n) => n.getAttribute("aria-label") ?? ""),
  ];
};

const deploy = () => window.dispatchEvent(new Event("vite:preloadError", { cancelable: true }));

beforeEach(() => {
  vi.useFakeTimers(); // la recarga sale a los 1,2 s: no se llega a disparar
  sessionStorage.clear();
  document.getElementById("maven-recarga-aviso")?.remove();
  document.getElementById("maven-recarga-pendiente")?.remove();
  olvidarLlamadasActivas();
});
afterEach(() => { fijarIdioma("es"); vi.useRealTimers(); });

describe("el cartel de versión nueva, en inglés", () => {
  it("sin llamada: avisa que se actualiza", () => {
    fijarIdioma("en");
    deploy();
    expect(textosDelCartel("maven-recarga-aviso")).toEqual(["Updating Maven to the new version…"]);
  });

  it("en llamada: no recarga, deja el botón y se puede cerrar", () => {
    fijarIdioma("en");
    marcarLlamadaActiva("sala-1");
    deploy();
    const textos = textosDelCartel("maven-recarga-pendiente");
    expect(textos).toEqual([
      "A new version of Maven is available. Reload when you finish the call.", "Reload now", "×", "Dismiss",
    ]);
    expect(textos.filter((t) => esEspanol(t))).toEqual([]);
    expect(document.getElementById("maven-recarga-aviso")).toBeNull();
  });

  it("en español, los de siempre", () => {
    marcarLlamadaActiva("sala-1");
    deploy();
    expect(textosDelCartel("maven-recarga-pendiente")).toEqual([
      "Hay una versión nueva de Maven. Recargá cuando termines la llamada.", "Recargar ahora", "×", "Cerrar aviso",
    ]);
  });
});
