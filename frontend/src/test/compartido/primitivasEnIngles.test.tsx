// Las primitivas de components/ui/ con la app en INGLÉS: lo que dibujan cuando
// la pantalla NO les pasa un texto propio.
//
// El freno de i18n (test/i18n/sinEspanolNuevo) deja components/ui/ afuera a
// propósito —"su texto se pasa desde afuera"—, pero varias traían un texto por
// defecto en español ("Seleccionar fechas", "Acceso rápido", "Hoy", "Ene"…) y
// cualquier pantalla ya traducida que no pasara el suyo lo mostraba igual. Nada
// avisaba. Esto es ese aviso: se montan con el LanguageProvider real y se
// recorre todo lo visible (texto, title, placeholder, aria-label).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { LanguageProvider } from "@/hooks/useLanguage";
import { fijarIdioma } from "@/lib/i18n";
import { esEspanol } from "../i18n/detectarEspanol";

// cmdk (el buscador de los selectores) mide la lista con ResizeObserver, que
// jsdom no trae.
if (!("ResizeObserver" in globalThis)) {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// El encabezado pliega sus acciones detrás de "⋯" solo en el teléfono.
let esTelefono = false;
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => esTelefono, MOBILE_BREAKPOINT: 768 }));

import { SearchableSelect } from "@/components/ui/searchable-select";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { DateInput } from "@/components/ui/date-input";
import { CountryCodeSelect } from "@/components/ui/country-code-select";
import { PhoneInput } from "@/components/ui/phone-input";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";

// Los meses y los días en español que date-fns escribe sin acento: esEspanol no
// los ve (no tienen tilde ni son palabras de su lista), así que se buscan aparte.
const MESES_Y_DIAS = /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|ene|abr|ago|dic|lu|ma|mi|ju|vi|do)\b/i;

/** Todo el texto visible y los atributos que se leen en pantalla. */
function textosVisibles(raiz: HTMLElement): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.parentElement?.closest("code, pre, script, style")) continue;
    const t = (n.textContent ?? "").trim();
    if (t) out.push(t);
  }
  for (const el of Array.from(raiz.querySelectorAll("[title], [placeholder], [aria-label]"))) {
    for (const a of ["title", "placeholder", "aria-label"]) {
      const v = el.getAttribute(a);
      if (v) out.push(v);
    }
  }
  return out;
}

const enEspanol = (raiz: HTMLElement) =>
  textosVisibles(raiz).filter((t) => esEspanol(t) || MESES_Y_DIAS.test(t));

const montar = (nodo: React.ReactNode) => render(<LanguageProvider>{nodo}</LanguageProvider>);

const OPCIONES = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Bravo" },
];

describe("primitivas de components/ui/ en inglés", () => {
  beforeEach(() => {
    localStorage.setItem("app-language", "en");
    esTelefono = false;
  });
  afterEach(() => {
    cleanup();
    localStorage.removeItem("app-language");
    fijarIdioma("es");
  });

  it("SearchableSelect sin textos propios: disparador, buscador y vacío en inglés", () => {
    montar(<SearchableSelect value="" onValueChange={() => {}} options={OPCIONES} />);
    const disparador = screen.getByRole("combobox");
    expect(disparador).toHaveTextContent("Select...");
    fireEvent.click(disparador);
    const buscador = screen.getByPlaceholderText("Search…");
    fireEvent.change(buscador, { target: { value: "zzz" } });
    expect(screen.getByText("No results.")).toBeInTheDocument();
    expect(enEspanol(document.body)).toEqual([]);
  });

  it("DateRangePicker: disparador, accesos rápidos, calendario y botones en inglés", () => {
    montar(<DateRangePicker from={undefined} to={undefined} onApply={() => {}} />);
    const disparador = screen.getByRole("button", { name: /Select dates/ });
    fireEvent.click(disparador);
    expect(screen.getByText("Quick picks")).toBeInTheDocument();
    for (const preset of ["All time", "Today", "Yesterday", "This week", "Last week", "This month", "Last month"]) {
      expect(screen.getByRole("button", { name: preset })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument();
    expect(enEspanol(document.body)).toEqual([]);
  });

  it("DateRangePicker con un rango elegido: la pastilla dice Active", () => {
    montar(<DateRangePicker from={new Date(2026, 8, 1)} to={new Date(2026, 8, 7)} onApply={() => {}} />);
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText(/1 Sep – 7 Sep 2026/)).toBeInTheDocument();
    expect(enEspanol(document.body)).toEqual([]);
  });

  it("DateInput: disparador, meses cortos, formato y botones en inglés", () => {
    montar(<DateInput value="2026-09-15" onChange={() => {}} placeholder={undefined} />);
    fireEvent.click(screen.getByRole("button", { name: /Sep 15, 2026|15 Sep 2026/ }));
    expect(screen.getByPlaceholderText("dd/mm/yyyy")).toBeInTheDocument();
    // El selector de mes: los doce en inglés.
    fireEvent.click(screen.getByRole("button", { name: /september/i }));
    for (const mes of ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]) {
      expect(screen.getByRole("button", { name: mes })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument();
    expect(enEspanol(document.body)).toEqual([]);
  });

  it("DateInput vacío dice Select a date", () => {
    montar(<DateInput value="" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Select a date" })).toBeInTheDocument();
  });

  it("los selectores de país buscan y dicen 'no encontrado' en inglés (los nombres de país se quedan)", () => {
    montar(<CountryCodeSelect value="+57" onChange={() => {}} />);
    fireEvent.click(screen.getByRole("combobox"));
    const buscador = screen.getByPlaceholderText("Search country...");
    fireEvent.change(buscador, { target: { value: "@@@" } });
    expect(screen.getByText("Not found")).toBeInTheDocument();
    cleanup();

    montar(<PhoneInput value="+57 300" onChange={() => {}} />);
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.change(screen.getByPlaceholderText("Search country..."), { target: { value: "@@@" } });
    expect(screen.getByText("Not found")).toBeInTheDocument();
  });

  it("PageHeader plegado en el teléfono: el botón y la hoja de acciones en inglés", () => {
    esTelefono = true;
    montar(
      <PageHeader
        title="Contacts"
        actions={<><Button>One</Button><Button>Two</Button><Button>Three</Button></>}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByText("Actions")).toBeInTheDocument();
    expect(enEspanol(document.body)).toEqual([]);
  });
});

describe("las mismas primitivas en español no cambian", () => {
  beforeEach(() => {
    localStorage.setItem("app-language", "es");
    esTelefono = false;
  });
  afterEach(() => {
    cleanup();
    localStorage.removeItem("app-language");
    fijarIdioma("es");
  });

  it("DateRangePicker y DateInput siguen diciendo lo de siempre", () => {
    montar(<DateRangePicker from={undefined} to={undefined} onApply={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Seleccionar fechas/ }));
    expect(screen.getByText("Acceso rápido")).toBeInTheDocument();
    for (const preset of ["Todo", "Hoy", "Ayer", "Esta semana", "Semana pasada", "Este mes", "Mes pasado"]) {
      expect(screen.getByRole("button", { name: preset })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Aplicar" })).toBeInTheDocument();
    cleanup();

    montar(<DateInput value="2026-09-15" onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /15 sept?\.? 2026/i }));
    expect(screen.getByPlaceholderText("dd/mm/aaaa")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /septiembre/i }));
    for (const mes of ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]) {
      expect(screen.getByRole("button", { name: mes })).toBeInTheDocument();
    }
  });

  it("SearchableSelect y PageHeader también", () => {
    montar(<SearchableSelect value="" onValueChange={() => {}} options={OPCIONES} />);
    expect(screen.getByRole("combobox")).toHaveTextContent("Seleccionar...");
    cleanup();
    esTelefono = true;
    montar(<PageHeader title="X" actions={<><Button>Uno</Button><Button>Dos</Button><Button>Tres</Button></>} />);
    expect(screen.getByRole("button", { name: "Más acciones" })).toBeInTheDocument();
  });
});
