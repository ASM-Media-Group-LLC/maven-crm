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
  armarEquipo,
  armarRespuesta,
  calcularCambios,
  type EstadoDeMaven,
  hoyEnBogota,
  leerEstado,
  leerRango,
  leerReporte,
  leerResultadoDeLaBase,
  leerResultadoDePendientes,
  leerResultadoDeRoles,
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
  assertEquals(resumen.pendientes_de_crear, [{ correo: "nueva@kash.test", nombre: "Nueva", rol: "Chatter", nivel: null, equipo: "Chatters A", reporta_a: null }],
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

// ─── Agencias conectadas: roles, pendientes y lo que Maven devuelve ──────────

Deno.test("leerSync: roles es opcional; si viene, una lista de hasta 50 (lo de cada rol lo decide la base)", () => {
  const sin = leerSync({ personas: [{ correo: "a@b.co" }] });
  assert(sin.ok && sin.pedido.roles === null, "sin roles: null");
  const con = leerSync({ personas: [{ correo: "a@b.co" }], roles: ["Closer", { nombre: "Chatter" }, 7] });
  assert(con.ok);
  assertEquals(con.pedido.roles, ["Closer", { nombre: "Chatter" }, 7], "tal cual: la base rechaza lo que no sirve, con su motivo");
  const nulo = leerSync({ personas: [{ correo: "a@b.co" }], roles: null });
  assert(nulo.ok && nulo.pedido.roles === null);
  for (const roles of ["Closer", { nombre: "x" }, 3, Array(51).fill("R")]) {
    assertEquals(leerSync({ personas: [{ correo: "a@b.co" }], roles }), { ok: false, problema: { tipo: "roles_invalidos" } });
  }
});

Deno.test("calcular: el pendiente lleva todo lo de la plataforma (nivel y el correo del jefe)", () => {
  const { resumen } = calcularCambios(ESTADO, pedido([
    { correo: "nueva@kash.test", nombre: "Nueva", rol: "Closer", nivel: "Supervisor", equipo: "A", reporta_a: "Beto@Kash.test" },
  ]));
  assertEquals(resumen.pendientes_de_crear, [
    { correo: "nueva@kash.test", nombre: "Nueva", rol: "Closer", nivel: "supervisor", equipo: "A", reporta_a: "beto@kash.test" },
  ]);
});

Deno.test("leerEstado: origen y con_permisos de cada rol (y una forma rota es null)", () => {
  const e = leerEstado({ ...ESTADO_DE_LA_BASE, roles: [{ nombre: "Closer", es_admin: false, origen: "plataforma", con_permisos: false }] });
  assertEquals(e?.roles, [{ nombre: "Closer", es_admin: false, origen: "plataforma", con_permisos: false }]);
  const viejo = leerEstado({ ...ESTADO_DE_LA_BASE, roles: [{ nombre: "Closer", es_admin: false }] });
  assertEquals(viejo?.roles, [{ nombre: "Closer", es_admin: false }], "sin los campos nuevos (antes de la migración) no se inventan");
  assertEquals(leerEstado({ ...ESTADO_DE_LA_BASE, roles: [{ nombre: "X", es_admin: false, origen: 7 }] }), null);
  assertEquals(leerEstado({ ...ESTADO_DE_LA_BASE, roles: [{ nombre: "X", es_admin: false, con_permisos: "si" }] }), null);
});

Deno.test("armarEquipo: roles con su origen, personas con el jefe por correo y activo = fuera de la papelera", () => {
  const estado: EstadoDeMaven = {
    ...ESTADO,
    roles: [{ nombre: "Closer", es_admin: false, origen: "plataforma", con_permisos: false }, { nombre: "admin", es_admin: true }],
    personas: [
      persona(2, "ana@kash.test", { reporta_a: ID(3), equipo: "A", hora_entrada: "09:00:00" }),
      persona(3, "beto@kash.test", { rol: "Chatter Supervisor", nivel: "supervisor" }),
      persona(5, "dario@kash.test", { en_papelera: true, reporta_a: ID(99) }),
    ],
  };
  const r = armarEquipo("agencia-1", estado);
  assertEquals(Object.keys(r).sort(), ["agencia", "aplicar", "personas", "roles"]);
  assertEquals(r.agencia, "agencia-1");
  assertEquals(r.roles, [
    { nombre: "Closer", es_admin: false, origen: "plataforma", con_permisos: false },
    { nombre: "admin", es_admin: true, origen: null, con_permisos: null },
  ]);
  assertEquals(r.personas[0], {
    correo: "ana@kash.test", nombre: "ana", rol: "Chatter", nivel: "agente", equipo: "A", reporta_a: "beto@kash.test",
    hora_entrada: "09:00:00", hora_salida: null, activo: true,
  });
  assertEquals(r.personas.map((p) => [p.correo, p.activo, p.reporta_a]), [
    ["ana@kash.test", true, "beto@kash.test"], ["beto@kash.test", true, null], ["dario@kash.test", false, null],
  ], "un jefe que no está en la agencia no se muestra como un id");
});

Deno.test("leerRango: AAAA-MM-DD, por defecto los últimos 7 días, hasta 93, y nada más en la URL", () => {
  assertEquals(hoyEnBogota(Date.UTC(2026, 10, 11, 3, 0)), "2026-11-10", "a las 22:00 de Bogotá todavía es el 10");
  assertEquals(hoyEnBogota(Date.UTC(2026, 10, 11, 6, 0)), "2026-11-11");
  const H = "2026-11-11";
  assertEquals(leerRango({}, H), { ok: true, desde: "2026-11-05", hasta: "2026-11-11" });
  assertEquals(leerRango({ hasta: "2026-03-01" }, H), { ok: true, desde: "2026-02-23", hasta: "2026-03-01" });
  assertEquals(leerRango({ desde: "2026-02-27" }, H), { ok: true, desde: "2026-02-27", hasta: "2026-03-05" });
  assertEquals(leerRango({ desde: "2026-01-01", hasta: "2026-04-03" }, H), { ok: true, desde: "2026-01-01", hasta: "2026-04-03" }, "93 días justos");
  const malos: Record<string, string>[] = [
    { desde: "2026-01-01", hasta: "2026-04-04" }, { desde: "2026-11-12", hasta: "2026-11-11" }, { desde: "2026-02-30" },
    { hasta: "11/11/2026" }, { desde: "" }, { desde: "2026-11-01", from: "2026-11-01" },
  ];
  for (const c of malos) assertEquals(leerRango(c, H), { ok: false }, JSON.stringify(c));
});

Deno.test("leerReporte y los resultados de roles y pendientes: una forma rota es null (503), nunca «vacío»", () => {
  assertEquals(leerReporte({ desde: "a", hasta: "b", personas: [] }), { desde: "a", hasta: "b", personas: [] });
  assertEquals(
    leerReporte({ desde: "a", hasta: "b", personas: [{ correo: "x@y.z", nombre: null, dias: [{ fecha: "2026-11-10", nota: 50 }] }] })?.personas[0].dias,
    [{ fecha: "2026-11-10", nota: 50 }],
  );
  for (const v of [null, [], { desde: "a", hasta: "b" }, { desde: "a", hasta: "b", personas: [{ correo: 1, dias: [] }] },
    { desde: "a", hasta: "b", personas: [{ correo: "x@y.z", dias: [{ nota: 1 }] }] }]) {
    assertEquals(leerReporte(v), null, JSON.stringify(v));
  }
  assertEquals(
    leerResultadoDeRoles({ ensayo: true, creados: ["A"], ya_estaban: [], rechazados: [{ nombre: "admin", motivo: "rol_de_admin" }] }),
    { ensayo: true, creados: ["A"], ya_estaban: [], rechazados: [{ nombre: "admin", motivo: "rol_de_admin" }] },
  );
  assertEquals(leerResultadoDeRoles({ ensayo: true, creados: [1], ya_estaban: [], rechazados: [] }), null);
  assertEquals(
    leerResultadoDePendientes({ ensayo: false, registradas: 1, actualizadas: 0, ignoradas: [{ correo: null, motivo: "correo_invalido" }] })?.registradas,
    1,
  );
  assertEquals(leerResultadoDePendientes({ ensayo: false, registradas: "1", actualizadas: 0, ignoradas: [] }), null);
});

const BASE_OK = { ensayo: false, aplicar: true, sync_id: "s1", aplicados: [], rechazados: [] };
const ROLES_OK = { ensayo: false, creados: ["Closer"], ya_estaban: ["Finanzas"], rechazados: [{ nombre: "Admin", motivo: "rol_de_admin" }] };
const PEND_OK = { ensayo: false, registradas: 1, actualizadas: 0, ignoradas: [] };

Deno.test("handler sync: los roles van PRIMERO; fuera de ensayo, quien no tiene cuenta queda pendiente", async () => {
  const { cliente, llamadas } = clienteFalso({
    api_equipo_roles: ok(ROLES_OK),
    api_equipo_estado: ok({ ...ESTADO_DE_LA_BASE, aplicar: true }),
    api_equipo_aplicar: ok(BASE_OK),
    api_equipo_pendientes: ok(PEND_OK),
  });
  const r = await servirComoUsuario("equipo", cliente, {
    ...CTX,
    cuerpo: {
      roles: ["Closer", "Finanzas", "Admin"],
      personas: [{ correo: "nueva@kash.test", nombre: "Nueva", rol: "Closer", nivel: "agente", reporta_a: "beto@kash.test" }],
    },
  });
  assert(r.ok, JSON.stringify(r));
  assertEquals(llamadas.map((l) => l.nombre), ["current_tenant_id", "api_equipo_roles", "api_equipo_estado", "api_equipo_aplicar", "api_equipo_pendientes"]);
  assertEquals(llamadas[1].args, { _roles: ["Closer", "Finanzas", "Admin"], _ensayo: false });
  assertEquals(llamadas[4].args._lista, [
    { correo: "nueva@kash.test", nombre: "Nueva", rol: "Closer", nivel: "agente", equipo: null, reporta_a: "beto@kash.test" },
  ]);
  const c = r.cuerpo as Record<string, any>;
  assertEquals(c.roles, ROLES_OK);
  assertEquals(c.pendientes, PEND_OK);
  assertEquals(c.pendientes_de_crear.map((p: any) => p.correo), ["nueva@kash.test"]);
});

Deno.test("handler sync: en ensayo no se anotan pendientes; sin roles no se llama a api_equipo_roles", async () => {
  const { cliente, llamadas } = clienteFalso({
    api_equipo_estado: ok(ESTADO_DE_LA_BASE),
    api_equipo_aplicar: ok({ ...BASE_OK, ensayo: true, aplicar: false }),
  });
  const r = await servirComoUsuario("equipo", cliente, { ...CTX, cuerpo: { personas: [{ correo: "nueva@kash.test" }] } });
  assert(r.ok, JSON.stringify(r));
  assertEquals(llamadas.map((l) => l.nombre), ["current_tenant_id", "api_equipo_estado", "api_equipo_aplicar"]);
  const c = r.cuerpo as Record<string, any>;
  assertEquals([c.roles, c.pendientes], [null, null]);
  assertEquals(c.pendientes_de_crear.length, 1, "igual dice quién quedaría pendiente");
});

Deno.test("handler sync: roles que no son una lista → 400 sin tocar la base; la base dice que no → su error", async () => {
  const { cliente, llamadas } = clienteFalso({});
  const r = await servirComoUsuario("equipo", cliente, { ...CTX, cuerpo: { roles: "Closer", personas: [{ correo: "a@b.co" }] } });
  assert(!r.ok && r.estado === 400 && "error" in r && r.error === "invalid_field");
  assertEquals(llamadas.map((l) => l.nombre), ["current_tenant_id"]);
  const prohibido = clienteFalso({
    api_equipo_roles: { data: null, error: { code: "MV403", message: "api_equipo_sin_permiso", details: '{"error": "forbidden"}' } },
  });
  const r2 = await servirComoUsuario("equipo", prohibido.cliente, { ...CTX, cuerpo: { roles: ["X"], personas: [{ correo: "a@b.co" }] } });
  assert(!r2.ok && r2.estado === 403);
  assertEquals(prohibido.llamadas.map((l) => l.nombre), ["current_tenant_id", "api_equipo_roles"], "sin roles no se sigue");
  const roto = clienteFalso({ api_equipo_roles: ok({ creados: "x" }) });
  const r3 = await servirComoUsuario("equipo", roto.cliente, { ...CTX, cuerpo: { roles: ["X"], personas: [{ correo: "a@b.co" }] } });
  assert(!r3.ok && r3.estado === 503);
});

const GET: Contexto = { ...CTX, metodo: "GET", cuerpo: null, ruta: [] };

Deno.test("GET /equipo: el equipo como quedó, con la sesión de la llave", async () => {
  const { cliente, llamadas } = clienteFalso({ api_equipo_estado: ok(ESTADO_DE_LA_BASE) });
  const r = await servirComoUsuario("equipo", cliente, GET);
  assert(r.ok, JSON.stringify(r));
  assertEquals(llamadas.map((l) => l.nombre), ["current_tenant_id", "api_equipo_estado"]);
  const c = r.cuerpo as Record<string, any>;
  assertEquals(c.agencia, AGENCIA);
  assertEquals(c.personas.map((p: any) => p.correo), ESTADO.personas.map((p) => p.correo).sort());
  assertEquals(c.personas.find((p: any) => p.correo === "dario@kash.test").activo, false);
  const conParams = await servirComoUsuario("equipo", clienteFalso({}).cliente, { ...GET, consulta: { limit: "5" } });
  assert(!conParams.ok && conParams.estado === 400, "un parámetro que no existe es un 400, no se ignora");
  const post = await servirComoUsuario("equipo", clienteFalso({}).cliente, { ...CTX, ruta: [] });
  assert(!post.ok && post.estado === 405 && "permitidos" in post && post.permitidos.join() === "GET");
  const sin = await servirComoUsuario("equipo", clienteFalso({}).cliente, { ...GET, scopes: ["employees:read"] });
  assert(!sin.ok && sin.estado === 403, "GET también pide equipo:write");
});

Deno.test("GET /equipo/horas y /equipo/notas: el rango va a la base; un rango malo es 400 sin tocarla", async () => {
  const REPORTE = {
    desde: "2026-11-01", hasta: "2026-11-10",
    personas: [{ correo: "ana@kash.test", nombre: "Ana", dias: [{ fecha: "2026-11-10", minutos_trabajados: 240 }] }],
  };
  for (const [ruta, rpc] of [["horas", "api_equipo_horas"], ["notas", "api_equipo_notas"]] as const) {
    const { cliente, llamadas } = clienteFalso({ [rpc]: ok(REPORTE) });
    const r = await servirComoUsuario("equipo", cliente, { ...GET, ruta: [ruta], consulta: { desde: "2026-11-01", hasta: "2026-11-10" } });
    assert(r.ok, JSON.stringify(r));
    assertEquals(r.cuerpo, REPORTE);
    assertEquals(llamadas[1], { nombre: rpc, args: { _desde: "2026-11-01", _hasta: "2026-11-10" } });
    const malo = clienteFalso({});
    const r2 = await servirComoUsuario("equipo", malo.cliente, { ...GET, ruta: [ruta], consulta: { desde: "2026-01-01", hasta: "2026-06-01" } });
    assert(!r2.ok && r2.estado === 400 && "error" in r2 && r2.error === "invalid_range", `${ruta}: más de 93 días`);
    assertEquals(malo.llamadas.map((l) => l.nombre), ["current_tenant_id"]);
    const roto = clienteFalso({ [rpc]: ok({ personas: "x" }) });
    const r3 = await servirComoUsuario("equipo", roto.cliente, { ...GET, ruta: [ruta] });
    assert(!r3.ok && r3.estado === 503, `${ruta}: una forma rota es 503`);
    const post = await servirComoUsuario("equipo", clienteFalso({}).cliente, { ...CTX, ruta: [ruta] });
    assert(!post.ok && post.estado === 405);
  }
});
