// Las reglas de messenger:write en manage-api-keys (diseño §2.1), por comportamiento,
// y las guardas que leen index.ts: que las aplique, que la rotación busque la key
// reemplazada en ESTA agencia y de ESTA persona, que la pantalla reciba el catálogo de
// la pantalla (con write desde el PR 5) y que un error de la base al guardar nunca
// salga crudo con un 500.

import { assert, assertEquals } from "jsr:@std/assert";
import {
  CODIGOS_DE_LA_BASE,
  leerNombreVisible,
  leerReemplazo,
  problemaAlCrear,
  problemaAlEditar,
  traducirErrorDeLlave,
} from "./escritura.ts";
import { isValidScope, SCOPE_CATALOG, SCOPE_CATALOG_COMPLETO, SCOPES_MESSENGER, SCOPES_OCULTOS_EN_PANTALLA } from "./api-scopes.ts";
import { TODOS_LOS_MENSAJES } from "./mensajes.ts";

const YO = "3f1c2b7a-9d4e-4a51-8c0f-2e6b7d9a1c35";
const OTRO = "5a2d9c11-7e3b-4f60-9a8b-0c1d2e3f4a5b";
const LEE = ["messenger:read"];
const ESCRIBE = ["messenger:read", "messenger:write"];

Deno.test("catálogo: write existe para validar y, desde el PR 5, la pantalla lo ofrece", () => {
  assert(isValidScope("messenger:write") && isValidScope("messenger:read"));
  // La pantalla ya tiene el nombre visible, la rotación, la confirmación y la retirada:
  // no se esconde nada.
  assertEquals([...SCOPES_OCULTOS_EN_PANTALLA], []);
  assert(SCOPE_CATALOG_COMPLETO.some((s) => s.key === "messenger:write"));
  assert(SCOPE_CATALOG.some((s) => s.key === "messenger:write"));
  assertEquals(SCOPE_CATALOG.map((s) => s.key), SCOPE_CATALOG_COMPLETO.map((s) => s.key));
  // Las dos son de Messenger: IPs exactas, vencimiento y solo en keys nuevas.
  assertEquals([...SCOPES_MESSENGER], ["messenger:read", "messenger:write"]);
});

Deno.test("alta: write exige read, nombre visible y la confirmación PROPIA", () => {
  const base = { scopes: ESCRIBE, nombreVisible: "BLU", confirmaEscrituraComo: YO, quienCrea: YO };
  assertEquals(problemaAlCrear(base), null);
  assertEquals(problemaAlCrear({ ...base, scopes: ["messenger:write"] })?.clave, "messengerEscrituraSinLectura");
  assertEquals(problemaAlCrear({ ...base, scopes: ["messenger:write", "creators:read"] })?.clave, "messengerEscrituraSinLectura");
  assertEquals(problemaAlCrear({ ...base, nombreVisible: null })?.clave, "nombreVisibleRequerido");
  // La confirmación es de quien la crea: la de otro admin, o ninguna, no vale.
  for (const confirma of [undefined, null, "", OTRO, true, YO.toUpperCase()]) {
    assertEquals(problemaAlCrear({ ...base, confirmaEscrituraComo: confirma })?.clave, "confirmarEscrituraMessenger", String(confirma));
  }
  // Sin write: ni nombre visible ni confirmación de escritura.
  assertEquals(problemaAlCrear({ ...base, scopes: LEE, nombreVisible: null, confirmaEscrituraComo: undefined }), null);
  assertEquals(problemaAlCrear({ ...base, scopes: ["creators:read"], nombreVisible: null }), null);
  assertEquals(problemaAlCrear({ ...base, scopes: LEE })?.clave, "nombreVisibleSinEscritura");
  for (const p of [problemaAlCrear({ ...base, nombreVisible: null }), problemaAlCrear({ ...base, scopes: ["messenger:write"] })]) {
    assertEquals(p?.estado, 400);
  }
});

Deno.test("edición: write solo al crear, va con read, el nombre lo cambia su persona; quitar write se permite", () => {
  const base = { scopesHoy: ESCRIBE, scopesNuevos: ESCRIBE, nombreVisibleHoy: "BLU", nombreVisibleNuevo: undefined, actuaComo: YO, quienEdita: YO };
  assertEquals(problemaAlEditar(base), null);
  // Sumarle write a una key que ya existe, aunque ya lea el Messenger.
  assertEquals(problemaAlEditar({ ...base, scopesHoy: LEE, nombreVisibleHoy: null, nombreVisibleNuevo: "BLU" })?.clave, "messengerEscrituraSoloNuevas");
  assertEquals(problemaAlEditar({ ...base, scopesHoy: ["creators:read"], scopesNuevos: ["creators:read", ...ESCRIBE] })?.clave, "messengerEscrituraSoloNuevas");
  // Quitarle read y dejarle write.
  assertEquals(problemaAlEditar({ ...base, scopesNuevos: ["messenger:write"] })?.clave, "messengerEscrituraSinLectura");
  // El nombre visible: solo su persona (403); con write no se puede vaciar.
  assertEquals(problemaAlEditar({ ...base, nombreVisibleNuevo: "BLU 2", quienEdita: OTRO }), { clave: "nombreVisibleSoloDueno", estado: 403 });
  assertEquals(problemaAlEditar({ ...base, nombreVisibleNuevo: "BLU 2" }), null);
  assertEquals(problemaAlEditar({ ...base, nombreVisibleNuevo: null })?.clave, "nombreVisibleRequerido");
  // Quitar write se permite (con o sin el nombre).
  assertEquals(problemaAlEditar({ ...base, scopesNuevos: LEE }), null);
  assertEquals(problemaAlEditar({ ...base, scopesNuevos: LEE, nombreVisibleNuevo: null }), null);
  // Sin write, no se le pone un nombre visible.
  assertEquals(problemaAlEditar({ ...base, scopesHoy: LEE, scopesNuevos: LEE, nombreVisibleHoy: null, nombreVisibleNuevo: "X" })?.clave, "nombreVisibleSinEscritura");
});

Deno.test("leerNombreVisible y leerReemplazo: tipos, vacío = null, uuid en minúsculas", () => {
  assertEquals(leerNombreVisible(undefined), { ok: true, valor: undefined });
  assertEquals(leerNombreVisible(null), { ok: true, valor: null });
  assertEquals(leerNombreVisible("   "), { ok: true, valor: null });
  assertEquals(leerNombreVisible("  BLU "), { ok: true, valor: "BLU" });
  for (const v of [7, {}, ["BLU"], "x".repeat(65)]) assertEquals(leerNombreVisible(v), { ok: false }, JSON.stringify(v));
  assertEquals(leerReemplazo(undefined), { ok: true, valor: null });
  assertEquals(leerReemplazo(YO.toUpperCase()), { ok: true, valor: YO });
  for (const v of ["x", 7, YO + "0"]) assertEquals(leerReemplazo(v), { ok: false });
});

Deno.test("los MV422 de la base (y los CHECK) se traducen; cualquier otro error, no", () => {
  const casos: [unknown, string | null][] = [
    [{ code: "MV422", details: '{"error": "display_name_format"}' }, "nombreVisibleForma"],
    [{ code: "MV422", details: '{"error": "display_name_reserved"}' }, "nombreVisibleReservado"],
    [{ code: "MV422", details: '{"error": "display_name_person"}' }, "nombreVisiblePersona"],
    [{ code: "MV422", details: '{"error": "display_name_taken"}' }, "nombreVisibleOcupado"],
    [{ code: "MV422", details: '{"error": "display_name_required"}' }, "nombreVisibleRequerido"],
    [{ code: "MV422", details: '{"error": "messenger_write_without_read"}' }, "messengerEscrituraSinLectura"],
    [{ code: "MV422", details: '{"error": "messenger_write_only_new_keys"}' }, "messengerEscrituraSoloNuevas"],
    [{ code: "MV422", details: '{"error": "integration_immutable"}' }, "integracionInmutable"],
    [{ code: "MV422", details: '{"error": "integration_not_yours"}' }, "reemplazoInvalido"],
    [{ code: "23514", message: 'new row for relation "api_keys" violates check constraint "api_keys_escritura_con_lectura"' }, "messengerEscrituraSinLectura"],
    [{ code: "23514", message: 'new row for relation "api_keys" violates check constraint "api_keys_escritura_con_nombre"' }, "nombreVisibleRequerido"],
    [{ code: "MV422", details: '{"error": "invalid_text"}' }, null],
    [{ code: "MV422", details: "no es json" }, null],
    [{ code: "P0001", message: "api_keys: una llave con Messenger necesita IPs fijas" }, null],
    [{ code: "23514", message: 'violates check constraint "otro"' }, null],
    [null, null],
    ["boom", null],
  ];
  for (const [error, clave] of casos) assertEquals(traducirErrorDeLlave(error), clave, JSON.stringify(error));
  // Cada clave a la que traduce existe en mensajes.ts.
  for (const c of CODIGOS_DE_LA_BASE) {
    const clave = traducirErrorDeLlave({ code: "MV422", details: JSON.stringify({ error: c }) });
    assert(clave && Object.hasOwn(TODOS_LOS_MENSAJES, clave), c);
  }
});

Deno.test("los códigos que traduce son EXACTAMENTE los que lanza api_keys_nombre_visible en la migración", () => {
  const sql = Deno.readTextFileSync(new URL("../../migrations/20261001200000_api_messenger_escritura.sql", import.meta.url));
  const funcion = sql.slice(sql.indexOf("create or replace function public.api_keys_nombre_visible()"), sql.indexOf("create trigger api_keys_nombre_visible"));
  assert(funcion.length > 1000, "no se encontró api_keys_nombre_visible");
  const lanzados = [...new Set([...funcion.matchAll(/detail = '\{"error": "([a-z_]+)"\}'/g)].map((m) => m[1]))].sort();
  assertEquals(lanzados, [...CODIGOS_DE_LA_BASE].sort());
  for (const check of ["api_keys_escritura_con_lectura", "api_keys_escritura_con_nombre"]) assert(sql.includes(`add constraint ${check}`), check);
});

// ─── Guardas sobre index.ts ──────────────────────────────────────────────────

const INDEX = Deno.readTextFileSync(new URL("./index.ts", import.meta.url))
  .replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const tramo = (desde: string, hasta: string) => INDEX.slice(INDEX.indexOf(desde), INDEX.indexOf(hasta, INDEX.indexOf(desde)));

Deno.test("index.ts: alta y edición aplican las reglas, y un error de la base al guardar nunca sale crudo con 500", () => {
  const alta = tramo('if (action === "create")', 'if (action === "update")');
  const edicion = tramo('if (action === "update")', 'if (action === "revoke")');
  assert(alta.length > 500 && edicion.length > 500, "no se encontraron las acciones");
  assert(/problemaAlCrear\(\{[\s\S]*confirmaEscrituraComo:\s*body\?\.acknowledge_messenger_writes_as,\s*quienCrea:\s*callerId/.test(alta),
    "el alta no aplica problemaAlCrear con la confirmación de quien la crea");
  assert(/problemaAlEditar\(\{[\s\S]*quienEdita:\s*callerId/.test(edicion), "la edición no aplica problemaAlEditar");
  for (const [nombre, t] of [["alta", alta], ["edición", edicion]]) {
    assert(!/error:\s*\w+\.message\s*\}\s*,\s*500/.test(t), `${nombre}: devuelve el error crudo de la base con 500`);
    assert(/errorAlGuardar\(/.test(t), `${nombre}: no traduce el error de la base`);
  }
  assert(/api_display_name:\s*nombreVisible/.test(alta), "el alta no guarda el nombre visible");
  assert(/integracion_id:\s*integracionId/.test(alta), "el alta no hereda la integración de la key que reemplaza");
});

Deno.test("index.ts: la key que se reemplaza se busca en ESTA agencia, y tiene que ser de quien crea la nueva", () => {
  const alta = tramo('if (action === "create")', 'if (action === "update")');
  const busqueda = alta.slice(alta.indexOf("reemplazo.valor)"));
  assert(/from\("api_keys"\)[\s\S]{0,200}\.eq\("id",\s*reemplazo\.valor\)\.eq\("tenant_id",\s*tenantId\)/.test(busqueda), "la búsqueda no va atada a la agencia");
  assert(/v\.acts_as_user_id\s*!==\s*callerId\)\s*return json\(req,\s*\{\s*error:\s*m\("reemplazoInvalido"\)/.test(busqueda), "no exige que sea de la misma persona");
});

Deno.test("index.ts: la pantalla recibe el catálogo sin lo oculto; la validación, el completo", () => {
  assert(/scope_catalog:\s*SCOPE_CATALOG\b/.test(INDEX), "list no manda SCOPE_CATALOG");
  assert(!/SCOPE_CATALOG_COMPLETO/.test(INDEX), "index.ts manda el catálogo completo a la pantalla");
  assert(/isValidScope\(/.test(INDEX), "index.ts no valida con isValidScope");
});
