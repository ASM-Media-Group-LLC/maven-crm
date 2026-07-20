// Tests de matchesCreatorFunnel — regla del owner: link que contiene el @/nick de OF o
// el nombre de la creadora = su funnel propio (promo a OF). Blinda los falsos positivos
// que encontró la revisión adversarial (2026-07-19): fusión cross-border host↔path y
// nombres genéricos en el path.
// Correr: deno test supabase/functions/_shared/promolog-analyze.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { matchesCreatorFunnel } from "./promolog-analyze.ts";

Deno.test("POSITIVO — nick de OF en el path", () => {
  // SaritaC: OF nick "saritac", link bybio.co/bysaritac → "saritac" ⊆ "bysaritac".
  assertEquals(matchesCreatorFunnel("bybio.co/bysaritac", "bybio.co", "Bysaritac01_", ["saritac"], "Charlyn Colina"), true);
  // nick suelto en el path de un dominio custom.
  assertEquals(matchesCreatorFunnel("mypage.io/saritac", "mypage.io", "otra", ["saritac"], ""), true);
});

Deno.test("POSITIVO — nombre en el HOST", () => {
  assertEquals(matchesCreatorFunnel("mariajose.co/vip", "mariajose.co", "maria_jose_ig", [], "Maria Jose"), true);
});

Deno.test("NEGATIVO — fusión cross-border host↔path no debe matchear", () => {
  // "shop.com/ariadna" NO debe pescar "maria" (la 'm' de .com + 'aria' de ariadna).
  assertEquals(matchesCreatorFunnel("shop.com/ariadna", "shop.com", "otrohandle", [], "Maria Colina"), false);
});

Deno.test("NEGATIVO — nombre genérico en el PATH de un afiliado", () => {
  // /lauraroutine en un dominio de coach NO es su funnel de OF.
  assertEquals(matchesCreatorFunnel("fitplan.co/lauraroutine", "fitplan.co", "otrohandle", [], "Laura Zapata"), false);
  // /maria-collection en una tienda tampoco.
  assertEquals(matchesCreatorFunnel("boutique.shop/maria-collection", "boutique.shop", "otrohandle", [], "Maria Colina"), false);
});

Deno.test("NEGATIVO — nick corto (4) exige segmento exacto, no substring", () => {
  // nick "cali" NO debe pescar "/california" (segmento debe ser EXACTO para tokens de 4).
  assertEquals(matchesCreatorFunnel("travel.co/california", "travel.co", "otro", ["cali"], ""), false);
  // pero sí matchea si el segmento ES exactamente el nick.
  assertEquals(matchesCreatorFunnel("mypage.co/cali", "mypage.co", "otro", ["cali"], ""), true);
});
