// Tests de cuándo se borra el buzón de Zoho de una cuenta dada de baja.
//
// La regla (Jhon, 05/10/2026): el buzón se borra a los 30 días, al purgar la
// cuenta, y NO al suspenderla. Lo que se protege aquí:
//   · suspender no borra (ni siquiera llega a Zoho);
//   · purgar sí borra, pasados los 30 días;
//   · una cuenta recuperada no se toca;
//   · corp@unlok.me (Superadministrador de Zoho) nunca, por ningún camino;
//   · toda salida deja su motivo, y el motivo llega a la cola y al evento.
// Y, leyendo el código, el ORDEN: la dirección se averigua y se encola antes de
// que app_purge_user_refs se lleve mail_credentials.
//
//   deno test --allow-read --no-check supabase/functions/_shared/buzon-por-borrar.test.ts

import { assert, assertEquals, assertMatch } from "jsr:@std/assert";
import {
  type BuzonEnCola,
  type ContextoDeLaCuenta,
  DIAS_DE_PAPELERA,
  type DatosBuzones,
  decidirYBorrar,
  type EstadoBuzon,
  fechaDeBorrado,
  procesarBuzon,
  procesarCola,
  TOPE_DE_INTENTOS,
  type Zoho,
} from "./buzon-por-borrar.ts";
import { deleteMailbox, type ZohoAccount } from "./zoho.ts";
import { tokenDeCronValido } from "./cron-token.ts";

const DIA = 86_400_000;
const AHORA = new Date("2026-11-10T07:20:00Z");
const hace = (dias: number) => new Date(AHORA.getTime() - dias * DIA).toISOString();

const ANA = "ana.perez@maven-ai.me";

/** Zoho de mentira: la organización tiene estas casillas y anota lo que se borra. */
function zohoFalso(casillas: string[] = [ANA], opciones: Partial<{
  configurado: boolean;
  listaFalla: string;
  borrarFalla: string;
  explota: string;
}> = {}) {
  const borradas: string[] = [];
  let listados = 0;
  const z: Zoho = {
    configurado: () => opciones.configurado ?? true,
    listarCuentas: () => {
      listados++;
      if (opciones.explota) throw new Error(opciones.explota);
      if (opciones.listaFalla) return Promise.resolve({ ok: false, error: opciones.listaFalla });
      const data: ZohoAccount[] = casillas.map((c, i) => ({ accountId: `a${i}`, primaryEmailAddress: c }));
      return Promise.resolve({ ok: true, data });
    },
    borrar: (d) => {
      if (opciones.borrarFalla) return Promise.resolve({ ok: false, error: opciones.borrarFalla });
      borradas.push(d);
      return Promise.resolve({ ok: true });
    },
  };
  return { z, borradas, listados: () => listados };
}

const purgada: ContextoDeLaCuenta = {
  perfil_existe: false,
  deleted_at: null,
  otra_cuenta_con_esa_direccion: false,
  credencial_activa_de_otra: false,
};
const enPapelera = (dias: number): ContextoDeLaCuenta => ({ ...purgada, perfil_existe: true, deleted_at: hace(dias) });
const recuperada: ContextoDeLaCuenta = { ...purgada, perfil_existe: true, deleted_at: null };

function fila(direccion = ANA, diasDeBaja = 31, extra: Partial<BuzonEnCola> = {}): BuzonEnCola {
  const eliminada = hace(diasDeBaja);
  return {
    id: crypto.randomUUID(),
    user_id: "u-1",
    direccion,
    eliminada_el: eliminada,
    borrar_desde: fechaDeBorrado(eliminada).toISOString(),
    intentos: 0,
    estado: "pendiente",
    motivo: null,
    ...extra,
  };
}

/** Base de mentira: devuelve el contexto dado y guarda lo que se anota. */
function datosFalsos(contexto: ContextoDeLaCuenta | null, filas: BuzonEnCola[] = []) {
  const anotado: Array<{ id: string; estado: EstadoBuzon; motivo: string | null; cuenta: boolean }> = [];
  const datos: DatosBuzones = {
    contexto: () => Promise.resolve(contexto),
    pendientes: () => Promise.resolve(filas),
    uno: (id) => Promise.resolve(filas.find((f) => f.id === id) ?? null),
    anotar: (id, estado, motivo, cuenta) => {
      anotado.push({ id, estado, motivo, cuenta });
      return Promise.resolve(true);
    },
  };
  return { datos, anotado };
}

// ─── Suspender NO borra ──────────────────────────────────────────────────────

Deno.test("suspendida hace 2 días: NO se borra y ni se le pregunta a Zoho", async () => {
  const { z, borradas, listados } = zohoFalso();
  const d = await decidirYBorrar(fila(ANA, 2), enPapelera(2), z, AHORA);
  assertEquals(d.estado, "pendiente");
  assert(d.esperar, "esperar el plazo no es una falla");
  assertMatch(d.motivo ?? "", /30 días/);
  assertEquals(borradas, []);
  assertEquals(listados(), 0);
});

Deno.test("en la papelera el día 29, 23:59: todavía no", async () => {
  const { z, borradas } = zohoFalso();
  const casi = new Date(AHORA.getTime() - (DIAS_DE_PAPELERA * DIA - 60_000)).toISOString();
  const d = await decidirYBorrar(
    { direccion: ANA, eliminada_el: casi, borrar_desde: fechaDeBorrado(casi).toISOString() },
    { ...purgada, perfil_existe: true, deleted_at: casi },
    z,
    AHORA,
  );
  assertEquals(d.estado, "pendiente");
  assertEquals(borradas, []);
});

Deno.test("purga a mano el día 5: la cuenta se va pero el buzón espera al día 30", async () => {
  const { z, borradas } = zohoFalso();
  const f = fila(ANA, 5);
  const { datos, anotado } = datosFalsos(purgada, [f]);
  const r = await procesarBuzon(f, datos, z, AHORA);
  assertEquals(r.estado, "pendiente");
  assertEquals(borradas, []);
  assertMatch(r.motivo ?? "", new RegExp(`se borra desde el ${f.borrar_desde.slice(0, 10)}`));
  assertEquals(anotado[0].cuenta, false, "una espera no gasta intentos");
});

Deno.test("el código de la baja (delete_user) no toca Zoho ni la cola", () => {
  const src = Deno.readTextFileSync(new URL("../admin-user-actions/index.ts", import.meta.url));
  const ini = src.indexOf('if (action === "delete_user") {');
  const fin = src.indexOf("// === RESTAURAR", ini);
  assert(ini > 0 && fin > ini, "no encontré el bloque de delete_user");
  const bloque = src.slice(ini, fin);
  for (const prohibido of ["deleteMailbox", "procesarBuzon", "app_encolar_buzon", "zohoDeVerdad", "listAccounts", "mail_credentials"]) {
    assert(!bloque.includes(prohibido), `delete_user no puede usar ${prohibido}: suspender no borra el buzón`);
  }
  // Y que nadie vuelva a importar el borrado directo en la edge: pasa solo por la cola.
  assert(!/import\s*\{[^}]*\bdeleteMailbox\b[^}]*\}\s*from/.test(src), "admin-user-actions no importa deleteMailbox");
});

// ─── Purgar SÍ borra ─────────────────────────────────────────────────────────

Deno.test("purgada y con los 30 días cumplidos: se borra", async () => {
  const { z, borradas } = zohoFalso([ANA, "otra@maven-ai.me"]);
  const d = await decidirYBorrar(fila(ANA, 31), purgada, z, AHORA);
  assertEquals(d, { estado: "borrado", motivo: null });
  assertEquals(borradas, [ANA]);
});

Deno.test("la purga falló pero la cuenta sigue en la papelera pasados los 30 días: se borra", async () => {
  const { z, borradas } = zohoFalso();
  const d = await decidirYBorrar(fila(ANA, 31), enPapelera(31), z, AHORA);
  assertEquals(d.estado, "borrado");
  assertEquals(borradas, [ANA]);
});

Deno.test("la cola entera: borra, anota borrado sin motivo y cuenta el intento", async () => {
  const { z, borradas } = zohoFalso();
  const f = fila(ANA, 31);
  const { datos, anotado } = datosFalsos(purgada, [f]);
  const res = await procesarCola(datos, z, AHORA);
  assert(res.ok);
  assertEquals(res.procesadas, 1);
  assertEquals(borradas, [ANA]);
  assertEquals(anotado, [{ id: f.id, estado: "borrado", motivo: null, cuenta: true }]);
});

Deno.test("una sola lista de la organización por corrida", async () => {
  const otra = "beto@maven-ai.me";
  const { z, borradas, listados } = zohoFalso([ANA, otra]);
  const { datos } = datosFalsos(purgada, [fila(ANA), fila(otra)]);
  await procesarCola(datos, z, AHORA);
  assertEquals(borradas.sort(), [ANA, otra].sort());
  assertEquals(listados(), 1);
});

Deno.test("una fila ya resuelta no se vuelve a procesar", async () => {
  const { z, borradas, listados } = zohoFalso();
  const f = fila(ANA, 40, { estado: "borrado", motivo: null });
  const { datos, anotado } = datosFalsos(purgada, [f]);
  const r = await procesarBuzon(f, datos, z, AHORA);
  assertEquals(r.estado, "borrado");
  assertEquals(borradas, []);
  assertEquals(listados(), 0);
  assertEquals(anotado, []);
});

// ─── Restaurada: no se toca ──────────────────────────────────────────────────

Deno.test("la recuperaron: no se borra, aunque haya pasado el plazo y esté en la cola", async () => {
  const { z, borradas, listados } = zohoFalso();
  const f = fila(ANA, 45);
  const { datos, anotado } = datosFalsos(recuperada, [f]);
  const r = await procesarBuzon(f, datos, z, AHORA);
  assertEquals(r.estado, "no_se_borra");
  assertMatch(r.motivo ?? "", /se recuperó/);
  assertEquals(borradas, []);
  assertEquals(listados(), 0);
  assertEquals(anotado[0].estado, "no_se_borra");
});

Deno.test("la recuperaron y la volvieron a eliminar hace 3 días: cuentan los 30 desde la baja nueva", async () => {
  const { z, borradas } = zohoFalso();
  const d = await decidirYBorrar(fila(ANA, 40), enPapelera(3), z, AHORA);
  assertEquals(d.estado, "pendiente");
  assert(d.esperar);
  assertEquals(borradas, []);
});

// ─── corp@unlok.me: nunca ────────────────────────────────────────────────────

Deno.test("corp@unlok.me no se borra nunca, escrita como sea", async () => {
  for (const corp of ["corp@unlok.me", " CORP@Unlok.me "]) {
    const { z, borradas, listados } = zohoFalso([corp.trim().toLowerCase()]);
    const d = await decidirYBorrar(fila(corp, 400), purgada, z, AHORA);
    assertEquals(d.estado, "no_se_borra", corp);
    assertMatch(d.motivo ?? "", /Superadministrador/);
    assertEquals(borradas, []);
    assertEquals(listados(), 0, "ni siquiera se le pregunta a Zoho");
  }
});

Deno.test("deleteMailbox se niega a borrar corp@unlok.me sin tocar la red", async () => {
  const fetchOriginal = globalThis.fetch;
  let llamadas = 0;
  globalThis.fetch = () => {
    llamadas++;
    return Promise.reject(new Error("no debería salir a la red"));
  };
  try {
    for (const corp of ["corp@unlok.me", "Corp@Unlok.Me "]) {
      const r = await deleteMailbox(corp);
      assertEquals(r.ok, false);
      assertMatch(r.error ?? "", /Superadministrador/);
    }
    assertEquals(llamadas, 0);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

// ─── El motivo queda registrado, en TODAS las salidas ────────────────────────

Deno.test("toda salida que no borra dice por qué, y eso es lo que se anota", async () => {
  const casos: Array<[string, ContextoDeLaCuenta | null, ReturnType<typeof zohoFalso>, EstadoBuzon, RegExp]> = [
    ["sin contexto", null, zohoFalso(), "pendiente", /estado de la cuenta/],
    ["otra cuenta entra con esa dirección", { ...purgada, otra_cuenta_con_esa_direccion: true }, zohoFalso(), "no_se_borra", /otra cuenta/],
    ["otra cuenta la tiene vinculada", { ...purgada, credencial_activa_de_otra: true }, zohoFalso(), "no_se_borra", /vinculada/],
    ["Zoho sin configurar", purgada, zohoFalso([ANA], { configurado: false }), "pendiente", /no está configurado/],
    ["no se pudo listar", purgada, zohoFalso([ANA], { listaFalla: "TOKEN_EXPIRED" }), "pendiente", /TOKEN_EXPIRED/],
    ["no está en la organización", purgada, zohoFalso(["otra@maven-ai.me"]), "no_se_borra", /no figura entre las 1 casillas/],
    ["Zoho rechaza el borrado", purgada, zohoFalso([ANA], { borrarFalla: "EXTRA_KEY_FOUND" }), "pendiente", /EXTRA_KEY_FOUND/],
    ["explota", purgada, zohoFalso([ANA], { explota: "socket hang up" }), "pendiente", /explotó: socket hang up/],
  ];
  for (const [nombre, ctx, zf, estado, motivo] of casos) {
    const f = fila(ANA, 31);
    const { datos, anotado } = datosFalsos(ctx, [f]);
    const r = await procesarBuzon(f, datos, zf.z, AHORA);
    assertEquals(r.estado, estado, nombre);
    assertMatch(r.motivo ?? "", motivo, nombre);
    assertEquals(anotado.length, 1, nombre);
    assertEquals(anotado[0].motivo, r.motivo, `${nombre}: el motivo llega a la base`);
    assert(anotado[0].cuenta, `${nombre}: es un intento`);
    if (estado !== "borrado") assertEquals(zf.borradas, [], `${nombre}: no borró`);
  }
});

Deno.test(`después de ${TOPE_DE_INTENTOS} fallas seguidas queda 'fallido' y deja de reintentarse`, async () => {
  const { z } = zohoFalso([ANA], { listaFalla: "Zoho caído" });
  const f = fila(ANA, 31, { intentos: TOPE_DE_INTENTOS - 1 });
  const { datos, anotado } = datosFalsos(purgada, [f]);
  const r = await procesarBuzon(f, datos, z, AHORA);
  assertEquals(r.estado, "fallido");
  assertMatch(r.motivo ?? "", /Zoho caído/);
  assertEquals(anotado[0].estado, "fallido");

  const g = fila(ANA, 31, { intentos: TOPE_DE_INTENTOS - 2 });
  const r2 = await procesarBuzon(g, datosFalsos(purgada, [g]).datos, z, AHORA);
  assertEquals(r2.estado, "pendiente", "una antes del tope, sigue pendiente");
});

Deno.test("si la cola no se puede leer, la corrida lo dice (no es 'no había nada')", async () => {
  const { z } = zohoFalso();
  const { datos } = datosFalsos(purgada);
  datos.pendientes = () => Promise.resolve(null);
  const res = await procesarCola(datos, z, AHORA);
  assertEquals(res.ok, false);
  assertMatch(res.error ?? "", /cola/);
});

// ─── El orden: la dirección ANTES de que la purga se lleve mail_credentials ──

Deno.test("purga manual: averigua y encola el buzón antes de app_purge_user_refs, y lo procesa después", () => {
  const src = Deno.readTextFileSync(new URL("../admin-user-actions/index.ts", import.meta.url));
  const ini = src.indexOf('if (action === "purge_user") {');
  const fin = src.indexOf('if (action === "update_profile")', ini);
  const b = src.slice(ini, fin);
  const pos = (s: string) => {
    const i = b.indexOf(s);
    assert(i >= 0, `purge_user no tiene ${s}`);
    return i;
  };
  assert(pos("casillaDeLaCuenta(") < pos('"app_encolar_buzon"'));
  assert(pos('"app_encolar_buzon"') < pos('"app_purge_user_refs"'));
  assert(pos('"app_purge_user_refs"') < pos("return respuestaPurgada(await rematarBuzon())"));
  assert(b.includes("procesarBuzon("), "el buzón pasa por procesarBuzon (la única puerta)");
});

Deno.test("purga automática (SQL): encola el buzón antes de app_purge_user_refs", () => {
  const sql = Deno.readTextFileSync(new URL("../../migrations/20261005120000_buzon_zoho_al_purgar.sql", import.meta.url));
  const ini = sql.indexOf("create or replace function public.app_purgar_cuentas_vencidas(");
  const fin = sql.indexOf("$$;", ini);
  const f = sql.slice(ini, fin);
  const casilla = f.indexOf("public.app_casilla_de_la_cuenta(r.id)");
  const encola = f.indexOf("public.app_encolar_buzon(");
  const purga = f.indexOf("public.app_purge_user_refs(r.id)");
  assert(casilla > 0 && encola > casilla && purga > encola, "casilla → encolar → purgar");
  // Y sin \uXXXX: apply_migration los convierte en caracteres y cambia la huella.
  assert(!/\\u[0-9a-fA-F]{4}/.test(sql), "la migración no puede llevar \\uXXXX");
});

// ─── La puerta del cron ──────────────────────────────────────────────────────

Deno.test("X-Cron-Token: solo el exacto, y nunca sin token configurado", async () => {
  assert(await tokenDeCronValido("secreto-largo-del-cron", "secreto-largo-del-cron"));
  assert(!(await tokenDeCronValido("secreto-largo-del-cron-", "secreto-largo-del-cron")));
  assert(!(await tokenDeCronValido("Bearer cualquier-cosa-de-mas-de-20", "secreto-largo-del-cron")));
  assert(!(await tokenDeCronValido(null, "secreto-largo-del-cron")));
  assert(!(await tokenDeCronValido("", "")), "sin token configurado no entra nadie");
  assert(!(await tokenDeCronValido("x", undefined)));
});

Deno.test("la edge buzones-por-borrar solo abre con X-Cron-Token y está en config.toml sin verify_jwt", () => {
  const src = Deno.readTextFileSync(new URL("../buzones-por-borrar/index.ts", import.meta.url));
  assert(src.includes('tokenDeCronValido(req.headers.get("X-Cron-Token"), esperado)'));
  assert(!src.includes("authorizeCronOrJwt"), "nunca authorizeCronOrJwt: acepta cualquier Bearer");
  const toml = Deno.readTextFileSync(new URL("../../config.toml", import.meta.url));
  assert(/\[functions\.buzones-por-borrar\]\s*\nverify_jwt = false/.test(toml));
});
