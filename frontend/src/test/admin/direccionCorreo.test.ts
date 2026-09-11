import { describe, it, expect } from "vitest";
import {
  DOMINIO_CASILLA, sugerirDireccion, sugerirParaMigrar, yaTieneCasillaDelEquipo,
} from "@/lib/direccionCorreo";

// Esta regla estaba escrita DOS veces: una copia dentro de AddUserModal y la
// autoridad en el backend (`_shared/mail-provision.ts`). Se unificó la del
// frontend acá antes de agregarle un tercer uso — tener la misma regla en dos
// archivos es exactamente lo que costó el bug del audio de Cowork.
//
// ⚠️ Esto solo PREVISUALIZA. La dirección final la decide el backend, que
// además resuelve colisiones (`juan.perez` ocupado → `juan.perez1`).

describe("sugerir dirección desde el nombre (alta de usuario)", () => {
  it("nombre y apellido → nombre.apellido", () => {
    expect(sugerirDireccion("Juan", "Perez")).toBe(`juan.perez@${DOMINIO_CASILLA}`);
  });

  it("saca tildes y eñes: una dirección acentuada funciona mal en medio mundo", () => {
    expect(sugerirDireccion("José", "Peña")).toBe(`jose.pena@${DOMINIO_CASILLA}`);
  });

  it("aplasta espacios y guiones de un apellido compuesto", () => {
    expect(sugerirDireccion("Ana María", "De la Cruz")).toBe(`anamaria.delacruz@${DOMINIO_CASILLA}`);
  });

  it("con solo uno de los dos, no inventa el punto", () => {
    expect(sugerirDireccion("Juan", "")).toBe(`juan@${DOMINIO_CASILLA}`);
    expect(sugerirDireccion("", "Perez")).toBe(`perez@${DOMINIO_CASILLA}`);
  });

  it("sin nada de dónde sacarla, devuelve null en vez de una dirección basura", () => {
    expect(sugerirDireccion("", "")).toBeNull();
    expect(sugerirDireccion("###", "!!!")).toBeNull();
  });
});

describe("¿ya tiene casilla del equipo?", () => {
  it("reconoce el dominio del equipo", () => {
    expect(yaTieneCasillaDelEquipo(`ana@${DOMINIO_CASILLA}`)).toBe(true);
    expect(yaTieneCasillaDelEquipo(`ANA@${DOMINIO_CASILLA.toUpperCase()}`)).toBe(true);
  });

  it("los otros dominios no cuentan", () => {
    expect(yaTieneCasillaDelEquipo("ana@unlok.me")).toBe(false);
    expect(yaTieneCasillaDelEquipo("ana@gmail.com")).toBe(false);
    expect(yaTieneCasillaDelEquipo(null)).toBe(false);
    expect(yaTieneCasillaDelEquipo("")).toBe(false);
  });
});

describe("sugerir dirección para MIGRAR a alguien que ya tiene correo", () => {
  // Los tres casos reales del 31/08/2026. Se conserva el usuario y solo cambia
  // el dominio: es lo correcto y lo menos sorprendente para la persona.
  it("los tres usuarios reales: mismo usuario, dominio nuevo", () => {
    expect(sugerirParaMigrar("brenda.mina@unlok.me")).toBe(`brenda.mina@${DOMINIO_CASILLA}`);
    expect(sugerirParaMigrar("daniel.duque@unlok.me")).toBe(`daniel.duque@${DOMINIO_CASILLA}`);
    expect(sugerirParaMigrar("john.idrobo@unlok.me")).toBe(`john.idrobo@${DOMINIO_CASILLA}`);
  });

  it("EL CORREO ACTUAL MANDA SOBRE EL NOMBRE — el caso que rompería derivarlo del nombre", () => {
    // Daniel se llama "Daniel Felipe Duque Cortes" en Maven. Derivar del nombre
    // daría `daniel.felipeduquecortes`, cuando su dirección de toda la vida es
    // `daniel.duque`. Por eso el correo actual tiene prioridad.
    expect(sugerirParaMigrar("daniel.duque@unlok.me", "Daniel", "Felipe Duque Cortes"))
      .toBe(`daniel.duque@${DOMINIO_CASILLA}`);
    // Y para que quede claro qué habría pasado sin esa prioridad:
    expect(sugerirDireccion("Daniel", "Felipe Duque Cortes"))
      .toBe(`daniel.felipeduquecortes@${DOMINIO_CASILLA}`);
  });

  it("sirve igual desde un correo personal", () => {
    expect(sugerirParaMigrar("marielby755@gmail.com")).toBe(`marielby755@${DOMINIO_CASILLA}`);
  });

  it("conserva los puntos del usuario (sin ellos quedaría danielduque)", () => {
    expect(sugerirParaMigrar("daniel.duque@unlok.me")).toContain("daniel.duque@");
  });

  it("si ya está en el dominio del equipo, no hay nada que migrar", () => {
    expect(sugerirParaMigrar(`ana@${DOMINIO_CASILLA}`)).toBeNull();
  });

  it("sin correo previo se cae al nombre", () => {
    expect(sugerirParaMigrar("", "Ana", "Gomez")).toBe(`ana.gomez@${DOMINIO_CASILLA}`);
    expect(sugerirParaMigrar(null, "Ana", "Gomez")).toBe(`ana.gomez@${DOMINIO_CASILLA}`);
  });

  it("sin correo previo NI nombre, null en vez de una dirección inventada", () => {
    expect(sugerirParaMigrar(null)).toBeNull();
    expect(sugerirParaMigrar("", "", "")).toBeNull();
  });

  it("sanea un usuario con basura en vez de propagarla a una casilla real", () => {
    // Crear una casilla ocupa un puesto del plan y borrarla no lo libera, así
    // que una dirección mal formada no es un detalle estético.
    expect(sugerirParaMigrar("Ana Maria+etiqueta@unlok.me")).toBe(`anamariaetiqueta@${DOMINIO_CASILLA}`);
    expect(sugerirParaMigrar("..ana..@unlok.me")).toBe(`ana@${DOMINIO_CASILLA}`);
    expect(sugerirParaMigrar("josé.peña@unlok.me")).toBe(`jose.pena@${DOMINIO_CASILLA}`);
  });
});

// Apellido OPCIONAL desde el 11/09/2026: hay gente con un solo nombre y
// buzones funcionales (capturados@, soporte@) que no tienen apellido.
describe("sin apellido", () => {
  it("arma la dirección solo con el nombre, sin punto colgando", () => {
    expect(sugerirDireccion("Capturados", "")).toBe("capturados@maven-ai.me");
  });

  it("aguanta el apellido en blanco de solo espacios", () => {
    expect(sugerirDireccion("Madonna", "   ")).toBe("madonna@maven-ai.me");
  });

  it("sigue devolviendo null si NO hay ni nombre ni apellido", () => {
    expect(sugerirDireccion("", "")).toBeNull();
  });
});
