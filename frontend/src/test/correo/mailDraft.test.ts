// Autoguardado del borrador. Si esto falla en silencio, el usuario pierde lo
// que escribió — el dolor exacto que la feature vino a resolver.
import { beforeEach, describe, expect, it } from "vitest";
import {
  borrarBorrador,
  firmaContexto,
  guardarBorrador,
  leerBorrador,
  type BorradorGuardado,
} from "@/lib/mailDraft";

const base: BorradorGuardado = {
  firma: "nuevo",
  to: "ana@x.com",
  cc: "",
  bcc: "",
  subject: "Hola",
  html: "<p>Contenido</p>",
  ts: 1,
};

beforeEach(() => localStorage.clear());

describe("firmaContexto", () => {
  it("distingue nuevo de respuesta a un hilo", () => {
    expect(firmaContexto()).toBe("nuevo");
    expect(firmaContexto("<abc@maven.me>")).toBe("reply:<abc@maven.me>");
  });
});

describe("guardar / leer / borrar", () => {
  it("roundtrip: lo guardado se recupera igual", () => {
    guardarBorrador("yo@maven.me", base);
    expect(leerBorrador("yo@maven.me", "nuevo")).toEqual(base);
  });

  it("no recupera con otra firma", () => {
    guardarBorrador("yo@maven.me", base);
    expect(leerBorrador("yo@maven.me", "reply:<x>")).toBeNull();
  });

  it("no recupera de otro buzón (navegador compartido)", () => {
    guardarBorrador("yo@maven.me", base);
    expect(leerBorrador("otra@maven.me", "nuevo")).toBeNull();
  });

  it("el buzón es case-insensitive", () => {
    guardarBorrador("Yo@Maven.me", base);
    expect(leerBorrador("yo@maven.me", "nuevo")).toEqual(base);
  });

  it("un nuevo y una respuesta coexisten sin pisarse", () => {
    const resp: BorradorGuardado = { ...base, firma: "reply:<h1>", subject: "Re: algo" };
    guardarBorrador("yo@maven.me", base);
    guardarBorrador("yo@maven.me", resp);
    expect(leerBorrador("yo@maven.me", "nuevo")?.subject).toBe("Hola");
    expect(leerBorrador("yo@maven.me", "reply:<h1>")?.subject).toBe("Re: algo");
  });

  it("borrar deja el slot vacío", () => {
    guardarBorrador("yo@maven.me", base);
    borrarBorrador("yo@maven.me", "nuevo");
    expect(leerBorrador("yo@maven.me", "nuevo")).toBeNull();
  });

  it("leer algo inexistente no rompe", () => {
    expect(leerBorrador("nadie@maven.me", "nuevo")).toBeNull();
  });

  it("un JSON corrupto se ignora, no tira", () => {
    localStorage.setItem("maven:correo:borrador:yo@maven.me:nuevo", "{roto");
    expect(leerBorrador("yo@maven.me", "nuevo")).toBeNull();
  });

  it("una firma que no coincide con la guardada devuelve null", () => {
    // Guardado a mano con firma inconsistente: no debe recuperarse.
    localStorage.setItem(
      "maven:correo:borrador:yo@maven.me:nuevo",
      JSON.stringify({ ...base, firma: "reply:<otro>" }),
    );
    expect(leerBorrador("yo@maven.me", "nuevo")).toBeNull();
  });
});
