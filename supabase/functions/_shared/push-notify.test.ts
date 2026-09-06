// Correr: deno test supabase/functions/_shared/push-notify.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type AjustesUsuario,
  type Candidato,
  armarTituloYCuerpo,
  decidirDestinatarios,
  dndActivo,
  meMenciona,
  minutosEnBogota,
  previewDeMensaje,
} from "./push-notify.ts";

const ajustes = (extra: Partial<AjustesUsuario> = {}): AjustesUsuario => ({
  push_enabled: true,
  notifications_enabled: true,
  dnd_enabled: false,
  dnd_start_time: null,
  dnd_end_time: null,
  dnd_allow_critical: true,
  ...extra,
});

const candidato = (extra: Partial<Candidato> = {}): Candidato => ({
  userId: "u1",
  nombre: "Ana María Pérez",
  ajustes: ajustes(),
  participacion: { is_muted: false, notifications_mode: "all", last_read_at: null },
  suscripciones: 1,
  ...extra,
});

const MSG = { content: "hola @ana, ¿viste esto?", created_at: "2026-09-06T15:00:00.000Z" };
const base = { esChat: true, mensaje: MSG, prioridad: "low" as const, ahoraMin: 600 };

// ---------- previewDeMensaje ----------
Deno.test("preview: texto corto tal cual, largo se corta a 120 con puntos suspensivos", () => {
  assertEquals(previewDeMensaje("  hola  ", "text", null), "hola");
  const largo = "x".repeat(200);
  const p = previewDeMensaje(largo, "text", null);
  assertEquals(p.length, 121);
  assert(p.endsWith("…"));
});
Deno.test("preview: imagen, archivo con nombre, tipo desconocido", () => {
  assertEquals(previewDeMensaje("", "image", null), "📷 Foto");
  assertEquals(previewDeMensaje(null, "file", "informe.pdf"), "📎 informe.pdf");
  assertEquals(previewDeMensaje(null, "file", null), "📎 Archivo");
  assertEquals(previewDeMensaje(null, "sticker", null), "Nuevo mensaje");
});

// ---------- meMenciona ----------
Deno.test("menciona: nombre completo, nombre de pila, mayúsculas", () => {
  assert(meMenciona("oye @Ana María Pérez mira", "Ana María Pérez"));
  assert(meMenciona("oye @ana mira", "Ana María Pérez"));
  assert(meMenciona("OYE @ANA MIRA", "Ana María Pérez"));
});
Deno.test("menciona: sin @, otro nombre, sin nombre → false", () => {
  assert(!meMenciona("ana mira esto", "Ana María Pérez"));
  assert(!meMenciona("@pedro mira", "Ana María Pérez"));
  assert(!meMenciona("@ana", null));
  assert(!meMenciona(null, "Ana"));
  assert(!meMenciona("@ana", "   "));
});

// ---------- dndActivo ----------
Deno.test("dnd: apagado → false; encendido sin franja → siempre; start === end → false", () => {
  assert(!dndActivo(ajustes(), 600));
  assert(dndActivo(ajustes({ dnd_enabled: true }), 600));
  assert(!dndActivo(ajustes({ dnd_enabled: true, dnd_start_time: "08:00", dnd_end_time: "08:00" }), 600));
});
Deno.test("dnd: franja normal 13:00–15:00 y formato HH:MM:SS de PostgREST", () => {
  const s = ajustes({ dnd_enabled: true, dnd_start_time: "13:00:00", dnd_end_time: "15:00:00" });
  assert(!dndActivo(s, 12 * 60 + 59));
  assert(dndActivo(s, 13 * 60));
  assert(dndActivo(s, 14 * 60 + 30));
  assert(!dndActivo(s, 15 * 60));
});
Deno.test("dnd: franja que cruza medianoche 22:00 → 06:00", () => {
  const s = ajustes({ dnd_enabled: true, dnd_start_time: "22:00", dnd_end_time: "06:00" });
  assert(dndActivo(s, 23 * 60 + 30));
  assert(dndActivo(s, 5 * 60 + 59));
  assert(!dndActivo(s, 6 * 60));
  assert(!dndActivo(s, 12 * 60));
  assert(dndActivo(s, 22 * 60));
});

// ---------- minutosEnBogota ----------
Deno.test("minutosEnBogota: Bogotá es UTC-5 sin horario de verano", () => {
  assertEquals(minutosEnBogota(new Date("2026-09-06T15:30:00Z")), 10 * 60 + 30);
  assertEquals(minutosEnBogota(new Date("2026-01-15T03:05:00Z")), 22 * 60 + 5);
  assertEquals(minutosEnBogota(new Date("2026-09-06T05:00:00Z")), 0);
});

// ---------- armarTituloYCuerpo ----------
Deno.test("título y cuerpo: directo vs grupo vs hilo", () => {
  assertEquals(
    armarTituloYCuerpo({ esGrupo: false, nombreGrupo: null, emisor: "Ana", preview: "hola", enHilo: false }),
    { title: "Ana", body: "hola" },
  );
  assertEquals(
    armarTituloYCuerpo({ esGrupo: true, nombreGrupo: "Closers", emisor: "Ana", preview: "hola", enHilo: false }),
    { title: "Closers", body: "Ana: hola" },
  );
  assertEquals(
    armarTituloYCuerpo({ esGrupo: true, nombreGrupo: null, emisor: "Ana", preview: "hola", enHilo: true }),
    { title: "Grupo", body: "Ana: en hilo · hola" },
  );
});

// ---------- decidirDestinatarios ----------
Deno.test("decide: el caso feliz envía", () => {
  const r = decidirDestinatarios({ ...base, candidatos: [candidato()] });
  assertEquals(r.enviar, ["u1"]);
  assertEquals(Object.values(r.skipped).reduce((a, b) => a + b, 0), 0);
});
Deno.test("decide: sin ajustes, push apagado o maestro apagado → disabled", () => {
  const r = decidirDestinatarios({
    ...base,
    candidatos: [
      candidato({ userId: "a", ajustes: null }),
      candidato({ userId: "b", ajustes: ajustes({ push_enabled: false }) }),
      candidato({ userId: "c", ajustes: ajustes({ notifications_enabled: false }) }),
    ],
  });
  assertEquals(r.enviar, []);
  assertEquals(r.skipped.disabled, 3);
});
Deno.test("decide: sin suscripciones → no_sub", () => {
  const r = decidirDestinatarios({ ...base, candidatos: [candidato({ suscripciones: 0 })] });
  assertEquals(r.skipped.no_sub, 1);
});
Deno.test("decide: silenciado o ya no participa → muted", () => {
  const r = decidirDestinatarios({
    ...base,
    candidatos: [
      candidato({ userId: "a", participacion: { is_muted: true, notifications_mode: "all", last_read_at: null } }),
      candidato({ userId: "b", participacion: null }),
    ],
  });
  assertEquals(r.skipped.muted, 2);
});
Deno.test("decide: modo none nunca; modo mentions solo si me mencionan", () => {
  const sinMencion = { ...MSG, content: "hola a todos" };
  const r1 = decidirDestinatarios({
    ...base,
    mensaje: sinMencion,
    candidatos: [
      candidato({ userId: "a", participacion: { is_muted: false, notifications_mode: "none", last_read_at: null } }),
      candidato({ userId: "b", participacion: { is_muted: false, notifications_mode: "mentions", last_read_at: null } }),
    ],
  });
  assertEquals(r1.enviar, []);
  assertEquals(r1.skipped.mode, 2);
  const r2 = decidirDestinatarios({
    ...base,
    candidatos: [candidato({ participacion: { is_muted: false, notifications_mode: "mentions", last_read_at: null } })],
  });
  assertEquals(r2.enviar, ["u1"]);
});
Deno.test("decide: leído después del mensaje → read; leído antes → envía", () => {
  const leidoDespues = candidato({
    userId: "a",
    participacion: { is_muted: false, notifications_mode: "all", last_read_at: "2026-09-06T15:00:01.000Z" },
  });
  const leidoAntes = candidato({
    userId: "b",
    participacion: { is_muted: false, notifications_mode: "all", last_read_at: "2026-09-06T14:59:00.000Z" },
  });
  const r = decidirDestinatarios({ ...base, candidatos: [leidoDespues, leidoAntes] });
  assertEquals(r.enviar, ["b"]);
  assertEquals(r.skipped.read, 1);
});
Deno.test("decide: DND frena salvo prioridad crítica con dnd_allow_critical", () => {
  const enDnd = ajustes({ dnd_enabled: true, dnd_start_time: "22:00", dnd_end_time: "06:00" });
  const noche = 23 * 60;
  const r1 = decidirDestinatarios({ ...base, ahoraMin: noche, candidatos: [candidato({ ajustes: enDnd })] });
  assertEquals(r1.skipped.dnd, 1);
  const r2 = decidirDestinatarios({
    ...base,
    ahoraMin: noche,
    prioridad: "critical",
    candidatos: [candidato({ ajustes: enDnd })],
  });
  assertEquals(r2.enviar, ["u1"]);
  const r3 = decidirDestinatarios({
    ...base,
    ahoraMin: noche,
    prioridad: "critical",
    candidatos: [candidato({ ajustes: { ...enDnd, dnd_allow_critical: false } })],
  });
  assertEquals(r3.skipped.dnd, 1);
});
Deno.test("decide: kinds genéricos ignoran mute, modo y leído", () => {
  const r = decidirDestinatarios({
    ...base,
    esChat: false,
    mensaje: null,
    candidatos: [
      candidato({ participacion: { is_muted: true, notifications_mode: "none", last_read_at: "2030-01-01T00:00:00Z" } }),
    ],
  });
  assertEquals(r.enviar, ["u1"]);
});
