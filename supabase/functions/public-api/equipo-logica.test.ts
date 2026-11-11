// Tests del equipo que manda Backstage (POST /equipo/sync): la lógica pura
// (./equipo-logica.ts) y el handler de punta a punta con un cliente falso.
//
// Lo que no puede pasar nunca, y por eso se prueba aquí:
//   · tocar a un admin o a un dueño;
//   · mandar a la papelera a alguien por NO venir en la lista;
//   · crear una cuenta, o inventar un rol;
//   · subir a alguien a admin o a dueño;
//   · vaciar el equipo de un golpe (el freno de bajas);
//   · tratar un error de la base como «no hay nadie».

import { assert, assertEquals } from "jsr:@std/assert";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  armarRespuesta,
  calcularCambios,
  type EstadoDeMaven,
  leerEstado,
  leerResultadoDeLaBase,
  leerSync,
  normalizarCorreo,
  normalizarHora,
  type PedidoDeSync,
  type PersonaDeMaven,
  resolverRol,
} from "./equipo-logica.ts";
import { type Contexto, servirComoUsuario } from "./recursos-como-usuario.ts";

const ID = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const persona = (n: number, correo: string, extra: Partial<PersonaDeMaven> = {}): PersonaDeMaven => ({
  id: ID(n), correo, nombre: correo.split("@")[0], rol: "Chatter", nivel: "agente",
  hora_entrada: null, hora_salida: null, equipo: null, reporta_a: null,
  en_papelera: false, protegido: false, ...extra,
});

const ESTADO: EstadoDeMaven = {
  aplicar: false,
  max_bajas: 5,
  mapa_roles: { "Chat Agent": "Chatter" },
  roles: [
    { nombre: "admin", es_admin: true },
    { nombre: "Chatter", es_admin: false },
    { nombre: "Chatter Supervisor", es_admin: false },
    { nombre: "Coordinador", es_admin: false },
    { nombre: "Finanzas", es_admin: false },
  ],
  personas: [
    persona(1, "dueno@kash.test", { rol: "admin", nivel: "dueno", protegido: true }),
    persona(2, "ana@kash.test"),
    persona(3, "beto@kash.test", { rol: "Chatter Supervisor", nivel: "supervisor" }),
    persona(4, "carla@kash.test", { hora_entrada: "09:00:00", hora_salida: "17:00:00", equipo: "Chatters A" }),
    persona(5, "dario@kash.test", { en_papelera: true }),
    persona(6, "eva@kash.test"),
  ],
};

function pedido(personas: unknown[], extra: Record<string, unknown> = {}): PedidoDeSync {
  const r = leerSync({ personas, ...extra });
  if (!r.ok) throw new Error(`el pedido de prueba no se pudo leer: ${JSON.stringify(r.problema)}`);
  return r.pedido;
}

// ─── leerSync ────────────────────────────────────────────────────────────────

Deno.test("leerSync: lo que está mal en TODO el envío es un 400", () => {
  assertEquals(leerSync(null), { ok: false, problema: { tipo: "sin_cuerpo" } });
  assertEquals(leerSync([]), { ok: false, problema: { tipo: "sin_cuerpo" } });
  assertEquals(leerSync({ personas: [{ correo: "a@b.co" }], extra: 1, otro: 2 }), {
    ok: false, problema: { tipo: "campo_desconocido", campos: ["extra", "otro"] },
  });
  assertEquals(leerSync({ personas: [{ correo: "a@b.co" }], ensayo: "si" }), {
    ok: false, problema: { tipo: "campo_invalido", campo: "ensayo" },
  });
  for (const personas of [undefined, null, {}, [], "x", Array(1001).fill({ correo: "a@b.co" })]) {
    assertEquals(leerSync({ personas }), { ok: false, problema: { tipo: "personas_invalidas" } });
  }
});

Deno.test("leerSync: ensayo por defecto es false (lo decide el interruptor de la agencia)", () => {
  const r = leerSync({ personas: [{ correo: "A@B.co" }] });
  assert(r.ok);
  assertEquals(r.pedido.ensayo, false);
  assertEquals(r.pedido.personas[0].correo, "a@b.co");
  assertEquals(r.pedido.personas[0].activo, true, "sin activo, la persona sigue activa");
  const e = leerSync({ personas: [{ correo: "a@b.co" }], ensayo: true });
  assert(e.ok && e.pedido.ensayo === true);
});

Deno.test("leerSync: lo malo de UNA persona va a rechazados y lo demás sigue", () => {
  const r = leerSync({
    personas: [
      "no soy un objeto",
      { correo: "sin-arroba" },
      { correo: "ok@kash.test", rol: 7, nivel: "jefe", hora_entrada: "25:00", reporta_a: "nadie", apodo: "x", activo: "no" },
      { correo: "ok2@kash.test", nivel: "Dueño", hora_salida: "9:30", equipo: "  Chatters   B ", reporta_a: "" },
    ],
  });
  assert(r.ok);
  const { personas, rechazados } = r.pedido;
  assertEquals(personas.map((p) => p.correo), ["ok@kash.test", "ok2@kash.test"]);
  const ok1 = personas[0];
  assertEquals(ok1.rol, undefined);
  assertEquals(ok1.nivel, undefined);
  assertEquals(ok1.hora_entrada, undefined);
  assertEquals(ok1.reporta_a, undefined);
  assertEquals(ok1.activo, true, "un activo que no es true/false NO manda a nadie a la papelera");
  const ok2 = personas[1];
  assertEquals(ok2.hora_salida, "09:30:00");
  assertEquals(ok2.equipo, "Chatters B");
  assertEquals(ok2.reporta_a, null, "reporta_a vacío = sin jefe");
  const motivos = rechazados.map((x) => `${x.indice}|${x.campo}|${x.motivo}`).sort();
  assertEquals(motivos, [
    "0|persona|no_es_un_objeto",
    "1|correo|correo_invalido",
    "2|activo|tipo_invalido",
    "2|apodo|campo_desconocido",
    "2|hora_entrada|hora_invalida",
    "2|nivel|nivel_invalido",
    "2|reporta_a|correo_invalido",
    "2|rol|tipo_invalido",
    "3|nivel|nivel_de_admin",
  ]);
});

Deno.test("leerSync: un correo repetido no toca a nadie (¿cuál de los dos manda?)", () => {
  const r = leerSync({ personas: [{ correo: "ana@kash.test", rol: "Chatter" }, { correo: "ANA@kash.test", activo: false }, { correo: "eva@kash.test" }] });
  assert(r.ok);
  assertEquals(r.pedido.personas.map((p) => p.correo), ["eva@kash.test"]);
  assertEquals(r.pedido.repetidos, ["ana@kash.test"]);
  assertEquals(r.pedido.rechazados.map((x) => x.motivo), ["correo_repetido"]);
});

Deno.test("normalizar: correos y horas", () => {
  assertEquals(normalizarCorreo("  Ana@Kash.TEST "), "ana@kash.test");
  for (const malo of ["", "ana", "ana@kash", "a b@c.de", 5, null, "x".repeat(250) + "@a.co"]) assertEquals(normalizarCorreo(malo), null);
  assertEquals(normalizarHora("9:00"), "09:00:00");
  assertEquals(normalizarHora("23:59:59"), "23:59:59");
  for (const mala of ["24:00", "9", "09:60", "ab:cd", "09:00:60"]) assertEquals(normalizarHora(mala), null);
});

// ─── resolverRol ─────────────────────────────────────────────────────────────

Deno.test("resolverRol: mapa de la agencia, nombre exacto, sin mayúsculas ni acentos; si no, no adivina", () => {
  assertEquals(resolverRol("chat agent", ESTADO)?.nombre, "Chatter", "el mapa manda");
  assertEquals(resolverRol("Chatter", ESTADO)?.nombre, "Chatter");
  assertEquals(resolverRol("  CHATTER  supervisor ", ESTADO)?.nombre, "Chatter Supervisor");
  assertEquals(resolverRol("Fínanzas", ESTADO)?.nombre, "Finanzas");
  assertEquals(resolverRol("Closer", ESTADO), null);
  // Un mapa que apunta a un rol que no existe no se inventa.
  assertEquals(resolverRol("x", { ...ESTADO, mapa_roles: { x: "No Existe" } }), null);
  // Dos roles que solo difieren en mayúsculas: ambiguo, no se elige.
  const dos = { mapa_roles: {}, roles: [{ nombre: "Chatter", es_admin: false }, { nombre: "chatter", es_admin: false }] };
  assertEquals(resolverRol("CHATTER", dos), null);
  assertEquals(resolverRol("chatter", dos)?.nombre, "chatter", "el exacto sí");
});

// ─── calcularCambios ─────────────────────────────────────────────────────────

Deno.test("calcular: cambia rol, nivel, equipo, jefe y horario de quien está en Maven", () => {
  const { resumen, paraLaBase } = calcularCambios(ESTADO, pedido([
    { correo: "ana@kash.test", rol: "Coordinador", nivel: "supervisor", equipo: "Editores", reporta_a: "beto@kash.test" },
    { correo: "beto@kash.test", rol: "chatter supervisor", nivel: "supervisor" },
    { correo: "carla@kash.test", hora_entrada: "09:00", hora_salida: "18:00", equipo: null },
    { correo: "eva@kash.test" },
  ]));
  assertEquals(resumen.cambios.map((c) => `${c.correo}|${c.campo}|${c.antes}→${c.despues}`), [
    "ana@kash.test|rol|Chatter→Coordinador",
    "ana@kash.test|nivel|agente→supervisor",
    "ana@kash.test|equipo|null→Editores",
    "ana@kash.test|reporta_a|null→beto@kash.test",
    "carla@kash.test|equipo|Chatters A→null",
    "carla@kash.test|hora_salida|17:00:00→18:00:00",
  ]);
  // A la base va el jefe por su id, no por su correo.
  assertEquals(paraLaBase.find((c) => c.campo === "reporta_a"), { user_id: ID(2), campo: "reporta_a", valor: ID(3) });
  assertEquals(resumen.rechazados, []);
});

Deno.test("calcular: un admin o un dueño NO se toca nunca, ni para la papelera", () => {
  const { resumen, paraLaBase } = calcularCambios(ESTADO, pedido([
    { correo: "dueno@kash.test", rol: "Chatter", nivel: "agente", activo: false },
  ]));
  assertEquals(paraLaBase, []);
  assertEquals(resumen.protegidos, [{ user_id: ID(1), correo: "dueno@kash.test", nombre: "dueno", motivo: "admin_o_dueno" }]);
});

Deno.test("calcular: activo=false → papelera; faltar en la lista NO", () => {
  const { resumen, paraLaBase } = calcularCambios(ESTADO, pedido([
    { correo: "ana@kash.test", activo: false, rol: "Finanzas" },
  ]));
  // Solo la baja: lo demás de quien se va no importa.
  assertEquals(paraLaBase, [{ user_id: ID(2), campo: "papelera", valor: null }]);
  // beto, carla y eva no vinieron: se reportan y no se tocan. El dueño (protegido) y
  // dario (ya en la papelera) no se reportan.
  assertEquals(resumen.no_vienen_en_backstage.map((p) => p.correo), ["beto@kash.test", "carla@kash.test", "eva@kash.test"]);
});

Deno.test("calcular: quien no está en Maven no se crea; un rol que Maven no tiene no se inventa", () => {
  const { resumen, paraLaBase } = calcularCambios(ESTADO, pedido([
    { correo: "nueva@kash.test", nombre: "Nueva", rol: "Chatter", equipo: "Chatters A" },
    { correo: "vieja@kash.test", activo: false },
    { correo: "ana@kash.test", rol: "Closer" },
    { correo: "eva@kash.test", rol: "closer" },
  ]));
  assertEquals(paraLaBase, []);
  assertEquals(resumen.pendientes_de_crear, [{ correo: "nueva@kash.test", nombre: "Nueva", rol: "Chatter", equipo: "Chatters A" }],
    "una inactiva que Maven no tiene no es pendiente");
  // «Closer» y «closer» son el mismo rol que falta.
  assertEquals(resumen.roles_desconocidos, [{ rol: "Closer", correos: ["ana@kash.test", "eva@kash.test"] }]);
});

Deno.test("calcular: nadie sube a admin por aquí", () => {
  const { resumen, paraLaBase } = calcularCambios(ESTADO, pedido([{ correo: "ana@kash.test", rol: "Admin", nivel: "admin" }]));
  assertEquals(paraLaBase, []);
  assertEquals(resumen.rechazados.map((r) => `${r.campo}|${r.motivo}`).sort(), ["nivel|nivel_de_admin", "rol|rol_de_admin"]);
});

Deno.test("calcular: la papelera no se toca desde aquí (volver lo hace una persona)", () => {
  const { resumen, paraLaBase } = calcularCambios(ESTADO, pedido([
    { correo: "dario@kash.test", rol: "Finanzas" },
    { correo: "ana@kash.test", reporta_a: "dario@kash.test" },
  ]));
  assertEquals(paraLaBase, []);
  assertEquals(resumen.en_papelera, [{ user_id: ID(5), correo: "dario@kash.test", nombre: "dario" }]);
  assertEquals(resumen.rechazados.map((r) => r.motivo), ["jefe_en_papelera"]);
});

Deno.test("calcular: el jefe tiene que estar en Maven y no ser la misma persona; null quita el jefe", () => {
  const conJefe = { ...ESTADO, personas: ESTADO.personas.map((p) => p.correo === "eva@kash.test" ? { ...p, reporta_a: ID(3) } : p) };
  const { resumen, paraLaBase } = calcularCambios(conJefe, pedido([
    { correo: "ana@kash.test", reporta_a: "fantasma@kash.test" },
    { correo: "beto@kash.test", reporta_a: "beto@kash.test" },
    { correo: "eva@kash.test", reporta_a: null },
  ]));
  assertEquals(resumen.rechazados.map((r) => `${r.correo}|${r.motivo}`), [
    "ana@kash.test|jefe_no_esta_en_maven",
    "beto@kash.test|jefe_es_la_misma_persona",
  ]);
  assertEquals(paraLaBase, [{ user_id: ID(6), campo: "reporta_a", valor: null }]);
  assertEquals(resumen.cambios[0].antes, "beto@kash.test", "el jefe de antes, por su correo");
});

Deno.test("calcular: el freno de bajas — más que el tope y no se aplica ninguna", () => {
  const muchos = { ...ESTADO, max_bajas: 2 };
  const tres = pedido([
    { correo: "ana@kash.test", activo: false },
    { correo: "beto@kash.test", activo: false },
    { correo: "eva@kash.test", activo: false },
    { correo: "carla@kash.test", hora_entrada: "10:00" },
  ]);
  const { resumen, paraLaBase } = calcularCambios(muchos, tres);
  assertEquals(paraLaBase.map((c) => c.campo), ["hora_entrada"], "lo que no es baja sí sigue");
  assertEquals(resumen.freno_de_bajas, { bajas_pedidas: 3, tope: 2 });
  assertEquals(resumen.rechazados.filter((r) => r.motivo === "freno_de_bajas").length, 3);
  // Con el tope justo, pasan.
  assertEquals(calcularCambios({ ...ESTADO, max_bajas: 3 }, tres).paraLaBase.filter((c) => c.campo === "papelera").length, 3);
});

Deno.test("calcular: lo que ya está igual no es un cambio, y dos envíos iguales dan el mismo resumen", () => {
  const igual = pedido([
    { correo: "carla@kash.test", rol: "Chatter", nivel: "agente", hora_entrada: "9:00", hora_salida: "17:00:00", equipo: "Chatters A" },
  ]);
  assertEquals(calcularCambios(ESTADO, igual).paraLaBase, []);
  const a = calcularCambios(ESTADO, pedido([{ correo: "eva@kash.test", rol: "Finanzas" }, { correo: "ana@kash.test", rol: "Finanzas" }]));
  const b = calcularCambios(ESTADO, pedido([{ correo: "ana@kash.test", rol: "Finanzas" }, { correo: "eva@kash.test", rol: "Finanzas" }]));
  assertEquals(JSON.stringify(a.resumen.cambios), JSON.stringify(b.resumen.cambios), "el orden del envío no cambia el resumen");
});

// ─── Contratos con la base ───────────────────────────────────────────────────

Deno.test("leerEstado: un contrato roto es null (503), nunca «no hay nadie»", () => {
  assertEquals(leerEstado(null), null);
  assertEquals(leerEstado([]), null);
  assertEquals(leerEstado({ aplicar: false, max_bajas: 5, mapa_roles: {}, roles: [], personas: [{ id: 1 }] }), null);
  const e = leerEstado({
    aplicar: true, max_bajas: 5, mapa_roles: { a: "Chatter", b: 3 }, roles: [{ nombre: "Chatter", es_admin: false }],
    personas: [{ id: ID(1), correo: "A@x.co", nombre: null, rol: null, nivel: null, hora_entrada: "08:00:00", hora_salida: null,
      equipo: null, reporta_a: null, en_papelera: false, protegido: false }],
  });
  assert(e);
  assertEquals(e.mapa_roles, { a: "Chatter" });
  assertEquals(e.personas[0].correo, "a@x.co");
});

Deno.test("leerResultadoDeLaBase y armarRespuesta: aplicado solo fuera de ensayo, y lo que la base rechaza se ve", () => {
  assertEquals(leerResultadoDeLaBase({ ensayo: true }), null);
  const { resumen } = calcularCambios(ESTADO, pedido([{ correo: "ana@kash.test", rol: "Finanzas", nivel: "manager" }]));
  const base = leerResultadoDeLaBase({
    ensayo: false, aplicar: true, sync_id: "s1",
    aplicados: [{ user_id: ID(2), campo: "rol" }],
    rechazados: [{ user_id: ID(2), campo: "nivel", motivo: "error_de_base", detalle: "x" }],
  });
  assert(base);
  const r = armarRespuesta(resumen, base);
  assertEquals(r.ensayo, false);
  assertEquals(r.cambios.map((c) => [c.campo, c.aplicado, c.se_aplicaria]), [["rol", true, true], ["nivel", false, false]]);
  assertEquals(r.rechazados.map((x) => `${x.correo}|${x.campo}|${x.motivo}`), ["ana@kash.test|nivel|error_de_base"]);
  // En ensayo nada sale aplicado.
  const ensayo = armarRespuesta(resumen, { ...base, ensayo: true, aplicar: false, rechazados: [] });
  assert(ensayo.cambios.every((c) => !c.aplicado && c.se_aplicaria));
});

// ─── El handler, de punta a punta con un cliente falso ───────────────────────

const AGENCIA = "30869615-f579-4981-8a1f-dbebc61eae2d";
const CTX: Contexto = {
  agenciaDeLaLlave: AGENCIA,
  actuaComo: ID(1),
  scopes: ["equipo:write"],
  ruta: ["sync"],
  consulta: {},
  llave: { conWhitelist: false, venceEl: null },
  baseDeArchivos: "https://proyecto.supabase.co",
  cupo: { limite: 1000, restantes: 999, reinicio: "2026-11-11T23:00:00+00:00" },
  idioma: "es",
  metodo: "POST",
  cuerpo: { personas: [{ correo: "ana@kash.test", rol: "Finanzas" }] },
  idempotencia: null,
};

type Resp = { data: unknown; error: { message: string; code?: string; details?: string } | null };
const ok = (data: unknown): Resp => ({ data, error: null });

function clienteFalso(respuestas: Record<string, Resp>) {
  const llamadas: { nombre: string; args: Record<string, unknown> }[] = [];
  const cliente = {
    rpc: (nombre: string, args: Record<string, unknown>) => {
      llamadas.push({ nombre, args });
      if (nombre === "current_tenant_id") return Promise.resolve(ok(AGENCIA));
      const r = respuestas[nombre];
      if (!r) throw new Error(`rpc inesperada: ${nombre}`);
      return Promise.resolve(r);
    },
    from: () => { throw new Error("el equipo no lee tablas: todo va por sus dos RPC"); },
  } as unknown as SupabaseClient;
  return { cliente, llamadas };
}

const ESTADO_DE_LA_BASE = {
  agencia: AGENCIA, aplicar: false, max_bajas: 5, mapa_roles: {},
  roles: ESTADO.roles,
  personas: ESTADO.personas,
};

Deno.test("handler: compara, le pide a la base y responde con el resumen (ensayo)", async () => {
  const { cliente, llamadas } = clienteFalso({
    api_equipo_estado: ok(ESTADO_DE_LA_BASE),
    api_equipo_aplicar: ok({ ensayo: true, aplicar: false, sync_id: "s1", aplicados: [{ user_id: ID(2), campo: "rol" }], rechazados: [] }),
  });
  const r = await servirComoUsuario("equipo", cliente, CTX);
  assert(r.ok, JSON.stringify(r));
  const c = r.cuerpo as Record<string, any>;
  assertEquals(c.object, "equipo_sync");
  assertEquals(c.ensayo, true);
  assertEquals(c.cambios.map((x: any) => [x.correo, x.campo, x.despues, x.aplicado]), [["ana@kash.test", "rol", "Finanzas", false]]);
  // beto, carla y eva (el dueño está protegido y dario, en la papelera).
  assertEquals(c.no_vienen_en_backstage.map((p: any) => p.correo), ["beto@kash.test", "carla@kash.test", "eva@kash.test"]);
  const aplicar = llamadas.find((l) => l.nombre === "api_equipo_aplicar")!;
  assertEquals(aplicar.args._cambios, [{ user_id: ID(2), campo: "rol", valor: "Finanzas" }]);
  assertEquals(aplicar.args._ensayo, false, "el ensayo lo decide la base con el interruptor");
  assertEquals((aplicar.args._resumen as any).recibidas, 1);
});

Deno.test("handler: sin el scope, 403 sin tocar la base; otra ruta 404; GET a /sync 405", async () => {
  const { cliente, llamadas } = clienteFalso({});
  const sin = await servirComoUsuario("equipo", cliente, { ...CTX, scopes: ["employees:read"] });
  assert(!sin.ok && sin.estado === 403);
  assertEquals(llamadas.length, 0);
  const otra = await servirComoUsuario("equipo", cliente, { ...CTX, ruta: ["otra"] });
  assert(!otra.ok && otra.estado === 404);
  const get = await servirComoUsuario("equipo", cliente, { ...CTX, metodo: "GET", cuerpo: null });
  assert(!get.ok && get.estado === 405 && "permitidos" in get && get.permitidos.join() === "POST");
});

Deno.test("handler: un cuerpo inservible es 400 y no llega a la base", async () => {
  const { cliente, llamadas } = clienteFalso({});
  const r = await servirComoUsuario("equipo", cliente, { ...CTX, cuerpo: { personas: [] } });
  assert(!r.ok && r.estado === 400);
  assertEquals(llamadas.map((l) => l.nombre), ["current_tenant_id"]);
});

Deno.test("handler: la base dice que no (key sin permiso, persona no admin) → 403; caída → 503", async () => {
  const prohibido = clienteFalso({
    api_equipo_estado: { data: null, error: { code: "MV403", message: "api_equipo_sin_permiso", details: '{"error": "forbidden"}' } },
  });
  const r = await servirComoUsuario("equipo", prohibido.cliente, CTX);
  assert(!r.ok && r.estado === 403);
  assertEquals(prohibido.llamadas.map((l) => l.nombre), ["current_tenant_id", "api_equipo_estado"], "sin estado no se aplica nada");

  const roto = clienteFalso({ api_equipo_estado: ok({ cualquier: "cosa" }) });
  const r2 = await servirComoUsuario("equipo", roto.cliente, CTX);
  assert(!r2.ok && r2.estado === 503, "una forma rota no es «no hay nadie»");
  assertEquals(roto.llamadas.map((l) => l.nombre), ["current_tenant_id", "api_equipo_estado"]);
});
