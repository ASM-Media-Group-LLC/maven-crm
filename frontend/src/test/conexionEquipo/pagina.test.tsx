// Ajustes → Conectar tu plataforma (agencias conectadas, 11/11/2026).
//
// Lo que se cuida:
//   · los tres estados: sin conectar, ensayo con un envío, aplicando;
//   · que «Aplicar» lo cambie SOLO el dueño de ESTA agencia y con confirmación en la
//     página (nada de window.confirm), y que la consulta de dueño vaya atada a la agencia;
//   · aprobar crea la cuenta como «Agregar usuario» y la marca aprobada; si marcarla
//     falla, Reintentar NO crea otra; la contraseña temporal nunca se ve;
//   · descartar solo la marca;
//   · un fallo al cargar se dice como fallo, nunca como «no hay nada»;
//   · los roles sin permisos llevan al editor de permisos con el rol ya abierto.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const YO = "3f1c2b7a-9d4e-4a51-8c0f-2e6b7d9a1c35";
const AGENCIA = "7d0a5b1e-1111-4c2d-9e3f-000000000001";
const CLAVE_TEMPORAL = "CLAVE-TEMPORAL-NO-MOSTRAR-9431";

type Res = { data: unknown; error: { message: string } | null };
const db = vi.hoisted(() => ({
  tablas: {} as Record<string, Res>,
  rpcs: {} as Record<string, Res | ((args: unknown) => Res)>,
  alActualizar: { data: [{ aplicar: true }], error: null } as Res,
  consultas: [] as { tabla: string; filtros: [string, unknown][] }[],
  actualizaciones: [] as { tabla: string; valores: unknown; filtros: [string, unknown][] }[],
  rpcLlamadas: [] as { fn: string; args: unknown }[],
  invocaciones: [] as { fn: string; body: Record<string, unknown> }[],
  servidor: null as null | ((fn: string, body: Record<string, unknown>) => Promise<unknown>),
  avisos: { ok: [] as string[], error: [] as string[] },
}));

vi.mock("@/integrations/supabase/client", () => {
  const constructor = (tabla: string) => {
    const filtros: [string, unknown][] = [];
    let valores: unknown = null;
    const resultado = (): Res => {
      if (valores !== null) {
        db.actualizaciones.push({ tabla, valores, filtros });
        return db.alActualizar;
      }
      db.consultas.push({ tabla, filtros });
      return db.tablas[tabla] ?? { data: [], error: null };
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      select: () => b,
      eq: (c: string, v: unknown) => { filtros.push([c, v]); return b; },
      order: () => b,
      limit: () => b,
      update: (v: unknown) => { valores = v; return b; },
      maybeSingle: () => Promise.resolve(resultado()),
      then: (ok: (r: Res) => unknown, mal?: (e: unknown) => unknown) => Promise.resolve(resultado()).then(ok, mal),
    };
    return b;
  };
  return {
    supabase: {
      from: (t: string) => constructor(t),
      rpc: (fn: string, args?: unknown) => {
        db.rpcLlamadas.push({ fn, args });
        const r = db.rpcs[fn];
        return Promise.resolve(typeof r === "function" ? r(args) : r ?? { data: [], error: null });
      },
      auth: { getSession: () => Promise.resolve({ data: { session: { access_token: "x" } } }) },
    },
  };
});
vi.mock("@/lib/adminInvoke", async () => {
  const real = await vi.importActual<typeof import("@/lib/adminInvoke")>("@/lib/adminInvoke");
  return {
    ...real,
    adminInvoke: (fn: string, body: Record<string, unknown>) => {
      db.invocaciones.push({ fn, body });
      return db.servidor!(fn, body);
    },
  };
});
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "3f1c2b7a-9d4e-4a51-8c0f-2e6b7d9a1c35" } }) }));
vi.mock("@/hooks/useLanguage", () => {
  const idioma = {
    language: "es",
    setLanguage: () => {},
    t: (k: string, p?: Record<string, string | number>) => (p ? `${k} ${JSON.stringify(p)}` : k),
  };
  return { useLanguage: () => idioma, useLanguageSiHay: () => idioma };
});
vi.mock("sonner", () => ({
  toast: {
    success: (m: string) => { db.avisos.ok.push(m); },
    error: (m: string) => { db.avisos.error.push(m); },
  },
}));
vi.mock("@/components/ui/page-header", () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));

import ConexionEquipo from "@/pages/admin/ConexionEquipo";

// ── Datos de prueba ─────────────────────────────────────────────────────────

function llave(extra: Record<string, unknown> = {}) {
  return {
    id: "k-equipo", name: "Backstage", key_prefix: "mvk_live_ab12", last_four: "abcd", scopes: ["equipo:write"],
    ip_whitelist: [], created_at: "2026-11-10T00:00:00Z", created_by_email: "alvaro@example.com",
    last_used_at: null, request_count: 0, expires_at: null, revoked_at: null, status: "active",
    acts_as: { id: YO, name: "Alvaro", active: true }, webhook: null, ...extra,
  };
}
const lista = (keys: unknown[]) => ({ keys, you: { id: YO, name: "Alvaro" }, webhooks_unknown: false, scope_catalog: [], scope_groups: [], max_active_keys: 5 });

const integracion = (extra: Record<string, unknown> = {}) => ({
  tenant_id: AGENCIA, aplicar: false, ultima_sync: null, ultima_sync_at: null, ...extra,
});

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const ENVIO_ENSAYO = {
  id: "s1", created_at: "2026-11-11T14:00:00Z", ultima_vez: "2026-11-11T15:00:00Z", repeticiones: 3, ensayo: true, recibidas: 12,
  resumen: {
    recibidas: 12,
    cambios: [
      { user_id: U1, correo: "ana@agencia.com", nombre: "Ana Torres", campo: "rol", antes: "Chatter", despues: "Supervisor" },
      { user_id: U2, correo: "luis@agencia.com", nombre: "Luis Gil", campo: "rol", antes: "Chatter", despues: "Fantasma" },
    ],
    pendientes_de_crear: [{ correo: "nueva@agencia.com", nombre: "Nueva Persona", rol: "Chatter", equipo: "Turno A" }],
    roles_desconocidos: [{ rol: "Closer Senior", correos: ["x@agencia.com", "y@agencia.com"] }],
    protegidos: [{ user_id: YO, correo: "alvaro@agencia.com", nombre: "Alvaro", motivo: "admin_o_dueno" }],
    no_vienen_en_backstage: [],
    en_papelera: [],
    rechazados: [{ indice: 4, correo: "jefa@agencia.com", campo: "nivel", motivo: "nivel_de_admin", valor: "admin" }],
    freno_de_bajas: null,
  },
  aplicados: [{ user_id: U1, campo: "rol" }],
  rechazados_base: [{ user_id: U2, campo: "rol", motivo: "rol_desconocido" }],
};
const PENDIENTE = {
  id: "p1", correo: "ana.torres@agencia.com", nombre: "Ana Torres", rol: "Chatter", nivel: "agente", equipo: "Turno A",
  reporta_a_correo: "jefe@agencia.com", veces: 2, primera_vez: "2026-11-10T10:00:00Z", ultima_vez: "2026-11-11T10:00:00Z", estado: "pendiente",
};

function escenario({ keys = [] as unknown[], integ = integracion() as unknown, syncs = [] as unknown[], pendientes = [] as unknown[],
  roles = [] as unknown[], dueno = true, webhooks = [] as unknown[] } = {}) {
  db.tablas = {
    integracion_equipo: { data: integ, error: null },
    integracion_equipo_syncs: { data: syncs, error: null },
    integracion_equipo_pendientes: { data: pendientes, error: null },
    tenant_owners: { data: dueno ? { user_id: YO } : null, error: null },
  };
  db.rpcs = {
    equipo_roles_sin_permisos: { data: roles, error: null },
    equipo_pendiente_resolver: { data: { id: "p1", estado: "aprobada", user_id: "nuevo-1", equipo: null, reporta_a: null }, error: null },
    equipo_webhooks: { data: webhooks, error: null },
    equipo_webhook_entregas: { data: [], error: null },
    equipo_webhook_cambiar: { data: {}, error: null },
    equipo_webhook_probar: { data: { entrega_id: "e1" }, error: null },
  };
  db.servidor = (fn, body) => {
    if (fn === "manage-api-keys" && body.action === "list") return Promise.resolve(lista(keys));
    if (fn === "admin-user-actions" && body.action === "create_user") {
      return Promise.resolve({
        success: true, user_id: "nuevo-1", email: body.email, temp_password: CLAVE_TEMPORAL,
        hand_delivery: false, email_sent: true, email_error: null, email_sent_to: body.email,
      });
    }
    return Promise.reject(new Error(`inesperado: ${fn} ${String(body.action)}`));
  };
}

let qcActual: QueryClient;
function pintar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qcActual = qc;
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/settings?sub=conexion-equipo"]}><ConexionEquipo /></MemoryRouter>
    </QueryClientProvider>,
  );
}
const seccion = (titulo: string) => screen.getByRole("region", { name: titulo });

beforeEach(() => {
  db.consultas.length = 0;
  db.actualizaciones.length = 0;
  db.rpcLlamadas.length = 0;
  db.invocaciones.length = 0;
  db.avisos.ok.length = 0;
  db.avisos.error.length = 0;
  db.alActualizar = { data: [{ aplicar: true }], error: null };
});

// ── Estados ─────────────────────────────────────────────────────────────────

describe("sin conectar", () => {
  it("dice que no hay llave, que nunca mandó, y ofrece crearla con el permiso del equipo", async () => {
    escenario();
    pintar();
    const estado = seccion("conexionEquipo.estado.titulo");
    expect(await within(estado).findByText("conexionEquipo.estado.sinConectar")).toBeTruthy();
    expect(within(estado).getByText("conexionEquipo.estado.sinLlave")).toBeTruthy();
    expect(within(estado).getByText("conexionEquipo.estado.nunca")).toBeTruthy();
    // Nace en ensayo.
    expect(within(estado).getByRole("radio", { name: /conexionEquipo\.modo\.ensayo/ }).getAttribute("aria-checked")).toBe("true");

    const crear = screen.getByRole("link", { name: /conexionEquipo\.pasos\.1\.boton/ });
    const destino = new URL(crear.getAttribute("href")!, "https://maven.test");
    expect(destino.pathname).toBe("/settings");
    expect(destino.searchParams.get("sub")).toBe("api-keys");
    expect(destino.searchParams.get("crear")).toBe("equipo:write");

    expect(await within(seccion("conexionEquipo.sync.titulo")).findByText("conexionEquipo.sync.nada")).toBeTruthy();
    expect(await within(seccion("conexionEquipo.avisos.titulo")).findByText("conexionEquipo.avisos.primeroLlave")).toBeTruthy();
  });

  it("las instrucciones que se copian traen la base del API, los endpoints y la regla de la llave", async () => {
    escenario();
    pintar();
    fireEvent.click(await screen.findByRole("button", { name: "conexionEquipo.pasos.2.ver" }));
    const texto = document.getElementById("instrucciones-equipo")!.textContent!;
    expect(texto).toMatch(/conexionEquipo\.instr\.base \{"base":"https:\/\/.+\/functions\/v1\/public-api"\}/);
    expect(texto).toContain("conexionEquipo.instr.secreto");
    expect(texto).toContain("\"personas\"");
    expect(texto).toContain("equipo.persona_entro");
    expect(texto).toContain("equipo.persona_salio");
    expect(texto).toContain("equipo.rol_cambio");
    expect(texto).toContain("$MAVEN_API_KEY");
    // Nunca una llave de verdad en el texto.
    expect(texto).not.toMatch(/mvk_live_[A-Za-z0-9]{6,}/);
  });
});

describe("ensayo con un envío", () => {
  it("muestra la llave conectada, el último envío y sus cifras", async () => {
    escenario({
      keys: [llave()],
      integ: integracion({ ultima_sync_at: "2026-11-11T15:00:00Z", ultima_sync: { recibidas: 12, cambios: 2, aplicados: 0, rechazados: 1 } }),
      syncs: [ENVIO_ENSAYO],
    });
    pintar();
    const estado = seccion("conexionEquipo.estado.titulo");
    expect(await within(estado).findByText("conexionEquipo.estado.conectada")).toBeTruthy();
    expect(within(estado).getByText(/conexionEquipo\.estado\.llaveActiva.*Backstage/)).toBeTruthy();
    expect(within(estado).getByText(/conexionEquipo\.estado\.resumenCorto.*"recibidas":12.*"cambios":2/)).toBeTruthy();

    const sync = seccion("conexionEquipo.sync.titulo");
    expect(await within(sync).findByText("conexionEquipo.sync.enEnsayo")).toBeTruthy();
    // En ensayo nada se aplicó: la cifra dice «se aplicarían».
    expect(within(sync).getByText("conexionEquipo.sync.n.seAplicarian")).toBeTruthy();
    expect(within(sync).queryByText("conexionEquipo.sync.n.aplicados")).toBeNull();
    expect(within(sync).getByText(/conexionEquipo\.sync\.repetido.*"n":3/)).toBeTruthy();
  });

  it("los rechazos (de la edge y de la base) se leen en palabras, con el correo de cada uno", async () => {
    escenario({ keys: [llave()], syncs: [ENVIO_ENSAYO] });
    pintar();
    const sync = seccion("conexionEquipo.sync.titulo");
    fireEvent.click(await within(sync).findByRole("button", { name: /conexionEquipo\.sync\.det\.rechazados/ }));
    expect(await within(sync).findByText(/conexionEquipo\.motivo\.nivel_de_admin/)).toBeTruthy();
    expect(within(sync).getByText("jefa@agencia.com")).toBeTruthy();
    // La base contesta por user_id: se muestra el correo del cambio.
    expect(within(sync).getByText(/conexionEquipo\.motivo\.rol_desconocido/)).toBeTruthy();
    expect(within(sync).getByText("luis@agencia.com")).toBeTruthy();

    fireEvent.click(within(sync).getByRole("button", { name: /conexionEquipo\.sync\.det\.cambios/ }));
    // El cambio que la base rechazaría va marcado; el otro no.
    expect(await within(sync).findAllByText("conexionEquipo.sync.det.noSeAplicaria")).toHaveLength(1);
  });

  it("solo el dueño de ESTA agencia activa «Aplicar», y con confirmación en la página", async () => {
    const confirmar = vi.spyOn(window, "confirm");
    escenario({ keys: [llave()], syncs: [ENVIO_ENSAYO] });
    pintar();
    const estado = seccion("conexionEquipo.estado.titulo");
    const aplicar = await within(estado).findByRole("radio", { name: /conexionEquipo\.modo\.aplicar/ });
    await waitFor(() => expect(aplicar.getAttribute("aria-disabled")).toBe("false"));

    // La pregunta «¿soy dueño?» va atada a la agencia de la pantalla.
    const dueno = db.consultas.find((c) => c.tabla === "tenant_owners")!;
    expect(dueno.filtros).toEqual(expect.arrayContaining([["user_id", YO], ["tenant_id", AGENCIA]]));

    fireEvent.click(aplicar);
    // Primero se confirma en la página; todavía no se escribió nada.
    expect(await within(estado).findByRole("alertdialog")).toBeTruthy();
    expect(db.actualizaciones).toHaveLength(0);
    expect(confirmar).not.toHaveBeenCalled();

    fireEvent.click(within(estado).getByRole("button", { name: /conexionEquipo\.modo\.confirmarSi/ }));
    await waitFor(() => expect(db.actualizaciones).toHaveLength(1));
    expect(db.actualizaciones[0]).toMatchObject({ tabla: "integracion_equipo", valores: { aplicar: true } });
    expect(db.actualizaciones[0].filtros).toContainEqual(["tenant_id", AGENCIA]);
    await waitFor(() => expect(db.avisos.ok).toContain("conexionEquipo.modo.yaAplica"));
    confirmar.mockRestore();
  });

  it("si la base no devuelve la fila (no es dueño), no lo da por cambiado", async () => {
    escenario({ keys: [llave()] });
    db.alActualizar = { data: [], error: null };
    pintar();
    const estado = seccion("conexionEquipo.estado.titulo");
    const aplicar = await within(estado).findByRole("radio", { name: /conexionEquipo\.modo\.aplicar/ });
    await waitFor(() => expect(aplicar.getAttribute("aria-disabled")).toBe("false"));
    fireEvent.click(aplicar);
    fireEvent.click(await within(estado).findByRole("button", { name: /conexionEquipo\.modo\.confirmarSi/ }));
    await waitFor(() => expect(db.avisos.error).toContain("conexionEquipo.modo.soloDueno"));
    expect(db.avisos.ok).toHaveLength(0);
  });
});

describe("aplicando", () => {
  it("dice que aplica, el paso 3 queda hecho y el envío figura como aplicado", async () => {
    escenario({
      keys: [llave()],
      integ: integracion({ aplicar: true, ultima_sync_at: "2026-11-11T15:00:00Z", ultima_sync: { recibidas: 12, cambios: 2 } }),
      syncs: [{ ...ENVIO_ENSAYO, ensayo: false }],
    });
    pintar();
    const estado = seccion("conexionEquipo.estado.titulo");
    expect(await within(estado).findByRole("radio", { name: /conexionEquipo\.modo\.aplicar/ })).toHaveAttribute("aria-checked", "true");
    expect(within(estado).getAllByText("conexionEquipo.modo.aplicando").length).toBeGreaterThan(0);
    const pasos = seccion("conexionEquipo.pasos.titulo");
    // Paso 1 (llave) y paso 3 (aplicando) hechos.
    expect(within(pasos).getAllByText("conexionEquipo.pasos.hecho")).toHaveLength(2);
    const sync = seccion("conexionEquipo.sync.titulo");
    expect(await within(sync).findByText("conexionEquipo.sync.aplicado")).toBeTruthy();
    expect(within(sync).getByText("conexionEquipo.sync.n.aplicados")).toBeTruthy();
  });

  it("quien no es dueño ve el modo pero no lo puede cambiar", async () => {
    escenario({ keys: [llave()], integ: integracion({ aplicar: true }), dueno: false });
    pintar();
    const estado = seccion("conexionEquipo.estado.titulo");
    expect(await within(estado).findByText("conexionEquipo.modo.soloDueno")).toBeTruthy();
    const ensayo = within(estado).getByRole("radio", { name: /conexionEquipo\.modo\.ensayo/ });
    expect(ensayo).toBeDisabled();
    fireEvent.click(ensayo);
    expect(db.actualizaciones).toHaveLength(0);
  });
});

// ── Personas pendientes ─────────────────────────────────────────────────────

describe("personas pendientes", () => {
  it("aprobar crea la cuenta como «Agregar usuario» y la marca aprobada; la contraseña nunca se ve", async () => {
    escenario({ keys: [llave()], pendientes: [PENDIENTE] });
    pintar();
    const pend = seccion("conexionEquipo.pend.titulo");
    expect(await within(pend).findByText(/conexionEquipo\.pend\.acceso.*ana\.torres@agencia\.com/)).toBeTruthy();
    fireEvent.click(within(pend).getByRole("button", { name: /conexionEquipo\.pend\.aprobar/ }));

    await waitFor(() => expect(db.rpcLlamadas.some((l) => l.fn === "equipo_pendiente_resolver")).toBe(true));
    const alta = db.invocaciones.find((i) => i.fn === "admin-user-actions")!;
    expect(alta.body).toEqual({
      action: "create_user", email: "ana.torres@agencia.com", first_name: "Ana", last_name: "Torres", role: "Chatter",
    });
    expect(db.rpcLlamadas.find((l) => l.fn === "equipo_pendiente_resolver")!.args)
      .toEqual({ _id: "p1", _accion: "aprobar", _user_id: "nuevo-1" });
    expect(await within(pend).findByText(/conexionEquipo\.pend\.aprobada.*ana\.torres@agencia\.com/)).toBeTruthy();
    expect(document.body.textContent).not.toContain(CLAVE_TEMPORAL);
  });

  it("si la cuenta se crea pero no se puede marcar, Reintentar solo la marca: no crea otra", async () => {
    escenario({ keys: [llave()], pendientes: [PENDIENTE] });
    let veces = 0;
    db.rpcs.equipo_pendiente_resolver = () => (++veces === 1 ? { data: null, error: { message: "caída" } } : { data: null, error: null });
    pintar();
    const pend = seccion("conexionEquipo.pend.titulo");
    fireEvent.click(await within(pend).findByRole("button", { name: /conexionEquipo\.pend\.aprobar/ }));
    expect(await within(pend).findByText(/conexionEquipo\.pend\.creadaSinMarcar/)).toBeTruthy();
    // Con la cuenta ya creada no se puede descartar.
    expect(within(pend).getByRole("button", { name: /conexionEquipo\.pend\.descartar/ })).toBeDisabled();

    fireEvent.click(within(pend).getByRole("button", { name: /common\.retry/ }));
    expect(await within(pend).findByText(/conexionEquipo\.pend\.aprobada/)).toBeTruthy();
    expect(db.invocaciones.filter((i) => i.fn === "admin-user-actions")).toHaveLength(1);
    expect(db.rpcLlamadas.filter((l) => l.fn === "equipo_pendiente_resolver")).toHaveLength(2);
  });

  it("si no se puede crear la cuenta, lo dice y no la marca", async () => {
    escenario({ keys: [llave()], pendientes: [PENDIENTE] });
    const antes = db.servidor!;
    db.servidor = (fn, body) => (fn === "admin-user-actions" ? Promise.reject(new Error("No quedan puestos")) : antes(fn, body));
    pintar();
    const pend = seccion("conexionEquipo.pend.titulo");
    fireEvent.click(await within(pend).findByRole("button", { name: /conexionEquipo\.pend\.aprobar/ }));
    expect(await within(pend).findByText(/conexionEquipo\.pend\.noSeCreo.*No quedan puestos/)).toBeTruthy();
    expect(db.rpcLlamadas.some((l) => l.fn === "equipo_pendiente_resolver")).toBe(false);
  });

  it("descartar solo la marca descartada, sin crear cuenta", async () => {
    escenario({ keys: [llave()], pendientes: [PENDIENTE] });
    pintar();
    const pend = seccion("conexionEquipo.pend.titulo");
    fireEvent.click(await within(pend).findByRole("button", { name: /conexionEquipo\.pend\.descartar/ }));
    await waitFor(() => expect(db.rpcLlamadas.some((l) => l.fn === "equipo_pendiente_resolver")).toBe(true));
    expect(db.rpcLlamadas.find((l) => l.fn === "equipo_pendiente_resolver")!.args).toEqual({ _id: "p1", _accion: "descartar" });
    expect(db.invocaciones.some((i) => i.fn === "admin-user-actions")).toBe(false);
    expect(await within(pend).findByText(/conexionEquipo\.pend\.descartada/)).toBeTruthy();
  });
});

// ── Fallos: un fallo no es «vacío» ──────────────────────────────────────────

describe("un fallo al cargar no es «no hay nada»", () => {
  it("pendientes, roles, envíos y llaves que fallan se dicen como fallo, con Reintentar", async () => {
    escenario();
    db.tablas.integracion_equipo_pendientes = { data: null, error: { message: "timeout" } };
    db.tablas.integracion_equipo_syncs = { data: null, error: { message: "timeout" } };
    db.rpcs.equipo_roles_sin_permisos = { data: null, error: { message: "timeout" } };
    db.servidor = () => Promise.reject(new Error("503"));
    pintar();

    const pend = seccion("conexionEquipo.pend.titulo");
    expect(await within(pend).findByText("conexionEquipo.fallo")).toBeTruthy();
    expect(within(pend).queryByText("conexionEquipo.pend.ninguna")).toBeNull();

    const roles = seccion("conexionEquipo.roles.titulo");
    expect(await within(roles).findByText("conexionEquipo.fallo")).toBeTruthy();
    expect(within(roles).queryByText("conexionEquipo.roles.ninguno")).toBeNull();

    const sync = seccion("conexionEquipo.sync.titulo");
    expect(await within(sync).findByText("conexionEquipo.fallo")).toBeTruthy();
    expect(within(sync).queryByText("conexionEquipo.sync.nada")).toBeNull();

    // Sin la lista de llaves no se concluye «sin conectar».
    const estado = seccion("conexionEquipo.estado.titulo");
    expect(await within(estado).findByText("conexionEquipo.estado.noSe")).toBeTruthy();
    expect(within(estado).queryByText("conexionEquipo.estado.sinConectar")).toBeNull();

    // Reintentar vuelve a pedir.
    const antes = db.consultas.filter((c) => c.tabla === "integracion_equipo_pendientes").length;
    db.tablas.integracion_equipo_pendientes = { data: [], error: null };
    fireEvent.click(within(pend).getByRole("button", { name: /common\.retry/ }));
    expect(await within(pend).findByText("conexionEquipo.pend.ninguna")).toBeTruthy();
    expect(db.consultas.filter((c) => c.tabla === "integracion_equipo_pendientes").length).toBe(antes + 1);
  });

  it("si no se puede saber si es dueño, no lo trata como «no es dueño»", async () => {
    escenario({ keys: [llave()] });
    db.tablas.tenant_owners = { data: null, error: { message: "timeout" } };
    pintar();
    const estado = seccion("conexionEquipo.estado.titulo");
    expect(await within(estado).findByText("conexionEquipo.modo.duenoNoSe")).toBeTruthy();
    expect(within(estado).queryByText("conexionEquipo.modo.soloDueno")).toBeNull();
  });

  it("si no se puede leer el estado, lo dice (no muestra «ensayo» por defecto)", async () => {
    escenario();
    db.tablas.integracion_equipo = { data: null, error: { message: "timeout" } };
    pintar();
    const estado = seccion("conexionEquipo.estado.titulo");
    expect(await within(estado).findByText("conexionEquipo.fallo")).toBeTruthy();
    expect(within(estado).queryByRole("radio")).toBeNull();
  });
});

// ── Roles sin permisos ──────────────────────────────────────────────────────

describe("roles nuevos sin permisos", () => {
  it("cada rol lleva al editor de permisos con ese rol ya abierto", async () => {
    escenario({ roles: [{ nombre: "Closer Senior", creado_at: "2026-11-11T12:00:00Z" }] });
    pintar();
    const roles = seccion("conexionEquipo.roles.titulo");
    expect(await within(roles).findByText("Closer Senior")).toBeTruthy();
    const enlace = within(roles).getByRole("link", { name: /conexionEquipo\.roles\.marcar/ });
    const destino = new URL(enlace.getAttribute("href")!, "https://maven.test");
    expect(destino.pathname).toBe("/settings");
    expect(Object.fromEntries(destino.searchParams)).toEqual({ sub: "usuarios", pestana: "roles", permisos: "Closer Senior" });
  });

  it("sin roles pendientes lo dice en positivo", async () => {
    escenario();
    pintar();
    expect(await within(seccion("conexionEquipo.roles.titulo")).findByText("conexionEquipo.roles.ninguno")).toBeTruthy();
  });
});

// ── Avisos (webhook del equipo: RPC propias) ────────────────────────────────

const SECRETO = "whsec_c2VjcmV0by1kZS1wcnVlYmEtZXF1aXBv";
const AVISO = {
  id: "w1", api_key_id: "k-equipo", url_host: "hooks.example.com",
  eventos: ["equipo.persona_entro", "equipo.persona_salio", "equipo.rol_cambio"], status: "active",
  disabled_reason: null, disabled_at: null, secret_last4: "pozo", consecutive_failures: 0, failing_since: null,
  last_attempt_at: null, last_success_at: null, last_status_code: null, last_error: null, created_by: YO,
  created_at: "2026-11-11T12:00:00Z", pendientes: 0,
};
const rpcDe = (fn: string) => db.rpcLlamadas.filter((l) => l.fn === fn);

describe("avisos a tu plataforma", () => {
  it("registra la dirección con equipo_webhook_crear y muestra el secreto UNA vez", async () => {
    escenario({ keys: [llave()] });
    // Como la base: después de crear, la lista ya lo trae (sin el secreto).
    let creado = false;
    db.rpcs.equipo_webhook_crear = () => { creado = true; return { data: { ...AVISO, secreto: SECRETO }, error: null }; };
    db.rpcs.equipo_webhooks = () => ({ data: creado ? [AVISO] : [], error: null });
    pintar();
    const avisos = seccion("conexionEquipo.avisos.titulo");
    const url = await within(avisos).findByLabelText("conexionEquipo.wh.alta.url");
    fireEvent.change(url, { target: { value: "  https://Hooks.Example.com " } });
    fireEvent.click(within(avisos).getByRole("button", { name: /conexionEquipo\.wh\.alta\.boton/ }));

    expect(await within(avisos).findByText(SECRETO)).toBeTruthy();
    // La URL como new URL(x).href; los tres eventos van como null (la base pone los tres).
    expect(rpcDe("equipo_webhook_crear")[0].args).toEqual({ _api_key_id: "k-equipo", _url: "https://hooks.example.com/", _eventos: null });
    // El secreto no queda en ninguna caché de react-query.
    expect(JSON.stringify(qcActual.getQueryCache().getAll().map((q) => q.state.data))).not.toContain(SECRETO);
    expect(JSON.stringify(qcActual.getMutationCache().getAll().map((m) => m.state.data))).not.toContain(SECRETO);
    // Ya registrado: se ve la tarjeta, no el alta.
    expect(within(avisos).getByText("whsec_…pozo")).toBeTruthy();
    expect(within(avisos).queryByLabelText("conexionEquipo.wh.alta.url")).toBeNull();

    fireEvent.click(within(avisos).getByRole("button", { name: "conexionEquipo.wh.secreto.listo" }));
    expect(within(avisos).queryByText(SECRETO)).toBeNull();
  });

  it("con menos eventos los manda como lista; sin https no deja registrar", async () => {
    escenario({ keys: [llave()] });
    db.rpcs.equipo_webhook_crear = () => ({ data: { ...AVISO, secreto: SECRETO }, error: null });
    pintar();
    const avisos = seccion("conexionEquipo.avisos.titulo");
    const url = await within(avisos).findByLabelText("conexionEquipo.wh.alta.url");
    const registrar = within(avisos).getByRole("button", { name: /conexionEquipo\.wh\.alta\.boton/ });
    fireEvent.change(url, { target: { value: "http://hooks.example.com" } });
    expect(registrar).toBeDisabled();
    expect(within(avisos).getByText("conexionEquipo.wh.alta.urlMala")).toBeTruthy();
    fireEvent.change(url, { target: { value: "https://hooks.example.com/maven" } });
    fireEvent.click(within(avisos).getByRole("checkbox", { name: /equipo\.persona_salio/ }));
    fireEvent.click(registrar);
    await waitFor(() => expect(rpcDe("equipo_webhook_crear")).toHaveLength(1));
    expect(rpcDe("equipo_webhook_crear")[0].args).toMatchObject({ _eventos: ["equipo.persona_entro", "equipo.rol_cambio"] });
  });

  it("un error de la base se dice en una frase", async () => {
    escenario({ keys: [llave()] });
    db.rpcs.equipo_webhook_crear = () => ({ data: null, error: { message: "url_invalida: host prohibido" } });
    pintar();
    const avisos = seccion("conexionEquipo.avisos.titulo");
    fireEvent.change(await within(avisos).findByLabelText("conexionEquipo.wh.alta.url"), { target: { value: "https://10.0.0.1" } });
    fireEvent.click(within(avisos).getByRole("button", { name: /conexionEquipo\.wh\.alta\.boton/ }));
    expect(await within(avisos).findByText("conexionEquipo.err.url_invalida")).toBeTruthy();
  });

  it("pausar y borrar piden confirmación en la página; reanudar va directo", async () => {
    const confirmar = vi.spyOn(window, "confirm");
    escenario({ keys: [llave()], webhooks: [AVISO] });
    pintar();
    const avisos = seccion("conexionEquipo.avisos.titulo");
    fireEvent.click(await within(avisos).findByRole("button", { name: /conexionEquipo\.wh\.pausar/ }));
    expect(within(avisos).getByRole("alertdialog")).toBeTruthy();
    expect(rpcDe("equipo_webhook_cambiar")).toHaveLength(0);
    fireEvent.click(within(avisos).getByRole("button", { name: /conexionEquipo\.wh\.confirmar\.pausar\.si/ }));
    await waitFor(() => expect(rpcDe("equipo_webhook_cambiar")).toHaveLength(1));
    expect(rpcDe("equipo_webhook_cambiar")[0].args).toEqual({ _id: "w1", _accion: "pausar" });

    fireEvent.click(within(avisos).getByRole("button", { name: /conexionEquipo\.wh\.borrar/ }));
    expect(rpcDe("equipo_webhook_cambiar")).toHaveLength(1);
    fireEvent.click(within(avisos).getByRole("button", { name: /conexionEquipo\.wh\.confirmar\.borrar\.si/ }));
    await waitFor(() => expect(rpcDe("equipo_webhook_cambiar")).toHaveLength(2));
    expect(rpcDe("equipo_webhook_cambiar")[1].args).toEqual({ _id: "w1", _accion: "borrar" });
    expect(confirmar).not.toHaveBeenCalled();
    confirmar.mockRestore();
  });

  it("un aviso en pausa se reanuda sin confirmar", async () => {
    escenario({ keys: [llave()], webhooks: [{ ...AVISO, status: "paused" }] });
    pintar();
    const avisos = seccion("conexionEquipo.avisos.titulo");
    fireEvent.click(await within(avisos).findByRole("button", { name: /conexionEquipo\.wh\.reanudar/ }));
    await waitFor(() => expect(rpcDe("equipo_webhook_cambiar")).toHaveLength(1));
    expect(rpcDe("equipo_webhook_cambiar")[0].args).toEqual({ _id: "w1", _accion: "reanudar" });
  });

  it("enviar prueba: una cada 12 s, y abre las entregas", async () => {
    escenario({ keys: [llave()], webhooks: [AVISO] });
    pintar();
    const avisos = seccion("conexionEquipo.avisos.titulo");
    fireEvent.click(await within(avisos).findByRole("button", { name: /conexionEquipo\.wh\.probar/ }));
    await waitFor(() => expect(rpcDe("equipo_webhook_probar")).toHaveLength(1));
    expect(rpcDe("equipo_webhook_probar")[0].args).toEqual({ _id: "w1" });
    // El botón espera: no sale otra prueba enseguida.
    const espera = await within(avisos).findByRole("button", { name: /conexionEquipo\.wh\.probarEspera/ });
    expect(espera).toBeDisabled();
    await waitFor(() => expect(rpcDe("equipo_webhook_entregas").length).toBeGreaterThan(0));
    expect(rpcDe("equipo_webhook_entregas")[0].args).toMatchObject({ _id: "w1" });
  });

  it("si no se puede leer la lista de avisos, no ofrece registrar otro", async () => {
    escenario({ keys: [llave()] });
    db.rpcs.equipo_webhooks = { data: null, error: { message: "sin_permiso: solo el dueño o un admin" } };
    pintar();
    const avisos = seccion("conexionEquipo.avisos.titulo");
    expect(await within(avisos).findByText("conexionEquipo.fallo")).toBeTruthy();
    expect(within(avisos).queryByLabelText("conexionEquipo.wh.alta.url")).toBeNull();
  });

  it("un aviso detenido dice por qué", async () => {
    escenario({ keys: [llave()], webhooks: [{ ...AVISO, status: "disabled", disabled_reason: "receiver_failing", disabled_at: "2026-11-11T12:00:00Z" }] });
    pintar();
    const avisos = seccion("conexionEquipo.avisos.titulo");
    expect(await within(avisos).findByText("conexionEquipo.wh.detenido.receiver_failing")).toBeTruthy();
    expect(within(avisos).getByRole("button", { name: /conexionEquipo\.wh\.probar/ })).toBeDisabled();
  });
});

describe("pendientes: lo que contesta la base", () => {
  it("si la base ya puso equipo y jefe al aprobar, lo dice", async () => {
    escenario({ keys: [llave()], pendientes: [PENDIENTE] });
    db.rpcs.equipo_pendiente_resolver = { data: { id: "p1", estado: "aprobada", user_id: "nuevo-1", equipo: "Turno A", reporta_a: "j1" }, error: null };
    pintar();
    const pend = seccion("conexionEquipo.pend.titulo");
    fireEvent.click(await within(pend).findByRole("button", { name: /conexionEquipo\.pend\.aprobar/ }));
    expect(await within(pend).findByText("conexionEquipo.pend.equipoPuesto")).toBeTruthy();
  });

  it("un error de la base al descartar se dice en una frase", async () => {
    escenario({ keys: [llave()], pendientes: [PENDIENTE] });
    db.rpcs.equipo_pendiente_resolver = { data: null, error: { message: "ya_resuelta: ese pendiente ya está aprobada" } };
    pintar();
    const pend = seccion("conexionEquipo.pend.titulo");
    fireEvent.click(await within(pend).findByRole("button", { name: /conexionEquipo\.pend\.descartar/ }));
    expect(await within(pend).findByText(/conexionEquipo\.pend\.noSeDescarto.*conexionEquipo\.err\.ya_resuelta/)).toBeTruthy();
  });

  it("si marcar la aprobada falla, dice por qué", async () => {
    escenario({ keys: [llave()], pendientes: [PENDIENTE] });
    db.rpcs.equipo_pendiente_resolver = { data: null, error: { message: "cuenta_no_coincide: la cuenta no es de esta agencia" } };
    pintar();
    const pend = seccion("conexionEquipo.pend.titulo");
    fireEvent.click(await within(pend).findByRole("button", { name: /conexionEquipo\.pend\.aprobar/ }));
    expect(await within(pend).findByText(/conexionEquipo\.pend\.creadaSinMarcar.*conexionEquipo\.err\.cuenta_no_coincide/)).toBeTruthy();
  });
});
