import { describe, it, expect, vi } from "vitest";
import {
  CLAVE_CORREO, CLAVE_DESTINO, configDelEdificio, destinoDeRespuesta, destinoGuardado, elegirConexion,
  guardarDestino, olvidarDestino, preguntarDirectorio, puertaActiva, valorDeEnv,
} from "@/lib/puerta";
import { accionDePago, planDeLaUrl, registrarEmpresa } from "@/lib/cobros";

// LA PUERTA (vagón 7, 19/11/2026): app.maven-ai.me manda a Kash o al edificio.
// Lo que NO se puede romper: con la bandera apagada (lo de hoy), TODO va a Kash, sin
// preguntar nada, aunque el navegador tenga guardado «edificio». Kash es siempre el
// valor por defecto: un fallo del directorio no saca a nadie de Kash.

const KASH = { url: "https://lsagslbkliprespbyhts.supabase.co", llave: "sb_publishable_kash" };
const EDIFICIO_URL = "https://ezeigddgkaemxpshghmu.supabase.co";
const PRENDIDA = { VITE_PUERTA_EDIFICIO: "1", VITE_EDIFICIO_URL: EDIFICIO_URL, VITE_EDIFICIO_ANON_KEY: "sb_publishable_edificio" };

function almacen(inicial: Record<string, string> = {}) {
  const m = new Map(Object.entries(inicial));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    m,
  };
}

describe("bandera apagada → siempre Kash", () => {
  const apagadas = [
    {},
    { VITE_PUERTA_EDIFICIO: "0", VITE_EDIFICIO_URL: EDIFICIO_URL, VITE_EDIFICIO_ANON_KEY: "x" },
    // Producción hoy: el marcador del contenedor sin reemplazar.
    { VITE_PUERTA_EDIFICIO: "__RUNTIME_VITE_PUERTA_EDIFICIO__", VITE_EDIFICIO_URL: "__RUNTIME_VITE_EDIFICIO_URL__", VITE_EDIFICIO_ANON_KEY: "__RUNTIME_VITE_EDIFICIO_ANON_KEY__" },
    // Prendida pero sin dirección o llave: no hay puerta.
    { VITE_PUERTA_EDIFICIO: "1" },
    { VITE_PUERTA_EDIFICIO: "1", VITE_EDIFICIO_URL: EDIFICIO_URL },
    { VITE_PUERTA_EDIFICIO: "1", VITE_EDIFICIO_URL: "http://inseguro.test", VITE_EDIFICIO_ANON_KEY: "x" },
    // Si por error «el edificio» es Kash, tampoco.
    { VITE_PUERTA_EDIFICIO: "1", VITE_EDIFICIO_URL: KASH.url, VITE_EDIFICIO_ANON_KEY: "x" },
  ];
  it.each(apagadas.map((e, i) => [i, e] as const))("caso %i: Kash aunque el navegador diga «edificio»", (_i, env) => {
    const a = almacen({ [CLAVE_DESTINO]: "edificio" });
    expect(puertaActiva(env)).toBe(false);
    expect(destinoGuardado(env, a)).toBe("kash");
    expect(elegirConexion(env, a, KASH)).toEqual({ destino: "kash", ...KASH });
  });

  it("y ni siquiera le pregunta al directorio", async () => {
    const f = vi.fn();
    expect(await preguntarDirectorio("ana@acme.com", {}, f as unknown as typeof fetch)).toBe("kash");
    expect(f).not.toHaveBeenCalled();
  });

  it("el marcador del contenedor no cuenta como valor", () => {
    expect(valorDeEnv("__RUNTIME_VITE_PUERTA_EDIFICIO__")).toBeNull();
    expect(valorDeEnv("")).toBeNull();
    expect(valorDeEnv("1")).toBe("1");
  });
});

describe("bandera prendida", () => {
  it("sin elección guardada, Kash; con «edificio», el edificio", () => {
    expect(elegirConexion(PRENDIDA, almacen(), KASH).destino).toBe("kash");
    expect(elegirConexion(PRENDIDA, null, KASH).destino).toBe("kash");
    expect(elegirConexion(PRENDIDA, almacen({ [CLAVE_DESTINO]: "edificio" }), KASH)).toEqual({
      destino: "edificio", url: EDIFICIO_URL, llave: "sb_publishable_edificio",
    });
    expect(configDelEdificio({ ...PRENDIDA, VITE_EDIFICIO_URL: `${EDIFICIO_URL}/` })?.url).toBe(EDIFICIO_URL);
  });

  it("el directorio decide: sí → edificio, no → Kash, error → Kash", async () => {
    const responde = (status: number, cuerpo: unknown) =>
      vi.fn(async () => new Response(JSON.stringify(cuerpo), { status })) as unknown as typeof fetch;
    expect(await preguntarDirectorio("ana@acme.com", PRENDIDA, responde(200, { edificio: true }))).toBe("edificio");
    expect(await preguntarDirectorio("ana@acme.com", PRENDIDA, responde(200, { edificio: false }))).toBe("kash");
    expect(await preguntarDirectorio("ana@acme.com", PRENDIDA, responde(429, { error: "demasiados_intentos" }))).toBe("error");
    expect(await preguntarDirectorio("ana@acme.com", PRENDIDA, responde(200, { raro: 1 }))).toBe("error");
    const cae = vi.fn(async () => { throw new Error("red"); }) as unknown as typeof fetch;
    expect(await preguntarDirectorio("ana@acme.com", PRENDIDA, cae)).toBe("error");
    expect(destinoDeRespuesta("error")).toBe("kash");
    expect(destinoDeRespuesta("edificio")).toBe("edificio");
  });

  it("pregunta al directorio del EDIFICIO con su llave pública, solo con el correo", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ edificio: false }), { status: 200 }));
    await preguntarDirectorio("  Ana@Acme.com ", PRENDIDA, f as unknown as typeof fetch);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${EDIFICIO_URL}/functions/v1/directorio`);
    expect(JSON.parse(String(init.body))).toEqual({ correo: "ana@acme.com" });
    expect((init.headers as Record<string, string>).apikey).toBe("sb_publishable_edificio");
  });

  it("recordar y olvidar la elección", () => {
    const a = almacen();
    guardarDestino(a, "edificio", " Ana@Acme.com ");
    expect(a.m.get(CLAVE_DESTINO)).toBe("edificio");
    expect(a.m.get(CLAVE_CORREO)).toBe("ana@acme.com");
    guardarDestino(a, "kash", "otro@kash.com");
    expect(a.m.has(CLAVE_DESTINO)).toBe(false);
    olvidarDestino(a);
    expect(a.m.size).toBe(0);
    // Un almacenamiento que tira (navegación privada): no rompe, queda Kash.
    const roto = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); }, removeItem: () => { throw new Error("x"); } };
    expect(() => guardarDestino(roto, "edificio", "a@b.co")).not.toThrow();
    expect(destinoGuardado(PRENDIDA, roto)).toBe("kash");
  });
});

describe("registro y pago", () => {
  it("el plan sale de la dirección (equipo por defecto)", () => {
    expect(planDeLaUrl("?plan=empresa")).toBe("empresa");
    expect(planDeLaUrl("?plan=enterprise")).toBe("equipo");
    expect(planDeLaUrl("")).toBe("equipo");
  });

  it("registrarEmpresa: sin puerta no llama a nadie; con puerta va a cobros-stripe del edificio", async () => {
    const datos = { plan: "equipo" as const, empresa: "Acme", nombre: "Ana", correo: "ana@acme.com", contrasena: "12345678", idioma: "es" };
    const f = vi.fn(async () => new Response(JSON.stringify({ ok: true, url: "https://checkout.stripe.com/c/pay/cs_1" }), { status: 200 }));
    expect(await registrarEmpresa(datos, {}, f as unknown as typeof fetch)).toEqual({ ok: false, error: "cobros_sin_preparar" });
    expect(f).not.toHaveBeenCalled();
    expect(await registrarEmpresa(datos, PRENDIDA, f as unknown as typeof fetch)).toEqual({ ok: true, url: "https://checkout.stripe.com/c/pay/cs_1" });
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe(`${EDIFICIO_URL}/functions/v1/cobros-stripe`);
    const usado = vi.fn(async () => new Response(JSON.stringify({ error: "correo_en_uso" }), { status: 409 }));
    expect(await registrarEmpresa(datos, PRENDIDA, usado as unknown as typeof fetch)).toEqual({ ok: false, error: "correo_en_uso" });
    const raro = vi.fn(async () => new Response(JSON.stringify({ error: "algo_interno" }), { status: 500 }));
    expect(await registrarEmpresa(datos, PRENDIDA, raro as unknown as typeof fetch)).toEqual({ ok: false, error: "general" });
  });

  it("el botón de pago: tarjeta si falta, portal si el pago falló; nada para quien no es admin", () => {
    expect(accionDePago({ bloqueada: true, motivo: "falta_tarjeta", puedo_pagar: true })).toBe("checkout-registro");
    expect(accionDePago({ bloqueada: true, motivo: "pago", puedo_pagar: true })).toBe("portal");
    expect(accionDePago({ bloqueada: true, motivo: "pago", puedo_pagar: true, estado_pago: "cancelada" })).toBe("checkout-registro");
    expect(accionDePago({ bloqueada: false, en_gracia: true, puedo_pagar: true })).toBe("portal");
    expect(accionDePago({ bloqueada: true, motivo: "pago", puedo_pagar: false })).toBeNull();
    expect(accionDePago({ bloqueada: true, motivo: "pausada", puedo_pagar: true })).toBeNull();
  });
});
