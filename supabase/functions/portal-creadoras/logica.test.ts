// portal-creadoras: quién da y quita el acceso al portal, y qué hace cada acción.
//
//   deno test supabase/functions/portal-creadoras/logica.test.ts
//
// Sin red: los puertos son dobles. La base de verdad (creadora_cuentas, sus
// reglas y su RLS) se prueba en supabase/tests/portal_creadoras.ts.
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { correo, escapar, manejar, normalizarCorreo, ocultarCorreo, type Puertos, remitente } from "./logica.ts";

const T1 = "t-asm", T2 = "t-otra";
const C1 = "c0000000-0000-4000-8000-000000000001"; // Sofi, en asm-tech, la ve Mario
const C2 = "c0000000-0000-4000-8000-000000000002"; // Dos, en asm-tech, Mario no la ve
const D1 = "c0000000-0000-4000-8000-000000000011"; // Sofi en la otra agencia

interface Persona { id: string; esCreadora: boolean; ve: string[]; invita: boolean; agencia: string | null }
const GENTE: Record<string, Persona> = {
  "tok-mario": { id: "u-mario", esCreadora: false, ve: [C1], invita: true, agencia: T1 },
  "tok-ana": { id: "u-ana", esCreadora: false, ve: [C1], invita: false, agencia: T1 }, // chatter: ve, no invita
  "tok-sofi": { id: "u-sofi", esCreadora: true, ve: [], invita: false, agencia: null },
  "tok-raro": { id: "u-raro", esCreadora: false, ve: [D1], invita: true, agencia: T1 }, // la RLS dejaría ver D1, la agencia no
};

interface Cuentas { [creatorId: string]: { user_id: string; correo: string } }
function armar(o: { cuentas?: Cuentas; usuarios?: Record<string, { id: string; tipo: string; es_de_agencia: boolean; bloqueada?: boolean }>; errorAtar?: string; fichaCorreo?: string | null } = {}) {
  const cuentas: Cuentas = { ...(o.cuentas ?? {}) };
  const usuarios = { ...(o.usuarios ?? {}) };
  const log = {
    creadas: [] as string[], borradas: [] as string[], atadas: [] as string[], desatadas: [] as string[],
    bloqueos: [] as string[], desbloqueos: [] as string[], correos: [] as { para: string; asunto: string; html: string; remitente: string }[],
    historial: [] as string[], cambios: [] as string[],
  };
  const fichas: Record<string, { tenant_id: string; nombre: string; correo: string | null }> = {
    [C1]: { tenant_id: T1, nombre: "Sofi", correo: o.fichaCorreo === undefined ? "sofi.ficha@gmail.test" : o.fichaCorreo },
    [C2]: { tenant_id: T1, nombre: "Dos", correo: null },
    [D1]: { tenant_id: T2, nombre: "Sofi", correo: null },
  };
  const p: Puertos & { salida: string } = {
    appUrl: "https://app.test",
    salida: "Maven CRM <noreply@mail.test>",
    persona: (token) => Promise.resolve(GENTE[token] ? { id: GENTE[token].id, esCreadora: GENTE[token].esCreadora } : null),
    comoPersona: (token) => ({
      veCreadora: (id) => Promise.resolve(GENTE[token].ve.includes(id)),
      puedeInvitar: () => Promise.resolve(GENTE[token].invita),
    }),
    agenciaDe: (id) => Promise.resolve(Object.values(GENTE).find((g) => g.id === id)?.agencia ?? null),
    ficha: (id) => Promise.resolve(fichas[id] ?? null),
    nombreAgencia: (t) => Promise.resolve(t === T1 ? "ASM Tech" : "Otra"),
    cuentaDeFicha: (id) => Promise.resolve(cuentas[id] ? { ...cuentas[id], correo_visible: ocultarCorreo(cuentas[id].correo) } : null),
    fichasDeCuenta: (uid) => Promise.resolve(Object.values(cuentas).filter((c) => c.user_id === uid).length),
    cuentaPorCorreo: (c) => Promise.resolve(usuarios[c] ? { user_id: usuarios[c].id, tipo: usuarios[c].tipo, es_de_agencia: usuarios[c].es_de_agencia } : null),
    crearCuenta: (c) => { const id = `u-nueva-${log.creadas.length}`; log.creadas.push(c); usuarios[c] = { id, tipo: "creadora", es_de_agencia: false }; return Promise.resolve({ id }); },
    borrarCuenta: (uid) => { log.borradas.push(uid); return Promise.resolve(); },
    bloqueada: (uid) => Promise.resolve(Object.values(usuarios).some((u) => u.id === uid && u.bloqueada)),
    bloquear: (uid) => { log.bloqueos.push(uid); return Promise.resolve(); },
    desbloquear: (uid) => { log.desbloqueos.push(uid); return Promise.resolve(); },
    atar: (f) => {
      if (o.errorAtar) return Promise.resolve({ error: o.errorAtar });
      cuentas[f.creator_id] = { user_id: f.user_id, correo: f.correo }; log.atadas.push(`${f.user_id}→${f.creator_id} por ${f.invitada_por}`);
      return Promise.resolve({ error: null });
    },
    desatar: (id) => { delete cuentas[id]; log.desatadas.push(id); return Promise.resolve(); },
    cambiarCorreo: (uid, id, c) => { cuentas[id] = { user_id: uid, correo: c }; log.cambios.push(`${uid}:${c}`); return Promise.resolve({ error: null }); },
    enlaceContrasena: (c) => Promise.resolve(`https://supa.test/verify?token=xyz&email=${c}`),
    enviarCorreo: (c) => { log.correos.push(c); return Promise.resolve({ enviado: true, error: null }); },
    anotar: (id, uid, accion, antes, despues) => { log.historial.push(`${id}|${uid}|${accion}|${antes}|${despues}`); return Promise.resolve(); },
  };
  return { p, log, cuentas };
}

Deno.test("sin sesión, con sesión de creadora, acción o id raros: no", async () => {
  const { p, log } = armar();
  assertEquals((await manejar("", { accion: "invitar", creator_id: C1 }, p)).status, 401);
  assertEquals((await manejar("tok-falso", { accion: "invitar", creator_id: C1 }, p)).status, 401);
  assertEquals((await manejar("tok-sofi", { accion: "invitar", creator_id: C1 }, p)).body.error, "solo_equipo");
  assertEquals((await manejar("tok-mario", { accion: "borrar_todo", creator_id: C1 }, p)).body.error, "accion_desconocida");
  assertEquals((await manejar("tok-mario", { accion: "invitar", creator_id: "1; drop" }, p)).body.error, "creator_id_invalido");
  assertEquals(log.creadas.length + log.correos.length, 0);
});

Deno.test("quién: tiene que ver a la creadora, tener el permiso y ser de su agencia", async () => {
  const { p, log } = armar();
  assertEquals((await manejar("tok-mario", { accion: "invitar", creator_id: C2 }, p)).body.error, "no_existe");
  assertEquals((await manejar("tok-ana", { accion: "invitar", creator_id: C1 }, p)).body.error, "sin_permiso");
  assertEquals((await manejar("tok-raro", { accion: "invitar", creator_id: D1 }, p)).body.error, "no_existe");
  assertEquals(log.creadas.length + log.correos.length + log.atadas.length, 0);
});

Deno.test("invitar: crea la cuenta de creadora, la ata, manda el correo y lo anota", async () => {
  const { p, log } = armar();
  const res = await manejar("tok-mario", { accion: "invitar", creator_id: C1, correo: "  Sofi.Personal@Gmail.test " }, p);
  assertEquals(res.status, 200);
  assertEquals(res.body.correo_visible, "s•••@gmail.test");
  assertEquals(res.body.ya_tenia_cuenta, false);
  assertEquals(log.creadas, ["sofi.personal@gmail.test"]);
  assertEquals(log.atadas, [`u-nueva-0→${C1} por u-mario`]);
  assertEquals(log.correos.length, 1);
  assertEquals(log.correos[0].para, "sofi.personal@gmail.test");
  assertEquals(log.correos[0].asunto, "ASM Tech te invitó a tu espacio en Maven");
  assertEquals(log.correos[0].remitente, "ASM Tech vía Maven <noreply@mail.test>");
  assertStringIncludes(log.correos[0].html, "https://supa.test/verify?token=xyz");
  assertStringIncludes(log.correos[0].html, "Elegir mi contraseña");
  assertEquals(log.historial, [`${C1}|u-mario|portal_acceso:invitada|null|s•••@gmail.test`]);
});

Deno.test("invitar sin correo usa el de su ficha; sin ninguno o inválido, no", async () => {
  const a = armar();
  assertEquals((await manejar("tok-mario", { accion: "invitar", creator_id: C1 }, a.p)).status, 200);
  assertEquals(a.log.creadas, ["sofi.ficha@gmail.test"]);
  const b = armar({ fichaCorreo: null });
  assertEquals((await manejar("tok-mario", { accion: "invitar", creator_id: C1 }, b.p)).body.error, "sin_correo");
  assertEquals((await manejar("tok-mario", { accion: "invitar", creator_id: C1, correo: "no-es-correo" }, b.p)).body.error, "correo_invalido");
  assertEquals((await manejar("tok-mario", { accion: "invitar", creator_id: C1, correo: "a@b.c<script>" }, b.p)).body.error, "correo_invalido");
  assertEquals(b.log.creadas.length, 0);
});

Deno.test("invitar con el correo de alguien del equipo: nunca", async () => {
  const { p, log } = armar({ usuarios: {
    "jhon@maven.test": { id: "u-jhon", tipo: "", es_de_agencia: true },
    "rara@x.test": { id: "u-rara", tipo: "creadora", es_de_agencia: true },
  } });
  assertEquals((await manejar("tok-mario", { accion: "invitar", creator_id: C1, correo: "jhon@maven.test" }, p)).body.error, "correo_de_equipo");
  assertEquals((await manejar("tok-mario", { accion: "invitar", creator_id: C1, correo: "rara@x.test" }, p)).body.error, "correo_de_equipo");
  assertEquals(log.creadas.length + log.atadas.length + log.correos.length, 0);
});

Deno.test("invitar a quien ya tiene cuenta en otra agencia: la misma cuenta, sin contraseña nueva", async () => {
  const { p, log } = armar({
    cuentas: { [D1]: { user_id: "u-sofi", correo: "sofi@gmail.test" } },
    usuarios: { "sofi@gmail.test": { id: "u-sofi", tipo: "creadora", es_de_agencia: false } },
  });
  const res = await manejar("tok-mario", { accion: "invitar", creator_id: C1, correo: "sofi@gmail.test" }, p);
  assertEquals(res.status, 200);
  assertEquals(res.body.ya_tenia_cuenta, true);
  assertEquals(log.creadas, []);
  assertEquals(log.atadas, [`u-sofi→${C1} por u-mario`]);
  assertEquals(log.correos[0].asunto, "ASM Tech te sumó a tu espacio en Maven");
  assertStringIncludes(log.correos[0].html, "https://app.test/portal/entrar");
  assert(!log.correos[0].html.includes("verify?token"), "a una cuenta con contraseña no se le manda un enlace para cambiarla");
});

Deno.test("invitar de nuevo a una cuenta bloqueada (le habían quitado el acceso): se desbloquea", async () => {
  const { p, log } = armar({ usuarios: { "sofi@gmail.test": { id: "u-sofi", tipo: "creadora", es_de_agencia: false, bloqueada: true } } });
  assertEquals((await manejar("tok-mario", { accion: "invitar", creator_id: C1, correo: "sofi@gmail.test" }, p)).status, 200);
  assertEquals(log.desbloqueos, ["u-sofi"]);
  assertEquals(log.correos[0].asunto, "ASM Tech te invitó a tu espacio en Maven");
});

Deno.test("invitar si ya tiene acceso, o si la base no la deja atar: no, y la cuenta recién creada se borra", async () => {
  const a = armar({ cuentas: { [C1]: { user_id: "u-sofi", correo: "sofi@gmail.test" } } });
  assertEquals((await manejar("tok-mario", { accion: "invitar", creator_id: C1, correo: "otra@gmail.test" }, a.p)).body.error, "ya_tiene_acceso");
  const b = armar({ errorAtar: "creadora_cuentas: esa cuenta ya es de otra creadora de la misma agencia" });
  const res = await manejar("tok-mario", { accion: "invitar", creator_id: C1, correo: "nueva@gmail.test" }, b.p);
  assertEquals(res.body.error, "correo_de_otra_creadora");
  assertEquals(b.log.borradas, ["u-nueva-0"]);
  assertEquals(b.log.correos.length, 0);
});

Deno.test("reenviar: un enlace nuevo al correo con el que entra", async () => {
  const sin = armar();
  assertEquals((await manejar("tok-mario", { accion: "reenviar", creator_id: C1 }, sin.p)).body.error, "sin_acceso");
  const { p, log } = armar({ cuentas: { [C1]: { user_id: "u-sofi", correo: "sofi@gmail.test" } } });
  const res = await manejar("tok-mario", { accion: "reenviar", creator_id: C1 }, p);
  assertEquals(res.status, 200);
  assertEquals(log.correos[0].para, "sofi@gmail.test");
  assertEquals(log.correos[0].asunto, "Tu enlace para entrar a Maven");
  assertEquals(log.historial[0].split("|")[2], "portal_acceso:enlace");
});

Deno.test("cambiar el correo: no si la comparten dos agencias ni si ese correo ya es de otra cuenta", async () => {
  const compartida = armar({ cuentas: { [C1]: { user_id: "u-sofi", correo: "sofi@gmail.test" }, [D1]: { user_id: "u-sofi", correo: "sofi@gmail.test" } } });
  assertEquals((await manejar("tok-mario", { accion: "cambiar_correo", creator_id: C1, correo: "nuevo@gmail.test" }, compartida.p)).body.error, "cuenta_compartida");
  const enUso = armar({
    cuentas: { [C1]: { user_id: "u-sofi", correo: "sofi@gmail.test" } },
    usuarios: { "luna@gmail.test": { id: "u-luna", tipo: "creadora", es_de_agencia: false } },
  });
  assertEquals((await manejar("tok-mario", { accion: "cambiar_correo", creator_id: C1, correo: "luna@gmail.test" }, enUso.p)).body.error, "correo_en_uso");
  assertEquals((await manejar("tok-mario", { accion: "cambiar_correo", creator_id: C1, correo: "nada" }, enUso.p)).body.error, "correo_invalido");

  const { p, log } = armar({ cuentas: { [C1]: { user_id: "u-sofi", correo: "sofi@gmail.test" } } });
  const res = await manejar("tok-mario", { accion: "cambiar_correo", creator_id: C1, correo: "Sofi.Nueva@gmail.test" }, p);
  assertEquals(res.status, 200);
  assertEquals(log.cambios, ["u-sofi:sofi.nueva@gmail.test"]);
  assertEquals(log.correos[0].para, "sofi.nueva@gmail.test");
  assertEquals(log.historial[0].split("|").slice(2), ["portal_acceso:correo", "s•••@gmail.test", "s•••@gmail.test"]);
});

Deno.test("quitar: la desata; si no le queda otra agencia, la cuenta se bloquea", async () => {
  const sola = armar({ cuentas: { [C1]: { user_id: "u-sofi", correo: "sofi@gmail.test" } } });
  const r1 = await manejar("tok-mario", { accion: "quitar", creator_id: C1 }, sola.p);
  assertEquals(r1.body.cuenta_bloqueada, true);
  assertEquals(sola.log.desatadas, [C1]);
  assertEquals(sola.log.bloqueos, ["u-sofi"]);
  const dos = armar({ cuentas: { [C1]: { user_id: "u-sofi", correo: "sofi@gmail.test" }, [D1]: { user_id: "u-sofi", correo: "sofi@gmail.test" } } });
  const r2 = await manejar("tok-mario", { accion: "quitar", creator_id: C1 }, dos.p);
  assertEquals(r2.body.cuenta_bloqueada, false);
  assertEquals(dos.log.bloqueos, []);
  const ana = armar({ cuentas: { [C1]: { user_id: "u-sofi", correo: "sofi@gmail.test" } } });
  assertEquals((await manejar("tok-ana", { accion: "quitar", creator_id: C1 }, ana.p)).body.error, "sin_permiso");
  assertEquals(ana.log.desatadas, []);
});

Deno.test("el correo escapa el nombre y la agencia, y el remitente no rompe la cabecera", () => {
  const c = correo("bienvenida", { nombre: "<img src=x onerror=alert(1)>", agencia: "Kash & Co", enlace: "https://x.test/?a=1&b=\"2\"", appUrl: "https://app.test" });
  assert(!c.html.includes("<img src=x"), "el nombre va escapado");
  assertStringIncludes(c.html, "&lt;img src=x");
  assertStringIncludes(c.html, "Kash &amp; Co");
  assertStringIncludes(c.html, "a=1&amp;b=&quot;2&quot;");
  assertEquals(remitente("Agencia <falsa@x.test>\r\nBcc: a@b.c", "Maven CRM <noreply@mail.test>"), "Agencia falsa@x.testBcc: a@b.c vía Maven <noreply@mail.test>");
  assertEquals(remitente("", "noreply@mail.test"), "Maven vía Maven <noreply@mail.test>");
  assertEquals(escapar(`'"<>&`), "&#39;&quot;&lt;&gt;&amp;");
});

Deno.test("correos: normalizar y ocultar", () => {
  assertEquals(normalizarCorreo("  A.B@Gmail.COM "), "a.b@gmail.com");
  assertEquals(normalizarCorreo("sin-arroba"), null);
  assertEquals(normalizarCorreo("a@b"), null);
  assertEquals(normalizarCorreo(42), null);
  assertEquals(ocultarCorreo("sofi@gmail.com"), "s•••@gmail.com");
});

Deno.test("los cuatro correos: de tú, sin voseo", () => {
  const VOSEO = /\b(vos|tenés|podés|querés|sabés|entrá|elegí|tocá|avisale|escribí|mirá)\b/i;
  for (const tipo of ["bienvenida", "otra_agencia", "enlace", "correo_nuevo"] as const) {
    const c = correo(tipo, { nombre: "Sofi", agencia: "ASM Tech", enlace: "https://x.test", appUrl: "https://app.test" });
    assert(!VOSEO.test(c.asunto + c.html), `${tipo} tiene voseo`);
  }
});
