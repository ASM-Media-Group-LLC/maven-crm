// Ajustes → API keys: el webhook del Messenger de cada key (PR 5 de webhooks).
//
// Lo que se cuida: quién ve qué botón (registrar/probar/reanudar son solo de la
// persona de la key; pausar/borrar/entregas, de cualquier admin), que el secreto
// aparezca UNA vez y no quede en ningún lado, que "no se pudo consultar" no se
// confunda con "no tiene", que cada código del servidor se lea en palabras, y que
// todo esté en inglés cuando la pantalla está en inglés.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
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
        test: { delivered: false, status_code: 401, error_code: "http_401", latency_ms: 90, uncertain: true, activated: false,
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
    expect(within(d).getByText(/It was cut off after sending/)).toBeTruthy();
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
    await waitFor(() => expect((within(confirma).getByRole("button", { name: /Delete/ }) as HTMLButtonElement).disabled).toBe(true));
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
      llave("sale", { webhook: webhook({ api_key_id: "sale", consecutive_failures: 1, failing_since: "2026-09-26T14:10:00Z", last_attempt_at: "2026-09-26T14:00:00Z", next_attempt_at: "2999-01-01T00:00:00Z" }) }),
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
    expect(within(d).getByText("Test")).toBeTruthy();
    expect(within(d).getByText(/^Retrying /)).toBeTruthy();
    expect(within(d).getByText("Didn't answer in time")).toBeTruthy();
    expect(within(d).getByText("Dropped: the test wasn't delivered")).toBeTruthy();
    expect(within(d).getByText("Invalid HTTPS certificate")).toBeTruthy();
    expect(within(d).getByText("Dropped: another reason")).toBeTruthy();
    expect(within(d).getAllByText(/It was cut off after sending/).length).toBeGreaterThan(0);
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
    expect(within(d).getByText(/every 15 minutes or less/)).toBeTruthy();
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
    expect(ef({ consecutive_failures: 3, failing_since: "2026-09-26T08:00:00Z", last_error: "maven_base" }).fallando).toBe(false);
    expect(ef({ status: "paused", consecutive_failures: 3, failing_since: "2026-09-26T08:00:00Z", last_error: "http_500" }).fallando).toBe(false);
  });
});
