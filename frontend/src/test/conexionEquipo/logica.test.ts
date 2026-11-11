// Lo puro de Conectar tu plataforma: leer los envíos, las palabras de cada rechazo,
// partir el nombre para el alta, el adaptador del webhook y las instrucciones.
import { describe, it, expect } from "vitest";
import translations, { getTranslation, type TranslationKey } from "@/lib/i18n";
import {
  conteosDe, haceCuanto, inicial, leerResumen, leerSync, partirNombre, textoDelCampo, textoDelMotivo, valorLegible,
} from "@/lib/conexionEquipo/resumen";
import {
  EVENTOS_EQUIPO, admiteWebhook, avisaMensajes, eventosDeLaLlave, llaveDelEquipo,
} from "@/lib/conexionEquipo/webhook";
import { armarInstrucciones, EJEMPLO_SYNC } from "@/lib/conexionEquipo/instrucciones";
import { estadoEfectivo, introDelAlta, queMostrar } from "@/pages/admin/ApiKeyWebhook";

const tEs = (k: TranslationKey, p?: Record<string, string | number>) => getTranslation(k, "es", p);
const tEn = (k: TranslationKey, p?: Record<string, string | number>) => getTranslation(k, "en", p);

// Las fuentes de los códigos: la edge (equipo-logica.ts) y la base (las migraciones
// del equipo). Rutas literales desde la raíz del repo, como en sinEspanolNuevo.
const edge = (import.meta as unknown as {
  glob: (p: string, o: Record<string, unknown>) => Record<string, string>;
}).glob("/supabase/functions/public-api/equipo-logica.ts", { query: "?raw", import: "default", eager: true });
const migraciones = (import.meta as unknown as {
  glob: (p: string, o: Record<string, unknown>) => Record<string, string>;
}).glob("/supabase/migrations/*equipo*.sql", { query: "?raw", import: "default", eager: true });

function motivosDeLaEdge(): string[] {
  const src = Object.values(edge)[0] ?? "";
  const union = src.match(/export type MotivoDeRechazo =([\s\S]*?);/)?.[1] ?? "";
  return [...union.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
}
function motivosDeLaBase(): string[] {
  const todos = new Set<string>();
  for (const sql of Object.values(migraciones)) {
    for (const m of sql.matchAll(/_motivo\s*:=\s*'([a-z_]+)'/g)) todos.add(m[1]);
    for (const m of sql.matchAll(/'motivo',\s*'([a-z_]+)'/g)) todos.add(m[1]);
  }
  return [...todos];
}

describe("cada motivo de rechazo tiene su frase", () => {
  it("se encontraron los códigos (un glob vacío pasaría todo)", () => {
    expect(motivosDeLaEdge().length).toBeGreaterThan(10);
    expect(motivosDeLaBase().length).toBeGreaterThan(10);
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

describe("el webhook del equipo, sobre el sistema de webhooks que ya existe", () => {
  const base = { id: "k", name: "k", status: "active" as const, created_at: "2026-11-01T00:00:00Z", acts_as: { id: "yo", name: null, active: true } };

  it("una llave con equipo:write admite webhook y recibe los tres eventos", () => {
    expect(admiteWebhook(["equipo:write"])).toBe(true);
    expect(admiteWebhook(["creators:read"])).toBe(false);
    expect(eventosDeLaLlave(["equipo:write"])).toEqual([...EVENTOS_EQUIPO]);
    expect(eventosDeLaLlave(["messenger:read", "equipo:write"])).toEqual(["messages.created", ...EVENTOS_EQUIPO]);
    expect(avisaMensajes(["equipo:write"])).toBe(false);
  });

  it("la tabla de API keys ofrece registrar el webhook en la llave del equipo", () => {
    expect(queMostrar({ ...base, scopes: ["equipo:write"], webhook: null }, "yo", false)).toBe("registrar");
    expect(queMostrar({ ...base, scopes: ["creators:read"], webhook: null }, "yo", false)).toBe("nada");
    // Un webhook en una llave del equipo NO se ve como «sin el permiso de Messenger».
    const w = { status: "active", consecutive_failures: 0, last_attempt_at: null, failing_since: null, last_error: null, disabled_reason: null };
    expect(estadoEfectivo(w as never, { ...base, scopes: ["equipo:write"] }).motivo).toBeNull();
  });

  it("el alta cuenta lo que recibe cada llave", () => {
    expect(introDelAlta(["equipo:write"], tEs)).toMatch(/equipo\.persona_entro/);
    expect(introDelAlta(["messenger:read"], tEs)).toBe(tEs("apiKeys.webhook.registerIntro"));
  });

  it("la llave del equipo: la activa (con webhook primero); si no hay, la última que hubo", () => {
    const k = (id: string, extra: Record<string, unknown>) => ({ ...base, id, scopes: ["equipo:write"], ...extra });
    const vieja = k("vieja", { created_at: "2026-10-01T00:00:00Z" });
    const nueva = k("nueva", { created_at: "2026-11-05T00:00:00Z" });
    const conWebhook = k("con", { created_at: "2026-10-15T00:00:00Z", webhook: { id: "w" } });
    expect(llaveDelEquipo([vieja, nueva]).llave?.id).toBe("nueva");
    expect(llaveDelEquipo([vieja, nueva, conWebhook]).llave?.id).toBe("con");
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
});
