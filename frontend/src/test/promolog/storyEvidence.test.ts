import { describe, it, expect } from "vitest";
import {
  collectDayStories,
  summarizeStories,
  shouldShowGallery,
} from "@/pages/promolog/storyEvidence";
import { promotedToResult } from "@/pages/promolog/promoResult";
import type { PromologEntry } from "@/pages/promolog/PromologEntryCard";

// Factory: PromologEntry mínimo, override lo que importa por test.
function makeEntry(over: Partial<PromologEntry> = {}): PromologEntry {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    ticketNumber: "",
    name: "Modelo Test",
    network: "instagram",
    platform: "OnlyFans",
    result: "No",
    date: "28 may 2026",
    time: "10:00 AM",
    agent: "AI Agent",
    notes: "",
    creator_id: "creator-1",
    analyzed_by_ai: true,
    apify_run_id: "run-1",
    ...over,
  };
}

describe("storyEvidence — galería de stories de Promolog", () => {
  describe("collectDayStories", () => {
    it("devuelve [] cuando entry es null/undefined", () => {
      expect(collectDayStories([], null)).toEqual([]);
      expect(collectDayStories([], undefined)).toEqual([]);
    });

    it("entry manual SIN foto → [] (no hay galería que mostrar)", () => {
      const manual = makeEntry({ id: "m1", analyzed_by_ai: false, apify_run_id: null, evidence_url: null });
      expect(collectDayStories([manual], manual)).toEqual([]);
    });

    it("entries manuales CON foto → galería del día (mismo creador+día), sin mezclar otra fecha", () => {
      const m0 = makeEntry({ id: "m0", analyzed_by_ai: false, apify_run_id: null, story_index: 0, evidence_url: "https://cdn/0.jpg", date: "8 jun 2026" });
      const m1 = makeEntry({ id: "m1", analyzed_by_ai: false, apify_run_id: null, story_index: 1, evidence_url: "https://cdn/1.jpg", date: "8 jun 2026" });
      const otroDia = makeEntry({ id: "mx", analyzed_by_ai: false, apify_run_id: null, story_index: 0, evidence_url: "https://cdn/x.jpg", date: "7 jun 2026" });
      const result = collectDayStories([m1, m0, otroDia], m0);
      expect(result.map((e) => e.id)).toEqual(["m0", "m1"]);
    });

    it("devuelve [] cuando la entry no tiene creator_id", () => {
      const orphan = makeEntry({ id: "o1", creator_id: undefined });
      expect(collectDayStories([orphan], orphan)).toEqual([]);
    });

    it("junta TODAS las stories del mismo creador+día ordenadas por story_index", () => {
      const s0 = makeEntry({ id: "s0", story_index: 0, story_count: 3 });
      const s2 = makeEntry({ id: "s2", story_index: 2, story_count: 3 });
      const s1 = makeEntry({ id: "s1", story_index: 1, story_count: 3 });
      // Clic en cualquiera de ellas debe traer las 3 ordenadas 0,1,2.
      const result = collectDayStories([s2, s0, s1], s0);
      expect(result.map((e) => e.id)).toEqual(["s0", "s1", "s2"]);
    });

    it("agrupa por SCAN: incluye otra fecha del mismo run, excluye otro creador y otro scan", () => {
      const sel = makeEntry({ id: "a0", story_index: 0, creator_id: "creator-1", apify_run_id: "run-1", date: "28 may 2026" });
      const otherCreator = makeEntry({ id: "b0", story_index: 0, creator_id: "creator-2", apify_run_id: "run-1" });
      const otherScan = makeEntry({ id: "a-old", story_index: 5, creator_id: "creator-1", apify_run_id: "run-0" });
      // Mismo run de Apify pero la story es un highlight viejo (otra fecha de posteo) → IGUAL entra.
      const sameScanOtherDay = makeEntry({ id: "a1", story_index: 1, creator_id: "creator-1", apify_run_id: "run-1", date: "13 jun 2023" });

      const result = collectDayStories([sel, otherCreator, otherScan, sameScanOtherDay], sel);
      expect(result.map((e) => e.id)).toEqual(["a0", "a1"]);
    });

    it("dedupe por story_index, prefiriendo la que tiene evidencia", () => {
      const noEvidence = makeEntry({ id: "dup-empty", story_index: 0, evidence_url: null });
      const withEvidence = makeEntry({ id: "dup-img", story_index: 0, evidence_url: "https://cdn/x.jpg" });
      const result = collectDayStories([noEvidence, withEvidence], noEvidence);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("dup-img");
    });

    it("manda al final las entries sin story_index", () => {
      const withIdx = makeEntry({ id: "idx0", story_index: 0 });
      const noIdx = makeEntry({ id: "legacy", story_index: null });
      const result = collectDayStories([noIdx, withIdx], withIdx);
      expect(result.map((e) => e.id)).toEqual(["idx0", "legacy"]);
    });

    it("incluye stories con distinto resultado (Sí y No) en una sola galería", () => {
      const promo = makeEntry({ id: "p", story_index: 0, result: "Sí" });
      const noPromo = makeEntry({ id: "n", story_index: 1, result: "No" });
      // Clic en la entry "No" igual trae la "Sí" (galería del día completo).
      const result = collectDayStories([promo, noPromo], noPromo);
      expect(result.map((e) => e.id)).toEqual(["p", "n"]);
    });
  });

  describe("summarizeStories", () => {
    // El resultado de Promolog es BINARIO por decisión del owner (#842, a1303760):
    // SIEMPRE Sí o No. "Pendiente"/"Parcial" dejaron de ser resultados y pasaron a ser
    // MARCAS aditivas al lado (isUnverified → "no verificado", needs_review → "revisar").
    // Por eso una lectura NO confirmada cuenta acá como "no promovió": es exactamente lo
    // que ya pinta el tile de la galería (`story.result !== "Sí"` → equis roja), así que
    // dejarla afuera del conteo haría que el encabezado contradiga a sus propias fotos.
    //
    // Armamos el `result` con promotedToResult (la fuente ÚNICA) en vez de escribirlo a
    // mano: así el test entra por el mismo embudo que la app y, si la taxonomía se vuelve
    // a mover, sigue al código en lugar de pudrirse como se pudrió con "Pendiente".
    const storyConPromotedCrudo = (promoted: string | null) =>
      makeEntry({ result: promotedToResult(promoted) });

    it("cuenta promovió vs no promovió", () => {
      const stories = [
        storyConPromotedCrudo("true"),
        storyConPromotedCrudo("partial"), // legacy: alguna story sí → cuenta como Sí
        storyConPromotedCrudo("false"),
        storyConPromotedCrudo("pending"), // lectura no confirmada → No (+ marca "no verificado")
      ];
      expect(summarizeStories(stories)).toEqual({ total: 4, promoted: 2, notPromoted: 2 });
    });

    it("promovió + no promovió SIEMPRE reconcilia con el total (nada queda huérfano)", () => {
      // El encabezado dice "N historias · X promovió · Y no". Si un resultado raro
      // (legacy en BD, valor futuro, vacío) no cae de ningún lado, al manager le queda
      // un hueco sin explicar. Cualquier cosa que no sea "Sí" suma a no promovió.
      const stories = [
        makeEntry({ result: "Sí" }),
        makeEntry({ result: "No" }),
        makeEntry({ result: "Pendiente" }), // valor viejo: la app ya no lo produce
        makeEntry({ result: "" }),
      ];
      const { total, promoted, notPromoted } = summarizeStories(stories);
      expect(promoted + notPromoted).toBe(total);
      expect({ total, promoted, notPromoted }).toEqual({ total: 4, promoted: 1, notPromoted: 3 });
    });

    it("maneja lista vacía", () => {
      expect(summarizeStories([])).toEqual({ total: 0, promoted: 0, notPromoted: 0 });
    });
  });

  describe("shouldShowGallery", () => {
    it("false con 0 o 1 story, true con más de 1", () => {
      expect(shouldShowGallery([])).toBe(false);
      expect(shouldShowGallery([makeEntry()])).toBe(false);
      expect(shouldShowGallery([makeEntry(), makeEntry()])).toBe(true);
    });
  });
});
