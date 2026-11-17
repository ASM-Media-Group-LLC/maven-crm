import { describe, it, expect } from "vitest";
// La edge es Deno, pero el helper es WebCrypto puro: el test lo importa directo
// (mismo patrón que test/correo/bodystructure.test.ts).
import {
  firmarLink, verificarLink, vencimientoDelLink, sirveParaReusar, nombreDeInvitado, correosDeInvitacion,
} from "../../../../supabase/functions/_shared/meet-link";
import { formaDeLink } from "@/hooks/useMeetLink";
import { salaAdmiteInvitados } from "@/lib/meetLinkInvitado";

// Alvaro (17/11/2026): «el invitado abre un link, escribe su nombre y entra».
// Estas son las guardas de que ese link no se pueda inventar ni abrir otra sala.

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const SECRETO = "secreto-de-prueba-0123456789";

describe("link de invitado: firma", () => {
  it("un link firmado se verifica y devuelve el id de la fila", async () => {
    const link = await firmarLink(ID, SECRETO);
    expect(formaDeLink(link)).toBe(true);
    expect(await verificarLink(link, SECRETO)).toBe(ID);
  });

  it("con otro secreto, o tocando un carácter, no abre nada", async () => {
    const link = await firmarLink(ID, SECRETO);
    expect(await verificarLink(link, "otro-secreto")).toBeNull();
    const ultimo = link.slice(-1) === "A" ? "B" : "A";
    expect(await verificarLink(link.slice(0, -1) + ultimo, SECRETO)).toBeNull();
    // Cambiar el id (para apuntar a otra fila) rompe la firma.
    const otroId = (link[0] === "a" ? "b" : "a") + link.slice(1);
    expect(await verificarLink(otroId, SECRETO)).toBeNull();
  });

  it("lo que no tiene forma de link ni se intenta", async () => {
    for (const malo of ["", "ABC234", "meet_abc", null, 123, `${"0".repeat(32)}.corto`]) {
      expect(await verificarLink(malo, SECRETO)).toBeNull();
    }
  });
});

describe("link de invitado: vencimiento", () => {
  const ahora = new Date("2026-11-17T15:00:00Z");
  it("llamada del Messenger: 24 h; Meet: 7 días o 12 h tras la hora agendada", () => {
    expect(vencimientoDelLink("llamada", ahora).toISOString()).toBe("2026-11-18T15:00:00.000Z");
    expect(vencimientoDelLink("meet", ahora).toISOString()).toBe("2026-11-24T15:00:00.000Z");
    const lejos = new Date("2026-12-20T15:00:00Z");
    expect(vencimientoDelLink("meet", ahora, lejos).toISOString()).toBe("2026-12-21T03:00:00.000Z");
  });
  it("no se reusa un link al que le queda menos de una hora", () => {
    expect(sirveParaReusar(new Date(ahora.getTime() + 30 * 60_000), ahora)).toBe(false);
    expect(sirveParaReusar(new Date(ahora.getTime() + 2 * 3600_000), ahora)).toBe(true);
  });
});

describe("link de invitado: datos del invitado", () => {
  it("el nombre se limpia y tiene que tener al menos 2 letras", () => {
    expect(nombreDeInvitado("  Ana   María  ")).toBe("Ana María");
    expect(nombreDeInvitado("<b>Jo</b>")).toBe("bJo/b");
    expect(nombreDeInvitado("a")).toBeNull();
    expect(nombreDeInvitado("x".repeat(80))).toHaveLength(40);
  });
  it("correos: válidos, sin repetir y con tope", () => {
    expect(correosDeInvitacion("a@b.com, A@B.com; malo, c@d.co")).toEqual(["a@b.com", "c@d.co"]);
    expect(correosDeInvitacion(Array.from({ length: 40 }, (_, i) => `p${i}@x.com`))).toHaveLength(25);
  });
  it("solo Meet y llamadas del Messenger admiten invitados; Cowork no", () => {
    expect(salaAdmiteInvitados("meet_ab12cd34ef56")).toBe(true);
    expect(salaAdmiteInvitados(`call-${ID}`)).toBe(true);
    expect(salaAdmiteInvitados("cowork_hub_1234abcd")).toBe(false);
    expect(salaAdmiteInvitados("room-123")).toBe(false);
  });
});
