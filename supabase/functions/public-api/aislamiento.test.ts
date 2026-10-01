// Tests del aislamiento entre agencias del API pública.
//
// ⚠️ LA LECCIÓN QUE LOS JUSTIFICA: con UNA sola agencia en Maven, un fallo de
// aislamiento es invisible. Una consulta que se olvida de filtrar devuelve el
// resultado correcto por casualidad. Por eso estos tests razonan con DOS agencias:
// es el único escenario donde el problema aparece, y el único donde un test puede
// fallar.
//
// Tres familias:
//  1. `decidir` por comportamiento, con cantidades de agencias concretas y con un
//     mapa inyectado para ejercitar los modos que hoy ningún recurso usa.
//  2. El estado honesto de hoy: ningún recurso real dice estar aislado.
//  3. Guardas estructurales que LEEN el código (sin comentarios: un filtro
//     comentado no cuenta) y fallan si alguien agrega una tabla o un endpoint sin
//     declarar cómo separa agencias.
//
// Corre en CI antes de desplegar (ver .github/workflows/deploy-edge-functions.yml).

import { assert, assertEquals, assertThrows } from "jsr:@std/assert";
import {
  AISLAMIENTO_POR_RECURSO,
  decidir,
  esComoUsuario,
  FUENTES_POR_RECURSO,
  INFRAESTRUCTURA,
  type ModoDeAislamiento,
} from "./aislamiento.ts";
import { RECURSOS_COMO_USUARIO, SCOPE_REQUERIDO } from "./recursos-como-usuario.ts";
import { MENSAJES } from "./mensajes.ts";
import { isValidScope, SCOPE_CATALOG, SCOPE_CATALOG_COMPLETO } from "../manage-api-keys/api-scopes.ts";

/** El código sin comentarios: de bloque, líneas que son solo comentario, y el
 *  comentario al final de una línea de código (`x, // nota`). Este último solo si
 *  va después de un espacio, para no cortar las URLs ("https://…"). */
function sinComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .map((l) => l.replace(/\s\/\/\s.*$/, ""))
    .join("\n");
}

const leer = (ruta: string) => sinComentarios(Deno.readTextFileSync(new URL(ruta, import.meta.url)));
const PUBLIC_API = leer("./index.ts");
const RECURSOS_USUARIO = leer("./recursos-como-usuario.ts");
const FORMATO_MESSENGER = leer("./messenger-formato.ts");
const FORMATO_ESCRITURA = leer("./escritura-formato.ts");
const COMO_USUARIO = leer("./como-usuario.ts");
const PETICION = leer("./peticion.ts");
const MENSAJES_TS = leer("./mensajes.ts");
const AISLAMIENTO_TS = leer("./aislamiento.ts");
const MANAGE_KEYS = sinComentarios(
  Deno.readTextFileSync(new URL("../manage-api-keys/index.ts", import.meta.url)),
);

// ─── 1. `decidir` por comportamiento ────────────────────────────────────────

const MAPA_DE_PRUEBA: Record<string, ModoDeAislamiento> = {
  por_columna: { tipo: "columna", columna: "tenant_id" },
  por_miembros: { tipo: "miembros" },
  del_usuario: { tipo: "como_usuario" },
  del_usuario_mezclado: { tipo: "como_usuario", pendienteConVariasAgencias: "puede mezclar agencias" },
  suelto: { tipo: "sin_agencia", pendiente: "no se sabe de quién es" },
};

Deno.test("con DOS agencias: lo aislado se sirve, lo suelto se apaga con 403", () => {
  assert(decidir("por_columna", 2, MAPA_DE_PRUEBA).ok);
  assert(decidir("por_miembros", 2, MAPA_DE_PRUEBA).ok);
  assert(decidir("del_usuario", 2, MAPA_DE_PRUEBA).ok);
  const v = decidir("suelto", 2, MAPA_DE_PRUEBA);
  assert(!v.ok && v.estado === 403, "un recurso sin agencia se sirvió con 2 agencias");
});

Deno.test("como_usuario que puede mezclar agencias: se apaga con DOS, 503 si no se pudo contar", () => {
  // El Messenger: la sesión es la de la persona, pero nada en la base impide una
  // conversación con alguien de otra agencia. Hasta que eso se cierre, con dos
  // agencias no se sirve.
  assert(decidir("del_usuario_mezclado", 1, MAPA_DE_PRUEBA).ok);
  const vacio = decidir("pendiente_vacio", 2, { pendiente_vacio: { tipo: "como_usuario", pendienteConVariasAgencias: "" } });
  assert(!vacio.ok && vacio.estado === 403, "un pendiente vacío dejó el recurso abierto con 2 agencias");
  const dos = decidir("del_usuario_mezclado", 2, MAPA_DE_PRUEBA);
  assert(!dos.ok && dos.estado === 403, "con 2 agencias se sirvió");
  for (const agencias of [null, 0]) {
    const v = decidir("del_usuario_mezclado", agencias, MAPA_DE_PRUEBA);
    assert(!v.ok && v.estado === 503, `con agencias=${agencias} tenía que dar 503`);
  }
  // Y el que no la declara (/me) se sigue sirviendo con 2.
  assert(decidir("del_usuario", 2, MAPA_DE_PRUEBA).ok);
});

Deno.test("con UNA agencia se sirve todo, igual que antes del arreglo", () => {
  // Esto es lo que garantiza que hoy no cambia nada para las integraciones vivas.
  for (const recurso of Object.keys(AISLAMIENTO_POR_RECURSO)) {
    assert(decidir(recurso, 1).ok, `"${recurso}" dejó de servirse con una sola agencia`);
  }
});

Deno.test("si no se pudo contar, se cierra con 503 (es un error nuestro, no un 'no')", () => {
  for (const agencias of [null, 0, -1]) {
    const v = decidir("suelto", agencias, MAPA_DE_PRUEBA);
    assert(!v.ok && v.estado === 503, `con agencias=${agencias} tenía que dar 503`);
  }
});

Deno.test("un recurso que no declara su aislamiento da 404, con 1 o con 2 agencias", () => {
  for (const agencias of [1, 2]) {
    const v = decidir("recurso_que_nadie_declaro", agencias);
    assert(!v.ok && v.estado === 404);
  }
});

Deno.test("los nombres heredados de Object.prototype no pasan la puerta", () => {
  // Con `mapa[recurso]`, "constructor" existía por herencia y la puerta lo dejaba pasar.
  for (const r of ["constructor", "toString", "hasOwnProperty", "__proto__", "valueOf"]) {
    const v = decidir(r, 2);
    assert(!v.ok && v.estado === 404, `"${r}" pasó la puerta`);
  }
});

// ─── 2. El estado honesto de hoy ────────────────────────────────────────────

Deno.test("hoy ningún recurso de DATOS dice estar aislado (y con 2 agencias se apagan todos)", () => {
  // Tener una columna tenant_id no alcanza: tiene que decir la verdad. Promover un
  // recurso a 'columna', 'miembros' o 'como_usuario' es una decisión de seguridad:
  // exige arreglar su `pendiente` Y actualizar esta lista a conciencia. Si tocas
  // esta lista sin haber arreglado el dato, estás abriendo una fuga.
  //
  //  * me — 24/09/2026. Devuelve a la persona como la que actúa la llave y su
  //    agencia, leídas con SU sesión. Que esa persona es de la agencia de la llave
  //    se verifica al crearla (api_keys_validar_actua_como), en cada pedido
  //    (api_key_consumir → 401) y antes de servir (servirComoUsuario compara
  //    current_tenant_id() de la sesión → 503). No cambia (api_keys_actua_como_inmutable).
  //  * messenger — 25/09/2026. La bandeja, las conversaciones, los mensajes y el feed
  //    de la persona de la llave, leídos con SU sesión: la RLS del Messenger es 100%
  //    por participación (is_chat_participant), sin excepción para admins de Maven en
  //    chat_conversations / chat_participants / chat_messages. Como la base todavía
  //    no impide conversaciones con gente de otra agencia, declara
  //    pendienteConVariasAgencias: con dos o más agencias se apaga (test de abajo).
  const PROMOVIDOS_CON_VERIFICACION: string[] = ["me", "messenger"];

  const promovidos = Object.entries(AISLAMIENTO_POR_RECURSO)
    .filter(([, m]) => m.tipo !== "sin_agencia")
    .map(([r]) => r)
    .sort();
  assertEquals(
    promovidos,
    PROMOVIDOS_CON_VERIFICACION,
    "un recurso pasó a 'columna' o 'miembros' sin registrarse aquí",
  );

  const sueltos = Object.entries(AISLAMIENTO_POR_RECURSO).filter(([, m]) => m.tipo === "sin_agencia");
  assert(sueltos.length >= 8, "desaparecieron recursos sin agencia sin pasar por esta lista");
  for (const [recurso] of sueltos) {
    const v = decidir(recurso, 2);
    assert(!v.ok && v.estado === 403, `"${recurso}" se sirvió con 2 agencias`);
  }
});

// ─── 3. Guardas estructurales sobre public-api ──────────────────────────────

/** Nombres de tabla/función en `.from("x")` y `.rpc("x")`. */
function fuentesUsadas(codigo: string): Set<string> {
  const out = new Set<string>();
  for (const m of codigo.matchAll(/\.(?:from|rpc)\(\s*["']([a-zA-Z0-9_]+)["']/g)) out.add(m[1]);
  return out;
}

Deno.test("public-api: cada tabla o función que toca está declarada", () => {
  const declaradas = new Set<string>([
    ...INFRAESTRUCTURA,
    ...Object.values(FUENTES_POR_RECURSO).flat(),
  ]);
  const usadas = new Set([...fuentesUsadas(PUBLIC_API), ...fuentesUsadas(RECURSOS_USUARIO)]);
  assert(usadas.size > 5, "el test no encontró fuentes: se rompió el patrón de búsqueda");
  const sinDeclarar = [...usadas].filter((f) => !declaradas.has(f));
  assertEquals(
    sinDeclarar,
    [],
    `public-api usa ${sinDeclarar.join(", ")} sin declarar cómo aísla agencias. ` +
      "Agrégala a FUENTES_POR_RECURSO en ./aislamiento.ts, bajo el recurso que la usa.",
  );
});

Deno.test("public-api: cada recurso del router declara su modo de aislamiento", () => {
  const recursos = new Set<string>();
  for (const m of PUBLIC_API.matchAll(/resource\s*===\s*"([a-z_/]+)"/g)) recursos.add(m[1]);
  // /sales/chatters se rutea como sub-recurso de sales pero es otro dato.
  if (recursos.has("sales")) recursos.add("sales/chatters");
  assert(recursos.size > 5, "el test no encontró recursos: se rompió el patrón de búsqueda");
  const sinModo = [...recursos].filter((r) => !Object.hasOwn(AISLAMIENTO_POR_RECURSO, r));
  assertEquals(sinModo, [], `recursos sin modo de aislamiento: ${sinModo.join(", ")}`);
});

Deno.test("public-api: la llave trae su agencia, y un fallo de la base no se disfraza de 401", () => {
  const tramo = PUBLIC_API.slice(PUBLIC_API.indexOf('from("api_keys")'));
  assert(/select\("[^"]*tenant_id[^"]*"\)/.test(tramo.slice(0, 400)), "la búsqueda de la llave no trae tenant_id");
  assert(/error:\s*keyErr/.test(PUBLIC_API), "la búsqueda de la llave descarta el error");
  assert(/if\s*\(\s*keyErr\s*\)\s*return\s+noDisponible/.test(PUBLIC_API), "un error de la llave no devuelve 503");
});

Deno.test("public-api: la puerta recibe el conteo REAL de agencias, no un número fijo", () => {
  assert(
    /from\("tenants"\)\.select\([^)]*count:\s*"exact"/.test(PUBLIC_API),
    "public-api no cuenta las agencias",
  );
  // Con el mapa REAL (nada de uno inyectado) y el idioma del pedido.
  assert(
    /decidir\(\s*recursoClave\s*,\s*cantidadDeAgencias\s*,\s*AISLAMIENTO_POR_RECURSO\s*,\s*idioma\s*\)/.test(PUBLIC_API),
    "la puerta no usa el conteo (o no usa el mapa real, o no recibe el idioma)",
  );
  assertEquals((PUBLIC_API.match(/\bdecidir\(/g) ?? []).length, 1, "la puerta se llama más de una vez");
  assert(!/cantidadDeAgencias\s*=\s*1\b/.test(PUBLIC_API), "el conteo de agencias está fijado en 1");
  // Que se LLAME AISLAMIENTO_POR_RECURSO no alcanza: `import { AISLAMIENTO_POR_RECURSO as
  // REAL }` + `const AISLAMIENTO_POR_RECURSO = { ...REAL, contacts: … }` pasaba la regex
  // de arriba y servía /contacts con dos agencias. Por eso: index.ts importa el mapa y
  // la puerta TAL CUAL de aislamiento.ts y no los vuelve a nombrar en ningún otro lado
  // (ni para declarar uno propio, ni para escribirle, ni para envolverlos): cada uno
  // aparece exactamente dos veces, en el import y en la llamada.
  for (const nombre of ["AISLAMIENTO_POR_RECURSO", "decidir"]) {
    const importado = PUBLIC_API.match(/^\s*import\s*\{([^}]*)\}\s*from\s*"\.\/aislamiento\.ts"\s*;?\s*$/m);
    assert(importado, "index.ts no importa de ./aislamiento.ts");
    const nombres = importado[1].split(",").map((n) => n.trim()).filter(Boolean);
    assert(nombres.includes(nombre), `index.ts no importa ${nombre} de ./aislamiento.ts tal cual (sin alias)`);
    assert(!new RegExp(`\\bas\\s+${nombre}\\b`).test(PUBLIC_API), `index.ts le pone el nombre ${nombre} a otra cosa`);
    const usos = (PUBLIC_API.match(new RegExp(`(?<![\\w$])${nombre}(?![\\w$])`, "g")) ?? []).length;
    assertEquals(usos, 2, `index.ts nombra ${nombre} fuera del import y de la puerta (lo declara, lo envuelve o le escribe)`);
  }
});

Deno.test("el mapa de aislamiento está congelado: nadie le cambia el modo a un recurso", () => {
  // Lo que la guarda de arriba no ve: otro módulo que escriba en el mapa importado.
  assert(Object.isFrozen(AISLAMIENTO_POR_RECURSO), "el mapa no está congelado");
  for (const [recurso, modo] of Object.entries(AISLAMIENTO_POR_RECURSO)) {
    assert(Object.isFrozen(modo), `el modo de ${recurso} no está congelado`);
  }
  // deno-lint-ignore no-explicit-any
  const mapa = AISLAMIENTO_POR_RECURSO as any;
  assertThrows(() => { mapa.contacts = { tipo: "columna", columna: "tenant_id" }; }, TypeError);
  assertThrows(() => { mapa.contacts.tipo = "columna"; }, TypeError);
  assertThrows(() => { mapa.nuevo = { tipo: "miembros" }; }, TypeError);
  assertThrows(() => { delete mapa.contacts; }, TypeError);
  const v = decidir("contacts", 2);
  assert(!v.ok && v.estado === 403, "después de intentar escribirle, /contacts se sirvió con 2 agencias");
});

Deno.test("public-api: los filtros de defensa extra por agencia siguen en su lugar", () => {
  // Hoy no son la pared (la puerta apaga estos recursos con 2+ agencias), pero son
  // los que van a sostener el aislamiento el día que se promuevan. No se pierden.
  const tramoSales = PUBLIC_API.slice(PUBLIC_API.indexOf('"creator_daily_earnings"'));
  assert(
    /\.eq\(\s*"tenant_id"\s*,\s*tenantId\s*\)/.test(tramoSales.slice(0, 1500)),
    "/sales dejó de filtrar creator_daily_earnings por tenant_id",
  );
  const tramoEmpleados = PUBLIC_API.slice(PUBLIC_API.indexOf('resource === "employees"'));
  assert(
    /from\("tenant_members"\)[\s\S]{0,200}\.eq\(\s*"tenant_id"\s*,\s*tenantId\s*\)/.test(tramoEmpleados),
    "/employees dejó de restringirse a los miembros de la agencia",
  );
  assert(
    /\.in\(\s*"id"\s*,\s*idsDeLaAgencia\s*\)/.test(tramoEmpleados),
    "/employees consulta profiles sin limitarse a los ids de la agencia",
  );
});

// ─── 4. Guarda estructural sobre manage-api-keys ────────────────────────────

Deno.test("manage-api-keys: toda consulta a api_keys está atada a la agencia", () => {
  // Cada sentencia que arranca en from("api_keys") tiene que mencionar tenant_id
  // antes de terminar. Si no, un admin de una agencia ve o toca llaves de otra.
  const sentencias: string[] = [];
  let i = MANAGE_KEYS.indexOf('from("api_keys")');
  while (i !== -1) {
    const fin = MANAGE_KEYS.indexOf(";", i);
    sentencias.push(MANAGE_KEYS.slice(i, fin === -1 ? undefined : fin));
    i = MANAGE_KEYS.indexOf('from("api_keys")', i + 1);
  }
  assert(sentencias.length >= 5, `se esperaban 5 consultas a api_keys (list, count, create, update, revoke), hay ${sentencias.length}`);
  const sueltas = sentencias.filter((s) => !s.includes("tenant_id"));
  assertEquals(
    sueltas.map((s) => s.split("\n")[0].trim()),
    [],
    "hay consultas a api_keys en manage-api-keys que no filtran por agencia",
  );
});

// ─── 5. Lo que actúa como usuario no toca service_role ──────────────────────

Deno.test("como_usuario: cada recurso declarado tiene su handler, y ninguno sobra", () => {
  const declarados = Object.keys(AISLAMIENTO_POR_RECURSO).filter((r) => esComoUsuario(r)).sort();
  const conHandler = Object.keys(RECURSOS_COMO_USUARIO).sort();
  assert(declarados.length >= 1, "no hay ningún recurso como_usuario: se rompió la búsqueda");
  // Un handler sin declarar sería un recurso que la puerta no conoce; uno declarado
  // sin handler, un 503 eterno. Ninguno de los dos se despliega.
  assertEquals(conHandler, declarados);
  // Y los nombres heredados no cuentan como como_usuario.
  for (const r of ["constructor", "toString", "__proto__"]) assert(!esComoUsuario(r));
});

Deno.test("como_usuario: cada recurso declara su scope de lectura y de escritura, y existen en el catálogo COMPLETO", () => {
  assertEquals(Object.keys(SCOPE_REQUERIDO).sort(), Object.keys(RECURSOS_COMO_USUARIO).sort(),
    "un recurso como_usuario no declara qué scope necesita (o sobra uno)");
  for (const [recurso, { lectura, escritura }] of Object.entries(SCOPE_REQUERIDO)) {
    assert(lectura === null || isValidScope(lectura), `${recurso} pide un scope de lectura que no existe: ${lectura}`);
    assert(escritura === null || isValidScope(escritura), `${recurso} pide un scope de escritura que no existe: ${escritura}`);
    // Escribir sin leer no existe (la base y manage-api-keys exigen write ⇒ read).
    assert(escritura === null || lectura !== null, `${recurso} se escribe sin scope de lectura`);
  }
  // Solo /me puede ir sin scope: saber como quién actúa la llave es lo mínimo. Y no se
  // escribe: todo lo que no es GET da 405.
  const sinScope = Object.entries(SCOPE_REQUERIDO).filter(([, s]) => s.lectura === null).map(([r]) => r);
  assertEquals(sinScope, ["me"], "un recurso como_usuario quedó sin scope");
  assertEquals(SCOPE_REQUERIDO.me.escritura, null, "/me no se escribe");
  assertEquals(SCOPE_REQUERIDO.messenger, { lectura: "messenger:read", escritura: "messenger:write" });
  // La validación usa el catálogo completo; la pantalla, uno sin messenger:write hasta
  // el PR 5 (SCOPES_OCULTOS_EN_PANTALLA). Si la validación usara el de la pantalla,
  // ninguna key podría tener write; si la pantalla usara el completo, se ofrecería antes.
  assert(SCOPE_CATALOG_COMPLETO.some((s) => s.key === "messenger:write"), "el catálogo completo no tiene messenger:write");
  assert(!SCOPE_CATALOG.some((s) => s.key === "messenger:write"), "messenger:write se ve en la pantalla antes del PR 5");
});

Deno.test("IP: la whitelist usa la IP de peticion.ts (probada por comportamiento en peticion.test.ts)", () => {
  // El primer valor de X-Forwarded-For lo escribe el que llama: con él, cualquiera
  // se ponía una IP de la whitelist.
  assert(/import\s*\{[^}]*\bclientIp\b[^}]*\}\s*from\s*"\.\/peticion\.ts"/.test(PUBLIC_API), "index.ts no usa el clientIp de peticion.ts");
  assert(!/function\s+clientIp\b/.test(PUBLIC_API), "index.ts define su propio clientIp");
  assert(!/headers\.get\(\s*"(x-forwarded-for|x-client-ip|true-client-ip|forwarded)"/i.test(PUBLIC_API), "index.ts lee una cabecera que escribe el cliente");
  assert(/ipAllowed\(\s*ip\s*,/.test(PUBLIC_API) && /const ip = clientIp\(req\)/.test(PUBLIC_API), "la whitelist no compara contra clientIp(req)");
});

Deno.test("como_usuario: los handlers nunca ven service_role", () => {
  // La razón de ser de este modo: la RLS y los triggers de la base son la pared. Con
  // service_role, los guardias del Messenger se apartan y una llave escribiría a
  // nombre de cualquiera.
  //
  // Mirar identificadores no alcanza: `import { adminClient } from "../_shared/…"`
  // trae un cliente service_role sin que aparezca la palabra. Por eso, las TRES
  // puertas por las que puede entrar un cliente con service_role:
  //  1. importarlo o fabricarlo: el archivo solo importa TIPOS, y no puede crear
  //     clientes, leer secretos ni hablar HTTP por su cuenta;
  //  2. recibirlo por parámetro: Contexto no puede llevar funciones ni clientes;
  //  3. que el router se lo pase: la rama como_usuario del router no nombra `admin`.
  // (No se prohíbe la palabra "admin" a secas: el Messenger tiene is_chat_admin.)
  for (const prohibido of [/\badmin\b/, /adminClient|serviceClient/i, /service_?role/i, /createClient/, /Deno\.env/, /\bimport\s*\(/, /\bfetch\s*\(/]) {
    assert(!prohibido.test(RECURSOS_USUARIO), `recursos-como-usuario.ts usa ${prohibido}`);
  }
  const contexto = RECURSOS_USUARIO.match(/export\s+type\s+Contexto\s*=\s*\{([\s\S]*?)\n\};/);
  assert(contexto, "no se encontró el tipo Contexto");
  for (const prohibido of [/=>/, /SupabaseClient/, /\bFunction\b/, /\bany\b/, /\bunknown\b/]) {
    assert(!prohibido.test(contexto[1]), `Contexto puede llevar un cliente o una función (${prohibido})`);
  }
  // Por sentencia y no por línea: un import partido en varias líneas también cuenta.
  // Las únicas excepciones: las piezas PURAS del Messenger y los textos, que los tests
  // de abajo obligan a no importar nada ni tocar la base.
  const importsDeValores = (RECURSOS_USUARIO.match(/^\s*import\s+(?!type\b)[^;]*/gm) ?? [])
    .filter((i) => !/from\s+"\.\/(messenger-formato|escritura-formato|mensajes)\.ts"\s*$/.test(i.trim()));
  assertEquals(importsDeValores, [], "recursos-como-usuario.ts importa valores, no solo tipos");
  const reexports = RECURSOS_USUARIO.match(/^\s*export\s*(\*|\{)[^;]*\bfrom\b/gm) ?? [];
  assertEquals(reexports, [], "recursos-como-usuario.ts reexporta de otro archivo");
  const mapa = RECURSOS_USUARIO.match(/RECURSOS_COMO_USUARIO\s*:[^=]*=\s*\{([\s\S]*?)\}/);
  assert(mapa, "no se encontró RECURSOS_COMO_USUARIO");
  const handlers = [...mapa[1].matchAll(/:\s*([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
  assert(handlers.length >= 1, "el mapa de handlers quedó vacío o cambió de forma");
  for (const h of handlers) {
    assert(
      new RegExp(`export\\s+const\\s+${h}\\s*:\\s*Handler\\s*=`).test(RECURSOS_USUARIO),
      `el handler ${h} no está definido en recursos-como-usuario.ts`,
    );
  }
  assert(!/SERVICE_ROLE/.test(COMO_USUARIO), "como-usuario.ts arma su cliente con service_role");
  assert(/SUPABASE_ANON_KEY/.test(COMO_USUARIO), "como-usuario.ts no arma su cliente con la clave anónima");
  // La sesión es la de la key del pedido (mvf + mvk), con el id de la fila encontrada
  // por el hash, y sin reintentos escondidos. clienteComoUsuario (mvf sin mvk) es del
  // despachador de webhooks: aquí no aparece.
  assert(/clienteDeLlave\(\s*consumo\.actua_como\s*,\s*keyRow\.id\s+as\s+string\s*,\s*\{\s*fetch:\s*fetchSinReintentos\(/.test(PUBLIC_API),
    "la rama como_usuario no arma la sesión con clienteDeLlave(actua_como, keyRow.id, { fetch: fetchSinReintentos(…) })");
  assert(!/\bclienteComoUsuario\b/.test(PUBLIC_API), "index.ts usa clienteComoUsuario (sin mvk): la base no dejaría escribir");
  // El plazo de la sesión de la persona, más largo que el statement_timeout de
  // authenticated (8 s): la base corta primero, con un 57014 que se reintenta seguro.
  const plazo = Number(PUBLIC_API.match(/const PLAZO_YO_MS = ([\d_]+);/)?.[1].replace(/_/g, ""));
  assert(plazo > 8_000 && plazo <= 15_000, `PLAZO_YO_MS = ${plazo}: tiene que pasar de los 8 s del statement_timeout`);
  assert(/clienteDeLlave\([^)]*fetchSinReintentos\(PLAZO_YO_MS\)/.test(PUBLIC_API), "la sesión no usa PLAZO_YO_MS");
  // El router entra por servirComoUsuario (que verifica la sesión) con el cliente de
  // la persona, y solo ese. Nada de despachar handlers sueltos.
  assert(/await\s+servirComoUsuario\(\s*recursoClave\s*,\s*yo\s*,/.test(PUBLIC_API), "el router no entra por servirComoUsuario con `yo`");
  const inicioRama = PUBLIC_API.indexOf("if (esComoUsuario(recursoClave))");
  const finRama = PUBLIC_API.indexOf('resource === "creators"', inicioRama);
  assert(inicioRama > 0 && finRama > inicioRama, "no se encontró la rama como_usuario del router");
  const rama = PUBLIC_API.slice(inicioRama, finRama);
  assert(!/\badmin\b/.test(rama), "la rama como_usuario del router usa `admin`");
  // En la rama solo se llaman estas funciones: ninguna otra puede servir datos (un
  // handler armado afuera con `admin` y llamado aquí saltearía el scope y la agencia).
  const llamadas = [...rama.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]);
  const PERMITIDAS = new Set([
    "if", "catch", "esComoUsuario", "noDisponible", "comoUsuarioConfigurado", "clienteDeLlave", "fetchSinReintentos",
    "servirComoUsuario", "json", "msg", "String",
  ]);
  assertEquals([...new Set(llamadas.filter((f) => !PERMITIDAS.has(f)))], [], "la rama como_usuario llama a algo que no es la entrada");
  assert(!/RECURSOS_COMO_USUARIO|SCOPE_REQUERIDO|crearServidorComoUsuario/.test(PUBLIC_API),
    "el router despacha handlers o arma su propia entrada sin pasar por servirComoUsuario");
  // Si falta el secreto se responde 503; no se cae a service_role.
  const tramo = PUBLIC_API.slice(PUBLIC_API.indexOf("esComoUsuario(recursoClave)"));
  assert(tramo.length > 100, "no se encontró la rama como_usuario del router");
  assert(/if\s*\(\s*!yo\s*\)\s*return\s+noDisponible/.test(tramo), "sin sesión de usuario no se corta con 503");
  assert(/if\s*\(\s*!comoUsuarioConfigurado\(\)\s*\)\s*return\s+noDisponible/.test(tramo), "sin secreto no se corta con 503");
});

// ─── 6. Límite por hora ──────────────────────────────────────────────────────

Deno.test("límite: cada pedido pasa por api_key_consumir, una sola vez, después de la whitelist", () => {
  const consumos = PUBLIC_API.match(/\.rpc\(\s*"api_key_consumir"/g) ?? [];
  assertEquals(consumos.length, 1, "api_key_consumir tiene que llamarse exactamente una vez");
  // Si siguiera el contador viejo, cada pedido escribiría dos veces la misma fila.
  assert(!/\.rpc\(\s*"increment_api_key_usage"/.test(PUBLIC_API), "sigue el contador viejo");
  // Contar antes de la whitelist dejaría que alguien con la llave filtrada, desde
  // otra IP, le gaste el cupo al dueño.
  const whitelist = PUBLIC_API.indexOf("ipAllowed(ip,");
  const consumo = PUBLIC_API.indexOf('rpc("api_key_consumir"');
  assert(whitelist > 0 && consumo > whitelist, "el cupo se consume antes de revisar la IP");
  // Y antes de rutear: ningún recurso se sirve sin haber pasado por el contador.
  const ruteo = PUBLIC_API.indexOf("const parts =");
  assert(ruteo > 0 && consumo < ruteo, "el cupo se consume después de rutear");
});

Deno.test("baja: si el contador falla, la llave de alguien dado de baja igual se corta", () => {
  // El límite queda abierto si el contador falla; la baja no.
  const tramo = PUBLIC_API.slice(PUBLIC_API.indexOf('rpc("api_key_consumir"'));
  assert(/\}\s*else\s*\{[\s\S]{0,600}\.rpc\(\s*"api_key_vigente"/.test(tramo), "sin contador no se mira si la persona sigue vigente");
  assert(/vigente\s*===\s*false\s*\)\s*return\s+personaNoVigente/.test(tramo), "sin contador, una persona no vigente no da 401");
});

Deno.test("límite: pasado el cupo, 429 con Retry-After; persona inactiva, 401", () => {
  assert(/if\s*\(\s*!consumo\.permitido\s*\)/.test(PUBLIC_API), "no se mira si el pedido está permitido");
  const tramo = PUBLIC_API.slice(PUBLIC_API.indexOf("!consumo.permitido"));
  assert(/429\s*,\s*\{\s*"Retry-After"/.test(tramo.slice(0, 600)), "pasado el cupo no se responde 429 con Retry-After");
  assert(/if\s*\(\s*!consumo\.usuario_activo\s*\)/.test(PUBLIC_API), "no se corta la llave de alguien dado de baja");
  for (const h of ["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"]) {
    assert(PETICION.includes(`"${h}"`), `falta la cabecera ${h}`);
  }
  assert(/cabecerasDelPedido\.set\(\s*req\s*,\s*cabeceras\s*\)/.test(PUBLIC_API), "las cabeceras del cupo no se ponen en la respuesta");
});

// ─── 7. El Messenger por API: solo lectura, siempre acotado ──────────────────

Deno.test("messenger: con DOS agencias se apaga (hasta que la base impida mezclarlas)", () => {
  assert(decidir("messenger", 1).ok, "con una agencia no se sirve");
  const v = decidir("messenger", 2);
  assert(!v.ok && v.estado === 403, "con 2 agencias se sirvió el Messenger");
  assert(decidir("me", 2).ok, "/me dejó de servirse con 2 agencias");
});

Deno.test("escritura-formato.ts es PURO: no importa nada ni toca la base", () => {
  for (const prohibido of [
    /^\s*import\b/m, /\bimport\s*\(/, /SupabaseClient/, /createClient/, /Deno\.env/, /\bfetch\s*\(/,
    /service_?role/i, /\.from\(\s*["'`]/, /\.rpc\(/, /\byo\b/, /\badmin\b/, /\bglobalThis\b/, /\beval\s*\(/,
  ]) {
    assert(!prohibido.test(FORMATO_ESCRITURA), `escritura-formato.ts usa ${prohibido}`);
  }
});

Deno.test("messenger-formato.ts es PURO: no importa nada ni toca la base", () => {
  for (const prohibido of [
    /^\s*import\b/m, /\bimport\s*\(/, /SupabaseClient/, /createClient/, /Deno\.env/, /\bfetch\s*\(/,
    /service_?role/i, /\.from\(\s*["'`]/, /\.rpc\(/, /\byo\b/,
  ]) {
    assert(!prohibido.test(FORMATO_MESSENGER), `messenger-formato.ts usa ${prohibido}`);
  }
  // "admin" aparece UNA vez, y es el rol de admin DEL GRUPO.
  const admins = FORMATO_MESSENGER.match(/\badmin\b/g) ?? [];
  assertEquals(admins.length, 1, "messenger-formato.ts nombra 'admin' más de una vez");
  assert(/export const ROL_ADMIN_DE_GRUPO = "admin";/.test(FORMATO_MESSENGER), "el único 'admin' no es ROL_ADMIN_DE_GRUPO");
});

/** El cuerpo de `async function nombre(…) { … }` en un código (sin comentarios). */
function cuerpoDeFuncion(src: string, nombre: string): string {
  const i = src.search(new RegExp(`\\basync\\s+function\\s+${nombre}\\s*\\(`));
  if (i < 0) return "";
  // Los handlers no llevan llaves en los parámetros ni en el tipo de retorno
  // (Promise<Resultado>): el cuerpo es la primera llave después de los parámetros.
  const j = src.indexOf("{", src.indexOf(")", i));
  let nivel = 0;
  for (let k = j; k < src.length; k++) {
    const c = src[k];
    if (c === '"' || c === "'" || c === "`") { k = finDeString(src, k); continue; }
    if (c === "{") nivel++;
    else if (c === "}" && --nivel === 0) return src.slice(j, k + 1);
  }
  return src.slice(j);
}

Deno.test("lo como_usuario escribe SOLO por estas RPC, una en cada handler, por POST", () => {
  // Leer NO marca como leído ni entregado. Escribir va por las 4 RPC de la base
  // (INVOKER: la RLS y los triggers como en la app, la key validada en cada una).
  // Nunca un .insert/.update/.upsert/.delete: con la sesión fabricada, una tabla fuera
  // del chat (perfil, Cowork…) SÍ se dejaría escribir (diseño §3 ⚠️).
  for (const prohibido of [/\.insert\(/, /\.update\(/, /\.upsert\(/, /\.delete\(/]) {
    assert(!prohibido.test(RECURSOS_USUARIO), `recursos-como-usuario.ts escribe (${prohibido})`);
  }
  const rpcs = [...RECURSOS_USUARIO.matchAll(/\.rpc\(\s*"([a-z_]+)"/g)].map((m) => m[1]).sort();
  const PERMITIDAS = [
    "current_tenant_id", "get_last_messages", "messenger_unread_counts", "api_mi_llave", "messenger_directorio", "api_escritura_habilitada",
    "api_messenger_enviar", "api_messenger_abrir_directo", "api_messenger_editar", "api_messenger_borrar",
  ];
  assertEquals([...new Set(rpcs)].filter((r) => !PERMITIDAS.includes(r)), [], "una función de base no autorizada");
  assert(!/\.(from|rpc)\(\s*[^"\s]/.test(RECURSOS_USUARIO), "from()/rpc() con un nombre que no es literal");
  // Ni por GET ni HEAD: postgrest-js reintenta un GET que falla, y una escritura no se
  // repite a ciegas. Toda .rpc( lleva a lo sumo dos argumentos (nombre y parámetros).
  const llamadasRpc = [...RECURSOS_USUARIO.matchAll(/\.rpc\(/g)];
  assert(llamadasRpc.length >= 9, `se esperaban al menos 9 .rpc(, hay ${llamadasRpc.length}: se rompió la búsqueda`);
  for (const m of llamadasRpc) {
    const args = elementosDesde(RECURSOS_USUARIO, m.index! + m[0].length).elementos;
    assert(args.length <= 2, `.rpc(${args.join(", ")}) con opciones`);
  }
  assert(!/\bget\s*:\s*true|\bhead\s*:/.test(RECURSOS_USUARIO), "recursos-como-usuario.ts pide un get/head");
  // Cada RPC de escritura aparece UNA vez en todo el archivo, dentro de su handler.
  const DUENO: Record<string, string> = {
    api_messenger_enviar: "enviar", api_messenger_abrir_directo: "abrirChat",
    api_messenger_editar: "editar", api_messenger_borrar: "borrar", messenger_directorio: "personasDelDirectorio",
    api_escritura_habilitada: "personasDelDirectorio",
  };
  for (const [rpc, handler] of Object.entries(DUENO)) {
    const llamadas = RECURSOS_USUARIO.match(new RegExp(`\\.rpc\\(\\s*"${rpc}"`, "g")) ?? [];
    assertEquals(llamadas.length, 1, `${rpc} se llama ${llamadas.length} veces`);
    const cuerpo = cuerpoDeFuncion(RECURSOS_USUARIO, handler);
    assert(cuerpo.length > 100, `no se encontró el handler ${handler}`);
    assert(cuerpo.includes(`.rpc("${rpc}"`), `${rpc} no se llama dentro de ${handler}`);
    // Y el nombre de la RPC no aparece fuera de su handler (ni en un texto suelto).
    assertEquals((RECURSOS_USUARIO.match(new RegExp(`"${rpc}"`, "g")) ?? []).length, 1, `${rpc} aparece fuera de ${handler}`);
  }
  // Las de escritura no aparecen en ningún otro archivo de public-api.
  for (const [archivo, src] of [["index.ts", PUBLIC_API], ["escritura-formato.ts", FORMATO_ESCRITURA], ["messenger-formato.ts", FORMATO_MESSENGER]]) {
    assert(!/"api_messenger_|"api_idem_/.test(src), `${archivo} nombra una RPC de escritura`);
  }
});

Deno.test("index.ts no nombra el chat ni las RPC de escritura, y el cuerpo se lee después de la puerta y del 405", () => {
  // Todo lo que toca el chat va por servirComoUsuario, con la sesión de la persona.
  for (const prohibido of [/"chat_/, /"api_messenger_/, /"api_idem_/, /"messenger_directorio"/, /"api_mi_llave"/, /"api_escritura_habilitada"/]) {
    assert(!prohibido.test(PUBLIC_API), `index.ts nombra ${prohibido}`);
  }
  const puerta = PUBLIC_API.indexOf("decidir(recursoClave");
  const noEsComoUsuario = PUBLIC_API.search(/if\s*\(\s*metodo\s*!==\s*"GET"\s*&&\s*!esComoUsuario\(recursoClave\)\s*\)/);
  const lectura = PUBLIC_API.indexOf("leerCuerpo(");
  assert(puerta > 0 && noEsComoUsuario > puerta, "el 405 de lo que no es como_usuario no va después de la puerta");
  assert(lectura > noEsComoUsuario, "leerCuerpo( va antes del 405 (se leería el cuerpo de un recurso que no se escribe)");
  assertEquals((PUBLIC_API.match(/\bleerCuerpo\(/g) ?? []).length, 1, "leerCuerpo( se llama más de una vez");
  // La raíz con otro método: 405 antes de armar la lista.
  const raiz = PUBLIC_API.indexOf("if (!resource) {");
  assert(raiz > 0 && /if \(!resource\) \{\s*if \(metodo !== "GET"\)[\s\S]{0,250}405/.test(PUBLIC_API), "la raíz no da 405 a lo que no es GET");
  // Y los dos clientes van sin reintentos escondidos: el de service_role en toda
  // escritura, el de la persona siempre.
  const clientes = [...PUBLIC_API.matchAll(/createClient\(/g)];
  assertEquals(clientes.length, 1, "index.ts arma más de un cliente");
  const argumentos = elementosDesde(PUBLIC_API, clientes[0].index! + "createClient(".length).elementos;
  assert((argumentos[1] ?? "").includes("SUPABASE_SERVICE_ROLE_KEY"), "el cliente de index.ts no es el de service_role");
  const opciones = argumentos[2] ?? "";
  assert(/metodo\s*===\s*"GET"\s*\?\s*\{\s*\}\s*:\s*\{\s*global:\s*\{\s*fetch:\s*fetchSinReintentos\(\s*PLAZO_ADMIN_MS\s*\)\s*\}\s*\}/.test(opciones),
    `el cliente de service_role no va con fetchSinReintentos en las escrituras: ${opciones}`);
  // El contador caído corta una escritura antes de api_key_vigente y del conteo.
  const caido = PUBLIC_API.search(/if\s*\(\s*consumoErr\s*&&\s*metodo\s*!==\s*"GET"\s*\)\s*return\s+noDisponible/);
  assert(caido > 0 && caido < PUBLIC_API.indexOf('rpc("api_key_vigente"') && caido < PUBLIC_API.indexOf('from("tenants")'),
    "sin contador, una escritura no se corta antes de api_key_vigente y del conteo de agencias");
  // La demora de la base se mide ANTES de leer el cuerpo (lo lento del cliente no cuenta).
  const demora = PUBLIC_API.indexOf("const demoraDeLaBase = Date.now() - t0;");
  assert(demora > PUBLIC_API.indexOf('from("tenants")') && demora < lectura, "la demora de la base no se mide entre el conteo y el cuerpo");
  assert(PUBLIC_API.indexOf("const t0 = Date.now();") < PUBLIC_API.indexOf('from("api_keys")'), "t0 no se toma al entrar el pedido");
});

Deno.test("lo como_usuario no toca las tablas caras ni las de admins", () => {
  // chat_message_deletions la puede leer cualquier admin de Maven (no solo los que
  // estaban en la conversación); los acuses cuestan 29k bloques por página.
  for (const t of ["chat_message_deletions", "chat_messages_rich_respaldo", "chat_read_receipts", "get_unread_counts"]) {
    assert(!RECURSOS_USUARIO.includes(`"${t}"`), `recursos-como-usuario.ts usa ${t}`);
  }
});

Deno.test("toda consulta a chat_messages va acotada por conversación, sin count ni embeds", () => {
  // Sin conversation_id, la RLS recorre los mensajes de TODA la plataforma: 82k+
  // bloques y hasta 1,3 s por pedido (medido el 25/09).
  const sentencias: string[] = [];
  let i = RECURSOS_USUARIO.indexOf('from("chat_messages")');
  while (i !== -1) {
    const fin = RECURSOS_USUARIO.indexOf(";", i);
    sentencias.push(RECURSOS_USUARIO.slice(i, fin === -1 ? undefined : fin));
    i = RECURSOS_USUARIO.indexOf('from("chat_messages")', i + 1);
  }
  assert(sentencias.length >= 2, `se esperaban al menos 2 consultas a chat_messages, hay ${sentencias.length}`);
  for (const st of sentencias) {
    assert(/\.(eq|in)\(\s*"conversation_id"/.test(st), `consulta a chat_messages sin conversation_id: ${st.slice(0, 120)}`);
  }
  // `count: "exact"` (y sus primos) le pide a la base contar TODO lo que la RLS deja
  // ver; `count:` a secas es un campo de la respuesta y está bien.
  assert(!/count\s*:\s*["'`](exact|planned|estimated)/.test(RECURSOS_USUARIO), "recursos-como-usuario.ts pide un count (recorre todo)");
  assert(!/\bhead\s*:\s*true/.test(RECURSOS_USUARIO), "recursos-como-usuario.ts pide solo el conteo (head: true)");
  // Las columnas se piden de constantes COLS_* o literales, y ninguna trae embeds.
  for (const m of RECURSOS_USUARIO.matchAll(/\.select\(\s*([^)]*)\)/g)) {
    const arg = m[1].trim();
    assert(/^"[^"(]*"$/.test(arg) || /^COLS_[A-Z_]+$/.test(arg) || /^\w+\.\w+\s*\?\s*COLS_[A-Z_]+\s*:\s*COLS_[A-Z_]+$/.test(arg),
      `select con algo que no es una lista fija de columnas: ${arg}`);
  }
  for (const m of RECURSOS_USUARIO.matchAll(/const (COLS_[A-Z_]+)\s*=\s*([^;]+);/g)) {
    assert(!m[2].includes("("), `${m[1]} trae un embed`);
  }
});

Deno.test("paginas del Messenger topan en 100", () => {
  assert(/export const PAGINA_MAX = 100;/.test(FORMATO_MESSENGER), "cambió el tope de página");
  assert(/n > PAGINA_MAX/.test(FORMATO_MESSENGER), "limiteDePagina no aplica el tope");
});

// ─── 8. Idioma: todo texto para el cliente sale de mensajes.ts ───────────────
// El comportamiento (negociación, textos, byte a byte el español de antes) se prueba
// en mensajes.test.ts. Aquí, que el código no se saltee el diccionario.

/** Hasta dónde llega un string que empieza en `i` (índice de la comilla de cierre). */
function finDeString(src: string, i: number): number {
  const comilla = src[i];
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] === "\\") { j++; continue; }
    if (src[j] === comilla) return j;
  }
  return src.length;
}

/** Dónde termina la expresión que arranca en `desde`: el índice de la coma o del
 *  cierre de su nivel (o el final del código). */
function finDeExpresion(src: string, desde: number): number {
  let nivel = 0;
  for (let i = desde; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") { i = finDeString(src, i); continue; }
    if ("([{".includes(c)) nivel++;
    else if (")]}".includes(c)) {
      if (nivel === 0) return i;
      nivel--;
    } else if (c === "," && nivel === 0) return i;
  }
  return src.length;
}

/** La expresión que arranca en `desde`, hasta la coma o el cierre de su nivel. */
function expresionDesde(src: string, desde: number): string {
  return src.slice(desde, finDeExpresion(src, desde)).trim();
}

/** Los elementos separados por comas que arrancan en `desde`, hasta el cierre de su
 *  nivel: los argumentos de una llamada o las propiedades de un objeto. Una coma
 *  final (`f(a, b,)`) no cuenta como un elemento más. */
function elementosDesde(src: string, desde: number): { elementos: string[]; cierre: number } {
  const elementos: string[] = [];
  let i = desde;
  for (;;) {
    const fin = finDeExpresion(src, i);
    elementos.push(src.slice(i, fin).trim());
    if (src[fin] !== ",") {
      if (elementos.length > 1 && elementos[elementos.length - 1] === "") elementos.pop();
      return { elementos, cierre: fin };
    }
    i = fin + 1;
  }
}

/** Cada llamada a `nombre(...)` de un código (no `x.nombre(` ni `otronombre(`): sus
 *  argumentos, ya separados. */
function llamadasDe(nombre: string, src: string): string[][] {
  const out: string[][] = [];
  for (const m of src.matchAll(new RegExp(`(?<![\\w$.])${nombre}\\s*\\(`, "g"))) {
    out.push(elementosDesde(src, m.index! + m[0].length).elementos);
  }
  return out;
}

/** Cada llamada a msg(...) de un código: sus argumentos, ya separados. */
const llamadasAMsg = (src: string) => llamadasDe("msg", src);

/** Las claves de un objeto literal `{ a: 1, b }`, o null si `expr` no es exactamente
 *  un objeto literal de claves simples (sin `...`, `[clave]:` ni métodos). */
function clavesDeObjeto(expr: string): string[] | null {
  const t = expr.trim();
  if (!t.startsWith("{")) return null;
  const { elementos, cierre } = elementosDesde(t, 1);
  if (t[cierre] !== "}" || cierre !== t.length - 1) return null;
  const claves: string[] = [];
  for (const e of elementos) {
    if (e === "") continue;
    const m = e.match(/^([A-Za-z_$][\w$]*)\s*(?::|$)/) ?? e.match(/^"([A-Za-z_$][\w$]*)"\s*:/);
    if (!m) return null;
    claves.push(m[1]);
  }
  return claves;
}

/** La expresión sin sus llamadas a msg(...). */
function sinLlamadasAMsg(expr: string): string {
  let out = "";
  let desde = 0;
  const re = /(?<![\w$.])msg\s*\(/g;
  for (let m = re.exec(expr); m; m = re.exec(expr)) {
    out += expr.slice(desde, m.index);
    let nivel = 1;
    let i = m.index + m[0].length;
    for (; i < expr.length && nivel > 0; i++) {
      const c = expr[i];
      if (c === '"' || c === "'" || c === "`") { i = finDeString(expr, i); continue; }
      if ("([{".includes(c)) nivel++;
      else if (")]}".includes(c)) nivel--;
    }
    desde = i;
    re.lastIndex = i;
  }
  return out + expr.slice(desde);
}

Deno.test("idioma: index.ts no devuelve ni un texto suelto, todo `message` sale de msg()", () => {
  // Lo que se pasa tal cual: textos que ya vienen en el idioma del pedido (el
  // veredicto de la puerta, el mensaje del handler) y el error de la BASE en los 500
  // (no es nuestro, y así fue siempre).
  const PASAN_TAL_CUAL = new Set(["veredicto.motivo", "r.mensaje", "error.message", "mErr.message"]);
  // `message` que no es un error: un campo de DATOS de /sales.
  const DATOS = new Set(["x.message_gross ?? 0"]);
  const deError = new Set<number>();
  for (const m of PUBLIC_API.matchAll(/\berror:\s*(?:"[a-z_]+"|[\w.]+)\s*,\s*message\s*:/g)) {
    deError.add(m.index! + m[0].length);
  }
  assert(deError.size >= 25, `se esperaban al menos 25 errores con message, hay ${deError.size}: se rompió la búsqueda`);
  let conMsg = 0;
  for (const m of PUBLIC_API.matchAll(/\bmessage\s*:/g)) {
    const fin = m.index! + m[0].length;
    const valor = expresionDesde(PUBLIC_API, fin);
    if (!deError.has(fin)) {
      assert(DATOS.has(valor), `un message que no es de error ni de datos conocidos: ${valor}`);
      continue;
    }
    if (PASAN_TAL_CUAL.has(valor)) continue;
    assert(/(?<![\w$.])msg\s*\(/.test(valor), `un message que no sale de msg(): ${valor}`);
    // Fuera de las llamadas a msg() solo puede quedar un `cond ? … : …`.
    const resto = sinLlamadasAMsg(valor).replace(/\s+/g, "");
    assert(resto === "" || /^[A-Za-z_$][\w$]*\?:$/.test(resto), `un message con texto fuera de msg(): ${valor}`);
    conMsg++;
  }
  assert(conMsg >= 20, `se esperaban al menos 20 message con msg(), hay ${conMsg}`);
  // Lo de arriba solo mira `message:` seguido de un valor. La forma abreviada
  // (`const message = "Creadora no encontrada"; json(req, { error: "not_found", message })`),
  // la clave entre comillas (`"message": "…"`) o una variable o parámetro llamado
  // message se lo saltearían: en index.ts, `message` solo puede ser `message:` o `.message`.
  assert(!/[{,]\s*message\s*[,}]/.test(PUBLIC_API), "un `message` abreviado ({ message }) que no pasa por msg()");
  const sueltos = [...PUBLIC_API.matchAll(/(?<![\w$.])message(?![\w$])(?!\s*\??\s*:)/g)]
    .map((m) => PUBLIC_API.slice(Math.max(0, m.index! - 30), m.index! + 30).replace(/\s+/g, " "));
  assertEquals(sueltos, [], "index.ts usa `message` como variable, parámetro o clave entre comillas");
});

Deno.test("idioma: cada msg() usa el idioma del pedido, nunca uno fijo", () => {
  // index.ts: el del pedido, calculado una vez.
  assertEquals((PUBLIC_API.match(/const idioma = idiomaDelPedido\(req\);/g) ?? []).length, 1, "index.ts no calcula el idioma del pedido una sola vez");
  assert(!/\blet\s+idioma\b|\bidioma\s*=[^=>]/.test(PUBLIC_API.replace("const idioma = idiomaDelPedido(req);", "")), "index.ts reasigna el idioma");
  for (const [primero] of llamadasAMsg(PUBLIC_API)) {
    assert(primero === "idioma" || primero === "idiomaDelPedido(req)", `index.ts llama a msg() con idioma ${primero}`);
  }
  // Y lo pasa a la puerta (guarda de arriba) y a los handlers como_usuario.
  const entrada = PUBLIC_API.slice(PUBLIC_API.indexOf("await servirComoUsuario("));
  const contexto = expresionDesde(entrada, entrada.indexOf("{"));
  assert(/(^|[{,\s])idioma\s*(,|}|$)/.test(contexto), "el Contexto de servirComoUsuario no lleva el idioma");
  // recursos-como-usuario.ts: el del Contexto (o el parámetro `idioma` de malPedido/noEncontrada).
  const llamadasR = llamadasAMsg(RECURSOS_USUARIO);
  assert(llamadasR.length >= 6, "no se encontraron las llamadas a msg() de recursos-como-usuario.ts");
  for (const [primero] of llamadasR) {
    assert(primero === "ctx.idioma" || primero === "idioma", `recursos-como-usuario.ts llama a msg() con idioma ${primero}`);
  }
  for (const f of ["malPedido", "noEncontrada"]) {
    const usos = [...RECURSOS_USUARIO.matchAll(new RegExp(`(?<!const )\\b${f}\\(`, "g"))];
    assert(usos.length >= 1, `no se encontró ${f}`);
    for (const u of usos) {
      const primero = expresionDesde(RECURSOS_USUARIO, u.index! + u[0].length);
      assert(primero === "ctx.idioma", `${f}() recibe ${primero} y no ctx.idioma`);
    }
  }
  assert(/\bidioma\s*:\s*Idioma\s*;/.test(RECURSOS_USUARIO.match(/export\s+type\s+Contexto\s*=\s*\{([\s\S]*?)\n\};/)?.[1] ?? ""),
    "Contexto no declara idioma: Idioma (obligatorio)");
  // aislamiento.ts: el parámetro de decidir.
  const llamadasA = llamadasAMsg(AISLAMIENTO_TS);
  assertEquals(llamadasA.length, 3, "decidir tiene que armar sus 3 motivos con msg()");
  for (const [primero] of llamadasA) assertEquals(primero, "idioma", "decidir arma un motivo con un idioma fijo");
  assert(!/motivo\s*:\s*["'`]/.test(AISLAMIENTO_TS), "decidir arma un motivo con texto suelto");
});

Deno.test("idioma: cada msg() nombra una clave que EXISTE y le pasa exactamente sus variables", () => {
  // El tipo de msg() ya lo exige, pero CI corre `deno test --no-check`: con
  // `msg(idioma, "creadora_no_encontradx")` o `msg(idioma, "falta_scope")` sin su
  // variable pasaban todos los tests. Aquí se mira en el código, llamada por llamada,
  // en los tres archivos que responden.
  type ConVars = { vars?: readonly string[] };
  const entrada = (k: string) => Object.hasOwn(MENSAJES, k) ? (MENSAJES as Record<string, ConVars>)[k] : null;
  /** La clave de un literal "…" o '…'; null si no es un literal. */
  const literal = (arg: string) => arg.match(/^"([a-z_]+)"$/)?.[1] ?? arg.match(/^'([a-z_]+)'$/)?.[1] ?? null;
  const usadas = new Set<string>();
  const revisar = (archivo: string, args: string[], clave: string) => {
    const e = entrada(clave);
    assert(e, `${archivo}: msg() con una clave que no existe en MENSAJES: "${clave}"`);
    usadas.add(clave);
    const vars = [...(e.vars ?? [])].sort();
    if (vars.length === 0) {
      assertEquals(args.length, 2, `${archivo}: "${clave}" no lleva variables y msg() recibe de más: ${args.join(", ")}`);
      return;
    }
    assertEquals(args.length, 3, `${archivo}: msg(…, "${clave}") sin sus variables (${vars.join(", ")})`);
    const claves = clavesDeObjeto(args[2]);
    assert(claves, `${archivo}: las variables de "${clave}" no son un objeto literal: ${args[2]}`);
    assertEquals([...claves].sort(), vars, `${archivo}: msg(…, "${clave}") con variables que no son las suyas`);
  };

  const archivos: [string, string][] = [
    ["index.ts", PUBLIC_API],
    ["recursos-como-usuario.ts", RECURSOS_USUARIO],
    ["aislamiento.ts", AISLAMIENTO_TS],
  ];
  let llamadas = 0;
  for (const [archivo, src] of archivos) {
    for (const args of llamadasAMsg(src)) {
      llamadas++;
      const clave = literal(args[1] ?? "");
      if (clave !== null) {
        revisar(archivo, args, clave);
        continue;
      }
      // La única clave que no es un literal: la de malPedido, que el tipo ClaveSinVars
      // ata a las claves SIN variables. Cada llamada a malPedido se revisa abajo.
      assert(
        archivo === "recursos-como-usuario.ts" && args.join(", ") === "idioma, clave",
        `${archivo}: msg() con una clave que no es un texto literal: msg(${args.join(", ")})`,
      );
    }
  }
  assert(llamadas >= 30, `se esperaban al menos 30 llamadas a msg(), hay ${llamadas}: se rompió la búsqueda`);

  // malPedido: la única que recibe la clave de afuera. Definida una sola vez, con
  // msg(idioma, clave); y cada llamada, con una clave literal que exista y sin variables.
  assertEquals(llamadasAMsg(RECURSOS_USUARIO).filter((a) => a[1] === "clave").length, 1, "más de un msg() con la clave de afuera");
  assert(
    /const malPedido = \(idioma: Idioma, clave: ClaveSinVars\): Resultado => \(\{[^;]*mensaje: msg\(idioma, clave\)/.test(RECURSOS_USUARIO),
    "malPedido cambió de forma: el msg(idioma, clave) de afuera solo se permite ahí",
  );
  const malPedidos = llamadasDe("malPedido", RECURSOS_USUARIO);
  assert(malPedidos.length >= 10, `se esperaban al menos 10 malPedido(), hay ${malPedidos.length}: se rompió la búsqueda`);
  for (const args of malPedidos) {
    assertEquals(args.length, 2, `malPedido(${args.join(", ")}): tiene que ser malPedido(ctx.idioma, "clave")`);
    const clave = literal(args[1]);
    assert(clave, `malPedido con una clave que no es un texto literal: ${args[1]}`);
    revisar("recursos-como-usuario.ts (malPedido)", ["idioma", args[1]], clave);
  }

  // Y ningún texto del diccionario quedó sin usar: su versión en español es la que
  // mensajes.test.ts compara byte a byte con la de antes, y tiene que ser la que sale.
  const sinUsar = Object.keys(MENSAJES).filter((k) => !usadas.has(k));
  assertEquals(sinUsar, [], "textos de mensajes.ts que ningún archivo usa");
});

Deno.test("idioma: lo que va SOLO al log queda en español (no pasa por msg() ni por el idioma)", () => {
  // Una búsqueda o una alerta sobre el log no puede depender del Accept-Language de
  // quien llamó: el 503 de la puerta llegó a loguear `veredicto.motivo`, que en un
  // pedido en inglés salía en inglés.
  const enElIdiomaDelCliente = /(?<![\w$.])msg\s*\(|\bidioma\b|\bidiomaDelPedido\b|\.motivo\b|\.mensaje\b/;
  const noDisponibles = llamadasDe("noDisponible", PUBLIC_API);
  assert(noDisponibles.length >= 6, `se esperaban al menos 6 noDisponible(), hay ${noDisponibles.length}: se rompió la búsqueda`);
  for (const [, donde, detalle] of noDisponibles) {
    for (const arg of [donde ?? "", detalle ?? ""]) {
      assert(!enElIdiomaDelCliente.test(arg), `noDisponible loguea algo en el idioma del cliente: ${arg}`);
    }
  }
  for (const args of llamadasDe("console\\.(?:error|warn|log|info)", PUBLIC_API)) {
    assert(!enElIdiomaDelCliente.test(args.join(", ")), `index.ts loguea algo en el idioma del cliente: ${args.join(", ")}`);
  }
  // recursos-como-usuario.ts: `detalle` (lo que se loguea en un 503) y falla().
  const detalles = [...RECURSOS_USUARIO.matchAll(/\bdetalle\s*:/g)]
    .map((m) => expresionDesde(RECURSOS_USUARIO, m.index! + m[0].length));
  const fallas = llamadasDe("falla", RECURSOS_USUARIO).map((a) => a.join(", "));
  assert(detalles.length >= 3 && fallas.length >= 10, "no se encontraron los detalle/falla(): se rompió la búsqueda");
  for (const valor of [...detalles, ...fallas]) {
    assert(!enElIdiomaDelCliente.test(valor), `recursos-como-usuario.ts loguea algo en el idioma del cliente: ${valor}`);
  }
});

Deno.test("idioma: recursos-como-usuario.ts no arma ningún `mensaje` con texto suelto", () => {
  const usos = [...RECURSOS_USUARIO.matchAll(/\bmensaje\s*:/g)];
  let tipos = 0;
  for (const u of usos) {
    const valor = expresionDesde(RECURSOS_USUARIO, u.index! + u[0].length);
    // La declaración del tipo Resultado.
    if (valor === "string }" || valor === "string") { tipos++; continue; }
    assert(/^msg\s*\(/.test(valor) && sinLlamadasAMsg(valor).trim() === "", `un mensaje que no sale de msg(): ${valor}`);
  }
  assertEquals(tipos, 1, "se esperaba una sola declaración de tipo de `mensaje` (en Resultado)");
  assert(usos.length >= 6, "no se encontraron los mensajes de recursos-como-usuario.ts");
  assert(!/[{,]\s*mensaje\s*[,}]/.test(RECURSOS_USUARIO), "un `mensaje` abreviado ({ mensaje }) que no pasa por msg()");
});

Deno.test("idioma: las respuestas JSON llevan Vary: Accept-Language sin pisar el Vary: Origin", () => {
  const helper = PUBLIC_API.slice(PUBLIC_API.indexOf("const json = "), PUBLIC_API.indexOf("const noDisponible"));
  assert(helper.length > 50, "no se encontró el helper json");
  const extra = helper.indexOf("...extra");
  const vary = helper.search(/"Vary"\s*:\s*varyConIdioma\(\s*cors\[\s*"Vary"\s*\]\s*\)/);
  assert(extra > 0 && vary > extra, "Vary no se arma con varyConIdioma(cors.Vary) DESPUÉS de ...extra");
  assert(!/new Response\(\s*JSON\.stringify/.test(PUBLIC_API.replace(helper, "")), "hay respuestas JSON armadas fuera del helper json");
});

Deno.test("mensajes.ts es PURO: no importa nada ni toca la base", () => {
  // recursos-como-usuario.ts importa valores de aquí: si esto importara algo, por aquí
  // entraría un cliente con service_role.
  for (const prohibido of [
    /^\s*import\b/m, /\bimport\s*\(/, /^\s*export\s*(\*|\{)[^;]*\bfrom\b/m, /\brequire\s*\(/,
    /SupabaseClient/, /createClient/, /\bDeno\./, /\bfetch\s*\(/, /service_?role/i,
    /\.from\(/, /\.rpc\(/, /\badmin\b/, /\byo\b/, /\bglobalThis\b/, /\beval\s*\(/, /\bFunction\s*\(/,
  ]) {
    assert(!prohibido.test(MENSAJES_TS), `mensajes.ts usa ${prohibido}`);
  }
  assert(/export function msg</.test(MENSAJES_TS) && /export function idiomaDelPedido\(/.test(MENSAJES_TS), "mensajes.ts cambió de forma");
});
