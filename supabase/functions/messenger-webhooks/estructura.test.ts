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
  assertEquals(usos.sort(), ["despachador.ts: l))", 'index.ts: lineaDeLog(null, "error", { clase: "interno" }))'].sort());
  for (const f of NO_TEST) {
    const c = codigo(f);
    assert(!/\.message\b|\.details\b|\.hint\b|\.detalle\b(?!\))/.test(c.replace(/r\.detalle\)/g, "")), `${f} usa message/details/hint`);
  }
  // Las acciones y clases son uniones cerradas: anotar() no recibe texto libre.
  const d = codigo("despachador.ts");
  assert(/export type AccionLog =/.test(d) && /export type ClaseLog =/.test(d));
  assert(!/anotar\([^)]*`/.test(d), "anotar() con un template");
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

Deno.test("el guard corre los tests del despachador y el banco PGlite", () => {
  const guard = Deno.readTextFileSync(new URL(".github/workflows/guard-edge-functions.yml", RAIZ));
  assert(guard.includes("supabase/functions/messenger-webhooks/"));
  assert(guard.includes("supabase/tests/api_webhooks_tablas.ts"));
  for (const p of ['"supabase/config.toml"', '"supabase/migrations/**"', '"supabase/tests/**"']) assert(guard.includes(p), p);
  const deploy = Deno.readTextFileSync(new URL(".github/workflows/deploy-edge-functions.yml", RAIZ));
  assert(deploy.includes("supabase/functions/messenger-webhooks/"), "el guard del deploy también");
});
