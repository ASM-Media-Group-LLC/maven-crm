import { describe, it, expect } from "vitest";
import hook from "@/hooks/useMailbox.ts?raw";
import badges from "@/hooks/useSidebarBadges.ts?raw";

// Lo reportó Jhon: «cuando leo un correo, la notificación no desaparece, a
// menos que haga refresh de la página».
//
// `mail_folders.unread` es una columna GUARDADA que solo escribe `mail-sync`
// (la RLS de esa tabla es de solo lectura para la persona). Al abrir un correo
// se marcaba la fila del mensaje, pero el número de la carpeta se quedaba con
// el valor viejo hasta el próximo barrido — y la consulta tiene `staleTime` de
// un minuto, así que ni siquiera se volvía a pedir.

function entre(texto: string, desde: string, hasta: string): string {
  const a = texto.indexOf(desde);
  const b = texto.indexOf(hasta, a + 1);
  expect(a, `no está la marca «${desde}»`).toBeGreaterThan(-1);
  expect(b, `no está la marca «${hasta}»`).toBeGreaterThan(a);
  return texto.slice(a, b);
}

describe("⚠️ abrir un correo baja el contador al instante", () => {
  const marcar = entre(hook, "export function useMarkSeen", "export type OperacionMasiva");

  it("useMarkSeen toca la caché de mail-folders", () => {
    expect(marcar).toMatch(/setQueryData\(\s*\["mail-folders"\]/);
  });

  it("baja solo el de SU carpeta", () => {
    expect(marcar).toMatch(/c\.folder === folder/);
  });

  it("⚠️ nunca por debajo de cero", () => {
    // Con dos pestañas abiertas, leer el mismo correo pasaría por acá dos
    // veces y el globito quedaría en -1.
    expect(marcar).toMatch(/Math\.max\(0, c\.unread - 1\)/);
  });
});

describe("y se reconcilia cuando el sincronizador recalcula", () => {
  it("la suscripción que ya existía invalida también la lista del Correo", () => {
    // Se aprovecha ESA suscripción en vez de abrir otra sobre la misma tabla:
    // Realtime ya fue un tercio del tiempo de la base una vez.
    const i = badges.indexOf('table: "mail_folders"');
    const j = badges.indexOf(".subscribe()", i);
    expect(i, "no está la suscripción").toBeGreaterThan(-1);
    const bloque = badges.slice(i, j);
    expect(bloque).toMatch(/queryKey: \["mail-folders"\]/);
    expect(bloque).toMatch(/queryKey: \["sidebar-badges"\]/);
  });

  it("no se agregó una segunda suscripción a mail_folders", () => {
    expect((badges.match(/table: "mail_folders"/g) ?? []).length).toBe(1);
  });
});

describe("la selección múltiple ya estaba bien", () => {
  it("useMailBulk invalida mail-folders al terminar", () => {
    // Su edge SÍ escribe el número con admin, así que invalidar alcanza.
    const bulk = entre(hook, "export function useMailBulk", "export function useAdjuntosParaReenviar");
    expect(bulk).toMatch(/invalidateQueries\(\{ queryKey: \["mail-folders"\] \}\)/);
  });
});
