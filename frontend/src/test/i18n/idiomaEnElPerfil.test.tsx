// EL IDIOMA TE SIGUE DE UN DISPOSITIVO A OTRO (profiles.ui_prefs.language).
//
// ui_prefs es UN jsonb con dos dueños: la apariencia (hooks/useSkin.ts: OLED,
// contraste, tono propio, densidad, temporadas) y el idioma
// (hooks/useLanguage.tsx). Cada uno reescribe SOLO lo suyo. Antes la apariencia
// escribía la columna entera: con el idioma adentro, tocar el modo OLED lo
// habría borrado. Estas pruebas usan una fila falsa de `profiles` que guarda lo
// que se escribe, así se ve el resultado final y no solo qué se llamó.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

type Fila = { ui_skin: string | null; ui_prefs: unknown };

const db = vi.hoisted(() => ({
  sesion: null as null | { user: { id: string } },
  fila: null as null | Fila,
  lecturas: 0,
  escrituras: [] as Record<string, unknown>[],
  /** Si está puesta, cada lectura de la fila espera a que se resuelva. */
  retener: null as null | Promise<void>,
}));

// Copia profunda: lo que se leyó no cambia si después alguien escribe.
const copia = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

vi.mock("@/integrations/supabase/client", () => {
  // Cada paso cede el turno, como la red: así dos escrituras seguidas se
  // intercalan de verdad si nada las pone en fila.
  const turno = () => new Promise<void>((r) => setTimeout(r, 0));
  return {
    supabase: {
      auth: {
        getSession: async () => {
          await turno();
          return { data: { session: db.sesion } };
        },
        getUser: async () => {
          await turno();
          return { data: { user: db.sesion?.user ?? null }, error: null };
        },
      },
      from: (tabla: string) => {
        if (tabla !== "profiles") throw new Error(`tabla inesperada: ${tabla}`);
        return {
          select: () => ({
            eq: (_col: string, id: string) => ({
              maybeSingle: async () => {
                db.lecturas += 1;
                if (db.retener) await db.retener;
                await turno();
                const fila = db.fila && id === db.sesion?.user.id ? copia(db.fila) : null;
                return { data: fila, error: null };
              },
            }),
          }),
          update: (cambios: Record<string, unknown>) => ({
            eq: async (_col: string, id: string) => {
              await turno();
              db.escrituras.push(copia(cambios));
              if (db.fila && id === db.sesion?.user.id) Object.assign(db.fila, copia(cambios));
              return { error: null };
            },
          }),
        };
      },
    },
  };
});

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: db.sesion?.user ?? null, session: db.sesion, loading: false }),
}));

// El aviso de temporada (Halloween, Navidad) depende de la fecha: fuera.
vi.mock("sonner", () => ({ toast: vi.fn() }));

import { LanguageProvider, useLanguage } from "@/hooks/useLanguage";
import { useSkinSync, useUiPrefs, useSkin } from "@/hooks/useSkin";

const YO = { user: { id: "9b1f0c2e-5a7d-4e3b-8c61-0d2f4a6b8e19" } };

/** Lo que monta App: el arranque que lee el perfil al abrir la sesión. */
function Arranque() {
  useSkinSync();
  return null;
}

function Idioma() {
  const { t, language, setLanguage } = useLanguage();
  return (
    <div>
      <span data-testid="idioma">{language}</span>
      <span data-testid="texto">{t("common.save")}</span>
      <button onClick={() => setLanguage("en")}>pasar a en</button>
      <button onClick={() => setLanguage("es")}>pasar a es</button>
    </div>
  );
}

function Apariencia() {
  const { setPrefs } = useUiPrefs();
  const { setSkin } = useSkin();
  return (
    <div>
      <button onClick={() => setPrefs({ oled: true })}>oled</button>
      <button onClick={() => setPrefs({ density: undefined })}>sin densidad</button>
      <button onClick={() => setSkin("esmeralda")}>esmeralda</button>
    </div>
  );
}

function montar(conArranque: boolean) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider>
        {conArranque && <Arranque />}
        <Idioma />
        <Apariencia />
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

/** Deja correr todo lo pendiente (lecturas, escrituras en fila). */
const asentar = () => act(() => new Promise<void>((r) => setTimeout(r, 30)));

const prefsGuardadas = () => (db.fila?.ui_prefs ?? null) as Record<string, unknown> | null;
const escriturasDePrefs = () =>
  db.escrituras.filter((e) => "ui_prefs" in e).map((e) => e.ui_prefs as Record<string, unknown>);

beforeEach(() => {
  db.sesion = YO;
  db.fila = { ui_skin: "maven", ui_prefs: null };
  db.lecturas = 0;
  db.escrituras = [];
  db.retener = null;
  localStorage.clear();
});

afterEach(async () => {
  cleanup();
  await asentar();
});

describe("al abrir la sesión, el idioma del perfil", () => {
  it("se adopta si difiere del local, sin parpadear y sin volver a escribirlo", async () => {
    localStorage.setItem("app-language", "es");
    db.fila = { ui_skin: "maven", ui_prefs: { language: "en", oled: true } };

    montar(true);
    // Primer render: lo local, antes de que llegue la red. Nada de pantalla en
    // blanco ni de idioma por defecto que después cambia dos veces.
    expect(screen.getByTestId("texto").textContent).toBe("Guardar");

    await waitFor(() => expect(screen.getByTestId("texto").textContent).toBe("Save"));
    expect(localStorage.getItem("app-language")).toBe("en");
    expect(document.documentElement.lang).toBe("en");
    await asentar();
    expect(db.escrituras).toEqual([]);
  });

  it("si el perfil no tiene idioma, queda el local y no se escribe nada", async () => {
    localStorage.setItem("app-language", "en");
    db.fila = { ui_skin: "maven", ui_prefs: { oled: true } };

    montar(true);
    await waitFor(() => expect(db.lecturas).toBeGreaterThan(0));
    await asentar();

    expect(screen.getByTestId("texto").textContent).toBe("Save");
    expect(localStorage.getItem("app-language")).toBe("en");
    expect(db.escrituras).toEqual([]);
  });

  it("con ui_prefs vacío (NULL) o con un idioma que no existe, también queda el local", async () => {
    localStorage.setItem("app-language", "en");
    db.fila = { ui_skin: "maven", ui_prefs: { language: "ru" } }; // un idioma que Maven no habla (desde el 16/11 el francés sí)

    montar(true);
    await waitFor(() => expect(db.lecturas).toBeGreaterThan(0));
    await asentar();

    expect(screen.getByTestId("idioma").textContent).toBe("en");
    expect(db.escrituras).toEqual([]);
  });

  it("si la persona elige idioma mientras llega el perfil, gana lo que eligió", async () => {
    localStorage.setItem("app-language", "es");
    db.fila = { ui_skin: "maven", ui_prefs: { language: "es" } };
    let soltar: () => void = () => {};
    db.retener = new Promise<void>((r) => { soltar = r; });

    montar(true);
    await waitFor(() => expect(db.lecturas).toBe(1)); // la lectura del arranque, trabada
    fireEvent.click(screen.getByText("pasar a en"));
    expect(screen.getByTestId("idioma").textContent).toBe("en");

    await act(async () => { soltar(); });
    await asentar();

    // El arranque leyó "es" (lo viejo) pero no lo impone encima de la elección.
    expect(screen.getByTestId("idioma").textContent).toBe("en");
    expect(prefsGuardadas()).toEqual({ language: "en" });
  });
});

describe("elegir idioma lo guarda en el perfil", () => {
  it("sin pisar la apariencia que ya estaba guardada", async () => {
    db.fila = { ui_skin: "kash", ui_prefs: { oled: true, customHue: 200, density: "compact" } };

    montar(false);
    fireEvent.click(screen.getByText("pasar a en"));
    await waitFor(() => expect(db.escrituras).toHaveLength(1));

    expect(db.escrituras[0]).toEqual({
      ui_prefs: { oled: true, customHue: 200, density: "compact", language: "en" },
    });
    // Solo se toca ui_prefs: ni el skin ni ninguna otra columna.
    expect(Object.keys(db.escrituras[0])).toEqual(["ui_prefs"]);
    expect(localStorage.getItem("app-language")).toBe("en");
  });

  it("no escribe si el perfil ya tiene ese idioma", async () => {
    db.fila = { ui_skin: "maven", ui_prefs: { language: "en", contrast: true } };

    montar(false);
    fireEvent.click(screen.getByText("pasar a en"));
    await waitFor(() => expect(db.lecturas).toBe(1));
    await asentar();

    expect(db.escrituras).toEqual([]);
    expect(screen.getByTestId("texto").textContent).toBe("Save");
  });

  it("sin sesión funciona solo con localStorage: ni lee ni escribe el perfil", async () => {
    db.sesion = null;

    montar(true);
    fireEvent.click(screen.getByText("pasar a en"));
    expect(screen.getByTestId("texto").textContent).toBe("Save");
    expect(localStorage.getItem("app-language")).toBe("en");
    expect(document.documentElement.lang).toBe("en");
    await asentar();

    expect(db.lecturas).toBe(0);
    expect(db.escrituras).toEqual([]);
  });
});

describe("la apariencia reescribe solo lo suyo", () => {
  it("prender OLED no borra el idioma ni las claves que no conoce", async () => {
    db.fila = { ui_skin: "maven", ui_prefs: { language: "en", otraCosa: 7 } };

    montar(false);
    fireEvent.click(screen.getByText("oled"));
    await waitFor(() => expect(escriturasDePrefs()).toHaveLength(1));

    expect(prefsGuardadas()).toEqual({ language: "en", otraCosa: 7, oled: true });
  });

  it("apagar una preferencia la saca del perfil (no sobrevive la vieja)", async () => {
    localStorage.setItem("maven-ui-prefs", JSON.stringify({ density: "compact" }));
    db.fila = { ui_skin: "maven", ui_prefs: { density: "compact", language: "en" } };

    montar(false);
    fireEvent.click(screen.getByText("sin densidad"));
    await waitFor(() => expect(escriturasDePrefs()).toHaveLength(1));

    // Con un {...guardado, ...nuevo} el "compact" del perfil quedaría y volvería
    // en el próximo login.
    expect(prefsGuardadas()).toEqual({ language: "en" });
  });

  it("elegir un preset limpia el tono propio sin pisar el idioma", async () => {
    localStorage.setItem("maven-ui-prefs", JSON.stringify({ customHue: 120 }));
    db.fila = { ui_skin: "maven", ui_prefs: { customHue: 120, language: "en" } };

    montar(false);
    fireEvent.click(screen.getByText("esmeralda"));
    await waitFor(() => expect(escriturasDePrefs()).toHaveLength(1));
    await asentar();

    expect(prefsGuardadas()).toEqual({ language: "en" });
    expect(db.fila?.ui_skin).toBe("esmeralda");
  });

  it("idioma y OLED seguidos: quedan los dos (las escrituras van en fila)", async () => {
    localStorage.setItem("maven-ui-prefs", JSON.stringify({ contrast: true }));
    db.fila = { ui_skin: "maven", ui_prefs: { contrast: true } };

    montar(false);
    fireEvent.click(screen.getByText("pasar a en"));
    fireEvent.click(screen.getByText("oled"));
    await waitFor(() => expect(escriturasDePrefs()).toHaveLength(2));

    // Sin la fila, las dos leen {contrast} y la segunda borra lo de la primera.
    expect(prefsGuardadas()).toEqual({ contrast: true, language: "en", oled: true });
  });
});
