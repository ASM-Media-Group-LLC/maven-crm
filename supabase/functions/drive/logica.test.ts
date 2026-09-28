// Correr: deno test --no-check supabase/functions/drive/logica.test.ts
import { MAX_ARCHIVO, nombreValido, planDeSubida, TAMANO_PARTE } from "./logica.ts";

function assert(c: boolean, m: string) { if (!c) throw new Error(m); }
const tira = (f: () => unknown) => { try { f(); return false; } catch { return true; } };

Deno.test("la parte entra por el proxy de Cloudflare (corta en 100 MB)", () => {
  assert(TAMANO_PARTE < 100 * 1024 * 1024, "la parte es demasiado grande para el túnel");
});

Deno.test("hasta una parte va entero; más, por partes redondeando para arriba", () => {
  assert(planDeSubida(1).partes === 0, "1 byte");
  assert(planDeSubida(TAMANO_PARTE).partes === 0, "justo una parte");
  assert(planDeSubida(TAMANO_PARTE + 1).partes === 2, "una más");
  assert(planDeSubida(MAX_ARCHIVO).partes === Math.ceil(MAX_ARCHIVO / TAMANO_PARTE), "el tope");
});

Deno.test("vacío, negativo o más de 20 GB: no", () => {
  assert(tira(() => planDeSubida(0)), "vacío");
  assert(tira(() => planDeSubida(-5)), "negativo");
  assert(tira(() => planDeSubida(NaN)), "NaN");
  assert(tira(() => planDeSubida(MAX_ARCHIVO + 1)), "más del tope");
});

Deno.test("⚠️ nombres: sin barras (serían carpetas), sin control, con largo razonable", () => {
  assert(nombreValido("  Balance 2026.pdf ") === "Balance 2026.pdf", "recorta");
  for (const malo of ["", "   ", "a/b.pdf", "a\\\\b", "x\\u0000y", "x".repeat(256), 5]) {
    assert(tira(() => nombreValido(malo)), `dejó pasar ${JSON.stringify(malo)}`);
  }
});
