// creadora-accesos: quién ve qué, la contraseña y el importador.
//
//   deno test supabase/functions/creadora-accesos/logica.test.ts
//
// Sin red: los puertos son dobles en memoria y el cifrado es el de verdad
// (_shared/sellado.ts) con una llave de prueba. La base (que el navegador no toca
// la tabla) se prueba en supabase/tests/creadora_accesos.ts.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { sellador } from "../_shared/sellado.ts";
import {
  columnaDe, type CreadoraParaEmparejar, emparejar, type Fila, leerHoja, manejar, type Puertos, siONo,
  validarCambios,
} from "./logica.ts";

const C = (n: number) => `c0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [SOFI, LUNA, OTRA, ESCONDIDA] = [1, 2, 3, 4].map(C);
const DOC = "d0000000-0000-4000-8000-000000000001";
const DOC_PDF = "d0000000-0000-4000-8000-000000000002";

const GENTE: Record<string, { id: string; esCreadora: boolean; admin?: boolean; ve?: string[]; ficha?: string }> = {
  "tok-jhon": { id: "u-jhon", esCreadora: false, admin: true, ve: [SOFI, LUNA, OTRA] },
  "tok-mario": { id: "u-mario", esCreadora: false, ve: [SOFI] },
  "tok-sofi": { id: "u-sofi", esCreadora: true, ficha: SOFI },
};

const HOJA = [
  ["Marca temporal", "Email Address", "Nombre Completo", "Instagram", "Whatsapp", "Correo registrado en OnlyFans", "Usuario registrado en OnlyFans", "Contraseña en OnlyFans", "Doble verificacion? (si o no)", "BLU"],
  ["1/10/2026 10:00:00", "sofi@x.test", "Sofía Pérez", "@sofi", "+57 300", "sofi.of@x.test", "sofi_of", "Clave Vieja 1", "si", ""],
  ["5/10/2026 09:00:00", "sofi@x.test", "Sofía Pérez", "@sofi", "+57 300", "sofi.of@x.test", "sofi_of", " Clave Nueva 2", "no", ""],
  ["2/10/2026 11:00:00", "luna.personal@x.test", "Luna Ríos", "https://instagram.com/luna_r/", "", "luna.of@x.test", "", "LunaPass", "sí", ""],
  ["3/10/2026 12:00:00", "nadie@x.test", "Nadie Conocida", "@nadie", "", "", "nadie_of", "x", "", ""],
  ["", "", "", "", "", "", "", "", "", ""],
];

function armar() {
  const sello = sellador("ACCESOS_CRED_KEY", (k) => (k === "ACCESOS_CRED_KEY" ? "llave-de-prueba" : undefined));
  const filas = new Map<string, Fila>();
  const eventos: { creator_id: string; user_id: string; accion: string; desde: string; campos: string[] }[] = [];
  const creadoras: CreadoraParaEmparejar[] = [
    { id: SOFI, nombre: "Sofía Pérez", nombre_artistico: "Sofi", correo: "sofi@x.test", correo_portal: null, instagram: "sofi", usuarios_of: ["sofi_of"] },
    { id: LUNA, nombre: "Luna Ríos", nombre_artistico: null, correo: null, correo_portal: "luna.personal@x.test", instagram: "luna_r", usuarios_of: [] },
    { id: OTRA, nombre: "Otra", nombre_artistico: null, correo: null, correo_portal: null, instagram: null, usuarios_of: [] },
    { id: ESCONDIDA, nombre: "Escondida", nombre_artistico: null, correo: "nadie@x.test", correo_portal: null, instagram: "nadie", usuarios_of: ["nadie_of"] },
  ];
  const p: Puertos = {
    persona: (t) => Promise.resolve(GENTE[t] ? { id: GENTE[t].id, esCreadora: GENTE[t].esCreadora } : null),
    veCreadora: (t, c) => Promise.resolve(!!GENTE[t]?.ve?.includes(c)),
    esAdmin: (u) => Promise.resolve(Object.values(GENTE).some((g) => g.id === u && g.admin)),
    esMiFicha: (u, c) => Promise.resolve(Object.values(GENTE).some((g) => g.id === u && g.ficha === c)),
    leer: (c) => Promise.resolve(filas.get(c) ?? null),
    leerVarias: (ids) => Promise.resolve(ids.map((i) => filas.get(i)).filter(Boolean) as Fila[]),
    escribir: (c, cambios, _q, desde) => {
      const antes = filas.get(c) ?? {
        creator_id: c, of_correo: null, of_usuario: null, of_clave_cifrada: null, of_clave_nonce: null, of_clave_version: null,
        doble_verificacion: null, clave_cambiada_en: null, actualizado_en: null, actualizado_desde: null,
      };
      filas.set(c, { ...antes, ...cambios, actualizado_desde: desde, actualizado_en: "ahora" } as Fila);
      return Promise.resolve();
    },
    anotar: (e) => { eventos.push(e); return Promise.resolve(); },
    ultimosEventos: (c) => Promise.resolve(eventos.filter((e) => e.creator_id === c).map((e) => ({ ...e, en: "x", quien: "Jhon" })) as never),
    cifrar: (t) => sello.sellar(t),
    descifrar: (s) => sello.abrir(s),
    documento: (_t, id) => Promise.resolve(id === DOC ? { storage_key: "k/1", extension: "xlsx", title: "FORMS KASH A. (Responses)" } : id === DOC_PDF ? { storage_key: "k/2", extension: "pdf", title: "x" } : null),
    bajar: () => Promise.resolve(new Uint8Array()),
    hojas: () => [[["sin", "nada"]], HOJA],
    creadorasVisibles: (t) => Promise.resolve(GENTE[t]?.ve ?? []),
    datosParaEmparejar: (ids) => Promise.resolve(creadoras.filter((c) => ids.includes(c.id))),
  };
  return { p, filas, eventos, sello };
}
const pedir = (token: string | null, body: Record<string, unknown>, a: ReturnType<typeof armar>) => manejar(token, body, a.p);

Deno.test("sin sesión o acción rara: no", async () => {
  const a = armar();
  assertEquals((await pedir(null, { accion: "ver" }, a)).status, 401);
  assertEquals((await pedir("tok-nadie", { accion: "ver" }, a)).status, 401);
  assertEquals((await pedir("tok-jhon", { accion: "borrar_todo" }, a)).body.error, "accion_desconocida");
});

Deno.test("la contraseña: solo un admin la ve, y queda anotado (ver o copiar)", async () => {
  const a = armar();
  await pedir("tok-jhon", { accion: "guardar", creator_id: SOFI, cambios: { of_correo: "Sofi.OF@X.test", of_usuario: "@sofi_of", clave: "  con espacios ", doble_verificacion: true } }, a);
  const guardada = a.filas.get(SOFI)!;
  assert(guardada.of_clave_cifrada && !guardada.of_clave_cifrada.includes("espacios"), "en la base, cifrada");
  assertEquals(guardada.of_correo, "sofi.of@x.test");
  assertEquals(guardada.of_usuario, "sofi_of");

  // Mario (manager, ve a Sofi): NADA de los accesos, ni el usuario (Jhon, 08/10:
  // toda esta parte es solo admin). Ni ver, ni la contraseña, ni guardar.
  const mario = await pedir("tok-mario", { accion: "ver", creator_id: SOFI }, a);
  assertEquals(mario.status, 403);
  assertEquals(mario.body, { error: "solo_admin" });
  assertEquals((await pedir("tok-mario", { accion: "ver_clave", creator_id: SOFI }, a)).body.error, "solo_admin");
  assertEquals((await pedir("tok-mario", { accion: "guardar", creator_id: SOFI, cambios: { of_usuario: "x" } }, a)).body.error, "solo_admin");

  // Jhon (admin): todo, y la contraseña tal cual (sin recortar), solo cuando la pide.
  const jhon = await pedir("tok-jhon", { accion: "ver", creator_id: SOFI }, a);
  const vj = jhon.body.accesos as Record<string, unknown>;
  assertEquals(vj.of_correo, "sofi.of@x.test");
  assertEquals(vj.of_usuario, "sofi_of");
  assertEquals(vj.tiene_clave, true);
  assert(!JSON.stringify(jhon.body).includes("espacios"), "ver no trae la contraseña");
  assertEquals((await pedir("tok-jhon", { accion: "ver_clave", creator_id: SOFI }, a)).body.clave, "  con espacios ");
  await pedir("tok-jhon", { accion: "ver_clave", creator_id: SOFI, para: "copiar" }, a);
  assertEquals(a.eventos.map((e) => e.accion), ["guardar", "ver_clave", "copiar_clave"]);
  assertEquals(a.eventos[0].campos, ["of_correo", "of_usuario", "doble_verificacion", "clave"]);

  // A quien no ve la creadora, nada (ni que existe).
  assertEquals((await pedir("tok-mario", { accion: "ver", creator_id: LUNA }, a)).status, 403);
  assertEquals((await pedir("tok-jhon", { accion: "ver", creator_id: ESCONDIDA }, a)).status, 404);
  assertEquals((await pedir("tok-jhon", { accion: "ver_clave", creator_id: LUNA }, a)).body.error, "sin_clave");
});

Deno.test("el admin puede borrar la contraseña; la creadora, no", async () => {
  const a = armar();
  await pedir("tok-jhon", { accion: "guardar", creator_id: SOFI, cambios: { clave: "abc" } }, a);
  assertEquals((await pedir("tok-sofi", { accion: "guardar_mios", creator_id: SOFI, cambios: { clave: null } }, a)).body.error, "no_puede_borrar_clave");
  await pedir("tok-jhon", { accion: "guardar", creator_id: SOFI, cambios: { clave: null } }, a);
  assertEquals(a.filas.get(SOFI)?.of_clave_cifrada, null);
});

Deno.test("la creadora: lo suyo, sin leer la contraseña; y nada del equipo", async () => {
  const a = armar();
  const g = await pedir("tok-sofi", { accion: "guardar_mios", creator_id: SOFI, cambios: { of_usuario: "sofi_nueva", clave: "MiClave", doble_verificacion: false } }, a);
  assertEquals(g.status, 200);
  const mia = g.body.accesos as Record<string, unknown>;
  assertEquals(mia.of_usuario, "sofi_nueva");
  assertEquals(mia.tiene_clave, true);
  assert(!JSON.stringify(g.body).includes("MiClave"), "no le devuelve la contraseña");
  assertEquals(a.filas.get(SOFI)?.actualizado_desde, "creadora");
  assertEquals(a.eventos.at(-1)?.desde, "creadora");
  assertEquals((await pedir("tok-sofi", { accion: "mis_accesos", creator_id: SOFI }, a)).status, 200);

  assertEquals((await pedir("tok-sofi", { accion: "mis_accesos", creator_id: LUNA }, a)).body.error, "no_es_tuya");
  assertEquals((await pedir("tok-sofi", { accion: "ver", creator_id: SOFI }, a)).body.error, "solo_equipo");
  assertEquals((await pedir("tok-sofi", { accion: "ver_clave", creator_id: SOFI }, a)).body.error, "solo_equipo");
  assertEquals((await pedir("tok-sofi", { accion: "importar_previa", documento_id: DOC }, a)).body.error, "solo_equipo");
  // Y alguien del equipo no usa las acciones de la creadora.
  assertEquals((await pedir("tok-jhon", { accion: "mis_accesos", creator_id: SOFI }, a)).body.error, "no_es_tuya");
});

Deno.test("qué se puede escribir", () => {
  const err = (raw: unknown, borrar = true) => { const v = validarCambios(raw, borrar); return "error" in v ? v.error : "ok"; };
  assertEquals(err({ of_usuario: "x", contraseña: "y" }), "campo_desconocido");
  assertEquals(err({ of_correo: "no-es-correo" }), "correo_invalido");
  assertEquals(err({ of_usuario: "x".repeat(201) }), "usuario_invalido");
  assertEquals(err({ clave: "" }), "clave_invalida");
  assertEquals(err({ clave: "a".repeat(501) }), "clave_invalida");
  assertEquals(err({ clave: "con\nsalto" }), "clave_invalida");
  assertEquals(err({ doble_verificacion: "si" }), "doble_invalida");
  assertEquals(err({}), "sin_cambios");
  assertEquals(err([]), "cambios_invalidos");
  const v = validarCambios({ of_correo: "  ", of_usuario: " @ana ", clave: " a b " }, true);
  assert("cambios" in v);
  assertEquals(v.cambios, { of_correo: null, of_usuario: "ana", clave: " a b " });
});

Deno.test("las columnas del formulario de Google, en español y en inglés", () => {
  assertEquals(columnaDe("Email Address"), "correo");
  assertEquals(columnaDe("Correo registrado en OnlyFans"), "of_correo");
  assertEquals(columnaDe("Usuario registrado en OnlyFans"), "of_usuario");
  assertEquals(columnaDe("Contraseña en OnlyFans"), "of_clave");
  assertEquals(columnaDe("Doble verificacion? (si o no)"), "doble");
  assertEquals(columnaDe("Nombre Completo"), "nombre");
  assertEquals(columnaDe("Whatsapp"), "whatsapp");
  assertEquals(columnaDe("Marca temporal"), "marca");
  assertEquals(columnaDe("BLU"), null);
  assertEquals(siONo("Sí"), true);
  assertEquals(siONo("no"), false);
  assertEquals(siONo("tal vez"), null);
});

Deno.test("la hoja: busca el encabezado, se salta las hojas sin él y las filas vacías", () => {
  const h = leerHoja([[["sin", "nada"]], HOJA])!;
  assert(h, "la encontró en la segunda hoja");
  assertEquals(h.filas.map((f) => f.fila), [2, 3, 4, 5]);
  assertEquals(h.filas[1].valores.of_clave, " Clave Nueva 2", "la contraseña sin recortar");
  assertEquals(leerHoja([[["Nombre", "Instagram"], ["a", "b"]]]), null);
});

Deno.test("emparejar: usuario de OF, correo (ficha o portal), Instagram, nombre; solo si UNA coincide", () => {
  const a = armar();
  const creadoras = [
    { id: SOFI, nombre: "Sofía Pérez", nombre_artistico: "Sofi", correo: "sofi@x.test", correo_portal: null, instagram: "sofi", usuarios_of: ["https://onlyfans.com/sofi_of"] },
    { id: LUNA, nombre: "Luna Ríos", nombre_artistico: null, correo: null, correo_portal: "luna.personal@x.test", instagram: "luna_r", usuarios_of: [] },
    { id: OTRA, nombre: "Luna Ríos", nombre_artistico: null, correo: null, correo_portal: null, instagram: null, usuarios_of: [] },
  ];
  const h = leerHoja([HOJA])!;
  assertEquals(emparejar(h.filas[0], creadoras), { id: SOFI, como: "usuario_of" });
  assertEquals(emparejar(h.filas[2], creadoras), { id: LUNA, como: "correo" });
  assertEquals(emparejar({ fila: 9, valores: { instagram: "@LUNA_R" } }, creadoras), { id: LUNA, como: "instagram" });
  assertEquals(emparejar({ fila: 9, valores: { nombre: "luna rios" } }, creadoras), null, "dos con el mismo nombre: no se adivina");
  assertEquals(emparejar({ fila: 9, valores: { nombre: "SOFÍA PÉREZ" } }, creadoras), { id: SOFI, como: "nombre" });
  void a;
});

Deno.test("importar_previa: nombres e Instagram, NUNCA credenciales; la respuesta repetida más nueva gana", async () => {
  const a = armar();
  await pedir("tok-jhon", { accion: "guardar", creator_id: LUNA, cambios: { of_usuario: "luna_ya" } }, a);
  const r = await pedir("tok-jhon", { accion: "importar_previa", documento_id: DOC }, a);
  assertEquals(r.status, 200);
  const texto = JSON.stringify(r.body);
  for (const secreto of ["Clave Vieja", "Clave Nueva", "LunaPass", "sofi.of@x.test", "sofi_of", "luna.of@x.test", "sofi@x.test", "+57"]) {
    assert(!texto.includes(secreto), `la vista previa no trae «${secreto}»`);
  }
  const filas = r.body.filas as Record<string, unknown>[];
  assertEquals(filas.map((f) => [f.fila, f.creator_id, f.como, f.repetida]), [
    [2, SOFI, "usuario_of", true],
    [3, SOFI, "usuario_of", false],
    [4, LUNA, "correo", false],
    // La que no ve Jhon (ESCONDIDA) no se empareja aunque coincida.
    [5, null, null, false],
  ]);
  assertEquals((filas[2] as { ya_tiene: Record<string, boolean> }).ya_tiene.of_usuario, true);
  assertEquals((r.body.creadoras as { nombre: string }[]).map((c) => c.nombre), ["Luna Ríos", "Otra", "Sofi"]);

  assertEquals((await pedir("tok-mario", { accion: "importar_previa", documento_id: DOC }, a)).body.error, "solo_admin");
  assertEquals((await pedir("tok-jhon", { accion: "importar_previa", documento_id: DOC_PDF }, a)).body.error, "no_es_hoja");
  assertEquals((await pedir("tok-jhon", { accion: "importar_previa", documento_id: C(9) }, a)).status, 404);
});

Deno.test("importar: lo asignado, cifrado; sin «pisar» solo lo que falta; nada fuera de su agencia", async () => {
  const a = armar();
  await pedir("tok-jhon", { accion: "guardar", creator_id: LUNA, cambios: { of_usuario: "luna_ya" } }, a);
  const r = await pedir("tok-jhon", {
    accion: "importar", documento_id: DOC,
    asignaciones: [{ fila: 2, creator_id: SOFI }, { fila: 3, creator_id: SOFI }, { fila: 4, creator_id: LUNA }, { fila: 5, creator_id: OTRA }],
  }, a);
  assertEquals(r.status, 200);
  assertEquals(r.body.guardadas, 3);
  const sofi = a.filas.get(SOFI)!;
  assertEquals(sofi.doble_verificacion, false, "de la fila más nueva (5/10)");
  assertEquals(await a.sello.abrir({ cipher: sofi.of_clave_cifrada!, nonce: sofi.of_clave_nonce!, keyVersion: sofi.of_clave_version! }), " Clave Nueva 2");
  assertEquals(sofi.actualizado_desde, "importador");
  assertEquals(a.filas.get(LUNA)?.of_usuario, "luna_ya", "lo que ya tenía no se pisa");
  assertEquals(a.filas.get(LUNA)?.of_correo, "luna.of@x.test", "lo que le faltaba, sí");
  assertEquals(a.filas.get(LUNA)?.doble_verificacion, true);
  assertEquals(a.eventos.filter((e) => e.accion === "importar").length, 3);

  // Con «pisar», lo de la hoja reemplaza.
  await pedir("tok-jhon", { accion: "importar", documento_id: DOC, asignaciones: [{ fila: 4, creator_id: LUNA }], pisar: true }, a);
  assertEquals(a.filas.get(LUNA)?.of_correo, "luna.of@x.test");

  const fuera = await pedir("tok-jhon", { accion: "importar", documento_id: DOC, asignaciones: [{ fila: 5, creator_id: ESCONDIDA }] }, a);
  assertEquals(fuera.body.error, "asignacion_invalida");
  const sinFila = await pedir("tok-jhon", { accion: "importar", documento_id: DOC, asignaciones: [{ fila: 99, creator_id: SOFI }] }, a);
  assertEquals(sinFila.body.error, "asignacion_invalida");
});

Deno.test("el cifrado: vuelve igual, con otra llave o tocado no abre, nonce nuevo cada vez, rotación", async () => {
  const llave = sellador("K", (k) => ({ K: "uno", K_V2: "dos" } as Record<string, string>)[k]);
  const a = (await llave.sellar("secreto"))!;
  const b = (await llave.sellar("secreto"))!;
  assert(a.nonce !== b.nonce && a.cipher !== b.cipher, "nonce nuevo cada vez");
  assertEquals(await llave.abrir(a), "secreto");
  const otra = sellador("K", () => "otra-llave");
  assertEquals(await otra.abrir(a), null);
  const tocado = { ...a, cipher: a.cipher.slice(0, -4) + (a.cipher.endsWith("AAAA") ? "BBBB" : "AAAA") };
  assertEquals(await llave.abrir(tocado), null);
  assertEquals(await sellador("K", () => undefined).sellar("x"), null);
  assertEquals(sellador("K", () => undefined).configurado(), false);
  // Lo cifrado con la v2 se abre con la v2.
  const conV2 = sellador("K", (k) => (k === "K_V2" ? "dos" : undefined));
  const conDos = sellador("K", () => "dos");
  const s = (await conDos.sellar("rotada"))!;
  assertEquals(await conV2.abrir({ ...s, keyVersion: 2 }), "rotada");
});
