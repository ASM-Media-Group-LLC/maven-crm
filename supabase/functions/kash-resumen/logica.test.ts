// kash-resumen: SOLO lectura y SOLO números (Alvaro, 19/11/2026, tanda 5).
//   deno test --allow-read supabase/functions/kash-resumen/
// La guarda estática lee index.ts: si alguien le agrega una escritura, un rpc que no
// está en la lista, una columna personal o la saca de la lista de llaves, falla.
import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { armarResumen, type Conteos, inicioDelDiaBogota, LLAVES_DEL_RESUMEN, notaDelEquipo } from "./logica.ts";

const fuente = Deno.readTextFileSync(new URL("./index.ts", import.meta.url));
const codigo = fuente.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

const base: Conteos = {
  personas: 91, enVivo: 40, segundosPantallaHoy: [8 * 3600, 4 * 3600],
  capturasCamara: 10, capturasConCara: 8, capturasPantalla: 20, capturasDistraido: 2,
  argosGastoHoyUsd: 12.345, argosSaldoUsd: 80.1, argosSaldoEstado: "bien", alertasAbiertas: 5, alertasGraves: 2,
};

Deno.test("el resumen trae SOLO las llaves de la lista y SOLO números / fecha / estado", () => {
  const r = armarResumen(base, new Date("2026-11-20T15:00:00Z"));
  assertEquals(Object.keys(r).sort(), [...LLAVES_DEL_RESUMEN].sort());
  for (const [k, v] of Object.entries(r)) {
    if (k === "calculado_at") assert(/^\d{4}-\d\d-\d\dT/.test(String(v)));
    else if (k === "argos_saldo_estado") assert(v === null || /^[a-z_]+$/.test(String(v)));
    else assert(v === null || typeof v === "number", `${k} no es un número`);
  }
  // Nada que parezca un dato personal.
  const texto = JSON.stringify(r);
  assert(!/@|[0-9a-f]{8}-[0-9a-f]{4}-/.test(texto), "ni correos ni ids");
});

Deno.test("la nota del equipo: 45 pantalla + 35 cámara + 20 foco, como el edificio", () => {
  // Pantalla: (45 + 22.5) / 2 = 33.75; cámara 8/10 × 35 = 28; foco (1 − 2/20) × 20 = 18 → 79.75 → 80.
  assertEquals(notaDelEquipo(base), { nota: 80, conDatos: 2 });
  assertEquals(notaDelEquipo({ ...base, segundosPantallaHoy: [], capturasCamara: 0, capturasPantalla: 0 }), { nota: null, conDatos: 0 });
  assertEquals(notaDelEquipo({ ...base, segundosPantallaHoy: [20 * 3600], capturasCamara: 0, capturasConCara: 0, capturasPantalla: 0, capturasDistraido: 0 }).nota, 65);
  const r = armarResumen(base, new Date());
  assertEquals(r.argos_gasto_hoy_usd, 12.35);
  assertEquals(r.necesita_de_ti, 2);
  assertEquals(armarResumen({ ...base, argosSaldoEstado: "<script>" }, new Date()).argos_saldo_estado, null);
});

Deno.test("el día empieza a medianoche de Bogotá", () => {
  assertEquals(inicioDelDiaBogota(new Date("2026-11-20T03:00:00Z")), "2026-11-19T05:00:00.000Z");
  assertEquals(inicioDelDiaBogota(new Date("2026-11-20T05:00:00Z")), "2026-11-20T05:00:00.000Z");
});

Deno.test("guarda: index.ts no escribe nada en Kash", () => {
  for (const prohibido of [/\.insert\(/, /\.update\(/, /\.upsert\(/, /\.delete\(/, /method:\s*["'](POST|PATCH|PUT|DELETE)/i, /\/rest\/v1/, /execute_sql|\.sql\(/]) {
    assert(!prohibido.test(codigo), `index.ts tiene algo que escribe: ${prohibido}`);
  }
});

Deno.test("guarda: solo los rpc de lectura de la lista", () => {
  const rpcs = [...codigo.matchAll(/\.rpc\(\s*["']([a-z_]+)["']/g)].map((m) => m[1]).sort();
  assertEquals(rpcs, ["argos_gasto_hoy", "ia_saldo_calculo"]);
});

Deno.test("guarda: solo estas tablas y columnas (nada personal)", () => {
  const tablas = [...new Set([...codigo.matchAll(/\.from\(\s*["']([a-z_]+)["']/g)].map((m) => m[1]))].sort();
  assertEquals(tablas, ["argos_alertas", "cowork_tiempo_segmentos", "monitor_capturas", "profiles", "tenant_members"]);
  const columnas = [...codigo.matchAll(/\.select\(\s*["']([^"']+)["']/g)].flatMap((m) => m[1].split(",").map((c) => c.trim()));
  for (const c of columnas) {
    assert(["id", "user_id", "estado", "seconds"].includes(c), `columna no permitida en kash-resumen: ${c}`);
  }
  for (const pii of ["email", "full_name", "phone", "telefono", "avatar", "nombre", "correo", "url", "texto", "veredicto"]) {
    assert(!new RegExp(`select\\([^)]*${pii}`).test(codigo), `no se lee ${pii}`);
  }
  // Lo que sale: armarResumen (la lista de llaves) y nada más.
  assert(/resumen:\s*armarResumen\(/.test(codigo));
  assertEquals([...codigo.matchAll(/json\(\{\s*ok:\s*true/g)].length, 1);
});

Deno.test("guarda: entra solo con su token, comparado en tiempo constante", () => {
  assert(/tokenDeCronValido\(req\.headers\.get\("x-kash-resumen-token"\), esperado\)/.test(codigo));
  assert(/Deno\.env\.get\("KASH_RESUMEN_TOKEN"\)/.test(codigo));
});
