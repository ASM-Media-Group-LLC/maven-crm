// Entrar aguanta el cambio de turno (simulacro 19/11/2026: 1.000 entradas en
// un minuto, solo entró el 3 % por el 429 de Supabase). Ver
// lib/entrarConPaciencia.ts.
import { describe, it, expect, vi } from "vitest";
import {
  entrarConReintentos,
  esReintentableAlEntrar,
  esperaDelIntento,
  protegerRenovacion,
  PRESUPUESTO_ENTRADA_MS,
} from "@/lib/entrarConPaciencia";

const fuentes = import.meta.glob(
  ["../pages/Login.tsx", "../integrations/supabase/client.ts"],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

const LIMITE = { name: "AuthApiError", status: 429, code: "over_request_rate_limit", message: "Request rate limit reached" };
const CLAVE_MALA = { name: "AuthApiError", status: 400, code: "invalid_credentials", message: "Invalid login credentials" };
const GRANT_MALO = { name: "AuthApiError", status: 400, message: "invalid_grant" };

/** Un reloj de mentira: dormir solo adelanta el reloj. */
function reloj() {
  let t = 0;
  return { ahora: () => t, dormir: vi.fn(async (ms: number) => { t += ms; }) };
}

describe("qué se reintenta al entrar", () => {
  it("429, 5xx y red sí", () => {
    expect(esReintentableAlEntrar(LIMITE)).toBe(true);
    expect(esReintentableAlEntrar({ status: 429 })).toBe(true);
    expect(esReintentableAlEntrar({ status: 500 })).toBe(true);
    expect(esReintentableAlEntrar({ status: 503, name: "AuthRetryableFetchError" })).toBe(true);
    expect(esReintentableAlEntrar({ status: 0, name: "AuthRetryableFetchError", message: "Failed to fetch" })).toBe(true);
    expect(esReintentableAlEntrar({ name: "AuthUnknownError", message: "Unexpected token <" })).toBe(true);
  });

  it("contraseña mala (400 invalid_grant / invalid_credentials) nunca", () => {
    expect(esReintentableAlEntrar(CLAVE_MALA)).toBe(false);
    expect(esReintentableAlEntrar(GRANT_MALO)).toBe(false);
    expect(esReintentableAlEntrar({ status: 400, code: "email_not_confirmed" })).toBe(false);
    expect(esReintentableAlEntrar({ status: 422 })).toBe(false);
    expect(esReintentableAlEntrar(null)).toBe(false);
  });

  it("las esperas crecen 1 s, 2 s, 4 s, 8 s con azar y tope", () => {
    const medio = () => 0.5;
    expect([0, 1, 2, 3, 4, 9].map((n) => esperaDelIntento(n, medio))).toEqual([1000, 2000, 4000, 8000, 8000, 8000]);
    expect(esperaDelIntento(0, () => 0)).toBe(500);
    expect(esperaDelIntento(3, () => 0.999)).toBeLessThanOrEqual(12_000);
  });
});

describe("entrarConReintentos", () => {
  it("con 429 reintenta, avisa y entra cuando el servidor deja", async () => {
    const r = reloj();
    const intentar = vi.fn()
      .mockResolvedValueOnce({ error: LIMITE })
      .mockResolvedValueOnce({ error: { status: 502, name: "AuthRetryableFetchError" } })
      .mockResolvedValueOnce({ error: null, data: "sesión" });
    const alReintentar = vi.fn();
    const res = await entrarConReintentos(intentar, { ...r, azar: () => 0.5, alReintentar });
    expect(res).toEqual({ error: null, data: "sesión" });
    expect(intentar).toHaveBeenCalledTimes(3);
    expect(alReintentar).toHaveBeenCalledTimes(2);
    expect(r.dormir.mock.calls.map((c) => c[0])).toEqual([1000, 2000]);
  });

  it("con la contraseña mala no reintenta: una sola llamada", async () => {
    const r = reloj();
    const intentar = vi.fn().mockResolvedValue({ error: CLAVE_MALA });
    const alReintentar = vi.fn();
    const res = await entrarConReintentos(intentar, { ...r, alReintentar });
    expect(res.error).toBe(CLAVE_MALA);
    expect(intentar).toHaveBeenCalledTimes(1);
    expect(alReintentar).not.toHaveBeenCalled();
    expect(r.dormir).not.toHaveBeenCalled();
  });

  it("con 429 sin fin se rinde a los ~30 s y devuelve el 429", async () => {
    const r = reloj();
    const intentar = vi.fn().mockResolvedValue({ error: LIMITE });
    const res = await entrarConReintentos(intentar, { ...r, azar: () => 0.5 });
    expect(res.error).toBe(LIMITE);
    expect(r.ahora()).toBeLessThanOrEqual(PRESUPUESTO_ENTRADA_MS);
    expect(intentar.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it("una excepción de red cuenta como error de red y se reintenta", async () => {
    const r = reloj();
    const intentar = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({ error: null });
    const res = await entrarConReintentos(intentar, r);
    expect(res.error).toBeNull();
    expect(intentar).toHaveBeenCalledTimes(2);
  });
});

describe("protegerRenovacion (la renovación con 429 no saca a nadie)", () => {
  const RENOVAR = "https://x.supabase.co/auth/v1/token?grant_type=refresh_token";
  const ENTRAR = "https://x.supabase.co/auth/v1/token?grant_type=password";
  const resp = (status: number) => new Response(JSON.stringify({ msg: "x" }), { status, headers: { "content-type": "application/json" } });

  it("429 y 500 de la renovación llegan a supabase-js como 503 (lo reintenta sin borrar la sesión), tras esperar al azar", async () => {
    const dormir = vi.fn(async () => {});
    for (const s of [429, 500]) {
      const f = protegerRenovacion(vi.fn(async () => resp(s)) as unknown as typeof fetch, { dormir, azar: () => 0.5 });
      const r = await f(RENOVAR, { method: "POST", body: "{}" });
      expect(r.status).toBe(503);
    }
    expect(dormir).toHaveBeenCalled();
  });

  it("400 de la renovación (token revocado) pasa tal cual", async () => {
    const dormir = vi.fn(async () => {});
    const f = protegerRenovacion(vi.fn(async () => resp(400)) as unknown as typeof fetch, { dormir });
    expect((await f(RENOVAR, { method: "POST" })).status).toBe(400);
    expect(dormir).not.toHaveBeenCalled();
  });

  it("la entrada con contraseña y el resto de pedidos no se tocan", async () => {
    const dormir = vi.fn(async () => {});
    const f = protegerRenovacion(vi.fn(async () => resp(429)) as unknown as typeof fetch, { dormir });
    expect((await f(ENTRAR, { method: "POST" })).status).toBe(429);
    expect((await f("https://x.supabase.co/rest/v1/profiles", {})).status).toBe(429);
    expect(dormir).not.toHaveBeenCalled();
  });
});

describe("las piezas están puestas", () => {
  it("Login entra con reintentos y avisa con calma", () => {
    const login = fuentes["../pages/Login.tsx"];
    expect(login).toMatch(/entrarConReintentos\(/);
    expect(login).toMatch(/auth\.muchaGenteReintentando/);
  });

  it("el cliente de Supabase protege la renovación", () => {
    expect(fuentes["../integrations/supabase/client.ts"]).toMatch(/protegerRenovacion\(/);
  });
});
