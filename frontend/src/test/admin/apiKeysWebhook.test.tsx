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
import { textoDelError, chipDelWebhook, queMostrar } from "@/pages/admin/ApiKeyWebhook";

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

describe("la celda Webhook de la tabla", () => {
  it("cada caso muestra lo suyo (y no se confunde 'no tiene' con 'no se sabe')", async () => {
    servidor = () => Promise.resolve(lista([
      llave("mia"),                                                    // Messenger, mía, sin webhook
      llave("ajena", { acts_as: { id: OTRA, name: "Someone Else", active: true } }),
      llave("otra", { scopes: ["creators:read"], ip_whitelist: [] }),  // sin Messenger
      llave("vieja", { status: "expired" }),                           // vencida, sin webhook
      llave("act", { webhook: webhook({ api_key_id: "act" }) }),
      llave("pend", { webhook: webhook({ api_key_id: "pend", status: "pending" }) }),
      llave("fall", { webhook: webhook({ api_key_id: "fall", consecutive_failures: 4, last_error: "http_503" }) }),
      llave("pau", { webhook: webhook({ api_key_id: "pau", status: "paused" }) }),
      llave("det", { webhook: webhook({ api_key_id: "det", status: "disabled", disabled_reason: "receiver_gone" }) }),
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
    expect(enEspanol(document.body)).toEqual([]);
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

  it("si no se pudo consultar, NINGUNA key ofrece Registrar", async () => {
    servidor = () => Promise.resolve(lista([llave("mia")], { webhooks_unknown: true }));
    montar();
    await screen.findByText("Key mia");
    expect(within(celdaWebhook("Key mia")).queryByRole("button")).toBeNull();
    expect(celdaWebhook("Key mia").textContent).toBe("Couldn't check");
  });

  it("un servidor que no manda `webhook` cuenta como 'no se sabe', no como 'no tiene'", () => {
    const k = { id: "k", name: "k", scopes: ["messenger:read"], status: "active" as const, acts_as: { id: YO, name: null, active: true } };
    expect(queMostrar(k, YO, false)).toBe("desconocido");
    expect(queMostrar({ ...k, webhook: null }, YO, false)).toBe("registrar");
    expect(queMostrar({ ...k, webhook: null }, OTRA, false)).toBe("sin");
    expect(queMostrar({ ...k, webhook: null }, undefined, false)).toBe("sin");
    expect(queMostrar({ ...k, webhook: null, status: "revoked" }, YO, false)).toBe("sin");
    expect(queMostrar({ ...k, webhook: null }, YO, true)).toBe("desconocido");
    expect(queMostrar({ ...k, scopes: ["creators:read"] }, YO, true)).toBe("nada");
  });
});

describe("registrar: el secreto, UNA vez", () => {
  it("manda lo pedido, muestra el secreto, prueba y lo olvida", async () => {
    let conWebhook: W | null = null;
    servidor = (b) => {
      if (b.action === "list") return Promise.resolve(lista([llave("mia", { webhook: conWebhook })]));
      if (b.action === "webhook_create") {
        conWebhook = webhook({ api_key_id: "mia", id: "w-mia", status: "pending", last_attempt_at: null, last_success_at: null, last_status_code: null, last_test_at: null });
        return Promise.resolve({ webhook: conWebhook, secret: SECRETO });
      }
      if (b.action === "webhook_test") {
        conWebhook = { ...conWebhook!, status: "active" };
        return Promise.resolve({
          webhook: conWebhook,
          test: { delivered: true, status_code: 204, error_code: null, latency_ms: 183, uncertain: false, activated: true,
            message: "Your server answered 204.", notice: null },
        });
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
    expect(llamadas.find((l) => l.action === "webhook_create")).toEqual({
      action: "webhook_create", lang: "en", key_id: "mia", url: "https://hooks.example.com/maven", exclude_own: false,
    });
    expect(enEspanol(dialogo)).toEqual([]);
    // El secreto no queda en la caché de react-query (la lista ni la tiene).
    expect(JSON.stringify(qc.getQueryCache().getAll().map((q) => q.state.data))).not.toContain(SECRETO);

    fireEvent.click(within(dialogo).getByRole("button", { name: /Send test/ }));
    expect(await within(dialogo).findByText("Your server answered 204.")).toBeTruthy();
    expect(llamadas.find((l) => l.action === "webhook_test")).toEqual({ action: "webhook_test", lang: "en", id: "w-mia" });
    expect(within(dialogo).getByText(/Webhook activated: from now on/)).toBeTruthy();
    expect(dialogo.textContent).not.toContain(SECRETO);
    expect(avisos.ok).toContain("Webhook activated");
    expect(enEspanol(dialogo)).toEqual([]);
  });

  it("'Después' cierra y el secreto no vuelve a aparecer al reabrir", async () => {
    let conWebhook: W | null = null;
    servidor = (b) => {
      if (b.action === "list") return Promise.resolve(lista([llave("mia", { webhook: conWebhook })]));
      conWebhook = webhook({ api_key_id: "mia", id: "w-mia", status: "pending" });
      return Promise.resolve({ webhook: conWebhook, secret: SECRETO });
    };
    montar();
    await screen.findByText("Key mia");
    fireEvent.click(within(celdaWebhook("Key mia")).getByRole("button", { name: /Register/ }));
    let dialogo = await screen.findByRole("dialog");
    fireEvent.change(within(dialogo).getByLabelText("Your server's URL"), { target: { value: "https://hooks.example.com/x" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Register webhook" }));
    await within(dialogo).findByText(SECRETO);
    fireEvent.click(within(dialogo).getByRole("button", { name: "Later" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(celdaWebhook("Key mia").textContent).toContain("Waiting for the test"));
    fireEvent.click(within(celdaWebhook("Key mia")).getByRole("button"));
    dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("whsec_…9f3a")).toBeTruthy();
    expect(document.body.textContent).not.toContain(SECRETO);
  });

  it("un error del servidor se muestra tal cual (ya viene en el idioma)", async () => {
    servidor = (b) => b.action === "list"
      ? Promise.resolve(lista([llave("mia")]))
      : Promise.reject(new Error("That URL points to a private address."));
    montar();
    await screen.findByText("Key mia");
    fireEvent.click(within(celdaWebhook("Key mia")).getByRole("button", { name: /Register/ }));
    const dialogo = await screen.findByRole("dialog");
    fireEvent.change(within(dialogo).getByLabelText("Your server's URL"), { target: { value: "https://10.0.0.1/x" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Register webhook" }));
    await waitFor(() => expect(avisos.error).toEqual(["That URL points to a private address."]));
    expect(within(dialogo).getByLabelText("Your server's URL")).toBeTruthy();
  });
});

describe("estado: quién puede qué", () => {
  function abrir(nombre: string) {
    fireEvent.click(within(celdaWebhook(nombre)).getByRole("button"));
    return screen.findByRole("dialog");
  }

  it("la dueña, activo: probar y pausar; nada de reanudar", async () => {
    servidor = () => Promise.resolve(lista([llave("act", { webhook: webhook({ api_key_id: "act" }) })]));
    montar();
    await screen.findByText("Key act");
    const d = await abrir("Key act");
    expect(within(d).getByRole("button", { name: /Send test/ })).toBeTruthy();
    expect(within(d).getByRole("button", { name: /Pause/ })).toBeTruthy();
    expect(within(d).queryByRole("button", { name: /Resume/ })).toBeNull();
    expect(within(d).getByText("hooks.example.com")).toBeTruthy();
    expect(within(d).getByText("whsec_…9f3a")).toBeTruthy();
    expect(enEspanol(d)).toEqual([]);
  });

  it("otra admin: pausar y borrar sí; probar y reanudar no (y se dice por qué)", async () => {
    servidor = (b) => b.action === "list"
      ? Promise.resolve(lista([
        llave("act", { acts_as: { id: OTRA, name: "Someone Else", active: true }, webhook: webhook({ api_key_id: "act" }) }),
      ]))
      : Promise.resolve({ webhook: webhook({ api_key_id: "act", status: "paused" }) });
    montar();
    await screen.findByText("Key act");
    const d = await abrir("Key act");
    expect(within(d).queryByRole("button", { name: /Send test/ })).toBeNull();
    expect(within(d).getByText(/Only this person can register, test or resume it/)).toBeTruthy();
    // La tarjeta de la persona, como en los modales de Maven: su muñequito y su nombre.
    expect(munequito(d, "Someone Else")).toBeTruthy();
    fireEvent.click(within(d).getByRole("button", { name: /Pause/ }));
    await waitFor(() => expect(llamadas.find((l) => l.action === "webhook_pause")).toEqual({ action: "webhook_pause", lang: "en", id: "w-act" }));
    expect(enEspanol(d)).toEqual([]);
  });

  it("pausado: la dueña reanuda; otra admin no", async () => {
    servidor = () => Promise.resolve(lista([
      llave("mia", { webhook: webhook({ api_key_id: "mia", status: "paused", paused_at: "2026-09-26T10:00:00Z", paused_by: { id: OTRA, name: "Someone Else" } }) }),
      llave("ajena", { acts_as: { id: OTRA, name: "Someone Else", active: true }, webhook: webhook({ api_key_id: "ajena", status: "paused" }) }),
    ]));
    montar();
    await screen.findByText("Key mia");
    let d = await abrir("Key mia");
    expect(within(d).getByRole("button", { name: /Resume/ })).toBeTruthy();
    expect(within(d).queryByRole("button", { name: /Pause/ })).toBeNull();
    expect(within(d).getByText(/^paused it on /)).toBeTruthy();
    expect(within(d).getByText(/That's you, the key's person/)).toBeTruthy();
    // Dos caras: la de la persona de la key (yo) y la de quien lo pausó.
    expect(munequito(d, "Alvaro Mejia")).toBeTruthy();
    expect(munequito(d, "Someone Else")).toBeTruthy();
    expect(ultimo(carasPedidas)).toEqual(expect.arrayContaining([YO, OTRA]));
    fireEvent.keyDown(d, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    d = await abrir("Key ajena");
    expect(within(d).queryByRole("button", { name: /Resume/ })).toBeNull();
  });

  it("detenido: se explica el motivo; reanudar solo si tiene vuelta", async () => {
    servidor = () => Promise.resolve(lista([
      llave("a", { webhook: webhook({ api_key_id: "a", status: "disabled", disabled_reason: "receiver_failing", disabled_at: "2026-09-25T00:00:00Z" }) }),
      llave("b", { status: "revoked", webhook: webhook({ api_key_id: "b", status: "disabled", disabled_reason: "key_revoked" }) }),
    ]));
    montar();
    await screen.findByText("Key a");
    let d = await abrir("Key a");
    expect(within(d).getByText(/It failed for 3 days in a row/)).toBeTruthy();
    expect(within(d).getByRole("button", { name: /Resume/ })).toBeTruthy();
    fireEvent.keyDown(d, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    d = await abrir("Key b");
    expect(within(d).getByText(/The key was revoked/)).toBeTruthy();
    expect(within(d).queryByRole("button", { name: /Resume/ })).toBeNull();
    expect(within(d).getByRole("button", { name: /Delete/ })).toBeTruthy();
    expect(enEspanol(d)).toEqual([]);
  });

  it("borrar pide confirmación y recién ahí manda", async () => {
    let tiene = true;
    servidor = (b) => {
      if (b.action === "list") return Promise.resolve(lista([llave("act", { webhook: tiene ? webhook({ api_key_id: "act" }) : null })]));
      tiene = false;
      return Promise.resolve({ success: true, id: "w-act" });
    };
    montar();
    await screen.findByText("Key act");
    const d = await abrir("Key act");
    fireEvent.click(within(d).getByRole("button", { name: /Delete/ }));
    const confirma = await screen.findByRole("alertdialog");
    expect(llamadas.some((l) => l.action === "webhook_delete")).toBe(false);
    expect(within(confirma).getByText(/Maven stops notifying hooks.example.com/)).toBeTruthy();
    expect(enEspanol(confirma)).toEqual([]);
    fireEvent.click(within(confirma).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(llamadas.find((l) => l.action === "webhook_delete")).toEqual({ action: "webhook_delete", lang: "en", id: "w-act" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(within(celdaWebhook("Key act")).getByRole("button", { name: /Register/ })).toBeTruthy());
  });

  it("un fallo del intento se lee en palabras, no como código", async () => {
    servidor = () => Promise.resolve(lista([
      llave("fall", { webhook: webhook({ api_key_id: "fall", consecutive_failures: 4, failing_since: "2026-09-26T08:00:00Z", last_error: "http_503", last_status_code: 503 }) }),
    ]));
    montar();
    await screen.findByText("Key fall");
    const d = await abrir("Key fall");
    expect(within(d).getByText("The server answered 503")).toBeTruthy();
    expect(within(d).getByText(/The integrator's server is failing/)).toBeTruthy();
    expect(within(d).getByText(/^4, since /)).toBeTruthy();
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
    fireEvent.click(within(celdaWebhook("Key act")).getByRole("button"));
    const d = await screen.findByRole("dialog");
    expect(llamadas.some((l) => l.action === "webhook_deliveries")).toBe(false);
    const pestana = within(d).getByRole("tab", { name: "Deliveries" });
    fireEvent.mouseDown(pestana);
    fireEvent.click(pestana);
    expect(await within(d).findByText("Delivered · 200")).toBeTruthy();
    expect(llamadas.find((l) => l.action === "webhook_deliveries")).toEqual({ action: "webhook_deliveries", lang: "en", id: "w-act", only_failed: false });
    expect(within(d).getByText(/^Retrying /)).toBeTruthy();
    expect(within(d).getByText("Didn't answer in time")).toBeTruthy();
    expect(within(d).getByText("Dropped: the test wasn't delivered")).toBeTruthy();
    expect(within(d).getByText("Invalid HTTPS certificate")).toBeTruthy();
    expect(within(d).getByText("Dropped: another reason")).toBeTruthy();
    expect(within(d).getAllByText(/It was cut off after sending/).length).toBeGreaterThan(0);
    expect(enEspanol(d)).toEqual([]);
    fireEvent.click(within(d).getByLabelText("Only the ones not delivered"));
    await waitFor(() => expect(ultimo(llamadas.filter((l) => l.action === "webhook_deliveries"))).toMatchObject({ only_failed: true }));
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

describe("los códigos en palabras", () => {
  const t = ((k: string, p?: Record<string, string | number>) => (p ? `${k} ${JSON.stringify(p)}` : k)) as never;
  it("http_<n>, las clases conocidas, maven_* y uno desconocido", () => {
    expect(textoDelError(null, t)).toBeNull();
    expect(textoDelError("http_503", t)).toBe('apiKeys.webhook.err.http {"code":"503"}');
    expect(textoDelError("dns", t)).toBe("apiKeys.webhook.err.dns");
    expect(textoDelError("maven_secreto", t)).toBe("apiKeys.webhook.err.maven_secreto");
    expect(textoDelError("maven_base", t)).toBe("apiKeys.webhook.err.maven");
    expect(textoDelError("maven_plazo", t)).toBe("apiKeys.webhook.err.maven");
    expect(textoDelError("algo_raro", t)).toBe("algo_raro");
  });
  it("el chip: 'fallando' solo con fallos del receptor", () => {
    expect(chipDelWebhook(webhook() as never).texto).toBe("apiKeys.webhook.state.active");
    expect(chipDelWebhook(webhook({ consecutive_failures: 1 }) as never).texto).toBe("apiKeys.webhook.state.failing");
    expect(chipDelWebhook(webhook({ status: "disabled" }) as never).variant).toBe("destructive-soft");
  });
});
