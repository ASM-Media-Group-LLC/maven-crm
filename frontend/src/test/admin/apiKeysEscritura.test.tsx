// Ajustes → API keys: las keys que MANDAN mensajes por el Messenger (PR 5 de la
// escritura, diseño §6.2).
//
// Lo que se cuida: que write vaya siempre con read (tildar write tilda read), que
// «Solo lectura» no diga eso de un scope que escribe, que el nombre visible aparezca
// solo con write y avise lo que la base va a rechazar (forma y raíces reservadas) sin
// tapar lo que contesta el servidor, la rotación («Reemplaza a…» solo con keys
// propias), que la confirmación viaje como acknowledge_messenger_writes_as, que la tabla
// diga «como «BLU»», la retirada de emergencia (en tandas de 200, con confirmación,
// progreso y Detener, también en keys revocadas), el aviso de «Maven sin actualizar»,
// la referencia del API con las rutas nuevas, y todo en inglés con la pantalla en inglés.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/hooks/useLanguage";
import { esEspanol } from "../i18n/detectarEspanol";
import { SCOPE_CATALOG, SCOPE_GROUPS } from "../../../../supabase/functions/manage-api-keys/api-scopes";
import {
  alternarScope, desdeCuando, errorDeRetirada, esqueleto, leerTanda, problemaDelNombreVisible, retirarEnTandas,
  RAICES_RESERVADAS, MAX_TANDAS,
} from "@/pages/admin/apiKeysEscritura";

const YO = "3f1c2b7a-9d4e-4a51-8c0f-2e6b7d9a1c35";
const OTRA = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const ANA = "0b6f6a4e-1111-4c2a-9a1e-6f0a2b3c4d5e";
const PEDRO = "0b6f6a4e-2222-4c2a-9a1e-6f0a2b3c4d5e";
const SECRETO = "mvk_live_0123456789abcdef0123456789abcdef0123456789abcd";

type W = Record<string, unknown>;
function llave(id: string, extra: W = {}): W {
  return {
    id, name: `Key ${id}`, key_prefix: "mvk_live_" + id.padEnd(6, "0"), last_four: "abcd",
    scopes: ["creators:read"], ip_whitelist: [], created_at: "2026-09-01T00:00:00Z",
    created_by_email: "admin@example.com", last_used_at: null, request_count: 0,
    expires_at: null, revoked_at: null, status: "active",
    acts_as: { id: YO, name: "Alvaro Mejia", active: true }, limite_por_hora: 1000, webhook: null,
    api_display_name: null, integracion_id: id,
    ...extra,
  };
}
const ESCRIBE = ["messenger:read", "messenger:write"];
const LLAVES = [
  // Una key a la que le sacaron write: conserva su nombre visible en la base, pero ya no
  // manda nada (ni «como «…»» ni retirada ni rotación).
  llave("lee", {
    name: "Solo lectura", scopes: ["messenger:read"], ip_whitelist: ["1.2.3.4"], expires_at: "2026-11-30T00:00:00Z",
    api_display_name: "Retired Bot",
  }),
  llave("blu", { name: "BLU prod", scopes: ESCRIBE, ip_whitelist: ["1.2.3.4"], expires_at: "2026-11-30T00:00:00Z", api_display_name: "BLU" }),
  llave("vieja", {
    name: "BLU old", scopes: ESCRIBE, ip_whitelist: ["1.2.3.4"], expires_at: "2026-10-30T00:00:00Z",
    revoked_at: "2026-09-20T00:00:00Z", status: "revoked", api_display_name: "BLU", integracion_id: "blu",
  }),
  llave("ajena", {
    name: "Kash Web", scopes: ESCRIBE, ip_whitelist: ["5.6.7.8"], expires_at: "2026-11-30T00:00:00Z",
    api_display_name: "Kash Web", acts_as: { id: OTRA, name: "Someone Else", active: true },
  }),
];
function lista(keys: W[] = LLAVES, extra: W = {}) {
  return {
    keys, scope_catalog: SCOPE_CATALOG, scope_groups: [...SCOPE_GROUPS], max_active_keys: 9,
    you: { id: YO, name: "Alvaro Mejia" }, webhooks_unknown: false, ...extra,
  };
}

// ─── Mocks ───────────────────────────────────────────────────────────────────

const llamadas: W[] = [];
let servidor: (body: W) => Promise<unknown>;
vi.mock("@/lib/adminInvoke", async () => {
  const real = await vi.importActual<typeof import("@/lib/adminInvoke")>("@/lib/adminInvoke");
  return {
    ...real,
    adminInvoke: (_fn: string, body: W) => {
      llamadas.push(body);
      return servidor(body);
    },
  };
});
vi.mock("sonner", () => ({ toast: { success: () => {}, error: () => {} } }));
vi.mock("@/pages/admin/carasDePersonas", () => ({ useCaras: () => new Map() }));

// La base: la RPC de la retirada y los nombres de profiles (para el aviso de versiones).
const base = vi.hoisted(() => ({
  rpc: [] as { fn: string; args: Record<string, unknown> }[],
  contestar: (async () => ({ data: { retirados: 0, quedan: 0 }, error: null })) as (args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>,
  perfiles: [] as { id: string; full_name: string | null }[],
  pedidosDePerfiles: [] as string[][],
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      base.rpc.push({ fn, args });
      return base.contestar(args);
    },
    from: (tabla: string) => ({
      select: () => ({
        in: async (_col: string, ids: string[]) => {
          if (tabla !== "profiles") throw new Error("tabla inesperada: " + tabla);
          base.pedidosDePerfiles.push(ids);
          return { data: base.perfiles.filter((p) => ids.includes(p.id)), error: null };
        },
      }),
    }),
    auth: { getSession: async () => ({ data: { session: { access_token: "x" } } }) },
  },
}));

// La presencia: quién está conectado con un Maven sin la etiqueta API.
const presencia = vi.hoisted(() => ({ viejas: [] as { userId: string; build: number | null }[], minimos: [] as number[] }));
vi.mock("@/hooks/useOnlinePresence", () => ({
  useOnlinePresence: () => ({
    versionesConectadas: (minimo: number) => { presencia.minimos.push(minimo); return presencia.viejas; },
  }),
}));

import AdminApiKeys from "@/pages/admin/AdminApiKeys";

function textosVisibles(raiz: HTMLElement): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.parentElement?.closest("code, pre, option")) continue;
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
// Lo que es DATO (el nombre de la key, el nombre visible) no se traduce: se saca.
const DATOS = ["Solo lectura", "BLU prod", "BLU old", "Kash Web"];
const enEspanol = (raiz: HTMLElement) =>
  textosVisibles(raiz).map((t) => DATOS.reduce((acc, d) => acc.split(d).join(""), t)).filter((t) => esEspanol(t));

let qc: QueryClient;
function montar() {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider>
        <AdminApiKeys />
      </LanguageProvider>
    </QueryClientProvider>,
  );
}
const casillaDe = (raiz: HTMLElement, scope: string) =>
  within(raiz).getByText(scope).closest("label")!.querySelector("input") as HTMLInputElement;
const fila = (nombre: string) => screen.getByText(nombre).closest("tr")!;

async function abrirAlta() {
  montar();
  await screen.findByText("BLU prod");
  fireEvent.click(screen.getByRole("button", { name: /Create API key/ }));
  return screen.findByRole("dialog");
}
/** El alta lista para crear una key que escribe (falta solo lo que cada test cambia). */
async function altaConEscritura(nombreVisible = "BLU Bot") {
  const d = await abrirAlta();
  fireEvent.change(within(d).getByLabelText("Name"), { target: { value: "Reports" } });
  fireEvent.click(casillaDe(d, "messenger:write"));
  fireEvent.change(within(d).getByPlaceholderText(/exact IPs/), { target: { value: "45.225.224.129" } });
  fireEvent.change(within(d).getByLabelText("Display name"), { target: { value: nombreVisible } });
  fireEvent.click(within(d).getByText(/I understand the key reads my conversations/).closest("label")!.querySelector("input")!);
  return d;
}
const botonCrear = (d: HTMLElement) => within(d).getByRole("button", { name: "Create key" }) as HTMLButtonElement;
const confirmarEscritura = (d: HTMLElement) =>
  fireEvent.click(within(d).getByText(/I understand the key sends messages on my behalf/).closest("label")!.querySelector("input")!);

beforeEach(() => {
  localStorage.setItem("app-language", "en");
  llamadas.length = 0;
  base.rpc.length = 0;
  base.perfiles = [];
  base.pedidosDePerfiles.length = 0;
  base.contestar = async () => ({ data: { retirados: 0, quedan: 0 }, error: null });
  presencia.viejas = [];
  presencia.minimos.length = 0;
  servidor = async (body) => (body.action === "list" ? lista() : body.action === "create" ? { key: SECRETO } : {});
});
afterEach(() => { vi.useRealTimers(); });

// ─── Lo puro ─────────────────────────────────────────────────────────────────

describe("alternarScope: write va con read", () => {
  it("tildar write tilda read; destildar read destilda write; destildar write deja read", () => {
    expect(alternarScope(["creators:read"], "messenger:write").sort()).toEqual(["creators:read", "messenger:read", "messenger:write"]);
    expect(alternarScope(["messenger:read", "messenger:write"], "messenger:read")).toEqual([]);
    expect(alternarScope(["messenger:read", "messenger:write"], "messenger:write")).toEqual(["messenger:read"]);
    expect(alternarScope([], "messenger:read")).toEqual(["messenger:read"]);
    expect(alternarScope(["sales:read"], "sales:read")).toEqual([]);
  });
});

describe("el nombre visible, como lo valida la base", () => {
  it("la forma: de 2 a 32, letras de Latin-1, números, espacio y . & _ -", () => {
    expect(problemaDelNombreVisible("BLU")).toBeNull();
    expect(problemaDelNombreVisible("  Kash   Web ")).toBeNull();
    expect(problemaDelNombreVisible("Ñandú_Bot")).toBeNull();
    expect(problemaDelNombreVisible("")).toBe("vacio");
    expect(problemaDelNombreVisible("   ")).toBe("vacio");
    expect(problemaDelNombreVisible("B")).toBe("forma");
    expect(problemaDelNombreVisible("B".repeat(33))).toBe("forma");
    expect(problemaDelNombreVisible("B".repeat(32))).toBeNull();
    expect(problemaDelNombreVisible("ВLU")).toBe("forma"); // В cirílica
    expect(problemaDelNombreVisible("B​LU")).toBe("forma"); // ancho cero
    expect(problemaDelNombreVisible("BLU 🤖")).toBe("forma");
    expect(problemaDelNombreVisible("--")).toBe("forma"); // esqueleto de menos de 2
  });

  it("las raíces reservadas caen aunque las disfracen", () => {
    for (const n of ["Mav3n", "MavenBot", "Sistemas", "Administración", "Alvaro_CEO", "Ciberseguridad", "S0porte", "Claude"]) {
      expect(problemaDelNombreVisible(n), n).toBe("reservado");
    }
    expect(esqueleto("Mav3n")).toBe("maven");
    expect(esqueleto("Ñandú_Bot")).toBe("nandu bot");
    expect(esqueleto("Æon & Co.")).toBe("aeon co");
  });

  it("las raíces son EXACTAMENTE las de la migración", () => {
    // Con import.meta.glob (patrón literal desde la raíz del repo), como las guardas de
    // i18n: el tsconfig de la app no trae los tipos de Node.
    const archivos = (import.meta as unknown as {
      glob: (p: string, o: Record<string, unknown>) => Record<string, string>;
    }).glob("/supabase/migrations/20261001200000_api_messenger_escritura.sql", { query: "?raw", import: "default", eager: true });
    const sql = Object.values(archivos)[0] ?? "";
    expect(sql.length, "no se pudo leer la migración").toBeGreaterThan(1000);
    const m = sql.match(/if _sin ~ '\(([a-z|]+)\)' then/);
    expect(m, "no encontré las raíces en api_keys_nombre_visible").toBeTruthy();
    expect([...RAICES_RESERVADAS]).toEqual(m![1].split("|"));
  });
});

describe("la retirada en tandas", () => {
  it("sigue hasta que no queda nada y suma lo retirado", async () => {
    const respuestas = [{ retirados: 200, quedan: 250 }, { retirados: 200, quedan: 50 }, { retirados: 50, quedan: 0 }];
    const vistos: number[] = [];
    const fin = await retirarEnTandas(async () => respuestas.shift(), { alProgresar: (p) => vistos.push(p.retirados) });
    expect(fin).toEqual({ estado: "listo", retirados: 450, quedan: 0 });
    expect(vistos).toEqual([200, 400, 450]);
  });

  it("se detiene a pedido (la tanda en curso termina) y no se repite si no avanza", async () => {
    let seguir = true;
    let n = 0;
    const fin = await retirarEnTandas(async () => { n++; seguir = false; return { retirados: 200, quedan: 10 }; }, { seguir: () => seguir });
    expect(n).toBe(1);
    expect(fin).toEqual({ estado: "detenido", retirados: 200, quedan: 10 });
    const atascado = await retirarEnTandas(async () => ({ retirados: 0, quedan: 7 }));
    expect(atascado).toEqual({ estado: "atascado", retirados: 0, quedan: 7 });
    let m = 0;
    const tope = await retirarEnTandas(async () => { m++; return { retirados: 1, quedan: 1 }; }, { maxTandas: 3 });
    expect([tope.estado, m]).toEqual(["atascado", 3]);
    expect(MAX_TANDAS).toBe(100);
  });

  it("un error no borra lo ya retirado; otra forma es un error", async () => {
    const respuestas: unknown[] = [{ retirados: 200, quedan: 5 }];
    const fin = await retirarEnTandas(async () => { if (!respuestas.length) throw { code: "MV403" }; return respuestas.shift(); });
    expect(fin.estado).toBe("error");
    expect(fin.retirados).toBe(200);
    expect(leerTanda({ retirados: "2", quedan: 0 })).toBeNull();
    expect((await retirarEnTandas(async () => [1, 2])).estado).toBe("error");
  });

  it("los errores de la base en palabras", () => {
    expect(errorDeRetirada({ code: "MV401" })).toBe("sin_sesion");
    expect(errorDeRetirada({ code: "MV403", details: '{"error": "forbidden"}' })).toBe("sin_permiso");
    expect(errorDeRetirada({ code: "MV404" })).toBe("sin_llave");
    expect(errorDeRetirada(new TypeError("Failed to fetch"))).toBe("otro");
  });

  it("desde cuándo: atajos, todo (null) y una fecha que no puede estar en el futuro", () => {
    const ahora = Date.parse("2026-10-01T12:00:00Z");
    expect(desdeCuando("hora", ahora, "")).toBe("2026-10-01T11:00:00.000Z");
    expect(desdeCuando("dia", ahora, "")).toBe("2026-09-30T12:00:00.000Z");
    expect(desdeCuando("semana", ahora, "")).toBe("2026-09-24T12:00:00.000Z");
    expect(desdeCuando("todo", ahora, "")).toBeNull();
    expect(desdeCuando("fecha", ahora, "")).toBeUndefined();
    expect(desdeCuando("fecha", ahora, "2099-01-01T00:00")).toBeUndefined();
    expect(desdeCuando("fecha", ahora, "2026-09-29T08:30")).toBe(new Date("2026-09-29T08:30").toISOString());
  });
});

// ─── El alta ─────────────────────────────────────────────────────────────────

describe("el alta de una key que escribe", () => {
  it("tildar write tilda read, y el nombre visible aparece solo con write", async () => {
    const d = await abrirAlta();
    expect(within(d).queryByLabelText("Display name")).toBeNull();
    fireEvent.click(casillaDe(d, "messenger:write"));
    expect(casillaDe(d, "messenger:write").checked).toBe(true);
    expect(casillaDe(d, "messenger:read").checked).toBe(true);
    expect(within(d).getByLabelText("Display name")).toBeTruthy();
    expect(within(d).getByText(/It's the name the key's messages go out with/)).toBeTruthy();
    // Destildar read se lleva write (y el campo).
    fireEvent.click(casillaDe(d, "messenger:read"));
    expect(casillaDe(d, "messenger:write").checked).toBe(false);
    expect(within(d).queryByLabelText("Display name")).toBeNull();
  });

  it("«Read-only» solo en los scopes de lectura; el que escribe dice que manda mensajes", async () => {
    const d = await abrirAlta();
    const etiquetaDe = (scope: string) => casillaDe(d, scope).closest("label")!.textContent ?? "";
    expect(etiquetaDe("messenger:write")).toContain("Sends messages");
    expect(etiquetaDe("messenger:write")).not.toContain("Read-only");
    expect(etiquetaDe("messenger:read")).toContain("Read-only");
    expect(within(d).getAllByText("Read-only")).toHaveLength(SCOPE_CATALOG.length - 1);
  });

  it("avisa lo que la base va a rechazar y no deja crear", async () => {
    const d = await altaConEscritura("Mav3n");
    confirmarEscritura(d);
    expect(within(d).getByText(/looks like Maven's or a department's/)).toBeTruthy();
    expect(botonCrear(d).disabled).toBe(true);
    fireEvent.change(within(d).getByLabelText("Display name"), { target: { value: "B" } });
    expect(within(d).getByText(/must be 2 to 32 characters long/)).toBeTruthy();
    expect(botonCrear(d).disabled).toBe(true);
    fireEvent.change(within(d).getByLabelText("Display name"), { target: { value: "" } });
    expect(botonCrear(d).disabled).toBe(true);
    fireEvent.change(within(d).getByLabelText("Display name"), { target: { value: "BLU Bot" } });
    expect(d.querySelector("[data-error-nombre-visible]")).toBeNull();
    expect(botonCrear(d).disabled).toBe(false);
  });

  it("sin la confirmación propia no se crea; con ella, viaja acknowledge_messenger_writes_as", async () => {
    const d = await altaConEscritura("  BLU   Bot ");
    expect(botonCrear(d).disabled).toBe(true);
    confirmarEscritura(d);
    expect(botonCrear(d).disabled).toBe(false);
    fireEvent.click(botonCrear(d));
    await waitFor(() => expect(llamadas.some((l) => l.action === "create")).toBe(true));
    const alta = llamadas.find((l) => l.action === "create")!;
    expect(alta).toMatchObject({
      display_name: "BLU Bot", acknowledge_messenger_writes_as: YO, acknowledge_messenger_reads_as: YO, lang: "en",
    });
    expect([...(alta.scopes as string[])].sort()).toEqual(["creators:read", "messenger:read", "messenger:write"]);
    expect(alta).not.toHaveProperty("replaces_key_id");
  });

  it("sin write no se manda nada de la escritura", async () => {
    const d = await abrirAlta();
    fireEvent.change(within(d).getByLabelText("Name"), { target: { value: "Plain" } });
    fireEvent.click(botonCrear(d));
    await waitFor(() => expect(llamadas.some((l) => l.action === "create")).toBe(true));
    const alta = llamadas.find((l) => l.action === "create")!;
    for (const campo of ["display_name", "replaces_key_id", "acknowledge_messenger_writes_as", "acknowledge_messenger_reads_as"]) {
      expect(alta, campo).not.toHaveProperty(campo);
    }
  });

  it("«Replaces…»: solo keys propias que escribían (también la revocada); trae su nombre y viaja replaces_key_id", async () => {
    const d = await altaConEscritura("");
    const select = within(d).getByLabelText("Replaces…") as HTMLSelectElement;
    const opciones = Array.from(select.options).map((o) => o.value);
    expect(opciones).toEqual(["", "blu", "vieja"]); // ni la ajena ni la de solo lectura
    expect(select.options[2].textContent).toBe("BLU old · “BLU” · Revoked");
    fireEvent.change(select, { target: { value: "vieja" } });
    expect((within(d).getByLabelText("Display name") as HTMLInputElement).value).toBe("BLU");
    confirmarEscritura(d);
    fireEvent.click(botonCrear(d));
    await waitFor(() => expect(llamadas.some((l) => l.action === "create")).toBe(true));
    expect(llamadas.find((l) => l.action === "create")).toMatchObject({ replaces_key_id: "vieja", display_name: "BLU" });
  });

  it("si se saca write después de elegir la rotación, no viaja", async () => {
    const d = await altaConEscritura();
    fireEvent.change(within(d).getByLabelText("Replaces…"), { target: { value: "blu" } });
    fireEvent.click(casillaDe(d, "messenger:write"));
    fireEvent.click(casillaDe(d, "messenger:write"));
    expect((within(d).getByLabelText("Replaces…") as HTMLSelectElement).value).toBe("");
    confirmarEscritura(d);
    fireEvent.click(botonCrear(d));
    await waitFor(() => expect(llamadas.some((l) => l.action === "create")).toBe(true));
    expect(llamadas.find((l) => l.action === "create")).not.toHaveProperty("replaces_key_id");
  });

  it("el error del servidor (ya traducido) queda a la vista en el formulario", async () => {
    servidor = async (body) => {
      if (body.action === "list") return lista();
      throw new Error("That display name looks like the name of someone in the agency: choose another one");
    };
    const d = await altaConEscritura("Anabel");
    confirmarEscritura(d);
    fireEvent.click(botonCrear(d));
    expect((await within(d).findByRole("alert")).textContent).toBe(
      "That display name looks like the name of someone in the agency: choose another one",
    );
    // Al corregir el nombre, el error viejo se va.
    fireEvent.change(within(d).getByLabelText("Display name"), { target: { value: "BLU Bot" } });
    expect(within(d).queryByRole("alert")).toBeNull();
  });

  it("el secreto se ve una vez y, al cerrar, no queda ni en la pantalla ni en las cachés", async () => {
    const d = await altaConEscritura();
    confirmarEscritura(d);
    fireEvent.click(botonCrear(d));
    expect(await screen.findByText(SECRETO)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Done, I've copied it/ }));
    await waitFor(() => expect(screen.queryByText(SECRETO)).toBeNull());
    await act(async () => { await Promise.resolve(); });
    expect(document.body.innerHTML).not.toContain(SECRETO);
    const enCache = JSON.stringify([
      qc.getMutationCache().getAll().map((m) => m.state.data ?? null),
      qc.getQueryCache().getAll().map((q) => q.state.data ?? null),
    ]);
    expect(enCache).not.toContain(SECRETO);
  });
});

describe("Maven sin actualizar", () => {
  it("al crear una key que escribe, dice cuántas personas y quiénes tienen un Maven sin la etiqueta", async () => {
    presencia.viejas = [{ userId: PEDRO, build: null }, { userId: ANA, build: null }];
    base.perfiles = [{ id: ANA, full_name: "Ana Ruiz" }, { id: PEDRO, full_name: "Pedro Gil" }];
    const d = await abrirAlta();
    expect(d.querySelector("[data-aviso-versiones]")).toBeNull();
    fireEvent.click(casillaDe(d, "messenger:write"));
    expect(await within(d).findByText("2 people connected with a version of Maven without the API label: Ana Ruiz, Pedro Gil")).toBeTruthy();
    expect(within(d).getByText(/Ask them to reload Maven/)).toBeTruthy();
    // Toda pestaña que dice su versión ya tiene la etiqueta: el mínimo es 1.
    expect(new Set(presencia.minimos)).toEqual(new Set([1]));
    expect(base.pedidosDePerfiles[base.pedidosDePerfiles.length - 1]).toEqual([ANA, PEDRO].sort());
  });

  it("una sola persona, y con nadie atrasado no dice nada", async () => {
    presencia.viejas = [{ userId: ANA, build: 5 }];
    base.perfiles = [{ id: ANA, full_name: "Ana Ruiz" }];
    const d = await abrirAlta();
    fireEvent.click(casillaDe(d, "messenger:write"));
    expect(await within(d).findByText("1 person connected with a version of Maven without the API label: Ana Ruiz")).toBeTruthy();
    presencia.viejas = [];
    fireEvent.click(casillaDe(d, "messenger:write"));
    fireEvent.click(casillaDe(d, "messenger:write"));
    expect(d.querySelector("[data-aviso-versiones]")).toBeNull();
  });
});

// ─── La tabla y la edición ───────────────────────────────────────────────────

describe("la tabla", () => {
  it("«Alvaro Mejia · as “BLU”» en las keys que escriben, nada en las que solo leen", async () => {
    montar();
    await screen.findByText("BLU prod");
    const celda = fila("BLU prod").querySelector('td[data-label="Acts as"]')!;
    expect(celda.textContent).toContain("Alvaro Mejia");
    expect(celda.querySelector("[data-nombre-visible]")!.textContent).toBe("· as “BLU”");
    expect(fila("Solo lectura").querySelector("[data-nombre-visible]")).toBeNull();
    expect(fila("Kash Web").querySelector("[data-nombre-visible]")!.textContent).toBe("· as “Kash Web”");
  });

  it("al editar una key propia que escribe: el nombre visible solo viaja si cambió", async () => {
    montar();
    await screen.findByText("BLU prod");
    fireEvent.click(within(fila("BLU prod")).getByTitle("Edit"));
    const d = await screen.findByRole("dialog");
    const campo = within(d).getByLabelText("Display name") as HTMLInputElement;
    expect(campo.value).toBe("BLU");
    // Ni la rotación ni la confirmación: eso es del alta.
    expect(within(d).queryByLabelText("Replaces…")).toBeNull();
    expect(d.querySelector("[data-confirma-escritura]")).toBeNull();
    fireEvent.click(within(d).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(llamadas.some((l) => l.action === "update")).toBe(true));
    expect(llamadas.find((l) => l.action === "update")).not.toHaveProperty("display_name");
  });

  it("al editar, cambiar el nombre visible lo manda; a una key que solo lee no se le suma write", async () => {
    montar();
    await screen.findByText("BLU prod");
    fireEvent.click(within(fila("BLU prod")).getByTitle("Edit"));
    let d = await screen.findByRole("dialog");
    fireEvent.change(within(d).getByLabelText("Display name"), { target: { value: "BLU Reports" } });
    fireEvent.click(within(d).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(llamadas.some((l) => l.action === "update")).toBe(true));
    expect(llamadas.find((l) => l.action === "update")).toMatchObject({ id: "blu", display_name: "BLU Reports" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(within(fila("Solo lectura")).getByTitle("Edit"));
    d = await screen.findByRole("dialog");
    expect(casillaDe(d, "messenger:write").disabled).toBe(true);
    expect(casillaDe(d, "messenger:read").disabled).toBe(false);
  });
});

// ─── La retirada ─────────────────────────────────────────────────────────────

describe("«Withdraw what it sent since…»", () => {
  const botonRetirar = (nombre: string) => within(fila(nombre)).queryByRole("button", { name: "Withdraw what it sent since…" });

  it("está en toda key que escribe, también la revocada; no en las que solo leen", async () => {
    montar();
    await screen.findByText("BLU prod");
    expect(botonRetirar("BLU prod")).toBeTruthy();
    expect(botonRetirar("BLU old")).toBeTruthy();
    expect(botonRetirar("Kash Web")).toBeTruthy();
    expect(botonRetirar("Solo lectura")).toBeNull();
  });

  it("pide confirmar y retira en tandas de 200, con el progreso, hasta que no queda nada", async () => {
    const pendientes: ((v: { data: unknown; error: unknown }) => void)[] = [];
    base.contestar = () => new Promise((r) => pendientes.push(r));
    montar();
    await screen.findByText("BLU prod");
    fireEvent.click(botonRetirar("BLU old")!);
    const d = await screen.findByRole("alertdialog");
    expect(within(d).getByText("Withdraw what “BLU” sent")).toBeTruthy();
    // Revocada: no hace falta decir que se revoque primero.
    expect(within(d).queryByText(/revoke it first/)).toBeNull();
    const retirar = within(d).getByRole("button", { name: "Withdraw" }) as HTMLButtonElement;
    expect(retirar.disabled).toBe(true);
    fireEvent.click(within(d).getByText(/I understand the messages are emptied for everyone/).closest("label")!.querySelector("input")!);
    expect(retirar.disabled).toBe(false);
    const antes = Date.now();
    fireEvent.click(retirar);
    await waitFor(() => expect(pendientes).toHaveLength(1));
    expect(base.rpc[0].fn).toBe("api_retirar_mensajes_de_integracion");
    expect(base.rpc[0].args).toMatchObject({ _llave: "vieja", _limite: 200 });
    // Por defecto, las últimas 24 horas.
    const desde = Date.parse(base.rpc[0].args._desde as string);
    expect(Math.abs(antes - 86_400_000 - desde)).toBeLessThan(5_000);
    // Mientras retira no se cierra: no hay Cancelar.
    expect(within(d).queryByRole("button", { name: "Cancel" })).toBeNull();
    await act(async () => { pendientes[0]({ data: { retirados: 200, quedan: 1001 }, error: null }); });
    expect(await within(d).findByText("Withdrawing… 200 withdrawn, more than 1,000 left")).toBeTruthy();
    await waitFor(() => expect(pendientes).toHaveLength(2));
    await act(async () => { pendientes[1]({ data: { retirados: 200, quedan: 30 }, error: null }); });
    await waitFor(() => expect(pendientes).toHaveLength(3));
    await act(async () => { pendientes[2]({ data: { retirados: 30, quedan: 0 }, error: null }); });
    expect(await within(d).findByText("Done: 430 messages were withdrawn.")).toBeTruthy();
    expect(base.rpc).toHaveLength(3);
    // Las tres con el MISMO desde.
    expect(new Set(base.rpc.map((r) => r.args._desde)).size).toBe(1);
  });

  it("«Everything it sent» manda desde = null; en una key activa sugiere revocarla primero", async () => {
    base.contestar = async () => ({ data: { retirados: 0, quedan: 0 }, error: null });
    montar();
    await screen.findByText("BLU prod");
    fireEvent.click(botonRetirar("BLU prod")!);
    const d = await screen.findByRole("alertdialog");
    expect(within(d).getByText(/revoke it first/)).toBeTruthy();
    fireEvent.click(within(d).getByRole("radio", { name: "Everything it sent" }));
    fireEvent.click(within(d).getByText(/I understand the messages are emptied/).closest("label")!.querySelector("input")!);
    fireEvent.click(within(d).getByRole("button", { name: "Withdraw" }));
    expect(await within(d).findByText("There was nothing to withdraw since that date.")).toBeTruthy();
    expect(base.rpc[0].args).toEqual({ _llave: "blu", _desde: null, _limite: 200 });
  });

  it("Detener: termina la tanda en curso, no pide otra y se puede seguir con el mismo desde", async () => {
    const pendientes: ((v: { data: unknown; error: unknown }) => void)[] = [];
    base.contestar = () => new Promise((r) => pendientes.push(r));
    montar();
    await screen.findByText("BLU prod");
    fireEvent.click(botonRetirar("BLU prod")!);
    const d = await screen.findByRole("alertdialog");
    fireEvent.click(within(d).getByText(/I understand the messages are emptied/).closest("label")!.querySelector("input")!);
    fireEvent.click(within(d).getByRole("button", { name: "Withdraw" }));
    await waitFor(() => expect(pendientes).toHaveLength(1));
    fireEvent.click(within(d).getByRole("button", { name: "Stop" }));
    await act(async () => { pendientes[0]({ data: { retirados: 200, quedan: 40 }, error: null }); });
    expect(await within(d).findByText("Stopped: 200 withdrawn and 40 left. You can continue whenever you want.")).toBeTruthy();
    expect(base.rpc).toHaveLength(1);
    fireEvent.click(within(d).getByRole("button", { name: "Keep withdrawing" }));
    await waitFor(() => expect(pendientes).toHaveLength(2));
    await act(async () => { pendientes[1]({ data: { retirados: 40, quedan: 0 }, error: null }); });
    expect(await within(d).findByText("Done: 240 messages were withdrawn.")).toBeTruthy();
    expect(base.rpc[1].args._desde).toBe(base.rpc[0].args._desde);
  });

  it("si la base dice que no puede, lo dice en palabras y no ofrece reintentar", async () => {
    base.contestar = async () => ({ data: null, error: { code: "MV403", details: '{"error": "forbidden"}', message: "x" } });
    montar();
    await screen.findByText("BLU prod");
    fireEvent.click(botonRetirar("Kash Web")!);
    const d = await screen.findByRole("alertdialog");
    fireEvent.click(within(d).getByText(/I understand the messages are emptied/).closest("label")!.querySelector("input")!);
    fireEvent.click(within(d).getByRole("button", { name: "Withdraw" }));
    expect(await within(d).findByText(/Only an admin of the key's agency or the key's person/)).toBeTruthy();
    expect(within(d).queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("el diálogo, entero en inglés", async () => {
    montar();
    await screen.findByText("BLU prod");
    fireEvent.click(botonRetirar("BLU prod")!);
    const d = await screen.findByRole("alertdialog");
    fireEvent.click(within(d).getByRole("radio", { name: "A date and time…" }));
    expect(within(d).getByLabelText("Date and time to withdraw from")).toBeTruthy();
    expect(enEspanol(d)).toEqual([]);
  });
});

// ─── La referencia del API ───────────────────────────────────────────────────

describe("la referencia del API con la escritura", () => {
  it("las rutas nuevas con su método (sin claves repetidas), el ejemplo y los topes", async () => {
    const errores = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      montar();
      await screen.findByText("BLU prod");
      fireEvent.click(screen.getAllByRole("button", { name: /API reference/ })[0]);
      const d = await screen.findByRole("dialog");
      const rutas = Array.from(d.querySelectorAll(".rounded-md.border.p-2\\.5")).map((c) =>
        `${c.querySelector(".font-mono")?.textContent} ${c.querySelector("code")?.textContent}`);
      for (const r of [
        "GET /messenger/conversations", "POST /messenger/conversations", "POST /messenger/conversations/{id}/messages",
        "PATCH /messenger/conversations/{id}/messages/{message_id}", "DELETE /messenger/conversations/{id}/messages/{message_id}",
        "GET /messenger/people",
      ]) expect(rutas, r).toContain(r);
      // GET y POST /messenger/conversations: con `key={e.p}` React avisaría la clave repetida.
      expect(errores.mock.calls.map((c) => String(c[0])).filter((m) => /same key/i.test(m))).toEqual([]);
      const ejemplo = d.querySelector("[data-docs-escritura] pre")!.textContent!;
      expect(ejemplo).toMatch(/-X POST ".*\/messenger\/conversations\/\{id\}\/messages"/);
      expect(ejemplo).toContain('-H "Content-Type: application/json"');
      expect(ejemplo).toMatch(/-H "Idempotency-Key: [!-~]{8,100}"/);
      const escritura = d.querySelector("[data-docs-escritura]")!.textContent!;
      expect(escritura).toContain("valid for 72 hours");
      expect(escritura).toContain("1,000 messages per hour");
      expect(escritura).toContain("(people in the conversation − 1) + 3");
      expect(escritura).toContain("conversation_loop");
      expect(escritura).toContain("503 outcome_unknown");
      expect(escritura).toMatch(/Retry with the same Idempotency-Key/);
      // El directorio solo anda con la escritura encendida.
      expect(within(d).getByText(/only answers while writing is on: when it's off or paused, it gives 503 writes_paused/)).toBeTruthy();
      const rondas = d.querySelector("[data-docs-rondas]")!.textContent!;
      expect(rondas).toContain("exclude_own: true");
      expect(rondas).toContain("429 conversation_loop");
      expect(within(d).getByText(/Everything is read-only, except the Messenger routes that require messenger:write/)).toBeTruthy();
      expect(enEspanol(d)).toEqual([]);
    } finally {
      errores.mockRestore();
    }
  });

  it("el subtítulo ya no dice que todo es de solo lectura", async () => {
    montar();
    await screen.findByText("BLU prod");
    expect(screen.getByText(/and, with its own permission, to the Messenger: reading it and sending messages/)).toBeTruthy();
    expect(screen.queryByText(/^Read-only programmatic access/)).toBeNull();
  });
});

describe("todo en inglés", () => {
  it("el alta con write, la rotación, la confirmación y el aviso de versiones", async () => {
    presencia.viejas = [{ userId: ANA, build: null }];
    base.perfiles = [{ id: ANA, full_name: "Ana Ruiz" }];
    const d = await altaConEscritura("Mav3n");
    await within(d).findByText(/1 person connected/);
    expect(within(d).getByLabelText("Replaces…")).toBeTruthy();
    expect(enEspanol(d)).toEqual([]);
    // Las opciones de la rotación también (salvo el nombre de la key y el visible, que son datos).
    const opciones = Array.from((within(d).getByLabelText("Replaces…") as HTMLSelectElement).options).map((o) => o.textContent ?? "");
    expect(opciones.map((o) => DATOS.reduce((acc, x) => acc.split(x).join(""), o)).filter(esEspanol)).toEqual([]);
  });

  it("y en español, neutro: «puedes», nunca «podés»", async () => {
    localStorage.setItem("app-language", "es");
    montar();
    await screen.findByText("BLU prod");
    fireEvent.click(screen.getByRole("button", { name: /Crear API key/ }));
    const d = await screen.findByRole("dialog");
    fireEvent.click(casillaDe(d, "messenger:write"));
    expect(within(d).getByText("Nombre visible")).toBeTruthy();
    expect(within(d).getByText(/Esta key va a mandar mensajes en el Messenger a nombre de Alvaro Mejia/)).toBeTruthy();
    expect(within(d).getAllByText("Manda mensajes")).toHaveLength(1);
  });
});
