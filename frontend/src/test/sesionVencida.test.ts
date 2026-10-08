// Una sesión vencida no deja a nadie con el spinner (07/10/2026: el reloj
// atrasado de un computador lo dejó 2 h y media sin Maven). Ver
// lib/sesionVencida.ts.
import { describe, it, expect, vi } from "vitest";
import {
  conSesionRenovada,
  crearRenovador,
  ESPERA_ENTRE_RENOVACIONES_MS,
  rolDelToken,
  tokenDeSesion,
  type AuthParaRenovar,
} from "@/lib/sesionVencida";
import fuenteDelCliente from "@/integrations/supabase/client.ts?raw";

const b64url = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const jwt = (carga: Record<string, unknown>) => `${b64url({ alg: "HS256" })}.${b64url(carga)}.firma`;
const VIEJO = jwt({ role: "authenticated", sub: "u1", exp: 1 });
const NUEVO = jwt({ role: "authenticated", sub: "u1", exp: 2 });
const ANON = jwt({ role: "anon" });

const REST = "https://x.supabase.co/rest/v1/user_roles?select=role";
const con = (token: string, extra: RequestInit = {}): RequestInit => ({
  ...extra,
  headers: { apikey: "sb_publishable_x", Authorization: `Bearer ${token}`, ...(extra.headers as Record<string, string> | undefined) },
});

/** Un fetch de mentira que responde lo que le toque en orden y anota qué recibió. */
function fetchFalso(...estados: number[]) {
  const recibidos: { url: string; auth: string | null; metodo: string; cuerpo: unknown }[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : null;
    const headers = new Headers(init?.headers ?? req?.headers);
    recibidos.push({
      url: typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      auth: headers.get("Authorization"),
      metodo: init?.method ?? req?.method ?? "GET",
      cuerpo: init?.body ?? (req ? await req.text() : undefined),
    });
    const estado = estados[Math.min(recibidos.length - 1, estados.length - 1)];
    return new Response(estado === 401 ? '{"code":"PGRST303","message":"JWT expired"}' : "[]", { status: estado });
  });
  return { fn: fn as unknown as typeof fetch, recibidos, llamadas: () => fn.mock.calls.length };
}

describe("el token de la persona", () => {
  it("reconoce una sesión y deja afuera la llave publicable y el anónimo", () => {
    expect(rolDelToken(VIEJO)).toBe("authenticated");
    expect(rolDelToken(ANON)).toBe("anon");
    expect(rolDelToken("sb_publishable_hEuAcbx")).toBeNull();
    expect(rolDelToken("a.%%%.c")).toBeNull();
    expect(tokenDeSesion(new Headers({ Authorization: `Bearer ${VIEJO}` }))).toBe(VIEJO);
    expect(tokenDeSesion(new Headers({ Authorization: "Bearer sb_publishable_x" }))).toBeNull();
    expect(tokenDeSesion(new Headers({ Authorization: `Bearer ${ANON}` }))).toBeNull();
    expect(tokenDeSesion(new Headers())).toBeNull();
  });
});

describe("una consulta rechazada por la sesión vencida se repite con la sesión renovada", () => {
  it("401 → renueva y repite UNA vez con el token nuevo", async () => {
    const f = fetchFalso(401, 200);
    const renovar = vi.fn(async () => NUEVO);
    const r = await conSesionRenovada(f.fn, renovar)(REST, con(VIEJO));
    expect(r.status).toBe(200);
    expect(renovar).toHaveBeenCalledWith(VIEJO);
    expect(f.recibidos.map((x) => x.auth)).toEqual([`Bearer ${VIEJO}`, `Bearer ${NUEVO}`]);
  });

  it("lo demás pasa derecho, sin renovar", async () => {
    for (const estado of [200, 403, 404, 500]) {
      const f = fetchFalso(estado);
      const renovar = vi.fn(async () => NUEVO);
      const r = await conSesionRenovada(f.fn, renovar)(REST, con(VIEJO));
      expect(r.status).toBe(estado);
      expect(renovar).not.toHaveBeenCalled();
      expect(f.llamadas()).toBe(1);
    }
  });

  it("si el repetido también da 401, se entrega ese: nunca más de un reintento", async () => {
    const f = fetchFalso(401, 401, 401);
    const r = await conSesionRenovada(f.fn, async () => NUEVO)(REST, con(VIEJO));
    expect(r.status).toBe(401);
    expect(f.llamadas()).toBe(2);
  });

  it("si no se pudo renovar (o es el mismo token), se entrega el 401 original", async () => {
    for (const devuelve of [null, VIEJO]) {
      const f = fetchFalso(401, 200);
      const r = await conSesionRenovada(f.fn, async () => devuelve)(REST, con(VIEJO));
      expect(r.status).toBe(401);
      expect(f.llamadas()).toBe(1);
    }
  });

  it("⚠️ /auth/ no se toca: ahí vive la propia renovación (daría vueltas sobre sí misma)", async () => {
    const f = fetchFalso(401, 200);
    const renovar = vi.fn(async () => NUEVO);
    const envuelto = conSesionRenovada(f.fn, renovar);
    await envuelto("https://x.supabase.co/auth/v1/user", con(VIEJO));
    await envuelto("https://x.supabase.co/auth/v1/token?grant_type=refresh_token", { method: "POST" });
    expect(renovar).not.toHaveBeenCalled();
    expect(f.llamadas()).toBe(2);
  });

  it("sin sesión (llave publicable o anónimo) un 401 no se arregla renovando", async () => {
    for (const token of ["sb_publishable_x", ANON]) {
      const f = fetchFalso(401, 200);
      const renovar = vi.fn(async () => NUEVO);
      const r = await conSesionRenovada(f.fn, renovar)(REST, con(token));
      expect(r.status).toBe(401);
      expect(renovar).not.toHaveBeenCalled();
    }
  });

  it("el reintento lleva el mismo método, cuerpo y demás headers; las funciones también", async () => {
    const f = fetchFalso(401, 200);
    const url = "https://x.supabase.co/functions/v1/drive";
    await conSesionRenovada(f.fn, async () => NUEVO)(url, con(VIEJO, { method: "POST", body: '{"action":"abrir"}', headers: { "x-extra": "1" } }));
    expect(f.recibidos[1]).toMatchObject({ url, metodo: "POST", cuerpo: '{"action":"abrir"}', auth: `Bearer ${NUEVO}` });
  });

  it("un Request con cuerpo se copia antes de mandarlo (se gasta al mandarlo)", async () => {
    const f = fetchFalso(401, 200);
    const req = new Request(REST, { method: "POST", body: '{"a":1}', headers: { Authorization: `Bearer ${VIEJO}` } });
    const r = await conSesionRenovada(f.fn, async () => NUEVO)(req);
    expect(r.status).toBe(200);
    expect(f.recibidos.map((x) => x.cuerpo)).toEqual(['{"a":1}', '{"a":1}']);
    expect(f.recibidos[1].auth).toBe(`Bearer ${NUEVO}`);
  });

  it("un cuerpo que es un flujo no se puede repetir: pasa derecho", async () => {
    const f = fetchFalso(401, 200);
    const renovar = vi.fn(async () => NUEVO);
    const flujo = new ReadableStream({ start: (c) => { c.enqueue(new Uint8Array([1])); c.close(); } });
    const r = await conSesionRenovada(f.fn, renovar)(REST, con(VIEJO, { method: "POST", body: flujo }));
    expect(r.status).toBe(401);
    expect(renovar).not.toHaveBeenCalled();
  });
});

function authFalso(inicial: string | null) {
  let actual = inicial;
  let resolver: (() => void) | null = null;
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: actual ? { access_token: actual } : null } })),
    refreshSession: vi.fn(
      () =>
        new Promise<{ data: { session: { access_token: string } | null }; error: unknown }>((ok) => {
          resolver = () => {
            actual = actual === VIEJO ? NUEVO : jwt({ role: "authenticated", n: Math.random() });
            ok({ data: { session: { access_token: actual } }, error: null });
          };
        }),
    ),
  };
  return { auth: auth as AuthParaRenovar & typeof auth, terminar: () => resolver?.() };
}

describe("el renovador: una sola renovación a la vez", () => {
  it("20 consultas rechazadas juntas → UNA renovación, y todas reciben el token nuevo", async () => {
    const { auth, terminar } = authFalso(VIEJO);
    const renovar = crearRenovador(auth, () => 0);
    const pedidos = Array.from({ length: 20 }, () => renovar(VIEJO));
    await new Promise((r) => setTimeout(r, 0));
    terminar();
    expect(await Promise.all(pedidos)).toEqual(Array(20).fill(NUEVO));
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
  });

  it("si otra consulta (u otra pestaña) ya renovó, se usa ese token sin pedir otro", async () => {
    const { auth } = authFalso(NUEVO);
    expect(await crearRenovador(auth)(VIEJO)).toBe(NUEVO);
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });

  it("sin sesión no hay nada que renovar", async () => {
    const { auth } = authFalso(null);
    expect(await crearRenovador(auth)(VIEJO)).toBeNull();
    expect(auth.refreshSession).not.toHaveBeenCalled();
  });

  it("como mucho una vez por minuto: un 401 que no era por la sesión no renueva en cada consulta", async () => {
    let reloj = 0;
    const { auth, terminar } = authFalso(VIEJO);
    const renovar = crearRenovador(auth, () => reloj);
    const p = renovar(VIEJO);
    await new Promise((r) => setTimeout(r, 0));
    terminar();
    const ya = await p;
    expect(ya).toBe(NUEVO);
    // El token nuevo vuelve con 401 (era otra cosa): dentro del minuto, nada.
    reloj = ESPERA_ENTRE_RENOVACIONES_MS - 1;
    expect(await renovar(NUEVO)).toBeNull();
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    // Pasado el minuto, sí.
    reloj = ESPERA_ENTRE_RENOVACIONES_MS + 1;
    const q = renovar(NUEVO);
    await new Promise((r) => setTimeout(r, 0));
    terminar();
    expect(await q).not.toBeNull();
    expect(auth.refreshSession).toHaveBeenCalledTimes(2);
  });

  it("si la renovación falla, null (y se entrega el 401 original)", async () => {
    const auth: AuthParaRenovar = {
      getSession: async () => ({ data: { session: { access_token: VIEJO } } }),
      refreshSession: async () => ({ data: { session: null }, error: new Error("refresh_token_not_found") }),
    };
    expect(await crearRenovador(auth)(VIEJO)).toBeNull();
    const roto: AuthParaRenovar = { ...auth, refreshSession: async () => { throw new Error("sin red"); } };
    expect(await crearRenovador(roto)(VIEJO)).toBeNull();
  });
});

describe("el cliente de Supabase lo usa", () => {
  it("el fetch del cliente está envuelto (si alguien lo saca, vuelve el spinner eterno)", () => {
    expect(fuenteDelCliente).toMatch(/global:\s*\{\s*fetch:\s*conSesionRenovada\(/);
    expect(fuenteDelCliente).toMatch(/crearRenovador\(supabase\.auth\)/);
  });
});
