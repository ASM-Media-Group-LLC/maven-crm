import { describe, it, expect } from "vitest";
import {
  collectDayStories,
  summarizeStories,
  shouldShowGallery,
} from "@/pages/promolog/storyEvidence";
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
    ...over,
  };
}

describe("storyEvidence — galería de stories de Promolog", () => {
  describe("collectDayStories", () => {
    it("devuelve [] cuando entry es null/undefined", () => {
      expect(collectDayStories([], null)).toEqual([]);
      expect(collectDayStories([], undefined)).toEqual([]);
    });

    it("devuelve [] para entries manuales (no del bot)", () => {
      const manual = makeEntry({ id: "m1", analyzed_by_ai: false });
      expect(collectDayStories([manual], manual)).toEqual([]);
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

    it("excluye otros creadores y otros días", () => {
      const sel = makeEntry({ id: "a0", story_index: 0, creator_id: "creator-1", date: "28 may 2026" });
      const otherCreator = makeEntry({ id: "b0", story_index: 0, creator_id: "creator-2", date: "28 may 2026" });
      const otherDay = makeEntry({ id: "a-prev", story_index: 0, creator_id: "creator-1", date: "27 may 2026" });
      const sameDayStory = makeEntry({ id: "a1", story_index: 1, creator_id: "creator-1", date: "28 may 2026" });

      const result = collectDayStories([sel, otherCreator, otherDay, sameDayStory], sel);
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
    it("cuenta promovió vs no promovió", () => {
      const stories = [
        makeEntry({ result: "Sí" }),
        makeEntry({ result: "Sí" }),
        makeEntry({ result: "No" }),
        makeEntry({ result: "Pendiente" }),
      ];
      expect(summarizeStories(stories)).toEqual({ total: 4, promoted: 2, notPromoted: 1 });
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
