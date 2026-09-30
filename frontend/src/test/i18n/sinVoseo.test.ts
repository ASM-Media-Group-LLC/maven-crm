import { describe, it, expect } from "vitest";
import translations from "@/lib/i18n";

// ESPAÑOL NEUTRO, SIEMPRE.
//
// Jhon lo pidió varias veces y el voseo volvía igual: "Arrastrá archivos acá o
// usá «Nuevo»" llegó a producción en el Drive el 29/09/2026, cuando la regla ya
// existía. Este test es para que la próxima vez lo vea la máquina y no él.
//
// Se revisan dos cosas: la columna `es` del diccionario y el texto a mano de
// cualquier archivo del frontend (lo que todavía no pasa por t()). Los
// comentarios no cuentan: no los ve nadie.
//
// La lista es de formas CONCRETAS y no una regla general ("termina en -á")
// porque la regla general se come el pasado neutro: "te escribí", "le pedí",
// "guardé" son correctos. Si aparece una forma nueva, se suma acá con su
// equivalente neutro en el mensaje de error.
const VOSEO = [
  "vos", "sos", "acá",
  "podés", "tenés", "querés", "sabés", "hacés", "ponés", "decís", "venís", "seguís",
  "usás", "necesitás", "mandás", "guardás", "llevás", "quedás", "pensás", "entrás",
  "creá", "usá", "probá", "volvé", "recargá", "registrá", "borrá", "arrastrá", "soltá",
  "vaciá", "elegí", "hacé", "poné", "tené", "mandá", "pegá", "agregá", "adjuntá",
  "guardá", "cambiá", "copiá", "confirmá", "revisá", "intentá", "reintentá", "esperá",
  "actualizá", "completá", "ingresá", "invitá", "tocá", "apretá", "abrí", "cerrá",
  "subí", "leé", "dejá", "buscá", "activá", "asigná", "reanudá", "verificá", "rechazá",
  "pedile", "pediles", "avisale", "decile", "ponele", "hacele", "entregale", "contale",
  "pedime", "pasame", "avisame", "decime", "mostrame", "contame", "escribime", "mandame",
  "fijate", "acordate", "asegurate", "ponelo", "hacelo", "dejalo", "borralo", "revocala",
  "eliminala", "subilos", "agregalo", "registralo",
];
const patron = new RegExp(`(?<![\\p{L}])(${VOSEO.join("|")})(?![\\p{L}])`, "giu");

const sinComentarios = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|\s)\/\/.*$/gm, " ");

const fuentes = (import.meta as unknown as {
  glob: (p: string, o: Record<string, unknown>) => Record<string, string>;
}).glob("/frontend/src/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true });

describe("español neutro (sin voseo)", () => {
  it("el diccionario no vosea", () => {
    const malas = Object.entries(translations)
      .filter(([, par]) => patron.test(par.es) && ((patron.lastIndex = 0), true))
      .map(([clave, par]) => `${clave} → «${par.es}»`);
    expect(malas, "Pasa estas claves a tú neutro (puedes, usa, aquí, pídele…):\n" + malas.join("\n")).toEqual([]);
  });

  it("ningún archivo del frontend vosea en su texto", () => {
    const malos: string[] = [];
    for (const [ruta, src] of Object.entries(fuentes)) {
      if (/\/test\/|\.test\.tsx?$/.test(ruta)) continue;
      const hallados = [...sinComentarios(src).matchAll(patron)].map((m) => m[1]);
      if (hallados.length) malos.push(`${ruta.replace("/frontend/src/", "")} → ${[...new Set(hallados)].join(", ")}`);
    }
    expect(malos, "Estos archivos tienen voseo en texto visible:\n" + malos.join("\n")).toEqual([]);
  });
});
