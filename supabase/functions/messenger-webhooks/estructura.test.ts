// Guardas que leen el código (sin red ni base): lo que un cambio futuro no puede
// romper en silencio. El comportamiento está en despachador.test.ts y feed.test.ts.
// Correr: deno test --allow-read --no-lock supabase/functions/messenger-webhooks/estructura.test.ts

import { assert, assertEquals } from "jsr:@std/assert";

const aqui = (f: string) => new URL(`./${f}`, import.meta.url);
const leer = (f: string) => Deno.readTextFileSync(aqui(f));
/** Sin comentarios de línea ni de bloque (para que una mención en un comentario no cuente). */
const codigo = (f: string) =>
  leer(f).replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).map((l) => l.replace(/\s\/\/.*$/, "")).join("\n");
const RAIZ = new URL("../../../", import.meta.url);
const NO_TEST = ["index.ts", "despachador.ts", "datos.ts", "feed.ts", "token.ts"];

Deno.test("datos.ts: con service_role solo lo del webhook (nunca chat_* ni profiles)", () => {
  const c = codigo("datos.ts");
  const tablas = [...c.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1]);
  assertEquals([...new Set(tablas)].sort(), ["api_keys", "api_webhook_deliveries", "api_webhook_endpoints", "tenants"]);
  const rpcs = [...c.matchAll(/\.rpc\("([a-z_]+)"/g)].map((m) => m[1]);
  assertEquals([...new Set(rpcs)].sort(), ["api_key_vigente", "api_webhooks_reclamar", "api_webhooks_timbrar"]);
  for (const f of NO_TEST) assert(!/chat_|profiles/.test(codigo(f).replace(/public-api\/[a-z-]+\.ts/g, "")), `${f} nombra chat_* o profiles`);
});

Deno.test("datos.ts: toda consulta a api_keys y api_webhook_* va atada a la agencia, salvo el respaldo de multi_agency", () => {
  const c = codigo("datos.ts");
  const sentencias: string[] = [];
  for (const m of c.matchAll(/\.from\("(api_keys|api_webhook_endpoints|api_webhook_deliveries)"\)/g)) {
    const fin = c.indexOf(";", m.index!);
    sentencias.push(c.slice(m.index!, fin));
  }
  // llave, pendiente, el cambio del endpoint, la anotación del timbre, soltar y el
  // respaldo de multi_agency (el timbre nuevo va por el rpc api_webhooks_timbrar).
  assertEquals(sentencias.length, 6, "cambió la cantidad de consultas: revisá que la nueva filtre por agencia");
  const sueltas = sentencias.filter((s) => !/\.eq\("tenant_id", (g\.tenantId|tenantId)\)/.test(s));
  assertEquals(sueltas.length, 1, `solo el respaldo de multi_agency va sin agencia: ${sueltas.map((s) => s.slice(0, 80)).join(" | ")}`);
  assert(/multi_agency/.test(sueltas[0]) && /\.neq\("status", "disabled"\)/.test(sueltas[0]), "y es ese, y solo detiene");
  // Toda escritura sobre el endpoint (salvo soltar y el respaldo) lleva la guarda completa.
  const cambios = sentencias.filter((s) => s.includes("api_webhook_endpoints") && s.includes(".update(cambios)"));
  assertEquals(cambios.length, 1);
  for (const filtro of ['.eq("lease_until", g.reclamo)', '.eq("status", "active")', '.eq("cursor_at", g.cursorAt)', '.eq("cursor_id", g.cursorId)']) {
    assert(cambios[0].includes(filtro), `la guarda del endpoint perdió ${filtro}`);
  }
  const timbres = sentencias.filter((s) => s.includes("api_webhook_deliveries") && s.includes(".update(cambios)"));
  assertEquals(timbres.length, 1);
  assert(timbres[0].includes('.eq("state", "pending")'), "toda escritura sobre un timbre va con state = pending");
});

Deno.test("feed.ts: el feed del API por su única entrada, como la persona (no una copia, no el handler directo)", () => {
  const c = codigo("feed.ts");
  const imports = [...c.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+"([^"]+)"/g)].map((m) => ({ tipo: !!m[1], nombres: m[2].split(",").map((x) => x.trim()).filter(Boolean).sort(), de: m[3] }));
  const dePublic = imports.filter((i) => i.de.startsWith("../public-api/"));
  assertEquals(dePublic, [
    { tipo: false, nombres: ["clienteComoUsuario"], de: "../public-api/como-usuario.ts" },
    { tipo: false, nombres: ["DETALLE_TOPE_CONVERSACIONES", "servirComoUsuario"], de: "../public-api/recursos-como-usuario.ts" },
  ]);
  for (const prohibido of ["servirMessenger", "servirMe", "RECURSOS_COMO_USUARIO", "crearServidorComoUsuario", "SCOPE_REQUERIDO", "createClient", "SERVICE_ROLE", "chat_messages"]) {
    assert(!c.includes(prohibido), `feed.ts no puede usar ${prohibido}`);
  }
  assertEquals([...c.matchAll(/servirComoUsuario\("messenger", yo,/g)].length, 1);
  assert(c.includes("actuaComo: p.persona") && c.includes("agenciaDeLaLlave: p.agencia"), "la sesión y el contexto son de la misma persona y agencia");
  // La sesión se fabrica para p.persona (con clienteComoUsuario por defecto): si no, el
  // feed se leería con la RLS de otra persona, o el despachador quedaría mudo.
  assertEquals([...c.matchAll(/fabricar: FabricarSesion = clienteComoUsuario/g)].length, 1);
  assertEquals([...c.matchAll(/\bfabricar\(/g)].length, 1);
  assertEquals([...c.matchAll(/\bfabricar\(p\.persona,/g)].length, 1);
  assertEquals([...c.matchAll(/clienteComoUsuario\(/g)].length, 0, "clienteComoUsuario solo como fábrica por defecto");
  assert(c.includes('ruta: ["feed"]'));
});

Deno.test("ningún archivo del despachador arma un cliente, salvo index.ts (y con service_role solo para datos)", () => {
  for (const f of ["despachador.ts", "datos.ts", "feed.ts", "token.ts"]) assert(!/createClient|SERVICE_ROLE/.test(codigo(f)), f);
  const idx = codigo("index.ts");
  assertEquals([...idx.matchAll(/createClient\(/g)].length, 1);
  assert(idx.includes("leerFeed: leerFeedComoPersona"), "el feed se lee como la persona, no con el cliente de index");
});

Deno.test("logs: solo la plantilla (lineaDeLog), y nunca el mensaje ni el detalle de un error", () => {
  const usos = NO_TEST.flatMap((f) => [...codigo(f).matchAll(/console\.\w+\(([^;\n]*)/g)].map((m) => `${f}: ${m[1]}`));
  assertEquals(usos.sort(), ["despachador.ts: l))", 'index.ts: lineaDeLog(null, "error", { clase: "interno" }))', 'index.ts: lineaDeLog(null, "sin_configurar"))'].sort());
  for (const f of NO_TEST) {
    const c = codigo(f);
    assert(!/\.message\b|\.details\b|\.hint\b|\.detalle\b(?!\))/.test(c.replace(/r\.detalle\)/g, "")), `${f} usa message/details/hint`);
  }
  // Las acciones y clases son uniones cerradas: anotar() no recibe texto libre.
  const d = codigo("despachador.ts");
  assert(/export type AccionLog =/.test(d) && /export type ClaseLog =/.test(d));
  assert(!/anotar\([^)]*`/.test(d), "anotar() con un template");
});

/** .from( / .rpc( / .schema( (salvo Array.from) y también por corchetes: x["rpc"](. */
const CONSULTA = /(?<!\b(?:Array|Uint8Array))\.\s*(from|rpc|schema)\s*\(|\[\s*["'`](from|rpc|schema)["'`]\s*\]/g;
/** Todos los textos literales, en orden (así las comillas se emparejan bien). */
const TEXTOS = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;

Deno.test("solo datos.ts toca la base, siempre con un nombre literal y sin embebidos de otra tabla", () => {
  for (const f of ["index.ts", "despachador.ts", "feed.ts", "token.ts"]) {
    assertEquals([...codigo(f).matchAll(CONSULTA)].length, 0, `${f} consulta la base directo`);
  }
  const c = codigo("datos.ts");
  assertEquals([...c.matchAll(CONSULTA)].length, [...c.matchAll(/\.(from|rpc)\("[a-z_]+"/g)].length, "datos.ts: una consulta sin nombre literal entre comillas dobles");
  // Un select("…, otra_tabla(…)") de PostgREST trae OTRA tabla sin nombrarla en .from(.
  assertEquals([...c.matchAll(TEXTOS)].map((m) => m[0]).filter((t) => t.includes("(")), [], "datos.ts: un texto con paréntesis (¿un embebido?)");
});

Deno.test("imports: la tabla fija de los cinco archivos, con cualquier comilla, sin re-exportar", () => {
  const permitido: Record<string, string[]> = {
    "index.ts": [
      "https://esm.sh/@supabase/supabase-js@2: createClient",
      "../_shared/webhook-salida.ts: kekConfigurada",
      "../public-api/como-usuario.ts: comoUsuarioConfigurado",
      "./datos.ts: crearDatosDespacho",
      "./despachador.ts: PLAZO_DESPUES_MS,PRESUPUESTO_MS,despachar,lineaDeLog",
      "./feed.ts: fetchConPlazo,leerFeedComoPersona",
      "./token.ts: tokenValido",
    ],
    "despachador.ts": [
      "../public-api/aislamiento.ts: decidir as decidirAislamiento",
      "../public-api/messenger-formato.ts: codificarCursor,decodificarCursor",
    ],
    "datos.ts": [],
    "token.ts": [],
    "feed.ts": [
      "../public-api/como-usuario.ts: clienteComoUsuario",
      "../public-api/recursos-como-usuario.ts: DETALLE_TOPE_CONVERSACIONES,servirComoUsuario",
    ],
  };
  for (const f of NO_TEST) {
    const c = codigo(f);
    assert(!/\bimport\s*\*|\bimport\s*\(|\bexport\s*\*|\bexport\s*(type\s*)?\{[^}]*\}\s*from\b|\brequire\s*\(/.test(c), `${f}: import *, import(), re-export o require`);
    const stmts = [...c.matchAll(/\bimport\s+(type\s+)?\{([^}]*)\}\s*from\s*(["'])([^"']+)\3/g)];
    assertEquals([...c.matchAll(/\bfrom\s*["']|\bimport\s*["']/g)].length, stmts.length, `${f}: un import con otra forma`);
    const reales = stmts.filter((m) => !m[1])
      .map((m) => `${m[4]}: ${m[2].split(",").map((x) => x.trim()).filter((x) => x && !x.startsWith("type ")).sort().join(",")}`)
      .filter((x) => !x.endsWith(": "));
    const mirar = f === "index.ts" ? reales : reales.filter((x) => x.startsWith("../public-api/"));
    assertEquals(mirar.sort(), [...permitido[f]].sort(), f);
  }
});

Deno.test("despachador.ts: todo log( pasa por lineaDeLog", () => {
  const c = codigo("despachador.ts");
  const llamadas = [...c.matchAll(/(?<![.\w])log\(([^\n]*)/g)].map((m) => m[1]);
  assert(llamadas.length >= 1);
  for (const l of llamadas) assert(l.startsWith("lineaDeLog("), `log( con otra cosa: ${l}`);
});

Deno.test("config.toml: cada función tiene su bloque con verify_jwt, y messenger-webhooks va con false", () => {
  const toml = Deno.readTextFileSync(new URL("supabase/config.toml", RAIZ));
  const faltan: string[] = [];
  for (const d of Deno.readDirSync(new URL("supabase/functions/", RAIZ))) {
    if (!d.isDirectory || d.name.startsWith("_")) continue;
    try {
      Deno.statSync(new URL(`supabase/functions/${d.name}/index.ts`, RAIZ));
    } catch {
      continue;
    }
    const m = toml.match(new RegExp(`\\[functions\\.${d.name}\\]\\s*\\nverify_jwt = (true|false)`));
    if (!m) faltan.push(d.name);
  }
  assertEquals(faltan, [], "funciones sin bloque (o sin verify_jwt explícito) en config.toml");
  assert(/\[functions\.messenger-webhooks\]\s*\nverify_jwt = false/.test(toml));
});

Deno.test("imports cruzados: la tabla fija, y el deploy tiene la regla de cada uno", () => {
  const pares = new Set<string>();
  const recorrer = (dir: URL, carpeta: string) => {
    for (const d of Deno.readDirSync(dir)) {
      const url = new URL(d.name + (d.isDirectory ? "/" : ""), dir);
      if (d.isDirectory) {
        recorrer(url, carpeta);
        continue;
      }
      if (!d.name.endsWith(".ts") || d.name.endsWith(".test.ts")) continue;
      const texto = Deno.readTextFileSync(url);
      for (const m of texto.matchAll(/from\s+"\.\.\/([a-z0-9_-]+)\//g)) {
        if (m[1] !== "_shared" && m[1] !== carpeta) pares.add(`${carpeta} → ${m[1]}`);
      }
    }
  };
  for (const d of Deno.readDirSync(new URL("supabase/functions/", RAIZ))) {
    if (d.isDirectory) recorrer(new URL(`supabase/functions/${d.name}/`, RAIZ), d.name);
  }
  assertEquals([...pares].sort(), ["_shared → public-api", "messenger-webhooks → public-api", "parrilla-weekly → parrilla-generate"].sort());
  const yml = Deno.readTextFileSync(new URL(".github/workflows/deploy-edge-functions.yml", RAIZ));
  assert(/grep -q '\^supabase\/functions\/public-api\/' <<< "\$CHANGED"; then FUNCS="\$FUNCS messenger-webhooks manage-api-keys"/.test(yml), "public-api → messenger-webhooks y manage-api-keys (que la lleva por _shared/webhook-salida.ts)");
  assert(/grep -q '\^supabase\/functions\/parrilla-generate\/' <<< "\$CHANGED"; then FUNCS="\$FUNCS parrilla-weekly"/.test(yml));
});

/** Todo lo que alcanza un archivo por imports relativos (transitivo). */
function alcanza(e: URL, v = new Set<string>()): Set<string> {
  if (v.has(e.href)) return v;
  v.add(e.href);
  let t = "";
  try {
    t = Deno.readTextFileSync(e);
  } catch {
    return v;
  }
  for (const m of t.matchAll(/(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g)) alcanza(new URL(m[1], e), v);
  return v;
}

Deno.test("imports cruzados TRANSITIVOS (también por _shared): quién lleva public-api y parrilla-generate en su bundle", () => {
  const FUNCS = new URL("supabase/functions/", RAIZ);
  const llevan: Record<string, string[]> = { "public-api": [], "parrilla-generate": [] };
  for (const d of Deno.readDirSync(FUNCS)) {
    if (!d.isDirectory || d.name.startsWith("_")) continue;
    const idx = new URL(`${d.name}/index.ts`, FUNCS);
    try {
      Deno.statSync(idx);
    } catch {
      continue;
    }
    const r = [...alcanza(idx)];
    for (const carpeta of Object.keys(llevan)) {
      if (d.name !== carpeta && r.some((u) => u.includes(`/supabase/functions/${carpeta}/`))) llevan[carpeta].push(d.name);
    }
    // Cualquier otro cruce entre funciones rompe acá: necesita su regla en el deploy.
    const otros = [...new Set(r.map((u) => u.split("/supabase/functions/")[1]?.split("/")[0]).filter((x) => x && x !== d.name && !x.startsWith("_") && !(x in llevan)))];
    assertEquals(otros, [], `${d.name} importa de ${otros.join(", ")}: sumá la regla al deploy y a este test`);
  }
  assertEquals(llevan["public-api"].sort(), ["manage-api-keys", "messenger-webhooks"], "las que el deploy redespliega cuando cambia public-api/");
  assertEquals(llevan["parrilla-generate"].sort(), ["parrilla-weekly"]);
});

Deno.test("el guard corre los tests del despachador y el banco PGlite", () => {
  const guard = Deno.readTextFileSync(new URL(".github/workflows/guard-edge-functions.yml", RAIZ));
  assert(guard.includes("supabase/functions/messenger-webhooks/"));
  assert(guard.includes("supabase/tests/api_webhooks_tablas.ts"));
  for (const p of ['"supabase/config.toml"', '"supabase/migrations/**"', '"supabase/tests/**"']) assert(guard.includes(p), p);
  const deploy = Deno.readTextFileSync(new URL(".github/workflows/deploy-edge-functions.yml", RAIZ));
  assert(deploy.includes("supabase/functions/messenger-webhooks/"), "el guard del deploy también");
});
