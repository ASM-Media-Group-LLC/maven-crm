import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { idiomaInicial, LanguageProvider, useLanguage } from "@/hooks/useLanguage";

const idiomasPrevios = navigator.languages;
const idiomaPrevio = navigator.language;
function dispositivo(idioma: string, idiomas = [idioma]) {
  Object.defineProperty(navigator, "languages", { configurable: true, value: idiomas });
  Object.defineProperty(navigator, "language", { configurable: true, value: idioma });
}
beforeEach(() => { localStorage.clear(); window.history.replaceState({}, "", "/login"); });
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); dispositivo(idiomaPrevio, [...idiomasPrevios]);
  window.history.replaceState({}, "", "/");
});

function Pantalla() {
  const { language, t } = useLanguage();
  return <><output>{language}</output><button>{t("common.save")}</button></>;
}

describe("Idioma del dispositivo con inglés por defecto", () => {
  it.each([false, true])("húngaro muestra inglés, haya sesión antigua o no: %s", conSesion => {
    dispositivo("hu-HU");
    if (conSesion) localStorage.setItem("sb-proyecto-auth-token", "sesion-de-prueba");
    render(<LanguageProvider><Pantalla/></LanguageProvider>);
    expect(screen.getByRole("status")).toHaveTextContent("en");
    expect(screen.getByRole("button", {name:"Save"})).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en");
  });

  it.each(["ja-JP", "ar-SA", "pl-PL", "ko-KR", "hu-HU"])("%s cae en inglés aunque haya español como idioma secundario", idioma => {
    dispositivo(idioma, [idioma, "es-ES"]);
    expect(idiomaInicial()).toBe("en");
  });

  it.each([["es-MX","es"], ["en-GB","en"], ["pt-BR","pt"], ["de-AT","de"], ["fr-CA","fr"], ["it-IT","it"]])("%s usa el idioma ofrecido %s", (idioma, esperado) => {
    dispositivo(idioma); expect(idiomaInicial()).toBe(esperado);
  });

  it("la elección manual de español tiene prioridad sobre húngaro", () => {
    dispositivo("hu-HU"); localStorage.setItem("app-language", "es");
    render(<LanguageProvider><Pantalla/></LanguageProvider>);
    expect(screen.getByRole("button", {name:"Guardar"})).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("es");
  });

  it("una preferencia inválida no fuerza español", () => {
    dispositivo("hu-HU"); localStorage.setItem("app-language", "hu");
    expect(idiomaInicial()).toBe("en");
  });

  it.each([["hu-HU","en"], ["es-CO","es"]])("con almacenamiento bloqueado respeta %s → %s", (idioma, esperado) => {
    dispositivo(idioma);
    vi.spyOn(localStorage, "getItem").mockImplementation(() => { throw new Error("Storage blocked"); });
    expect(idiomaInicial()).toBe(esperado);
  });

  it("sin lista de idiomas usa language y sin dato usa inglés", () => {
    dispositivo("fr-FR", []); expect(idiomaInicial()).toBe("fr");
    dispositivo("", []); expect(idiomaInicial()).toBe("en");
  });

  it("una portada localizada mantiene el idioma explícito de su enlace", () => {
    dispositivo("hu-HU"); window.history.replaceState({}, "", "/es");
    expect(idiomaInicial()).toBe("es");
  });
});
