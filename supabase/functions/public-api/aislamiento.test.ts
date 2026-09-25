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

import { assert, assertEquals } from "jsr:@std/assert";
import {
  AISLAMIENTO_POR_RECURSO,
  decidir,
  esComoUsuario,
  FUENTES_POR_RECURSO,
  INFRAESTRUCTURA,
  type ModoDeAislamiento,
} from "./aislamiento.ts";
import { RECURSOS_COMO_USUARIO, SCOPE_REQUERIDO } from "./recursos-como-usuario.ts";
import { isValidScope } from "../manage-api-keys/api-scopes.ts";

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
const COMO_USUARIO = leer("./como-usuario.ts");
const PETICION = leer("./peticion.ts");
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
  // exige arreglar su `pendiente` Y actualizar esta lista a conciencia. Si tocás
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
    "un recurso pasó a 'columna' o 'miembros' sin registrarse acá",
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
      "Agregala a FUENTES_POR_RECURSO en ./aislamiento.ts, bajo el recurso que la usa.",
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
  assert(/decidir\(\s*recursoClave\s*,\s*cantidadDeAgencias\s*\)/.test(PUBLIC_API), "la puerta no usa el conteo");
  assert(!/cantidadDeAgencias\s*=\s*1\b/.test(PUBLIC_API), "el conteo de agencias está fijado en 1");
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

Deno.test("como_usuario: cada recurso declara su scope, y es un scope que existe", () => {
  assertEquals(Object.keys(SCOPE_REQUERIDO).sort(), Object.keys(RECURSOS_COMO_USUARIO).sort(),
    "un recurso como_usuario no declara qué scope necesita (o sobra uno)");
  for (const [recurso, scope] of Object.entries(SCOPE_REQUERIDO)) {
    assert(scope === null || isValidScope(scope), `${recurso} pide un scope que no existe: ${scope}`);
  }
  // Solo /me puede ir sin scope: saber como quién actúa la llave es lo mínimo.
  const sinScope = Object.entries(SCOPE_REQUERIDO).filter(([, s]) => s === null).map(([r]) => r);
  assertEquals(sinScope, ["me"], "un recurso como_usuario quedó sin scope");
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
  // La única excepción: las piezas PURAS del Messenger, que el test de abajo obliga a
  // no importar nada ni tocar la base.
  const importsDeValores = (RECURSOS_USUARIO.match(/^\s*import\s+(?!type\b)[^;]*/gm) ?? [])
    .filter((i) => !/from\s+"\.\/messenger-formato\.ts"\s*$/.test(i.trim()));
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
  // El router entra por servirComoUsuario (que verifica la sesión) con el cliente de
  // la persona, y solo ese. Nada de despachar handlers sueltos.
  assert(/await\s+servirComoUsuario\(\s*recursoClave\s*,\s*yo\s*,/.test(PUBLIC_API), "el router no entra por servirComoUsuario con `yo`");
  const inicioRama = PUBLIC_API.indexOf("if (esComoUsuario(recursoClave))");
  const finRama = PUBLIC_API.indexOf('resource === "creators"', inicioRama);
  assert(inicioRama > 0 && finRama > inicioRama, "no se encontró la rama como_usuario del router");
  const rama = PUBLIC_API.slice(inicioRama, finRama);
  assert(!/\badmin\b/.test(rama), "la rama como_usuario del router usa `admin`");
  // En la rama solo se llaman estas funciones: ninguna otra puede servir datos (un
  // handler armado afuera con `admin` y llamado acá saltearía el scope y la agencia).
  const llamadas = [...rama.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]);
  const PERMITIDAS = new Set(["if", "catch", "esComoUsuario", "noDisponible", "comoUsuarioConfigurado", "clienteComoUsuario", "servirComoUsuario", "json"]);
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

Deno.test("lo como_usuario no escribe: fase de solo lectura", () => {
  // Leer NO marca como leído ni entregado. Escribir es otra fase, con su revisión.
  for (const prohibido of [/\.insert\(/, /\.update\(/, /\.upsert\(/, /\.delete\(/]) {
    assert(!prohibido.test(RECURSOS_USUARIO), `recursos-como-usuario.ts escribe (${prohibido})`);
  }
  const rpcs = [...RECURSOS_USUARIO.matchAll(/\.rpc\(\s*"([a-z_]+)"/g)].map((m) => m[1]).sort();
  const PERMITIDAS = ["current_tenant_id", "get_last_messages", "messenger_unread_counts"];
  assertEquals([...new Set(rpcs)].filter((r) => !PERMITIDAS.includes(r)), [], "una función de base no autorizada");
  assert(!/\.(from|rpc)\(\s*[^"\s]/.test(RECURSOS_USUARIO), "from()/rpc() con un nombre que no es literal");
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
