import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// El último de los tres botones grises. A diferencia de "Mover a" y
// "Etiquetar", este no se resuelve con una operación: hace falta que ALGO lo
// traiga de vuelta. Sin el despertador, posponer sería esconder para siempre.

const leer = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const mig = leer("supabase/migrations/20260918210000_correo_posponer.sql");
const cron = leer("supabase/migrations/20260918211000_correo_despertador_cron.sql");
const edge = leer("supabase/functions/mail-fetch/index.ts");
const desp = leer("supabase/functions/mail-despertador/index.ts");
const imap = leer("supabase/functions/_shared/imap.ts");
const pagina = leer("frontend/src/pages/correo/CorreoPage.tsx");

describe("⚠️ posponer no puede ser esconder para siempre", () => {
  it("existe el despertador y lo llama un cron", () => {
    expect(cron).toMatch(/cron\.schedule\(\s*'mail-despertador'/);
    expect(cron).toMatch(/functions\/v1\/mail-despertador/);
  });

  it("corre seguido, no una vez por día", () => {
    // Con cada hora, quien pospone "para las 3" lo ve a las 3:59 y deja de
    // confiar en la función.
    expect(cron).toMatch(/'[\d-]+\/5 \* \* \* \*'/);
  });

  it("⚠️ la fecha se valida ANTES de mover", () => {
    // Al revés, una fecha basura dejaría el correo en Snoozed SIN fila que lo
    // despierte: se habría escondido para siempre.
    const i = edge.indexOf("let volverAt");
    const j = edge.indexOf("ok = await client.moveUids");
    expect(i, "no está la validación").toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
  });

  it("rechaza fechas pasadas y absurdamente lejanas", () => {
    expect(edge).toMatch(/esa fecha ya pasó/);
    expect(edge).toMatch(/no se puede posponer más de un año/);
  });
});

describe("⚠️ se identifica por message_id porque el uid CAMBIA al mover", () => {
  it("la tabla no guarda uid ni carpeta de destino", () => {
    const i = mig.indexOf("CREATE TABLE IF NOT EXISTS public.mail_snoozed");
    const j = mig.indexOf(");", i);
    const tabla = mig.slice(i, j);
    expect(tabla).toMatch(/message_id text NOT NULL/);
    expect(tabla, "el uid no sirve: posponer MUEVE el correo").not.toMatch(/\buid\b/);
  });

  it("guarda de DÓNDE salió, para devolverlo ahí", () => {
    // Devolver siempre a INBOX le reaparecería en otro lado a quien pospuso
    // desde Notificaciones o desde una carpeta propia.
    expect(mig).toMatch(/folder_origen text NOT NULL/);
    expect(desp).toMatch(/moveUids\(busca\.uids, it\.folder_origen\)/);
  });

  it("los message_id se leen ANTES de limpiar la caché", () => {
    const leerIds = edge.indexOf('.eq("user_id", user.id).eq("folder", box).in("uid", lista);');
    const borrar = edge.indexOf('await admin.from("mail_messages").delete()');
    expect(edge.indexOf('op === "snooze"')).toBeGreaterThan(-1);
    // La lectura del snooze aparece antes del borrado de la caché.
    expect(edge.indexOf("const { data: filas }")).toBeLessThan(borrar);
    expect(leerIds).toBeGreaterThan(-1);
  });
});

describe("⚠️ el Message-ID viene de afuera y entra a un comando IMAP", () => {
  it("se escapa con cadenaImap, que rechaza CR y LF", () => {
    expect(imap).toMatch(/export function cadenaImap/);
    expect(imap).toMatch(/if \(\/\[\\r\\n\\x00\]\/\.test\(valor\)\) return null;/);
  });

  it("el despertador NO busca si la cadena no se pudo armar", () => {
    expect(desp).toMatch(/if \(!criterio\)/);
    expect(desp).toMatch(/message_id con caracteres inválidos/);
  });
});

describe("el despertador no se cuelga ni reintenta para siempre", () => {
  it("tiene tope por corrida", () => {
    expect(desp).toMatch(/const POR_CORRIDA = \d+/);
  });

  it("⚠️ deja de intentar después de varios fracasos", () => {
    // Reintentar para siempre un correo que alguien borró a mano es gastar una
    // sesión IMAP cada cinco minutos, para siempre, sin que nadie se entere.
    expect(desp).toMatch(/const MAX_INTENTOS = \d+/);
    expect(desp).toMatch(/\.lt\("intentos", MAX_INTENTOS\)/);
  });

  it("una sesión IMAP por BUZÓN, no por correo", () => {
    expect(desp).toMatch(/porUsuario/);
  });

  it("si ya no está en Snoozed lo da por cerrado en vez de reintentar", () => {
    expect(desp).toMatch(/ya no estaba en Snoozed/);
  });
});

describe("la UI", () => {
  it("ya no queda ningún «Posponer» gris", () => {
    expect(pagina).not.toMatch(/etiqueta="Posponer" pronto/);
  });

  it("⚠️ las opciones se calculan al abrir, no al montar la página", () => {
    // Con la pestaña abierta desde la mañana, «esta tarde» ya podría haber
    // pasado.
    expect(pagina).toMatch(/\{opcionesDePosponer\(\)\.map/);
  });
});
