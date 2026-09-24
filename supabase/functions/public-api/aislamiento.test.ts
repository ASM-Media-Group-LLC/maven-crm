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
  FUENTES_POR_RECURSO,
  INFRAESTRUCTURA,
  type ModoDeAislamiento,
} from "./aislamiento.ts";

/** El código sin comentarios de bloque ni líneas que son solo comentario. */
function sinComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .join("\n");
}

const PUBLIC_API = sinComentarios(Deno.readTextFileSync(new URL("./index.ts", import.meta.url)));
const MANAGE_KEYS = sinComentarios(
  Deno.readTextFileSync(new URL("../manage-api-keys/index.ts", import.meta.url)),
);

// ─── 1. `decidir` por comportamiento ────────────────────────────────────────

const MAPA_DE_PRUEBA: Record<string, ModoDeAislamiento> = {
  por_columna: { tipo: "columna", columna: "tenant_id" },
  por_miembros: { tipo: "miembros" },
  suelto: { tipo: "sin_agencia", pendiente: "no se sabe de quién es" },
};

Deno.test("con DOS agencias: lo aislado se sirve, lo suelto se apaga con 403", () => {
  assert(decidir("por_columna", 2, MAPA_DE_PRUEBA).ok);
  assert(decidir("por_miembros", 2, MAPA_DE_PRUEBA).ok);
  const v = decidir("suelto", 2, MAPA_DE_PRUEBA);
  assert(!v.ok && v.estado === 403, "un recurso sin agencia se sirvió con 2 agencias");
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

Deno.test("hoy NINGÚN recurso real dice estar aislado (y con 2 agencias se apagan todos)", () => {
  // Tener una columna tenant_id no alcanza: tiene que decir la verdad. Promover un
  // recurso a 'columna' o 'miembros' es una decisión de seguridad: exige arreglar
  // su `pendiente` Y actualizar esta lista a conciencia. Si tocás esta lista sin
  // haber arreglado el dato, estás abriendo una fuga.
  const PROMOVIDOS_CON_VERIFICACION: string[] = [];

  const promovidos = Object.entries(AISLAMIENTO_POR_RECURSO)
    .filter(([, m]) => m.tipo !== "sin_agencia")
    .map(([r]) => r)
    .sort();
  assertEquals(
    promovidos,
    PROMOVIDOS_CON_VERIFICACION,
    "un recurso pasó a 'columna' o 'miembros' sin registrarse acá",
  );

  for (const recurso of Object.keys(AISLAMIENTO_POR_RECURSO)) {
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
  const usadas = fuentesUsadas(PUBLIC_API);
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
