import { describe, it, expect } from "vitest";
import translations from "@/lib/i18n";

// ESPAÑOL NEUTRO, SIEMPRE.
//
// Jhon lo pidió varias veces y el voseo volvía igual: "Arrastrá archivos acá o
// usá «Nuevo»" llegó a producción en el Drive el 29/09/2026, cuando la regla ya
// existía. Este test es para que la próxima vez lo vea la máquina y no él.
//
// Se revisan cuatro cosas: la columna `es` del diccionario, el texto a mano de
// cualquier archivo del frontend (lo que todavía no pasa por t()), las edge
// functions y las migraciones nuevas (el 05/10 quedaban textos con voseo DENTRO
// de la base y en dos prompts de las edges: 20261005120000_sin_voseo_en_la_base).
// Los comentarios no cuentan: no los ve nadie.
//
// La lista es de formas CONCRETAS y no una regla general ("termina en -á")
// porque la regla general se come el pasado neutro: "te escribí", "le pedí",
// "guardé" son correctos. Si aparece una forma nueva, se suma aquí con su
// equivalente neutro en el mensaje de error.
const VOSEO = [
  "vos", "sos", "acá",
  "podés", "tenés", "querés", "sabés", "hacés", "ponés", "decís", "venís", "seguís",
  "usás", "necesitás", "mandás", "guardás", "llevás", "quedás", "pensás", "entrás",
  "creá", "usá", "probá", "volvé", "devolvé", "recargá", "registrá", "borrá", "arrastrá", "soltá",
  "vaciá", "elegí", "hacé", "poné", "tené", "mandá", "pegá", "agregá", "adjuntá",
  "guardá", "cambiá", "copiá", "confirmá", "revisá", "intentá", "reintentá", "esperá",
  "actualizá", "completá", "ingresá", "invitá", "tocá", "apretá", "abrí", "cerrá",
  "subí", "leé", "dejá", "buscá", "activá", "asigná", "reanudá", "verificá", "rechazá",
  // «compará en tiempo constante» vivió en la referencia de los webhooks hasta el 01/10.
  "compará", "generá", "revocá", "retirá",
  "pedile", "pediles", "avisale", "decile", "ponele", "hacele", "entregale", "contale",
  "pedime", "pasame", "avisame", "decime", "mostrame", "contame", "escribime", "mandame",
  "fijate", "acordate", "asegurate", "ponelo", "hacelo", "dejalo", "borralo", "revocala",
  "eliminala", "subilos", "agregalo", "registralo",
  // 05/10: en la base y en los prompts de las edges.
  "decilo", "tratalo",
];
const patron = new RegExp(`(?<![\\p{L}])(${VOSEO.join("|")})(?![\\p{L}])`, "giu");

// Un "\nDevolvé" escrito en el fuente es "n" + "Devolvé" para la regex: el
// escape se come el borde de la palabra. Así se escondió un prompt de
// scouter-generate-tasks hasta el 05/10.
const sinEscapes = (src: string) => src.replace(/\\[nrt]/g, "  ");

const sinComentarios = (src: string) =>
  sinEscapes(
    src
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|\s)\/\/.*$/gm, " "),
  );

// SQL: comentarios de línea («--») y de bloque. E'\n…' se escribe igual que en TS.
const sinComentariosSql = (src: string) => sinEscapes(src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--.*$/gm, " "));

const hallar = (texto: string) => [...new Set([...texto.matchAll(patron)].map((m) => m[1]))];

type Glob = { glob: (p: string, o: Record<string, unknown>) => Record<string, string> };
const fuentes = (import.meta as unknown as Glob).glob("/frontend/src/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true });
const edges = (import.meta as unknown as Glob).glob("/supabase/functions/**/*.ts", { query: "?raw", import: "default", eager: true });
const migraciones = (import.meta as unknown as Glob).glob("/supabase/migrations/*.sql", { query: "?raw", import: "default", eager: true });

// Lo que en las edges NOMBRA el voseo sin hablarle a nadie: el diccionario que lo
// corrige a la salida del bot, las regex que reconocen lo que la gente ESCRIBE y
// la regla del prompt que lo prohíbe con ejemplos. Se recorta desde «desde» hasta
// el primer «hasta» que le sigue (incluido). Si el «desde» ya no está, la
// excepción sobra y el test lo dice: así no se queda tapando otra cosa.
const EXCEPCIONES_EDGES = [
  { archivo: "_shared/whatsapp.ts", desde: "const VOSEO_A_NEUTRO", hasta: "\n];", por: "el diccionario voseo → tú del neutralizador" },
  { archivo: "_shared/whatsapp.ts", desde: "const presentate = [", hasta: "];", por: "reconoce lo que escribe la gente («¿quién sos?»)" },
  { archivo: "_shared/agent-output-guards.ts", desde: "const VOSEO_PITCH_RE", hasta: ";", por: "la regex que caza voseo en los pitches" },
  { archivo: "whatsapp-ingest/index.ts", desde: "const CORTO_SUSTANTIVO", hasta: ";", por: "respuestas cortas que escribe la gente («hacelo»)" },
  { archivo: "whatsapp-agent/index.ts", desde: "NUNCA voseo ni modismos rioplatenses", hasta: "\n", por: "la regla del prompt, con lo prohibido de ejemplo" },
  { archivo: "ai-orchestrator/index.ts", desde: "nunca vos", hasta: ")", por: "la regla del prompt" },
];

// Las migraciones viejas ya corrieron (y las que arreglaron voseo traen el texto
// viejo como literal de búsqueda). Se revisan las que van a prod desde aquí.
const MIGRACIONES_DESDE = "20261005120000";

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
      const hallados = hallar(sinComentarios(src));
      if (hallados.length) malos.push(`${ruta.replace("/frontend/src/", "")} → ${hallados.join(", ")}`);
    }
    expect(malos, "Estos archivos tienen voseo en texto visible:\n" + malos.join("\n")).toEqual([]);
  });

  it("ninguna edge function vosea en su texto (errores, avisos, correos, prompts)", () => {
    expect(Object.keys(edges).length, "el glob de las edges no trajo nada").toBeGreaterThan(50);
    const malos: string[] = [];
    for (const [ruta, src] of Object.entries(edges)) {
      if (/\.test\.ts$/.test(ruta)) continue;
      const corta = ruta.replace("/supabase/functions/", "");
      let texto = src;
      for (const e of EXCEPCIONES_EDGES.filter((x) => x.archivo === corta)) {
        const i = texto.indexOf(e.desde);
        const j = i < 0 ? -1 : texto.indexOf(e.hasta, i + e.desde.length);
        if (i < 0 || j < 0) {
          malos.push(`${corta}: la excepción «${e.desde}» (${e.por}) ya no está; sácala de EXCEPCIONES_EDGES`);
          continue;
        }
        texto = texto.slice(0, i) + " " + texto.slice(j + e.hasta.length);
      }
      const hallados = hallar(sinComentarios(texto));
      if (hallados.length) malos.push(`${corta} → ${hallados.join(", ")}`);
    }
    for (const e of EXCEPCIONES_EDGES) {
      if (!(`/supabase/functions/${e.archivo}` in edges)) malos.push(`${e.archivo}: ya no existe; sácalo de EXCEPCIONES_EDGES`);
    }
    expect(malos, "Pasa a tú neutro (prueba, devuelve, trátalo, aquí…):\n" + malos.join("\n")).toEqual([]);
  });

  it("ninguna migración nueva vosea fuera de los comentarios", () => {
    expect(Object.keys(migraciones).length, "el glob de las migraciones no trajo nada").toBeGreaterThan(100);
    const nuevas = Object.entries(migraciones).filter(([ruta]) => ruta.replace("/supabase/migrations/", "") >= MIGRACIONES_DESDE);
    expect(nuevas.length, "tendría que estar al menos 20261005120000_sin_voseo_en_la_base.sql").toBeGreaterThan(0);
    const malas = nuevas
      .map(([ruta, sql]) => [ruta.replace("/supabase/migrations/", ""), hallar(sinComentariosSql(sql))] as const)
      .filter(([, hallados]) => hallados.length)
      .map(([nombre, hallados]) => `${nombre} → ${hallados.join(", ")}`);
    expect(
      malas,
      "Texto con voseo en una migración (RAISE, avisos, notificaciones…). Pásalo a tú neutro; si es el texto viejo " +
        "que una migración corrige, búscalo por su md5 como 20261005120000_sin_voseo_en_la_base:\n" +
        malas.join("\n"),
    ).toEqual([]);
  });

  it("la guarda ve lo que tiene que ver (y no ve los comentarios)", () => {
    // Si una de estas falla, las de arriba dan verde sin mirar nada.
    expect(hallar(sinComentarios(`const p = '\\n\\nDevolvé SOLO el JSON';`))).toEqual(["Devolvé"]);
    expect(hallar(sinComentarios(`// Devolvé el JSON\nconst p = "Devuelve el JSON";`))).toEqual([]);
    expect(hallar(sinComentariosSql(`-- antes: Reintentá\nSELECT 'Reintenta el scan';`))).toEqual([]);
    expect(hallar(sinComentariosSql(`RAISE EXCEPTION E'\\nNo podés guardar';`))).toEqual(["podés"]);
    expect(hallar(sinComentariosSql(`SELECT 'Decilo tal cual' /* viejo */;`))).toEqual(["Decilo"]);
    expect(hallar("te escribí ayer · trátalo como pasado · Dilo tal cual")).toEqual([]);
  });
});
