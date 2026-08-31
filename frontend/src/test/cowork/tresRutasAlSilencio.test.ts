import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { idDePestana, _olvidarIdDePestana } from "@/lib/idDePestana";
import {
  marcarDescartada, fueDescartada, olvidarDescartada, _limpiarDescartadas,
} from "@/lib/solicitudPrivada";

// Tres formas distintas de que el supervisor hable y nadie lo escuche. Se ven
// todas igual desde afuera ("no me escuchó"), y por eso arreglar una sola no
// resolvía nada.

// ── 1. El tablero abierto dos veces ────────────────────────────────────────
//
// El token del monitor usaba la identidad `${userId}__monitor`: única por
// PERSONA, no por pestaña. Con el tablero abierto dos veces, los dos monitores
// de cada sala chocaban y LiveKit expulsaba a uno. El expulsado no volvía a
// publicar el micro NUNCA (su efecto está guardado por `status !== "ready"`) y
// el botón seguía verde «Hablando».
describe("id de pestaña (para que dos tableros no se peleen)", () => {
  beforeEach(() => { _olvidarIdDePestana(); });

  it("es estable dentro de la misma pestaña", () => {
    // Si cambiara en cada reconexión, cada intento entraría como alguien nuevo
    // y dejaría participantes fantasma hasta que el servidor los expire.
    expect(idDePestana()).toBe(idDePestana());
  });

  it("sobrevive a recargar (queda en sessionStorage)", () => {
    const antes = idDePestana();
    // Recargar no limpia sessionStorage: el módulo vuelve a leer de ahí.
    expect(window.sessionStorage.getItem("maven.tab.id")).toBe(antes);
    expect(idDePestana()).toBe(antes);
  });

  it("otra pestaña (otro sessionStorage) obtiene uno distinto", () => {
    const primera = idDePestana();
    _olvidarIdDePestana();                 // simula una pestaña nueva
    expect(idDePestana()).not.toBe(primera);
  });

  it("tiene forma segura para meterlo en una identidad", () => {
    // Va dentro de `${userId}__monitor__${tab}`: si trajera caracteres raros
    // ensuciaría la identidad. El edge además lo sanea, pero esto no debería
    // depender de eso.
    expect(idDePestana()).toMatch(/^[a-z0-9]{4,16}$/);
  });

  it("no explota si sessionStorage no está disponible", () => {
    // Modo privado, cookies bloqueadas.
    const real = window.sessionStorage.getItem;
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("bloqueado"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("bloqueado"); });
    const id = idDePestana();
    expect(id).toMatch(/^[a-z0-9]{4,16}$/);
    expect(idDePestana()).toBe(id);       // estable igual, en memoria
    vi.restoreAllMocks();
    expect(typeof real).toBe("function");
  });
});

// ── 2. La llamada privada que secuestra ────────────────────────────────────
//
// Mientras exista una solicitud privada `open`/`acknowledged`, al chatter se lo
// lleva a esa sala 1:1. Si nadie la cierra, queda parado en una sala VACÍA
// mientras la supervisora le habla a la sala principal.
//
// Al colgar se intenta resolverla, pero es best-effort: si falla —o si cierra
// la pestaña sin colgar— la solicitud queda viva. Y la marca de "ya la
// descarté" vivía en un `useRef`, o sea en memoria: cada recarga la borraba y
// el chatter volvía a ser secuestrado.
describe("descarte de la llamada privada", () => {
  beforeEach(() => { _limpiarDescartadas(); });
  afterEach(() => { _limpiarDescartadas(); });

  it("una solicitud que no se descartó no está descartada", () => {
    expect(fueDescartada("req-1")).toBe(false);
  });

  it("descartarla la recuerda", () => {
    marcarDescartada("req-1");
    expect(fueDescartada("req-1")).toBe(true);
  });

  it("SOBREVIVE a recargar — es el bug entero", () => {
    marcarDescartada("req-1");
    // Recargar tira toda la memoria del módulo, pero no sessionStorage. Se
    // simula leyendo el storage crudo, que es lo que verá la página nueva.
    const crudo = window.sessionStorage.getItem("maven.cowork.privadas.descartadas");
    expect(crudo).toContain("req-1");
    expect(fueDescartada("req-1")).toBe(true);
  });

  it("no confunde una solicitud con otra", () => {
    marcarDescartada("req-1");
    expect(fueDescartada("req-2")).toBe(false);
  });

  it("olvidarla permite volver a entrar", () => {
    // El chatter tiene un botón para reconectarse a la privada.
    marcarDescartada("req-1");
    olvidarDescartada("req-1");
    expect(fueDescartada("req-1")).toBe(false);
  });

  it("descartar dos veces no duplica", () => {
    marcarDescartada("req-1");
    marcarDescartada("req-1");
    const ids = JSON.parse(window.sessionStorage.getItem("maven.cowork.privadas.descartadas")!);
    expect(ids).toEqual(["req-1"]);
  });

  it("no crece para siempre", () => {
    for (let i = 0; i < 50; i++) marcarDescartada(`req-${i}`);
    const ids = JSON.parse(window.sessionStorage.getItem("maven.cowork.privadas.descartadas")!);
    expect(ids.length).toBeLessThanOrEqual(20);
    // Conserva las MÁS NUEVAS: las viejas ya se resolvieron hace rato.
    expect(ids).toContain("req-49");
  });

  it("ignora ids vacíos en vez de guardar basura", () => {
    marcarDescartada(null);
    marcarDescartada(undefined);
    marcarDescartada("");
    expect(fueDescartada(null)).toBe(false);
    expect(window.sessionStorage.getItem("maven.cowork.privadas.descartadas")).toBeNull();
  });

  it("con el storage roto no rompe: degrada a lo de antes", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("bloqueado"); });
    expect(() => marcarDescartada("req-1")).not.toThrow();
    vi.restoreAllMocks();
  });
});
