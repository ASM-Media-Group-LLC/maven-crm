// Ajustes → API keys: el webhook del Messenger de cada key (PR 5 de webhooks).
//
// Lo que se cuida: quién ve qué botón (registrar/probar/reanudar son solo de la
// persona de la key; pausar/borrar/entregas, de cualquier admin), que el secreto
// aparezca UNA vez y no quede en ningún lado, que "no se pudo consultar" no se
// confunda con "no tiene", que cada código del servidor se lea en palabras, y que
// todo esté en inglés cuando la pantalla está en inglés.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/hooks/useLanguage";
import { esEspanol } from "../i18n/detectarEspanol";
import { SCOPE_CATALOG, SCOPE_GROUPS } from "../../../../supabase/functions/manage-api-keys/api-scopes";

const YO = "3f1c2b7a-9d4e-4a51-8c0f-2e6b7d9a1c35";
const OTRA = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const SECRETO = "whsec_c2VjcmV0by1kZS1wcnVlYmEtbm8tdXNhcg";

type W = Record<string, unknown>;
function webhook(extra: W = {}): W {
  return {
    id: "w-" + (extra.api_key_id ?? "k"), api_key_id: "k", url_host: "hooks.example.com", status: "active",
    disabled_reason: null, disabled_at: null, paused_at: null, paused_by: null, exclude_own: true,
    secret_last4: "9f3a", created_at: "2026-09-20T15:00:00Z", last_attempt_at: "2026-09-26T14:00:00Z",
    last_success_at: "2026-09-26T14:00:00Z", last_status_code: 200, last_error: null,
    last_test_at: "2026-09-20T15:01:00Z", consecutive_failures: 0, failing_since: null, next_attempt_at: null,
    ...extra,
  };
}
function llave(id: string, extra: W = {}): W {
  return {
    id, name: `Key ${id}`, key_prefix: "mvk_live_" + id.padEnd(6, "0"), last_four: "abcd",
    scopes: ["messenger:read"], ip_whitelist: ["1.2.3.4"], created_at: "2026-09-01T00:00:00Z",
    created_by_email: "admin@example.com", last_used_at: null, request_count: 0,
    expires_at: "2026-11-30T00:00:00Z", revoked_at: null, status: "active",
    acts_as: { id: YO, name: "Alvaro Mejia", active: true }, limite_por_hora: 1000, webhook: null,
    ...extra,
  };
}
function lista(keys: W[], extra: W = {}) {
  return {
    keys, scope_catalog: SCOPE_CATALOG, scope_groups: [...SCOPE_GROUPS], max_active_keys: 3,
    you: { id: YO, name: "Alvaro Mejia" }, webhooks_unknown: false, ...extra,
  };
}

const llamadas: Record<string, unknown>[] = [];
let servidor: (body: Record<string, unknown>) => Promise<unknown>;
vi.mock("@/lib/adminInvoke", async () => {
  const real = await vi.importActual<typeof import("@/lib/adminInvoke")>("@/lib/adminInvoke");
  return {
    ...real,
    adminInvoke: (_fn: string, body: Record<string, unknown>) => {
      llamadas.push(body);
      return servidor(body);
    },
  };
});
const avisos = vi.hoisted(() => ({ ok: [] as string[], error: [] as string[] }));
vi.mock("sonner", () => ({
  toast: {
    success: (m: string) => { avisos.ok.push(m); },
    error: (m: string) => { avisos.error.push(m); },
  },
}));

// Las caras (foto / muñequito) se leen de profiles: acá, un muñequito por persona
// y la lista de ids que se pidieron.
const carasPedidas = vi.hoisted(() => [] as string[][]);
vi.mock("@/pages/admin/carasDePersonas", () => ({
  useCaras: (ids: (string | null | undefined)[]) => {
    carasPedidas.push(ids.filter((x): x is string => !!x));
    return new Map([
      ["3f1c2b7a-9d4e-4a51-8c0f-2e6b7d9a1c35", { src: null, seed: "semilla-yo" }],
      ["9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d", { src: null, seed: "semilla-otra" }],
    ]);
  },
}));

import AdminApiKeys from "@/pages/admin/AdminApiKeys";
import { textoDelError, chipDe, estadoEfectivo, queMostrar } from "@/pages/admin/ApiKeyWebhook";

function textosVisibles(raiz: HTMLElement): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.parentElement?.closest("code, pre")) continue;
    const t = (n.textContent ?? "").trim();
    if (t) out.push(t);
  }
  for (const el of Array.from(raiz.querySelectorAll("[title], [placeholder], [aria-label], [data-label]"))) {
    for (const a of ["title", "placeholder", "aria-label", "data-label"]) {
      const v = el.getAttribute(a);
      if (v) out.push(v);
    }
  }
  return out;
}
const enEspanol = (raiz: HTMLElement) => textosVisibles(raiz).filter((t) => esEspanol(t));

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
const fila = (nombre: string) => screen.getByText(nombre).closest("tr")!;
const celdaWebhook = (nombre: string) => fila(nombre).querySelector('td[data-label="Webhook"]') as HTMLElement;

beforeEach(() => {
  localStorage.setItem("app-language", "en");
  llamadas.length = 0;
  avisos.ok.length = 0;
  avisos.error.length = 0;
  carasPedidas.length = 0;
});

// El tsconfig de la app es ES2020: sin Array.prototype.at.
const ultimo = <T,>(xs: T[]): T | undefined => xs[xs.length - 1];

/** El muñequito DiceBear de alguien (UserAvatar con seed → <img alt={nombre}>). */
const munequito = (raiz: HTMLElement, nombre: string) =>
  Array.from(raiz.querySelectorAll("img")).find((i) => i.getAttribute("alt") === nombre && /dicebear|^data:image/.test(i.getAttribute("src") ?? ""));

const abrirCelda = async (nombre: string) => {
  fireEvent.click(within(celdaWebhook(nombre)).getByRole("button"));
  return screen.findByRole("dialog");
};
const cerrarConEsc = async (d: HTMLElement) => {
  fireEvent.keyDown(d, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
};
/** Una promesa que se resuelve a mano: para mirar la pantalla con el pedido en vuelo. */
function diferida<T>() {
  let resolver!: (v: T) => void;
  const promesa = new Promise<T>((r) => { resolver = r; });
  return { promesa, resolver };
}
const llamadasDe = (accion: string) => llamadas.filter((l) => l.action === accion);
const pruebaOk = { delivered: true, status_code: 204, error_code: null, latency_ms: 183, uncertain: false, activated: true, message: "Your server answered 204.", notice: null };
// Un receptor que falló de verdad: el intento es DESPUÉS de que empezó la racha.
const fallando = (id: string) => webhook({ api_key_id: id, consecutive_failures: 4, failing_since: "2026-09-26T08:00:00Z", last_attempt_at: "2026-09-26T14:00:00Z", last_error: "http_503", last_status_code: 503 });

describe("la celda Webhook de la tabla", () => {
  it("cada caso muestra lo suyo (y no se confunde 'no tiene' con 'no se sabe')", async () => {
    servidor = () => Promise.resolve(lista([
      llave("mia"),                                                    // Messenger, mía, sin webhook
      llave("ajena", { acts_as: { id: OTRA, name: "Someone Else", active: true } }),
      llave("otra", { scopes: ["creators:read"], ip_whitelist: [] }),  // sin Messenger
      llave("vieja", { status: "expired" }),                           // vencida, sin webhook
      llave("act", { webhook: webhook({ api_key_id: "act" }) }),
      llave("pend", { webhook: webhook({ api_key_id: "pend", status: "pending" }) }),
      llave("fall", { webhook: fallando("fall") }),
      llave("pau", { webhook: webhook({ api_key_id: "pau", status: "paused" }) }),
      llave("det", { webhook: webhook({ api_key_id: "det", status: "disabled", disabled_reason: "receiver_gone" }) }),
      // Le sacaron Messenger: el webhook detenido se sigue viendo (y se puede borrar).
      llave("sinmsg", { scopes: ["creators:read"], webhook: webhook({ api_key_id: "sinmsg", status: "disabled", disabled_reason: "scope_removed" }) }),
      // Venció con el webhook esperando la prueba: ningún trigger lo detiene, pero ya no sirve.
      llave("venc", { status: "expired", webhook: webhook({ api_key_id: "venc", status: "pending" }) }),
    ]));
    montar();
    await screen.findByText("Key mia");
    expect(within(celdaWebhook("Key mia")).getByRole("button", { name: /Register/ })).toBeTruthy();
    expect(celdaWebhook("Key ajena").textContent).toBe("No webhook");
    expect(celdaWebhook("Key otra").textContent).toBe("—");
    expect(celdaWebhook("Key vieja").textContent).toBe("No webhook");
    expect(celdaWebhook("Key act").textContent).toContain("Active");
    expect(celdaWebhook("Key act").textContent).toContain("hooks.example.com");
    expect(celdaWebhook("Key pend").textContent).toContain("Waiting for the test");
    expect(celdaWebhook("Key fall").textContent).toContain("Active · failing");
    expect(celdaWebhook("Key pau").textContent).toContain("Paused");
    expect(celdaWebhook("Key det").textContent).toContain("Stopped");
    expect(celdaWebhook("Key sinmsg").textContent).toContain("Stopped");
    expect(celdaWebhook("Key venc").textContent).toContain("Stopped");
    expect(enEspanol(document.body)).toEqual([]);
  });

  it("si no se pudo consultar, NINGUNA key ofrece Registrar", async () => {
    servidor = () => Promise.resolve(lista([llave("mia")], { webhooks_unknown: true }));
    montar();
    await screen.findByText("Key mia");
    expect(within(celdaWebhook("Key mia")).queryByRole("button")).toBeNull();
    expect(celdaWebhook("Key mia").textContent).toBe("Couldn't check");
  });

  it("queMostrar: 'no se sabe' ≠ 'no tiene', y un webhook que existe se muestra siempre", () => {
    const k = { id: "k", name: "k", scopes: ["messenger:read"], status: "active" as const, acts_as: { id: YO, name: null, active: true } };
    expect(queMostrar(k, YO, false)).toBe("desconocido");
    expect(queMostrar({ ...k, webhook: null }, YO, false)).toBe("registrar");
    expect(queMostrar({ ...k, webhook: null }, OTRA, false)).toBe("sin");
    expect(queMostrar({ ...k, webhook: null }, undefined, false)).toBe("sin");
    expect(queMostrar({ ...k, webhook: null, status: "revoked" }, YO, false)).toBe("sin");
    expect(queMostrar({ ...k, webhook: null }, YO, true)).toBe("desconocido");
    expect(queMostrar({ ...k, scopes: ["creators:read"] }, YO, true)).toBe("nada");
    expect(queMostrar({ ...k, scopes: ["creators:read"], webhook: webhook() as never }, YO, false)).toBe("webhook");
  });

  it("'Actúa como' muestra la cara de la persona (foto / muñequito / iniciales)", async () => {
    servidor = () => Promise.resolve(lista([
      llave("mia"),
      llave("ajena", { acts_as: { id: OTRA, name: "Someone Else", active: true } }),
    ]));
    montar();
    await screen.findByText("Key mia");
    const actua = (n: string) => fila(n).querySelector('td[data-label="Acts as"]') as HTMLElement;
    expect(munequito(actua("Key mia"), "Alvaro Mejia")).toBeTruthy();
    expect(munequito(actua("Key ajena"), "Someone Else")).toBeTruthy();
    expect(ultimo(carasPedidas)).toEqual(expect.arrayContaining([YO, OTRA]));
  });
});

describe("registrar: el secreto, UNA vez", () => {
  const pendiente = { status: "pending", id: "w-mia", last_attempt_at: null, last_success_at: null, last_status_code: null, last_test_at: null };

  it("manda lo pedido, muestra el secreto, prueba, y el secreto sigue hasta cerrar", async () => {
    let conWebhook: W | null = null;
    servidor = (b) => {
      if (b.action === "list") return Promise.resolve(lista([llave("mia", { webhook: conWebhook })]));
      if (b.action === "webhook_create") {
        conWebhook = webhook({ api_key_id: "mia", ...pendiente });
        return Promise.resolve({ webhook: conWebhook, secret: SECRETO });
      }
      if (b.action === "webhook_test") {
        conWebhook = { ...conWebhook!, status: "active" };
        return Promise.resolve({ webhook: conWebhook, test: pruebaOk });
      }
      return Promise.reject(new Error("unexpected " + String(b.action)));
    };
    montar();
    await screen.findByText("Key mia");
    fireEvent.click(within(celdaWebhook("Key mia")).getByRole("button", { name: /Register/ }));
    const dialogo = await screen.findByRole("dialog");
    expect(enEspanol(dialogo)).toEqual([]);
    const boton = within(dialogo).getByRole("button", { name: "Register webhook" }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    fireEvent.change(within(dialogo).getByLabelText("Your server's URL"), { target: { value: "http://no-https.example.com" } });
    expect(boton.disabled).toBe(true);
    fireEvent.change(within(dialogo).getByLabelText("Your server's URL"), { target: { value: "  https://hooks.example.com/maven  " } });
    fireEvent.click(within(dialogo).getByLabelText(/Don't notify the messages I send/));
    fireEvent.click(boton);

    expect(await within(dialogo).findByText(SECRETO)).toBeTruthy();
    expect(ultimo(llamadasDe("webhook_create"))).toEqual({
      action: "webhook_create", lang: "en", key_id: "mia", url: "https://hooks.example.com/maven", exclude_own: false,
    });
    expect(enEspanol(dialogo)).toEqual([]);
    // Ni en las consultas ni en las mutaciones de react-query queda el secreto.
    const enCache = () => JSON.stringify([
      qc.getQueryCache().getAll().map((q) => q.state.data),
      qc.getMutationCache().getAll().map((m) => m.state.data),
    ]);
    await waitFor(() => expect(enCache()).not.toContain(SECRETO));

    fireEvent.click(within(dialogo).getByRole("button", { name: /Send test/ }));
    expect(await within(dialogo).findByText("Your server answered 204.")).toBeTruthy();
    expect(ultimo(llamadasDe("webhook_test"))).toEqual({ action: "webhook_test", lang: "en", id: "w-mia" });
    expect(within(dialogo).getByText(/Webhook activated: from now on/)).toBeTruthy();
    // Llegó y se activó, pero el secreto se sigue viendo hasta cerrar.
    expect(within(dialogo).getByText(SECRETO)).toBeTruthy();
    expect(avisos.ok).toContain("Webhook activated");
    expect(enEspanol(dialogo)).toEqual([]);
    fireEvent.click(within(dialogo).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.body.textContent).not.toContain(SECRETO);
    expect(enCache()).not.toContain(SECRETO);
    await waitFor(() => expect(celdaWebhook("Key mia").textContent).toContain("Active"));
  });

  it("si la prueba NO llegó, el secreto sigue ahí (el integrador todavía no lo tiene) y se dice por qué", async () => {
    let conWebhook: W | null = null;
    servidor = (b) => {
      if (b.action === "list") return Promise.resolve(lista([llave("mia", { webhook: conWebhook })]));
      if (b.action === "webhook_create") {
        conWebhook = webhook({ api_key_id: "mia", ...pendiente });
        return Promise.resolve({ webhook: conWebhook, secret: SECRETO });
      }
      return Promise.resolve({
        webhook: { ...conWebhook!, last_error: "http_401", last_status_code: 401 },
        test: { delivered: false, status_code: 401, error_code: "http_401", latency_ms: 90, uncertain: false, activated: false,
          message: "Your server answered 401.", notice: "It stays waiting for the test." },
      });
    };
    montar();
    await screen.findByText("Key mia");
    fireEvent.click(within(celdaWebhook("Key mia")).getByRole("button", { name: /Register/ }));
    const d = await screen.findByRole("dialog");
    fireEvent.change(within(d).getByLabelText("Your server's URL"), { target: { value: "https://hooks.example.com/x" } });
    fireEvent.click(within(d).getByRole("button", { name: "Register webhook" }));
    await within(d).findByText(SECRETO);
    fireEvent.click(within(d).getByRole("button", { name: /Send test/ }));
    expect(await within(d).findByText("Your server answered 401.")).toBeTruthy();
    expect(within(d).getByText("Not delivered")).toBeTruthy();
    expect(within(d).queryByText("Delivered")).toBeNull();
    expect(within(d).queryByText(/Webhook activated/)).toBeNull();
    expect(avisos.ok).not.toContain("Webhook activated");
    expect(within(d).getByText("It stays waiting for the test.")).toBeTruthy();
    expect(within(d).queryByText(/It was cut off after sending/)).toBeNull();
    expect(within(d).getByText(SECRETO)).toBeTruthy();
    expect(within(d).getByRole("button", { name: "Later" })).toBeTruthy();
  });

  it("'Después' cierra; al reabrir no está el secreto y se puede probar desde el estado", async () => {
    let conWebhook: W | null = null;
    servidor = (b) => {
      if (b.action === "list") return Promise.resolve(lista([llave("mia", { webhook: conWebhook })]));
      if (b.action === "webhook_create") {
        conWebhook = webhook({ api_key_id: "mia", ...pendiente });
        return Promise.resolve({ webhook: conWebhook, secret: SECRETO });
      }
      return Promise.resolve({ webhook: { ...conWebhook!, status: "active" }, test: pruebaOk });
    };
    montar();
    await screen.findByText("Key mia");
    fireEvent.click(within(celdaWebhook("Key mia")).getByRole("button", { name: /Register/ }));
    let d = await screen.findByRole("dialog");
    fireEvent.change(within(d).getByLabelText("Your server's URL"), { target: { value: "https://hooks.example.com/x" } });
    fireEvent.click(within(d).getByRole("button", { name: "Register webhook" }));
    await within(d).findByText(SECRETO);
    fireEvent.click(within(d).getByRole("button", { name: "Later" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(celdaWebhook("Key mia").textContent).toContain("Waiting for the test"));
    d = await abrirCelda("Key mia");
    expect(within(d).getByText("whsec_…9f3a")).toBeTruthy();
    expect(document.body.textContent).not.toContain(SECRETO);
    expect(within(d).getByText(/It isn't active yet: send a test/)).toBeTruthy();
    expect(within(d).queryByRole("button", { name: /Pause/ })).toBeNull();
    expect(within(d).queryByRole("button", { name: /Resume/ })).toBeNull();
    fireEvent.click(within(d).getByRole("button", { name: /Send test/ }));
    await waitFor(() => expect(ultimo(llamadasDe("webhook_test"))).toEqual({ action: "webhook_test", lang: "en", id: "w-mia" }));
    expect(await within(d).findByText("Your server answered 204.")).toBeTruthy();
  });

  it("si la relectura todavía no trae el webhook nuevo, el secreto no se pierde", async () => {
    let n = 0;
    servidor = (b) => {
      if (b.action === "list") {
        n++;
        // Primero la lista de siempre; después del alta, una que falla en los webhooks.
        return Promise.resolve(lista([llave("mia", { webhook: null })], n > 2 ? { webhooks_unknown: true } : {}));
      }
      return Promise.resolve({ webhook: webhook({ api_key_id: "mia", ...pendiente }), secret: SECRETO });
    };
    montar();
    await screen.findByText("Key mia");
    fireEvent.click(within(celdaWebhook("Key mia")).getByRole("button", { name: /Register/ }));
    const d = await screen.findByRole("dialog");
    fireEvent.change(within(d).getByLabelText("Your server's URL"), { target: { value: "https://hooks.example.com/x" } });
    fireEvent.click(within(d).getByRole("button", { name: "Register webhook" }));
    await within(d).findByText(SECRETO);
    await waitFor(() => expect(n).toBeGreaterThan(2));
    expect(within(d).getByText(SECRETO)).toBeTruthy();
    expect(within(d).queryByLabelText("Your server's URL")).toBeNull();
  });

  it("mientras se registra no se puede cerrar: el secreto cae en ESTE diálogo y nunca en el de otra key", async () => {
    const alta = diferida<unknown>();
    let conWebhook: W | null = null;
    servidor = (b) => {
      if (b.action === "list") return Promise.resolve(lista([
        llave("mia", { webhook: conWebhook }),
        llave("otra", { acts_as: { id: OTRA, name: "Someone Else", active: true }, webhook: webhook({ api_key_id: "otra" }) }),
      ]));
      if (b.action === "webhook_create") return alta.promesa;
      return Promise.reject(new Error("unexpected"));
    };
    montar();
    await screen.findByText("Key mia");
    fireEvent.click(within(celdaWebhook("Key mia")).getByRole("button", { name: /Register/ }));
    let d = await screen.findByRole("dialog");
    fireEvent.change(within(d).getByLabelText("Your server's URL"), { target: { value: "https://hooks.example.com/x" } });
    fireEvent.click(within(d).getByRole("button", { name: "Register webhook" }));
    await waitFor(() => expect(llamadasDe("webhook_create").length).toBe(1));
    expect((within(d).getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(d, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBe(d);
    conWebhook = webhook({ api_key_id: "mia", ...pendiente });
    alta.resolver({ webhook: conWebhook, secret: SECRETO });
    expect(await within(d).findByText(SECRETO)).toBeTruthy();
    fireEvent.click(within(d).getByRole("button", { name: "Later" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    d = await abrirCelda("Key otra");
    expect(within(d).getByText("whsec_…9f3a")).toBeTruthy();
    expect(document.body.textContent).not.toContain(SECRETO);
    expect(within(d).queryByText("Webhook registered")).toBeNull();
  });

  it("un error del servidor se muestra tal cual y la lista se relee", async () => {
    servidor = (b) => b.action === "list"
      ? Promise.resolve(lista([llave("mia")]))
      : Promise.reject(new Error("That URL points to a private address."));
    montar();
    await screen.findByText("Key mia");
    fireEvent.click(within(celdaWebhook("Key mia")).getByRole("button", { name: /Register/ }));
    const d = await screen.findByRole("dialog");
    await waitFor(() => expect(llamadasDe("list").length).toBe(2)); // al abrir se relee
    fireEvent.change(within(d).getByLabelText("Your server's URL"), { target: { value: "https://10.0.0.1/x" } });
    fireEvent.click(within(d).getByRole("button", { name: "Register webhook" }));
    await waitFor(() => expect(avisos.error).toEqual(["That URL points to a private address."]));
    await waitFor(() => expect(llamadasDe("list").length).toBe(3));
    expect(within(d).getByLabelText("Your server's URL")).toBeTruthy();
  });

  it("cancelar y volver a abrir deja el formulario como nuevo", async () => {
    servidor = () => Promise.resolve(lista([llave("mia")]));
    montar();
    await screen.findByText("Key mia");
    fireEvent.click(within(celdaWebhook("Key mia")).getByRole("button", { name: /Register/ }));
    let d = await screen.findByRole("dialog");
    fireEvent.change(within(d).getByLabelText("Your server's URL"), { target: { value: "https://hooks.example.com/x" } });
    fireEvent.click(within(d).getByLabelText(/Don't notify the messages I send/));
    fireEvent.click(within(d).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(within(celdaWebhook("Key mia")).getByRole("button", { name: /Register/ }));
    d = await screen.findByRole("dialog");
    expect((within(d).getByLabelText("Your server's URL") as HTMLInputElement).value).toBe("");
    expect((within(d).getByLabelText(/Don't notify the messages I send/) as HTMLInputElement).checked).toBe(true);
  });
});

describe("estado: quién puede qué", () => {
  it("la dueña, activo: probar y pausar; nada de reanudar", async () => {
    servidor = () => Promise.resolve(lista([llave("act", { webhook: webhook({ api_key_id: "act" }) })]));
    montar();
    await screen.findByText("Key act");
    const d = await abrirCelda("Key act");
    expect(within(d).getByRole("button", { name: /Send test/ })).toBeTruthy();
    expect(within(d).getByRole("button", { name: /Pause/ })).toBeTruthy();
    expect(within(d).queryByRole("button", { name: /Resume/ })).toBeNull();
    expect(within(d).getByText("hooks.example.com")).toBeTruthy();
    expect(within(d).getByText("whsec_…9f3a")).toBeTruthy();
    expect(within(d).getByText("Not notified")).toBeTruthy();
    expect(within(d).getByText(/Maven checks every 15 seconds/)).toBeTruthy();
    expect(enEspanol(d)).toEqual([]);
  });

  it("otra admin: pausar sí (y el diálogo muestra el pausado); probar y reanudar no", async () => {
    let estado: W = webhook({ api_key_id: "act", exclude_own: false });
    servidor = (b) => {
      if (b.action === "list") return Promise.resolve(lista([llave("act", { acts_as: { id: OTRA, name: "Someone Else", active: true }, webhook: estado })]));
      estado = { ...estado, status: "paused", paused_at: "2026-09-26T14:05:00Z", paused_by: { id: YO, name: "Alvaro Mejia" } };
      return Promise.resolve({ webhook: estado });
    };
    montar();
    await screen.findByText("Key act");
    const d = await abrirCelda("Key act");
    expect(within(d).queryByRole("button", { name: /Send test/ })).toBeNull();
    expect(within(d).getByText(/Only this person can register, test or resume it/)).toBeTruthy();
    expect(munequito(d, "Someone Else")).toBeTruthy();
    expect(within(d).getByText("Notified")).toBeTruthy();
    fireEvent.click(within(d).getByRole("button", { name: /Pause/ }));
    await waitFor(() => expect(ultimo(llamadasDe("webhook_pause"))).toEqual({ action: "webhook_pause", lang: "en", id: "w-act" }));
    await waitFor(() => expect(within(d).queryByRole("button", { name: /Pause/ })).toBeNull());
    expect(within(d).getByText(/Paused: no notification goes out/)).toBeTruthy();
    expect(within(d).queryByRole("button", { name: /Resume/ })).toBeNull();
    expect(enEspanol(d)).toEqual([]);
  });

  it("pausado: la dueña reanuda (manda webhook_resume); otra admin no", async () => {
    servidor = (b) => b.action === "list" ? Promise.resolve(lista([
      llave("mia", { webhook: webhook({ api_key_id: "mia", status: "paused", paused_at: "2026-09-26T10:00:00Z", paused_by: { id: OTRA, name: "Someone Else" } }) }),
      llave("ajena", { acts_as: { id: OTRA, name: "Someone Else", active: true }, webhook: webhook({ api_key_id: "ajena", status: "paused" }) }),
    ])) : Promise.resolve({ webhook: webhook({ api_key_id: "mia" }), test: pruebaOk });
    montar();
    await screen.findByText("Key mia");
    let d = await abrirCelda("Key mia");
    expect(within(d).queryByRole("button", { name: /Pause/ })).toBeNull();
    expect(within(d).getByText(/^paused it on /)).toBeTruthy();
    expect(within(d).getByText(/That's you, the key's person/)).toBeTruthy();
    expect(munequito(d, "Alvaro Mejia")).toBeTruthy();
    expect(munequito(d, "Someone Else")).toBeTruthy();
    expect(ultimo(carasPedidas)).toEqual(expect.arrayContaining([YO, OTRA]));
    fireEvent.click(within(d).getByRole("button", { name: /Resume/ }));
    await waitFor(() => expect(ultimo(llamadasDe("webhook_resume"))).toEqual({ action: "webhook_resume", lang: "en", id: "w-mia" }));
    expect(llamadasDe("webhook_test")).toEqual([]);
    await within(d).findByText("Your server answered 204.");
    await cerrarConEsc(d);
    d = await abrirCelda("Key ajena");
    expect(within(d).queryByRole("button", { name: /Resume/ })).toBeNull();
  });

  it.each([
    ["receiver_failing", {}, /It failed for 3 days in a row/, true],
    ["receiver_gone", {}, /Your server answered 410/, true],
    ["config_error", {}, /no longer allowed/, true],
    // La persona volvió (la restauraron): el servidor deja reanudar.
    ["person_inactive", {}, /If they're reactivated, it can be resumed/, true],
    ["key_revoked", { status: "revoked" }, /The key was revoked/, false],
    ["key_expired", { status: "expired" }, /The key expired/, false],
    ["scope_removed", { scopes: ["creators:read"] }, /no longer has the Messenger permission/, false],
    // Se detuvo por el receptor y DESPUÉS venció la key: manda el vencimiento.
    ["receiver_failing", { status: "expired" }, /The key expired/, false],
    // La persona sigue fuera: no se ofrece (el servidor lo rechazaría).
    ["person_inactive", { acts_as: { id: YO, name: "Alvaro Mejia", active: false } }, /offboarded/, false],
  ])("detenido por %s (%j): se explica y Reanudar = %s", async (motivo, extra, texto, reanuda) => {
    servidor = () => Promise.resolve(lista([
      llave("a", { ...extra, webhook: webhook({ api_key_id: "a", status: "disabled", disabled_reason: motivo, disabled_at: "2026-09-25T00:00:00Z" }) }),
    ]));
    montar();
    await screen.findByText("Key a");
    const d = await abrirCelda("Key a");
    expect(within(d).getAllByText(texto as RegExp).length).toBeGreaterThan(0);
    expect(!!within(d).queryByRole("button", { name: /Resume/ })).toBe(reanuda);
    expect(within(d).queryByRole("button", { name: /Pause/ })).toBeNull();
    expect(within(d).queryByRole("button", { name: /Send test/ })).toBeNull();
    expect(within(d).getByRole("button", { name: /Delete/ })).toBeTruthy();
    expect(enEspanol(d)).toEqual([]);
  });

  it("con la key vencida, un webhook que sigue 'esperando la prueba' o 'pausado' se muestra detenido y sin acciones", async () => {
    servidor = () => Promise.resolve(lista([
      llave("p", { status: "expired", webhook: webhook({ api_key_id: "p", status: "pending" }) }),
      llave("q", { status: "expired", webhook: webhook({ api_key_id: "q", status: "paused" }) }),
    ]));
    montar();
    await screen.findByText("Key p");
    for (const n of ["Key p", "Key q"]) {
      const d = await abrirCelda(n);
      expect(within(d).getByText(/The key expired/)).toBeTruthy();
      expect(within(d).getByText("Stopped")).toBeTruthy();
      expect(within(d).queryByRole("button", { name: /Send test|Resume|Pause/ })).toBeNull();
      await cerrarConEsc(d);
    }
  });

  it("borrar pide confirmación, manda UNA vez aunque se toque dos veces, y cierra", async () => {
    let tiene = true;
    const borrado = diferida<unknown>();
    servidor = (b) => {
      if (b.action === "list") return Promise.resolve(lista([llave("act", { webhook: tiene ? webhook({ api_key_id: "act" }) : null })]));
      tiene = false;
      return borrado.promesa;
    };
    montar();
    await screen.findByText("Key act");
    const d = await abrirCelda("Key act");
    fireEvent.click(within(d).getByRole("button", { name: /Delete/ }));
    const confirma = await screen.findByRole("alertdialog");
    expect(llamadasDe("webhook_delete")).toEqual([]);
    expect(within(confirma).getByText(/Maven stops notifying hooks.example.com/)).toBeTruthy();
    expect(enEspanol(confirma)).toEqual([]);
    const si = within(confirma).getByRole("button", { name: "Delete" });
    fireEvent.click(si);
    fireEvent.click(si);
    // aria-disabled (no disabled): el foco no se cae a <body> mientras borra.
    await waitFor(() => expect(within(confirma).getByRole("button", { name: /Delete/ }).getAttribute("aria-disabled")).toBe("true"));
    expect(within(confirma).getByRole("status").textContent).toBe("Working…");
    borrado.resolver({ success: true, id: "w-act" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(llamadasDe("webhook_delete")).toEqual([{ action: "webhook_delete", lang: "en", id: "w-act" }]);
    expect(avisos.error).toEqual([]);
    await waitFor(() => expect(within(celdaWebhook("Key act")).getByRole("button", { name: /Register/ })).toBeTruthy());
  });

  it("un fallo del receptor se lee en palabras; uno que está saliendo NO es un fallo", async () => {
    servidor = () => Promise.resolve(lista([
      llave("fall", { webhook: fallando("fall") }),
      // El adelanto del despachador: consecutive_failures 1 y failing_since ahora, pero
      // el último intento (el que llegó) es de antes: se está mandando, no falló.
      llave("sale", { webhook: webhook({ api_key_id: "sale", consecutive_failures: 1, failing_since: "2026-09-26T14:10:00Z", last_attempt_at: "2026-09-26T14:00:00Z", last_error: "http_503", next_attempt_at: "2999-01-01T00:00:00Z" }) }),
    ]));
    montar();
    await screen.findByText("Key fall");
    expect(celdaWebhook("Key sale").textContent).not.toContain("failing");
    let d = await abrirCelda("Key fall");
    expect(within(d).getByText("The server answered 503")).toBeTruthy();
    expect(within(d).getByText(/The integrator's server is failing/)).toBeTruthy();
    expect(within(d).getByText(/^4, since /)).toBeTruthy();
    await cerrarConEsc(d);
    d = await abrirCelda("Key sale");
    expect(within(d).getByText(/Maven checks every 15 seconds/)).toBeTruthy();
    expect(within(d).queryByText("Failures in a row")).toBeNull();
    expect(within(d).queryByText("Next attempt")).toBeNull();
  });

  it("una falla de Maven (maven_*) se ve como demora de Maven, aparte del intento, y solo en activo", async () => {
    servidor = () => Promise.resolve(lista([
      llave("dem", { webhook: webhook({ api_key_id: "dem", last_error: "maven_base", next_attempt_at: "2999-01-01T00:00:00Z" }) }),
      llave("pau", { webhook: webhook({ api_key_id: "pau", status: "paused", last_error: "maven_base" }) }),
    ]));
    montar();
    await screen.findByText("Key dem");
    expect(celdaWebhook("Key dem").textContent).toContain("Active · delayed");
    let d = await abrirCelda("Key dem");
    expect(within(d).getByText(/delayed by a Maven-side failure/)).toBeTruthy();
    expect(within(d).getByText("Maven delay")).toBeTruthy();
    expect(within(d).getByText("A Maven-side failure, not the integrator's")).toBeTruthy();
    expect(within(d).getByText("Next attempt")).toBeTruthy();
    expect(enEspanol(d)).toEqual([]);
    await cerrarConEsc(d);
    d = await abrirCelda("Key pau");
    expect(within(d).queryByText(/Maven-side failure/)).toBeNull();
  });

  it("si una relectura no pudo consultar los webhooks, el diálogo sigue mostrando lo último (nunca el alta)", async () => {
    for (const dueña of [true, false]) {
      let n = 0;
      const acts = dueña ? undefined : { acts_as: { id: OTRA, name: "Someone Else", active: true } };
      servidor = (b) => {
        if (b.action === "list") {
          n++;
          return Promise.resolve(n <= 2
            ? lista([llave("act", { ...acts, webhook: webhook({ api_key_id: "act" }) })])
            : lista([llave("act", { ...acts, webhook: null })], { webhooks_unknown: true }));
        }
        return Promise.resolve({ webhook: null });
      };
      const { unmount } = montar();
      await screen.findByText("Key act");
      const d = await abrirCelda("Key act");
      fireEvent.click(within(d).getByRole("button", { name: /Pause/ }));
      await waitFor(() => expect(n).toBeGreaterThan(2));
      await within(d).findByText(/Couldn't refresh the status/);
      expect(within(d).queryByLabelText("Your server's URL")).toBeNull();
      expect(within(d).queryByText(/Register a webhook/)).toBeNull();
      expect(within(d).getByRole("button", { name: /Delete/ })).toBeTruthy();
      expect(within(d).getByText("hooks.example.com")).toBeTruthy();
      unmount();
      llamadas.length = 0;
    }
  });

  it("el resultado de una prueba no pasa a otra key", async () => {
    servidor = (b) => b.action === "list" ? Promise.resolve(lista([
      llave("a", { webhook: webhook({ api_key_id: "a" }) }),
      llave("b", { webhook: webhook({ api_key_id: "b" }) }),
    ])) : Promise.resolve({ webhook: webhook({ api_key_id: "a" }), test: pruebaOk });
    montar();
    await screen.findByText("Key a");
    let d = await abrirCelda("Key a");
    fireEvent.click(within(d).getByRole("button", { name: /Send test/ }));
    await within(d).findByText("Your server answered 204.");
    await cerrarConEsc(d);
    d = await abrirCelda("Key b");
    expect(within(d).queryByText("Your server answered 204.")).toBeNull();
    expect(within(d).queryByText(/Webhook activated/)).toBeNull();
  });

  it("un rechazo del servidor relee la lista (el estado cambió o no se sabe)", async () => {
    servidor = (b) => b.action === "list"
      ? Promise.resolve(lista([llave("act", { webhook: webhook({ api_key_id: "act" }) })]))
      : Promise.reject(new Error("Only an active webhook can be paused."));
    montar();
    await screen.findByText("Key act");
    const d = await abrirCelda("Key act");
    await waitFor(() => expect(llamadasDe("list").length).toBe(2));
    fireEvent.click(within(d).getByRole("button", { name: /Pause/ }));
    await waitFor(() => expect(avisos.error).toEqual(["Only an active webhook can be paused."]));
    await waitFor(() => expect(llamadasDe("list").length).toBe(3));
  });

  it("en español, las acciones le piden al servidor que conteste en español", async () => {
    localStorage.setItem("app-language", "es");
    servidor = (b) => b.action === "list"
      ? Promise.resolve(lista([llave("act", { webhook: webhook({ api_key_id: "act" }) })]))
      : Promise.resolve({ webhook: webhook({ api_key_id: "act", status: "paused" }) });
    montar();
    await screen.findByText("Key act");
    const d = await abrirCelda("Key act");
    fireEvent.click(within(d).getByRole("button", { name: /Pausar/ }));
    await waitFor(() => expect(ultimo(llamadasDe("webhook_pause"))).toMatchObject({ lang: "es" }));
  });
});

describe("entregas", () => {
  it("se piden al abrir la pestaña, con el filtro, y cada estado se lee", async () => {
    servidor = (b) => {
      if (b.action === "list") return Promise.resolve(lista([llave("act", { webhook: webhook({ api_key_id: "act" }) })]));
      const base = { attempts: 1, last_attempt_at: "2026-09-26T14:00:00Z", latency_ms: 120, uncertain: false, created_at: "2026-09-26T14:00:00Z", delivered_at: null, last_status_code: null, last_error: null, drop_reason: null };
      return Promise.resolve({
        webhook: webhook({ api_key_id: "act", next_attempt_at: "2999-01-01T00:00:00Z" }),
        deliveries: [
          { ...base, id: "e1", event_type: "messages.created", message_count: 3, state: "delivered", last_status_code: 200, delivered_at: "2026-09-26T14:00:00Z" },
          { ...base, id: "e2", event_type: "messages.created", message_count: 1, state: "pending", attempts: 2, last_error: "plazo" },
          { ...base, id: "e3", event_type: "webhook.test", message_count: null, state: "dropped", drop_reason: "test_failed", last_error: "tls" },
          { ...base, id: "e4", event_type: "messages.created", message_count: 5, state: "dropped", drop_reason: "algo_nuevo", uncertain: true, last_error: "cortado" },
          { ...base, id: "e5", event_type: "webhook.test", message_count: null, state: "dropped", drop_reason: "test_failed", uncertain: true, last_error: "plazo" },
        ],
      });
    };
    montar();
    await screen.findByText("Key act");
    const d = await abrirCelda("Key act");
    expect(llamadasDe("webhook_deliveries")).toEqual([]);
    const pestana = within(d).getByRole("tab", { name: "Deliveries" });
    fireEvent.mouseDown(pestana);
    fireEvent.click(pestana);
    expect(await within(d).findByText("Delivered · 200")).toBeTruthy();
    expect(ultimo(llamadasDe("webhook_deliveries"))).toEqual({ action: "webhook_deliveries", lang: "en", id: "w-act", only_failed: false });
    expect(within(d).getByText("Notification · 3 messages")).toBeTruthy();
    expect(within(d).getByText("Notification · 1 message")).toBeTruthy();
    expect(within(d).getByText("Notification · 5 messages")).toBeTruthy();
    expect(within(d).getAllByText("Test").length).toBe(2);
    expect(within(d).getByText(/^Retrying /)).toBeTruthy();
    expect(within(d).getAllByText("Didn't answer in time").length).toBe(2);
    expect(within(d).getByText("Dropped: the test wasn't delivered")).toBeTruthy();
    expect(within(d).getByText("Invalid HTTPS certificate")).toBeTruthy();
    expect(within(d).getByText("Dropped: another reason")).toBeTruthy();
    // La cortada ya dice "puede haber llegado": no se repite. La incierta por plazo sí lo dice,
    // y su descarte no es "no llegó" sino "no se confirmó".
    expect(within(d).getByText("Cut off after sending (it may have arrived)")).toBeTruthy();
    expect(within(d).getAllByText(/It was cut off after sending/).length).toBe(1);
    expect(within(d).getByText("Dropped: the test wasn't confirmed")).toBeTruthy();
    expect(enEspanol(d)).toEqual([]);
    fireEvent.click(within(d).getByLabelText("Only the ones not delivered"));
    await waitFor(() => expect(ultimo(llamadasDe("webhook_deliveries"))).toMatchObject({ only_failed: true }));
  });

  it("la que sale por primera vez es 'pendiente', no 'reintenta'", async () => {
    servidor = (b) => b.action === "list"
      ? Promise.resolve(lista([llave("act", { webhook: webhook({ api_key_id: "act" }) })]))
      : Promise.resolve({
        webhook: webhook({ api_key_id: "act", next_attempt_at: "2999-01-01T00:00:00Z" }),
        deliveries: [{ id: "e", event_type: "messages.created", message_count: 2, state: "pending", drop_reason: null, attempts: 1, last_attempt_at: "2026-09-26T14:00:00Z", last_status_code: null, last_error: null, latency_ms: null, uncertain: false, created_at: "2026-09-26T14:00:00Z", delivered_at: null }],
      });
    montar();
    await screen.findByText("Key act");
    const d = await abrirCelda("Key act");
    const pestana = within(d).getByRole("tab", { name: "Deliveries" });
    fireEvent.mouseDown(pestana);
    expect(await within(d).findByText("Pending")).toBeTruthy();
    expect(within(d).queryByText(/^Retrying /)).toBeNull();
  });

  it("si no se pudieron leer, lo dice (no 'todavía no hay')", async () => {
    servidor = (b) => b.action === "list"
      ? Promise.resolve(lista([llave("act", { webhook: webhook({ api_key_id: "act" }) })]))
      : Promise.reject(new Error("Couldn't read the deliveries right now."));
    montar();
    await screen.findByText("Key act");
    const d = await abrirCelda("Key act");
    const pestana = within(d).getByRole("tab", { name: "Deliveries" });
    fireEvent.mouseDown(pestana);
    expect(await within(d).findByText("Couldn't read the deliveries right now.")).toBeTruthy();
    expect(within(d).queryByText("No deliveries yet.")).toBeNull();
  });
});

describe("la referencia del API", () => {
  it("tiene la sección Webhooks, entera en inglés, con el respaldo obligatorio", async () => {
    servidor = () => Promise.resolve(lista([llave("mia")]));
    montar();
    await screen.findByText("Key mia");
    fireEvent.click(screen.getAllByRole("button", { name: /API reference/ })[0]);
    const d = await screen.findByRole("dialog");
    expect(within(d).getByText("Webhooks (Messenger)")).toBeTruthy();
    expect(within(d).getByText(/\*?Required:?/)).toBeTruthy();
    expect(within(d).getAllByText(/every 15 minutes or less/).length).toBe(2); // la sección y la ficha del feed
    expect(within(d).getByText(/Maven has no fixed outgoing IPs/)).toBeTruthy();
    expect(within(d).getByText(/a test can arrive at the same time/)).toBeTruthy();
    const ejemplos = Array.from(d.querySelectorAll("pre")).map((p) => p.textContent ?? "");
    expect(ejemplos.some((e) => e.includes('"type": "messages.created"') && e.includes("webhook-signature: v1,"))).toBe(true);
    expect(enEspanol(d)).toEqual([]);
  });

  it("en español, revocar avisa que también se detiene el webhook", async () => {
    localStorage.setItem("app-language", "es");
    servidor = () => Promise.resolve(lista([llave("mia")]));
    montar();
    await screen.findByText("Key mia");
    fireEvent.click(within(fila("Key mia")).getByTitle("Revocar"));
    const confirma = await screen.findByRole("alertdialog");
    expect(within(confirma).getByText(/Si tiene un webhook, también se detiene/)).toBeTruthy();
  });
});

describe("los códigos y los estados", () => {
  const t = ((k: string, p?: Record<string, string | number>) => (p ? `${k} ${JSON.stringify(p)}` : k)) as never;
  const k = { id: "k", name: "k", scopes: ["messenger:read"], status: "active" as const, acts_as: { id: YO, name: null, active: true } };
  const ef = (extra: W = {}, llaveExtra: Record<string, unknown> = {}) => estadoEfectivo(webhook(extra) as never, { ...k, ...llaveExtra } as never);

  it("textoDelError: http_<n>, las clases conocidas, maven_* y uno desconocido", () => {
    expect(textoDelError(null, t)).toBeNull();
    expect(textoDelError("http_503", t)).toBe('apiKeys.webhook.err.http {"code":"503"}');
    expect(textoDelError("dns", t)).toBe("apiKeys.webhook.err.dns");
    expect(textoDelError("maven_secreto", t)).toBe("apiKeys.webhook.err.maven_secreto");
    expect(textoDelError("maven_base", t)).toBe("apiKeys.webhook.err.maven");
    expect(textoDelError("maven_plazo", t)).toBe("apiKeys.webhook.err.maven");
    expect(textoDelError("algo_raro", t)).toBe("algo_raro");
  });

  it("el chip: texto y color de cada estado", () => {
    expect(chipDe(ef())).toEqual({ texto: "apiKeys.webhook.state.active", variant: "success-soft" });
    expect(chipDe(ef({ status: "pending" }))).toEqual({ texto: "apiKeys.webhook.state.pending", variant: "warning-soft" });
    expect(chipDe(ef({ status: "paused" }))).toEqual({ texto: "apiKeys.webhook.state.paused", variant: "secondary" });
    expect(chipDe(ef({ status: "disabled" }))).toEqual({ texto: "apiKeys.webhook.state.disabled", variant: "destructive-soft" });
    expect(chipDe(ef({ consecutive_failures: 2, failing_since: "2026-09-26T08:00:00Z", last_error: "http_500" })))
      .toEqual({ texto: "apiKeys.webhook.state.failing", variant: "warning-soft" });
    expect(chipDe(ef({ last_error: "maven_base" }))).toEqual({ texto: "apiKeys.webhook.state.delayed", variant: "warning-soft" });
    // Con racha del receptor, manda "fallando" aunque el último error sea de Maven.
    expect(chipDe(ef({ consecutive_failures: 2, failing_since: "2026-09-26T08:00:00Z", last_error: "maven_base" })).texto).toBe("apiKeys.webhook.state.failing");
  });

  it("estadoEfectivo: la key manda sobre la fila, y 'fallando' pide un intento fallido de verdad", () => {
    expect(ef({ status: "pending" }, { status: "expired" })).toMatchObject({ estado: "disabled", motivo: "key_expired", porLaKey: true });
    expect(ef({}, { status: "revoked" })).toMatchObject({ estado: "disabled", motivo: "key_revoked" });
    expect(ef({ status: "paused" }, { scopes: ["creators:read"] })).toMatchObject({ estado: "disabled", motivo: "scope_removed" });
    expect(ef({}, { acts_as: { id: YO, name: null, active: false } })).toMatchObject({ estado: "disabled", motivo: "person_inactive" });
    // active === null (no se pudo verificar) no es "fuera".
    expect(ef({}, { acts_as: { id: YO, name: null, active: null } })).toMatchObject({ estado: "active", porLaKey: false });
    expect(ef({ status: "disabled", disabled_reason: "receiver_gone" })).toMatchObject({ motivo: "receiver_gone", porLaKey: false });
    // El adelanto: fallos > 0 pero el último intento es anterior a la racha.
    expect(ef({ consecutive_failures: 1, failing_since: "2026-09-26T14:10:00Z", last_attempt_at: "2026-09-26T14:00:00Z" }).fallando).toBe(false);
    expect(ef({ consecutive_failures: 1, failing_since: "2026-09-26T14:10:00Z", last_attempt_at: "2026-09-26T14:10:05Z", last_error: "conexion" }).fallando).toBe(true);
    // Una falla de Maven pisa last_error sin cortar la racha del receptor: las dos cosas.
    expect(ef({ consecutive_failures: 3, failing_since: "2026-09-26T08:00:00Z", last_error: "maven_base" })).toMatchObject({ fallando: true, demorado: true });
    // Tras reanudar queda un last_error viejo con la racha nueva del adelanto: no es fallo.
    expect(ef({ consecutive_failures: 1, failing_since: "2026-09-26T14:10:00Z", last_attempt_at: "2026-09-26T14:00:00Z", last_error: "http_503" }).fallando).toBe(false);
    expect(ef({ status: "paused", consecutive_failures: 3, failing_since: "2026-09-26T08:00:00Z", last_error: "http_500" }).fallando).toBe(false);
  });
});

describe("segunda revisión: carreras, foco y lo que no tenía test", () => {
  it("probar y después pausar: el segundo botón responde y el resultado viejo se va", async () => {
    let estado: W = webhook({ api_key_id: "act" });
    servidor = (b) => {
      if (b.action === "list") return Promise.resolve(lista([llave("act", { webhook: estado })]));
      if (b.action === "webhook_test") return Promise.resolve({ webhook: estado, test: { ...pruebaOk, activated: false } });
      estado = { ...estado, status: "paused", paused_at: "2026-09-26T14:05:00Z", paused_by: { id: YO, name: "Alvaro Mejia" } };
      return Promise.resolve({ webhook: estado });
    };
    montar();
    await screen.findByText("Key act");
    const d = await abrirCelda("Key act");
    fireEvent.click(within(d).getByRole("button", { name: /Send test/ }));
    await within(d).findByText("Your server answered 204.");
    await waitFor(() => expect(within(d).getByRole("button", { name: /Pause/ }).getAttribute("aria-disabled")).toBe("false"));
    fireEvent.click(within(d).getByRole("button", { name: /Pause/ }));
    await waitFor(() => expect(llamadasDe("webhook_pause").length).toBe(1));
    await waitFor(() => expect(within(d).queryByText("Your server answered 204.")).toBeNull());
  });

  it("pausar y después reanudar en el mismo diálogo", async () => {
    let estado: W = webhook({ api_key_id: "act" });
    servidor = (b) => {
      if (b.action === "list") return Promise.resolve(lista([llave("act", { webhook: estado })]));
      if (b.action === "webhook_pause") {
        estado = { ...estado, status: "paused", paused_at: "2026-09-26T14:05:00Z", paused_by: { id: YO, name: "Alvaro Mejia" } };
        return Promise.resolve({ webhook: estado });
      }
      estado = { ...estado, status: "active" };
      return Promise.resolve({ webhook: estado, test: pruebaOk });
    };
    montar();
    await screen.findByText("Key act");
    const d = await abrirCelda("Key act");
    fireEvent.click(within(d).getByRole("button", { name: /Pause/ }));
    const reanudar = await within(d).findByRole("button", { name: /Resume/ });
    await waitFor(() => expect(reanudar.getAttribute("aria-disabled")).toBe("false"));
    fireEvent.click(within(d).getByRole("button", { name: /Resume/ }));
    await waitFor(() => expect(llamadasDe("webhook_resume").length).toBe(1));
  });

  it("un borrado que falla se puede reintentar", async () => {
    let n = 0;
    servidor = (b) => {
      if (b.action === "list") return Promise.resolve(lista([llave("act", { webhook: webhook({ api_key_id: "act" }) })]));
      n++;
      return n === 1 ? Promise.reject(new Error("Try again.")) : Promise.resolve({ success: true });
    };
    montar();
    await screen.findByText("Key act");
    const d = await abrirCelda("Key act");
    fireEvent.click(within(d).getByRole("button", { name: /Delete/ }));
    let c = await screen.findByRole("alertdialog");
    fireEvent.click(within(c).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await waitFor(() => expect((within(d).getByRole("button", { name: /Delete/ }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(within(d).getByRole("button", { name: /Delete/ }));
    c = await screen.findByRole("alertdialog");
    fireEvent.click(within(c).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(llamadasDe("webhook_delete").length).toBe(2));
  });

  it("si la relectura falla tras pausar, se ve lo que contestó el servidor (y la tabla sigue)", async () => {
    let listas = 0;
    servidor = (b) => {
      if (b.action === "list") {
        listas++;
        return listas <= 2 ? Promise.resolve(lista([llave("act", { webhook: webhook({ api_key_id: "act" }) })])) : Promise.reject(new Error("net"));
      }
      return Promise.resolve({ webhook: webhook({ api_key_id: "act", status: "paused", paused_at: "2026-09-26T14:05:00Z" }) });
    };
    montar();
    await screen.findByText("Key act");
    const d = await abrirCelda("Key act");
    await waitFor(() => expect(llamadasDe("list").length).toBe(2));
    fireEvent.click(within(d).getByRole("button", { name: /Pause/ }));
    await waitFor(() => expect(listas).toBeGreaterThan(2));
    await within(d).findByText(/Paused: no notification goes out/);
    expect(within(d).queryByRole("button", { name: /Pause/ })).toBeNull();
    await cerrarConEsc(d);
    // La tabla no se reemplaza por el error: sigue, con un aviso y Reintentar.
    expect(screen.getByText("Key act")).toBeTruthy();
    expect(celdaWebhook("Key act").textContent).toContain("Paused");
    expect(screen.getByText(/Couldn't refresh the list/)).toBeTruthy();
    // Reintentar relee y, si anda, el aviso se va.
    const antes = llamadasDe("list").length;
    listas = -100; // desde acá la lista contesta bien
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(llamadasDe("list").length).toBeGreaterThan(antes));
    await waitFor(() => expect(screen.queryByText(/Couldn't refresh the list/)).toBeNull());
  });

  it("tras borrar, aunque la relectura falle, la celda vuelve a Registrar", async () => {
    let listas = 0;
    servidor = (b) => {
      if (b.action === "list") {
        listas++;
        return listas <= 2 ? Promise.resolve(lista([llave("act", { webhook: webhook({ api_key_id: "act" }) })])) : Promise.reject(new Error("net"));
      }
      return Promise.resolve({ success: true, id: "w-act" });
    };
    montar();
    await screen.findByText("Key act");
    const d = await abrirCelda("Key act");
    fireEvent.click(within(d).getByRole("button", { name: /Delete/ }));
    const c = await screen.findByRole("alertdialog");
    fireEvent.click(within(c).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(within(celdaWebhook("Key act")).getByRole("button", { name: /Register/ })).toBeTruthy());
  });

  it("tras un rechazo, Pausar espera la relectura (un segundo toque no manda otro pedido)", async () => {
    const relectura = diferida<unknown>();
    let listas = 0;
    servidor = (b) => {
      if (b.action === "list") {
        listas++;
        return listas <= 2 ? Promise.resolve(lista([llave("act", { webhook: webhook({ api_key_id: "act" }) })])) : relectura.promesa;
      }
      return Promise.reject(new Error("Only an active webhook can be paused."));
    };
    montar();
    await screen.findByText("Key act");
    const d = await abrirCelda("Key act");
    await waitFor(() => expect(llamadasDe("list").length).toBe(2));
    fireEvent.click(within(d).getByRole("button", { name: /Pause/ }));
    await waitFor(() => expect(avisos.error.length).toBe(1));
    expect(within(d).getByRole("button", { name: /Pause/ }).getAttribute("aria-disabled")).toBe("true");
    // Borrar y Cerrar no esperan la relectura.
    expect((within(d).getByRole("button", { name: /Delete/ }) as HTMLButtonElement).disabled).toBe(false);
    expect(within(d).getAllByRole("status").some((r) => r.textContent === "Working…")).toBe(true);
    fireEvent.click(within(d).getByRole("button", { name: /Pause/ }));
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(llamadasDe("webhook_pause").length).toBe(1);
    // La relectura dice que sigue activo: Pausar vuelve a funcionar.
    relectura.resolver(lista([llave("act", { webhook: webhook({ api_key_id: "act" }) })]));
    await waitFor(() => expect(within(d).getByRole("button", { name: /Pause/ }).getAttribute("aria-disabled")).toBe("false"));
    fireEvent.click(within(d).getByRole("button", { name: /Pause/ }));
    await waitFor(() => expect(llamadasDe("webhook_pause").length).toBe(2));
  });

  it("después de una prueba, el diálogo se cierra y se pausa sin esperar la lista", async () => {
    const relectura = diferida<unknown>();
    let listas = 0;
    servidor = (b) => {
      if (b.action === "list") {
        listas++;
        return listas <= 2 ? Promise.resolve(lista([llave("act", { webhook: webhook({ api_key_id: "act" }) })])) : relectura.promesa;
      }
      return Promise.resolve({ webhook: webhook({ api_key_id: "act" }), test: pruebaOk });
    };
    montar();
    await screen.findByText("Key act");
    const d = await abrirCelda("Key act");
    await waitFor(() => expect(llamadasDe("list").length).toBe(2));
    fireEvent.click(within(d).getByRole("button", { name: /Send test/ }));
    await within(d).findByText("Your server answered 204.");
    await waitFor(() => expect(within(d).getByRole("button", { name: /Pause/ }).getAttribute("aria-disabled")).toBe("false"));
    await cerrarConEsc(d);
    relectura.resolver(lista([llave("act", { webhook: webhook({ api_key_id: "act" }) })]));
  });

  it("una prueba lanzada desde Entregas muestra su resultado (vuelve a Estado)", async () => {
    servidor = (b) => {
      if (b.action === "list") return Promise.resolve(lista([llave("act", { webhook: webhook({ api_key_id: "act" }) })]));
      if (b.action === "webhook_deliveries") return Promise.resolve({ webhook: webhook({ api_key_id: "act" }), deliveries: [] });
      return Promise.resolve({ webhook: webhook({ api_key_id: "act" }), test: { ...pruebaOk, activated: false, notice: "Not activated: the key's person isn't current." } });
    };
    montar();
    await screen.findByText("Key act");
    const d = await abrirCelda("Key act");
    fireEvent.mouseDown(within(d).getByRole("tab", { name: "Deliveries" }));
    await within(d).findByText("No deliveries yet.");
    fireEvent.click(within(d).getByRole("button", { name: /Send test/ }));
    expect(await within(d).findByText("Not activated: the key's person isn't current.")).toBeTruthy();
  });

  it("las entregas guardadas NO pisan un estado más nuevo al reabrir", async () => {
    let estado: W = webhook({ api_key_id: "act" });
    const reapertura = diferida<unknown>();
    let listas = 0;
    servidor = (b) => {
      if (b.action === "list") {
        listas++;
        return listas === 4 ? reapertura.promesa : Promise.resolve(lista([llave("act", { webhook: estado })]));
      }
      if (b.action === "webhook_deliveries") return Promise.resolve({ webhook: webhook({ api_key_id: "act" }), deliveries: [] });
      estado = { ...estado, status: "paused", paused_at: "2026-09-26T14:05:00Z" };
      return Promise.resolve({ webhook: estado });
    };
    montar();
    await screen.findByText("Key act");
    let d = await abrirCelda("Key act");
    fireEvent.mouseDown(within(d).getByRole("tab", { name: "Deliveries" }));
    await within(d).findByText("No deliveries yet.");
    fireEvent.mouseDown(within(d).getByRole("tab", { name: "Status" }));
    fireEvent.click(within(d).getByRole("button", { name: /Pause/ }));
    await waitFor(() => expect(within(d).queryByRole("button", { name: /Pause/ })).toBeNull());
    await cerrarConEsc(d);
    d = await abrirCelda("Key act");
    await waitFor(() => expect(listas).toBe(4));
    // Con la relectura de la reapertura todavía en vuelo: sigue pausado.
    expect(celdaWebhook("Key act").textContent).toContain("Paused");
    expect(within(d).queryByRole("button", { name: /Pause/ })).toBeNull();
    reapertura.resolver(lista([llave("act", { webhook: estado })]));
  });

  it("si lo borran con el diálogo abierto y después no se puede consultar, no revive", async () => {
    let listas = 0;
    servidor = (b) => {
      if (b.action === "list") {
        listas++;
        if (listas <= 2) return Promise.resolve(lista([llave("act", { acts_as: { id: OTRA, name: "Someone Else", active: true }, webhook: webhook({ api_key_id: "act" }) })]));
        if (listas === 3) return Promise.resolve(lista([llave("act", { acts_as: { id: OTRA, name: "Someone Else", active: true }, webhook: null })]));
        return Promise.resolve(lista([llave("act", { acts_as: { id: OTRA, name: "Someone Else", active: true }, webhook: null })], { webhooks_unknown: true }));
      }
      return Promise.reject(new Error("That webhook doesn't exist."));
    };
    montar();
    await screen.findByText("Key act");
    const d = await abrirCelda("Key act");
    await waitFor(() => expect(listas).toBe(2));
    fireEvent.click(within(d).getByRole("button", { name: /Pause/ }));
    // La relectura dice "no tiene": quien no es la dueña ve eso, no el alta.
    await within(d).findByText(/This key has no webhook/);
    expect(within(d).queryByText(/Register a webhook/)).toBeNull();
    // Una relectura siguiente que no puede consultar no lo resucita.
    await act(async () => { await qc.invalidateQueries({ queryKey: ["api-keys"] }); });
    await waitFor(() => expect(listas).toBe(4));
    expect(within(d).queryByText("hooks.example.com")).toBeNull();
    expect(within(d).queryByRole("button", { name: /Pause|Delete/ })).toBeNull();
  });

  it("mientras sale una prueba no se puede cerrar", async () => {
    const pr = diferida<unknown>();
    servidor = (b) => b.action === "list"
      ? Promise.resolve(lista([llave("act", { webhook: webhook({ api_key_id: "act" }) })]))
      : pr.promesa;
    montar();
    await screen.findByText("Key act");
    const d = await abrirCelda("Key act");
    fireEvent.click(within(d).getByRole("button", { name: /Send test/ }));
    await waitFor(() => expect(llamadasDe("webhook_test").length).toBe(1));
    fireEvent.keyDown(d, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBe(d);
    pr.resolver({ webhook: webhook({ api_key_id: "act" }), test: pruebaOk });
    await within(d).findByText("Your server answered 204.");
  });

  it("la cara de quien pausó se pide aunque no sea persona de ninguna key", async () => {
    const TERCERA = "11111111-2222-4333-8444-555555555555";
    servidor = () => Promise.resolve(lista([llave("mia", { webhook: webhook({ api_key_id: "mia", status: "paused", paused_by: { id: TERCERA, name: "Third" } }) })]));
    montar();
    await screen.findByText("Key mia");
    expect(ultimo(carasPedidas)).toContain(TERCERA);
  });

  it("el foco vuelve al chip al cerrar; tras registrar, al chip nuevo; tras borrar, a su celda", async () => {
    let conWebhook: W | null = null;
    let ajena: W | null = webhook({ api_key_id: "ajena" });
    servidor = (b) => {
      if (b.action === "list") return Promise.resolve(lista([
        llave("mia", { webhook: conWebhook }),
        llave("ajena", { acts_as: { id: OTRA, name: "Someone Else", active: true }, webhook: ajena }),
      ]));
      if (b.action === "webhook_delete") { ajena = null; return Promise.resolve({ success: true }); }
      conWebhook = webhook({ api_key_id: "mia", status: "pending" });
      return Promise.resolve({ webhook: conWebhook, secret: SECRETO });
    };
    montar();
    await screen.findByText("Key mia");
    // chip → cerrar → chip
    let chip = within(celdaWebhook("Key ajena")).getByRole("button");
    chip.focus();
    fireEvent.click(chip);
    let d = await screen.findByRole("dialog");
    await cerrarConEsc(d);
    await waitFor(() => expect(document.activeElement).toBe(within(celdaWebhook("Key ajena")).getByRole("button")));
    // Registrar → (desaparece) → el chip nuevo
    const reg = within(celdaWebhook("Key mia")).getByRole("button", { name: /Register/ });
    reg.focus();
    fireEvent.click(reg);
    d = await screen.findByRole("dialog");
    fireEvent.change(within(d).getByLabelText("Your server's URL"), { target: { value: "https://hooks.example.com/x" } });
    fireEvent.click(within(d).getByRole("button", { name: "Register webhook" }));
    await within(d).findByText(SECRETO);
    await waitFor(() => expect(celdaWebhook("Key mia").textContent).toContain("Waiting"));
    fireEvent.click(within(d).getByRole("button", { name: "Later" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(within(celdaWebhook("Key mia")).getByRole("button")));
    // borrar el de otra persona → la celda queda "Sin webhook" (sin botón) → la celda
    chip = within(celdaWebhook("Key ajena")).getByRole("button");
    chip.focus();
    fireEvent.click(chip);
    d = await screen.findByRole("dialog");
    fireEvent.click(within(d).getByRole("button", { name: /Delete/ }));
    const c = await screen.findByRole("alertdialog");
    fireEvent.click(within(c).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(celdaWebhook("Key ajena")));
  });

  it("entregas se releen cada 15 s mientras se mira la pestaña, y no con la pestaña cerrada", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      servidor = (b) => b.action === "list"
        ? Promise.resolve(lista([llave("act", { webhook: webhook({ api_key_id: "act" }) })]))
        : Promise.resolve({ webhook: webhook({ api_key_id: "act" }), deliveries: [] });
      montar();
      await screen.findByText("Key act");
      const d = await abrirCelda("Key act");
      fireEvent.mouseDown(within(d).getByRole("tab", { name: "Deliveries" }));
      await within(d).findByText("No deliveries yet.");
      const antes = llamadasDe("webhook_deliveries").length;
      await vi.advanceTimersByTimeAsync(15_500);
      await waitFor(() => expect(llamadasDe("webhook_deliveries").length).toBeGreaterThan(antes));
      fireEvent.mouseDown(within(d).getByRole("tab", { name: "Status" }));
      const despues = llamadasDe("webhook_deliveries").length;
      await vi.advanceTimersByTimeAsync(31_000);
      expect(llamadasDe("webhook_deliveries").length).toBe(despues);
    } finally {
      vi.useRealTimers();
    }
  });

  it("durante la animación de salida el diálogo sigue con su contenido (también tras borrar)", async () => {
    const st = document.createElement("style");
    st.textContent = '[role="dialog"][data-state="closed"] { animation-name: salir; }';
    document.head.appendChild(st);
    try {
      let tiene = true;
      servidor = (b) => {
        if (b.action === "list") return Promise.resolve(lista([llave("act", { webhook: tiene ? webhook({ api_key_id: "act" }) : null })]));
        tiene = false;
        return Promise.resolve({ success: true });
      };
      montar();
      await screen.findByText("Key act");
      const d = await abrirCelda("Key act");
      fireEvent.click(within(d).getByRole("button", { name: /Delete/ }));
      const c = await screen.findByRole("alertdialog");
      fireEvent.click(within(c).getByRole("button", { name: "Delete" }));
      await waitFor(() => expect(llamadasDe("webhook_delete").length).toBe(1));
      await new Promise((r) => setTimeout(r, 30));
      const sigue = document.querySelector('[role="dialog"]');
      expect(sigue).not.toBeNull();
      expect(sigue!.textContent).toContain("hooks.example.com");
      expect(document.querySelector("#webhook-url")).toBeNull();
      expect(sigue!.textContent).not.toContain("Register a webhook");
      // La confirmación no queda congelada abierta encima de la salida.
      expect(document.querySelector('[role="alertdialog"][data-state="open"]')).toBeNull();
    } finally {
      st.remove();
    }
  });

  it("una prueba incierta dice 'no se sabe si llegó', no 'no llegó'", async () => {
    servidor = (b) => b.action === "list"
      ? Promise.resolve(lista([llave("act", { webhook: webhook({ api_key_id: "act" }) })]))
      : Promise.resolve({ webhook: webhook({ api_key_id: "act" }), test: { delivered: false, status_code: null, error_code: "plazo", latency_ms: 10_000, uncertain: true, activated: false, message: "The server didn't answer within 10 seconds", notice: null } });
    montar();
    await screen.findByText("Key act");
    const d = await abrirCelda("Key act");
    fireEvent.click(within(d).getByRole("button", { name: /Send test/ }));
    expect(await within(d).findByText("Delivery unconfirmed")).toBeTruthy();
    expect(within(d).queryByText("Not delivered")).toBeNull();
    expect(within(d).getByText(/It was cut off after sending/)).toBeTruthy();
  });

  it("con la hora del próximo intento ya pasada no se promete un reintento; un motivo nuevo tiene texto", async () => {
    servidor = (b) => b.action === "list"
      ? Promise.resolve(lista([
        llave("fall", { webhook: { ...fallando("fall"), next_attempt_at: "2020-01-01T00:00:00Z" } }),
        llave("nuevo", { webhook: webhook({ api_key_id: "nuevo", status: "disabled", disabled_reason: "motivo_del_futuro" }) }),
      ]))
      : Promise.resolve({
        webhook: { ...fallando("fall"), next_attempt_at: "2020-01-01T00:00:00Z" },
        deliveries: [{ id: "e", event_type: "messages.created", message_count: 2, state: "pending", drop_reason: null, attempts: 3, last_attempt_at: "2026-09-26T14:00:00Z", last_status_code: 503, last_error: "http_503", latency_ms: 50, uncertain: false, created_at: "2026-09-26T13:00:00Z", delivered_at: null }],
      });
    montar();
    await screen.findByText("Key fall");
    let d = await abrirCelda("Key fall");
    expect(within(d).queryByText("Next attempt")).toBeNull();
    fireEvent.mouseDown(within(d).getByRole("tab", { name: "Deliveries" }));
    expect(await within(d).findByText("Pending")).toBeTruthy();
    expect(within(d).queryByText(/^Retrying /)).toBeNull();
    await cerrarConEsc(d);
    d = await abrirCelda("Key nuevo");
    expect(within(d).getByText("It's stopped.")).toBeTruthy();
  });

  it("la key recién creada tampoco queda en la MutationCache", async () => {
    const KEY = "mvk_live_abcdef_ESTA-KEY-NO-TIENE-QUE-QUEDAR";
    servidor = (b) => b.action === "create" ? Promise.resolve({ key: KEY }) : Promise.resolve(lista([llave("mia")]));
    montar();
    await screen.findByText("Key mia");
    fireEvent.click(screen.getByRole("button", { name: /Create API key/ }));
    const d = await screen.findByRole("dialog");
    fireEvent.change(within(d).getByLabelText("Name"), { target: { value: "Nueva" } });
    fireEvent.click(within(d).getByRole("button", { name: "Create key" }));
    expect(await within(d).findByText(KEY)).toBeTruthy();
    await waitFor(() => expect(JSON.stringify(qc.getMutationCache().getAll().map((m) => m.state.data))).not.toContain(KEY));
  });
});

describe("tercera revisión", () => {
  /** ¿El texto está en algún lado del árbol de React (props, estado, refs)? Así se ve
   *  si el secreto quedó retenido aunque no esté en el DOM. */
  function enLasFibras(contenedor: HTMLElement, texto: string): boolean {
    const clave = Object.keys(contenedor).find((k) => k.startsWith("__reactContainer$"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hostRoot = clave ? (contenedor as any)[clave] : null;
    const actual = hostRoot?.stateNode?.current ?? hostRoot;
    const vistos = new WeakSet<object>();
    const buscar = (v: unknown, prof: number): boolean => {
      if (typeof v === "string") return v.includes(texto);
      if (!v || typeof v !== "object" || prof > 40 || v instanceof Node) return false;
      if (vistos.has(v)) return false;
      vistos.add(v);
      if (v instanceof Map || v instanceof Set) {
        for (const x of v.values()) if (buscar(x, prof + 1)) return true;
        if (v instanceof Map) for (const x of v.keys()) if (buscar(x, prof + 1)) return true;
        return false;
      }
      for (const k of Object.keys(v)) {
        if (k === "_owner" || k === "return" || k === "alternate" || k === "stateNode" || k === "child" || k === "sibling") continue;
        if (buscar((v as Record<string, unknown>)[k], prof + 1)) return true;
      }
      return false;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pila: any[] = actual ? [actual] : [];
    const fibras = new WeakSet<object>();
    while (pila.length) {
      const f = pila.pop();
      if (fibras.has(f)) continue;
      fibras.add(f);
      // También la fibra alterna (el árbol de antes): guarda props y estado viejos.
      if (f.alternate) pila.push(f.alternate);
      if (buscar(f.memoizedProps, 0) || buscar(f.pendingProps, 0)) return true;
      // Los hooks son una lista (memoizedState → next → next…): se recorre entera, sin
      // gastar profundidad; si no, un useRef del hook 12 quedaba fuera del alcance.
      for (let h = f.memoizedState; h && typeof h === "object"; h = h.next) {
        if (buscar(h.memoizedState, 0) || buscar(h.baseState, 0)) return true;
        if (!("next" in h)) break;
      }
      if (f.child) pila.push(f.child);
      if (f.sibling) pila.push(f.sibling);
    }
    return false;
  }

  it("después de cerrar, el secreto no queda en ninguna parte del árbol de React", async () => {
    let conWebhook: W | null = null;
    servidor = (b) => {
      if (b.action === "list") return Promise.resolve(lista([llave("mia", { webhook: conWebhook })]));
      conWebhook = webhook({ api_key_id: "mia", status: "pending" });
      return Promise.resolve({ webhook: conWebhook, secret: SECRETO });
    };
    const { container } = montar();
    await screen.findByText("Key mia");
    fireEvent.click(within(celdaWebhook("Key mia")).getByRole("button", { name: /Register/ }));
    const d = await screen.findByRole("dialog");
    fireEvent.change(within(d).getByLabelText("Your server's URL"), { target: { value: "https://hooks.example.com/x" } });
    fireEvent.click(within(d).getByRole("button", { name: "Register webhook" }));
    await within(d).findByText(SECRETO);
    expect(enLasFibras(container, SECRETO)).toBe(true); // la sonda sí lo ve mientras está abierto
    fireEvent.click(within(d).getByRole("button", { name: "Later" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(enLasFibras(container, SECRETO)).toBe(false));
  });

  it("una prueba que vuelve sin el endpoint: Pausar espera la relectura (y lo anuncia)", async () => {
    const relectura = diferida<unknown>();
    let listas = 0;
    servidor = (b) => {
      if (b.action === "list") {
        listas++;
        return listas <= 2 ? Promise.resolve(lista([llave("act", { webhook: webhook({ api_key_id: "act" }) })])) : relectura.promesa;
      }
      if (b.action === "webhook_test") return Promise.resolve({ webhook: null, test: { ...pruebaOk, activated: false } });
      return Promise.resolve({ webhook: webhook({ api_key_id: "act", status: "paused" }) });
    };
    montar();
    await screen.findByText("Key act");
    const d = await abrirCelda("Key act");
    await waitFor(() => expect(listas).toBe(2));
    fireEvent.click(within(d).getByRole("button", { name: /Send test/ }));
    await within(d).findByText("Your server answered 204.");
    await waitFor(() => expect(within(d).getByRole("button", { name: /Pause/ }).getAttribute("aria-disabled")).toBe("true"));
    expect(within(d).getByRole("button", { name: /Send test/ }).getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(within(d).getByRole("button", { name: /Pause/ }));
    fireEvent.click(within(d).getByRole("button", { name: /Send test/ }));
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(llamadasDe("webhook_pause").length).toBe(0);
    expect(llamadasDe("webhook_test").length).toBe(1);
    relectura.resolver(lista([llave("act", { webhook: webhook({ api_key_id: "act" }) })]));
    await waitFor(() => expect(within(d).getByRole("button", { name: /Pause/ }).getAttribute("aria-disabled")).toBe("false"));
  });

  it("mientras borra, ni Cancelar ni Esc cierran la confirmación", async () => {
    const borrado = diferida<unknown>();
    let tiene = true;
    servidor = (b) => {
      if (b.action === "list") return Promise.resolve(lista([llave("act", { webhook: tiene ? webhook({ api_key_id: "act" }) : null })]));
      tiene = false;
      return borrado.promesa;
    };
    montar();
    await screen.findByText("Key act");
    const d = await abrirCelda("Key act");
    fireEvent.click(within(d).getByRole("button", { name: /Delete/ }));
    const c = await screen.findByRole("alertdialog");
    fireEvent.click(within(c).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(llamadasDe("webhook_delete").length).toBe(1));
    fireEvent.click(within(c).getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(c, { key: "Escape" });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.getByRole("alertdialog")).toBe(c);
    borrado.resolver({ success: true });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("con una pausa en vuelo, Borrar espera (no se abre una confirmación que se traga el toque)", async () => {
    const pausa = diferida<unknown>();
    servidor = (b) => b.action === "list"
      ? Promise.resolve(lista([llave("act", { webhook: webhook({ api_key_id: "act" }) })]))
      : pausa.promesa;
    montar();
    await screen.findByText("Key act");
    const d = await abrirCelda("Key act");
    fireEvent.click(within(d).getByRole("button", { name: /Pause/ }));
    await waitFor(() => expect(llamadasDe("webhook_pause").length).toBe(1));
    expect((within(d).getByRole("button", { name: /Delete/ }) as HTMLButtonElement).disabled).toBe(true);
    pausa.resolver({ webhook: webhook({ api_key_id: "act", status: "paused" }) });
    await waitFor(() => expect((within(d).getByRole("button", { name: /Delete/ }) as HTMLButtonElement).disabled).toBe(false));
  });

  it("receptor fallando y además una demora de Maven: el diálogo muestra las dos cosas", async () => {
    servidor = () => Promise.resolve(lista([
      llave("dos", { webhook: webhook({ api_key_id: "dos", consecutive_failures: 5, failing_since: "2026-09-26T08:00:00Z", last_attempt_at: "2026-09-26T13:00:00Z", last_error: "maven_base", next_attempt_at: "2999-01-01T00:00:00Z" }) }),
    ]));
    montar();
    await screen.findByText("Key dos");
    expect(celdaWebhook("Key dos").textContent).toContain("Active · failing");
    const d = await abrirCelda("Key dos");
    expect(within(d).getByText(/The integrator's server is failing/)).toBeTruthy();
    expect(within(d).getByText("Failures in a row")).toBeTruthy();
    expect(within(d).getByText("Maven delay")).toBeTruthy();
    expect(within(d).getByText("A Maven-side failure, not the integrator's")).toBeTruthy();
  });

  it("si lo borran y la key de la dueña está revocada, no se le ofrece el alta", async () => {
    let listas = 0;
    servidor = (b) => {
      if (b.action === "list") {
        listas++;
        return Promise.resolve(lista([llave("rev", { status: "revoked", webhook: listas <= 2 ? webhook({ api_key_id: "rev", status: "disabled", disabled_reason: "key_revoked" }) : null })]));
      }
      return Promise.reject(new Error("That webhook doesn't exist."));
    };
    montar();
    await screen.findByText("Key rev");
    const d = await abrirCelda("Key rev");
    await waitFor(() => expect(listas).toBe(2));
    fireEvent.click(within(d).getByRole("button", { name: /Delete/ }));
    const c = await screen.findByRole("alertdialog");
    fireEvent.click(within(c).getByRole("button", { name: "Delete" }));
    await within(d).findByText(/This key has no webhook/);
    expect(within(d).queryByLabelText("Your server's URL")).toBeNull();
  });

  it("si la última relectura falló, el diálogo avisa que lo que muestra puede estar viejo", async () => {
    let listas = 0;
    servidor = (b) => {
      if (b.action === "list") {
        listas++;
        return listas === 1 ? Promise.resolve(lista([llave("act", { webhook: webhook({ api_key_id: "act" }) })])) : Promise.reject(new Error("net"));
      }
      return Promise.reject(new Error("x"));
    };
    montar();
    await screen.findByText("Key act");
    const d = await abrirCelda("Key act");
    await waitFor(() => expect(listas).toBe(2));
    expect(await within(d).findByText(/Couldn't refresh the status/)).toBeTruthy();
    expect(within(d).getByRole("button", { name: /Delete/ })).toBeTruthy();
  });

  it("en la vista del secreto, 'Enviar prueba' no pierde el foco mientras prueba (aria-disabled)", async () => {
    const pr = diferida<unknown>();
    let conWebhook: W | null = null;
    servidor = (b) => {
      if (b.action === "list") return Promise.resolve(lista([llave("mia", { webhook: conWebhook })]));
      if (b.action === "webhook_create") {
        conWebhook = webhook({ api_key_id: "mia", status: "pending" });
        return Promise.resolve({ webhook: conWebhook, secret: SECRETO });
      }
      return pr.promesa;
    };
    montar();
    await screen.findByText("Key mia");
    fireEvent.click(within(celdaWebhook("Key mia")).getByRole("button", { name: /Register/ }));
    const d = await screen.findByRole("dialog");
    fireEvent.change(within(d).getByLabelText("Your server's URL"), { target: { value: "https://hooks.example.com/x" } });
    fireEvent.click(within(d).getByRole("button", { name: "Register webhook" }));
    await within(d).findByText(SECRETO);
    const enviar = within(d).getByRole("button", { name: /Send test/ });
    fireEvent.click(enviar);
    await waitFor(() => expect(enviar.getAttribute("aria-disabled")).toBe("true"));
    expect((enviar as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(enviar);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(llamadasDe("webhook_test").length).toBe(1);
    pr.resolver({ webhook: conWebhook, test: pruebaOk });
    await within(d).findByText("Your server answered 204.");
  });

  it("crear una API key: con el pedido en vuelo no se cierra, y la key se ve igual", async () => {
    const KEY = "mvk_live_abcdef_LA-KEY-QUE-NO-SE-PUEDE-PERDER";
    const alta = diferida<unknown>();
    servidor = (b) => b.action === "create" ? alta.promesa : Promise.resolve(lista([llave("mia")]));
    montar();
    await screen.findByText("Key mia");
    fireEvent.click(screen.getByRole("button", { name: /Create API key/ }));
    const d = await screen.findByRole("dialog");
    fireEvent.change(within(d).getByLabelText("Name"), { target: { value: "Nueva" } });
    fireEvent.click(within(d).getByRole("button", { name: "Create key" }));
    fireEvent.keyDown(d, { key: "Escape" });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.getByRole("dialog")).toBe(d);
    alta.resolver({ key: KEY });
    expect(await within(d).findByText(KEY)).toBeTruthy();
  });
});

describe("cuarta revisión", () => {
  it("si el webhook desaparece con la confirmación abierta, la salida muestra 'no tiene' (no el webhook viejo)", async () => {
    const st = document.createElement("style");
    st.textContent = '[role="dialog"][data-state="closed"] { animation-name: salir; }';
    document.head.appendChild(st);
    try {
      const relectura = diferida<unknown>();
      let listas = 0;
      const acts = { acts_as: { id: OTRA, name: "Someone Else", active: true } };
      servidor = (b) => {
        if (b.action === "list") {
          listas++;
          return listas <= 2 ? Promise.resolve(lista([llave("act", { ...acts, webhook: webhook({ api_key_id: "act" }) })])) : relectura.promesa;
        }
        return Promise.reject(new Error("That webhook doesn't exist."));
      };
      montar();
      await screen.findByText("Key act");
      const d = await abrirCelda("Key act");
      await waitFor(() => expect(listas).toBe(2));
      fireEvent.click(within(d).getByRole("button", { name: /Pause/ }));
      await waitFor(() => expect(avisos.error.length).toBe(1));
      fireEvent.click(within(d).getByRole("button", { name: /Delete/ }));
      await screen.findByRole("alertdialog");
      relectura.resolver(lista([llave("act", { ...acts, webhook: null })]));
      await within(d).findByText(/This key has no webhook/);
      expect(screen.queryByRole("alertdialog")).toBeNull();
      fireEvent.click(within(d).getAllByRole("button", { name: "Close" })[0]);
      await new Promise((r) => setTimeout(r, 30));
      const sale = document.querySelector('[role="dialog"]');
      if (sale) {
        expect(sale.textContent).toContain("This key has no webhook");
        expect(sale.textContent).not.toContain("hooks.example.com");
      }
    } finally {
      st.remove();
    }
  });

  it("la dueña sin Messenger en la key: si lo borran, tampoco ve el alta", async () => {
    let listas = 0;
    servidor = (b) => {
      if (b.action === "list") {
        listas++;
        return Promise.resolve(lista([llave("sin", { scopes: ["creators:read"], webhook: listas <= 2 ? webhook({ api_key_id: "sin", status: "disabled", disabled_reason: "scope_removed" }) : null })]));
      }
      return Promise.reject(new Error("That webhook doesn't exist."));
    };
    montar();
    await screen.findByText("Key sin");
    const d = await abrirCelda("Key sin");
    await waitFor(() => expect(listas).toBe(2));
    fireEvent.click(within(d).getByRole("button", { name: /Delete/ }));
    const c = await screen.findByRole("alertdialog");
    fireEvent.click(within(c).getByRole("button", { name: "Delete" }));
    await within(d).findByText(/This key has no webhook/);
    expect(within(d).queryByLabelText("Your server's URL")).toBeNull();
  });

  it("con Pausar en vuelo se anuncia que trabaja; con una prueba en vuelo Borrar espera", async () => {
    const pausa = diferida<unknown>();
    const prueba = diferida<unknown>();
    let estadoA = "active";
    servidor = (b) => {
      if (b.action === "list") return Promise.resolve(lista([llave("a", { webhook: webhook({ api_key_id: "a", status: estadoA }) }), llave("b", { webhook: webhook({ api_key_id: "b" }) })]));
      if (b.action === "webhook_pause") { estadoA = "paused"; return pausa.promesa; }
      return prueba.promesa;
    };
    montar();
    await screen.findByText("Key a");
    let d = await abrirCelda("Key a");
    fireEvent.click(within(d).getByRole("button", { name: /Pause/ }));
    await waitFor(() => expect(within(d).getAllByRole("status").some((r) => r.textContent === "Working…")).toBe(true));
    pausa.resolver({ webhook: webhook({ api_key_id: "a", status: "paused" }) });
    await waitFor(() => expect(within(d).queryByRole("button", { name: /Pause/ })).toBeNull());
    await cerrarConEsc(d);
    d = await abrirCelda("Key b");
    fireEvent.click(within(d).getByRole("button", { name: /Send test/ }));
    await waitFor(() => expect((within(d).getByRole("button", { name: /Delete/ }) as HTMLButtonElement).disabled).toBe(true));
    prueba.resolver({ webhook: webhook({ api_key_id: "b" }), test: pruebaOk });
    await waitFor(() => expect((within(d).getByRole("button", { name: /Delete/ }) as HTMLButtonElement).disabled).toBe(false));
  });

  it("crear una API key: dos toques crean UNA; después de crear o de un error, el modal se cierra", async () => {
    const KEY = "mvk_live_abcdef_UNA-SOLA";
    let n = 0;
    servidor = (b) => {
      if (b.action !== "create") return Promise.resolve(lista([llave("mia")]));
      n++;
      return n === 1 ? Promise.resolve({ key: KEY }) : Promise.reject(new Error("Name already in use."));
    };
    montar();
    await screen.findByText("Key mia");
    fireEvent.click(screen.getByRole("button", { name: /Create API key/ }));
    let d = await screen.findByRole("dialog");
    fireEvent.change(within(d).getByLabelText("Name"), { target: { value: "Nueva" } });
    const crear = within(d).getByRole("button", { name: "Create key" });
    fireEvent.click(crear);
    fireEvent.click(crear);
    expect(await within(d).findByText(KEY)).toBeTruthy();
    expect(llamadasDe("create").length).toBe(1);
    fireEvent.click(within(d).getByRole("button", { name: /Done/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // Un alta que falla también suelta el candado.
    fireEvent.click(screen.getByRole("button", { name: /Create API key/ }));
    d = await screen.findByRole("dialog");
    fireEvent.change(within(d).getByLabelText("Name"), { target: { value: "Otra" } });
    fireEvent.click(within(d).getByRole("button", { name: "Create key" }));
    await waitFor(() => expect(avisos.error).toContain("Name already in use."));
    fireEvent.click(within(d).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("sin red el alta no se queda pausada: sale enseguida (y el modal no queda trabado)", async () => {
    const { onlineManager } = await import("@tanstack/react-query");
    servidor = (b) => b.action === "create" ? Promise.reject(new Error("Failed to fetch")) : Promise.resolve(lista([llave("mia")]));
    montar();
    await screen.findByText("Key mia");
    fireEvent.click(screen.getByRole("button", { name: /Create API key/ }));
    const d = await screen.findByRole("dialog");
    fireEvent.change(within(d).getByLabelText("Name"), { target: { value: "Nueva" } });
    onlineManager.setOnline(false);
    try {
      fireEvent.click(within(d).getByRole("button", { name: "Create key" }));
      await waitFor(() => expect(llamadasDe("create").length).toBe(1));
      await waitFor(() => expect(avisos.error).toContain("Failed to fetch"));
      fireEvent.click(within(d).getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    } finally {
      onlineManager.setOnline(true);
    }
  });
});
