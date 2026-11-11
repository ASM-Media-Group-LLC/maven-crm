// Lo puro de Conectar tu plataforma: leer los envíos, las palabras de cada rechazo,
// partir el nombre para el alta, los avisos del equipo, los errores de las RPC y las
// instrucciones.
import { describe, it, expect } from "vitest";
import translations, { getTranslation, type TranslationKey } from "@/lib/i18n";
import {
  conteosDe, haceCuanto, inicial, leerResumen, leerSync, partirNombre, textoDelCampo, textoDelMotivo, valorLegible,
} from "@/lib/conexionEquipo/resumen";
import {
  EVENTOS_EQUIPO, accionesDe, eventosParaCrear, llaveDelEquipo, normalizarUrl, semaforoDe, textoDeLaEntrega,
  textoDelDetenido, type EntregaEquipo, type WebhookEquipo,
} from "@/lib/conexionEquipo/webhook";
import { CODIGOS_DE_ERROR, codigoDelError, textoDelErrorRpc } from "@/lib/conexionEquipo/errores";
import { armarInstrucciones, EJEMPLO_RESPUESTA, EJEMPLO_SYNC } from "@/lib/conexionEquipo/instrucciones";

const tEs = (k: TranslationKey, p?: Record<string, string | number>) => getTranslation(k, "es", p);
const tEn = (k: TranslationKey, p?: Record<string, string | number>) => getTranslation(k, "en", p);

// Las fuentes de los códigos: la edge (equipo-logica.ts) y la base (las migraciones
// del equipo y la de agencias conectadas). Rutas literales desde la raíz del repo,
// como en sinEspanolNuevo.
const edge = (import.meta as unknown as {
  glob: (p: string, o: Record<string, unknown>) => Record<string, string>;
}).glob("/supabase/functions/public-api/equipo-logica.ts", { query: "?raw", import: "default", eager: true });
const migraciones = (import.meta as unknown as {
  glob: (p: string, o: Record<string, unknown>) => Record<string, string>;
}).glob("/supabase/migrations/*equipo*.sql", { query: "?raw", import: "default", eager: true });
const agencias = (import.meta as unknown as {
  glob: (p: string, o: Record<string, unknown>) => Record<string, string>;
}).glob("/supabase/migrations/20261111190000_agencias_conectadas.sql", { query: "?raw", import: "default", eager: true });
const sqlDelEquipo = () => [...Object.values(migraciones), ...Object.values(agencias)];

function motivosDeLaEdge(): string[] {
  const src = Object.values(edge)[0] ?? "";
  const union = src.match(/export type MotivoDeRechazo =([\s\S]*?);/)?.[1] ?? "";
  return [...union.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
}
/** Los motivos que la base pone en un rechazo (aplicar, roles) o en un ignorado
 *  (pendientes). Solo esos: el `motivo` de los avisos (alta, papelera…) es un dato. */
function motivosDeLaBase(): string[] {
  const todos = new Set<string>();
  for (const sql of sqlDelEquipo()) {
    for (const m of sql.matchAll(/_motivo\s*:=\s*'([a-z_]+)'/g)) todos.add(m[1]);
    for (const m of sql.matchAll(/(?:_rechazados|_ignoradas)\s*:=[^;]*?'motivo',\s*'([a-z_]+)'/g)) todos.add(m[1]);
  }
  return [...todos];
}
/** Los códigos con que empiezan los errores de las RPC que usa la app. */
function erroresDeLasRpc(): string[] {
  const sql = Object.values(agencias)[0] ?? "";
  return [...new Set([...sql.matchAll(/message\s*=\s*'([a-z_]+):/g)].map((m) => m[1]))];
}
const ENTREGA: EntregaEquipo = {
  id: "e", evento: "webhook.test", state: "pending", drop_reason: null, attempts: 0, next_attempt_at: null,
  last_attempt_at: null, last_status_code: null, last_error: null, latency_ms: null, uncertain: false,
  created_at: "2026-11-11T00:00:00Z", delivered_at: null,
};

describe("cada motivo de rechazo tiene su frase", () => {
  it("se encontraron los códigos (un glob vacío pasaría todo)", () => {
    expect(motivosDeLaEdge().length).toBeGreaterThan(10);
    expect(motivosDeLaBase().length).toBeGreaterThan(10);
    // Los de los roles y los pendientes (20261111190000) también.
    expect(motivosDeLaBase()).toEqual(expect.arrayContaining(["nombre_muy_largo", "nombre_invalido", "rol_inactivo", "ya_tiene_cuenta"]));
  });

  it("los de la edge y los de la base se leen en palabras, en los dos idiomas", () => {
    const sinFrase = [...new Set([...motivosDeLaEdge(), ...motivosDeLaBase()])]
      .filter((m) => !(`conexionEquipo.motivo.${m}` in translations));
    expect(sinFrase, "Agrega `conexionEquipo.motivo.<código>` en lib/i18n/conexionEquipo.ts").toEqual([]);
  });

  it("uno que no se conoce sale con su código, no en blanco", () => {
    expect(textoDelMotivo("algo_nuevo", tEs)).toContain("algo_nuevo");
    expect(textoDelMotivo("rol_de_admin", tEn)).toMatch(/admin role/);
    expect(textoDelCampo("reporta_a", tEs)).toBe("Jefe");
    expect(textoDelCampo("campo_raro", tEs)).toBe("campo_raro");
  });

  it("las horas se leen sin segundos; lo demás, tal cual", () => {
    expect(valorLegible("hora_entrada", "08:00:00")).toBe("08:00");
    expect(valorLegible("hora_salida", "16:30:15")).toBe("16:30:15");
    expect(valorLegible("rol", "08:00:00")).toBe("08:00:00");
    expect(valorLegible("equipo", null)).toBeNull();
  });
});

describe("leer un envío", () => {
  it("junta los rechazos de la edge y de la base, con el correo del cambio", () => {
    const s = leerSync({
      id: "s1", created_at: "2026-11-11T14:00:00Z", ensayo: true, recibidas: 5,
      resumen: {
        recibidas: 5,
        cambios: [
          { user_id: "u1", correo: "a@x.com", nombre: "A", campo: "rol", antes: "x", despues: "y" },
          { user_id: "u2", correo: "b@x.com", nombre: "B", campo: "nivel", antes: null, despues: "agente" },
        ],
        rechazados: [{ indice: 0, correo: "c@x.com", campo: "correo", motivo: "correo_invalido" }],
      },
      aplicados: [{ user_id: "u1", campo: "rol" }],
      rechazados_base: [{ user_id: "u2", campo: "nivel", motivo: "nivel_no_permitido" }],
    });
    expect(s.rechazados).toEqual([
      { correo: "c@x.com", campo: "correo", motivo: "correo_invalido" },
      { correo: "b@x.com", campo: "nivel", motivo: "nivel_no_permitido" },
    ]);
    expect(conteosDe(s)).toEqual({ recibidas: 5, cambios: 2, aplicados: 1, rechazados: 2, pendientes: 0, roles: 0, protegidos: 0 });
    // Sin repeticiones, cuenta como una.
    expect(s.repeticiones).toBe(1);
  });

  it("un resumen con otra forma no tumba la pantalla: lo que falta cuenta como vacío", () => {
    const r = leerResumen({ recibidas: "x", cambios: "no", roles_desconocidos: [{ rol: "Closer", correos: ["a@x.com", 3] }] });
    expect(r.recibidas).toBe(0);
    expect(r.cambios).toEqual([]);
    expect(r.roles_desconocidos).toEqual([{ rol: "Closer", correos: ["a@x.com"] }]);
    expect(r.freno_de_bajas).toBeNull();
    expect(leerResumen(null).pendientes_de_crear).toEqual([]);
  });
});

describe("partir el nombre para create_user", () => {
  it("nombre y apellido; sin nombre, del correo", () => {
    expect(partirNombre("Ana María Torres", "x@y.com")).toEqual({ first_name: "Ana", last_name: "María Torres" });
    expect(partirNombre("Cher", "x@y.com")).toEqual({ first_name: "Cher", last_name: "" });
    expect(partirNombre(null, "luis.gil@agencia.com")).toEqual({ first_name: "Luis", last_name: "Gil" });
    expect(partirNombre("  ", "soporte@agencia.com")).toEqual({ first_name: "Soporte", last_name: "" });
  });

  it("la inicial del avatar de una letra", () => {
    expect(inicial("ana")).toBe("A");
    expect(inicial("  Álvaro")).toBe("Á");
    expect(inicial(null)).toBe("?");
  });

  it("hace cuánto, en el idioma pedido", () => {
    const ahora = Date.parse("2026-11-11T15:00:00Z");
    expect(haceCuanto("2026-11-11T13:00:00Z", "es-CO", ahora)).toMatch(/2 horas/);
    expect(haceCuanto("2026-11-11T14:58:00Z", "en-US", ahora)).toMatch(/2 minutes ago/);
  });
});

describe("los avisos del equipo (RPC propias, no los webhooks del Messenger)", () => {
  const base = { id: "k", name: "k", status: "active" as const, created_at: "2026-11-01T00:00:00Z" };
  const aviso = (extra: Partial<WebhookEquipo> = {}): WebhookEquipo => ({
    id: "w", api_key_id: "k", url_host: "x.com", eventos: [...EVENTOS_EQUIPO], status: "active", disabled_reason: null,
    disabled_at: null, secret_last4: "abcd", consecutive_failures: 0, failing_since: null, last_attempt_at: null,
    last_success_at: null, last_status_code: null, last_error: null, created_by: null, created_at: "2026-11-11T00:00:00Z",
    pendientes: 0, ...extra,
  });

  it("la URL va como new URL(x).href y solo https", () => {
    expect(normalizarUrl("  https://Hooks.Example.com ")).toBe("https://hooks.example.com/");
    expect(normalizarUrl("https://hooks.example.com:443/maven?x=1")).toBe("https://hooks.example.com/maven?x=1");
    expect(normalizarUrl("http://hooks.example.com")).toBeNull();
    expect(normalizarUrl("no es una url")).toBeNull();
  });

  it("los tres eventos van como null (lo que la base toma por defecto); menos, como lista", () => {
    expect(eventosParaCrear([...EVENTOS_EQUIPO])).toBeNull();
    expect(eventosParaCrear(["equipo.rol_cambio", "otro"])).toEqual(["equipo.rol_cambio"]);
  });

  it("cómo está y qué se puede hacer", () => {
    expect(semaforoDe(aviso()).tono).toBe("bien");
    expect(semaforoDe(aviso({ consecutive_failures: 3 })).tono).toBe("ojo");
    expect(semaforoDe(aviso({ status: "paused" })).tono).toBe("apagado");
    expect(accionesDe(aviso())).toMatchObject({ probar: true, pausar: true, reanudar: false });
    expect(accionesDe(aviso({ status: "paused" }))).toMatchObject({ probar: false, pausar: false, reanudar: true });
    // Con la llave revocada, reanudar no lo arregla: hay que crear otra llave.
    expect(accionesDe(aviso({ status: "disabled", disabled_reason: "key_revoked" })).reanudar).toBe(false);
    expect(accionesDe(aviso({ status: "disabled", disabled_reason: "receiver_failing" })).reanudar).toBe(true);
    expect(textoDelDetenido("receiver_gone", tEs)).toMatch(/410/);
    expect(textoDeLaEntrega({ ...ENTREGA, state: "delivered", last_status_code: 204 }, tEs).texto).toMatch(/204/);
    expect(textoDeLaEntrega({ ...ENTREGA, state: "dropped", drop_reason: "endpoint_paused" }, tEs).tono).toBe("mal");
  });

  it("cada error de las RPC de la app se dice en una frase, en los dos idiomas", () => {
    expect(erroresDeLasRpc().length).toBeGreaterThan(10);
    const sinFrase = erroresDeLasRpc().filter((c) => !CODIGOS_DE_ERROR.includes(c));
    expect(sinFrase, "Agrega el código en lib/conexionEquipo/errores.ts y su frase").toEqual([]);
    expect(textoDelErrorRpc(new Error("url_invalida: la url no sirve"), tEs)).toMatch(/https/);
    expect(textoDelErrorRpc(new Error("ya_resuelta: ese pendiente ya está aprobada"), tEn)).toMatch(/already/);
    // Uno que no se conoce, con su mensaje tal cual.
    expect(textoDelErrorRpc(new Error("otra_cosa: detalle"), tEs)).toBe("otra_cosa: detalle");
    expect(codigoDelError(new Error("sin_permiso: solo el dueño"))).toBe("sin_permiso");
  });

  it("la llave del equipo: la activa (con aviso primero); si no hay, la última que hubo", () => {
    const k = (id: string, extra: Record<string, unknown>) => ({ ...base, id, scopes: ["equipo:write"], ...extra });
    const vieja = k("vieja", { created_at: "2026-10-01T00:00:00Z" });
    const nueva = k("nueva", { created_at: "2026-11-05T00:00:00Z" });
    const conAviso = k("con", { created_at: "2026-10-15T00:00:00Z" });
    expect(llaveDelEquipo([vieja, nueva]).llave?.id).toBe("nueva");
    expect(llaveDelEquipo([vieja, nueva, conAviso], new Set(["con"])).llave?.id).toBe("con");
    const revocada = k("rev", { status: "revoked" });
    expect(llaveDelEquipo([revocada])).toEqual({ llave: revocada, activa: false });
    expect(llaveDelEquipo([{ ...base, scopes: ["creators:read"] }])).toEqual({ llave: null, activa: false });
  });
});

describe("las instrucciones que se copian", () => {
  it("el cuerpo de ejemplo es JSON válido con los campos del contrato", () => {
    const cuerpo = JSON.parse(EJEMPLO_SYNC);
    expect(cuerpo.ensayo).toBe(true);
    expect(Array.isArray(cuerpo.roles)).toBe(true);
    expect(Object.keys(cuerpo.personas[0]).sort()).toEqual(
      ["activo", "correo", "equipo", "hora_entrada", "hora_salida", "nivel", "nombre", "reporta_a", "rol"].sort(),
    );
  });

  it("en los dos idiomas: la base, los cuatro endpoints, los avisos y la regla de la llave", () => {
    for (const t of [tEs, tEn]) {
      const texto = armarInstrucciones(t, "https://api.example.com/functions/v1/public-api");
      expect(texto).toContain("https://api.example.com/functions/v1/public-api");
      for (const ep of ["POST /equipo/sync", "GET /equipo`", "GET /equipo/horas?desde=", "GET /equipo/notas?desde="]) {
        expect(texto).toContain(ep);
      }
      for (const e of EVENTOS_EQUIPO) expect(texto).toContain(e);
      expect(texto).toContain("MAVEN_API_KEY");
      expect(texto).not.toMatch(/\{(base|n|nombre)\}/);
    }
    expect(armarInstrucciones(tEs, "b")).toMatch(/nunca por chat/);
    expect(armarInstrucciones(tEn, "b")).toMatch(/never over chat/);
  });

  it("los roles van primero en el cuerpo y la respuesta trae `roles` y `pendientes`", () => {
    expect(Object.keys(JSON.parse(EJEMPLO_SYNC)).indexOf("roles")).toBeLessThan(Object.keys(JSON.parse(EJEMPLO_SYNC)).indexOf("personas"));
    const r = JSON.parse(EJEMPLO_RESPUESTA);
    expect(r.object).toBe("equipo_sync");
    expect(Object.keys(r.roles).sort()).toEqual(["creados", "ensayo", "rechazados", "ya_estaban"]);
    expect(Object.keys(r.pendientes).sort()).toEqual(["actualizadas", "ensayo", "ignoradas", "registradas"]);
    for (const t of [tEs, tEn]) {
      const texto = armarInstrucciones(t, "b");
      expect(texto).toContain("\"pendientes\": {");
      // En ensayo, quien tiene un rol por crear sale en roles_desconocidos.
      expect(texto).toContain("`roles_desconocidos`");
      // Horas y notas: 7 días por defecto, hasta 93, y los campos de cada día.
      expect(texto).toMatch(/7/);
      expect(texto).toMatch(/93/);
      for (const campo of ["minutos_trabajados", "llego_tarde", "desglose", "crudo"]) expect(texto).toContain(campo);
      expect(texto).toContain("webhook.test");
    }
  });
});
