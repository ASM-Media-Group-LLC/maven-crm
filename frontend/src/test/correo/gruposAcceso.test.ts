import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 18/09/2026: los 17 grupos de rol estaban en `access_type = 'Public'`, que en
// Zoho significa que `equipo@maven-ai.me` acepta correo de CUALQUIER dirección
// de internet. Apareció mirando el reporte de Grace; nadie lo había reportado.

const leer = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const zoho = leer("supabase/functions/_shared/zoho.ts");
const edge = leer("supabase/functions/role-email-groups/index.ts");
const mig = leer("supabase/migrations/20260918180000_grupos_cerrar_publico.sql");

function entre(texto: string, desde: string, hasta: string): string {
  const a = texto.indexOf(desde);
  const b = texto.indexOf(hasta, a + 1);
  expect(a, `no está la marca «${desde}»`).toBeGreaterThan(-1);
  expect(b, `no está la marca «${hasta}»`).toBeGreaterThan(a);
  return texto.slice(a, b);
}

describe("cambiar el acceso de un grupo", () => {
  const fn = entre(zoho, "export function setGroupAccess", "export function addGroupAliases");

  it("usa el modo que documenta Zoho", () => {
    expect(fn).toContain('mode: "updateMailGroupAdvOptions"');
    expect(fn).toMatch(/accessType,/);
  });

  it("⚠️ retiene en vez de rebotar", () => {
    // Con 'reject' el correo se pierde y quien lo mandó cree que llegó. La
    // medición previa solo vio lo que mail-sync cacheó: no alcanza para
    // apostar a que NADIE de afuera escribe.
    expect(fn).toContain('holdOrBounce: "hold"');
    expect(fn).not.toContain('"reject"');
  });

  it("avisa al administrador de lo retenido", () => {
    // Una cola de moderación que nadie sabe que existe es un agujero negro.
    expect(fn).toContain("adminNotify: true");
  });
});

describe("el barrido APLICA el acceso, no solo al crear", () => {
  it("⚠️ antes `access_type` solo se usaba en createGroup", () => {
    // Cambiarlo en la base no hacía nada sobre un grupo ya creado.
    expect(edge).toMatch(/setGroupAccess\(m\.zgid!/);
  });

  it("solo llama a Zoho cuando DIFIERE", () => {
    // Si no, son 17 llamadas por barrido para que quizá ninguna cambie.
    expect(edge).toMatch(/grp\.accessType !== acceso/);
  });

  it("lee el accessType de Zoho para poder comparar", () => {
    expect(edge).toMatch(/accessType: String\(g\.accessType/);
  });

  it("el resultado del barrido reporta el cambio y su error", () => {
    expect(edge).toMatch(/access: accessCambiado/);
    expect(edge).toMatch(/access_error: accessErr/);
  });
});

describe("la migración no cierra a ciegas", () => {
  it("cierra lo que estaba en Public", () => {
    expect(mig).toMatch(/SET access_type = 'Organization'/);
    expect(mig).toMatch(/WHERE access_type = 'Public'/);
  });

  it("⚠️ DEJA a Recursos Humanos abierto", () => {
    // Es el único donde recibir de afuera es parte del trabajo: un candidato
    // manda su hoja de vida desde su Gmail y no tiene casilla de la org.
    expect(mig).toMatch(/AND role <> 'HHRR'/);
  });

  it("deja escrita la medición que justifica el cambio", () => {
    expect(mig).toMatch(/0 desde afuera|desde afuera/);
    expect(mig).toMatch(/90 días|90 dias/);
  });
});
